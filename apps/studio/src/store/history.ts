import type { CanvasDocument } from '@shader/core';
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';

enablePatches();

/**
 * Undo history built from inverse patches.
 *
 * A patch records only what an edit touched, so undoing costs what the edit
 * cost rather than what the document weighs. Snapshotting the whole document
 * per edit would grow linearly with the scene, which is the wrong cost curve
 * for a canvas that may hold many objects.
 */

export interface HistoryEntry {
  /** What this edit did, for a future history panel. */
  readonly label: string;
  readonly forward: readonly Patch[];
  readonly inverse: readonly Patch[];
}

export interface History {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** How many edits are remembered. Beyond this the oldest are dropped. */
export const HISTORY_LIMIT = 100;

export interface EditResult {
  readonly document: CanvasDocument;
  readonly history: History;
  /** False when the edit changed nothing, so no history entry was recorded. */
  readonly changed: boolean;
}

/**
 * Applies an edit and records it.
 *
 * An edit that changes nothing records nothing: pressing undo should reach the
 * last edit that mattered, not step through a run of no-ops.
 */
export function applyEdit(
  document: CanvasDocument,
  history: History,
  label: string,
  edit: (document: CanvasDocument) => CanvasDocument,
): EditResult {
  // The document is deeply readonly, so immer's Draft type does not line up
  // with the pure edit signature. The edit genuinely operates on the draft;
  // only the static types need reconciling.
  const [next, forward, inverse] = produceWithPatches(document, (draft) => {
    const result = edit(draft);
    return result as unknown as typeof draft;
  });

  if (forward.length === 0) {
    return { document, history, changed: false };
  }

  const past = [...history.past, { label, forward, inverse }].slice(-HISTORY_LIMIT);

  // A new edit invalidates the redo branch: the future it would have led to no
  // longer follows from the present.
  return { document: next, history: { past, future: [] }, changed: true };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

export function undo(
  document: CanvasDocument,
  history: History,
): { document: CanvasDocument; history: History } {
  const entry = history.past.at(-1);
  if (!entry) return { document, history };

  return {
    document: applyPatches(document, entry.inverse as Patch[]),
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future],
    },
  };
}

export function redo(
  document: CanvasDocument,
  history: History,
): { document: CanvasDocument; history: History } {
  const [entry, ...rest] = history.future;
  if (!entry) return { document, history };

  return {
    document: applyPatches(document, entry.forward as Patch[]),
    history: { past: [...history.past, entry], future: rest },
  };
}

/** The label of the edit undo would reverse, for a menu item. */
export function undoLabel(history: History): string | undefined {
  return history.past.at(-1)?.label;
}

export function redoLabel(history: History): string | undefined {
  return history.future[0]?.label;
}
