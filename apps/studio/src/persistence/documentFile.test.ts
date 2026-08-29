import {
  addObjects,
  createDocument,
  createRectangle,
  documentsEqual,
  DOCUMENT_VERSION,
  resetObjectIds,
  serializeDocument,
  shaderFill,
  type CanvasDocument,
} from '@shader/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportDocument,
  importDocument,
  type DownloadTarget,
  type ImportRequest,
} from './documentFile';

let document: CanvasDocument;

function recordingTarget() {
  const clicks: { url: string; filename: string }[] = [];
  const revoked: string[] = [];

  const target: DownloadTarget = {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: (url) => revoked.push(url),
    click: (url, filename) => clicks.push({ url, filename }),
  };

  return { target, clicks, revoked };
}

function request(overrides: Partial<ImportRequest> = {}): ImportRequest {
  return {
    contents: serializeDocument(document),
    hasUnsavedChanges: false,
    confirmReplace: () => true,
    ...overrides,
  };
}

beforeEach(() => {
  resetObjectIds();
  document = addObjects(createDocument({ name: 'Scene' }), [
    createRectangle({ id: 'r', fill: shaderFill('grad', { angle: 30 }) }),
  ]);
});

describe('exporting', () => {
  it('offers a file named after the document', () => {
    const { target, clicks } = recordingTarget();

    exportDocument(document, target);

    expect(clicks[0]?.filename).toBe('scene.shader.json');
  });

  it('releases the object URL afterwards', () => {
    const { target, revoked } = recordingTarget();

    exportDocument(document, target);

    expect(revoked).toEqual(['blob:test']);
  });

  it('releases the object URL even if the download fails', () => {
    const revoked: string[] = [];
    const target: DownloadTarget = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: (url) => revoked.push(url),
      click: () => {
        throw new Error('download blocked');
      },
    };

    expect(() => exportDocument(document, target)).toThrow();
    expect(revoked).toEqual(['blob:test']);
  });
});

describe('importing', () => {
  it('loads a document this application exported', async () => {
    const outcome = await importDocument(request());

    expect(outcome.kind).toBe('imported');
    if (outcome.kind === 'imported') {
      expect(documentsEqual(outcome.document, document)).toBe(true);
    }
  });

  it('refuses a file that is not a document, explaining why', async () => {
    const outcome = await importDocument(request({ contents: 'not a document' }));

    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') expect(outcome.message).toMatch(/JSON/i);
  });

  it('refuses a document from a newer version', async () => {
    const future = JSON.stringify({ ...document, version: DOCUMENT_VERSION + 1 });

    const outcome = await importDocument(request({ contents: future }));

    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') expect(outcome.message).toContain('Update the application');
  });

  it('leaves the current document untouched when it refuses', async () => {
    const before = structuredClone(document);

    await importDocument(request({ contents: '{{{' }));

    expect(documentsEqual(document, before)).toBe(true);
  });
});

describe('replacing unsaved work', () => {
  it('asks before replacing a document with unsaved changes', async () => {
    const confirmReplace = vi.fn(() => true);

    await importDocument(request({ hasUnsavedChanges: true, confirmReplace }));

    expect(confirmReplace).toHaveBeenCalledOnce();
  });

  it('does not ask when there is nothing to lose', async () => {
    const confirmReplace = vi.fn(() => true);

    await importDocument(request({ hasUnsavedChanges: false, confirmReplace }));

    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('cancels when the user declines', async () => {
    const outcome = await importDocument(
      request({ hasUnsavedChanges: true, confirmReplace: () => false }),
    );

    expect(outcome).toEqual({ kind: 'cancelled' });
  });

  it('does not ask about an unreadable file', async () => {
    // Reading first means a bad file never prompts the user to discard work.
    const confirmReplace = vi.fn(() => true);

    await importDocument(request({ contents: 'rubbish', hasUnsavedChanges: true, confirmReplace }));

    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('accepts an asynchronous confirmation', async () => {
    const outcome = await importDocument(
      request({ hasUnsavedChanges: true, confirmReplace: () => Promise.resolve(true) }),
    );

    expect(outcome.kind).toBe('imported');
  });
});

describe('a full export and import cycle', () => {
  it('returns an equivalent document', async () => {
    const { target, clicks } = recordingTarget();
    exportDocument(document, target);
    expect(clicks).toHaveLength(1);

    // What the file would have contained is what is read back.
    const outcome = await importDocument(request({ contents: serializeDocument(document) }));

    expect(outcome.kind).toBe('imported');
    if (outcome.kind === 'imported') {
      expect(documentsEqual(outcome.document, document)).toBe(true);
      expect(outcome.document.objects[0]?.fill).toEqual({
        kind: 'shader',
        shaderId: 'grad',
        values: { angle: 30 },
      });
    }
  });
});
