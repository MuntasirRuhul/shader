import { absolutePlacement, ancestorsOf } from '../document/containment';
import type { CanvasDocument, CanvasObject } from '../document/model';
import { enclosedBy, hitTest, type Point, type Rect } from './geometry';

/**
 * Which object the pointer targets.
 *
 * Hidden and locked objects fall through rather than blocking what is beneath
 * them: a locked background must never swallow a click meant for the object on
 * top of it.
 */

export function isTargetable(object: CanvasObject): boolean {
  return object.visible && !object.locked;
}

/**
 * Where an object is for the purpose of being pointed at.
 *
 * A child is stored against its container, so its own coordinates say nothing
 * about where the pointer would find it.
 */
function placed(document: CanvasDocument, object: CanvasObject): CanvasObject {
  if (object.parentId === null) return object;
  return { ...object, ...absolutePlacement(document, object) };
}

/**
 * Whether an object can be pointed at through its containers.
 *
 * A hidden or locked container hides and locks what it holds; otherwise a
 * click would reach inside something that is not there.
 */
function reachable(document: CanvasDocument, object: CanvasObject): boolean {
  if (!isTargetable(object)) return false;
  return ancestorsOf(document, object.id).every(isTargetable);
}

/**
 * The topmost targetable object under a point.
 *
 * Searched front to back, because the object drawn on top is the one the user
 * means.
 */
export function objectAt(document: CanvasDocument, point: Point): CanvasObject | undefined {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index];
    if (!object || !reachable(document, object)) continue;
    // A container with no fill of its own is a handle, not a surface: an
    // empty area inside a group belongs to whatever is behind the group.
    if (object.type === 'frame' && object.fill.kind !== 'shader') continue;
    if (hitTest(point, placed(document, object))) return object;
  }
  return undefined;
}

/** Every targetable object under a point, front to back. */
export function objectsAt(document: CanvasDocument, point: Point): CanvasObject[] {
  const found: CanvasObject[] = [];
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index];
    if (!object || !reachable(document, object)) continue;
    if (hitTest(point, placed(document, object))) found.push(object);
  }
  return found;
}

/** Targetable objects a marquee fully encloses, in document order. */
export function objectsWithin(document: CanvasDocument, marquee: Rect): CanvasObject[] {
  // Only what sits at the top level: a marquee selects things, and the thing
  // a group's contents belong to is the group.
  return document.objects.filter(
    (object) =>
      object.parentId === null && reachable(document, object) && enclosedBy(marquee, object),
  );
}
