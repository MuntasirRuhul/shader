import type { InputHTMLAttributes, Ref } from 'react';
import { cx } from '../../utils/cx';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly ref?: Ref<HTMLInputElement>;
}

/** A single-line text entry. */
export function TextField({
  label,
  value,
  onValueChange,
  className,
  ref,
  ...rest
}: TextFieldProps) {
  return (
    <input
      aria-label={label}
      className={cx(styles.field, className)}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
      ref={ref}
      type="text"
      value={value}
      {...rest}
    />
  );
}
