import type { ImageParameter } from '@shader/core';
import { Button } from '@shader/design-system';
import { useRef, useState } from 'react';
import { IMAGE_FILE_ACCEPT, importImageFile } from '../persistence/imageFile';
import styles from './ImageField.module.css';

export interface ImageFieldProps {
  readonly parameter: ImageParameter;
  /** A `data:` URI, or the empty string for no picture. */
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

/**
 * The control for a picture a shader samples.
 *
 * It shows what was chosen rather than a filename: the name of a file says
 * nothing about whether it is the right picture, and a shader pointed at the
 * wrong one looks like a broken shader.
 *
 * A refusal is shown rather than swallowed, as it is on import — a file that
 * is too large or of the wrong kind is a thing the user chose.
 */
export function ImageField({ parameter, value, disabled = false, onChange }: ImageFieldProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  return (
    <div className={styles.field}>
      {value === '' ? (
        <p className={styles.empty}>No picture chosen</p>
      ) : (
        <img alt={`${parameter.label}, as chosen`} className={styles.preview} src={value} />
      )}

      <div className={styles.actions}>
        <Button
          disabled={disabled}
          onClick={() => {
            fileRef.current?.click();
          }}
          size="sm"
        >
          {value === '' ? 'Choose a picture' : 'Replace'}
        </Button>

        {value !== '' && (
          <Button
            disabled={disabled}
            onClick={() => {
              setRefusal(null);
              onChange('');
            }}
            size="sm"
            variant="ghost"
          >
            Remove
          </Button>
        )}
      </div>

      <input
        accept={IMAGE_FILE_ACCEPT}
        aria-label={`Choose a picture for ${parameter.label}`}
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
            onChange(outcome.image.source);
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
    </div>
  );
}
