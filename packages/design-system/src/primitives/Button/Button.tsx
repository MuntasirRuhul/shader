import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '../../utils/cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Renders the child element instead of a `button`, keeping the styling. */
  readonly asChild?: boolean;
  /** Content before the label, typically an icon. */
  readonly startSlot?: ReactNode;
  /** Content after the label, typically an icon or shortcut hint. */
  readonly endSlot?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * The standard action control. Presentation only: it holds no application
 * state and reports every interaction through its DOM props.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  asChild = false,
  startSlot,
  endSlot,
  className,
  children,
  type,
  ref,
  ...rest
}: ButtonProps) {
  const classes = cx(styles.button, styles[variant], styles[size], className);

  if (asChild) {
    return (
      <Slot className={classes} ref={ref} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button className={classes} ref={ref} type={type ?? 'button'} {...rest}>
      {startSlot}
      {children}
      {endSlot}
    </button>
  );
}
