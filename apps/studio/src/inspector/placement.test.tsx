import { createDocument, createRectangle, resetObjectIds } from '@shader/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../store/editorStore';
import { Placement } from './Placement';

/**
 * Sizing an object by typing.
 *
 * Dragging a handle cannot make anything larger than the part of the canvas
 * on screen — the drag ends where the window does — so a page taller than the
 * display could not be made at all.
 */

const object = createRectangle({ id: 'a', x: 40, y: 60, width: 200, height: 120 });

function current() {
  const found = useEditorStore.getState().document.objects[0];
  if (!found) throw new Error('expected the object to still be there');
  return found;
}

async function typeInto(label: string, value: string) {
  const field = screen.getByRole('textbox', { name: label });
  await userEvent.clear(field);
  await userEvent.type(field, value);
  await userEvent.tab();
}

beforeEach(() => {
  resetObjectIds();
  useEditorStore.getState().replaceDocument(createDocument({ objects: [object] }));
});

describe('typing a size', () => {
  it('makes an object taller than anything a drag could reach', async () => {
    render(<Placement object={object} />);

    await typeInto('Height', '3000');

    expect(current().height).toBe(3000);
  });

  it('sets width, and leaves everything else where it was', async () => {
    render(<Placement object={object} />);

    await typeInto('Width', '820');

    expect(current()).toMatchObject({ width: 820, height: 120, x: 40, y: 60 });
  });

  it('moves an object to an exact position', async () => {
    render(<Placement object={object} />);

    await typeInto('X position', '15');
    await typeInto('Y position', '900');

    expect(current()).toMatchObject({ x: 15, y: 900 });
  });

  it('refuses to size anything to nothing', async () => {
    // A zero-width object cannot be grabbed again once it is let go.
    render(<Placement object={object} />);

    await typeInto('Width', '0');

    expect(current().width).toBeGreaterThan(0);
  });

  it('states rotation in degrees, and stores it in radians', async () => {
    render(<Placement object={object} />);

    await typeInto('Rotation', '90');

    expect(current().rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it('shows what a drag left behind, in whole numbers', () => {
    useEditorStore.getState().updateObject('a', { width: 693.4213, height: 476.87 });
    const dragged = current();

    render(<Placement object={dragged} />);

    expect(screen.getByRole('textbox', { name: 'Width' })).toHaveValue('693');
    expect(screen.getByRole('textbox', { name: 'Height' })).toHaveValue('477');
  });
});
