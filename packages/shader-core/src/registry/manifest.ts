import type { ParameterSchema, ParameterValues } from './parameterSchema';
import type { SimulationDeclaration } from './simulation';

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
  /**
   * State the shader owns between frames, and how to advance it. Optional: a
   * manifest declaring neither takes exactly the path it took before
   * simulation existed.
   */
  readonly simulation?: SimulationDeclaration;
  /**
   * Rendering passes, in order. Optional: a manifest declaring none renders
   * its `fragmentSource` straight to the object, as it always did.
   */
  readonly passes?: readonly ShaderPass[];
}

/**
 * One step of a shader's rendering.
 *
 * A pass reads an earlier pass's output from this frame, or its own from the
 * previous one — which is how a simulation held on the GPU, like a height
 * field, carries forward. The last pass is what fills the object.
 */
export interface ShaderPass {
  /** Unique within the manifest; how a later pass names this one. */
  readonly name: string;
  readonly fragmentSource: string;
  /**
   * What this pass samples. Each entry binds a texture the shader reads under
   * the given uniform name.
   */
  readonly reads?: readonly PassInput[];
}

export interface PassInput {
  /** The uniform the shader samples it through. */
  readonly uniform: string;
  /** The pass whose output to read. */
  readonly pass: string;
  /**
   * True to read what that pass wrote on the previous frame rather than this
   * one. Required when a pass reads itself, since its current output does not
   * exist yet.
   */
  readonly previousFrame?: boolean;
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
