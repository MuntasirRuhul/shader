import * as RadixCollapsible from '@radix-ui/react-collapsible';
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';
import styles from './Collapsible.module.css';

export interface CollapsibleProps {
  readonly title: string;
  readonly open: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onOpenChange: (open: boolean) => void;
}

/** A titled section that can be folded away. */
export function Collapsible({ title, open, children, className, onOpenChange }: CollapsibleProps) {
  return (
    <RadixCollapsible.Root
      className={cx(styles.root, className)}
      onOpenChange={onOpenChange}
      open={open}
    >
      <RadixCollapsible.Trigger className={styles.trigger}>
        <span>{title}</span>
        <span aria-hidden="true" className={styles.chevron}>
          ›
        </span>
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content className={styles.content}>{children}</RadixCollapsible.Content>
    </RadixCollapsible.Root>
  );
}
