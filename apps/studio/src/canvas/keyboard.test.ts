import { describe, expect, it } from 'vitest';
import {
  COARSE_NUDGE_STEP,
  commandFor,
  isTextEntryFocused,
  NUDGE_STEP,
  type KeyContext,
} from './keyboard';

function press(overrides: Partial<KeyContext> & { key: string }): KeyContext {
  return { shiftKey: false, accelKey: false, textEntryFocused: false, ...overrides };
}

describe('recognising a text entry', () => {
  it('treats a text input as one', () => {
    const input = document.createElement('input');
    input.type = 'text';

    expect(isTextEntryFocused(input)).toBe(true);
  });

  it('treats an input with no explicit type as one', () => {
    expect(isTextEntryFocused(document.createElement('input'))).toBe(true);
  });

  it('treats a textarea as one', () => {
    expect(isTextEntryFocused(document.createElement('textarea'))).toBe(true);
  });

  it('treats a contenteditable element as one', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });

    expect(isTextEntryFocused(editable)).toBe(true);
  });

  it('does not treat a button input as one', () => {
    const input = document.createElement('input');
    input.type = 'button';

    expect(isTextEntryFocused(input)).toBe(false);
  });

  it('does not treat a range input as one, so sliders keep shortcuts alive', () => {
    const input = document.createElement('input');
    input.type = 'range';

    expect(isTextEntryFocused(input)).toBe(false);
  });

  it('does not treat a plain element as one', () => {
    expect(isTextEntryFocused(document.createElement('div'))).toBe(false);
  });

  it('handles nothing being focused', () => {
    expect(isTextEntryFocused(null)).toBe(false);
  });
});

describe('tool shortcuts', () => {
  it.each([
    ['v', 'select'],
    ['r', 'shape'],
    ['t', 'text'],
  ])('%s activates the %s tool', (key, tool) => {
    expect(commandFor(press({ key }))).toEqual({ kind: 'tool', tool });
  });

  it('accepts an uppercase key', () => {
    expect(commandFor(press({ key: 'V' }))).toEqual({ kind: 'tool', tool: 'select' });
  });

  it('ignores a key that is not bound', () => {
    expect(commandFor(press({ key: 'q' }))).toBeNull();
  });
});

describe('moving the selection', () => {
  it('nudges by a fine step', () => {
    expect(commandFor(press({ key: 'ArrowRight' }))).toEqual({
      kind: 'nudge',
      dx: NUDGE_STEP,
      dy: 0,
    });
  });

  it('nudges by a coarse step with shift', () => {
    expect(commandFor(press({ key: 'ArrowDown', shiftKey: true }))).toEqual({
      kind: 'nudge',
      dx: 0,
      dy: COARSE_NUDGE_STEP,
    });
  });

  it('moves in each direction', () => {
    expect(commandFor(press({ key: 'ArrowLeft' }))).toMatchObject({ dx: -NUDGE_STEP, dy: 0 });
    expect(commandFor(press({ key: 'ArrowUp' }))).toMatchObject({ dx: 0, dy: -NUDGE_STEP });
  });
});

describe('deleting and dismissing', () => {
  it('deletes on Delete', () => {
    expect(commandFor(press({ key: 'Delete' }))).toEqual({ kind: 'delete' });
  });

  it('deletes on Backspace', () => {
    expect(commandFor(press({ key: 'Backspace' }))).toEqual({ kind: 'delete' });
  });

  it('clears the selection on Escape', () => {
    expect(commandFor(press({ key: 'Escape' }))).toEqual({ kind: 'clear-selection' });
  });
});

describe('undo and redo', () => {
  it('undoes with the accelerator', () => {
    expect(commandFor(press({ key: 'z', accelKey: true }))).toEqual({ kind: 'undo' });
  });

  it('redoes with shift', () => {
    expect(commandFor(press({ key: 'z', accelKey: true, shiftKey: true }))).toEqual({
      kind: 'redo',
    });
  });

  it('redoes with the alternative binding', () => {
    expect(commandFor(press({ key: 'y', accelKey: true }))).toEqual({ kind: 'redo' });
  });

  it('ignores other accelerator combinations, leaving them to the browser', () => {
    expect(commandFor(press({ key: 's', accelKey: true }))).toBeNull();
    expect(commandFor(press({ key: 'a', accelKey: true }))).toBeNull();
  });
});

describe('shortcuts are suppressed while typing', () => {
  it.each(['v', 'r', 't'])('does not switch tools on %s', (key) => {
    expect(commandFor(press({ key, textEntryFocused: true }))).toBeNull();
  });

  it('does not delete the selection on Delete', () => {
    expect(commandFor(press({ key: 'Delete', textEntryFocused: true }))).toBeNull();
  });

  it('does not delete the selection on Backspace', () => {
    expect(commandFor(press({ key: 'Backspace', textEntryFocused: true }))).toBeNull();
  });

  it('does not move the selection with arrow keys', () => {
    expect(commandFor(press({ key: 'ArrowLeft', textEntryFocused: true }))).toBeNull();
    expect(
      commandFor(press({ key: 'ArrowRight', shiftKey: true, textEntryFocused: true })),
    ).toBeNull();
  });

  it('does not clear the selection on Escape', () => {
    expect(commandFor(press({ key: 'Escape', textEntryFocused: true }))).toBeNull();
  });

  it('still allows undo, which the browser routes to the field', () => {
    expect(commandFor(press({ key: 'z', accelKey: true, textEntryFocused: true }))).toEqual({
      kind: 'undo',
    });
  });
});

describe('view shortcuts', () => {
  it('fits the content into view', () => {
    expect(commandFor(press({ key: '1', shiftKey: true }))).toEqual({ kind: 'zoom-to-fit' });
  });

  it('returns to actual size', () => {
    expect(commandFor(press({ key: '0', shiftKey: true }))).toEqual({ kind: 'zoom-reset' });
  });

  it('needs the modifier, so plain digits stay free', () => {
    expect(commandFor(press({ key: '1' }))).toBeNull();
  });

  it('is suppressed while typing', () => {
    expect(commandFor(press({ key: '1', shiftKey: true, textEntryFocused: true }))).toBeNull();
  });
});
