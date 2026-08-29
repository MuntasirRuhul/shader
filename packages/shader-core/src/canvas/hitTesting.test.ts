import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  createEllipse,
  createRectangle,
  createText,
  resetObjectIds,
  type CanvasDocument,
} from '../document/model';
import { addObjects } from '../document/operations';
import {
  boundsOf,
  centreOf,
  enclosedBy,
  hitTest,
  rectFromPoints,
  squareFromPoints,
  toLocalSpace,
  toUnitSpace,
  unionBounds,
} from './geometry';
import { objectAt, objectsAt, objectsWithin } from './hitTesting';

let document: CanvasDocument;

beforeEach(() => {
  resetObjectIds();
  document = createDocument();
});

describe('hit-testing a rectangle', () => {
  const rectangle = createRectangle({ id: 'r', x: 100, y: 100, width: 200, height: 100 });

  it('hits a point inside', () => {
    expect(hitTest({ x: 150, y: 150 }, rectangle)).toBe(true);
  });

  it('hits the corners', () => {
    expect(hitTest({ x: 100, y: 100 }, rectangle)).toBe(true);
    expect(hitTest({ x: 300, y: 200 }, rectangle)).toBe(true);
  });

  it('misses a point outside', () => {
    expect(hitTest({ x: 99, y: 150 }, rectangle)).toBe(false);
    expect(hitTest({ x: 150, y: 201 }, rectangle)).toBe(false);
  });

  it('misses a zero-sized object', () => {
    expect(hitTest({ x: 0, y: 0 }, createRectangle({ width: 0, height: 0 }))).toBe(false);
  });
});

describe('hit-testing an ellipse', () => {
  const ellipse = createEllipse({ id: 'e', x: 0, y: 0, width: 200, height: 100 });

  it('hits the centre', () => {
    expect(hitTest({ x: 100, y: 50 }, ellipse)).toBe(true);
  });

  it('hits along the axes', () => {
    expect(hitTest({ x: 5, y: 50 }, ellipse)).toBe(true);
    expect(hitTest({ x: 100, y: 5 }, ellipse)).toBe(true);
  });

  it('misses the corners of its box, unlike a rectangle', () => {
    expect(hitTest({ x: 2, y: 2 }, ellipse)).toBe(false);
    expect(hitTest({ x: 198, y: 98 }, ellipse)).toBe(false);
  });
});

describe('hit-testing text', () => {
  it('targets a text object by its box, not its glyphs', () => {
    const text = createText({ id: 't', x: 0, y: 0, width: 200, height: 60, text: 'Hello' });

    // Clicking the gap inside a letter should still select the object.
    expect(hitTest({ x: 100, y: 30 }, text)).toBe(true);
  });
});

describe('hit-testing a rotated object', () => {
  // A wide rectangle turned a quarter turn stands tall.
  const rotated = createRectangle({
    id: 'r',
    x: 100,
    y: 150,
    width: 200,
    height: 100,
    rotation: Math.PI / 2,
  });

  it('accounts for rotation rather than testing the unrotated box', () => {
    // Inside the unrotated box but outside the rotated shape.
    expect(hitTest({ x: 120, y: 200 }, rotated)).toBe(false);
  });

  it('hits inside the rotated shape', () => {
    // The turned rectangle now extends vertically from its centre.
    expect(hitTest({ x: 200, y: 130 }, rotated)).toBe(true);
    expect(hitTest({ x: 200, y: 270 }, rotated)).toBe(true);
  });

  it('always hits the centre, whatever the rotation', () => {
    const centre = centreOf(rotated);

    expect(hitTest(centre, rotated)).toBe(true);
  });

  it('brings a point into the object frame', () => {
    const centre = centreOf(rotated);
    const local = toLocalSpace(centre, rotated);

    expect(local.x).toBeCloseTo(centre.x, 5);
    expect(local.y).toBeCloseTo(centre.y, 5);
  });

  it('reports unit coordinates within the object', () => {
    const upright = createRectangle({ x: 0, y: 0, width: 200, height: 100 });

    expect(toUnitSpace({ x: 50, y: 25 }, upright)).toEqual({ x: 0.25, y: 0.25 });
  });
});

describe('targeting respects stacking order', () => {
  beforeEach(() => {
    document = addObjects(document, [
      createRectangle({ id: 'back', x: 0, y: 0, width: 200, height: 200 }),
      createRectangle({ id: 'front', x: 0, y: 0, width: 200, height: 200 }),
    ]);
  });

  it('targets the object drawn on top', () => {
    expect(objectAt(document, { x: 100, y: 100 })?.id).toBe('front');
  });

  it('lists overlapping objects front to back', () => {
    expect(objectsAt(document, { x: 100, y: 100 }).map((o) => o.id)).toEqual(['front', 'back']);
  });

  it('finds nothing where no object lies', () => {
    expect(objectAt(document, { x: 500, y: 500 })).toBeUndefined();
  });
});

