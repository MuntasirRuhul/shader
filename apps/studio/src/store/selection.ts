import type { CanvasDocument, CanvasObject } from '@shader/core';

/**
 * Which objects are selected.
 *
 * Held as an ordered list rather than a set so the inspector can treat the
 * first as primary, and so the order survives serialization if it ever needs
 * to.
 */
export type Selection = readonly string[];

export const EMPTY_SELECTION: Selection = [];

/** Replaces the selection with one object. */
export function selectOne(objectId: string): Selection {
  return [objectId];
}

/** Adds to, or removes from, the selection — the additive-modifier behaviour. */
export function toggleSelected(selection: Selection, objectId: string): Selection {
  return selection.includes(objectId)
    ? selection.filter((id) => id !== objectId)
    : [...selection, objectId];
}

export function selectMany(objectIds: readonly string[]): Selection {
  return [...new Set(objectIds)];
}

export function clearSelection(): Selection {
  return EMPTY_SELECTION;
}

export function isSelected(selection: Selection, objectId: string): boolean {
  return selection.includes(objectId);
}

/** Drops identifiers that no longer exist, e.g. after a delete. */
export function pruneSelection(selection: Selection, document: CanvasDocument): Selection {
  const live = new Set(document.objects.map((object) => object.id));
  const pruned = selection.filter((id) => live.has(id));
  return pruned.length === selection.length ? selection : pruned;
}

/** The selected objects, in document order. */
export function selectedObjects(selection: Selection, document: CanvasDocument): CanvasObject[] {
  const chosen = new Set(selection);
  return document.objects.filter((object) => chosen.has(object.id));
}

/**
 * The single selected object, or undefined when none or several are selected.
 * The inspector shows per-object controls only in the single case.
 */
export function soleSelectedObject(
  selection: Selection,
  document: CanvasDocument,
): CanvasObject | undefined {
  if (selection.length !== 1) return undefined;
  return document.objects.find((object) => object.id === selection[0]);
}

/** Whether an object can be targeted by the pointer. */
export function isSelectable(object: CanvasObject): boolean {
  return object.visible && !object.locked;
}

/**
 * The topmost selectable object under a predicate, searching front to back.
 *
 * Locked and hidden objects fall through rather than blocking what is beneath
 * them — a locked background should never intercept a click meant for the
 * object on top of it.
 */
export function topmostSelectable(
  document: CanvasDocument,
  hits: (object: CanvasObject) => boolean,
): CanvasObject | undefined {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index];
    if (!object) continue;
    if (!isSelectable(object)) continue;
    if (hits(object)) return object;
  }
  return undefined;
}

/** Every selectable object a region encloses, for marquee selection. */
export function enclosedSelectable(
  document: CanvasDocument,
  encloses: (object: CanvasObject) => boolean,
): CanvasObject[] {
  return document.objects.filter((object) => isSelectable(object) && encloses(object));
}
