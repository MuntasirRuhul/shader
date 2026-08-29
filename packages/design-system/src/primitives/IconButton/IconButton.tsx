import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '../../utils/cx';
import styles from './IconButton.module.css';

export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
> {
  /**
   * The accessible name. Required: an icon carries no text, so without this the
   * control is unnamed to assistive technology.
   */
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: IconButtonSize;
  /** Marks the control as the active choice, e.g. the selected tool. */
  readonly selected?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * An icon-only action. Presentation only: it reports interaction through its
 * DOM props and holds no application state.
 */
export function IconButton({
  label,
  icon,
  size = 'md',
  selected = false,
  className,
  type,
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className={cx(styles.iconButton, styles[size], selected && styles.selected, className)}
      ref={ref}
      type={type ?? 'button'}
      {...rest}
    >
      <span aria-hidden="true" className={styles.icon}>
        {icon}
      </span>
    </button>
  );
}
