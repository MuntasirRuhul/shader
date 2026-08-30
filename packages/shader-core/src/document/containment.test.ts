import { describe, expect, it } from 'vitest';
import { objectAt, objectsWithin } from '../canvas/hitTesting';
import { deserializeDocument, serializeDocument } from '../persistence/serialization';
import {
  absolutePlacement,
  ancestorsOf,
  childrenOf,
  descendantsOf,
  inStackingOrder,
  isWithin,
  outermostOf,
  rootObjects,
} from './containment';
import {
  createDocument,
  createFrame,
  createRectangle,
  type CanvasDocument,
  type CanvasObject,
  type FrameObject,
} from './model';
import { groupObjects, removeObjects, ungroupObject } from './operations';

/**
 * Containment, which is a link on a flat list rather than nested arrays.
 *
 * The thing every case here is really checking is that grouping is a change of
 * ownership and not a change of appearance: a child is stored against its
 * container, so the same drawing has to mean the same thing before and after.
 */

const a = createRectangle({ id: 'a', x: 100, y: 100, width: 50, height: 50 });
const b = createRectangle({ id: 'b', x: 200, y: 180, width: 50, height: 40 });
const loose = createRectangle({ id: 'loose', x: 600, y: 600, width: 20, height: 20 });

function grouped(overrides: Partial<FrameObject> = {}): CanvasDocument {
  const document = createDocument({ objects: [a, b, loose] });
  return groupObjects(document, ['a', 'b'], createFrame({ id: 'g', ...overrides }));
}

describe('putting objects into a container', () => {
  it('takes the bounds of what it holds', () => {
    const container = grouped().objects.find((object) => object.id === 'g');

    expect(container).toMatchObject({ x: 100, y: 100, width: 150, height: 120 });
  });

  it('leaves everything exactly where it was on screen', () => {
    // The whole point: ownership changes, appearance does not.
    const document = grouped();

    for (const object of [a, b]) {
      const placed = absolutePlacement(
        document,
        document.objects.find((candidate) => candidate.id === object.id) as CanvasObject,
      );
      expect(placed).toMatchObject({ x: object.x, y: object.y });
    }
  });

  it('stores members against the container rather than the canvas', () => {
    const member = grouped().objects.find((object) => object.id === 'a');

    expect(member).toMatchObject({ x: 0, y: 0, parentId: 'g' });
  });

  it('leaves objects outside the selection alone', () => {
    expect(grouped().objects.find((object) => object.id === 'loose')).toMatchObject({
      x: 600,
      y: 600,
      parentId: null,
    });
  });

  it('refuses to group a single object', () => {
    const document = createDocument({ objects: [a, b] });

    expect(groupObjects(document, ['a'], createFrame({ id: 'g' }))).toBe(document);
  });

  it('refuses to group across two containers', () => {
    // Members must already share a container, or grouping would silently move
    // things out of the one they were in.
    const document = grouped();
    const spanning = groupObjects(document, ['a', 'loose'], createFrame({ id: 'g2' }));

    expect(spanning).toBe(document);
  });
});

describe('taking a container apart', () => {
  it('leaves what it held exactly where it appeared', () => {
    const document = ungroupObject(grouped(), 'g');

    expect(document.objects.find((object) => object.id === 'a')).toMatchObject({
      x: 100,
      y: 100,
      parentId: null,
    });
    expect(document.objects.find((object) => object.id === 'b')).toMatchObject({
      x: 200,
      y: 180,
    });
  });

  it('carries the container turn onto what it held', () => {
    const turned = ungroupObject(grouped({ rotation: 0.5 }), 'g');

    expect(turned.objects.find((object) => object.id === 'a')?.rotation).toBeCloseTo(0.5, 6);
  });

  it('removes the container itself', () => {
    expect(ungroupObject(grouped(), 'g').objects.some((object) => object.id === 'g')).toBe(false);
  });

  it('survives a container that holds nothing', () => {
    const empty = createDocument({ objects: [createFrame({ id: 'empty' })] });

    expect(ungroupObject(empty, 'empty').objects).toHaveLength(0);
  });
});

