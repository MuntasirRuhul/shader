import {
  absolutePlacement,
  createDocument,
  createFrame,
  createRectangle,
  createText,
  groupObjects,
  type CanvasDocument,
} from '@shader/core';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../store/editorStore';
import { INITIAL_VIEWPORT } from '../store/slices';
import {
  gestureChanges,
  movedPositions,
  onPointerDown,
  previewBounds,
  type Gesture,
} from './interaction';
import { TextEditor } from './TextEditor';
import { useCanvasPointer, type CanvasPointerHandlers } from './useCanvasPointer';

/**
 * Working on something that lives inside a group.
 *
 * Grouping stores a member against its container, so every part of the editor
 * that reads an object's own coordinates starts lying about where it is. The
 * text editor did exactly that: opened on grouped text, it appeared near the
 * canvas origin while the text itself sat wherever the group was.
 */

const text = createText({ id: 't', x: 900, y: 700, text: 'hello world', width: 400 });
const other = createRectangle({ id: 'r', x: 950, y: 500, width: 100, height: 100 });

function withGroup(overrides = {}): CanvasDocument {
  return groupObjects(
    createDocument({ objects: [other, text] }),
    ['r', 't'],
    createFrame({ id: 'g', ...overrides }),
  );
}

function renderEditorIn(document: CanvasDocument) {
  const view = render(
    <TextEditor
      document={document}
      editingId="t"
      onCancel={vi.fn()}
      onCommit={vi.fn()}
      viewport={INITIAL_VIEWPORT}
    />,
  );
  return { editor: screen.getByLabelText('Edit text'), unmount: view.unmount };
}

describe('editing text that lives inside a group', () => {
  it('opens over the text, not at the canvas origin', () => {
    const { editor } = renderEditorIn(withGroup());

    // Its own x is now relative to the group; using it put the editor here.
    expect(editor.style.left).not.toBe('0px');
    expect(Number.parseFloat(editor.style.left)).toBeCloseTo(text.x, 0);
    expect(Number.parseFloat(editor.style.top)).toBeCloseTo(text.y, 0);
  });

  it('opens in the same place whether or not it has been grouped', () => {
    const flat = renderEditorIn(createDocument({ objects: [text] }));
    const left = flat.editor.style.left;
    const top = flat.editor.style.top;
    flat.unmount();

    const { editor } = renderEditorIn(withGroup());

    expect(editor.style.left).toBe(left);
    expect(editor.style.top).toBe(top);
  });

  it('follows the group when the group is turned', () => {
    const { editor } = renderEditorIn(withGroup({ rotation: Math.PI / 2 }));

    // Somewhere else entirely, but a definite somewhere.
    expect(Number.isFinite(Number.parseFloat(editor.style.left))).toBe(true);
    expect(Number.parseFloat(editor.style.left)).not.toBeCloseTo(text.x, 0);
  });
});

describe('the selection indicator inside a group', () => {
  it('is drawn over the object, not at the group origin', () => {
    const document = withGroup();
    const bounds = previewBounds(document, ['t'], { kind: 'idle' });

    expect(bounds).toMatchObject({ x: text.x, y: text.y });
  });
});

describe('dragging something inside a group', () => {
  const dragBy = (dx: number, dy: number): Gesture => ({
    kind: 'move',
    origin: { x: 0, y: 0 },
    current: { x: dx, y: dy },
    startPositions: new Map([['t', { x: 0, y: 200 }]]),
  });

  it('moves it by what the pointer moved', () => {
    const moved = movedPositions(dragBy(40, 25), withGroup());

    expect(moved.get('t')).toEqual({ x: 40, y: 225 });
  });

  it('turns the movement into the group frame when the group is turned', () => {
    // The pointer moves across the canvas; the member is stated in the
    // container's frame. Without turning the offset back, dragging right
    // inside a quarter-turned group sends the member downward.
    const document = withGroup({ rotation: Math.PI / 2 });
    const moved = movedPositions(dragBy(40, 0), document);

    expect(moved.get('t')?.x).toBeCloseTo(0, 6);
    expect(moved.get('t')?.y).toBeCloseTo(200 - 40, 6);
  });

  it('is unaffected by containers when there are none', () => {
    const flat = createDocument({ objects: [text] });

    expect(movedPositions(dragBy(10, 10), flat).get('t')).toEqual({ x: 10, y: 210 });
  });
});

