import type { ParameterValues } from '../registry/parameterSchema';
import type { PointerInput } from '../registry/simulation';
import type { AdvanceFailure } from './SimulationStore';

/**
 * What the canvas depends on to draw. Nothing here mentions WebGL: the canvas
 * and the document talk to this port, and the WebGL2 implementation sits behind
 * it. That is what lets the scene be exercised headlessly, and what would let a
 * different backend be substituted without touching either caller.
 */

/** An object's placement on the canvas, in canvas pixels. */
export interface RenderTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Rotation about the object's centre, in radians. */
  readonly rotation: number;
}

/** One drawable: a shader, the values driving it, and where it goes. */
export interface RenderItem {
  readonly objectId: string;
  readonly shaderId: string;
  readonly values: ParameterValues;
  readonly transform: RenderTransform;
  readonly opacity: number;
  /** Optional alpha mask, used by text objects to shape the shader's output. */
  readonly mask?: TexSource;
  /**
   * Where the pointer is over this object, for a shader that reacts to it.
   * Absent when the pointer is elsewhere.
   */
  readonly pointer?: PointerInput;
}

/** An image the runtime can upload, e.g. a rasterized glyph run. */
export interface TexSource {
  readonly source: TexImageSource;
  /** Changes when the contents change, so the runtime knows to re-upload. */
  readonly revision: number;
}

/** The scene to draw, in back-to-front order. */
export interface RenderScene {
  readonly items: readonly RenderItem[];
}

export type RuntimeStatus =
  | { readonly kind: 'ready' }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'context-lost' };

export interface ShaderCompileFailure {
  readonly shaderId: string;
  /** The diagnostic the graphics driver produced. */
  readonly diagnostic: string;
  readonly stage: 'vertex' | 'fragment' | 'link';
}

export interface RuntimeObserver {
  readonly onStatusChange?: (status: RuntimeStatus) => void;
  readonly onCompileFailure?: (failure: ShaderCompileFailure) => void;
  /** A shader whose advance threw, or which consistently overruns its budget. */
  readonly onAdvanceFailure?: (failure: AdvanceFailure) => void;
}

/**
 * The rendering surface the canvas drives.
 *
 * Implementations own their resources and must release them on `dispose`.
 */
export interface RenderingPort {
  readonly status: RuntimeStatus;
  /** Replaces the scene to be drawn. Cheap: drawing happens on the next frame. */
  setScene: (scene: RenderScene) => void;
  /** Matches the drawing surface to a new CSS size. */
  resize: (cssWidth: number, cssHeight: number) => void;
  /**
   * Draws one frame. `dt` is how far rendering advanced since the previous
   * frame, which is what a simulation steps by; it defaults to nothing, for a
   * caller drawing a single still frame.
   */
  renderFrame: (elapsedSeconds: number, dt?: number) => void;
  /** Releases every resource held. */
  dispose: () => void;
}
