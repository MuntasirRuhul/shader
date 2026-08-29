import { createRectangle, resetObjectIds, updateObject } from '@shader/core';
import { act, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore } from './editorStore';
import { TransientChannel } from './transientChannel';
import { useTransientDrag, type DragHandle } from './useTransientDrag';

let store: ReturnType<typeof createEditorStore>;
let channel: TransientChannel;

beforeEach(() => {
  resetObjectIds();
  store = createEditorStore();
  channel = new TransientChannel();
  store.getState().addObject(createRectangle({ id: 'a', x: 0 }));
});

describe('the channel carries intermediate values', () => {
  it('notifies subscribers on each push', () => {
    const listener = vi.fn();
    channel.subscribe(listener);

    channel.begin();
    channel.push({ objectId: 'a', key: 'x', value: 10 });
    channel.push({ objectId: 'a', key: 'x', value: 20 });

    // Beginning a drag publishes nothing; only values do.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps only the latest value per key', () => {
    channel.begin();
    channel.push({ objectId: 'a', key: 'x', value: 10 });
    channel.push({ objectId: 'a', key: 'x', value: 20 });

    expect(channel.currentEdits).toEqual([{ objectId: 'a', key: 'x', value: 20 }]);
  });

  it('accumulates separate keys', () => {
    channel.begin();
    channel.push({ objectId: 'a', key: 'x', value: 10 });
    channel.push({ objectId: 'a', key: 'y', value: 5 });

    expect(channel.currentEdits).toHaveLength(2);
  });

  it('ignores a push outside a drag', () => {
    channel.push({ objectId: 'a', key: 'x', value: 10 });

    expect(channel.currentEdits).toEqual([]);
  });

  it('hands back the accumulated values on end', () => {
    channel.begin();
    channel.push({ objectId: 'a', key: 'x', value: 42 });

    expect(channel.end()).toEqual([{ objectId: 'a', key: 'x', value: 42 }]);
  });

  it('discards the values on cancel', () => {
    channel.begin();
    channel.push({ objectId: 'a', key: 'x', value: 42 });
    channel.cancel();

    expect(channel.currentEdits).toEqual([]);
    expect(channel.isDragging).toBe(false);
  });

  it('stops notifying an unsubscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    unsubscribe();

    channel.begin();
    channel.push({ objectId: 'a', key: 'x', value: 1 });

    expect(listener).not.toHaveBeenCalled();
  });
});

/**
 * A component that reads the store, so its render count reveals exactly when
 * React is involved during a drag.
 */
function DragProbe({ onHandle }: { onHandle: (h: DragHandle) => void }) {
  const x = store((state) => state.document.objects[0]?.x ?? 0);

  const handle = useTransientDrag({
    label: 'Move',
    channel,
    store: () => store.getState(),
    commit: (edits, editorState) => {
      editorState.edit('Move', (document) =>
        edits.reduce(
          (doc, edit) => updateObject(doc, edit.objectId, { [edit.key]: edit.value as number }),
          document,
        ),
      );
    },
  });

  onHandle(handle);
  return <span data-testid="x">{x}</span>;
}

/**
 * React's Profiler reports each committed render, which is exactly the
 * question: did the drag involve React at all?
 */
function renderProbe() {
  const commits = { count: 0 };
  let handle: DragHandle | undefined;

  render(
    <Profiler
      id="drag-probe"
      onRender={() => {
        commits.count += 1;
      }}
    >
      <DragProbe
        onHandle={(h) => {
          handle = h;
        }}
      />
    </Profiler>,
  );

  if (!handle) throw new Error('handle was not provided');
  return { renders: commits, handle };
}

describe('a continuous drag bypasses React', () => {
  it('does not re-render between drag start and end', () => {
    const { renders, handle } = renderProbe();
    const rendersAtStart = renders.count;

    act(() => {
      handle.begin();
      for (let value = 1; value <= 25; value += 1) {
        handle.move({ objectId: 'a', key: 'x', value });
      }
    });

    expect(renders.count).toBe(rendersAtStart);
  });

  it('still delivers every intermediate value to a subscriber', () => {
    const seen: unknown[] = [];
    channel.subscribe((edits) => {
      if (edits[0]) seen.push(edits[0].value);
    });
    const { handle } = renderProbe();

    act(() => {
      handle.begin();
      handle.move({ objectId: 'a', key: 'x', value: 5 });
      handle.move({ objectId: 'a', key: 'x', value: 15 });
    });

    expect(seen).toEqual([5, 15]);
  });

  it('re-renders once when the drag ends', () => {
    const { renders, handle } = renderProbe();

    act(() => {
      handle.begin();
      handle.move({ objectId: 'a', key: 'x', value: 10 });
      handle.move({ objectId: 'a', key: 'x', value: 90 });
    });
    const beforeCommit = renders.count;

    act(() => {
      handle.end();
    });

    expect(renders.count).toBe(beforeCommit + 1);
    expect(screen.getByTestId('x')).toHaveTextContent('90');
  });
});

describe('a continuous drag is one undo step', () => {
  it('records exactly one history entry for a many-value drag', () => {
    const { handle } = renderProbe();
    const undosBefore = store.getState().history.past.length;

    act(() => {
      handle.begin();
      for (let value = 1; value <= 40; value += 1) {
        handle.move({ objectId: 'a', key: 'x', value });
      }
      handle.end();
    });

    expect(store.getState().history.past.length).toBe(undosBefore + 1);
  });

  it('undoes the whole drag in one step', () => {
    const { handle } = renderProbe();

    act(() => {
      handle.begin();
      handle.move({ objectId: 'a', key: 'x', value: 10 });
      handle.move({ objectId: 'a', key: 'x', value: 50 });
      handle.move({ objectId: 'a', key: 'x', value: 120 });
      handle.end();
    });
    expect(store.getState().document.objects[0]?.x).toBe(120);

    act(() => {
      store.getState().undo();
    });

    expect(store.getState().document.objects[0]?.x).toBe(0);
  });

  it('writes nothing to the document until the drag ends', () => {
    const { handle } = renderProbe();

    act(() => {
      handle.begin();
      handle.move({ objectId: 'a', key: 'x', value: 77 });
    });

    expect(store.getState().document.objects[0]?.x).toBe(0);
  });

  it('records nothing when a drag is cancelled', () => {
    const { handle } = renderProbe();
    const undosBefore = store.getState().history.past.length;

    act(() => {
      handle.begin();
      handle.move({ objectId: 'a', key: 'x', value: 33 });
      handle.cancel();
    });

    expect(store.getState().history.past.length).toBe(undosBefore);
    expect(store.getState().document.objects[0]?.x).toBe(0);
  });

  it('records nothing for a drag that moved nowhere', () => {
    const { handle } = renderProbe();
    const undosBefore = store.getState().history.past.length;

    act(() => {
      handle.begin();
      handle.end();
    });

    expect(store.getState().history.past.length).toBe(undosBefore);
  });
});
