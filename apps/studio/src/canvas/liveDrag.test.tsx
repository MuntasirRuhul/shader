import { createDocument, createRectangle } from '@shader/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../store/editorStore';
import { INITIAL_VIEWPORT } from '../store/slices';
import { transientChannel, type TransientEdit } from '../store/transientChannel';
import { gestureChanges, previewBounds, type Gesture } from './interaction';
import { useCanvasPointer } from './useCanvasPointer';

/**
 * A drag has to be visible while it is happening.
 *
 * It was not. The values a move, resize, or rotation produces were computed
 * only on release, so the object sat still under the pointer and then jumped
 * when it was let go — and the selection indicator, drawn from the document,
 * sat still with it. Everything needed was already there; nothing published it.
 */

const object = createRectangle({ x: 100, y: 100, width: 200, height: 120 });
const document_ = createDocument({ objects: [object] });

const moveTo = (x: number, y: number): Gesture => ({
  kind: 'move',
  origin: { x: 150, y: 150 },
  current: { x, y },
  startPositions: new Map([[object.id, { x: object.x, y: object.y }]]),
});

describe('a gesture reports what it has changed so far', () => {
  it('reports a move as the position it has reached', () => {
    expect(gestureChanges(moveTo(210, 190), document_)).toEqual([
      { objectId: object.id, changes: { x: 160, y: 140 } },
    ]);
  });

  it('reports a resize as the whole rectangle', () => {
    const resize: Gesture = {
      kind: 'resize',
      objectId: object.id,
      handle: 'bottom-right',
      startBounds: { x: 100, y: 100, width: 200, height: 120 },
      current: { x: 360, y: 260 },
    };

    const [change] = gestureChanges(resize, document_);
    expect(change?.changes).toEqual({ x: 100, y: 100, width: 260, height: 160 });
  });

  it('reports nothing for a gesture that changes no object', () => {
    expect(gestureChanges({ kind: 'idle' }, document_)).toEqual([]);
    expect(
      gestureChanges(
        { kind: 'marquee', origin: { x: 0, y: 0 }, current: { x: 50, y: 50 } },
        document_,
      ),
    ).toEqual([]);
  });
});

describe('the selection indicator follows the drag', () => {
  it('moves with the object rather than staying where it began', () => {
    const still = previewBounds(document_, [object.id], { kind: 'idle' });
    const dragged = previewBounds(document_, [object.id], moveTo(250, 230));

    expect(still).toMatchObject({ x: 100, y: 100 });
    expect(dragged).toMatchObject({ x: 200, y: 180 });
  });

  it('keeps the object size while it is moved', () => {
    const dragged = previewBounds(document_, [object.id], moveTo(250, 230));

    expect(dragged).toMatchObject({ width: 200, height: 120 });
  });

  it('grows with a resize', () => {
    const resize: Gesture = {
      kind: 'resize',
      objectId: object.id,
      handle: 'bottom-right',
      startBounds: { x: 100, y: 100, width: 200, height: 120 },
      current: { x: 400, y: 300 },
    };

    expect(previewBounds(document_, [object.id], resize)).toMatchObject({
      width: 300,
      height: 200,
    });
  });

  it('falls back to the document when nothing is being dragged', () => {
    expect(previewBounds(document_, [object.id], { kind: 'idle' })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 120,
    });
  });
});

describe('the canvas publishes a drag as it happens', () => {
  const edit = vi.fn();
  const selectMany = vi.fn();
  let published: TransientEdit[][] = [];
  let unsubscribe: () => void;

  function store(): EditorState {
    return {
      document: document_,
      selection: [object.id],
      viewport: INITIAL_VIEWPORT,
      tool: { active: 'select', shape: 'rectangle', editingTextId: null },
      edit,
      selectMany,
      panBy: vi.fn(),
      addObject: vi.fn(),
      updateObject: vi.fn(),
      setTool: vi.fn(),
    } as unknown as EditorState;
  }

  function pointerEvent(x: number, y: number) {
    return {
      pointerId: 1,
      button: 0,
      clientX: x,
      clientY: y,
      shiftKey: false,
      altKey: false,
      currentTarget: {
        setPointerCapture: vi.fn(),
        hasPointerCapture: vi.fn(() => true),
        releasePointerCapture: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      },
      target: { dataset: {} },
    } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    published = [];
    unsubscribe = transientChannel.subscribe((edits) => {
      published.push(edits.map((entry) => ({ ...entry })));
    });
  });

  afterEach(() => {
    unsubscribe();
    if (transientChannel.isDragging) transientChannel.end();
  });

  it('publishes a position on every pointer move, not only on release', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      result.current.onPointerDown(pointerEvent(150, 150));
    });
    act(() => {
      result.current.onPointerMove(pointerEvent(200, 180));
    });
    act(() => {
      result.current.onPointerMove(pointerEvent(260, 240));
    });

    const latest = published.at(-1) ?? [];
    expect(latest).toContainEqual({ objectId: object.id, key: 'x', value: 210 });
    expect(latest).toContainEqual({ objectId: object.id, key: 'y', value: 190 });
    // The document is untouched until the drag is let go.
    expect(edit).not.toHaveBeenCalled();
  });

  it('keeps the drag off the history until it is released', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      result.current.onPointerDown(pointerEvent(150, 150));
    });
    for (const step of [170, 190, 210, 230]) {
      act(() => {
        result.current.onPointerMove(pointerEvent(step, step));
      });
    }
    act(() => {
      result.current.onPointerUp(pointerEvent(230, 230));
    });

    // One entry for the whole drag, however many moves it took.
    expect(edit).toHaveBeenCalledOnce();
    expect(transientChannel.isDragging).toBe(false);
  });

  it('clears what it published once the document has it', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      result.current.onPointerDown(pointerEvent(150, 150));
    });
    act(() => {
      result.current.onPointerMove(pointerEvent(220, 200));
    });
    act(() => {
      result.current.onPointerUp(pointerEvent(220, 200));
    });

    expect(published.at(-1)).toEqual([]);
  });

  it('publishes nothing for a gesture that moves no object', () => {
    const emptyStore = () => ({ ...store(), selection: [] }) as EditorState;
    const { result } = renderHook(() => useCanvasPointer(emptyStore));

    act(() => {
      // Starting on empty canvas draws a marquee, which changes nothing.
      result.current.onPointerDown(pointerEvent(700, 500));
    });
    act(() => {
      result.current.onPointerMove(pointerEvent(760, 560));
    });

    expect(transientChannel.isDragging).toBe(false);
    expect(published).toEqual([]);
  });
});
