import {
  boundsOf,
  objectAt,
  objectsWithin,
  rectFromPoints,
  squareFromPoints,
  unionBounds,
  type CanvasDocument,
  type CanvasObject,
  type Point,
  type Rect,
} from '@shader/core';
import type { Selection } from '../store/selection';
import type { ShapeKind, ToolId } from '../store/slices';
import { resizeFromHandle, rotationFromPointer, type HandlePosition } from './transformHandles';

/**
 * What a pointer gesture on the canvas is doing.
 *
 * Modelled as an explicit state rather than a set of booleans, so a gesture can
 * only ever be one thing — there is no way to be simultaneously drawing a
 * marquee and resizing.
 */
export type Gesture =
  | { readonly kind: 'idle' }
  | { readonly kind: 'marquee'; readonly origin: Point; readonly current: Point }
  | {
      readonly kind: 'move';
      readonly origin: Point;
      readonly current: Point;
      /** Where each moving object started, so the drag is absolute not cumulative. */
      readonly startPositions: ReadonlyMap<string, Point>;
    }
  | {
      readonly kind: 'resize';
      readonly objectId: string;
      readonly handle: HandlePosition;
      readonly startBounds: Rect;
      readonly current: Point;
    }
  | { readonly kind: 'rotate'; readonly objectId: string; readonly current: Point }
  | {
      readonly kind: 'draw';
      readonly shape: ShapeKind;
      readonly origin: Point;
      readonly current: Point;
    }
  | { readonly kind: 'pan'; readonly origin: Point; readonly current: Point };

export const IDLE: Gesture = { kind: 'idle' };

/** Drags shorter than this are treated as clicks, not drags. */
export const DRAG_THRESHOLD = 3;

export function hasMoved(from: Point, to: Point, threshold = DRAG_THRESHOLD): boolean {
  return Math.abs(to.x - from.x) >= threshold || Math.abs(to.y - from.y) >= threshold;
}

export interface PointerDownContext {
  readonly tool: ToolId;
  readonly shape: ShapeKind;
  readonly point: Point;
  readonly document: CanvasDocument;
  readonly selection: Selection;
  /** True when the additive modifier is held. */
  readonly additive: boolean;
  /** True when the pan modifier is held, or the middle button is used. */
  readonly panning: boolean;
  /** A handle under the pointer, when one was hit. */
  readonly handle?: { readonly objectId: string; readonly handle: HandlePosition | 'rotate' };
}

export interface PointerDownResult {
  readonly gesture: Gesture;
  /** The selection this press establishes, when it changes one. */
  readonly selection?: Selection;
}

/**
 * What a press starts.
 *
 * Selection is decided here rather than on release, so dragging an object
 * selects it and moves it in one gesture.
 */
export function onPointerDown(context: PointerDownContext): PointerDownResult {
  const { point, document, selection } = context;

  if (context.panning) {
    return { gesture: { kind: 'pan', origin: point, current: point } };
  }

  if (context.tool === 'shape') {
    return {
      gesture: { kind: 'draw', shape: context.shape, origin: point, current: point },
    };
  }

  if (context.tool === 'text') {
    // The text tool creates on release, so the press starts nothing.
    return { gesture: IDLE };
  }

  // A handle takes precedence over whatever lies beneath it.
  if (context.handle) {
    const object = document.objects.find((candidate) => candidate.id === context.handle?.objectId);
    if (object) {
      if (context.handle.handle === 'rotate') {
        return { gesture: { kind: 'rotate', objectId: object.id, current: point } };
      }
      return {
        gesture: {
          kind: 'resize',
          objectId: object.id,
          handle: context.handle.handle,
          startBounds: boundsOf(object),
          current: point,
        },
      };
    }
  }

  const target = objectAt(document, point);

  if (!target) {
    // Empty canvas: begin a marquee, and clear unless adding to a selection.
    return {
      gesture: { kind: 'marquee', origin: point, current: point },
      ...(context.additive ? {} : { selection: [] }),
    };
  }

  const nextSelection = context.additive
    ? toggleWithin(selection, target.id)
    : selection.includes(target.id)
      ? selection
      : [target.id];

  return {
    gesture: {
      kind: 'move',
      origin: point,
      current: point,
      startPositions: startPositionsFor(document, nextSelection),
    },
    selection: nextSelection,
  };
}

