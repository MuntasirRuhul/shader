import { createImage } from '@shader/core';
import { IconButton, Tooltip } from '@shader/design-system';
import { useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { IMAGE_FILE_ACCEPT, importImageFile } from './imageFile';
import styles from './ImageImport.module.css';

const imageIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <rect height="10" rx="1.5" width="12" x="2" y="3" />
    <circle cx="6" cy="6.5" r="1.2" />
    <path d="M2.5 11l3.2-3 2.4 2.2 2-1.8 3.4 3" />
  </svg>
);

/**
 * Brings a picture in from a file.
 *
 * A refusal is shown rather than swallowed: a file that is too large or of the
 * wrong kind is a thing the user chose, and saying nothing leaves them
 * clicking again.
 */
export function ImageImport() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  return (
    <>
      <Tooltip content="Import an image or SVG">
        <IconButton
          icon={imageIcon}
          label="Import an image"
          onClick={() => {
            fileRef.current?.click();
          }}
        />
      </Tooltip>

      <input
        accept={IMAGE_FILE_ACCEPT}
        aria-label="Choose an image to import"
        className={styles.fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file twice still reports a change.
          event.target.value = '';
          if (!file) return;

          void (async () => {
            const outcome = await importImageFile(file);
            if (!outcome.ok) {
              setRefusal(outcome.message);
              return;
            }

            setRefusal(null);
            const { source, mediaType, naturalWidth, naturalHeight } = outcome.image;
            const state = useEditorStore.getState();
            const object = createImage(source, mediaType, naturalWidth, naturalHeight, {
              name: file.name,
              x: 120,
              y: 100,
            });

            state.addObject(object);
            state.select(object.id);
          })();
        }}
        ref={fileRef}
        type="file"
      />

      {refusal !== null && (
        <p className={styles.refusal} role="alert">
          {refusal}
        </p>
      )}
    </>
  );
}
