import { Button } from '@shader/design-system';
import { useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import styles from './DocumentActions.module.css';
import { browserDownload, exportDocument, importDocument, readFile } from './documentFile';

export interface DocumentActionsProps {
  /** Asks the user to confirm replacing unsaved work. Injectable for tests. */
  readonly confirmReplace?: () => boolean;
}

/** Import and export, plus anything the persistence layer needs to report. */
export function DocumentActions({ confirmReplace }: DocumentActionsProps) {
  const document = useEditorStore((state) => state.document);
  const canUndo = useEditorStore((state) => state.history.past.length > 0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ask =
    confirmReplace ??
    (() => window.confirm('Replace the current document? Unsaved changes will be lost.'));

  return (
    <>
      <div className={styles.actions}>
        <Button
          className={styles.action}
          onClick={() => {
            fileRef.current?.click();
          }}
          size="sm"
        >
          Import
        </Button>
        <Button
          className={styles.action}
          onClick={() => {
            exportDocument(document, browserDownload());
          }}
          size="sm"
        >
          Export
        </Button>

        <input
          accept="application/json,.json"
          aria-label="Import a document"
          className={styles.fileInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the input so choosing the same file twice still fires.
            event.target.value = '';
            if (!file) return;

            void (async () => {
              const outcome = await importDocument({
                contents: await readFile(file),
                hasUnsavedChanges: canUndo,
                confirmReplace: ask,
              });

              if (outcome.kind === 'imported') {
                useEditorStore.getState().replaceDocument(outcome.document);
                setMessage(null);
              } else if (outcome.kind === 'refused') {
                setMessage(outcome.message);
              }
            })();
          }}
          ref={fileRef}
          type="file"
        />
      </div>

      {message !== null && <p className={styles.problem}>{message}</p>}
    </>
  );
}
