import type { ParameterSchema, ParameterValues } from './parameterSchema';

/**
 * The manifest schema version this application understands.
 *
 * Manifests carry a version so a stored or third-party manifest written against
 * a different vocabulary is refused rather than half-read.
 */
export const MANIFEST_SCHEMA_VERSION = 1;

export interface ShaderPreset {
  readonly id: string;
  readonly name: string;
  /**
   * Values for the shader's parameters. May be partial: anything omitted takes
   * the parameter's declared default.
   */
  readonly values: ParameterValues;
}

/**
 * Everything the application needs to list, render, and edit a shader.
 *
 * Note what is absent: there is no field for a component, a render function, or
 * any other interface code. The inspector builds controls from `parameters`,
 * and the runtime binds uniforms from the same declarations. That is what lets
 * a shader be added without touching the shell, the inspector, or the runtime.
 */
export interface ShaderManifest {
  readonly schemaVersion: number;
  /** Unique across the registry; also how a document references the shader. */
  readonly id: string;
  readonly name: string;
  /** Groups the shader in the library. */
  readonly category: string;
  readonly description?: string;
  /** GLSL fragment source, written against the shader ABI. */
  readonly fragmentSource: string;
  /** Optional vertex source; the runtime supplies a quad stage by default. */
  readonly vertexSource?: string;
  readonly parameters: ParameterSchema;
  /** At least one; the first is used when no preset is chosen. */
  readonly presets: readonly ShaderPreset[];
}

/**
 * Fields a manifest must never carry. A manifest is data; anything that smells
 * like interface code is rejected so the open-closed contract cannot be
 * quietly broken by a shader author.
 */
export const FORBIDDEN_MANIFEST_FIELDS = [
  'component',
  'render',
  'buildPanel',
  'panel',
  'controls',
  'ui',
] as const;
