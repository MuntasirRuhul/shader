import {
  defaultValueOf,
  groupParameters,
  isGroupParameter,
  resolveValues,
  type ParameterValue,
  type ParameterValues,
  type ShaderManifest,
} from '@shader/core';
import { Button, Collapsible, Select } from '@shader/design-system';
import { GroupEditor } from './GroupEditor';
import { ParameterRow } from './ParameterRow';
import styles from './ShaderParameters.module.css';
import { useGroupCollapse } from './useGroupCollapse';

export interface ShaderParametersProps {
  readonly manifest: ShaderManifest;
  readonly values: ParameterValues;
  readonly presetId?: string;
  /** Continuous change, e.g. a slider being dragged. */
  readonly onChange: (name: string, value: ParameterValue) => void;
  /** The end of a change, to be recorded as one edit. */
  readonly onCommit: (name: string, value: ParameterValue) => void;
  readonly onResetAll: () => void;
  readonly onApplyPreset: (presetId: string) => void;
}

/**
 * The controls for a shader, generated from its parameter schema.
 *
 * Nothing here names a shader or a parameter. A shader registered after this
 * file was written gets a complete panel because its manifest declares types,
 * groups, and order — which is the whole point of the contract.
 */
export function ShaderParameters({
  manifest,
  values,
  presetId,
  onChange,
  onCommit,
  onResetAll,
  onApplyPreset,
}: ShaderParametersProps) {
  const collapse = useGroupCollapse();
  const resolved = resolveValues(manifest.parameters, values);
  const groups = groupParameters(manifest.parameters);

  const anyChanged = manifest.parameters.some(
    (parameter) =>
      JSON.stringify(resolved[parameter.name]) !== JSON.stringify(defaultValueOf(parameter)),
  );

  return (
    <div className={styles.panel}>
      <div className={styles.presetRow}>
        <span className={styles.presetLabel}>Preset</span>
        <Select
          label="Preset"
          onValueChange={onApplyPreset}
          options={manifest.presets.map((preset) => ({
            value: preset.id,
            label: preset.name,
          }))}
          value={presetId ?? manifest.presets[0]?.id ?? ''}
        />
      </div>

      {groups.map(({ group, parameters }) => (
        <Collapsible
          key={group}
          onOpenChange={(open) => {
            collapse.setOpen(manifest.id, group, open);
          }}
          open={collapse.isOpen(manifest.id, group)}
          title={group}
        >
          {parameters.map((parameter) =>
            isGroupParameter(parameter) ? (
              <GroupEditor
                entries={(resolved[parameter.name] ?? []) as readonly ParameterValues[]}
                key={parameter.name}
                onChange={(entries) => {
                  onChange(parameter.name, entries);
                  onCommit(parameter.name, entries);
                }}
                parameter={parameter}
              />
            ) : (
              <ParameterRow
                isDefault={
                  JSON.stringify(resolved[parameter.name]) ===
                  JSON.stringify(parameter.defaultValue)
                }
                key={parameter.name}
                onChange={(value) => {
                  onChange(parameter.name, value);
                }}
                onCommit={(value) => {
                  onCommit(parameter.name, value);
                }}
                onReset={() => {
                  onCommit(parameter.name, parameter.defaultValue);
                }}
                parameter={parameter}
                value={resolved[parameter.name] ?? parameter.defaultValue}
              />
            ),
          )}
        </Collapsible>
      ))}

      <div className={styles.footer}>
        <Button disabled={!anyChanged} onClick={onResetAll} size="sm">
          Reset all
        </Button>
      </div>
    </div>
  );
}
