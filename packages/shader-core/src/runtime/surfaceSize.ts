/**
 * Sizing the drawing buffer.
 *
 * A canvas has two sizes: the CSS size it occupies, and the pixel buffer it
 * draws into. Rendering at the display's device pixel ratio is what keeps
 * output sharp on a high-density screen, but the ratio is uncapped in principle
 * and the cost is quadratic — so it is bounded.
 */

/**
 * Beyond roughly this, extra pixels buy no visible sharpness and cost a great
 * deal of fill rate on a full-screen shader.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export interface SurfaceSize {
  /** The buffer size in device pixels. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** The ratio actually applied, after capping. */
  readonly appliedRatio: number;
}

export interface SurfaceSizeOptions {
  readonly maxRatio?: number;
}

/**
 * The drawing buffer size for a CSS size and device pixel ratio.
 *
 * Dimensions are floored to whole pixels and never fall below one, so a
 * collapsed panel cannot produce a zero-sized buffer, which some drivers treat
 * as an error.
 */
export function computeSurfaceSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  options: SurfaceSizeOptions = {},
): SurfaceSize {
  const maxRatio = options.maxRatio ?? MAX_DEVICE_PIXEL_RATIO;

  const requested =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const appliedRatio = Math.min(requested, maxRatio);

  const safeWidth = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 0;
  const safeHeight = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 0;

  return {
    pixelWidth: Math.max(1, Math.floor(safeWidth * appliedRatio)),
    pixelHeight: Math.max(1, Math.floor(safeHeight * appliedRatio)),
    appliedRatio,
  };
}

/** Whether a canvas already has this buffer size, so a resize can be skipped. */
export function matchesSurfaceSize(
  canvas: { width: number; height: number },
  size: SurfaceSize,
): boolean {
  return canvas.width === size.pixelWidth && canvas.height === size.pixelHeight;
}
