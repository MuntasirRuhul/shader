import * as RadixSlider from '@radix-ui/react-slider';
import { cx } from '../../utils/cx';
import styles from './Slider.module.css';

export interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Fires continuously while dragging. */
  readonly onChange: (value: number) => void;
  /** Fires once when the drag ends, for committing a single edit. */
  readonly onCommit?: (value: number) => void;
}

/**
 * A value slider.
 *
 * Reports dragging and release separately so a caller can stream intermediate
 * values to a renderer while recording only one edit.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  className,
  onChange,
  onCommit,
}: SliderProps) {
  return (
    <RadixSlider.Root
      className={cx(styles.root, className)}
      disabled={disabled}
      max={max}
      min={min}
      onValueChange={([next]) => {
        if (next !== undefined) onChange(next);
      }}
      onValueCommit={([next]) => {
        if (next !== undefined) onCommit?.(next);
      }}
      step={step}
      value={[value]}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      {/* The thumb carries the slider role, so the name belongs on it. */}
      <RadixSlider.Thumb aria-label={label} className={styles.thumb} />
    </RadixSlider.Root>
  );
}
