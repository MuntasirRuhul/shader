import { unionBounds, updateObject, type CanvasDocument } from '@shader/core';
import { useEffect } from 'react';
import type { EditorState } from '../store/editorStore';
import { commandFor, isTextEntryFocused } from './keyboard';
import { fitToBounds } from './viewport';

/**
 * Binds canvas shortcuts to the window.
 *
 * Bound at the window rather than the canvas element so a shortcut works
 * wherever focus happens to be in the application — except inside a text
 * entry, which `commandFor` refuses.
 */
export interface ShortcutOptions {
  /** The stage size, needed to fit content into view. */
  readonly viewSize?: () => { width: number; height: number };
}

export function useCanvasShortcuts(store: () => EditorState, options: ShortcutOptions = {}): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = commandFor({
        key: event.key,
        shiftKey: event.shiftKey,
        accelKey: event.metaKey || event.ctrlKey,
        textEntryFocused: isTextEntryFocused(document.activeElement),
      });
      if (!command) return;

      const state = store();

      switch (command.kind) {
        case 'tool':
          state.setTool(command.tool);
          break;

        case 'nudge': {
          if (state.selection.length === 0) return;
          const { dx, dy } = command;
          // The whole nudge is one edit, so holding an arrow key does not fill
          // the history with single-pixel steps.
          state.edit('Move', (doc: CanvasDocument) =>
            state.selection.reduce((next, objectId) => {
              const object = next.objects.find((candidate) => candidate.id === objectId);
              if (!object || object.locked) return next;
              return updateObject(next, objectId, { x: object.x + dx, y: object.y + dy });
            }, doc),
          );
          break;
        }

        case 'delete':
          if (state.selection.length === 0) return;
          state.deleteSelected();
          break;

        case 'undo':
          state.undo();
          break;

        case 'redo':
          state.redo();
          break;

        case 'clear-selection':
          state.clearSelection();
          break;

        case 'zoom-to-fit': {
          const size = options.viewSize?.();
          if (!size) return;
          // Fit the selection when there is one, otherwise the whole scene.
          const subject =
            state.selection.length > 0
              ? state.document.objects.filter((object) => state.selection.includes(object.id))
              : state.document.objects.filter((object) => object.visible);
          state.setViewport(
            fitToBounds(unionBounds(subject), {
              viewWidth: size.width,
              viewHeight: size.height,
            }),
          );
          break;
        }

        case 'zoom-reset':
          state.resetViewport();
          break;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [options, store]);
}
