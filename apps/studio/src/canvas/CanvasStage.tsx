import type { ShaderCompileFailure, ShaderRegistry } from '@shader/core';
import { useCallback, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import styles from './CanvasStage.module.css';
import { groundStyle } from './ground';
import { SelectionOverlay } from './SelectionOverlay';
import { TextEditor } from './TextEditor';
import { fitTextBox } from './textRasterizer';
import { useCanvasPointer } from './useCanvasPointer';
import { useCanvasShortcuts } from './useCanvasShortcuts';
import { useShaderCanvas } from './useShaderCanvas';
import { zoomPercent } from './viewport';

export interface CanvasStageProps {
  readonly registry: Pick<ShaderRegistry, 'get'>;
  readonly onCompileFailure?: (failure: ShaderCompileFailure) => void;
  /** Hides or restores the panels; the layout is owned above the store. */
  readonly onToggleChrome?: () => void;
}

/** The drawing surface, its selection overlay, and the pointer interaction. */
export function CanvasStage({ registry, onCompileFailure, onToggleChrome }: CanvasStageProps) {
  const document = useEditorStore((state) => state.document);
  const selection = useEditorStore((state) => state.selection);
  const viewport = useEditorStore((state) => state.viewport);
  const editingTextId = useEditorStore((state) => state.tool.editingTextId);

  const { canvasRef } = useShaderCanvas({
    document,
    registry,
    viewport,
    ...(onCompileFailure ? { onCompileFailure } : {}),
  });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewSize = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  const pointer = useCanvasPointer(useEditorStore.getState);
  useCanvasShortcuts(useEditorStore.getState, {
    viewSize,
    ...(onToggleChrome ? { onToggleChrome } : {}),
  });

  return (
    <div
      className={styles.stage}
      onDoubleClick={pointer.onDoubleClick}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onWheel={pointer.onWheel}
      ref={stageRef}
      style={{ cursor: pointer.cursor }}
    >
      <div aria-hidden className={styles.ground} style={groundStyle(viewport)} />

      <canvas aria-label="Drawing surface" className={styles.surface} ref={canvasRef} />

      <SelectionOverlay
        constrain={pointer.constrain}
        document={document}
        editingId={editingTextId}
        gesture={pointer.gesture}
        selection={selection}
        viewport={viewport}
      />

      {editingTextId !== null && (
        <TextEditor
          document={document}
          editingId={editingTextId}
          onCancel={(objectId) => {
            const state = useEditorStore.getState();
            state.endTextEditing();
            // A text object that was never given content leaves nothing behind.
            const object = state.document.objects.find((candidate) => candidate.id === objectId);
            if (object?.type === 'text' && object.text === '') {
              state.selectMany([objectId]);
              state.deleteSelected();
            }
          }}
          onCommit={(objectId, text) => {
            const state = useEditorStore.getState();
            state.endTextEditing();

            if (text.trim() === '') {
              state.selectMany([objectId]);
              state.deleteSelected();
              return;
            }

            const found = state.document.objects.find((candidate) => candidate.id === objectId);
            // A box that does not fit its words is what makes text feel wrong.
            // A new one takes the width of its content; one that already had
            // text keeps the width it was given and grows only downward.
            const box =
              found?.type === 'text'
                ? fitTextBox(text, found.textSettings, found.text === '' ? undefined : found.width)
                : undefined;

            state.updateObject(
              objectId,
              { text, name: text.slice(0, 40), ...(box ?? {}) },
              'Edit text',
            );
          }}
          viewport={viewport}
        />
      )}

      <div className={styles.zoomLevel}>{zoomPercent(viewport.zoom)}%</div>
    </div>
  );
}
