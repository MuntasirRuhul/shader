import {
  createDocument,
  createFrame,
  createRectangle,
  createText,
  groupObjects,
  type CanvasDocument,
} from '@shader/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_VIEWPORT } from '../store/slices';
import { movedPositions, previewBounds, type Gesture } from './interaction';
import { TextEditor } from './TextEditor';

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
