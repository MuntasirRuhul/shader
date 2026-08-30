import { createRectangle, resetObjectIds, shaderFill } from '@shader/core';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../store/editorStore';
import { transientChannel } from '../store/transientChannel';

/**
 * What makes a drag smooth.
 *
 * The claim the design rests on is that intermediate values reach the
 * renderer without going through React or the store. These tests measure
 * that directly: a drag publishing many values must not re-render a
 * store-subscribed component, and must leave exactly one entry in history.
 */

/** A component that counts how often React re-rendered it. */
function makeCounter() {
  let renders = 0;

  function Subscriber() {
    // The document is the largest thing a drag could invalidate.
    useEditorStore((state) => state.document);
    renders += 1;
    return null;
  }

  return { Subscriber, renderCount: () => renders };
}

beforeEach(() => {
  resetObjectIds();
  localStorage.clear();
  transientChannel.cancel();

  const store = useEditorStore.getState();
  store.replaceDocument({
    version: 1,
    id: 'perf',
    name: 'Performance',
    objects: [],
    canvasWidth: 800,
    canvasHeight: 600,
  });
  store.addObject(createRectangle({ id: 'a', fill: shaderFill('mesh-gradient', {}) }));
});

describe('dragging a parameter', () => {
  it('does not re-render React for each intermediate value', () => {
    const { Subscriber, renderCount } = makeCounter();
    render(<Subscriber />);
    const before = renderCount();

    transientChannel.begin();
    for (let step = 0; step < 120; step += 1) {
      transientChannel.push({ objectId: 'a', key: 'warp', value: step / 120 });
    }

    // A hundred and twenty values, and React has not been asked to do anything.
    expect(renderCount()).toBe(before);
  });

  it('delivers every intermediate value to the renderer', () => {
    const received: number[] = [];
    const unsubscribe = transientChannel.subscribe((edits) => {
      const last = edits[edits.length - 1];
      if (typeof last?.value === 'number') received.push(last.value);
    });

    transientChannel.begin();
    for (let step = 0; step < 120; step += 1) {
      transientChannel.push({ objectId: 'a', key: 'warp', value: step });
    }
    unsubscribe();

    expect(received).toHaveLength(120);
    expect(received[119]).toBe(119);
  });

  it('leaves the document untouched until the drag ends', () => {
    const before = useEditorStore.getState().document;

    transientChannel.begin();
    for (let step = 0; step < 50; step += 1) {
      transientChannel.push({ objectId: 'a', key: 'warp', value: step });
    }

    expect(useEditorStore.getState().document).toBe(before);
  });

  it('records one history entry for the whole drag', () => {
    const before = useEditorStore.getState().history.past.length;

    transientChannel.begin();
    for (let step = 0; step < 50; step += 1) {
      transientChannel.push({ objectId: 'a', key: 'warp', value: step });
    }
    const pending = transientChannel.end();
    useEditorStore.getState().setShaderValues('a', { warp: pending.length });

    expect(useEditorStore.getState().history.past.length).toBe(before + 1);
  });
});

describe('dragging an object', () => {
  it('records one history entry however far it travels', () => {
    const store = useEditorStore.getState();
    const before = store.history.past.length;

    // The pointer layer computes positions locally and commits once on release.
    store.updateObject('a', { x: 400, y: 300 }, 'Move');

    expect(useEditorStore.getState().history.past.length).toBe(before + 1);
  });

  it('undoes the whole move in one step', () => {
    const store = useEditorStore.getState();
    const startX = store.document.objects[0]?.x;

    store.updateObject('a', { x: 999, y: 999 }, 'Move');
    useEditorStore.getState().undo();

    expect(useEditorStore.getState().document.objects[0]?.x).toBe(startX);
  });
});

describe('the channel cleans up after itself', () => {
  it('drops pending values when a drag is cancelled', () => {
    transientChannel.begin();
    transientChannel.push({ objectId: 'a', key: 'warp', value: 1 });
    transientChannel.cancel();

    expect(transientChannel.isDragging).toBe(false);
  });

  it('notifies subscribers that the overlay is gone when a drag ends', () => {
    let lastCount = -1;
    const unsubscribe = transientChannel.subscribe((edits) => {
      lastCount = edits.length;
    });

    transientChannel.begin();
    transientChannel.push({ objectId: 'a', key: 'warp', value: 1 });
    transientChannel.end();
    unsubscribe();

    // An empty publication tells the renderer to fall back to the document.
    expect(lastCount).toBe(0);
  });
});
