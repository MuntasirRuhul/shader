import {
  createDocument,
  createRectangle,
  createText,
  isShaderFill,
  resetObjectIds,
  shaderFill,
  solidFill,
  type CanvasDocument,
} from '@shader/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEditorStore, type EditorState } from './editorStore';
import { ZOOM_LIMITS } from './slices';

type Store = ReturnType<typeof createEditorStore>;

let store: Store;
const state = (): EditorState => store.getState();
const ids = (): string[] => state().document.objects.map((object) => object.id);

function seed(document: CanvasDocument = createDocument()): void {
  store = createEditorStore(document);
}

beforeEach(() => {
  resetObjectIds();
  seed();
});

describe('the store composes independent slices', () => {
  it('exposes every slice', () => {
    expect(state()).toMatchObject({
      document: expect.any(Object) as object,
      selection: expect.any(Array) as unknown[],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      tool: { active: 'select', shape: 'rectangle', editingTextId: null },
    });
  });

  it('updates the viewport without touching the document', () => {
    const before = state().document;
    state().setZoom(2);

    expect(state().viewport.zoom).toBe(2);
    expect(state().document).toBe(before);
  });

  it('updates the tool without touching the selection', () => {
    state().addObject(createRectangle({ id: 'a' }));
    const before = state().selection;

    state().setTool('shape');

    expect(state().tool.active).toBe('shape');
    expect(state().selection).toBe(before);
  });

  it('updates the selection without touching the document', () => {
    state().addObject(createRectangle({ id: 'a' }));
    const before = state().document;

    state().clearSelection();

    expect(state().selection).toEqual([]);
    expect(state().document).toBe(before);
  });
});

describe('document edits', () => {
  it('adds an object and selects it', () => {
    state().addObject(createRectangle({ id: 'a' }));

    expect(ids()).toEqual(['a']);
    expect(state().selection).toEqual(['a']);
  });

  it('updates an object', () => {
    state().addObject(createRectangle({ id: 'a', x: 0 }));
    state().updateObject('a', { x: 40 });

    expect(state().document.objects[0]?.x).toBe(40);
  });

  it('deletes the selection', () => {
    state().addObject(createRectangle({ id: 'a' }));
    state().addObject(createRectangle({ id: 'b' }));
    state().selectMany(['a', 'b']);

    state().deleteSelected();

    expect(ids()).toEqual([]);
  });

  it('removes deleted objects from the selection', () => {
    state().addObject(createRectangle({ id: 'a' }));
    state().deleteSelected();

    expect(state().selection).toEqual([]);
  });

  it('does nothing when deleting with an empty selection', () => {
    state().addObject(createRectangle({ id: 'a' }));
    state().clearSelection();
    const before = state().document;

    state().deleteSelected();

    expect(state().document).toBe(before);
  });

  it('replaces a document and starts a fresh history', () => {
    state().addObject(createRectangle({ id: 'a' }));

    state().replaceDocument(createDocument({ name: 'Imported' }));

    expect(state().document.name).toBe('Imported');
    expect(state().canUndo()).toBe(false);
    expect(state().selection).toEqual([]);
  });
});

describe('shader fills through the store', () => {
  beforeEach(() => {
    state().addObject(createRectangle({ id: 'a', fill: shaderFill('sample', { speed: 0.5 }) }));
    state().addObject(createRectangle({ id: 'b', fill: shaderFill('sample', { speed: 0.5 }) }));
  });

  const fillOf = (id: string) => state().document.objects.find((o) => o.id === id)?.fill;

  it('changes only the edited object', () => {
    state().setShaderValues('a', { speed: 1.8 });

    const a = fillOf('a');
    const b = fillOf('b');
    expect(isShaderFill(a!) && a.values.speed).toBe(1.8);
    expect(isShaderFill(b!) && b.values.speed).toBe(0.5);
  });

  it('applies a preset as a replacement', () => {
    state().applyPreset('a', { speed: 1.2 }, 'fast');

    const a = fillOf('a');
    expect(isShaderFill(a!) && a.values).toEqual({ speed: 1.2 });
    expect(isShaderFill(a!) && a.presetId).toBe('fast');
  });

  it('swaps a shader fill for a solid one', () => {
    state().setFill('a', solidFill('#ffffff'));

    expect(fillOf('a')).toEqual({ kind: 'solid', color: '#ffffff' });
  });
});

