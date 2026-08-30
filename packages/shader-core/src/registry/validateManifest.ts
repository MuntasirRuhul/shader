import {
  FORBIDDEN_MANIFEST_FIELDS,
  MANIFEST_SCHEMA_VERSION,
  type ShaderManifest,
  type ShaderPass,
  type ShaderPreset,
} from './manifest';
import {
  isGroupParameter,
  isParameterType,
  type LeafParameter,
  type ParameterSchema,
  type ParameterValues,
  type ShaderParameter,
  type Vector2Value,
} from './parameterSchema';

export interface ManifestError {
  /** Where the fault is, e.g. `parameters.speed.max`. */
  readonly path: string;
  readonly message: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVector2(value: unknown): value is Vector2Value {
  return isPlainObject(value) && typeof value.x === 'number' && typeof value.y === 'number';
}

function requireText(
  value: unknown,
  path: string,
  errors: ManifestError[],
  field: string,
): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ path, message: `Missing required field "${field}".` });
    return false;
  }
  return true;
}

/**
 * Checks a value against a leaf parameter's declared constraints, returning the
 * reason it is invalid or `null` when it is acceptable.
 */
export function leafValueError(parameter: LeafParameter, value: unknown): string | null {
  switch (parameter.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `expected a number, received ${JSON.stringify(value)}`;
      }
      if (value < parameter.min || value > parameter.max) {
        return `${String(value)} is outside the declared range ${String(parameter.min)}–${String(parameter.max)}`;
      }
      if (parameter.integer === true && !Number.isInteger(value)) {
        return `${String(value)} is not a whole number`;
      }
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean'
        ? null
        : `expected a boolean, received ${JSON.stringify(value)}`;
    case 'color':
      return typeof value === 'string' && HEX_COLOR.test(value)
        ? null
        : `expected a #rrggbb colour, received ${JSON.stringify(value)}`;
    case 'enum': {
      const allowed = parameter.options.map((option) => option.value);
      return allowed.includes(value as string)
        ? null
        : `${JSON.stringify(value)} is not one of the declared options (${allowed.join(', ')})`;
    }
    case 'vector2': {
      if (!isVector2(value)) return `expected an {x, y} vector, received ${JSON.stringify(value)}`;
      if (
        value.x < parameter.min.x ||
        value.x > parameter.max.x ||
        value.y < parameter.min.y ||
        value.y > parameter.max.y
      ) {
        return `(${String(value.x)}, ${String(value.y)}) is outside the declared range`;
      }
      return null;
    }
  }
}

function validateLeafParameter(
  parameter: LeafParameter,
  path: string,
  errors: ManifestError[],
): void {
  if (parameter.type === 'number') {
    if (parameter.min > parameter.max) {
      errors.push({ path: `${path}.min`, message: 'Minimum is greater than maximum.' });
    }
    if (!(parameter.step > 0)) {
      errors.push({ path: `${path}.step`, message: 'Step must be greater than zero.' });
    }
  }

  if (parameter.type === 'enum') {
    if (parameter.options.length === 0) {
      errors.push({
        path: `${path}.options`,
        message: 'An enum must declare at least one option.',
      });
      return;
    }
    const seen = new Set<string>();
    for (const option of parameter.options) {
      if (seen.has(option.value)) {
        errors.push({
          path: `${path}.options`,
          message: `Duplicate option value "${option.value}".`,
        });
      }
      seen.add(option.value);
    }
  }

  const defaultError = leafValueError(parameter, parameter.defaultValue);
  if (defaultError !== null) {
    errors.push({ path: `${path}.defaultValue`, message: `Default value ${defaultError}.` });
  }
}

function validateParameter(
  parameter: ShaderParameter,
  path: string,
  errors: ManifestError[],
  allowNesting: boolean,
): void {
  requireText(parameter.name, `${path}.name`, errors, 'name');
  requireText(parameter.label, `${path}.label`, errors, 'label');

  if (!isParameterType(parameter.type)) {
    errors.push({
      path: `${path}.type`,
      message: `Unsupported parameter type ${JSON.stringify(parameter.type)}.`,
    });
    return;
  }

  if (!isGroupParameter(parameter)) {
    validateLeafParameter(parameter, path, errors);
    return;
  }

  if (!allowNesting) {
    errors.push({ path: `${path}.type`, message: 'A repeatable group cannot contain another.' });
    return;
  }

  // The runtime binds a fixed-size uniform array, so the ceiling is required.
  if (typeof parameter.maxEntries !== 'number' || parameter.maxEntries < 1) {
    errors.push({
      path: `${path}.maxEntries`,
      message: 'A repeatable group must declare maxEntries of at least 1.',
    });
  }
  if (parameter.minEntries !== undefined && parameter.minEntries > parameter.maxEntries) {
    errors.push({
      path: `${path}.minEntries`,
      message: 'Minimum entries exceeds maxEntries.',
    });
  }
  if (parameter.entryParameters.length === 0) {
    errors.push({
      path: `${path}.entryParameters`,
      message: 'A repeatable group must declare at least one entry parameter.',
    });
  }

  for (const entryParameter of parameter.entryParameters) {
    validateParameter(entryParameter, `${path}.${entryParameter.name}`, errors, false);
  }

  if (parameter.defaultEntries.length > parameter.maxEntries) {
    errors.push({
      path: `${path}.defaultEntries`,
      message: `Declares ${String(parameter.defaultEntries.length)} default entries, exceeding maxEntries of ${String(parameter.maxEntries)}.`,
    });
  }

  parameter.defaultEntries.forEach((entry, index) => {
    validateValues(
      parameter.entryParameters,
      entry,
      `${path}.defaultEntries[${String(index)}]`,
      errors,
    );
  });
}

