import {
  absolutePlacement,
  ancestorsOf,
  boundsOf,
  isWithin,
  outermostOf,
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

  const hit = objectAt(document, point);
  const target = targetOf(document, selection, hit);

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

/**
 * What a click actually selects.
 *
 * Clicking what a group holds selects the group: reaching the thing itself is
 * deliberate. But once inside a group, clicks stay inside it — otherwise every
 * press would throw you back out, and nothing within a group could be worked
 * on at all.
 */
function targetOf(
  document: CanvasDocument,
  selection: Selection,
  hit: CanvasObject | undefined,
): CanvasObject | undefined {
  if (!hit) return undefined;

  const outermost = outermostOf(document, hit.id);
  const entered = selection.some(
    (objectId) => objectId !== outermost && isWithin(document, objectId, outermost),
  );

  if (entered && isWithin(document, hit.id, outermost)) return hit;
  return document.objects.find((object) => object.id === outermost) ?? hit;
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
export function movedPositions(gesture: Gesture, document?: CanvasDocument): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (gesture.kind !== 'move') return positions;

  const offset = moveOffset(gesture);
  for (const [objectId, start] of gesture.startPositions) {
    // A pointer moves in canvas space; a child is stated in its container's.
    // Without turning the offset back, dragging something inside a rotated
    // group sends it off at the container's angle.
    const local = document ? intoContainerSpace(offset, document, objectId) : offset;
    positions.set(objectId, { x: start.x + local.x, y: start.y + local.y });
  }
  return positions;
}

/** A canvas-space offset expressed in the frame of an object's container. */
function intoContainerSpace(offset: Point, document: CanvasDocument, objectId: string): Point {
  const turn = ancestorsOf(document, objectId).reduce(
    (total, parent) => total + parent.rotation,
    0,
  );
  if (turn === 0) return offset;

  const cos = Math.cos(-turn);
  const sin = Math.sin(-turn);
  return { x: offset.x * cos - offset.y * sin, y: offset.x * sin + offset.y * cos };
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
  // Placed absolutely: a selected object inside a container stores its
  // position against that container, which says nothing about where the
  // indicator belongs on screen.
  return unionBounds(
    document.objects
      .filter((object) => chosen.has(object.id))
      .map((object) => ({ ...object, ...absolutePlacement(document, object) })),
  );
}

/**
 * The changes a gesture has made so far, as object properties.
 *
 * A drag has to be visible while it is happening. These are the same values
 * the release commits, published continuously so the canvas and the selection
 * indicator both follow the pointer instead of waiting for it to be let go.
 */
export function gestureChanges(
  gesture: Gesture,
  document: CanvasDocument,
  constrain = false,
): { objectId: string; changes: Record<string, number> }[] {
  switch (gesture.kind) {
    case 'move':
      return [...movedPositions(gesture, document)].map(([objectId, position]) => ({
        objectId,
        changes: { x: position.x, y: position.y },
      }));

    case 'resize': {
      const bounds = resizedBounds(gesture, constrain);
      if (!bounds) return [];
      return [
        {
          objectId: gesture.objectId,
          changes: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
        },
      ];
    }

    case 'rotate': {
      const rotation = rotatedAngle(gesture, document);
      if (rotation === undefined) return [];
      return [{ objectId: gesture.objectId, changes: { rotation } }];
    }

    default:
      return [];
  }
}

/**
 * The bounds to indicate, following a gesture in progress.
 *
 * The document does not change until a drag is released, so an indicator drawn
 * from it alone would sit still while the object it describes moves.
 */
export function previewBounds(
  document: CanvasDocument,
  selection: Selection,
  gesture: Gesture,
  constrain = false,
): Rect | undefined {
  const changes = gestureChanges(gesture, document, constrain);
  if (changes.length === 0) return selectionBounds(document, selection);

  const byId = new Map(changes.map((change) => [change.objectId, change.changes]));
  const chosen = new Set(selection);

  return unionBounds(
    document.objects
      .filter((object) => chosen.has(object.id))
      .map((object) => ({
        ...object,
        ...absolutePlacement(document, object),
        ...byId.get(object.id),
      })),
  );
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