describe('undo and redo', () => {
  it('has nothing to undo initially', () => {
    expect(state().canUndo()).toBe(false);
    expect(state().canRedo()).toBe(false);
  });

  it('undoes an edit, restoring the prior state', () => {
    state().addObject(createRectangle({ id: 'a', x: 0 }));
    state().updateObject('a', { x: 99 });

    state().undo();

    expect(state().document.objects[0]?.x).toBe(0);
  });

  it('redoes an undone edit', () => {
    state().addObject(createRectangle({ id: 'a', x: 0 }));
    state().updateObject('a', { x: 99 });
    state().undo();

    state().redo();

    expect(state().document.objects[0]?.x).toBe(99);
  });

  it('undoes an addition', () => {
    state().addObject(createRectangle({ id: 'a' }));
    state().undo();

    expect(ids()).toEqual([]);
  });

  it('undoes a deletion, bringing the object back', () => {
    state().addObject(createRectangle({ id: 'a', x: 12 }));
    state().deleteSelected();
    state().undo();

    expect(ids()).toEqual(['a']);
    expect(state().document.objects[0]?.x).toBe(12);
  });

  it('steps back through several edits in order', () => {
    state().addObject(createRectangle({ id: 'a', x: 0 }));
    state().updateObject('a', { x: 10 });
    state().updateObject('a', { x: 20 });

    state().undo();
    expect(state().document.objects[0]?.x).toBe(10);

    state().undo();
    expect(state().document.objects[0]?.x).toBe(0);
  });

  it('clears the redo stack when a new edit follows an undo', () => {
    state().addObject(createRectangle({ id: 'a', x: 0 }));
    state().updateObject('a', { x: 10 });
    state().undo();
    expect(state().canRedo()).toBe(true);

    state().updateObject('a', { x: 50 });

    expect(state().canRedo()).toBe(false);
  });

  it('does nothing when there is nothing to undo', () => {
    const before = state().document;
    state().undo();

    expect(state().document).toBe(before);
  });

  it('does nothing when there is nothing to redo', () => {
    state().addObject(createRectangle({ id: 'a' }));
    const before = state().document;

    state().redo();

    expect(state().document).toBe(before);
  });

  it('records nothing for an edit that changes nothing', () => {
    state().addObject(createRectangle({ id: 'a', x: 5 }));
    state().updateObject('a', { x: 5 });

    state().undo();

    // The no-op recorded no entry, so undo reached past it to the addition.
    expect(ids()).toEqual([]);
  });

  it('drops selection entries for objects an undo removes', () => {
    state().addObject(createRectangle({ id: 'a' }));
    expect(state().selection).toEqual(['a']);

    state().undo();

    expect(state().selection).toEqual([]);
  });
});

describe('selection', () => {
  beforeEach(() => {
    state().addObject(createRectangle({ id: 'a' }));
    state().addObject(createRectangle({ id: 'b' }));
    state().addObject(createRectangle({ id: 'c' }));
    state().clearSelection();
  });

  it('selects one object, replacing any previous selection', () => {
    state().select('a');
    state().select('b');

    expect(state().selection).toEqual(['b']);
  });

  it('adds to the selection with the additive modifier', () => {
    state().select('a');
    state().toggleSelect('b');

    expect(state().selection).toEqual(['a', 'b']);
  });

  it('removes from the selection when toggling an already-selected object', () => {
    state().selectMany(['a', 'b']);
    state().toggleSelect('a');

    expect(state().selection).toEqual(['b']);
  });

  it('clears the selection', () => {
    state().selectMany(['a', 'b']);
    state().clearSelection();

    expect(state().selection).toEqual([]);
  });

  it('selects many at once without duplicates', () => {
    state().selectMany(['a', 'b', 'a']);

    expect(state().selection).toEqual(['a', 'b']);
  });
});

describe('viewport', () => {
  it('sets the zoom level', () => {
    state().setZoom(2.5);

    expect(state().viewport.zoom).toBe(2.5);
  });

  it('clamps zoom at the maximum', () => {
    state().setZoom(1000);

    expect(state().viewport.zoom).toBe(ZOOM_LIMITS.max);
  });

  it('clamps zoom at the minimum', () => {
    state().setZoom(0.0001);

    expect(state().viewport.zoom).toBe(ZOOM_LIMITS.min);
  });

  it('pans by an offset', () => {
    state().panBy(10, -5);
    state().panBy(5, 5);

    expect(state().viewport).toMatchObject({ panX: 15, panY: 0 });
  });

  it('resets to the initial view', () => {
    state().setZoom(3);
    state().panBy(100, 100);

    state().resetViewport();

    expect(state().viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it('leaves object positions unchanged when panning', () => {
    state().addObject(createRectangle({ id: 'a', x: 10, y: 20 }));
    state().panBy(500, 500);

    expect(state().document.objects[0]).toMatchObject({ x: 10, y: 20 });
  });
});

describe('tools', () => {
  it('starts on the select tool', () => {
    expect(state().tool.active).toBe('select');
  });

  it('activates exactly one tool at a time', () => {
    state().setTool('shape');
    expect(state().tool.active).toBe('shape');

    state().setTool('text');
    expect(state().tool.active).toBe('text');
  });

  it('remembers which shape the shape tool draws', () => {
    state().setShape('ellipse');

    expect(state().tool.shape).toBe('ellipse');
  });

  it('tracks the object being edited as text', () => {
    state().addObject(createText({ id: 't', text: 'Hi' }));
    state().beginTextEditing('t');
    expect(state().tool.editingTextId).toBe('t');

    state().endTextEditing();
    expect(state().tool.editingTextId).toBeNull();
  });
});
