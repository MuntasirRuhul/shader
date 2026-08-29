import {
  addObjects,
  createDocument,
  createRectangle,
  resetObjectIds,
  type CanvasDocument,
} from '@shader/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cursorFor,
  gestureRect,
  hasMoved,
  IDLE,
  marqueeSelection,
  moveOffset,
  movedPositions,
  onPointerDown,
  onPointerMove,
  panOffset,
  resizedBounds,
  rotatedAngle,
  selectionBounds,
  type PointerDownContext,
} from './interaction';

let document: CanvasDocument;

function press(overrides: Partial<PointerDownContext> = {}): PointerDownContext {
  return {
    tool: 'select',
    shape: 'rectangle',
    point: { x: 0, y: 0 },
    document,
    selection: [],
    additive: false,
    panning: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetObjectIds();
  document = addObjects(createDocument(), [
    createRectangle({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
    createRectangle({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
  ]);
});

describe('the select tool — clicking', () => {
  it('selects the object under the pointer', () => {
    const result = onPointerDown(press({ point: { x: 50, y: 50 } }));

    expect(result.selection).toEqual(['a']);
    expect(result.gesture.kind).toBe('move');
  });

  it('clears the selection when clicking empty canvas', () => {
    const result = onPointerDown(press({ point: { x: 500, y: 500 }, selection: ['a'] }));

    expect(result.selection).toEqual([]);
    expect(result.gesture.kind).toBe('marquee');
  });

  it('adds to the selection with the additive modifier', () => {
    const result = onPointerDown(
      press({ point: { x: 250, y: 50 }, selection: ['a'], additive: true }),
    );

    expect(result.selection).toEqual(['a', 'b']);
  });

  it('removes from the selection when adding an already-selected object', () => {
    const result = onPointerDown(
      press({ point: { x: 50, y: 50 }, selection: ['a', 'b'], additive: true }),
    );

    expect(result.selection).toEqual(['b']);
  });

  it('keeps a multiple selection when pressing one of its members', () => {
    const result = onPointerDown(press({ point: { x: 50, y: 50 }, selection: ['a', 'b'] }));

    expect(result.selection).toEqual(['a', 'b']);
  });

  it('leaves the selection alone when adding on empty canvas', () => {
    const result = onPointerDown(
      press({ point: { x: 500, y: 500 }, selection: ['a'], additive: true }),
    );

    expect(result.selection).toBeUndefined();
  });

  it('does not select a locked object, falling through to a marquee', () => {
    const locked = addObjects(createDocument(), [
      createRectangle({ id: 'locked', x: 0, y: 0, width: 100, height: 100, locked: true }),
    ]);

    const result = onPointerDown(press({ document: locked, point: { x: 50, y: 50 } }));

    expect(result.gesture.kind).toBe('marquee');
  });
});

describe('the select tool — dragging a selection', () => {
  it('moves every selected object by the same offset', () => {
    const started = onPointerDown(press({ point: { x: 50, y: 50 }, selection: ['a', 'b'] }));
    const moved = onPointerMove(started.gesture, { x: 90, y: 70 });

    expect(moveOffset(moved)).toEqual({ x: 40, y: 20 });
    expect(movedPositions(moved)).toEqual(
      new Map([
        ['a', { x: 40, y: 20 }],
        ['b', { x: 240, y: 20 }],
      ]),
    );
  });

  it('is absolute rather than cumulative, so the object tracks the pointer', () => {
    const started = onPointerDown(press({ point: { x: 50, y: 50 } }));
    const first = onPointerMove(started.gesture, { x: 100, y: 50 });
    const second = onPointerMove(first, { x: 60, y: 50 });

    expect(movedPositions(second).get('a')).toEqual({ x: 10, y: 0 });
  });

  it('excludes a locked object from the move', () => {
    const mixed = addObjects(createDocument(), [
      createRectangle({ id: 'free', x: 0, y: 0, width: 100, height: 100 }),
      createRectangle({ id: 'locked', x: 0, y: 0, width: 100, height: 100, locked: true }),
    ]);

    const started = onPointerDown(
      press({ document: mixed, point: { x: 50, y: 50 }, selection: ['free', 'locked'] }),
    );

    expect([...movedPositions(onPointerMove(started.gesture, { x: 60, y: 60 })).keys()]).toEqual([
      'free',
    ]);
  });
});

describe('the select tool — marquee', () => {
  it('builds a rectangle from the drag', () => {
    const started = onPointerDown(press({ point: { x: 400, y: 400 } }));
    const dragged = onPointerMove(started.gesture, { x: 300, y: 350 });

    expect(gestureRect(dragged)).toEqual({ x: 300, y: 350, width: 100, height: 50 });
  });

  it('selects the objects it fully encloses', () => {
    const started = onPointerDown(press({ point: { x: 500, y: 500 } }));
    const dragged = onPointerMove(started.gesture, { x: -10, y: -10 });

    expect(marqueeSelection(dragged, document).map((object) => object.id)).toEqual(['a', 'b']);
  });

  it('ignores an object only partly enclosed', () => {
    const started = onPointerDown(press({ point: { x: -10, y: -10 } }));
    const dragged = onPointerMove(started.gesture, { x: 50, y: 50 });

    expect(marqueeSelection(dragged, document)).toEqual([]);
  });

  it('excludes hidden and locked objects', () => {
    const mixed = addObjects(createDocument(), [
      createRectangle({ id: 'visible', x: 0, y: 0, width: 50, height: 50 }),
      createRectangle({ id: 'hidden', x: 0, y: 0, width: 50, height: 50, visible: false }),
      createRectangle({ id: 'locked', x: 0, y: 0, width: 50, height: 50, locked: true }),
    ]);

    const started = onPointerDown(press({ document: mixed, point: { x: -10, y: -10 } }));
    const dragged = onPointerMove(started.gesture, { x: 500, y: 500 });

    expect(marqueeSelection(dragged, mixed).map((o) => o.id)).toEqual(['visible']);
  });
});

describe('the shape tool', () => {
  it('starts a draw gesture', () => {
    const result = onPointerDown(press({ tool: 'shape', point: { x: 10, y: 10 } }));

    expect(result.gesture.kind).toBe('draw');
  });

  it('draws the chosen shape', () => {
    const result = onPointerDown(press({ tool: 'shape', shape: 'ellipse' }));

    expect(result.gesture).toMatchObject({ kind: 'draw', shape: 'ellipse' });
  });

  it('produces the dragged rectangle', () => {
    const started = onPointerDown(press({ tool: 'shape', point: { x: 10, y: 20 } }));
    const dragged = onPointerMove(started.gesture, { x: 110, y: 70 });

    expect(gestureRect(dragged)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('produces equal sides when constrained', () => {
    const started = onPointerDown(press({ tool: 'shape', point: { x: 0, y: 0 } }));
    const dragged = onPointerMove(started.gesture, { x: 100, y: 40 });

    const square = gestureRect(dragged, true);
    expect(square?.width).toBe(square?.height);
  });

  it('does not select anything on press', () => {
    expect(
      onPointerDown(press({ tool: 'shape', point: { x: 50, y: 50 } })).selection,
    ).toBeUndefined();
  });
});

describe('the text tool', () => {
  it('starts no gesture, since it creates on release', () => {
    expect(onPointerDown(press({ tool: 'text', point: { x: 10, y: 10 } })).gesture).toBe(IDLE);
  });
});

describe('transform handles', () => {
  it('starts a resize when a handle is pressed', () => {
    const result = onPointerDown(
      press({
        point: { x: 100, y: 100 },
        selection: ['a'],
        handle: { objectId: 'a', handle: 'bottom-right' },
      }),
    );

    expect(result.gesture).toMatchObject({ kind: 'resize', objectId: 'a', handle: 'bottom-right' });
  });

  it('resizes from the opposite corner', () => {
    const started = onPointerDown(
      press({ handle: { objectId: 'a', handle: 'bottom-right' }, point: { x: 100, y: 100 } }),
    );
    const dragged = onPointerMove(started.gesture, { x: 300, y: 200 });

    expect(resizedBounds(dragged)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it('constrains the aspect ratio when asked', () => {
    const started = onPointerDown(
      press({ handle: { objectId: 'a', handle: 'bottom-right' }, point: { x: 100, y: 100 } }),
    );
    const dragged = onPointerMove(started.gesture, { x: 300, y: 120 });

    const bounds = resizedBounds(dragged, true);
    expect(bounds?.width).toBeCloseTo(bounds?.height ?? 0, 6);
  });

  it('starts a rotation when the rotate handle is pressed', () => {
    const result = onPointerDown(
      press({ handle: { objectId: 'a', handle: 'rotate' }, point: { x: 50, y: -30 } }),
    );

    expect(result.gesture).toMatchObject({ kind: 'rotate', objectId: 'a' });
  });

  it('reports the rotation about the object centre', () => {
    const started = onPointerDown(
      press({ handle: { objectId: 'a', handle: 'rotate' }, point: { x: 50, y: -30 } }),
    );
    const dragged = onPointerMove(started.gesture, { x: 200, y: 50 });

    expect(rotatedAngle(dragged, document)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('takes precedence over the object beneath the handle', () => {
    const result = onPointerDown(
      press({ point: { x: 50, y: 50 }, handle: { objectId: 'a', handle: 'top-left' } }),
    );

    expect(result.gesture.kind).toBe('resize');
  });
});

describe('the selection indicator', () => {
  it('encloses a single selection', () => {
    expect(selectionBounds(document, ['a'])).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('encloses several objects together', () => {
    expect(selectionBounds(document, ['a', 'b'])).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 100,
    });
  });

  it('has no bounds with nothing selected', () => {
    expect(selectionBounds(document, [])).toBeUndefined();
  });
});

describe('panning', () => {
  it('starts a pan when the modifier is held', () => {
    expect(onPointerDown(press({ panning: true })).gesture.kind).toBe('pan');
  });

  it('reports the travelled offset', () => {
    const started = onPointerDown(press({ panning: true, point: { x: 100, y: 100 } }));
    const dragged = onPointerMove(started.gesture, { x: 140, y: 60 });

    expect(panOffset(dragged)).toEqual({ x: 40, y: -40 });
  });

  it('takes precedence over selecting an object', () => {
    expect(
      onPointerDown(press({ point: { x: 50, y: 50 }, panning: true })).selection,
    ).toBeUndefined();
  });
});

describe('distinguishing a click from a drag', () => {
  it('treats a tiny movement as a click', () => {
    expect(hasMoved({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('treats a real movement as a drag', () => {
    expect(hasMoved({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
  });
});

describe('cursor feedback', () => {
  it('offers a move cursor over an object', () => {
    expect(cursorFor('select', true, IDLE)).toBe('move');
  });

  it('offers the default cursor over empty canvas', () => {
    expect(cursorFor('select', false, IDLE)).toBe('default');
  });

  it('offers a crosshair for the shape tool', () => {
    expect(cursorFor('shape', false, IDLE)).toBe('crosshair');
  });

  it('offers a text cursor for the text tool', () => {
    expect(cursorFor('text', false, IDLE)).toBe('text');
  });

  it('shows a grabbing cursor while panning', () => {
    expect(
      cursorFor('select', false, { kind: 'pan', origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } }),
    ).toBe('grabbing');
  });
});
