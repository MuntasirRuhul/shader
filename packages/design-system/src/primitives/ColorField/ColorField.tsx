import { useState } from 'react';
import { cx } from '../../utils/cx';
import { TextField } from '../TextField/TextField';
import styles from './ColorField.module.css';

export interface ColorFieldProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly onValueChange: (value: string) => void;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A colour, editable by swatch or by typing a hex value.
 *
 * The typed value is held locally until it parses, so a partially typed hex
 * like `#4d7` never reaches the document.
 */
export function ColorField({
  label,
  value,
  disabled = false,
  className,
  onValueChange,
}: ColorFieldProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  // Adjusted during render rather than in an effect, which would render twice.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!editing) setDraft(value);
  }

  const commit = (raw: string) => {
    const normalised = raw.trim().toLowerCase();
    if (HEX.test(normalised)) {
      if (normalised !== value) onValueChange(normalised);
    } else {
      setDraft(value);
    }
  };

  return (
    <div className={cx(styles.field, className)}>
      <span className={styles.swatchWrapper}>
        <span className={styles.swatch} style={{ backgroundColor: value }} />
        <input
          aria-label={label}
          className={styles.nativeInput}
          disabled={disabled}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          type="color"
          value={value}
        />
      </span>

      <TextField
        className={styles.hex}
        disabled={disabled}
        label={`${label} hex value`}
        onBlur={(event) => {
          setEditing(false);
          commit(event.target.value);
        }}
        onFocus={() => {
          setEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit(event.currentTarget.value);
          } else if (event.key === 'Escape') {
            setDraft(value);
          }
        }}
        onValueChange={setDraft}
        value={draft}
      />
    </div>
  );
}
