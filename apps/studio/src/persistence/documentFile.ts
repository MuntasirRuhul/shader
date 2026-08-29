import {
  deserializeDocument,
  exportFilename,
  serializeDocument,
  type CanvasDocument,
  type LoadResult,
} from '@shader/core';

/**
 * Moving documents to and from files.
 *
 * The browser side is kept behind these functions so the import decision —
 * what to do about unsaved work, what to do about a file that will not read —
 * stays testable without a file picker.
 */

export interface DownloadTarget {
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  readonly click: (url: string, filename: string) => void;
}

export function browserDownload(): DownloadTarget {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url);
    },
    click: (url, filename) => {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}

/** Writes the document out as a file the user can keep. */
export function exportDocument(document: CanvasDocument, target: DownloadTarget): string {
  const filename = exportFilename(document);
  const blob = new Blob([serializeDocument(document)], { type: 'application/json' });
  const url = target.createObjectURL(blob);

  try {
    target.click(url, filename);
  } finally {
    target.revokeObjectURL(url);
  }

  return filename;
}

export interface ImportRequest {
  readonly contents: string;
  /** True when the current document has edits that would be lost. */
  readonly hasUnsavedChanges: boolean;
  /** Asks the user whether to replace the current document. */
  readonly confirmReplace: () => boolean | Promise<boolean>;
}

export type ImportOutcome =
  | { readonly kind: 'imported'; readonly document: CanvasDocument; readonly migrated: boolean }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * Loads a document from a file's contents.
 *
 * The file is read and validated *before* the user is asked to confirm, so an
 * unreadable file never prompts them to discard work for nothing.
 */
export async function importDocument(request: ImportRequest): Promise<ImportOutcome> {
  const loaded: LoadResult = deserializeDocument(request.contents);

  if (!loaded.ok) {
    return { kind: 'refused', message: loaded.failure.message };
  }

  if (request.hasUnsavedChanges) {
    const confirmed = await request.confirmReplace();
    if (!confirmed) return { kind: 'cancelled' };
  }

  return { kind: 'imported', document: loaded.document, migrated: loaded.migrated };
}

/** Reads a picked file as text. */
export function readFile(file: Blob): Promise<string> {
  return file.text();
}
