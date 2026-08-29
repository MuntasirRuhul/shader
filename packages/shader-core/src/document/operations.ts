import type { ParameterValues } from '../registry/parameterSchema';
import {
  isShaderFill,
  nextObjectId,
  type CanvasDocument,
  type CanvasObject,
  type Fill,
} from './model';

/**
 * Every change to a document, expressed as a pure function.
 *
 * Each returns a new document rather than mutating, which is what lets the
 * history layer capture before-and-after states cheaply and lets React see a
 * changed reference.
 */

export function findObject(document: CanvasDocument, objectId: string): CanvasObject | undefined {
  return document.objects.find((object) => object.id === objectId);
}

export function objectIndex(document: CanvasDocument, objectId: string): number {
  return document.objects.findIndex((object) => object.id === objectId);
}

/**
 * Adds an object at the front of the stacking order.
 *
 * The identifier is replaced if it collides with one already present, so a
 * duplicated or imported object can never shadow an existing one.
 */
export function addObject(document: CanvasDocument, object: CanvasObject): CanvasDocument {
  const taken = new Set(document.objects.map((existing) => existing.id));
  const safe = taken.has(object.id) ? { ...object, id: nextObjectId(object.type) } : object;

  return { ...document, objects: [...document.objects, safe] };
}

export function addObjects(
  document: CanvasDocument,
  objects: readonly CanvasObject[],
): CanvasDocument {
  return objects.reduce(addObject, document);
}

export function removeObject(document: CanvasDocument, objectId: string): CanvasDocument {
  if (objectIndex(document, objectId) < 0) return document;

  return {
    ...document,
    objects: document.objects.filter((object) => object.id !== objectId),
  };
}

export function removeObjects(
  document: CanvasDocument,
  objectIds: readonly string[],
): CanvasDocument {
  const removing = new Set(objectIds);
  if (removing.size === 0) return document;

  return {
    ...document,
    objects: document.objects.filter((object) => !removing.has(object.id)),
  };
}

/**
 * Applies a partial update to one object, leaving its type intact.
 *
 * An update whose values already match returns the document untouched. Without
 * that, dragging a control back to where it started would record a history
 * entry that undoes to an identical state.
 */
export function updateObject(
  document: CanvasDocument,
  objectId: string,
  changes: Partial<Omit<CanvasObject, 'id' | 'type'>>,
): CanvasDocument {
  const index = objectIndex(document, objectId);
  if (index < 0) return document;

  const existing = document.objects[index];
  if (!existing) return document;

  const differs = Object.entries(changes).some(
    ([key, value]) => !Object.is(Reflect.get(existing, key), value),
  );
  if (!differs) return document;

  const objects = [...document.objects];
  objects[index] = { ...existing, ...changes };
  return { ...document, objects };
}

export function setFill(document: CanvasDocument, objectId: string, fill: Fill): CanvasDocument {
  return updateObject(document, objectId, { fill });
}

/**
 * Merges parameter values into an object's shader fill.
 *
 * Only that object's fill changes, which is what keeps two objects sharing a
 * shader independent.
 */
export function setShaderValues(
  document: CanvasDocument,
  objectId: string,
  values: ParameterValues,
): CanvasDocument {
  const object = findObject(document, objectId);
  if (!object || !isShaderFill(object.fill)) return document;

  return setFill(document, objectId, {
    ...object.fill,
    values: { ...object.fill.values, ...values },
  });
}

/** Replaces an object's shader values outright, e.g. when applying a preset. */
export function replaceShaderValues(
  document: CanvasDocument,
  objectId: string,
  values: ParameterValues,
  presetId?: string,
): CanvasDocument {
  const object = findObject(document, objectId);
  if (!object || !isShaderFill(object.fill)) return document;

  return setFill(document, objectId, {
    kind: 'shader',
    shaderId: object.fill.shaderId,
    values: { ...values },
    ...(presetId === undefined ? {} : { presetId }),
  });
}

/** Moves an object to a new index in the stacking order. */
function moveTo(document: CanvasDocument, objectId: string, target: number): CanvasDocument {
  const from = objectIndex(document, objectId);
  if (from < 0) return document;

  const clamped = Math.max(0, Math.min(document.objects.length - 1, target));
  if (clamped === from) return document;

  const objects = [...document.objects];
  const [moved] = objects.splice(from, 1);
  if (!moved) return document;
  objects.splice(clamped, 0, moved);

  return { ...document, objects };
}

/** One step towards the front. */
export function raiseObject(document: CanvasDocument, objectId: string): CanvasDocument {
  return moveTo(document, objectId, objectIndex(document, objectId) + 1);
}

/** One step towards the back. */
export function lowerObject(document: CanvasDocument, objectId: string): CanvasDocument {
  return moveTo(document, objectId, objectIndex(document, objectId) - 1);
}

export function bringToFront(document: CanvasDocument, objectId: string): CanvasDocument {
  return moveTo(document, objectId, document.objects.length - 1);
}

export function sendToBack(document: CanvasDocument, objectId: string): CanvasDocument {
  return moveTo(document, objectId, 0);
}

/** Reorders an object to an explicit index. */
export function reorderObject(
  document: CanvasDocument,
  objectId: string,
  index: number,
): CanvasDocument {
  return moveTo(document, objectId, index);
}

/** Objects that are actually drawn, in back-to-front order. */
export function visibleObjects(document: CanvasDocument): CanvasObject[] {
  return document.objects.filter((object) => object.visible);
}

/** The shader identifiers the document references. */
export function referencedShaderIds(document: CanvasDocument): string[] {
  const ids = new Set<string>();
  for (const object of document.objects) {
    if (isShaderFill(object.fill)) ids.add(object.fill.shaderId);
  }
  return [...ids];
}
