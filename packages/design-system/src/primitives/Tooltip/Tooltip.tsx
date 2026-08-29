import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  /** The tooltip text. */
  readonly content: ReactNode;
  /** The control the tooltip describes. Must accept a ref and DOM props. */
  readonly children: ReactElement;
  readonly side?: TooltipSide;
  /** An optional keyboard hint shown after the label, e.g. `V`. */
  readonly shortcut?: string;
  readonly delayDuration?: number;
  /** Controlled open state, for tests and for driving the tooltip externally. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * Wraps a control with a tooltip. Radix supplies the hover and focus timing,
 * dismissal, and the `aria-describedby` wiring; this adds only the styling.
 *
 * A tooltip supplements an accessible name, it never replaces one — icon-only
 * controls must still carry their own label.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  shortcut,
  delayDuration = 300,
  open,
  onOpenChange,
}: TooltipProps) {
  return (
    <RadixTooltip.Root
      delayDuration={delayDuration}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className={styles.content} side={side} sideOffset={6}>
          {content}
          {shortcut !== undefined && <span className={styles.shortcut}>{shortcut}</span>}
          <RadixTooltip.Arrow className={styles.arrow} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/**
 * Hosts the shared tooltip timing for a subtree. One provider wraps the app so
 * that moving between controls does not re-trigger the opening delay.
 */
export function TooltipProvider({
  children,
  delayDuration = 300,
}: {
  readonly children: ReactNode;
  readonly delayDuration?: number;
}) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}