describe('a click does not throw you back out of a group', () => {
  const start = (selection: string[]) =>
    onPointerDown({
      tool: 'select',
      shape: 'rectangle',
      point: { x: 950, y: 720 },
      document: withGroup(),
      selection,
      additive: false,
      panning: false,
    });

  it('selects the group when nothing inside it is selected', () => {
    expect(start([]).selection).toEqual(['g']);
  });

  it('keeps the member selected once you are inside', () => {
    // Without this the press that precedes a double-click reselects the group,
    // so the double-click never sees the member as already chosen and editing
    // can never begin — which is exactly how it failed.
    expect(start(['t']).selection).toEqual(['t']);
  });

  it('reaches a sibling directly once you are inside', () => {
    const result = onPointerDown({
      tool: 'select',
      shape: 'rectangle',
      point: { x: 1000, y: 550 },
      document: withGroup(),
      selection: ['t'],
      additive: false,
      panning: false,
    });

    expect(result.selection).toEqual(['r']);
  });

  it('goes back to the group once nothing inside it is selected', () => {
    expect(start(['g']).selection).toEqual(['g']);
  });
});

describe('reaching grouped text with the pointer, end to end', () => {
  const beginTextEditing = vi.fn();
  const selectMany = vi.fn();
  const select = vi.fn();
  let selection: string[] = [];
  const document_ = withGroup();

  function store() {
    return {
      document: document_,
      selection,
      viewport: INITIAL_VIEWPORT,
      tool: { active: 'select', shape: 'rectangle', editingTextId: null },
      select: (id: string) => {
        select(id);
        selection = [id];
      },
      selectMany: (ids: string[]) => {
        selectMany(ids);
        selection = ids;
      },
      beginTextEditing,
      panBy: vi.fn(),
      addObject: vi.fn(),
      updateObject: vi.fn(),
      edit: vi.fn(),
      setTool: vi.fn(),
    } as unknown as EditorState;
  }

  const at = (x: number, y: number) =>
    ({
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
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 2000, height: 1200 }),
      },
      target: { dataset: {} },
    }) as never;

  function doubleClickAt(result: { current: CanvasPointerHandlers }, x: number, y: number) {
    for (let press = 0; press < 2; press += 1) {
      act(() => {
        result.current.onPointerDown(at(x, y));
      });
      act(() => {
        result.current.onPointerUp(at(x, y));
      });
    }
    act(() => {
      result.current.onDoubleClick(at(x, y));
    });
  }

  it('takes two double-clicks: one to enter the group, one to edit', () => {
    vi.clearAllMocks();
    selection = [];
    const { result } = renderHook(() => useCanvasPointer(store));

    // Over the text, which sits inside the group.
    doubleClickAt(result, 950, 720);
    expect(selection).toEqual(['t']);
    expect(beginTextEditing).not.toHaveBeenCalled();

    doubleClickAt(result, 950, 720);
    expect(beginTextEditing).toHaveBeenCalledWith('t');
  });

  it('opens text that is not in a group on the first double-click', () => {
    vi.clearAllMocks();
    selection = [];
    const flat = createDocument({ objects: [text] });
    const { result } = renderHook(() => useCanvasPointer(() => ({ ...store(), document: flat })));

    doubleClickAt(result, 950, 720);

    expect(beginTextEditing).toHaveBeenCalledWith('t');
  });
});

describe('dragging a member is drawn where the pointer is', () => {
  const document_ = withGroup();

  /** Where the drag says the object is, as the canvas would place it. */
  function drawnDuringDrag(dx: number, dy: number) {
    const gesture: Gesture = {
      kind: 'move',
      origin: { x: 0, y: 0 },
      current: { x: dx, y: dy },
      startPositions: new Map([['t', { x: 0, y: 200 }]]),
    };

    const [change] = gestureChanges(gesture, document_);
    const object = document_.objects.find((candidate) => candidate.id === 't');
    if (!object || !change) throw new Error('no member to drag');

    // Exactly what the canvas does: apply the drag to the object, then place it.
    const dragged = { ...object, ...change.changes };
    return absolutePlacement(document_, dragged);
  }

  it('moves by the drag, from where it was', () => {
    const before = absolutePlacement(
      document_,
      document_.objects.find((candidate) => candidate.id === 't') as never,
    );
    const during = drawnDuringDrag(60, 30);

    expect(during.x).toBeCloseTo(before.x + 60, 6);
    expect(during.y).toBeCloseTo(before.y + 30, 6);
  });

  it('does not fly to the canvas origin', () => {
    // A member's coordinates are relative to its group. Applied to a placement
    // that already had the group composed in, they sent it to the top corner.
    const during = drawnDuringDrag(10, 10);

    expect(during.x).toBeGreaterThan(500);
    expect(during.y).toBeGreaterThan(500);
  });

  it('draws the indicator in the same place', () => {
    const gesture: Gesture = {
      kind: 'move',
      origin: { x: 0, y: 0 },
      current: { x: 60, y: 30 },
      startPositions: new Map([['t', { x: 0, y: 200 }]]),
    };
    const bounds = previewBounds(document_, ['t'], gesture);
    const during = drawnDuringDrag(60, 30);

    expect(bounds?.x).toBeCloseTo(during.x, 6);
    expect(bounds?.y).toBeCloseTo(during.y, 6);
  });
});