/** Checks a set of values against a schema. Omitted parameters are allowed. */
export function validateValues(
  schema: ParameterSchema,
  values: ParameterValues,
  path: string,
  errors: ManifestError[],
): void {
  const byName = new Map(schema.map((parameter) => [parameter.name, parameter]));

  for (const [name, value] of Object.entries(values)) {
    const parameter = byName.get(name);
    if (!parameter) {
      errors.push({
        path: `${path}.${name}`,
        message: `No parameter named "${name}" is declared.`,
      });
      continue;
    }

    if (isGroupParameter(parameter)) {
      if (!Array.isArray(value)) {
        errors.push({ path: `${path}.${name}`, message: 'Expected a list of entries.' });
        continue;
      }
      if (value.length > parameter.maxEntries) {
        errors.push({
          path: `${path}.${name}`,
          message: `Has ${String(value.length)} entries, exceeding maxEntries of ${String(parameter.maxEntries)}.`,
        });
      }
      (value as readonly ParameterValues[]).forEach((entry, index) => {
        validateValues(
          parameter.entryParameters,
          entry,
          `${path}.${name}[${String(index)}]`,
          errors,
        );
      });
      continue;
    }

    const reason = leafValueError(parameter, value);
    if (reason !== null) {
      errors.push({ path: `${path}.${name}`, message: `Value ${reason}.` });
    }
  }
}

function validatePreset(
  preset: ShaderPreset,
  schema: ParameterSchema,
  index: number,
  errors: ManifestError[],
): void {
  const path = `presets[${String(index)}]`;
  requireText(preset.id, `${path}.id`, errors, 'id');
  requireText(preset.name, `${path}.name`, errors, 'name');

  if (!isPlainObject(preset.values)) {
    errors.push({ path: `${path}.values`, message: 'Preset values must be an object.' });
    return;
  }

  validateValues(schema, preset.values, `${path} "${preset.name}"`, errors);
}

/**
 * Every reason a manifest cannot be registered. An empty array means it is
 * valid. Errors are collected rather than thrown one at a time so a shader
 * author sees every fault at once.
 */

/**
 * State and its advance are declared together or not at all: one without the
 * other is a shader that either never moves or has nothing to move.
 */
function validateSimulation(manifest: ShaderManifest, errors: ManifestError[]): void {
  const simulation = manifest.simulation;
  if (simulation === undefined) return;

  const hasInitial = typeof simulation.initial === 'object' && simulation.initial !== null;
  const hasAdvance = typeof simulation.advance === 'function';

  if (!hasInitial) {
    errors.push({
      path: 'simulation.initial',
      message: 'Declares an advance but no initial state. A simulation needs both.',
    });
  }
  if (!hasAdvance) {
    errors.push({
      path: 'simulation.advance',
      message: 'Declares an initial state but no advance. A simulation needs both.',
    });
  }
  if (!hasInitial) return;

  // State binds through the same uniforms parameters do, so a shared name
  // would leave one silently overwriting the other.
  const parameters: ParameterSchema = Array.isArray(manifest.parameters) ? manifest.parameters : [];
  const parameterNames = new Set(parameters.map((parameter) => parameter.name));
  for (const name of Object.keys(simulation.initial)) {
    if (parameterNames.has(name)) {
      errors.push({
        path: `simulation.initial.${name}`,
        message: `State value "${name}" collides with a parameter of the same name. Both bind as uniforms, so one would overwrite the other.`,
      });
    }
  }
}

/**
 * Passes run in order, so a pass can only read one that has already produced
 * something — an earlier pass this frame, or any pass as of the previous one.
 */
