import { createDocument, createHtml, resetObjectIds } from '@shader/core';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_VIEWPORT } from '../store/slices';
import { EDIT_MESSAGE, HTML_MESSAGE, READY_MESSAGE } from './htmlDocument';
import { HtmlLayer } from './HtmlLayer';

/**
 * Editing a block where it stands.
 *
 * The frame is sandboxed without same-origin access — pasted markup may run
 * scripts, and none of them may reach this application — so the page cannot be
 * read or written from here. The two talk instead: this asks the page to
 * become editable, and the page reports back what it now says.
 */

const block = createHtml('<h1>Services</h1>', '', { id: 'block', name: 'Block' });
const document_ = createDocument({ objects: [block] });

function frameOf(): HTMLIFrameElement {
  return screen.getByTitle<HTMLIFrameElement>('Block');
}

/** A message as the page inside a block would send it. */
function fromPage(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }));
  });
}

beforeEach(() => {
  resetObjectIds();
});

describe('entering a block', () => {
  it('leaves it alone until it is entered', () => {
    render(<HtmlLayer document={document_} editingId={null} viewport={INITIAL_VIEWPORT} />);

    // Every gesture belongs to the canvas while the block is merely on it.
    expect(frameOf().className).not.toContain('Editing');
  });

  it('hands it the pointer once it is', () => {
    render(<HtmlLayer document={document_} editingId="block" viewport={INITIAL_VIEWPORT} />);

    expect(frameOf().className).toContain('Editing');
  });

  it('asks the page to become editable', () => {
    render(<HtmlLayer document={document_} editingId="block" viewport={INITIAL_VIEWPORT} />);
    const page = frameOf().contentWindow;
    if (!page) throw new Error('expected the block to have a page');
    const post = vi.spyOn(page, 'postMessage');

    // The page says when it is ready, since it may still have been loading
    // when it was asked — which is how the request used to be lost.
    fromPage(frameOf(), { kind: READY_MESSAGE });

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ kind: EDIT_MESSAGE, editing: true }),
      '*',
    );
  });

  it('tells a block that is not being edited to stop', () => {
    render(<HtmlLayer document={document_} editingId={null} viewport={INITIAL_VIEWPORT} />);
    const page = frameOf().contentWindow;
    if (!page) throw new Error('expected the block to have a page');
    const post = vi.spyOn(page, 'postMessage');

    fromPage(frameOf(), { kind: READY_MESSAGE });

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ kind: EDIT_MESSAGE, editing: false }),
      '*',
    );
  });
});

describe('what the page reports back', () => {
  it('reaches the object, so the panel and the document agree with the canvas', () => {
    const onEdited = vi.fn();
    render(
      <HtmlLayer
        document={document_}
        editingId="block"
        onEdited={onEdited}
        viewport={INITIAL_VIEWPORT}
      />,
    );

    fromPage(frameOf(), { kind: HTML_MESSAGE, html: '<h1>Studio</h1>' });

    expect(onEdited).toHaveBeenCalledWith('block', '<h1>Studio</h1>');
  });

  it('is ignored when it did not come from a block at all', () => {
    const onEdited = vi.fn();
    render(<HtmlLayer document={document_} onEdited={onEdited} viewport={INITIAL_VIEWPORT} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { kind: HTML_MESSAGE, html: '<p>from nowhere</p>' } }),
      );
    });

    expect(onEdited).not.toHaveBeenCalled();
  });

  it('does not reload the page it came from', () => {
    /**
     * The heart of it. Setting a frame's document reloads it, so writing an
     * edit straight back would throw away the caret, the scroll position and
     * the edit itself as it was made — the block would fight every keystroke.
     */
    const onEdited = vi.fn();
    const { rerender } = render(
      <HtmlLayer
        document={document_}
        editingId="block"
        onEdited={onEdited}
        viewport={INITIAL_VIEWPORT}
      />,
    );
    const before = frameOf().getAttribute('srcdoc');

    fromPage(frameOf(), { kind: HTML_MESSAGE, html: '<h1>Studio</h1>' });
    const edited = createDocument({
      objects: [createHtml('<h1>Studio</h1>', '', { id: 'block', name: 'Block' })],
    });
    rerender(
      <HtmlLayer
        document={edited}
        editingId="block"
        onEdited={onEdited}
        viewport={INITIAL_VIEWPORT}
      />,
    );

    expect(frameOf().getAttribute('srcdoc')).toBe(before);
  });

  it('does rebuild the page for a change from anywhere else', () => {
    // The markup panel, an undo, a preset: those have to reach the block.
    const { rerender } = render(
      <HtmlLayer document={document_} editingId={null} viewport={INITIAL_VIEWPORT} />,
    );
    const before = frameOf().getAttribute('srcdoc');

    const elsewhere = createDocument({
      objects: [createHtml('<h1>From the panel</h1>', '', { id: 'block', name: 'Block' })],
    });
    rerender(<HtmlLayer document={elsewhere} editingId={null} viewport={INITIAL_VIEWPORT} />);

    expect(frameOf().getAttribute('srcdoc')).not.toBe(before);
    expect(frameOf().getAttribute('srcdoc')).toContain('From the panel');
  });
});
