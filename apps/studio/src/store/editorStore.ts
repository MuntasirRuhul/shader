import {
  addObject,
  childrenOf,
  createDocument,
  createFrame,
  DEFAULT_FILL,
  descendantsOf,
  groupObjects,
  removeObjects,
  ungroupObject,
  updateObject,
  type CanvasDocument,
  type CanvasObject,
  type Fill,
  type ObjectChanges,
  type ParameterValues,
} from '@shader/core';
import { replaceShaderValues, setFill, setShaderValues } from '@shader/core';
import { create } from 'zustand';
import {
  applyEdit,
  canRedo,
  canUndo,
  redo as redoHistory,
  undo as undoHistory,
  EMPTY_HISTORY,
  type History,
} from './history';
import {
  clearSelection,
  pruneSelection,
  selectMany,
  selectOne,
  toggleSelected,
  type Selection,
} from './selection';
import {
  clampZoom,
  INITIAL_SELECTION,
  INITIAL_TOOL_STATE,
  INITIAL_VIEWPORT,
  type ShapeKind,
  type ToolId,
  type ToolState,
  type ViewportState,
} from './slices';

/**
 * The editor's state, composed from independent slices.
 *
 * Document edits route through `applyEdit` so every one of them is undoable by
 * construction — there is no path that mutates the document without recording
 * what it did.
 */
export interface EditorState {
  readonly document: CanvasDocument;
  readonly history: History;
  readonly selection: Selection;
  readonly viewport: ViewportState;
  readonly tool: ToolState;

  // Document
  readonly addObject: (object: CanvasObject) => void;
  readonly updateObject: (objectId: string, changes: ObjectChanges, label?: string) => void;
  readonly deleteSelected: () => void;
  /** Puts the selection into one container, and selects it. */
  readonly groupSelection: () => void;
  /** Dissolves the selected containers, selecting what they held. */
  readonly ungroupSelection: () => void;
  readonly setFill: (objectId: string, fill: Fill) => void;
  readonly setShaderValues: (objectId: string, values: ParameterValues) => void;
  readonly applyPreset: (objectId: string, values: ParameterValues, presetId: string) => void;
  /** Runs an arbitrary document edit as one undoable step. */
  readonly edit: (label: string, edit: (document: CanvasDocument) => CanvasDocument) => void;
  readonly replaceDocument: (document: CanvasDocument) => void;

  // History
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;

  // Selection
  readonly select: (objectId: string) => void;
  readonly toggleSelect: (objectId: string) => void;
  readonly selectMany: (objectIds: readonly string[]) => void;
  readonly clearSelection: () => void;

  // Viewport
  readonly setZoom: (zoom: number) => void;
  readonly panBy: (dx: number, dy: number) => void;
  readonly setViewport: (viewport: Partial<ViewportState>) => void;
  readonly resetViewport: () => void;

  // Tools
  readonly setTool: (tool: ToolId) => void;
  readonly setShape: (shape: ShapeKind) => void;
  readonly beginTextEditing: (objectId: string) => void;
  readonly endTextEditing: () => void;
}

