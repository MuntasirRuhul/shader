import type { Point, Rect } from '../canvas/geometry';
import type { CanvasDocument, CanvasObject } from './model';

/**
 * What it means for one object to be inside another.
 *
 * Containment is a link on a flat list, so this is the only place that knows
 * how to read it. Everything else asks here rather than walking parents for
 * itself, which is what keeps the invariant — a container's descendants follow
 * it in the list — in one place instead of forty.
 *
 * A child's position is stored relative to its container's top-left, unrotated.
 * Absolute placement is composed on the way to the renderer, so the runtime
 * never learns that containers exist.
 */

/** The objects directly inside a container, in stacking order. */
export function childrenOf(document: CanvasDocument, parentId: string): CanvasObject[] {
  return document.objects.filter((object) => object.parentId === parentId);
}

/** Every object inside a container, however deep, in stacking order. */
export function descendantsOf(document: CanvasDocument, parentId: string): CanvasObject[] {
  const found: CanvasObject[] = [];
  const pending = [parentId];

  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined) continue;
    for (const child of childrenOf(document, next)) {
      found.push(child);
      pending.push(child.id);
    }
  }

  return found;
}

/** The containers an object sits in, innermost first. */
export function ancestorsOf(document: CanvasDocument, objectId: string): CanvasObject[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const chain: CanvasObject[] = [];

  let current = byId.get(objectId)?.parentId ?? null;
  // Bounded by the object count, so a corrupt document cannot loop for ever.
  while (current !== null && chain.length <= document.objects.length) {
    const parent = byId.get(current);
    if (!parent) break;
    chain.push(parent);
    current = parent.parentId;
  }

  return chain;
}

/** The outermost container an object belongs to, or the object itself. */
export function outermostOf(document: CanvasDocument, objectId: string): string {
  const chain = ancestorsOf(document, objectId);
  return chain.at(-1)?.id ?? objectId;
}

/** Whether one object is the given container, or is somewhere inside it. */
export function isWithin(document: CanvasDocument, objectId: string, containerId: string): boolean {
  if (objectId === containerId) return true;
  return ancestorsOf(document, objectId).some((parent) => parent.id === containerId);
}

/** The objects at the top level, in stacking order. */
export function rootObjects(document: CanvasDocument): CanvasObject[] {
  return document.objects.filter((object) => object.parentId === null);
}

/**
 * Where an object actually sits on the canvas.
 *
 * A child is stored against its container's unrotated top-left, so its
 * absolute placement is its offset carried through every container above it.
 * Rotation accumulates; the offset is turned about each container's centre,
 * which is the point those containers rotate about.
 */
export function absolutePlacement(
  document: CanvasDocument,
  object: CanvasObject,
): Rect & { rotation: number } {
  const chain = ancestorsOf(document, object.id);

  let x = object.x;
  let y = object.y;
  let rotation = object.rotation;

  for (const parent of chain) {
    const centreX = parent.width / 2;
    const centreY = parent.height / 2;

    // The child's own centre, in this container's unrotated space.
    const localCentre = { x: x + object.width / 2, y: y + object.height / 2 };
    const turned = rotateAbout(localCentre, { x: centreX, y: centreY }, parent.rotation);

    x = parent.x + turned.x - object.width / 2;
    y = parent.y + turned.y - object.height / 2;
    rotation += parent.rotation;
  }

  return { x, y, width: object.width, height: object.height, rotation };
}

function rotateAbout(point: Point, centre: Point, angle: number): Point {
  if (angle === 0) return point;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;

  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
  };
}

/**
 * The list reordered so every container is immediately followed by what it
 * holds.
 *
 * The list is the stacking order, so a container's contents have to sit above
 * it and below whatever comes next. Restated here rather than assumed, so an
 * operation that inserts or moves an object cannot quietly break it.
 */
export function inStackingOrder(objects: readonly CanvasObject[]): CanvasObject[] {
  const byParent = new Map<string | null, CanvasObject[]>();
  for (const object of objects) {
    const siblings = byParent.get(object.parentId) ?? [];
    siblings.push(object);
    byParent.set(object.parentId, siblings);
  }

  const ordered: CanvasObject[] = [];
  const visit = (parentId: string | null) => {
    for (const object of byParent.get(parentId) ?? []) {
      ordered.push(object);
      visit(object.id);
    }
  };
  visit(null);

  // Anything whose container has gone is kept rather than dropped: losing an
  // object silently is worse than showing it at the top level.
  if (ordered.length < objects.length) {
    const placed = new Set(ordered.map((object) => object.id));
    for (const object of objects) {
      if (!placed.has(object.id)) ordered.push({ ...object, parentId: null });
    }
  }

  return ordered;
}

/**
 * A container resized to hold exactly what is in it.
 *
 * A group is a handle on its contents, so its bounds are a consequence of them
 * rather than a thing of their own: edit the text inside one and the group has
 * to follow, or its outline and everything measured from it describe a shape
 * that is no longer there.
 *
 * Members keep their place on screen. The container's origin moves, so each
 * member's offset moves against it by the same amount — and because a
 * container turns about its own centre, moving that centre has to be undone in
 * the container's placement or everything inside it would swing.
 */
export function refitContainer(document: CanvasDocument, containerId: string): CanvasDocument {
  const container = document.objects.find((object) => object.id === containerId);
  if (!container || container.type !== 'frame') return document;

  // A frame is a window onto a region and keeps the bounds it was given. Only
  // a group, which is nothing but a handle, follows its contents.
  if (container.clipsContent) return document;

  const members = childrenOf(document, containerId);
  if (members.length === 0) return document;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const member of members) {
    minX = Math.min(minX, member.x);
    minY = Math.min(minY, member.y);
    maxX = Math.max(maxX, member.x + member.width);
    maxY = Math.max(maxY, member.y + member.height);
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  if (minX === 0 && minY === 0 && width === container.width && height === container.height) {
    return document;
  }

  // Where the centre was, and where it would be, in the container's own space.
  const centre = { x: container.width / 2, y: container.height / 2 };
  const nextCentre = { x: width / 2, y: height / 2 };
  const cos = Math.cos(container.rotation);
  const sin = Math.sin(container.rotation);

  const shift = {
    x: nextCentre.x - centre.x + minX,
    y: nextCentre.y - centre.y + minY,
  };
  const placement = {
    x: container.x + centre.x - nextCentre.x + (shift.x * cos - shift.y * sin),
    y: container.y + centre.y - nextCentre.y + (shift.x * sin + shift.y * cos),
  };

  return {
    ...document,
    objects: document.objects.map((object) => {
      if (object.id === containerId) {
        return { ...object, x: placement.x, y: placement.y, width, height };
      }
      if (object.parentId === containerId) {
        return { ...object, x: object.x - minX, y: object.y - minY };
      }
      return object;
    }),
  };
}

/**
 * Resizes every container above an object to hold what it now holds.
 *
 * Applied from the inside out, since a container's own size is what the one
 * above it has to accommodate.
 */
export function refitAncestors(document: CanvasDocument, objectId: string): CanvasDocument {
  return ancestorsOf(document, objectId).reduce(
    (next, container) => refitContainer(next, container.id),
    document,
  );
}
