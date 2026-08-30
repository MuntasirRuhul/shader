import type { ShaderManifest, ShaderPass } from '../../registry/manifest';
import type { ShaderRegistry } from '../../registry/ShaderRegistry';
import { POINTER_ABSENT } from '../../registry/simulation';
import type {
  RenderingPort,
  RenderItem,
  RenderScene,
  RuntimeObserver,
  RuntimeStatus,
  TexSource,
} from '../renderingPort';
import { SimulationStore } from '../SimulationStore';
import { computeSurfaceSize, matchesSurfaceSize, type SurfaceSizeOptions } from '../surfaceSize';
import type { GlContext, GlTexture, GlVertexArray } from './glTypes';
import { ProgramCache, type CompiledProgram, type CompileResult } from './ProgramCache';
import { RenderTargetStore } from './RenderTargetStore';
import { FULL_TARGET_MATRIX, PRESENT_SOURCE_UNIFORM, RESERVED_UNIFORMS } from './shaderAbi';
import { buildModelMatrix } from './transform';
import { bindParameters } from './uniformBinding';

/** The first texture unit a pass may read through; unit 0 is the mask's. */
const FIRST_PASS_UNIT = 1;

/** How a shader's targets are keyed: they belong to an object, not a shader. */
function targetKey(objectId: string, passName: string): string {
  return `${objectId}::${passName}`;
}

/**
 * Which of a shader's passes need a target of their own, and which need two.
 *
 * Every pass but the last has to draw somewhere, and the last needs a target
 * only when something reads it — which, since a pass cannot read a later one
 * from this frame, means it reads its own previous frame.
 */
function planTargets(passes: readonly ShaderPass[]): {
  needsTarget: (pass: ShaderPass, index: number) => boolean;
  doubled: ReadonlySet<string>;
} {
  const read = new Set<string>();
  const doubled = new Set<string>();

  for (const pass of passes) {
    for (const input of pass.reads ?? []) {
      read.add(input.pass);
      if (input.previousFrame === true) doubled.add(input.pass);
    }
  }

  return {
    needsTarget: (pass, index) => index < passes.length - 1 || read.has(pass.name),
    doubled,
  };
}

export interface RendererSurface {
  width: number;
  height: number;
}

export interface WebGlRendererOptions {
  readonly gl: GlContext;
  readonly surface: RendererSurface;
  readonly registry: Pick<ShaderRegistry, 'get'>;
  readonly observer?: RuntimeObserver;
  readonly devicePixelRatio?: () => number;
  readonly sizing?: SurfaceSizeOptions;
}

interface MaskTexture {
  readonly texture: GlTexture;
  revision: number;
}

/**
 * Draws a scene of shader-filled objects.
 *
 * Owns exactly three kinds of graphics resource — programs, mask textures, and
 * one vertex array — and is responsible for releasing all of them. Resource
 * ownership is deliberately concentrated here so that leaks have one place to
 * be found.
 */
export class WebGlRenderer implements RenderingPort {
  private readonly gl: GlContext;
  private readonly surface: RendererSurface;
  private readonly registry: Pick<ShaderRegistry, 'get'>;
  private readonly observer: RuntimeObserver;
  private readonly readDevicePixelRatio: () => number;
  private readonly sizing: SurfaceSizeOptions;

  private programs: ProgramCache;
  private targets: RenderTargetStore;
  private readonly masks = new Map<string, MaskTexture>();
  private vao: GlVertexArray | null = null;

  /**
   * The surface's CSS size, which is what object coordinates are expressed in.
   * The drawing buffer is larger on a high-density display, so mapping objects
   * through the buffer size would draw everything at 1/ratio scale.
   */
  private cssWidth: number;
  private cssHeight: number;

  private readonly simulations: SimulationStore;

  private scene: RenderScene = { items: [] };
  private currentStatus: RuntimeStatus = { kind: 'ready' };
  private disposed = false;

  /** Shader ids already reported as failing, so the failure is announced once. */
  private readonly reportedFailures = new Set<string>();

  constructor(options: WebGlRendererOptions) {
    this.gl = options.gl;
    this.surface = options.surface;
    this.registry = options.registry;
    this.observer = options.observer ?? {};
    this.readDevicePixelRatio = options.devicePixelRatio ?? (() => 1);
    this.sizing = options.sizing ?? {};

    this.cssWidth = options.surface.width;
    this.cssHeight = options.surface.height;

    this.simulations = new SimulationStore({
      onAdvanceFailure: (failure) => options.observer?.onAdvanceFailure?.(failure),
    });
    this.programs = new ProgramCache(this.gl);
    this.targets = new RenderTargetStore(this.gl);
    this.vao = this.gl.createVertexArray();
  }

  get status(): RuntimeStatus {
    return this.currentStatus;
  }