export const createEditorStore = (initialDocument: CanvasDocument = createDocument()) =>
  create<EditorState>((set, get) => {
    /** Applies a document edit and keeps the selection consistent with it. */
    const runEdit = (label: string, edit: (document: CanvasDocument) => CanvasDocument): void => {
      const { document, history, selection } = get();
      const result = applyEdit(document, history, label, edit);
      if (!result.changed) return;

      set({
        document: result.document,
        history: result.history,
        selection: pruneSelection(selection, result.document),
      });
    };

    return {
      document: initialDocument,
      history: EMPTY_HISTORY,
      ...INITIAL_SELECTION,
      viewport: INITIAL_VIEWPORT,
      tool: INITIAL_TOOL_STATE,

      addObject: (object) => {
        runEdit('Add object', (document) => addObject(document, object));
        set({ selection: selectOne(object.id) });
      },

      updateObject: (objectId, changes, label = 'Change object') => {
        runEdit(label, (document) => updateObject(document, objectId, changes));
      },

      deleteSelected: () => {
        const { selection } = get();
        if (selection.length === 0) return;
        // What a container holds goes with it; leaving orphans behind would
        // leave objects nobody can reach.
        const withContents = new Set(selection);
        for (const objectId of selection) {
          for (const child of descendantsOf(get().document, objectId)) withContents.add(child.id);
        }
        runEdit('Delete', (document) => removeObjects(document, [...withContents]));
      },

      groupSelection: () => {
        const { selection, document } = get();
        if (selection.length < 2) return;

        const frame = createFrame({ name: 'Group', clipsContent: false, fill: DEFAULT_FILL });
        const grouped = groupObjects(document, selection, frame);
        // Refused, because the members do not share a container.
        if (grouped === document) return;

        runEdit('Group', () => grouped);
        set({ selection: [frame.id] });
      },

      ungroupSelection: () => {
        const { selection, document } = get();
        const containers = document.objects.filter(
          (object) => selection.includes(object.id) && object.type === 'frame',
        );
        if (containers.length === 0) return;

        const released = containers.flatMap((container) =>
          childrenOf(document, container.id).map((child) => child.id),
        );

        runEdit('Ungroup', (current) =>
          containers.reduce((next, container) => ungroupObject(next, container.id), current),
        );
        set({ selection: released });
      },

      setFill: (objectId, fill) => {
        runEdit('Change fill', (document) => setFill(document, objectId, fill));
      },

      setShaderValues: (objectId, values) => {
        runEdit('Change parameter', (document) => setShaderValues(document, objectId, values));
      },

      applyPreset: (objectId, values, presetId) => {
        runEdit('Apply preset', (document) =>
          replaceShaderValues(document, objectId, values, presetId),
        );
      },

      edit: runEdit,

      replaceDocument: (document) => {
        // Loading a document starts a fresh history: the edits that built the
        // previous one cannot meaningfully be undone into this one.
        set({
          document,
          history: EMPTY_HISTORY,
          selection: clearSelection(),
        });
      },

      undo: () => {
        const { document, history, selection } = get();
        const result = undoHistory(document, history);
        set({
          document: result.document,
          history: result.history,
          selection: pruneSelection(selection, result.document),
        });
      },

      redo: () => {
        const { document, history, selection } = get();
        const result = redoHistory(document, history);
        set({
          document: result.document,
          history: result.history,
          selection: pruneSelection(selection, result.document),
        });
      },

      canUndo: () => canUndo(get().history),
      canRedo: () => canRedo(get().history),

      select: (objectId) => {
        set({ selection: selectOne(objectId) });
      },
      toggleSelect: (objectId) => {
        set({ selection: toggleSelected(get().selection, objectId) });
      },
      selectMany: (objectIds) => {
        set({ selection: selectMany(objectIds) });
      },
      clearSelection: () => {
        set({ selection: clearSelection() });
      },

      setZoom: (zoom) => {
        set({ viewport: { ...get().viewport, zoom: clampZoom(zoom) } });
      },
      panBy: (dx, dy) => {
        const { viewport } = get();
        set({ viewport: { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy } });
      },
      setViewport: (partial) => {
        const next = { ...get().viewport, ...partial };
        set({ viewport: { ...next, zoom: clampZoom(next.zoom) } });
      },
      resetViewport: () => {
        set({ viewport: INITIAL_VIEWPORT });
      },

      setTool: (tool) => {
        set({ tool: { ...get().tool, active: tool } });
      },
      setShape: (shape) => {
        set({ tool: { ...get().tool, shape } });
      },
      beginTextEditing: (objectId) => {
        set({ tool: { ...get().tool, editingTextId: objectId } });
      },
      endTextEditing: () => {
        set({ tool: { ...get().tool, editingTextId: null } });
      },
    };
  });

/** The application's store. */
export const useEditorStore = createEditorStore();
