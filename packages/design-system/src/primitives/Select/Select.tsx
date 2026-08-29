import * as RadixSelect from '@radix-ui/react-select';
import { cx } from '../../utils/cx';
import styles from './Select.module.css';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly onValueChange: (value: string) => void;
}

/** A choice among a fixed set of options. */
export function Select({
  label,
  value,
  options,
  disabled = false,
  className,
  onValueChange,
}: SelectProps) {
  const chosen = options.find((option) => option.value === value);

  return (
    <RadixSelect.Root disabled={disabled} onValueChange={onValueChange} value={value}>
      <RadixSelect.Trigger aria-label={label} className={cx(styles.trigger, className)}>
        <RadixSelect.Value>{chosen?.label ?? value}</RadixSelect.Value>
        <RadixSelect.Icon>▾</RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={4}>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map((option) => (
              <RadixSelect.Item className={styles.item} key={option.value} value={option.value}>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
