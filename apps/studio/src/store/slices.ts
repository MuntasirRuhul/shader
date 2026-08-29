import type { CanvasDocument } from '@shader/core';
import { EMPTY_HISTORY, type History } from './history';
import { EMPTY_SELECTION, type Selection } from './selection';

/**
 * The store's slices.
 *
 * They are separable concerns but must be read together on the render path, so
 * one store keeps that read cheap and consistent. Each slice's state is
 * declared here so a slice can be reasoned about — and tested — on its own.
 */

export type ToolId = 'select' | 'shape' | 'text';

export type ShapeKind = 'rectangle' | 'ellipse';

export interface ToolState {
  readonly active: ToolId;
  /** Which shape the shape tool draws. */
  readonly shape: ShapeKind;
  /** The object currently being edited as text, if any. */
  readonly editingTextId: string | null;
}

export const INITIAL_TOOL_STATE: ToolState = {
  active: 'select',
  shape: 'rectangle',
  editingTextId: null,
};

export interface ViewportState {
  /** Canvas units per screen pixel. */
  readonly zoom: number;
  /** Pan offset, in screen pixels. */
  readonly panX: number;
  readonly panY: number;
}

export const INITIAL_VIEWPORT: ViewportState = { zoom: 1, panX: 0, panY: 0 };

export const ZOOM_LIMITS = { min: 0.1, max: 8 } as const;

export interface DocumentState {
  readonly document: CanvasDocument;
  readonly history: History;
}

export interface SelectionState {
  readonly selection: Selection;
}

export const INITIAL_SELECTION: SelectionState = { selection: EMPTY_SELECTION };

export function initialDocumentState(document: CanvasDocument): DocumentState {
  return { document, history: EMPTY_HISTORY };
}

/** Keeps a zoom level inside the allowed range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, zoom));
}
