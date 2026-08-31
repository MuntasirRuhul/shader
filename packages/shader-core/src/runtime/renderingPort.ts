import type { BlendMode } from '../document/blendMode';
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
  /** How this object combines with what is beneath it. Defaults to normal. */
  readonly blendMode?: BlendMode;
  /** Optional alpha mask, used by text objects to shape the shader's output. */
  readonly mask?: TexSource;
  /** The picture to draw, for an object created from a file. */
  readonly image?: TexSource;
  /**
   * Pictures the shader's own image parameters sample, keyed by parameter
   * name. Absent for a parameter with no picture chosen, and for one whose
   * file has not finished decoding.
   */
  readonly parameterImages?: Readonly<Record<string, TexSource>>;
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

/**
 * How the canvas is being looked at.
 *
 * Held apart from the scene because the two change at completely different
 * rates: a view moves at pointer cadence, a document rarely. Folding the view
 * into the scene would rebuild the item list, and re-examine every resource
 * held for it, on every frame of a pan.
 *
 * This is a property of looking, never of what is looked at: an object's
 * stored coordinates mean the same thing at every view.
 */
export interface RenderViewport {
  /** Magnification. 1 draws an object at its stored size. */
  readonly zoom: number;
  /** Translation in canvas pixels, applied after magnification. */
  readonly panX: number;
  readonly panY: number;
}

/** Unmagnified and untranslated — how the canvas was drawn before views existed. */
export const IDENTITY_VIEWPORT: RenderViewport = { zoom: 1, panX: 0, panY: 0 };

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
  /**
   * Replaces how that scene is looked at. Cheaper still: it touches no item
   * and no resource, so a pan costs a redraw and nothing else.
   */
  setViewport: (viewport: RenderViewport) => void;
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
