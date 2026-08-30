import type { CanvasDocument, Rect } from '@shader/core';
import type { Selection } from '../store/selection';
import type { ViewportState } from '../store/slices';
import { gestureRect, previewBounds, type Gesture } from './interaction';
import styles from './SelectionOverlay.module.css';
import { HANDLE_POSITIONS, handlePoint, ROTATE_HANDLE_OFFSET } from './transformHandles';
import { canvasRectToScreen, canvasToScreen } from './viewport';

export interface SelectionOverlayProps {
  readonly document: CanvasDocument;
  readonly selection: Selection;
  readonly viewport: ViewportState;
  readonly gesture: Gesture;
  readonly constrain: boolean;
  /** The object being typed into, which draws its own bounds. */
  readonly editingId?: string | null;
}

/**
 * The selection indicator, handles, and in-progress gesture preview.
 *
 * Drawn as DOM rather than into the canvas so the handles are ordinary hit
 * targets and keep a constant screen size at any zoom.
 */
export function SelectionOverlay({
  document,
  selection,
  viewport,
  gesture,
  constrain,
  editingId = null,
}: SelectionOverlayProps) {
  // Follows a drag in progress, so the indicator moves with what it describes.
  const editing = editingId !== null && selection.length === 1 && selection[0] === editingId;
  const bounds = editing ? undefined : previewBounds(document, selection, gesture, constrain);
  const preview = gestureRect(gesture, constrain);
  const showHandles = selection.length === 1 && gesture.kind !== 'marquee';

  return (
    <div aria-hidden="true" className={styles.overlay}>
      {bounds && (
        <div
          className={selection.length > 1 ? styles.multipleBounds : styles.bounds}
          style={boxStyle(bounds, viewport)}
        />
      )}

      {showHandles && bounds && (
        <>
          {HANDLE_POSITIONS.map((position) => {
            const point = canvasToScreen(handlePoint(bounds, position), viewport);
            return (
              <div
                className={styles.handle}
                data-handle={position}
                key={position}
                style={{ left: `${String(point.x)}px`, top: `${String(point.y)}px` }}
              />
            );
          })}
          <div
            className={styles.rotateHandle}
            data-handle="rotate"
            style={rotateHandleStyle(bounds, viewport)}
          />
        </>
      )}

      {gesture.kind === 'marquee' && preview && (
        <div className={styles.marquee} style={boxStyle(preview, viewport)} />
      )}

      {gesture.kind === 'draw' && preview && (
        <div
          className={gesture.shape === 'ellipse' ? styles.drawEllipse : styles.drawRect}
          style={boxStyle(preview, viewport)}
        />
      )}
    </div>
  );
}

function boxStyle(rect: Rect, viewport: ViewportState) {
  const screen = canvasRectToScreen(rect, viewport);
  return {
    left: `${String(screen.x)}px`,
    top: `${String(screen.y)}px`,
    width: `${String(screen.width)}px`,
    height: `${String(screen.height)}px`,
  };
}

function rotateHandleStyle(bounds: Rect, viewport: ViewportState) {
  const top = canvasToScreen({ x: bounds.x + bounds.width / 2, y: bounds.y }, viewport);
  return {
    left: `${String(top.x)}px`,
    top: `${String(top.y - ROTATE_HANDLE_OFFSET)}px`,
  };
}