function toggleWithin(selection: Selection, objectId: string): Selection {
  return selection.includes(objectId)
    ? selection.filter((id) => id !== objectId)
    : [...selection, objectId];
}

function startPositionsFor(document: CanvasDocument, selection: Selection): Map<string, Point> {
  const positions = new Map<string, Point>();
  for (const objectId of selection) {
    const object = document.objects.find((candidate) => candidate.id === objectId);
    if (object && !object.locked) positions.set(objectId, { x: object.x, y: object.y });
  }
  return positions;
}

/** Advances a gesture to a new pointer position. */
export function onPointerMove(gesture: Gesture, point: Point): Gesture {
  switch (gesture.kind) {
    case 'idle':
      return gesture;
    case 'marquee':
    case 'move':
    case 'draw':
    case 'pan':
      return { ...gesture, current: point };
    case 'resize':
    case 'rotate':
      return { ...gesture, current: point };
  }
}

/** The rectangle a marquee or draw gesture currently covers. */
export function gestureRect(gesture: Gesture, constrain = false): Rect | undefined {
  if (gesture.kind !== 'marquee' && gesture.kind !== 'draw') return undefined;
  return constrain
    ? squareFromPoints(gesture.origin, gesture.current)
    : rectFromPoints(gesture.origin, gesture.current);
}

/** The objects a marquee has enclosed so far. */
export function marqueeSelection(gesture: Gesture, document: CanvasDocument): CanvasObject[] {
  const rect = gestureRect(gesture);
  if (!rect) return [];
  return objectsWithin(document, rect);
}

/** The offset a move gesture has travelled. */
export function moveOffset(gesture: Gesture): Point {
  if (gesture.kind !== 'move') return { x: 0, y: 0 };
  return {
    x: gesture.current.x - gesture.origin.x,
    y: gesture.current.y - gesture.origin.y,
  };
}

/** Where each moved object should now sit. */
export function movedPositions(gesture: Gesture): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (gesture.kind !== 'move') return positions;

  const offset = moveOffset(gesture);
  for (const [objectId, start] of gesture.startPositions) {
    positions.set(objectId, { x: start.x + offset.x, y: start.y + offset.y });
  }
  return positions;
}

/** The rectangle a resize gesture currently describes. */
export function resizedBounds(gesture: Gesture, constrain = false): Rect | undefined {
  if (gesture.kind !== 'resize') return undefined;
  return resizeFromHandle(gesture.startBounds, gesture.handle, gesture.current, {
    constrain,
    minSize: 4,
  });
}

/** The rotation a rotate gesture currently describes. */
export function rotatedAngle(gesture: Gesture, document: CanvasDocument): number | undefined {
  if (gesture.kind !== 'rotate') return undefined;
  const object = document.objects.find((candidate) => candidate.id === gesture.objectId);
  if (!object) return undefined;
  return rotationFromPointer(object, gesture.current);
}

/** The pan offset a pan gesture has travelled. */
export function panOffset(gesture: Gesture): Point {
  if (gesture.kind !== 'pan') return { x: 0, y: 0 };
  return {
    x: gesture.current.x - gesture.origin.x,
    y: gesture.current.y - gesture.origin.y,
  };
}

/** The bounds indicator drawn for the current selection. */
export function selectionBounds(document: CanvasDocument, selection: Selection): Rect | undefined {
  const chosen = new Set(selection);
  return unionBounds(document.objects.filter((object) => chosen.has(object.id)));
}

/** The cursor the canvas should show, given what is under the pointer. */
export function cursorFor(
  tool: ToolId,
  overObject: boolean,
  gesture: Gesture,
  panHeld = false,
): string {
  if (gesture.kind === 'pan') return 'grabbing';
  // Holding the modifier says what a drag will do before it is begun, which is
  // the only signal that the active tool is suspended.
  if (panHeld) return 'grab';
  if (gesture.kind === 'move') return 'move';
  if (tool === 'shape') return 'crosshair';
  if (tool === 'text') return 'text';
  return overObject ? 'move' : 'default';
}
