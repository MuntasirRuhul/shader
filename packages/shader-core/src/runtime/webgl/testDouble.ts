import type {
  GlContext,
  GlFramebuffer,
  GlProgram,
  GlShader,
  GlTexture,
  GlUniformLocation,
  GlVertexArray,
} from './glTypes';

/**
 * A recording stand-in for WebGL2.
 *
 * The compiler, cache, and uniform binder hold the runtime's subtlest logic and
 * would otherwise only be exercisable on a GPU. This double records every call
 * so that behaviour — what got compiled, what got bound, what got deleted — can
 * be asserted exactly, headlessly.
 */

/** One draw, with the state that produced it. */
export interface DrawRecord {
  /** The framebuffer it landed in; `null` is the canvas. */
  readonly target: GlFramebuffer | null;
  readonly viewport: { readonly width: number; readonly height: number };
  /** What was bound to each texture unit at the time. */
  readonly textures: ReadonlyMap<number, GlTexture | null>;
}

export interface UniformWrite {
  readonly name: string;
  readonly value: number | readonly number[];
}

export interface FakeGlOptions {
  /** Shader sources matching this fail to compile, as a broken shader would. */
  readonly failCompileMatching?: RegExp;
  /** When true, linking fails. */
  readonly failLink?: boolean;
  readonly compileDiagnostic?: string;
  readonly linkDiagnostic?: string;
}

export class FakeGl implements GlContext {
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly TRIANGLE_STRIP = 5;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly BLEND = 0x0be2;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly ONE = 1;
  readonly TEXTURE_2D = 0x0de1;
  readonly TEXTURE0 = 0x84c0;
  readonly RGBA = 0x1908;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly LINEAR = 0x2601;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly UNPACK_FLIP_Y_WEBGL = 0x9240;
  readonly RGBA8 = 0x8058;
  readonly FRAMEBUFFER = 0x8d40;
  readonly COLOR_ATTACHMENT0 = 0x8ce0;
  readonly FUNC_ADD = 0x8006;
  readonly MIN = 0x8007;
  readonly MAX = 0x8008;
  readonly DST_COLOR = 0x0306;
  readonly ONE_MINUS_DST_COLOR = 0x0307;

  /** Every source passed to a shader stage, in order. */
  readonly compiledSources: string[] = [];
  readonly uniformWrites: UniformWrite[] = [];
  readonly drawCalls: { first: number; count: number }[] = [];
  /**
   * Every draw with the state that made it: where it landed, at what size, and
   * what it sampled. A multi-pass shader is only observable through these.
   */
  readonly draws: DrawRecord[] = [];
  readonly deletedFramebuffers: GlFramebuffer[] = [];
  /** Storage allocations, in order, so target sizing can be asserted. */
  readonly allocations: { texture: GlTexture; width: number; height: number }[] = [];
  /** Framebuffers cleared, in order. */
  readonly clears: (GlFramebuffer | null)[] = [];
  readonly deletedPrograms: GlProgram[] = [];
  readonly deletedTextures: GlTexture[] = [];
  readonly deletedShaders: GlShader[] = [];
  readonly deletedVertexArrays: GlVertexArray[] = [];

  liveShaders = 0;
  livePrograms = 0;
  liveTextures = 0;
  liveVertexArrays = 0;
  liveFramebuffers = 0;
  contextLost = false;

  /** The framebuffer currently bound; `null` means the canvas. */
  private boundFramebuffer: GlFramebuffer | null = null;
  /** The texture bound to each unit, so a draw records what it sampled. */
  private readonly boundTextures = new Map<number, GlTexture | null>();
  private activeUnit = 0;
  private readonly textureByFramebuffer = new Map<GlFramebuffer, GlTexture | null>();

  private readonly sourceByShader = new Map<GlShader, string>();
  private readonly locationsByName = new Map<string, GlUniformLocation>();
  private readonly nameByLocation = new Map<GlUniformLocation, string>();

  constructor(private readonly options: FakeGlOptions = {}) {}

  /** The uniform writes for one name, most recent last. */
  writesTo(name: string): UniformWrite[] {
    return this.uniformWrites.filter((write) => write.name === name);
  }

  lastWriteTo(name: string): UniformWrite | undefined {
    return this.writesTo(name).at(-1);
  }

  reset(): void {
    this.uniformWrites.length = 0;
    this.drawCalls.length = 0;
    this.draws.length = 0;
    this.clears.length = 0;
    this.allocations.length = 0;
  }

  /** The colour texture attached to a framebuffer, for asserting a pass read. */
  textureOf(framebuffer: GlFramebuffer): GlTexture | null {
    return this.textureByFramebuffer.get(framebuffer) ?? null;
  }

  createShader(): GlShader | null {
    this.liveShaders += 1;
    return {};
  }

  shaderSource(shader: GlShader, source: string): void {
    this.sourceByShader.set(shader, source);
    this.compiledSources.push(source);
  }

  compileShader(): void {}

  getShaderParameter(shader: GlShader): unknown {
    const source = this.sourceByShader.get(shader) ?? '';
    return !this.options.failCompileMatching?.test(source);
  }

  getShaderInfoLog(): string | null {
    return (
      this.options.compileDiagnostic ?? "ERROR: 0:12: 'undefinedThing' : undeclared identifier"
    );
  }

