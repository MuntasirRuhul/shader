import * as RadixSwitch from '@radix-ui/react-switch';
import { cx } from '../../utils/cx';
import styles from './Toggle.module.css';

export interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly onCheckedChange: (checked: boolean) => void;
}

/** An on/off control. Reports its state as a switch to assistive technology. */
export function Toggle({
  label,
  checked,
  disabled = false,
  className,
  onCheckedChange,
}: ToggleProps) {
  return (
    <RadixSwitch.Root
      aria-label={label}
      checked={checked}
      className={cx(styles.root, className)}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    >
      <RadixSwitch.Thumb className={styles.thumb} />
    </RadixSwitch.Root>
  );
}
