import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  createEllipse,
  createRectangle,
  createText,
  DOCUMENT_VERSION,
  resetObjectIds,
  shaderFill,
  solidFill,
  type CanvasDocument,
} from '../document/model';
import { addObjects } from '../document/operations';
import {
  clearStoredDocument,
  DOCUMENT_STORAGE_KEY,
  restoreDocument,
  saveDocument,
  type DocumentStorage,
} from './localStore';
import {
  deserializeDocument,
  documentsEqual,
  exportFilename,
  loadDocument,
  serializeDocument,
} from './serialization';

class MemoryStorage implements DocumentStorage {
  private readonly entries = new Map<string, string>();
  /** Set to make every write fail, standing in for a full or blocked store. */
  failWith: Error | null = null;

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWith) throw this.failWith;
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

let document: CanvasDocument;

beforeEach(() => {
  resetObjectIds();
  document = addObjects(createDocument({ name: 'My scene' }), [
    createRectangle({ id: 'r', x: 10, y: 20, fill: shaderFill('grad', { angle: 45 }) }),
    createEllipse({ id: 'e', fill: solidFill('#ff0000') }),
    createText({ id: 't', text: 'Hello', fill: shaderFill('grad') }),
  ]);
});

describe('round-tripping a document', () => {
  it('restores an equivalent document', () => {
    const loaded = deserializeDocument(serializeDocument(document));

    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(documentsEqual(loaded.document, document)).toBe(true);
  });

  it('preserves object order', () => {
    const loaded = deserializeDocument(serializeDocument(document));

    if (!loaded.ok) throw new Error('expected a document');
    expect(loaded.document.objects.map((object) => object.id)).toEqual(['r', 'e', 't']);
  });

  it('preserves shader fills and their values', () => {
    const loaded = deserializeDocument(serializeDocument(document));

    if (!loaded.ok) throw new Error('expected a document');
    expect(loaded.document.objects[0]?.fill).toEqual({
      kind: 'shader',
      shaderId: 'grad',
      values: { angle: 45 },
    });
  });

  it('preserves solid fills', () => {
    const loaded = deserializeDocument(serializeDocument(document));

    if (!loaded.ok) throw new Error('expected a document');
    expect(loaded.document.objects[1]?.fill).toEqual({ kind: 'solid', color: '#ff0000' });
  });

  it('preserves text content', () => {
    const loaded = deserializeDocument(serializeDocument(document));

    if (!loaded.ok) throw new Error('expected a document');
    const text = loaded.document.objects[2];
    expect(text?.type === 'text' && text.text).toBe('Hello');
  });

  it('carries the format version', () => {
    expect(JSON.parse(serializeDocument(document))).toMatchObject({
      version: DOCUMENT_VERSION,
    });
  });

  it('round-trips an empty document', () => {
    const empty = createDocument();
    const loaded = deserializeDocument(serializeDocument(empty));

    expect(loaded.ok && documentsEqual(loaded.document, empty)).toBe(true);
  });
});

describe('refusing what cannot be read', () => {
  it('reports unparseable data rather than throwing', () => {
    const loaded = deserializeDocument('{ not json');

    expect(loaded).toMatchObject({ ok: false, failure: { kind: 'unparseable' } });
  });

  it('refuses something that is not a document', () => {
    expect(deserializeDocument('[1, 2, 3]')).toMatchObject({
      ok: false,
      failure: { kind: 'not-a-document' },
    });
  });

  it('refuses a document with no version', () => {
    expect(loadDocument({ objects: [] })).toMatchObject({
      ok: false,
      failure: { kind: 'not-a-document' },
    });
  });

  it('refuses a version newer than this build, naming both', () => {
    const loaded = loadDocument({ ...document, version: DOCUMENT_VERSION + 5 });

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.failure.kind).toBe('future-version');
    expect(loaded.failure.message).toContain(String(DOCUMENT_VERSION + 5));
    expect(loaded.failure.message).toContain(String(DOCUMENT_VERSION));
  });

  it('does not partially load a future document', () => {
    const loaded = loadDocument({ ...document, version: DOCUMENT_VERSION + 1 });

    expect(loaded.ok).toBe(false);
  });

  it('refuses an unrecognised object type, naming it', () => {
    const loaded = loadDocument({
      ...document,
      objects: [{ id: 'x', type: 'hologram' }],
    });

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.failure.kind).toBe('unknown-object-type');
    expect(loaded.failure.message).toContain('hologram');
  });

  it('does not silently discard an unrecognised object', () => {
    // Loading fails outright rather than returning a document missing it.
    const loaded = loadDocument({
      ...document,
      objects: [...document.objects, { id: 'x', type: 'hologram' }],
    });

    expect(loaded.ok).toBe(false);
  });

  it('refuses a document with no objects list', () => {
    expect(loadDocument({ version: DOCUMENT_VERSION })).toMatchObject({
      ok: false,
      failure: { kind: 'not-a-document' },
    });
  });
});

describe('migration', () => {
  it('reports that a current-version document needed none', () => {
    const loaded = loadDocument(document);

    expect(loaded.ok && loaded.migrated).toBe(false);
  });

  it('refuses a version with no migration path rather than guessing', () => {
    // Version 0 predates the format, so nothing knows how to read it.
    expect(loadDocument({ ...document, version: 0 })).toMatchObject({ ok: false });
  });
});

describe('naming an exported file', () => {
  it('uses the document name', () => {
    expect(exportFilename(document)).toBe('my-scene.shader.json');
  });

  it('falls back when the name would be empty', () => {
    expect(exportFilename({ ...document, name: '   ' })).toBe('shader-document.shader.json');
  });

  it('strips characters a filesystem would object to', () => {
    expect(exportFilename({ ...document, name: 'A/B: C?' })).toBe('a-b-c.shader.json');
  });
});

describe('saving to local storage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('stores the document', () => {
    expect(saveDocument(storage, document)).toEqual({ ok: true });
    expect(storage.getItem(DOCUMENT_STORAGE_KEY)).not.toBeNull();
  });

  it('restores what it stored', () => {
    saveDocument(storage, document);
    const restored = restoreDocument(storage);

    expect(restored.ok).toBe(true);
    if (restored.ok) expect(documentsEqual(restored.document, document)).toBe(true);
  });

  it('reports an empty store rather than failing', () => {
    expect(restoreDocument(storage)).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports a full store, and says export is the way out', () => {
    storage.failWith = Object.assign(new Error('exceeded'), { name: 'QuotaExceededError' });

    const result = saveDocument(storage, document);

    expect(result).toMatchObject({ ok: false, reason: 'quota' });
    if (!result.ok) expect(result.message).toMatch(/export/i);
  });

  it('reports an unavailable store rather than throwing', () => {
    const result = saveDocument(null, document);

    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('reports an unexpected write failure without throwing', () => {
    storage.failWith = new Error('something else');

    expect(saveDocument(storage, document)).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('restores nothing when storage is unavailable', () => {
    expect(restoreDocument(null)).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports unreadable stored data as corrupt', () => {
    storage.setItem(DOCUMENT_STORAGE_KEY, 'not a document');

    expect(restoreDocument(storage)).toMatchObject({ ok: false, reason: 'corrupt' });
  });

  it('can forget unreadable data so the next start is clean', () => {
    storage.setItem(DOCUMENT_STORAGE_KEY, 'not a document');
    clearStoredDocument(storage);

    expect(restoreDocument(storage)).toEqual({ ok: false, reason: 'empty' });
  });

  it('tolerates clearing an unavailable store', () => {
    expect(() => {
      clearStoredDocument(null);
    }).not.toThrow();
  });
});