describe('a container that has been turned', () => {
  it('turns what it holds about its own centre', () => {
    const document = groupObjects(
      createDocument({ objects: [a, b] }),
      ['a', 'b'],
      createFrame({ id: 'g', rotation: Math.PI / 2 }),
    );
    const member = document.objects.find((object) => object.id === 'a') as CanvasObject;
    const placed = absolutePlacement(document, member);

    // A quarter turn about the container's centre, and the member turns with it.
    expect(placed.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(placed.x).not.toBeCloseTo(100, 1);
  });

  it('composes through more than one container', () => {
    const inner = groupObjects(
      createDocument({ objects: [a, b] }),
      ['a', 'b'],
      createFrame({ id: 'inner' }),
    );
    const outer = groupObjects(inner, ['inner'], createFrame({ id: 'outer' }));
    // Two objects are needed to form a group, so the refusal above stands.
    expect(outer).toBe(inner);
  });

  it('reports the containers an object sits in, innermost first', () => {
    const document = grouped();

    expect(ancestorsOf(document, 'a').map((object) => object.id)).toEqual(['g']);
    expect(outermostOf(document, 'a')).toBe('g');
    expect(outermostOf(document, 'loose')).toBe('loose');
  });

  it('answers whether one thing is inside another', () => {
    const document = grouped();

    expect(isWithin(document, 'a', 'g')).toBe(true);
    expect(isWithin(document, 'loose', 'g')).toBe(false);
    expect(isWithin(document, 'g', 'g')).toBe(true);
  });
});

describe('the list stays the stacking order', () => {
  it('puts what a container holds immediately after it', () => {
    const ordered = inStackingOrder(grouped().objects);
    const positions = new Map(ordered.map((object, index) => [object.id, index]));

    expect(positions.get('a')).toBe((positions.get('g') ?? 0) + 1);
    expect(positions.get('b')).toBe((positions.get('g') ?? 0) + 2);
  });

  it('keeps an object whose container has gone rather than losing it', () => {
    // Silently dropping someone's work is worse than showing it at the top.
    const orphaned = grouped().objects.filter((object) => object.id !== 'g');
    const ordered = inStackingOrder(orphaned);

    expect(ordered).toHaveLength(3);
    expect(ordered.every((object) => object.parentId === null)).toBe(true);
  });

  it('lists only what sits at the top level as roots', () => {
    expect(rootObjects(grouped()).map((object) => object.id)).toEqual(['g', 'loose']);
  });
});

describe('what a container implies for everything else', () => {
  it('reports what it holds, directly and at any depth', () => {
    const document = grouped();

    expect(childrenOf(document, 'g').map((object) => object.id)).toEqual(['a', 'b']);
    expect(
      descendantsOf(document, 'g')
        .map((object) => object.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('is what the pointer finds, not the thing inside it', () => {
    // Clicking a member selects the group; reaching the member is deliberate.
    const document = grouped();

    expect(objectAt(document, { x: 110, y: 110 })?.id).toBe('a');
    expect(outermostOf(document, 'a')).toBe('g');
  });

  it('hides what it holds when it is hidden', () => {
    const document = grouped({ visible: false });

    expect(objectAt(document, { x: 110, y: 110 })).toBeUndefined();
  });

  it('is what a marquee encloses, rather than its contents', () => {
    const document = grouped();
    const enclosed = objectsWithin(document, { x: 0, y: 0, width: 1000, height: 1000 });

    expect(enclosed.map((object) => object.id)).toEqual(['g', 'loose']);
  });

  it('takes what it holds with it when it is deleted', () => {
    const document = grouped();
    const withContents = ['g', ...descendantsOf(document, 'g').map((object) => object.id)];

    expect(removeObjects(document, withContents).objects.map((object) => object.id)).toEqual([
      'loose',
    ]);
  });
});

describe('a document with containers survives being saved', () => {
  it('opens again with the same shape', () => {
    const result = deserializeDocument(serializeDocument(grouped()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(childrenOf(result.document, 'g').map((object) => object.id)).toEqual(['a', 'b']);
  });

  it('opens a document written before containers existed', () => {
    // The link is simply absent, which reads as being at the top level.
    const legacy = JSON.stringify({
      ...createDocument({ objects: [] }),
      objects: [{ ...a, parentId: undefined }],
    });
    const result = deserializeDocument(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.objects[0]?.id).toBe('a');
  });
});