function validatePasses(manifest: ShaderManifest, errors: ManifestError[]): void {
  if (manifest.passes === undefined) return;

  const passes: readonly ShaderPass[] | undefined = Array.isArray(manifest.passes)
    ? manifest.passes
    : undefined;

  if (!passes || passes.length === 0) {
    errors.push({ path: 'passes', message: 'Declares "passes" but lists none.' });
    return;
  }

  const seen = new Set<string>();
  passes.forEach((pass, index) => {
    requireText(
      pass.name,
      `passes[${String(index)}].name`,
      errors,
      `passes[${String(index)}].name`,
    );
    requireText(
      pass.fragmentSource,
      `passes[${String(index)}].fragmentSource`,
      errors,
      `passes[${String(index)}].fragmentSource`,
    );

    if (seen.has(pass.name)) {
      errors.push({
        path: `passes[${String(index)}].name`,
        message: `Two passes are named "${pass.name}". A pass is referenced by name, so names must be distinct.`,
      });
    }
    seen.add(pass.name);
  });

  const positionOf = new Map(passes.map((pass, index) => [pass.name, index]));

  passes.forEach((pass, index) => {
    for (const input of pass.reads ?? []) {
      const source = positionOf.get(input.pass);

      if (source === undefined) {
        errors.push({
          path: `passes[${String(index)}].reads`,
          message: `Pass "${pass.name}" reads "${input.pass}", which this shader does not declare.`,
        });
        continue;
      }

      if (input.previousFrame === true) continue;

      if (source === index) {
        errors.push({
          path: `passes[${String(index)}].reads`,
          message: `Pass "${pass.name}" reads itself from the current frame, which does not exist yet. Read the previous frame instead.`,
        });
      } else if (source > index) {
        errors.push({
          path: `passes[${String(index)}].reads`,
          message: `Pass "${pass.name}" reads "${input.pass}", which runs after it. A pass can only read one that has already run.`,
        });
      }
    }
  });
}

export function validateManifest(manifest: ShaderManifest): ManifestError[] {
  const errors: ManifestError[] = [];

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push({
      path: 'schemaVersion',
      message: `Declares schema version ${JSON.stringify(manifest.schemaVersion)}, but this application supports version ${String(MANIFEST_SCHEMA_VERSION)}.`,
    });
  }

  requireText(manifest.id, 'id', errors, 'id');
  requireText(manifest.name, 'name', errors, 'name');
  requireText(manifest.category, 'category', errors, 'category');
  requireText(manifest.fragmentSource, 'fragmentSource', errors, 'fragmentSource');

  validateSimulation(manifest, errors);
  validatePasses(manifest, errors);

  // A manifest is data. Anything resembling interface code breaks the contract
  // that a shader can be added without touching the inspector.
  const record = manifest as unknown as Record<string, unknown>;
  for (const field of FORBIDDEN_MANIFEST_FIELDS) {
    if (record[field] !== undefined) {
      errors.push({
        path: field,
        message: `A manifest must not supply interface code ("${field}"). The inspector builds controls from the parameter schema.`,
      });
    }
  }

  // `Array.isArray` widens a readonly array to `any[]`, so the checked values
  // are re-bound to their declared types before use.
  const parameters: ParameterSchema | undefined = Array.isArray(manifest.parameters)
    ? manifest.parameters
    : undefined;
  const presets: readonly ShaderPreset[] | undefined = Array.isArray(manifest.presets)
    ? manifest.presets
    : undefined;

  if (!parameters) {
    errors.push({ path: 'parameters', message: 'Missing required field "parameters".' });
  } else {
    const seen = new Set<string>();
    for (const parameter of parameters) {
      if (seen.has(parameter.name)) {
        errors.push({
          path: `parameters.${parameter.name}`,
          message: `Duplicate parameter name "${parameter.name}".`,
        });
      }
      seen.add(parameter.name);
      validateParameter(parameter, `parameters.${parameter.name}`, errors, true);
    }
  }

  if (!presets || presets.length === 0) {
    errors.push({ path: 'presets', message: 'A manifest must declare at least one preset.' });
  } else if (parameters) {
    const seen = new Set<string>();
    presets.forEach((preset, index) => {
      if (seen.has(preset.id)) {
        errors.push({
          path: `presets[${String(index)}].id`,
          message: `Duplicate preset id "${preset.id}".`,
        });
      }
      seen.add(preset.id);
      validatePreset(preset, parameters, index, errors);
    });
  }

  return errors;
}

export function formatManifestErrors(shaderId: string, errors: readonly ManifestError[]): string {
  const lines = errors.map((error) => `  ${error.path}: ${error.message}`).join('\n');
  return `Shader "${shaderId}" has ${String(errors.length)} manifest error(s):\n${lines}`;
}
