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
 * The topmost targetable object under a point.
 *
 * Searched front to back, because the object drawn on top is the one the user
 * means.
 */
export function objectAt(document: CanvasDocument, point: Point): CanvasObject | undefined {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index];
    if (!object || !isTargetable(object)) continue;
    if (hitTest(point, object)) return object;
  }
  return undefined;
}

/** Every targetable object under a point, front to back. */
export function objectsAt(document: CanvasDocument, point: Point): CanvasObject[] {
  const found: CanvasObject[] = [];
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index];
    if (!object || !isTargetable(object)) continue;
    if (hitTest(point, object)) found.push(object);
  }
  return found;
}

/** Targetable objects a marquee fully encloses, in document order. */
export function objectsWithin(document: CanvasDocument, marquee: Rect): CanvasObject[] {
  return document.objects.filter((object) => isTargetable(object) && enclosedBy(marquee, object));
}
