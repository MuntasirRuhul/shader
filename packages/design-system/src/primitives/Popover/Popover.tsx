import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactElement, ReactNode } from 'react';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The control that opens the popover. */
  readonly trigger: ReactElement;
  readonly children: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly align?: 'start' | 'center' | 'end';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * A layer anchored to a trigger.
 *
 * Radix supplies the dismissal semantics — Escape, an outside click, and
 * returning focus to the trigger — which is the part hand-rolled popovers
 * usually get wrong.
 */
export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  open,
  onOpenChange,
}: PopoverProps) {
  return (
    <RadixPopover.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content align={align} className={styles.content} side={side} sideOffset={6}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
