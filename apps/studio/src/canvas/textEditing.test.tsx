import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, createText } from '@shader/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_VIEWPORT, type ViewportState } from '../store/slices';
import { IDLE } from './interaction';
import { SelectionOverlay } from './SelectionOverlay';
import { TextEditor } from './TextEditor';

/**
 * What the object being typed into looks like.
 *
 * Two things went wrong here and both showed as the same thing on screen: a
 * second edge floating inside the selection box, and typed text disappearing.
 * The editor was sized from a width worked out here rather than the object's
 * own, so the two disagreed; and its height was worked out here too, so
 * whenever that guess came up a line short the textarea hid the rest.
 */

const object = createText({ x: 40, y: 60, text: 'Hello' });
const document_ = createDocument({ objects: [object] });

function renderEditor(viewport: ViewportState = INITIAL_VIEWPORT) {
  render(
    <TextEditor
      document={document_}
      editingId={object.id}
      onCancel={vi.fn()}
      onCommit={vi.fn()}
      viewport={viewport}
    />,
  );
  return screen.getByLabelText('Edit text');
}

describe('the editor covers the object exactly', () => {
  it('is exactly as wide as the object it edits', () => {
    const editor = renderEditor();

    expect(editor.style.width).toBe(`${String(object.width)}px`);
  });

  it('is as wide as the object looks when the view is magnified', () => {
    const editor = renderEditor({ zoom: 2, panX: 0, panY: 0 });

    expect(editor.style.width).toBe(`${String(object.width * 2)}px`);
  });

  it('sits where the object sits', () => {
    const editor = renderEditor({ zoom: 2, panX: -30, panY: 15 });

    expect(editor.style.left).toBe(`${String(object.x * 2 - 30)}px`);
    expect(editor.style.top).toBe(`${String(object.y * 2 + 15)}px`);
  });

  it('draws its border inside that width rather than outside it', () => {
    // Otherwise it is two pixels wider than the object and shows an edge of
    // its own just inside the selection box. Read from the stylesheet, since a
    // headless run applies no CSS.
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'TextEditor.module.css'),
      'utf8',
    );
    const rule = /\.editor\s*\{[^}]*\}/s.exec(css)?.[0] ?? '';

    expect(rule).toMatch(/box-sizing:\s*border-box/);
  });

  it('asks for one row, so measuring can collapse to the content', () => {
    // A textarea defaults to two rows. Measured against `height: auto` that
    // puts a floor of two lines under everything, and a single line of text
    // opened in a box twice its own height.
    const editor = renderEditor();

    expect(editor.getAttribute('rows')).toBe('1');
  });

  it('takes its height from the browser measure, not from a guess', () => {
    // A height worked out here clips a line whenever it disagrees with where
    // the browser actually broke them, and a textarea hides what does not fit.
    const editor = renderEditor();
    const { fontSize, lineHeight } = object.textSettings;

    // Never collapsed: a measure taken before layout reads zero, and the
    // caret has to stand somewhere.
    expect(Number.parseFloat(editor.style.height)).toBeGreaterThanOrEqual(fontSize * lineHeight);
  });

  it('keeps that floor a line of the magnified size', () => {
    const editor = renderEditor({ zoom: 3, panX: 0, panY: 0 });
    const { fontSize, lineHeight } = object.textSettings;

    expect(Number.parseFloat(editor.style.height)).toBeGreaterThanOrEqual(
      fontSize * lineHeight * 3,
    );
  });

  it('is styled with the object own type settings', () => {
    const editor = renderEditor();
    const type = object.textSettings;

    expect(editor.style.fontFamily).toContain('system-ui');
    expect(editor.style.fontSize).toBe(`${String(type.fontSize)}px`);
    expect(editor.style.fontWeight).toBe(String(type.fontWeight));
  });
});

describe('one set of bounds at a time', () => {
  const overlay = (editingId: string | null) =>
    render(
      <SelectionOverlay
        constrain={false}
        document={document_}
        editingId={editingId}
        gesture={IDLE}
        selection={[object.id]}
        viewport={INITIAL_VIEWPORT}
      />,
    );

  it('draws the selection box for an object that is not being edited', () => {
    const { container } = overlay(null);

    expect(container.querySelectorAll('div').length).toBeGreaterThan(1);
  });

  it('leaves the box to the editor while the object is being typed into', () => {
    // The editor already shows where the object is. A second box that sizes
    // itself differently is the extra edge that appeared inside it.
    const withoutEditing = overlay(null).container.querySelectorAll('div').length;
    const whileEditing = overlay(object.id).container.querySelectorAll('div').length;

    expect(whileEditing).toBeLessThan(withoutEditing);
  });

  it('still draws the box for a different object that is selected', () => {
    const other = createText({ id: 'other', text: 'Other' });
    const { container } = render(
      <SelectionOverlay
        constrain={false}
        document={createDocument({ objects: [object, other] })}
        editingId={other.id}
        gesture={IDLE}
        selection={[object.id]}
        viewport={INITIAL_VIEWPORT}
      />,
    );

    expect(container.querySelectorAll('div').length).toBeGreaterThan(1);
  });
});