  deleteShader(shader: GlShader | null): void {
    if (!shader) return;
    this.deletedShaders.push(shader);
    this.liveShaders -= 1;
  }

  createProgram(): GlProgram | null {
    this.livePrograms += 1;
    return {};
  }

  attachShader(): void {}
  linkProgram(): void {}

  getProgramParameter(): unknown {
    return this.options.failLink !== true;
  }

  getProgramInfoLog(): string | null {
    return this.options.linkDiagnostic ?? 'ERROR: linking failed: varying vUv not written';
  }

  deleteProgram(program: GlProgram | null): void {
    if (!program) return;
    this.deletedPrograms.push(program);
    this.livePrograms -= 1;
  }

  useProgram(): void {}

  getUniformLocation(_program: GlProgram, name: string): GlUniformLocation | null {
    let location = this.locationsByName.get(name);
    if (!location) {
      location = {};
      this.locationsByName.set(name, location);
      this.nameByLocation.set(location, name);
    }
    return location;
  }

  private record(location: GlUniformLocation | null, value: number | readonly number[]): void {
    if (!location) return;
    const name = this.nameByLocation.get(location);
    if (name === undefined) return;
    this.uniformWrites.push({ name, value });
  }

  uniform1f(location: GlUniformLocation | null, x: number): void {
    this.record(location, x);
  }
  uniform1i(location: GlUniformLocation | null, x: number): void {
    this.record(location, x);
  }
  uniform2f(location: GlUniformLocation | null, x: number, y: number): void {
    this.record(location, [x, y]);
  }
  uniform3f(location: GlUniformLocation | null, x: number, y: number, z: number): void {
    this.record(location, [x, y, z]);
  }
  uniform1fv(location: GlUniformLocation | null, value: Float32Array): void {
    this.record(location, [...value]);
  }
  uniform2fv(location: GlUniformLocation | null, value: Float32Array): void {
    this.record(location, [...value]);
  }
  uniform3fv(location: GlUniformLocation | null, value: Float32Array): void {
    this.record(location, [...value]);
  }
  uniformMatrix3fv(
    location: GlUniformLocation | null,
    _transpose: boolean,
    value: Float32Array,
  ): void {
    this.record(location, [...value]);
  }

  createVertexArray(): GlVertexArray | null {
    this.liveVertexArrays += 1;
    return {};
  }
  bindVertexArray(): void {}
  deleteVertexArray(vao: GlVertexArray | null): void {
    if (!vao) return;
    this.deletedVertexArrays.push(vao);
    this.liveVertexArrays -= 1;
  }

  createTexture(): GlTexture | null {
    this.liveTextures += 1;
    return {};
  }
  bindTexture(_target: number, texture: GlTexture | null): void {
    this.boundTextures.set(this.activeUnit, texture);
  }
  deleteTexture(texture: GlTexture | null): void {
    if (!texture) return;
    this.deletedTextures.push(texture);
    this.liveTextures -= 1;
  }
  activeTexture(unit: number): void {
    this.activeUnit = unit - this.TEXTURE0;
  }
  texParameteri(): void {}
  texImage2D(): void {}
  pixelStorei(): void {}

  texStorage2D(
    _target: number,
    _levels: number,
    _internalFormat: number,
    width: number,
    height: number,
  ): void {
    const texture = this.boundTextures.get(this.activeUnit) ?? null;
    if (texture) this.allocations.push({ texture, width, height });
  }

  createFramebuffer(): GlFramebuffer | null {
    this.liveFramebuffers += 1;
    return {};
  }

  bindFramebuffer(_target: number, framebuffer: GlFramebuffer | null): void {
    this.boundFramebuffer = framebuffer;
  }

  framebufferTexture2D(
    _target: number,
    _attachment: number,
    _textarget: number,
    texture: GlTexture | null,
    _level: number,
  ): void {
    if (this.boundFramebuffer) this.textureByFramebuffer.set(this.boundFramebuffer, texture);
  }

  deleteFramebuffer(framebuffer: GlFramebuffer | null): void {
    if (!framebuffer) return;
    this.deletedFramebuffers.push(framebuffer);
    this.textureByFramebuffer.delete(framebuffer);
    this.liveFramebuffers -= 1;
  }

  private currentViewport = { width: 0, height: 0 };

  viewport(_x: number, _y: number, width: number, height: number): void {
    this.currentViewport = { width, height };
  }
  clearColor(): void {}
  clear(): void {
    this.clears.push(this.boundFramebuffer);
  }
  enable(): void {}
  disable(): void {}
  /**
   * How the hardware is currently set to combine with the backdrop. Held as
   * state rather than as a log of calls, so the order they arrive in is the
   * implementation's business rather than the test's.
   */
  blendState: { func: number[]; equation: number } = { func: [], equation: 0x8006 };

  blendFuncSeparate(...factors: number[]): void {
    this.blendState = { ...this.blendState, func: factors };
  }
  blendEquation(mode: number): void {
    this.blendState = { ...this.blendState, equation: mode };
  }

  drawArrays(_mode: number, first: number, count: number): void {
    this.drawCalls.push({ first, count });
    this.draws.push({
      target: this.boundFramebuffer,
      viewport: { ...this.currentViewport },
      textures: new Map(this.boundTextures),
    });
  }

  isContextLost(): boolean {
    return this.contextLost;
  }
}
