import {
  browserStorage,
  clearStoredDocument,
  restoreDocument,
  saveDocument,
  type DocumentStorage,
} from '@shader/core';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';

/**
 * Keeps the document on the machine and brings it back on return.
 *
 * Writing is debounced: a drag can produce many document changes in a second,
 * and serializing on each one would put JSON work on the interaction path for
 * no benefit.
 */

const SAVE_DELAY_MS = 400;

export interface PersistenceState {
  /** Set when saving is not working, for the interface to surface. */
  readonly problem: string | null;
}

export function useDocumentPersistence(
  storage: DocumentStorage | null = browserStorage(),
): PersistenceState {
  const document = useEditorStore((state) => state.document);
  const [problem, setProblem] = useState<string | null>(null);
  const restored = useRef(false);

  // Bring back what was there, once, before the first save can overwrite it.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const result = restoreDocument(storage);
    if (result.ok) {
      useEditorStore.getState().replaceDocument(result.document);
      return;
    }

    if (result.reason === 'corrupt') {
      // Starting from an empty document beats refusing to start at all.
      clearStoredDocument(storage);
      setProblem('The previously saved document could not be read, so a new one was started.');
    }
  }, [storage]);

  useEffect(() => {
    if (!restored.current) return;

    const timer = setTimeout(() => {
      const result = saveDocument(storage, document);
      setProblem(result.ok ? null : result.message);
    }, SAVE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [document, storage]);

  return { problem };
}
