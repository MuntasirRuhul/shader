import {
  isGroupParameter,
  type GroupParameter,
  type LeafParameter,
  type ParameterSchema,
  type ParameterValues,
  type Vector2Value,
} from '../../registry/parameterSchema';
import { resolveValues } from '../../registry/presets';
import type { GlContext, GlUniformLocation } from './glTypes';

/**
 * Binds parameter values to uniforms by reading the schema. There is no
 * shader-specific code here: a new shader is bound correctly because its
 * manifest declares types, not because anything was added to this file.
 */

/** `#rrggbb` to linear 0..1 components. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** The GLSL type a leaf parameter binds as. */
export function glslTypeOf(parameter: LeafParameter): string {
  switch (parameter.type) {
    case 'number':
      return parameter.integer === true ? 'int' : 'float';
    case 'boolean':
      return 'bool';
    case 'color':
      return 'vec3';
    case 'enum':
      // Enums bind as an index so a shader can branch on them cheaply.
      return 'int';
    case 'vector2':
      return 'vec2';
  }
}

/** The uniform name a group's entry parameter takes, e.g. `poles_color`. */
export function groupEntryUniform(group: GroupParameter, entry: LeafParameter): string {
  return `${group.name}_${entry.name}`;
}

/** The uniform carrying how many entries of a group are active. */
export function groupCountUniform(group: GroupParameter): string {
  return `${group.name}_count`;
}

/**
 * The uniform declarations a shader's parameters require, prepended to its
 * source so a shader author never writes them by hand.
 *
 * Repeatable groups become fixed-size arrays sized at `maxEntries` — GLSL sizes
 * arrays at compile time — plus a count uniform naming how many are live. This
 * is why changing the number of entries never triggers a recompile.
 */
export function declareUniforms(schema: ParameterSchema): string {
  const lines: string[] = [];

  for (const parameter of schema) {
    if (!isGroupParameter(parameter)) {
      lines.push(`uniform ${glslTypeOf(parameter)} ${parameter.name};`);
      continue;
    }

    const size = String(parameter.maxEntries);
    for (const entry of parameter.entryParameters) {
      lines.push(`uniform ${glslTypeOf(entry)} ${groupEntryUniform(parameter, entry)}[${size}];`);
    }
    lines.push(`uniform int ${groupCountUniform(parameter)};`);
  }

  return lines.join('\n');
}

type LocationLookup = (name: string) => GlUniformLocation | null;

function bindLeaf(
  gl: GlContext,
  location: GlUniformLocation | null,
  parameter: LeafParameter,
  value: unknown,
): void {
  if (location === null) return;

  switch (parameter.type) {
    case 'number': {
      const numeric = typeof value === 'number' ? value : parameter.defaultValue;
      if (parameter.integer === true) gl.uniform1i(location, Math.round(numeric));
      else gl.uniform1f(location, numeric);
      return;
    }
    case 'boolean': {
      const flag = typeof value === 'boolean' ? value : parameter.defaultValue;
      gl.uniform1i(location, flag ? 1 : 0);
      return;
    }
    case 'color': {
      const hex = typeof value === 'string' ? value : parameter.defaultValue;
      const [r, g, b] = hexToRgb(hex);
      gl.uniform3f(location, r, g, b);
      return;
    }
    case 'enum': {
      const chosen = typeof value === 'string' ? value : parameter.defaultValue;
      const index = parameter.options.findIndex((option) => option.value === chosen);
      gl.uniform1i(location, index < 0 ? 0 : index);
      return;
    }
    case 'vector2': {
      const vector = (value ?? parameter.defaultValue) as Vector2Value;
      const x = typeof vector.x === 'number' ? vector.x : parameter.defaultValue.x;
      const y = typeof vector.y === 'number' ? vector.y : parameter.defaultValue.y;
      gl.uniform2f(location, x, y);
    }
  }
}

/** Packs a group's entries into the flat arrays the shader declares. */
function bindGroup(
  gl: GlContext,
  lookup: LocationLookup,
  group: GroupParameter,
  value: unknown,
): void {
  const entries = Array.isArray(value) ? (value as readonly ParameterValues[]) : [];
  const active = Math.min(entries.length, group.maxEntries);

  for (const entry of group.entryParameters) {
    const location = lookup(groupEntryUniform(group, entry));
    if (location === null) continue;

    const componentCount = entry.type === 'color' ? 3 : entry.type === 'vector2' ? 2 : 1;
    const packed = new Float32Array(group.maxEntries * componentCount);

    for (let index = 0; index < active; index += 1) {
      const resolved = resolveValues(group.entryParameters, entries[index] ?? {});
      const raw = resolved[entry.name];
      const offset = index * componentCount;

      switch (entry.type) {
        case 'color': {
          const [r, g, b] = hexToRgb(typeof raw === 'string' ? raw : entry.defaultValue);
          packed[offset] = r;
          packed[offset + 1] = g;
          packed[offset + 2] = b;
          break;
        }
        case 'vector2': {
          const vector = (raw ?? entry.defaultValue) as Vector2Value;
          packed[offset] = vector.x;
          packed[offset + 1] = vector.y;
          break;
        }
        case 'boolean':
          packed[offset] = (typeof raw === 'boolean' ? raw : entry.defaultValue) ? 1 : 0;
          break;
        case 'enum': {
          const chosen = typeof raw === 'string' ? raw : entry.defaultValue;
          packed[offset] = Math.max(
            0,
            entry.options.findIndex((option) => option.value === chosen),
          );
          break;
        }
        case 'number':
          packed[offset] = typeof raw === 'number' ? raw : entry.defaultValue;
          break;
      }
    }

    if (componentCount === 3) gl.uniform3fv(location, packed);
    else if (componentCount === 2) gl.uniform2fv(location, packed);
    else gl.uniform1fv(location, packed);
  }

  gl.uniform1i(lookup(groupCountUniform(group)), active);
}

/**
 * Binds a complete value set to the program's uniforms.
 *
 * Values are resolved against the schema first, so a parameter the caller
 * omitted binds its declared default rather than being left stale from the
 * previous object drawn with this program.
 */
export function bindParameters(
  gl: GlContext,
  lookup: LocationLookup,
  schema: ParameterSchema,
  values: ParameterValues,
): void {
  const resolved = resolveValues(schema, values);

  for (const parameter of schema) {
    const value = resolved[parameter.name];

    if (isGroupParameter(parameter)) {
      bindGroup(gl, lookup, parameter, value);
      continue;
    }

    bindLeaf(gl, lookup(parameter.name), parameter, value);
  }
}
