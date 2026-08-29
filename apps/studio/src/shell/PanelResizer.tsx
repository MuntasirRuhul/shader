import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './AppShell.module.css';
import { PANEL_LIMITS, type PanelSide } from './panelState';

export interface PanelResizerProps {
  readonly side: PanelSide;
  readonly width: number;
  readonly label: string;
  readonly onResize: (width: number) => void;
}

/** How far one arrow-key press moves the edge. */
const KEYBOARD_STEP = 16;

/**
 * The draggable inner edge of a panel.
 *
 * It reports the width it would like; the owner clamps and applies it, so the
 * limits live in one place. Exposed as a separator with value semantics so the
 * edge is operable — and announced — from the keyboard as well as the pointer.
 */
export function PanelResizer({ side, width, label, onResize }: PanelResizerProps) {
  const dragOrigin = useRef<{ pointerX: number; startWidth: number } | null>(null);
  const limits = PANEL_LIMITS[side];

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Only the primary button starts a resize.
      if (event.button !== 0) return;
      dragOrigin.current = { pointerX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = dragOrigin.current;
      if (!origin) return;

      const delta = event.clientX - origin.pointerX;
      // The library's edge is on its right, the inspector's on its left, so
      // the same pointer movement widens one and narrows the other.
      const direction = side === 'library' ? 1 : -1;
      onResize(origin.startWidth + delta * direction);
    },
    [onResize, side],
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const grow = side === 'library' ? 'ArrowRight' : 'ArrowLeft';
      const shrink = side === 'library' ? 'ArrowLeft' : 'ArrowRight';

      if (event.key === grow) {
        onResize(width + KEYBOARD_STEP);
      } else if (event.key === shrink) {
        onResize(width - KEYBOARD_STEP);
      } else if (event.key === 'Home') {
        onResize(limits.min);
      } else if (event.key === 'End') {
        onResize(limits.max);
      } else {
        return;
      }
      event.preventDefault();
    },
    [limits.max, limits.min, onResize, side, width],
  );

  return (
    // A separator that is focusable and carries aria-valuenow is the ARIA
    // window splitter: a widget, not decoration. The rule has no per-role
    // allowance for it, so the exception is scoped to this element.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={limits.max}
      aria-valuemin={limits.min}
      aria-valuenow={width}
      className={`${styles.resizer} ${side === 'library' ? styles.resizerStart : styles.resizerEnd}`}
      onKeyDown={handleKeyDown}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      role="separator"
      tabIndex={0}
    />
  );
}
