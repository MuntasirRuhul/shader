import { createDocument, createRectangle } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { cursorFor, IDLE, onPointerDown, type Gesture } from './interaction';
import { commandFor, isPanModifier, PAN_MODIFIER_KEY } from './keyboard';

/**
 * Panning without leaving the active tool, and the two framing commands.
 *
 * The rules are pure functions so the whole of "what does this keystroke mean"
 * is testable without a DOM — including the part that matters most, which is
 * every case where space must stay a character.
 */

const context = (over: Partial<Parameters<typeof isPanModifier>[0]> = {}) => ({
  key: PAN_MODIFIER_KEY,
  shiftKey: false,
  accelKey: false,
  textEntryFocused: false,
  ...over,
});

describe('space means pan, except when it means a space', () => {
  it('is the pan modifier on the canvas', () => {
    expect(isPanModifier(context())).toBe(true);
  });

  it('is not the pan modifier while text is being edited', () => {
    // The whole reason this is a separate rule: a space typed into a text
    // object must reach the text object.
    expect(isPanModifier(context({ textEntryFocused: true }))).toBe(false);
  });

  it('is not the pan modifier as part of an accelerator', () => {
    expect(isPanModifier(context({ accelKey: true }))).toBe(false);
  });

  it('is no other key', () => {
    for (const key of ['v', 'r', 't', 'Enter', 'Shift', 'Escape', 'Spacebar']) {
      expect(isPanModifier(context({ key })), key).toBe(false);
    }
  });

  it('is not a command, so it triggers nothing on the keystroke itself', () => {
    // Holding it changes what dragging means; pressing it does nothing.
    expect(commandFor(context())).toBeNull();
    expect(commandFor(context({ textEntryFocused: true }))).toBeNull();
  });
});

describe('a drag while the modifier is held pans, whatever the tool', () => {
  const start = (tool: 'select' | 'shape' | 'text', panning: boolean) =>
    onPointerDown({
      tool,
      shape: 'rectangle',
      point: { x: 40, y: 40 },
      document: createDocument(),
      selection: [],
      additive: false,
      panning,
    });

  it.each(['select', 'shape', 'text'] as const)('pans with the %s tool active', (tool) => {
    expect(start(tool, true).gesture.kind).toBe('pan');
  });

  it.each(['select', 'shape', 'text'] as const)('does the %s tool own thing otherwise', (tool) => {
    expect(start(tool, false).gesture.kind).not.toBe('pan');
  });

  it('selects nothing when a pan begins over an object', () => {
    const document = createDocument({
      objects: [createRectangle({ x: 0, y: 0, width: 200, height: 200 })],
    });

    const result = onPointerDown({
      tool: 'select',
      shape: 'rectangle',
      point: { x: 40, y: 40 },
      document,
      selection: [],
      additive: false,
      panning: true,
    });

    expect(result.gesture.kind).toBe('pan');
    expect(result.selection ?? []).toEqual([]);
  });
});

describe('the pointer says what a drag will do', () => {
  const panGesture: Gesture = {
    kind: 'pan',
    origin: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
  };

  it('offers to pan while the modifier is held', () => {
    expect(cursorFor('select', false, IDLE, true)).toBe('grab');
  });

  it('says it is panning during the drag', () => {
    expect(cursorFor('select', false, panGesture, true)).toBe('grabbing');
  });

  it('outranks the tool cursor, since the tool is suspended', () => {
    expect(cursorFor('shape', false, IDLE, true)).toBe('grab');
    expect(cursorFor('text', false, IDLE, true)).toBe('grab');
    expect(cursorFor('select', true, IDLE, true)).toBe('grab');
  });

  it('returns to the tool cursor when the modifier is released', () => {
    expect(cursorFor('shape', false, IDLE, false)).toBe('crosshair');
    expect(cursorFor('text', false, IDLE, false)).toBe('text');
    expect(cursorFor('select', true, IDLE, false)).toBe('move');
  });
});

describe('framing is two commands, not one that guesses', () => {
  const key = (k: string) =>
    commandFor({ key: k, shiftKey: true, accelKey: false, textEntryFocused: false });

  it('fits everything on one key', () => {
    expect(key('1')).toEqual({ kind: 'zoom-to-fit' });
  });

  it('frames the selection on another', () => {
    expect(key('2')).toEqual({ kind: 'zoom-to-selection' });
  });

  it('returns to actual size on a third', () => {
    expect(key('0')).toEqual({ kind: 'zoom-reset' });
  });

  it('offers none of them while typing', () => {
    for (const k of ['0', '1', '2']) {
      expect(
        commandFor({ key: k, shiftKey: true, accelKey: false, textEntryFocused: true }),
      ).toBeNull();
    }
  });
});
