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

/** Forgets the stored document, used after recovering from unreadable data. */
export function clearStoredDocument(storage: DocumentStorage | null): void {
  try {
    storage?.removeItem(DOCUMENT_STORAGE_KEY);
  } catch {
    // Nothing to do: the editor continues either way.
  }
}