describe('targeting respects visibility and locking', () => {
  it('falls through a hidden object to what is beneath', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'beneath', x: 0, y: 0, width: 200, height: 200 }),
      createRectangle({ id: 'hidden', x: 0, y: 0, width: 200, height: 200, visible: false }),
    ]);

    expect(objectAt(seeded, { x: 100, y: 100 })?.id).toBe('beneath');
  });

  it('falls through a locked object to what is beneath', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'beneath', x: 0, y: 0, width: 200, height: 200 }),
      createRectangle({ id: 'locked', x: 0, y: 0, width: 200, height: 200, locked: true }),
    ]);

    expect(objectAt(seeded, { x: 100, y: 100 })?.id).toBe('beneath');
  });

  it('finds nothing when the only object there is locked', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'locked', x: 0, y: 0, width: 200, height: 200, locked: true }),
    ]);

    expect(objectAt(seeded, { x: 100, y: 100 })).toBeUndefined();
  });
});

describe('marquee selection', () => {
  beforeEach(() => {
    document = addObjects(document, [
      createRectangle({ id: 'inside', x: 20, y: 20, width: 50, height: 50 }),
      createRectangle({ id: 'straddling', x: 150, y: 20, width: 100, height: 50 }),
      createRectangle({ id: 'outside', x: 400, y: 400, width: 50, height: 50 }),
      createRectangle({ id: 'locked', x: 30, y: 30, width: 20, height: 20, locked: true }),
      createRectangle({ id: 'hidden', x: 30, y: 30, width: 20, height: 20, visible: false }),
    ]);
  });

  it('selects only fully enclosed objects', () => {
    const found = objectsWithin(document, { x: 0, y: 0, width: 200, height: 200 });

    expect(found.map((o) => o.id)).toEqual(['inside']);
  });

  it('excludes locked and hidden objects', () => {
    const found = objectsWithin(document, { x: 0, y: 0, width: 500, height: 500 });

    expect(found.map((o) => o.id)).not.toContain('locked');
    expect(found.map((o) => o.id)).not.toContain('hidden');
  });

  it('encloses by rotated bounds rather than the unrotated box', () => {
    const rotated = createRectangle({
      id: 'r',
      x: 100,
      y: 100,
      width: 100,
      height: 20,
      rotation: Math.PI / 2,
    });

    // The turned rectangle stands taller than its unrotated box.
    expect(enclosedBy({ x: 90, y: 90, width: 120, height: 40 }, rotated)).toBe(false);
    expect(enclosedBy({ x: 90, y: 50, width: 120, height: 140 }, rotated)).toBe(true);
  });
});

describe('bounds', () => {
  it('reports an unrotated object as its own box', () => {
    const rectangle = createRectangle({ x: 10, y: 20, width: 100, height: 50 });

    expect(boundsOf(rectangle)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('grows the box for a rotated object', () => {
    const rotated = createRectangle({ x: 0, y: 0, width: 100, height: 20, rotation: Math.PI / 4 });
    const bounds = boundsOf(rotated);

    expect(bounds.width).toBeGreaterThan(100 * 0.7);
    expect(bounds.height).toBeGreaterThan(20);
  });

  it('encloses several objects', () => {
    const bounds = unionBounds([
      createRectangle({ x: 0, y: 0, width: 50, height: 50 }),
      createRectangle({ x: 100, y: 80, width: 50, height: 20 }),
    ]);

    expect(bounds).toEqual({ x: 0, y: 0, width: 150, height: 100 });
  });

  it('has no bounds for an empty selection', () => {
    expect(unionBounds([])).toBeUndefined();
  });
});

describe('building rectangles from a drag', () => {
  it('builds a rectangle dragging down and right', () => {
    expect(rectFromPoints({ x: 10, y: 10 }, { x: 60, y: 40 })).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 30,
    });
  });

  it('builds the same rectangle dragging up and left', () => {
    expect(rectFromPoints({ x: 60, y: 40 }, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 30,
    });
  });

  it('builds a square sized by the larger axis', () => {
    expect(squareFromPoints({ x: 0, y: 0 }, { x: 80, y: 30 })).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 80,
    });
  });

  it('anchors a square dragged up and left at the far corner', () => {
    expect(squareFromPoints({ x: 100, y: 100 }, { x: 60, y: 80 })).toEqual({
      x: 60,
      y: 60,
      width: 40,
      height: 40,
    });
  });
});