  /** Whether any visible item uses a shader that animates over time. */
  get hasAnimatedContent(): boolean {
    // A shader owning state moves whether or not its program reads the clock:
    // the metaball's motion is entirely in its advance, and suspending it
    // would leave a simulation frozen on its first frame.
    return (
      this.hasSimulation ||
      this.scene.items.some((item) => {
        const manifest = this.registry.get(item.shaderId);
        return manifest !== undefined && usesTime(manifest);
      })
    );
  }

  setScene(scene: RenderScene): void {
    if (this.disposed) return;
    this.scene = scene;
    this.releaseUnusedResources();
  }

  resize(cssWidth: number, cssHeight: number): void {
    if (this.disposed) return;

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

    const size = computeSurfaceSize(cssWidth, cssHeight, this.readDevicePixelRatio(), this.sizing);
    if (matchesSurfaceSize(this.surface, size)) return;

    this.surface.width = size.pixelWidth;
    this.surface.height = size.pixelHeight;
  }

  /**
   * Advances every object's simulation, then draws.
   *
   * Advancing first means a frame shows the state it just computed. Drawing
   * first would show the initial state for one frame and lag by one forever
   * after. `dt` is rendering time, so a suspension contributes nothing.
   */
  renderFrame(elapsedSeconds: number, dt = 0): void {
    if (this.disposed) return;

    const { gl } = this;

    // A lost context accepts calls but does nothing useful; issuing draws
    // against it produces a stream of errors rather than pixels.
    if (gl.isContextLost()) {
      this.setStatus({ kind: 'context-lost' });
      return;
    }

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.surface.width, this.surface.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.advanceSimulations(dt);

    // Back to front: the scene arrives in stacking order.
    for (const item of this.scene.items) {
      this.drawItem(item, elapsedSeconds);
    }
  }

  /** Runs every object's advance once, before anything is drawn. */
  private advanceSimulations(dt: number): void {
    for (const item of this.scene.items) {
      const manifest = this.registry.get(item.shaderId);
      // A shader without a simulation costs a lookup and nothing more.
      if (!manifest?.simulation) continue;

      this.simulations.advance(
        {
          objectId: item.objectId,
          manifest,
          parameters: item.values,
          pointer: item.pointer ?? POINTER_ABSENT,
          width: item.transform.width,
          height: item.transform.height,
        },
        dt,
      );
    }

    // Objects that have left the scene keep no state.
    this.simulations.retainOnly(this.scene.items.map((item) => item.objectId));
  }

  /** Whether anything on the canvas owns state, and so must keep animating. */
  get hasSimulation(): boolean {
    return this.scene.items.some((item) => this.registry.get(item.shaderId)?.simulation);
  }

  private drawItem(item: RenderItem, elapsedSeconds: number): void {
    const manifest = this.registry.get(item.shaderId);
    if (!manifest) return;

    const passes = manifest.passes;
    if (passes === undefined || passes.length === 0) {
      // A shader declaring no passes takes exactly the path it took before
      // passes existed: one program, drawn straight to the canvas.
      const acquired = this.programs.acquire(manifest);
      if (!this.usable(item.shaderId, acquired)) return;

      this.drawThrough(acquired.compiled, manifest, item, elapsedSeconds, { final: true });
      return;
    }

    this.drawPasses(item, manifest, passes, elapsedSeconds);
  }

  /**
   * Draws a multi-pass shader: every pass in order through its own target, and
   * only the last onto the canvas.
   */
  private drawPasses(
    item: RenderItem,
    manifest: ShaderManifest,
    passes: readonly ShaderPass[],
    elapsedSeconds: number,
  ): void {
    const { gl } = this;
    const { needsTarget, doubled } = planTargets(passes);

    // Targets are sized in drawing-buffer pixels, so an intermediate result is
    // no coarser than what is finally drawn.
    const scale = this.cssWidth === 0 ? 1 : this.surface.width / this.cssWidth;
    const targetWidth = item.transform.width * scale;
    const targetHeight = item.transform.height * scale;

    for (const [index, pass] of passes.entries()) {
      const acquired = this.programs.acquirePass(manifest, pass);
      if (!this.usable(item.shaderId, acquired)) {
        // A shader whose pass will not compile draws nothing, and must not
        // leave the next object drawing into its target.
        this.bindCanvas();
        return;
      }

      const key = targetKey(item.objectId, pass.name);
      const target = needsTarget(pass, index)
        ? this.targets.beginWrite(key, targetWidth, targetHeight, doubled.has(pass.name))
        : null;

      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(
          0,
          0,
          Math.max(1, Math.round(targetWidth)),
          Math.max(1, Math.round(targetHeight)),
        );
        // A pass covers its target, and blending it with the frame before
        // would leave a simulation reading its own smeared history.
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        this.bindCanvas();
      }

      this.drawThrough(acquired.compiled, manifest, item, elapsedSeconds, {
        final: target === null,
        reads: pass,
        objectId: item.objectId,
      });
    }

