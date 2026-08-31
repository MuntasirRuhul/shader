import type { CanvasDocument } from '../document/model';
import { deserializeDocument, serializeDocument, type LoadFailure } from './serialization';

/**
 * Keeping the current document on the machine.
 *
 * Storage can fail for reasons outside the application's control — a quota,
 * a private browsing mode that throws on access, data written by an older
 * build. None of those may take the editor down, so every failure here is a
 * reported state rather than an exception.
 */

export const DOCUMENT_STORAGE_KEY = 'shader-builder.document';

/**
 * Where a document goes instead of being deleted.
 *
 * Two things used to end a document's life outright: data this build could not
 * read, which was cleared to let the editor start, and an empty canvas saved
 * over a full one. Both are recoverable if the bytes are kept, and both are
 * unrecoverable if they are not — so nothing is ever removed now, only set
 * aside under these keys.
 */
export const UNREADABLE_STORAGE_KEY = 'shader-builder.document.unreadable';
export const BACKUP_STORAGE_KEY = 'shader-builder.document.backup';

export type SaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unavailable' | 'quota' | 'unknown';
      readonly message: string;
    };

export type RestoreResult =
  | { readonly ok: true; readonly document: CanvasDocument; readonly migrated: boolean }
  | { readonly ok: false; readonly reason: 'empty' }
  | { readonly ok: false; readonly reason: 'corrupt'; readonly failure: LoadFailure };

export type DocumentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Probes storage once; returns null when it is unusable. */
export function browserStorage(): DocumentStorage | null {
  try {
    const probe = `${DOCUMENT_STORAGE_KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Browsers disagree on the name, so both spellings are checked.
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(error.message)
  );
}

export function saveDocument(
  storage: DocumentStorage | null,
  document: CanvasDocument,
): SaveResult {
  if (!storage) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Changes are not being saved: this browser is blocking local storage.',
    };
  }

  try {
    keepPreviousIfEmptying(storage, document);
    storage.setItem(DOCUMENT_STORAGE_KEY, serializeDocument(document));
    return { ok: true };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        ok: false,
        reason: 'quota',
        message: 'Changes are not being saved: local storage is full. Export to keep this work.',
      };
    }
    return {
      ok: false,
      reason: 'unknown',
      message: 'Changes are not being saved. Export to keep this work.',
    };
  }
}

export function restoreDocument(storage: DocumentStorage | null): RestoreResult {
  if (!storage) return { ok: false, reason: 'empty' };

  let raw: string | null;
  try {
    raw = storage.getItem(DOCUMENT_STORAGE_KEY);
  } catch {
    return { ok: false, reason: 'empty' };
  }

  if (raw === null || raw === '') return { ok: false, reason: 'empty' };

  const loaded = deserializeDocument(raw);
  if (!loaded.ok) return { ok: false, reason: 'corrupt', failure: loaded.failure };

  return { ok: true, document: loaded.document, migrated: loaded.migrated };
}

/**
 * Keeps the last document that had anything in it, when an empty one is about
 * to replace it.
 *
 * A canvas emptied on purpose is ordinary and must save. A canvas emptied by
 * anything else — a reload that started fresh, a restore that failed — looks
 * exactly the same from here, and is the one case where saving destroys work
 * nobody chose to destroy. Keeping the previous bytes costs one copy and makes
 * the difference recoverable either way.
 */
function keepPreviousIfEmptying(storage: DocumentStorage, next: CanvasDocument): void {
  if (next.objects.length > 0) return;

  try {
    const previous = storage.getItem(DOCUMENT_STORAGE_KEY);
    if (previous === null || previous === '') return;
    // Cheap enough to parse: this runs only when saving an empty canvas.
    if (!/"objects"\s*:\s*\[\s*[^\]\s]/.test(previous)) return;

    storage.setItem(BACKUP_STORAGE_KEY, previous);
  } catch {
    // A backup that cannot be written must not stop the save itself.
  }
}

/**
 * Sets aside data this build could not read, so it survives being replaced.
 *
 * It used to be deleted outright, which turned "this build cannot read your
 * document" into "your document is gone".
 */
export function clearStoredDocument(storage: DocumentStorage | null): void {
  if (!storage) return;

  try {
    const raw = storage.getItem(DOCUMENT_STORAGE_KEY);
    if (raw !== null && raw !== '') storage.setItem(UNREADABLE_STORAGE_KEY, raw);
    storage.removeItem(DOCUMENT_STORAGE_KEY);
  } catch {
    // Nothing to do: the editor continues either way.
  }
}

/**
 * The most recent document that was set aside rather than saved, if there is
 * one — what an unreadable document held, or what an empty canvas replaced.
 */
export function recoverStoredDocument(storage: DocumentStorage | null): RestoreResult {
  if (!storage) return { ok: false, reason: 'empty' };

  for (const key of [UNREADABLE_STORAGE_KEY, BACKUP_STORAGE_KEY]) {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    if (raw === null || raw === '') continue;

    const loaded = deserializeDocument(raw);
    if (loaded.ok) {
      return { ok: true, document: loaded.document, migrated: loaded.migrated };
    }
  }

  return { ok: false, reason: 'empty' };
}
