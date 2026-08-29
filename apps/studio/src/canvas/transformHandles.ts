import { centreOf, type CanvasObject, type Point, type Rect } from '@shader/core';

/**
 * Resizing and rotating a selected object.
 *
 * Resize is anchored at the corner opposite the one being dragged, which is
 * what makes the object appear to stretch from where the user is holding it
 * rather than drift.
 */

export const HANDLE_POSITIONS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

export type HandlePosition = (typeof HANDLE_POSITIONS)[number];

export type HandleKind = HandlePosition | 'rotate';

/** Handle size in screen pixels, independent of zoom. */
export const HANDLE_SIZE = 8;
export const ROTATE_HANDLE_OFFSET = 24;

/** Where a handle sits, in canvas coordinates. */
export function handlePoint(bounds: Rect, handle: HandlePosition): Point {
  switch (handle) {
    case 'top-left':
      return { x: bounds.x, y: bounds.y };
    case 'top-right':
      return { x: bounds.x + bounds.width, y: bounds.y };
    case 'bottom-right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
    case 'bottom-left':
      return { x: bounds.x, y: bounds.y + bounds.height };
  }
}

/** The corner that stays put while a handle is dragged. */
export function anchorFor(bounds: Rect, handle: HandlePosition): Point {
  const opposite: Record<HandlePosition, HandlePosition> = {
    'top-left': 'bottom-right',
    'top-right': 'bottom-left',
    'bottom-right': 'top-left',
    'bottom-left': 'top-right',
  };
  return handlePoint(bounds, opposite[handle]);
}

export interface ResizeOptions {
  /** Preserves the original aspect ratio. */
  readonly constrain?: boolean;
  /** Below this, a dimension is treated as collapsed. */
  readonly minSize?: number;
}

/**
 * The rectangle produced by dragging a handle to a point.
 *
 * The anchor is the opposite corner, so it never moves. A constrained drag
 * keeps the original proportions, sized by whichever axis moved further.
 */
export function resizeFromHandle(
  bounds: Rect,
  handle: HandlePosition,
  pointer: Point,
  options: ResizeOptions = {},
): Rect {
  const minSize = options.minSize ?? 1;
  const anchor = anchorFor(bounds, handle);

  let width = Math.abs(pointer.x - anchor.x);
  let height = Math.abs(pointer.y - anchor.y);

  if (options.constrain === true && bounds.width > 0 && bounds.height > 0) {
    const ratio = bounds.width / bounds.height;
    // Take the axis that moved further as the leading one, so the drag follows
    // the pointer rather than snapping to whichever axis happens to be first.
    if (width / ratio > height) height = width / ratio;
    else width = height * ratio;
  }

  width = Math.max(minSize, width);
  height = Math.max(minSize, height);

  return {
    x: pointer.x < anchor.x ? anchor.x - width : anchor.x,
    y: pointer.y < anchor.y ? anchor.y - height : anchor.y,
    width,
    height,
  };
}

/**
 * The rotation that points the handle at the pointer.
 *
 * Measured from straight up, because the rotate handle sits above the object,
 * so dragging it directly upward should read as no rotation.
 */
export function rotationFromPointer(
  object: Pick<CanvasObject, 'x' | 'y' | 'width' | 'height'>,
  pointer: Point,
): number {
  const centre = centreOf(object);
  return Math.atan2(pointer.y - centre.y, pointer.x - centre.x) + Math.PI / 2;
}

/** Snaps a rotation to the nearest increment, for a constrained turn. */
export function snapRotation(radians: number, incrementDegrees = 15): number {
  const increment = (incrementDegrees * Math.PI) / 180;
  return Math.round(radians / increment) * increment;
}

/** Normalises a rotation into 0..2π so stored values stay comparable. */
export function normaliseRotation(radians: number): number {
  const full = Math.PI * 2;
  return ((radians % full) + full) % full;
}

/** The cursor that communicates what a handle does. */
export function cursorForHandle(handle: HandleKind): string {
  if (handle === 'rotate') return 'grab';
  return handle === 'top-left' || handle === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';
}
