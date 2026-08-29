import {
  defaultValues,
  describeMissingShader,
  isShaderFill,
  isSolidFill,
  resolvePreset,
  shaderFill,
  solidFill,
  type ParameterValue,
  type ShaderRegistry,
} from '@shader/core';
import { Button, ColorField } from '@shader/design-system';
import { useEditorStore } from '../store/editorStore';
import { transientChannel } from '../store/transientChannel';
import styles from './Inspector.module.css';
import { ShaderParameters } from './ShaderParameters';

export interface InspectorProps {
  readonly registry: Pick<ShaderRegistry, 'get'>;
  /** The shader offered when replacing a solid fill. */
  readonly defaultShaderId?: string;
}

/**
 * The right panel.
 *
 * It shows the account area, then whichever state the current selection puts
 * it in: nothing selected, several selected, a plain fill, a missing shader,
 * or a shader's parameters.
 */
export function Inspector({ registry, defaultShaderId }: InspectorProps) {
  const document = useEditorStore((state) => state.document);
  const selection = useEditorStore((state) => state.selection);

  const object =
    selection.length === 1
      ? document.objects.find((candidate) => candidate.id === selection[0])
      : undefined;

  return (
    <div className={styles.inspector}>
      <AccountArea />

      <div className={styles.body}>
        {selection.length === 0 && (
          <div className={styles.state}>
            <h2 className={styles.stateTitle}>Nothing selected</h2>
            <p className={styles.stateBody}>
              Select an object on the canvas to edit the shader filling it.
            </p>
          </div>
        )}

        {selection.length > 1 && (
          <div className={styles.state}>
            <h2 className={styles.stateTitle}>{selection.length} objects selected</h2>
            <p className={styles.stateBody}>Select a single object to edit its parameters.</p>
          </div>
        )}

        {object && isSolidFill(object.fill) && (
          <div className={styles.state}>
            <h2 className={styles.stateTitle}>Solid fill</h2>
            <ColorField
              label="Fill colour"
              onValueChange={(color) => {
                useEditorStore.getState().setFill(object.id, solidFill(color));
              }}
              value={object.fill.color}
            />
            {defaultShaderId !== undefined && (
              <Button
                onClick={() => {
                  const manifest = registry.get(defaultShaderId);
                  if (!manifest) return;
                  useEditorStore
                    .getState()
                    .setFill(
                      object.id,
                      shaderFill(manifest.id, resolvePreset(manifest), manifest.presets[0]?.id),
                    );
                }}
                size="sm"
              >
                Use a shader instead
              </Button>
            )}
          </div>
        )}

        {object && isShaderFill(object.fill) && (
          <ShaderPanel objectId={object.id} registry={registry} />
        )}
      </div>
    </div>
  );
}

/** The shader's parameters, or a message when its shader is unavailable. */
function ShaderPanel({
  objectId,
  registry,
}: {
  readonly objectId: string;
  readonly registry: Pick<ShaderRegistry, 'get'>;
}) {
  const document = useEditorStore((state) => state.document);
  const object = document.objects.find((candidate) => candidate.id === objectId);
  if (!object || !isShaderFill(object.fill)) return null;

  const fill = object.fill;
  const manifest = registry.get(fill.shaderId);

  if (!manifest) {
    return (
      <div className={styles.state}>
        <h2 className={styles.stateTitle}>Shader unavailable</h2>
        <p className={`${styles.stateBody} ${styles.missing}`}>
          {describeMissingShader(fill.shaderId)}
        </p>
      </div>
    );
  }

  /**
   * An intermediate value — a slider mid-drag. It reaches the renderer and
   * nowhere else, so neither the document nor the history is touched until
   * the drag ends.
   */
  const change = (name: string, value: ParameterValue) => {
    if (!transientChannel.isDragging) transientChannel.begin();
    transientChannel.push({ objectId, key: name, value });
  };

  /** The end of a change: everything the drag produced becomes one edit. */
  const commit = (name: string, value: ParameterValue) => {
    const pending = transientChannel.isDragging ? transientChannel.end() : [];

    const values: Record<string, ParameterValue> = {};
    for (const edit of pending) {
      if (edit.objectId === objectId) values[edit.key] = edit.value as ParameterValue;
    }
    values[name] = value;

    useEditorStore.getState().setShaderValues(objectId, values);
  };

  return (
    <ShaderParameters
      manifest={manifest}
      onApplyPreset={(presetId) => {
        useEditorStore
          .getState()
          .applyPreset(objectId, resolvePreset(manifest, presetId), presetId);
      }}
      onChange={change}
      onCommit={commit}
      onResetAll={() => {
        useEditorStore
          .getState()
          .applyPreset(objectId, defaultValues(manifest.parameters), 'default');
      }}
      values={fill.values}
      {...(fill.presetId === undefined ? {} : { presetId: fill.presetId })}
    />
  );
}

/**
 * The signed-out account area.
 *
 * A placeholder by design: it renders the shape the interface will take
 * without an authentication or network dependency, so nothing here has to
 * change when accounts arrive — only what fills it.
 */
function AccountArea() {
  return (
    <div className={styles.account}>
      <span aria-hidden="true" className={styles.avatar}>
        ◍
      </span>
      <span className={styles.accountName}>Signed out</span>
      <Button size="sm">Donate</Button>
    </div>
  );
}