    // The last pass wrote to a target only because something reads it next
    // frame, so its result still has to reach the object.
    const last = passes[passes.length - 1];
    if (last && needsTarget(last, passes.length - 1)) {
      this.present(item, targetKey(item.objectId, last.name), elapsedSeconds);
    }
  }

  /** Draws the finished output of the last pass onto the object. */
  private present(item: RenderItem, key: string, elapsedSeconds: number): void {
    const { gl } = this;

    const acquired = this.programs.acquirePresent();
    if (!this.usable(item.shaderId, acquired)) return;

    const { program, location } = acquired.compiled;
    this.bindCanvas();
    gl.useProgram(program);

    gl.uniformMatrix3fv(
      location('uModel'),
      false,
      buildModelMatrix(item.transform, this.cssWidth, this.cssHeight),
    );
    gl.uniform2f(
      location(RESERVED_UNIFORMS.resolution),
      item.transform.width,
      item.transform.height,
    );
    gl.uniform1f(location(RESERVED_UNIFORMS.time), elapsedSeconds);
    gl.uniform1f(location(RESERVED_UNIFORMS.opacity), item.opacity);
    this.bindMask(item, location(RESERVED_UNIFORMS.hasMask), location(RESERVED_UNIFORMS.mask));

    gl.activeTexture(gl.TEXTURE0 + FIRST_PASS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.targets.currentTextureOf(key));
    gl.uniform1i(location(PRESENT_SOURCE_UNIFORM), FIRST_PASS_UNIT);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Binds everything a program needs and draws the quad. Shared by the
   * single-program path, every pass, and the compositing step, so a shader
   * sees the same uniforms whichever of them is drawing it.
   */
  private drawThrough(
    compiled: CompiledProgram,
    manifest: ShaderManifest,
    item: RenderItem,
    elapsedSeconds: number,
    options: { final: boolean; reads?: ShaderPass; objectId?: string },
  ): void {
    const { gl } = this;
    const { program, location } = compiled;
    gl.useProgram(program);

    gl.uniformMatrix3fv(
      location('uModel'),
      false,
      // An intermediate pass fills its target rather than landing on the
      // canvas, so it is not placed by the object's transform.
      options.final
        ? buildModelMatrix(item.transform, this.cssWidth, this.cssHeight)
        : FULL_TARGET_MATRIX,
    );
    gl.uniform2f(
      location(RESERVED_UNIFORMS.resolution),
      item.transform.width,
      item.transform.height,
    );
    gl.uniform1f(location(RESERVED_UNIFORMS.time), elapsedSeconds);

    if (options.final) {
      gl.uniform1f(location(RESERVED_UNIFORMS.opacity), item.opacity);
      this.bindMask(item, location(RESERVED_UNIFORMS.hasMask), location(RESERVED_UNIFORMS.mask));
    } else {
      // Opacity and masking belong to the object, and are applied once, when
      // its final output reaches the canvas.
      gl.uniform1f(location(RESERVED_UNIFORMS.opacity), 1);
      gl.uniform1i(location(RESERVED_UNIFORMS.hasMask), 0);
    }

    bindParameters(gl, location, manifest.parameters, item.values);

    const state = this.simulations.valuesFor(item.objectId);
    if (state) {
      bindParameters(gl, location, manifest.simulation?.schema ?? [], state);
    }

    if (options.reads && options.objectId !== undefined) {
      this.bindPassReads(compiled, options.reads, options.objectId);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Binds the textures a pass samples: earlier passes, or its own last frame. */
  private bindPassReads(compiled: CompiledProgram, pass: ShaderPass, objectId: string): void {
    const { gl } = this;

    (pass.reads ?? []).forEach((input, index) => {
      const unit = FIRST_PASS_UNIT + index;
      const key = targetKey(objectId, input.pass);
      const texture =
        input.previousFrame === true
          ? this.targets.previousTextureOf(key)
          : this.targets.currentTextureOf(key);

      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(compiled.location(input.uniform), unit);
    });
  }

  /** Returns drawing to the canvas, with the blending the scene composites by. */
  private bindCanvas(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.surface.width, this.surface.height);
    gl.enable(gl.BLEND);
  }

  /**
   * Whether a program compiled, reporting the failure once per shader — a
   * failing shader would otherwise raise the same failure on every frame.
   */
  private usable(
    shaderId: string,
    result: CompileResult,
  ): result is Extract<CompileResult, { ok: true }> {
    if (result.ok) return true;

    if (!this.reportedFailures.has(shaderId)) {
      this.reportedFailures.add(shaderId);
      this.observer.onCompileFailure?.(result.failure);
    }
    return false;
  }

  private bindMask(
    item: RenderItem,
    hasMaskLocation: ReturnType<GlContext['getUniformLocation']>,
    maskLocation: ReturnType<GlContext['getUniformLocation']>,
  ): void {
    const { gl } = this;

    if (!item.mask) {
      gl.uniform1i(hasMaskLocation, 0);
      return;
    }

    const texture = this.maskTextureFor(item.objectId, item.mask);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(maskLocation, 0);
    gl.uniform1i(hasMaskLocation, 1);
  }

  /** Uploads a mask only when its contents have actually changed. */
  private maskTextureFor(objectId: string, mask: TexSource): GlTexture | null {
    const { gl } = this;
    let entry = this.masks.get(objectId);

    if (!entry) {
      const texture = gl.createTexture();
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      entry = { texture, revision: -1 };
      this.masks.set(objectId, entry);
    }

    if (entry.revision !== mask.revision) {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask.source);
      entry.revision = mask.revision;
    }

    return entry.texture;
  }

  /** Releases resources for objects and shaders the scene no longer contains. */
  private releaseUnusedResources(): void {
    const liveObjects = new Set(this.scene.items.map((item) => item.objectId));
    for (const [objectId, entry] of this.masks) {
      if (!liveObjects.has(objectId)) {
        this.gl.deleteTexture(entry.texture);
        this.masks.delete(objectId);
      }
    }

    // Keyed by object and pass, so an object that is gone, and an object whose
    // fill now needs fewer passes, both drop the targets they no longer use.
    this.targets.retainOnly(this.liveTargetKeys());

    const liveShaders = new Set(this.scene.items.map((item) => item.shaderId));
    for (const shaderId of [...this.reportedFailures]) {
      if (!liveShaders.has(shaderId)) this.reportedFailures.delete(shaderId);
    }
  }

  /** Every target key the current scene still needs. */
  private liveTargetKeys(): ReadonlySet<string> {
    const keys = new Set<string>();

    for (const item of this.scene.items) {
      const passes = this.registry.get(item.shaderId)?.passes;
      if (!passes || passes.length === 0) continue;

      const { needsTarget } = planTargets(passes);
      passes.forEach((pass, index) => {
        if (needsTarget(pass, index)) keys.add(targetKey(item.objectId, pass.name));
      });
    }

    return keys;
  }

  /** Releases the program held for a shader no object uses any more. */
  releaseShader(shaderId: string): void {
    this.programs.release(shaderId);
    this.reportedFailures.delete(shaderId);
  }

  /**
   * Handles the context being lost. The driver has already discarded every
   * object, so they are forgotten rather than deleted.
   */
  handleContextLost(): void {
    this.programs.forgetAll();
    this.targets.forgetAll();
    this.masks.clear();
    this.vao = null;
    this.reportedFailures.clear();
    this.setStatus({ kind: 'context-lost' });
  }

  /**
   * Rebuilds after the context is restored. The scene and its parameter values
   * are untouched throughout: they live in the document, not in graphics
   * memory, so nothing about what the user built is lost.
   */
  handleContextRestored(): void {
    if (this.disposed) return;
    this.programs = new ProgramCache(this.gl);
    this.targets = new RenderTargetStore(this.gl);
    this.vao = this.gl.createVertexArray();
    this.setStatus({ kind: 'ready' });
  }

  private setStatus(status: RuntimeStatus): void {
    if (this.currentStatus.kind === status.kind) return;
    this.currentStatus = status;
    this.observer.onStatusChange?.(status);
  }

  /** How many programs are currently held. Lets tests prove release. */
  get programCount(): number {
    return this.programs.size;
  }

  /** How many mask textures are currently held. */
  get maskCount(): number {
    return this.masks.size;
  }

  /** How many intermediate pass targets are currently held. */
  get targetCount(): number {
    return this.targets.size;
  }

  /** The pixel size of one object's pass target, so tests can prove it follows. */
  targetSize(objectId: string, passName: string): { width: number; height: number } | undefined {
    return this.targets.sizeOf(targetKey(objectId, passName));
  }

  dispose(): void {
    if (this.disposed) return;

    this.programs.releaseAll();
    this.targets.releaseAll();
    for (const entry of this.masks.values()) {
      this.gl.deleteTexture(entry.texture);
    }
    this.masks.clear();

    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    this.scene = { items: [] };
    this.disposed = true;
  }
}

/** Whether a shader reads the time uniform, and so needs continuous frames. */
function usesTime(manifest: ShaderManifest): boolean {
  const sources = [
    manifest.fragmentSource,
    ...(manifest.passes ?? []).map((p) => p.fragmentSource),
  ];
  return sources.some((source) => source.includes(RESERVED_UNIFORMS.time));
}
