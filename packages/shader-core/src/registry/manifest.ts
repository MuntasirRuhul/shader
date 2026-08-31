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
  /**
   * What the pass's target has to hold. `byte` is eight bits a channel and
   * clamps to 0..1 — right for anything that is a colour. `float` is sixteen
   * and signed, which a simulation needs: a velocity field, a pressure field,
   * or dye brighter than white before it is tone-mapped.
   *
   * Defaults to `byte`, so a pass that draws a picture costs a quarter of the
   * memory a field does.
   */
  readonly precision?: PassPrecision;
  /**
   * The fraction of the object's size this pass runs at, `0..1`. Defaults to
   * 1.
   *
   * A fluid is simulated coarsely and shown finely — the reference experiment
   * solves velocity on a 128 grid and carries dye on a 512 one — because the
   * cost of a solve is quadratic in resolution and the eye reads the dye, not
   * the field pushing it.
   */
  readonly scale?: number;
  /**
   * How many times this pass runs per frame, each run reading what the last
   * one wrote. Defaults to 1.
   *
   * This is what a Jacobi solve is: the same step repeated until the field
   * relaxes. Expressed as a count rather than as twenty near-identical passes,
   * which is what it would otherwise have to be.
   */
  readonly iterations?: number;
}

/** What a pass's target holds. See `ShaderPass.precision`. */
export type PassPrecision = 'byte' | 'float';

export interface PassInput {
  /** The uniform the shader samples it through. */
  readonly uniform: string;
  /** The pass whose output to read. */
  readonly pass: string;
  /**
   * True to read what that pass wrote *last*, rather than what it has written
   * this frame. Required when a pass reads itself, since its current output
   * does not exist yet.
   *
   * For a pass that runs once a frame, "last" is the previous frame. For an
   * iterated pass reading itself, it is the previous iteration — which is what
   * makes a solve a solve, and what makes the first iteration of a frame
   * continue from where the last one ended.
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
