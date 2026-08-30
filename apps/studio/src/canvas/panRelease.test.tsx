import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../store/editorStore';
import { INITIAL_VIEWPORT } from '../store/slices';
import { useCanvasPointer } from './useCanvasPointer';

/**
 * Releasing the pan modifier mid-drag.
 *
 * The awkward case, and the reason this is tested rather than reasoned about:
 * the pan ends, but the pointer is still down, and the release that eventually
 * arrives must not be handed to the active tool as though it had begun the
 * gesture. With the text tool active that would drop a text object wherever
 * the pan happened to finish.
 */

const addObject = vi.fn();
const panBy = vi.fn();
const beginTextEditing = vi.fn();
const setTool = vi.fn();
const selectMany = vi.fn();

let tool: 'select' | 'shape' | 'text' = 'select';

function store(): EditorState {
  return {
    document: { version: 1, objects: [] },
    selection: [],
    viewport: INITIAL_VIEWPORT,
    tool: { active: tool, shape: 'rectangle', editingTextId: null },
    addObject,
    panBy,
    beginTextEditing,
    setTool,
    selectMany,
  } as unknown as EditorState;
}

/** A pointer event carrying only what the handlers actually read. */
function pointerEvent(over: Record<string, unknown> = {}) {
  const element = {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };

  return {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
    shiftKey: false,
    altKey: false,
    currentTarget: element,
    target: { dataset: {} },
    ...over,
  } as never;
}

function pressSpace() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
}

function releaseSpace() {
  window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tool = 'select';
  releaseSpace();
});

describe('holding the modifier turns a drag into a pan', () => {
  it('offers to pan as soon as it is held', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      pressSpace();
    });

    expect(result.current.cursor).toBe('grab');
  });

  it('pans on a drag, and edits nothing', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      pressSpace();
    });
    act(() => {
      result.current.onPointerDown(pointerEvent());
    });

    expect(result.current.gesture.kind).toBe('pan');
    expect(result.current.cursor).toBe('grabbing');

    act(() => {
      result.current.onPointerMove(pointerEvent({ clientX: 160, clientY: 130 }));
    });

    expect(panBy).toHaveBeenCalled();
    expect(addObject).not.toHaveBeenCalled();
  });

  it('lets go of the modifier when the window loses focus', () => {
    // A modifier left stuck down would leave the canvas permanently undraggable.
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      pressSpace();
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.cursor).not.toBe('grab');
  });
});

describe('releasing the modifier mid-drag', () => {
  it('ends the pan there and then', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      pressSpace();
    });
    act(() => {
      result.current.onPointerDown(pointerEvent());
    });
    expect(result.current.gesture.kind).toBe('pan');

    act(() => {
      releaseSpace();
    });

    expect(result.current.gesture.kind).toBe('idle');
  });

  it('leaves no gesture for the active tool to inherit', () => {
    tool = 'text';
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      pressSpace();
    });
    act(() => {
      result.current.onPointerDown(pointerEvent());
    });
    act(() => {
      releaseSpace();
    });
    act(() => {
      result.current.onPointerUp(pointerEvent());
    });

    // Without this, the text tool would take the abandoned release as its own
    // and drop an object where the pan ended.
    expect(addObject).not.toHaveBeenCalled();
    expect(beginTextEditing).not.toHaveBeenCalled();
  });

  it('lets the tool work normally on the next gesture', () => {
    tool = 'text';
    const { result } = renderHook(() => useCanvasPointer(store));

    act(() => {
      pressSpace();
    });
    act(() => {
      result.current.onPointerDown(pointerEvent());
    });
    act(() => {
      releaseSpace();
    });
    act(() => {
      result.current.onPointerUp(pointerEvent());
    });

    // A fresh press and release, with the modifier no longer held.
    act(() => {
      result.current.onPointerDown(pointerEvent());
    });
    act(() => {
      result.current.onPointerUp(pointerEvent());
    });

    expect(addObject).toHaveBeenCalledTimes(1);
  });
});

describe('the modifier while text is being edited', () => {
  it('does not arm panning, so a space types a space', () => {
    const { result } = renderHook(() => useCanvasPointer(store));

    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();

    act(() => {
      pressSpace();
    });

    expect(result.current.cursor).not.toBe('grab');

    field.remove();
  });

  it('does not swallow the keystroke', () => {
    renderHook(() => useCanvasPointer(store));

    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    // Left to the text field, which is the only thing that should hear it.
    expect(event.defaultPrevented).toBe(false);

    field.remove();
  });

  it('stops the page scrolling when it is a modifier', () => {
    renderHook(() => useCanvasPointer(store));

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });
});
