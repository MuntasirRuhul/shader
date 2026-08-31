import {
  createDocument,
  createHtml,
  createRectangle,
  isHtmlObject,
  resetObjectIds,
} from '@shader/core';
import { TooltipProvider } from '@shader/design-system';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../store/editorStore';
import { CodePanel } from './CodePanel';

/**
 * The markup panel: where a block is written, and where a pasted one lands.
 */

function blocks() {
  return useEditorStore.getState().document.objects.filter(isHtmlObject);
}

/** The panel as the toolbar renders it: its trigger carries a tooltip. */
function renderPanel() {
  return render(
    <TooltipProvider>
      <CodePanel />
    </TooltipProvider>,
  );
}

async function openPanel() {
  const user = userEvent.setup();
  renderPanel();
  await user.click(screen.getByRole('button', { name: 'Markup' }));
  return user;
}

beforeEach(() => {
  resetObjectIds();
  useEditorStore.getState().replaceDocument(createDocument());
});

describe('writing markup with nothing selected', () => {
  it('offers to place it, and does', async () => {
    const user = await openPanel();

    await user.click(screen.getByRole('button', { name: 'Place on canvas' }));

    expect(blocks()).toHaveLength(1);
    expect(blocks()[0]?.html).toContain('<div class="card">');
  });

  it('selects what it placed, so the next edit goes to it', async () => {
    const user = await openPanel();

    await user.click(screen.getByRole('button', { name: 'Place on canvas' }));

    expect(useEditorStore.getState().selection).toEqual([blocks()[0]?.id]);
  });

  it('says the block is not on the canvas yet', async () => {
    await openPanel();

    expect(screen.getByText('Not on the canvas yet')).toBeInTheDocument();
  });
});

describe('editing the block that is selected', () => {
  beforeEach(() => {
    const state = useEditorStore.getState();
    const block = createHtml('<p>first</p>', 'p { color: red; }', { id: 'block', name: 'Block' });
    state.replaceDocument(createDocument({ objects: [block] }));
    state.select('block');
  });

  it('shows what that block holds, not the starter', async () => {
    await openPanel();

    expect(screen.getByRole('textbox', { name: 'HTML' })).toHaveValue('<p>first</p>');
    expect(screen.getByText('Block')).toBeInTheDocument();
  });

  it('writes what is typed, once the typing stops', async () => {
    const user = await openPanel();

    await user.clear(screen.getByRole('textbox', { name: 'HTML' }));
    await user.type(screen.getByRole('textbox', { name: 'HTML' }), '<p>second</p>');

    await waitFor(() => {
      expect(blocks()[0]?.html).toBe('<p>second</p>');
    });
  });

  it('holds what is typed back until the typing stops', async () => {
    // Each write reloads the block's frame, and reloading it per keystroke
    // makes the canvas flicker and loses whatever the markup was running.
    const user = await openPanel();

    await user.type(screen.getByRole('textbox', { name: 'HTML' }), '<p>more</p>');

    expect(blocks()[0]?.html).toBe('<p>first</p>');
  });

  it('edits the styles under their own tab', async () => {
    const user = await openPanel();
    await user.click(screen.getByRole('tab', { name: 'CSS' }));

    await user.clear(screen.getByRole('textbox', { name: 'CSS' }));
    // Pasted rather than typed, which is how styles actually arrive here, and
    // which spares the test escaping every brace.
    await user.click(screen.getByRole('textbox', { name: 'CSS' }));
    await user.paste('p { color: blue; }');

    await waitFor(() => {
      expect(blocks()[0]?.css).toBe('p { color: blue; }');
    });
    expect(blocks()[0]?.html).toBe('<p>first</p>');
  });

  it('does not write anything merely by being opened', async () => {
    // An edit here would put "Edit markup" on the undo stack for a panel
    // somebody only glanced at.
    await openPanel();

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(useEditorStore.getState().canUndo()).toBe(false);
  });

  it('keeps the canvas shortcuts out of the editor', async () => {
    // Delete removes the selection on the canvas; while writing markup it has
    // to mean the key it is.
    const user = await openPanel();
    const editor = screen.getByRole('textbox', { name: 'HTML' });

    await user.click(editor);
    await user.keyboard('{Delete}');

    expect(blocks()).toHaveLength(1);
  });
});

describe('a block that is not markup', () => {
  it('is treated as nothing selected', async () => {
    const state = useEditorStore.getState();
    state.replaceDocument(createDocument({ objects: [createRectangle({ id: 'shape' })] }));
    state.select('shape');

    await openPanel();

    expect(screen.getByText('Not on the canvas yet')).toBeInTheDocument();
  });
});
