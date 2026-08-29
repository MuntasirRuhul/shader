import type { ShaderManifest, ShaderPreset } from './manifest';
import {
  defaultValueOf,
  isGroupParameter,
  type ParameterSchema,
  type ParameterValue,
  type ParameterValues,
} from './parameterSchema';

/**
 * A complete value set for a schema: the supplied values, with every omitted
 * parameter filled from its declared default.
 *
 * Presets are allowed to be partial so a preset only has to state what makes it
 * distinctive. Resolution is where "omitted means default" is applied, once,
 * rather than at every reader.
 */
export function resolveValues(
  schema: ParameterSchema,
  supplied: ParameterValues = {},
): ParameterValues {
  const resolved: Record<string, ParameterValue> = {};

  for (const parameter of schema) {
    const value = supplied[parameter.name];

    if (value === undefined) {
      resolved[parameter.name] = defaultValueOf(parameter);
      continue;
    }

    if (isGroupParameter(parameter) && Array.isArray(value)) {
      // Each entry is resolved against the group's own entry schema, so a
      // partially specified entry still comes back complete.
      resolved[parameter.name] = (value as readonly ParameterValues[]).map((entry) =>
        resolveValues(parameter.entryParameters, entry),
      );
      continue;
    }

    resolved[parameter.name] = value;
  }

  return resolved;
}

/** The preset a shader starts from when the caller names none. */
export function defaultPreset(manifest: ShaderManifest): ShaderPreset | undefined {
  return manifest.presets[0];
}

export function findPreset(manifest: ShaderManifest, presetId: string): ShaderPreset | undefined {
  return manifest.presets.find((preset) => preset.id === presetId);
}

/** A complete value set for one of the shader's presets. */
export function resolvePreset(manifest: ShaderManifest, presetId?: string): ParameterValues {
  const preset = presetId === undefined ? defaultPreset(manifest) : findPreset(manifest, presetId);
  return resolveValues(manifest.parameters, preset?.values ?? {});
}
