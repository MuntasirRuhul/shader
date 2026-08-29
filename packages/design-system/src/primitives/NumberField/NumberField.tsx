import { useRef, useState, type Ref } from 'react';
import { cx } from '../../utils/cx';
import styles from '../TextField/TextField.module.css';

export interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly integer?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onValueChange: (value: number) => void;
  readonly ref?: Ref<HTMLInputElement>;
}

/**
 * A numeric entry that only reports valid values.
 *
 * What is typed and what is committed are deliberately separate: a field would
 * be unusable if every keystroke had to parse, since "-" and "1." are states
 * you pass through on the way to a number. Invalid text is held locally and
 * discarded on blur, so the document never sees it.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  integer = false,
  disabled = false,
  className,
  onValueChange,
  ref,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  /**
   * Escape reverts and blurs, but the state update has not reached the DOM by
   * the time blur fires — so the blur handler would read, and commit, the
   * abandoned text. This flag tells it not to.
   */
  const cancelling = useRef(false);

  // Follow the value from outside, unless the user is mid-edit. Adjusted
  // during render rather than in an effect, which would render twice.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!editing) setDraft(formatValue(value));
  }

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw);

    if (!Number.isFinite(parsed)) {
      // Unparseable input reverts rather than writing anything.
      setDraft(formatValue(value));
      return;
    }

    const clamped = clamp(integer ? Math.round(parsed) : parsed, min, max);
    setDraft(formatValue(clamped));
    if (clamped !== value) onValueChange(clamped);
  };

  return (
    <input
      aria-label={label}
      className={cx(styles.field, styles.numeric, className)}
      disabled={disabled}
      inputMode={integer ? 'numeric' : 'decimal'}
      onBlur={(event) => {
        setEditing(false);
        if (cancelling.current) {
          cancelling.current = false;
          setDraft(formatValue(value));
          return;
        }
        commit(event.target.value);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onFocus={() => {
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          cancelling.current = true;
          setDraft(formatValue(value));
          event.currentTarget.blur();
        }
      }}
      ref={ref}
      step={step}
      type="text"
      value={draft}
    />
  );
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

/** Trims floating-point noise so a slider drag does not show 0.30000000000004. */
function formatValue(value: number): string {
  return String(Number(value.toFixed(4)));
}
