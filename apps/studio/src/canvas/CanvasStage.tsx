import type { ShaderCompileFailure, ShaderRegistry } from '@shader/core';
import { useCallback, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import styles from './CanvasStage.module.css';
import { SelectionOverlay } from './SelectionOverlay';
import { TextEditor } from './TextEditor';
import { useCanvasPointer } from './useCanvasPointer';
import { useCanvasShortcuts } from './useCanvasShortcuts';
import { useShaderCanvas } from './useShaderCanvas';
import { zoomPercent } from './viewport';

export interface CanvasStageProps {
  readonly registry: Pick<ShaderRegistry, 'get'>;
  readonly onCompileFailure?: (failure: ShaderCompileFailure) => void;
}

/** The drawing surface, its selection overlay, and the pointer interaction. */
export function CanvasStage({ registry, onCompileFailure }: CanvasStageProps) {
  const document = useEditorStore((state) => state.document);
  const selection = useEditorStore((state) => state.selection);
  const viewport = useEditorStore((state) => state.viewport);
  const editingTextId = useEditorStore((state) => state.tool.editingTextId);

  const { canvasRef } = useShaderCanvas({
    document,
    registry,
    zoom: viewport.zoom,
    ...(onCompileFailure ? { onCompileFailure } : {}),
  });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewSize = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  const pointer = useCanvasPointer(useEditorStore.getState);
  useCanvasShortcuts(useEditorStore.getState, { viewSize });

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
      <canvas aria-label="Drawing surface" className={styles.surface} ref={canvasRef} />

      <SelectionOverlay
        constrain={pointer.constrain}
        document={document}
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

            state.updateObject(objectId, { text, name: text.slice(0, 40) }, 'Edit text');
          }}
          viewport={viewport}
        />
      )}

      {document.objects.length === 0 && (
        <div className={styles.empty}>
          <p>Choose a shader, or draw a shape with the shape tool</p>
        </div>
      )}

      <div className={styles.zoomLevel}>{zoomPercent(viewport.zoom)}%</div>
    </div>
  );
}
