import type { ShaderManifest } from '../../registry/manifest';
import type { ShaderRegistry } from '../../registry/ShaderRegistry';
import type {
  RenderingPort,
  RenderItem,
  RenderScene,
  RuntimeObserver,
  RuntimeStatus,
  TexSource,
} from '../renderingPort';
import { computeSurfaceSize, matchesSurfaceSize, type SurfaceSizeOptions } from '../surfaceSize';
import type { GlContext, GlTexture, GlVertexArray } from './glTypes';
import { ProgramCache } from './ProgramCache';
import { RESERVED_UNIFORMS } from './shaderAbi';
import { buildModelMatrix } from './transform';
import { bindParameters } from './uniformBinding';

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
  private readonly masks = new Map<string, MaskTexture>();
  private vao: GlVertexArray | null = null;

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

    this.programs = new ProgramCache(this.gl);
    this.vao = this.gl.createVertexArray();
  }

  get status(): RuntimeStatus {
    return this.currentStatus;
  }

  /** Whether any visible item uses a shader that animates over time. */
  get hasAnimatedContent(): boolean {
    return this.scene.items.some((item) => {
      const manifest = this.registry.get(item.shaderId);
      return manifest !== undefined && usesTime(manifest);
    });
  }

  setScene(scene: RenderScene): void {
    if (this.disposed) return;
    this.scene = scene;
    this.releaseUnusedResources();
  }

  resize(cssWidth: number, cssHeight: number): void {
    if (this.disposed) return;

    const size = computeSurfaceSize(cssWidth, cssHeight, this.readDevicePixelRatio(), this.sizing);
    if (matchesSurfaceSize(this.surface, size)) return;

    this.surface.width = size.pixelWidth;
    this.surface.height = size.pixelHeight;
  }

  renderFrame(elapsedSeconds: number): void {
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

    // Back to front: the scene arrives in stacking order.
    for (const item of this.scene.items) {
      this.drawItem(item, elapsedSeconds);
    }
  }

  private drawItem(item: RenderItem, elapsedSeconds: number): void {
    const { gl } = this;

    const manifest = this.registry.get(item.shaderId);
    if (!manifest) return;

    const acquired = this.programs.acquire(manifest);
    if (!acquired.ok) {
      // Report once per shader: a failing shader would otherwise raise the same
      // failure on every frame.
      if (!this.reportedFailures.has(item.shaderId)) {
        this.reportedFailures.add(item.shaderId);
        this.observer.onCompileFailure?.(acquired.failure);
      }
      return;
    }

    const { program, location } = acquired.compiled;
    gl.useProgram(program);

    gl.uniformMatrix3fv(
      location('uModel'),
      false,
      buildModelMatrix(item.transform, this.surface.width, this.surface.height),
    );
    gl.uniform2f(
      location(RESERVED_UNIFORMS.resolution),
      item.transform.width,
      item.transform.height,
    );
    gl.uniform1f(location(RESERVED_UNIFORMS.time), elapsedSeconds);
    gl.uniform1f(location(RESERVED_UNIFORMS.opacity), item.opacity);

    this.bindMask(item, location(RESERVED_UNIFORMS.hasMask), location(RESERVED_UNIFORMS.mask));

    bindParameters(gl, location, manifest.parameters, item.values);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

    const liveShaders = new Set(this.scene.items.map((item) => item.shaderId));
    for (const shaderId of [...this.reportedFailures]) {
      if (!liveShaders.has(shaderId)) this.reportedFailures.delete(shaderId);
    }
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

  dispose(): void {
    if (this.disposed) return;

    this.programs.releaseAll();
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
  return manifest.fragmentSource.includes(RESERVED_UNIFORMS.time);
}
