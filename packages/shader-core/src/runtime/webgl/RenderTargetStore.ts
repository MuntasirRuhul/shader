import type { PassPrecision } from '../../registry/manifest';
import type { GlContext, GlFramebuffer, GlTexture } from './glTypes';

/** A texture a pass draws into, with the framebuffer that points at it. */
export interface RenderTarget {
  readonly texture: GlTexture;
  readonly framebuffer: GlFramebuffer;
}

interface TargetEntry {
  /** One buffer, or two when a pass reads what it wrote last frame. */
  readonly buffers: RenderTarget[];
  width: number;
  height: number;
  /** What the storage holds, so a pass that changes its mind is reallocated. */
  precision: PassPrecision;
  /** Which buffer the current frame writes into. Only moves when doubled. */
  writeIndex: number;
}

/**
 * Holds the intermediate targets a multi-pass shader draws through.
 *
 * Targets belong to an object rather than to a shader: two objects using one
 * multi-pass shader are two independent renderings, and sharing a target would
 * make each frame's second object overwrite the first's intermediate results.
 *
 * A pass that reads what it wrote on the previous frame gets two buffers, and
 * the store flips between them — which is why such a shader never sees two
 * buffers, only "what I wrote last time". Both are cleared when allocated, so
 * the first frame reads black rather than whatever the driver left in memory.
 */
export class RenderTargetStore {
  private readonly entries = new Map<string, TargetEntry>();
  /**
   * Whether the driver will draw into a float target.
   *
   * Sampling one is core to WebGL2; rendering into one is an extension, and a
   * driver without it must still draw something. Such a pass falls back to
   * eight bits, which is wrong for a field but is a shader that looks poor
   * rather than a canvas that is blank.
   */
  private readonly floatTargets: boolean;

  constructor(private readonly gl: GlContext) {
    this.floatTargets = gl.getExtension('EXT_color_buffer_float') !== null;
  }

  /** Whether float targets are actually available, for a caller that reports it. */
  get supportsFloat(): boolean {
    return this.floatTargets;
  }

  /** How many targets are held. Lets tests prove allocation and release. */
  get size(): number {
    return this.entries.size;
  }

  /** The pixel size a target currently holds, for asserting it follows the object. */
  sizeOf(key: string): { width: number; height: number } | undefined {
    const entry = this.entries.get(key);
    return entry ? { width: entry.width, height: entry.height } : undefined;
  }

  /**
   * The target this frame's pass writes into, allocating it on first use and
   * resizing it when the object has changed size.
   *
   * Returns `null` only when the driver refuses to create the objects, in
   * which case the caller draws to the canvas instead of to nothing.
   */
  beginWrite(
    key: string,
    width: number,
    height: number,
    doubleBuffered: boolean,
    precision: PassPrecision = 'byte',
  ): RenderTarget | null {
    const pixelWidth = Math.max(1, Math.round(width));
    const pixelHeight = Math.max(1, Math.round(height));
    const wanted = doubleBuffered ? 2 : 1;

    let entry = this.entries.get(key);

    if (
      entry &&
      (entry.buffers.length !== wanted ||
        entry.width !== pixelWidth ||
        entry.height !== pixelHeight ||
        entry.precision !== precision)
    ) {
      // What a pass reads has to stay aligned with what is drawn, so a resized
      // object gets new storage rather than a stretched read.
      this.destroy(entry);
      entry = undefined;
      this.entries.delete(key);
    }

    if (!entry) {
      const buffers: RenderTarget[] = [];
      for (let index = 0; index < wanted; index += 1) {
        const target = this.create(pixelWidth, pixelHeight, precision);
        if (!target) {
          for (const created of buffers) this.release(created);
          return null;
        }
        buffers.push(target);
      }
      entry = { buffers, width: pixelWidth, height: pixelHeight, precision, writeIndex: 0 };
      this.entries.set(key, entry);
    } else if (doubleBuffered) {
      // Flip before writing, so the buffer not being written holds the frame
      // before this one.
      entry.writeIndex = (entry.writeIndex + 1) % entry.buffers.length;
    }

    return entry.buffers[entry.writeIndex] ?? null;
  }

  /** What a pass produced this frame, for a later pass reading it. */
  currentTextureOf(key: string): GlTexture | null {
    const entry = this.entries.get(key);
    return entry?.buffers[entry.writeIndex]?.texture ?? null;
  }

  /**
   * What a pass produced on the previous frame. For a single-buffered target
   * this is the same texture, which only arises when a pass reads an earlier
   * pass's previous frame rather than its own.
   */
  previousTextureOf(key: string): GlTexture | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const index = (entry.writeIndex + entry.buffers.length - 1) % entry.buffers.length;
    return entry.buffers[index]?.texture ?? null;
  }

  /** Releases every target whose key is not in the given set. */
  retainOnly(liveKeys: ReadonlySet<string>): void {
    for (const [key, entry] of this.entries) {
      if (liveKeys.has(key)) continue;
      this.destroy(entry);
      this.entries.delete(key);
    }
  }

  releaseAll(): void {
    for (const entry of this.entries.values()) this.destroy(entry);
    this.entries.clear();
  }

  /**
   * Forgets every target without deleting it, for use after the context is
   * lost — the driver has already discarded them, so deleting them is invalid.
   */
  forgetAll(): void {
    this.entries.clear();
  }

  private create(width: number, height: number, precision: PassPrecision): RenderTarget | null {
    const { gl } = this;

    const texture = gl.createTexture();
    if (!texture) return null;

    const float = precision === 'float' && this.floatTargets;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, float ? gl.RGBA16F : gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Allocating left this texture bound to unit 0, where a shader's samplers
    // point until something binds them elsewhere. Drawing into a texture that
    // a sampler could read is a feedback loop, and the driver drops the draw.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // A shader reading this before anything has written it must see a defined
    // value, not whatever the driver happened to leave here.
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, framebuffer };
  }

  private destroy(entry: TargetEntry): void {
    for (const target of entry.buffers) this.release(target);
  }

  private release(target: RenderTarget): void {
    this.gl.deleteFramebuffer(target.framebuffer);
    this.gl.deleteTexture(target.texture);
  }
}
