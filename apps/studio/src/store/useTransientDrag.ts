import { useCallback, useRef } from 'react';
import type { EditorState } from './editorStore';
import { transientChannel, type TransientEdit } from './transientChannel';

export interface DragHandle {
  /** Begins a drag. Nothing is written to the document yet. */
  readonly begin: () => void;
  /** Publishes an intermediate value. The canvas updates; React does not. */
  readonly move: (edit: TransientEdit) => void;
  /** Ends the drag, committing everything as one undoable edit. */
  readonly end: () => void;
  readonly cancel: () => void;
}

export interface UseTransientDragOptions {
  readonly label: string;
  /** Turns the accumulated values into a single document edit. */
  readonly commit: (edits: readonly TransientEdit[], store: EditorState) => void;
  readonly store: () => EditorState;
  readonly channel?: TransientChannelLike;
}

export interface TransientChannelLike {
  begin: () => void;
  push: (edit: TransientEdit) => void;
  end: () => readonly TransientEdit[];
  cancel: () => void;
}

/**
 * Drives a continuous drag through the transient channel.
 *
 * Between `begin` and `end` no store write happens, so React does not
 * re-render and no history entry is recorded. On `end`, everything that
 * accumulated is committed at once — one re-render, one undo step.
 */
export function useTransientDrag(options: UseTransientDragOptions): DragHandle {
  const channel = options.channel ?? transientChannel;
  const dragging = useRef(false);

  const begin = useCallback(() => {
    dragging.current = true;
    channel.begin();
  }, [channel]);

  const move = useCallback(
    (edit: TransientEdit) => {
      if (!dragging.current) return;
      channel.push(edit);
    },
    [channel],
  );

  const end = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const edits = channel.end();
    if (edits.length > 0) options.commit(edits, options.store());
  }, [channel, options]);

  const cancel = useCallback(() => {
    dragging.current = false;
    channel.cancel();
  }, [channel]);

  return { begin, move, end, cancel };
}
