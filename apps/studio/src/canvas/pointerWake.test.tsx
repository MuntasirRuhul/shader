import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument, createRectangle, shaderFill } from '@shader/core';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../store/editorStore';
import { INITIAL_VIEWPORT } from '../store/slices';
import { buildScene } from './buildScene';
import { useCanvasPointer } from './useCanvasPointer';

/**
 * The pointer reaching a shader that reacts to it.
 *
 * Everything for this existed and none of it was connected: the scene builder
 * put the pointer into each object's own frame, the runtime handed it to every
 * advance, and the canvas never supplied one — so the water ripple's wake, the
 * whole point of the shader, did nothing. The same seam has now swallowed a
 * mask, an image, and this.
 */

const object = createRectangle({ id: 'a', fill: shaderFill('water-ripple') });
const document_ = createDocument({ objects: [object] });

function stateWith(): EditorState {
  return {
    document: document_,
    viewport: INITIAL_VIEWPORT,
    selection: [],
    tool: { active: 'select', editingTextId: null },
    select: () => undefined,
    selectMany: () => undefined,
    clearSelection: () => undefined,
  } as unknown as EditorState;
}

/** A pointer event over an element whose box starts at the origin. */
function moveTo(x: number, y: number) {
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => undefined,
    dataset: {},
  };

  return {
    clientX: x,
    clientY: y,
    button: 0,
    shiftKey: false,
    altKey: false,
    pointerId: 1,
    currentTarget: element,
    target: element,
  } as never;
}

describe('hovering the canvas', () => {
  it('reports where the pointer is, in canvas coordinates', () => {
    const onHover = vi.fn();
    const { result } = renderHook(() => useCanvasPointer(stateWith, { onHover }));

    result.current.onPointerMove(moveTo(240, 180));

    expect(onHover).toHaveBeenCalledWith({ x: 240, y: 180 });
  });

  it('reports it gone when the pointer leaves', () => {
    const onHover = vi.fn();
    const { result } = renderHook(() => useCanvasPointer(stateWith, { onHover }));

    result.current.onPointerMove(moveTo(240, 180));
    result.current.onPointerLeave();

    expect(onHover).toHaveBeenLastCalledWith(undefined);
  });

  it('reports it while a gesture is under way, not only when idle', () => {
    // A wake follows the cursor whether or not something is being dragged.
    const onHover = vi.fn();
    const { result } = renderHook(() => useCanvasPointer(stateWith, { onHover }));

    result.current.onPointerDown(moveTo(120, 120));
    result.current.onPointerMove(moveTo(200, 160));

    expect(onHover).toHaveBeenLastCalledWith({ x: 200, y: 160 });
  });
});

describe('what the shader is then told', () => {
  it('is the pointer in the object own frame', () => {
    const seeded = createDocument({
      objects: [createRectangle({ id: 'a', x: 100, y: 100, width: 200, height: 100 })],
    });

    const [item] = buildScene(seeded, { pointer: { x: 150, y: 125 } }).items;

    expect(item?.pointer).toEqual({ present: true, x: 0.25, y: 0.25 });
  });

  it('is absent once the pointer has gone', () => {
    const [item] = buildScene(document_, { pointer: undefined }).items;

    expect(item?.pointer?.present).toBe(false);
  });
});

describe('the canvas is actually told where the pointer is', () => {
  // The wiring no unit test reaches: the hook owns a renderer and needs a
  // graphics context. It was missing entirely, and nothing failed.
  it('the canvas hook supplies a pointer to the scene, and a way to set it', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'useShaderCanvas.ts'),
      'utf8',
    );

    expect(source).toMatch(/pointer: pointerRef\.current/);
    expect(source).toMatch(/setPointer/);
  });

  it('the stage hands that to the pointer handlers', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'CanvasStage.tsx'),
      'utf8',
    );

    expect(source).toMatch(/onHover: setPointer/);
    expect(source).toMatch(/onPointerLeave=\{pointer\.onPointerLeave\}/);
  });
});
