import {
  createEllipse,
  createRectangle,
  createText,
  objectAt,
  updateObject,
  type CanvasDocument,
  type Point,
} from '@shader/core';
import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import type { EditorState } from '../store/editorStore';
import {
  cursorFor,
  hasMoved,
  IDLE,
  marqueeSelection,
  movedPositions,
  onPointerDown,
  onPointerMove,
  panOffset,
  resizedBounds,
  rotatedAngle,
  type Gesture,
} from './interaction';
import type { HandlePosition } from './transformHandles';
import { screenToCanvas, zoomAbout, zoomStep } from './viewport';

export interface CanvasPointerHandlers {
  readonly gesture: Gesture;
  readonly constrain: boolean;
  readonly cursor: string;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
  readonly onWheel: (event: WheelEvent<HTMLElement>) => void;
}

/**
 * Turns pointer events into gestures and, on release, into document edits.
 *
 * Only the start and end of a gesture reach the store. Everything between is
 * local state driving the overlay, which is what keeps a drag off the history
 * and off React's document-level re-render path.
 */
export function useCanvasPointer(store: () => EditorState): CanvasPointerHandlers {
  const [gesture, setGesture] = useState<Gesture>(IDLE);
  const [constrain, setConstrain] = useState(false);
  const [overObject, setOverObject] = useState(false);
  const gestureRef = useRef<Gesture>(IDLE);
  gestureRef.current = gesture;

  /** Pointer position in canvas coordinates. */
  const pointOf = useCallback(
    (event: { clientX: number; clientY: number }, element: HTMLElement): Point => {
      const rect = element.getBoundingClientRect();
      return screenToCanvas(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        store().viewport,
      );
    },
    [store],
  );

  const handleDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      const point = pointOf(event, element);
      const state = store();

      // Space or the middle button pans, whatever tool is active.
      const panning = event.button === 1 || event.altKey;

      const handleAttribute = (event.target as HTMLElement).dataset.handle;
      const handle =
        handleAttribute && state.selection[0]
          ? {
              objectId: state.selection[0],
              handle: handleAttribute as HandlePosition | 'rotate',
            }
          : undefined;

      const result = onPointerDown({
        tool: state.tool.active,
        shape: state.tool.shape,
        point,
        document: state.document,
        selection: state.selection,
        additive: event.shiftKey,
        panning,
        ...(handle ? { handle } : {}),
      });

      if (result.selection) state.selectMany(result.selection);
      setGesture(result.gesture);
      setConstrain(event.shiftKey);
    },
    [pointOf, store],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const element = event.currentTarget;
      const point = pointOf(event, element);
      const state = store();
      const current = gestureRef.current;

      setConstrain(event.shiftKey);

      if (current.kind === 'idle') {
        setOverObject(objectAt(state.document, point) !== undefined);
        return;
      }

      const next = onPointerMove(current, point);
      setGesture(next);

      // Panning is a view change, so it is applied continuously and is not an
      // edit — there is nothing to undo about looking somewhere else.
      if (next.kind === 'pan') {
        const offset = panOffset(next);
        state.panBy(offset.x, offset.y);
        setGesture({ ...next, origin: next.current });
      }
    },
    [pointOf, store],
  );

  const handleUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const element = event.currentTarget;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      const point = pointOf(event, element);
      const state = store();
      const current = gestureRef.current;
      const shift = event.shiftKey;

      switch (current.kind) {
        case 'move': {
          if (!hasMoved(current.origin, point)) break;
          const positions = movedPositions(onPointerMove(current, point));
          state.edit('Move', (document: CanvasDocument) =>
            [...positions].reduce(
              (next, [objectId, position]) => updateObject(next, objectId, position),
              document,
            ),
          );
          break;
        }

        case 'marquee': {
          const enclosed = marqueeSelection(onPointerMove(current, point), state.document);
          if (hasMoved(current.origin, point)) {
            state.selectMany(enclosed.map((object) => object.id));
          }
          break;
        }

        case 'resize': {
          const bounds = resizedBounds(onPointerMove(current, point), shift);
          if (bounds) {
            state.updateObject(current.objectId, bounds, 'Resize');
          }
          break;
        }

        case 'rotate': {
          const angle = rotatedAngle(onPointerMove(current, point), state.document);
          if (angle !== undefined) {
            state.updateObject(current.objectId, { rotation: angle }, 'Rotate');
          }
          break;
        }

        case 'draw': {
          const rect = gestureRectFor(current, point, shift);
          // A drag with no area creates nothing: a stray click should not leave
          // an invisible object behind.
          if (rect && rect.width >= 2 && rect.height >= 2) {
            const object =
              current.shape === 'ellipse' ? createEllipse(rect) : createRectangle(rect);
            state.addObject(object);
          }
          // The shape tool is a one-shot: it returns to select after drawing.
          state.setTool('select');
          break;
        }

        case 'pan':
        case 'idle':
          break;
      }

      // The text tool creates on release, wherever the pointer landed.
      if (state.tool.active === 'text' && current.kind === 'idle') {
        const object = createText({ x: point.x, y: point.y, text: '' });
        state.addObject(object);
        state.beginTextEditing(object.id);
        state.setTool('select');
      }

      setGesture(IDLE);
    },
    [pointOf, store],
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const state = store();
      const point = pointOf(event, event.currentTarget);
      const target = objectAt(state.document, point);

      if (target?.type === 'text') {
        state.select(target.id);
        state.beginTextEditing(target.id);
      }
    },
    [pointOf, store],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      const state = store();
      const rect = event.currentTarget.getBoundingClientRect();
      const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      // A pinch gesture arrives as a wheel event with the control key set.
      if (event.ctrlKey || event.metaKey) {
        const next = zoomAbout(
          state.viewport,
          screenPoint,
          zoomStep(state.viewport.zoom, event.deltaY),
        );
        state.setViewport(next);
        return;
      }

      state.panBy(-event.deltaX, -event.deltaY);
    },
    [store],
  );

  return {
    gesture,
    constrain,
    cursor: cursorFor(store().tool.active, overObject, gesture),
    onPointerDown: handleDown,
    onPointerMove: handleMove,
    onPointerUp: handleUp,
    onDoubleClick: handleDoubleClick,
    onWheel: handleWheel,
  };
}

function gestureRectFor(gesture: Gesture, point: Point, constrain: boolean) {
  const advanced = onPointerMove(gesture, point);
  if (advanced.kind !== 'draw') return undefined;

  const width = Math.abs(advanced.current.x - advanced.origin.x);
  const height = Math.abs(advanced.current.y - advanced.origin.y);
  const size = Math.max(width, height);

  return constrain
    ? {
        x: advanced.current.x < advanced.origin.x ? advanced.origin.x - size : advanced.origin.x,
        y: advanced.current.y < advanced.origin.y ? advanced.origin.y - size : advanced.origin.y,
        width: size,
        height: size,
      }
    : {
        x: Math.min(advanced.origin.x, advanced.current.x),
        y: Math.min(advanced.origin.y, advanced.current.y),
        width,
        height,
      };
}
