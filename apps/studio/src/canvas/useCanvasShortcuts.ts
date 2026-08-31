import { ancestorsOf, unionBounds, updateObject, type CanvasDocument } from '@shader/core';
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
  /** Hides or restores the panels. Owned above the store, which holds no layout. */
  readonly onToggleChrome?: () => void;
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

        case 'clear-selection': {
          // Escape steps out of whatever was stepped into. Inside a markup
          // block that is the block itself, before the selection is touched.
          if (state.tool.editingHtmlId) {
            state.endHtmlEditing();
            break;
          }

          // Inside a container, this steps out to it rather than dropping the
          // selection entirely — the way back out of a group.
          const containers = state.selection
            .map((objectId) => ancestorsOf(state.document, objectId)[0]?.id)
            .filter((parentId): parentId is string => parentId !== undefined);

          if (containers.length > 0) state.selectMany([...new Set(containers)]);
          else state.clearSelection();
          break;
        }

        // Framing everything is how you find your work; framing the selection
        // is how you inspect it. One key that guessed between them did the
        // wrong one whenever the selection was not what you had in mind.
        case 'zoom-to-fit': {
          const size = options.viewSize?.();
          if (!size) return;
          const visible = state.document.objects.filter((object) => object.visible);
          state.setViewport(
            fitToBounds(unionBounds(visible), {
              viewWidth: size.width,
              viewHeight: size.height,
            }),
          );
          break;
        }

        case 'zoom-to-selection': {
          const size = options.viewSize?.();
          // Nothing selected is nothing to frame, so the view is left alone.
          if (!size || state.selection.length === 0) return;
          const selected = state.document.objects.filter((object) =>
            state.selection.includes(object.id),
          );
          state.setViewport(
            fitToBounds(unionBounds(selected), {
              viewWidth: size.width,
              viewHeight: size.height,
            }),
          );
          break;
        }

        case 'zoom-reset':
          state.resetViewport();
          break;

        case 'toggle-chrome':
          options.onToggleChrome?.();
          break;

        case 'group':
          state.groupSelection();
          break;

        case 'ungroup':
          state.ungroupSelection();
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
