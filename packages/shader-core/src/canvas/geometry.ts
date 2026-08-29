import type { CanvasObject } from '../document/model';

/**
 * Pointer targeting, done analytically on the CPU.
 *
 * The alternative — rendering object ids to a buffer and reading the pixel
 * back — stalls the pipeline on every pointer move. Rectangles and ellipses
 * have closed-form containment tests, so targeting is exact, synchronous, and
 * costs nothing on the GPU.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** An object's centre, which rotation happens about. */
export function centreOf(object: Pick<CanvasObject, 'x' | 'y' | 'width' | 'height'>): Point {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

/**
 * Brings a point into an object's unrotated frame.
 *
 * Rotating the point backwards about the centre is what lets the containment
 * tests below stay axis-aligned however the object is turned.
 */
export function toLocalSpace(
  point: Point,
  object: Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): Point {
  const centre = centreOf(object);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;

  if (object.rotation === 0) {
    return { x: centre.x + dx, y: centre.y + dy };
  }

  const cos = Math.cos(-object.rotation);
  const sin = Math.sin(-object.rotation);

  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
  };
}

/** Object-local coordinates as a 0..1 fraction of the object's box. */
export function toUnitSpace(
  point: Point,
  object: Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): Point {
  const local = toLocalSpace(point, object);
  return {
    x: object.width === 0 ? 0 : (local.x - object.x) / object.width,
    y: object.height === 0 ? 0 : (local.y - object.y) / object.height,
  };
}

function withinBox(local: Point, object: Rect): boolean {
  return (
    local.x >= object.x &&
    local.x <= object.x + object.width &&
    local.y >= object.y &&
    local.y <= object.y + object.height
  );
}

/** Whether a point lies inside an object, accounting for its rotation. */
export function hitTest(point: Point, object: CanvasObject): boolean {
  if (object.width <= 0 || object.height <= 0) return false;

  const local = toLocalSpace(point, object);

  if (object.type === 'ellipse') {
    const centre = centreOf(object);
    const rx = object.width / 2;
    const ry = object.height / 2;
    const nx = (local.x - centre.x) / rx;
    const ny = (local.y - centre.y) / ry;
    return nx * nx + ny * ny <= 1;
  }

  // Rectangles and text both use their box. Text is deliberately targeted by
  // its bounds rather than its glyphs: clicking the gap inside an "O" should
  // still select the object.
  return withinBox(local, object);
}

/** The axis-aligned box an object occupies once rotated. */
export function boundsOf(object: CanvasObject): Rect {
  if (object.rotation === 0) {
    return { x: object.x, y: object.y, width: object.width, height: object.height };
  }

  const centre = centreOf(object);
  const cos = Math.cos(object.rotation);
  const sin = Math.sin(object.rotation);
  const halfWidth = object.width / 2;
  const halfHeight = object.height / 2;

  const corners: Point[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => ({
    x: centre.x + corner.x * cos - corner.y * sin,
    y: centre.y + corner.x * sin + corner.y * cos,
  }));

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** The box enclosing several objects, for a multiple-selection indicator. */
export function unionBounds(objects: readonly CanvasObject[]): Rect | undefined {
  if (objects.length === 0) return undefined;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const object of objects) {
    const bounds = boundsOf(object);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Whether a marquee fully encloses an object's rotated bounds. */
export function enclosedBy(marquee: Rect, object: CanvasObject): boolean {
  const bounds = boundsOf(object);
  return (
    bounds.x >= marquee.x &&
    bounds.y >= marquee.y &&
    bounds.x + bounds.width <= marquee.x + marquee.width &&
    bounds.y + bounds.height <= marquee.y + marquee.height
  );
}

/** A rectangle from two corners, in any drag direction. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** A square from two corners, sized by the larger drag axis. */
export function squareFromPoints(a: Point, b: Point): Rect {
  const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return {
    x: b.x < a.x ? a.x - size : a.x,
    y: b.y < a.y ? a.y - size : a.y,
    width: size,
    height: size,
  };
}
