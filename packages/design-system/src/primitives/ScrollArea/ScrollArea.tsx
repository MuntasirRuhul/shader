import * as RadixScrollArea from '@radix-ui/react-scroll-area';
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';
import styles from './ScrollArea.module.css';

export interface ScrollAreaProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** A scrolling region with a scrollbar that matches the rest of the interface. */
export function ScrollArea({ children, className }: ScrollAreaProps) {
  return (
    <RadixScrollArea.Root className={cx(styles.root, className)} type="hover">
      <RadixScrollArea.Viewport className={styles.viewport}>{children}</RadixScrollArea.Viewport>
      <RadixScrollArea.Scrollbar className={styles.scrollbar} orientation="vertical">
        <RadixScrollArea.Thumb className={styles.thumb} />
      </RadixScrollArea.Scrollbar>
    </RadixScrollArea.Root>
  );
}
