/**
 * The slice of WebGL2 the runtime actually uses.
 *
 * Declaring it explicitly lets the compiler, cache, and uniform binder be
 * exercised headlessly against a recording double — the parts most likely to
 * hold subtle bugs are then testable without a GPU.
 */
export interface GlShader {
  readonly __shader?: unique symbol;
}
export interface GlProgram {
  readonly __program?: unique symbol;
}
export interface GlUniformLocation {
  readonly __uniform?: unique symbol;
}
export interface GlTexture {
  readonly __texture?: unique symbol;
}
export interface GlVertexArray {
  readonly __vao?: unique symbol;
}
export interface GlFramebuffer {
  readonly __framebuffer?: unique symbol;
}

/** The WebGL2 constants and calls the runtime depends on. */
export interface GlContext {
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
  readonly COMPILE_STATUS: number;
  readonly LINK_STATUS: number;
  readonly TRIANGLE_STRIP: number;
  readonly COLOR_BUFFER_BIT: number;
  readonly BLEND: number;
  readonly SRC_ALPHA: number;
  readonly ONE_MINUS_SRC_ALPHA: number;
  readonly ONE: number;
  readonly TEXTURE_2D: number;
  readonly TEXTURE0: number;
  readonly RGBA: number;
  readonly UNSIGNED_BYTE: number;
  readonly LINEAR: number;
  readonly CLAMP_TO_EDGE: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  readonly TEXTURE_WRAP_S: number;
  readonly TEXTURE_WRAP_T: number;
  readonly UNPACK_FLIP_Y_WEBGL: number;
  readonly RGBA8: number;
  readonly FRAMEBUFFER: number;
  readonly COLOR_ATTACHMENT0: number;
  readonly FUNC_ADD: number;
  readonly MIN: number;
  readonly MAX: number;
  readonly DST_COLOR: number;
  readonly ONE_MINUS_DST_COLOR: number;

  createShader: (type: number) => GlShader | null;
  shaderSource: (shader: GlShader, source: string) => void;
  compileShader: (shader: GlShader) => void;
  getShaderParameter: (shader: GlShader, pname: number) => unknown;
  getShaderInfoLog: (shader: GlShader) => string | null;
  deleteShader: (shader: GlShader | null) => void;

  createProgram: () => GlProgram | null;
  attachShader: (program: GlProgram, shader: GlShader) => void;
  linkProgram: (program: GlProgram) => void;
  getProgramParameter: (program: GlProgram, pname: number) => unknown;
  getProgramInfoLog: (program: GlProgram) => string | null;
  deleteProgram: (program: GlProgram | null) => void;
  useProgram: (program: GlProgram | null) => void;

  getUniformLocation: (program: GlProgram, name: string) => GlUniformLocation | null;
  uniform1f: (location: GlUniformLocation | null, x: number) => void;
  uniform1i: (location: GlUniformLocation | null, x: number) => void;
  uniform2f: (location: GlUniformLocation | null, x: number, y: number) => void;
  uniform3f: (location: GlUniformLocation | null, x: number, y: number, z: number) => void;
  uniform1fv: (location: GlUniformLocation | null, value: Float32Array) => void;
  uniform2fv: (location: GlUniformLocation | null, value: Float32Array) => void;
  uniform3fv: (location: GlUniformLocation | null, value: Float32Array) => void;
  uniformMatrix3fv: (
    location: GlUniformLocation | null,
    transpose: boolean,
    value: Float32Array,
  ) => void;

  createVertexArray: () => GlVertexArray | null;
  bindVertexArray: (vao: GlVertexArray | null) => void;
  deleteVertexArray: (vao: GlVertexArray | null) => void;

  createTexture: () => GlTexture | null;
  bindTexture: (target: number, texture: GlTexture | null) => void;
  deleteTexture: (texture: GlTexture | null) => void;
  activeTexture: (unit: number) => void;
  texParameteri: (target: number, pname: number, param: number) => void;
  texImage2D: (
    target: number,
    level: number,
    internalFormat: number,
    format: number,
    type: number,
    source: TexImageSource,
  ) => void;
  pixelStorei: (pname: number, param: number | boolean) => void;
  /** Allocates a texture's storage without uploading anything, for a target. */
  texStorage2D: (
    target: number,
    levels: number,
    internalFormat: number,
    width: number,
    height: number,
  ) => void;

  createFramebuffer: () => GlFramebuffer | null;
  /** Passing `null` returns drawing to the canvas. */
  bindFramebuffer: (target: number, framebuffer: GlFramebuffer | null) => void;
  framebufferTexture2D: (
    target: number,
    attachment: number,
    textarget: number,
    texture: GlTexture | null,
    level: number,
  ) => void;
  deleteFramebuffer: (framebuffer: GlFramebuffer | null) => void;

  viewport: (x: number, y: number, width: number, height: number) => void;
  clearColor: (r: number, g: number, b: number, a: number) => void;
  clear: (mask: number) => void;
  enable: (cap: number) => void;
  disable: (cap: number) => void;
  blendFuncSeparate: (srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number) => void;
  blendEquation: (mode: number) => void;
  drawArrays: (mode: number, first: number, count: number) => void;

  isContextLost: () => boolean;
}
