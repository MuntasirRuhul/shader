import type { CanvasDocument, ShaderCompileFailure, ShaderRegistry } from '@shader/core';
import styles from './CanvasStage.module.css';
import { useShaderCanvas } from './useShaderCanvas';

export interface CanvasStageProps {
  readonly document: CanvasDocument;
  readonly registry: Pick<ShaderRegistry, 'get'>;
  readonly onCompileFailure?: (failure: ShaderCompileFailure) => void;
}

/** The drawing surface, plus an invitation when the canvas is empty. */
export function CanvasStage({ document, registry, onCompileFailure }: CanvasStageProps) {
  const { canvasRef } = useShaderCanvas({
    document,
    registry,
    ...(onCompileFailure ? { onCompileFailure } : {}),
  });

  return (
    <div className={styles.stage}>
      <canvas aria-label="Drawing surface" className={styles.surface} ref={canvasRef} />
      {document.objects.length === 0 && (
        <div className={styles.empty}>
          <p>Choose a shader to place it on the canvas</p>
        </div>
      )}
    </div>
  );
}
