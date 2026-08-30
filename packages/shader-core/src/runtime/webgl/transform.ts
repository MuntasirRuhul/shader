import { IDENTITY_VIEWPORT, type RenderTransform, type RenderViewport } from '../renderingPort';

/**
 * Builds the matrix that maps the unit quad onto an object, as it is currently
 * being looked at.
 *
 * The unit quad's corners are the object-local UV the fragment stage reads, so
 * this matrix is the whole reason a shader can be written in object space and
 * still land correctly under translation, scale, and rotation.
 *
 * The viewport is applied here, in double precision, rather than being handed
 * to the vertex stage as a transform of its own. That is deliberate: an object
 * far from the origin at high magnification produces enormous intermediates
 * and a small clip-space result, and the large terms have to cancel before
 * anything is narrowed to single precision. Done on the graphics side the
 * cancellation happens in single precision and the object visibly jitters.
 *
 * Canvas pixels have y increasing downward; clip space has y increasing upward,
 * so the vertical axis is flipped here. A consequence worth naming: because y
 * points down, a positive rotation turns the object clockwise on screen.
 *
 * Returned column-major, as GLSL's `mat3` expects.
 */
export function buildModelMatrix(
  transform: RenderTransform,
  canvasWidth: number,
  canvasHeight: number,
  viewport: RenderViewport = IDENTITY_VIEWPORT,
): Float32Array {
  const { x, y, rotation } = transform;
  const { zoom, panX, panY } = viewport;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // The object as it appears: magnified, and moved with the view. Rotation is
  // untouched, since magnifying uniformly turns nothing.
  const width = transform.width * zoom;
  const height = transform.height * zoom;

  // The object's centre, which rotation happens about.
  const centreX = (x + transform.width / 2) * zoom + panX;
  const centreY = (y + transform.height / 2) * zoom + panY;

  // Rotating the centred quad leaves this constant offset.
  const offsetX = -0.5 * cos * width + 0.5 * sin * height;
  const offsetY = -0.5 * sin * width - 0.5 * cos * height;

  const sx = canvasWidth === 0 ? 0 : 2 / canvasWidth;
  const sy = canvasHeight === 0 ? 0 : 2 / canvasHeight;

  const m00 = sx * cos * width;
  const m01 = sx * -sin * height;
  const m02 = sx * (offsetX + centreX) - 1;

  const m10 = -sy * sin * width;
  const m11 = -sy * cos * height;
  const m12 = 1 - sy * (offsetY + centreY);

  // prettier-ignore
  return new Float32Array([
    m00, m10, 0,
    m01, m11, 0,
    m02, m12, 1,
  ]);
}

/** Applies a model matrix to a unit-space point, as the vertex stage does. */
export function applyModelMatrix(
  matrix: Float32Array,
  u: number,
  v: number,
): { x: number; y: number } {
  return {
    x: (matrix[0] ?? 0) * u + (matrix[3] ?? 0) * v + (matrix[6] ?? 0),
    y: (matrix[1] ?? 0) * u + (matrix[4] ?? 0) * v + (matrix[7] ?? 0),
  };
}
