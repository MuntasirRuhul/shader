/**
 * The vocabulary a shader uses to declare what can be edited about it.
 *
 * A shader ships this schema and nothing else about its interface: the
 * inspector renders controls from these declarations, and the runtime binds
 * uniforms from them. Adding a parameter type means extending this vocabulary,
 * not editing either consumer.
 */

export const PARAMETER_TYPES = ['number', 'boolean', 'color', 'enum', 'vector2', 'group'] as const;

export type ParameterType = (typeof PARAMETER_TYPES)[number];

/** Parameters with no declared group are collected under this heading. */
export const DEFAULT_PARAMETER_GROUP = 'General';

interface BaseParameter {
  /** Unique within its schema; also the uniform name the runtime binds. */
  readonly name: string;
  /** Shown by the inspector. */
  readonly label: string;
  /** The heading this parameter appears under. Defaults to `General`. */
  readonly group?: string;
  /** Optional explanatory text for the inspector. */
  readonly description?: string;
}

export interface NumberParameter extends BaseParameter {
  readonly type: 'number';
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Declares the value is a whole number, e.g. a count. */
  readonly integer?: boolean;
}

export interface BooleanParameter extends BaseParameter {
  readonly type: 'boolean';
  readonly defaultValue: boolean;
}

/** A colour, as a `#rrggbb` string. */
export interface ColorParameter extends BaseParameter {
  readonly type: 'color';
  readonly defaultValue: string;
}

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

export interface EnumParameter extends BaseParameter {
  readonly type: 'enum';
  readonly defaultValue: string;
  readonly options: readonly EnumOption[];
}

export interface Vector2Value {
  readonly x: number;
  readonly y: number;
}

export interface Vector2Parameter extends BaseParameter {
  readonly type: 'vector2';
  readonly defaultValue: Vector2Value;
  readonly min: Vector2Value;
  readonly max: Vector2Value;
  readonly step: number;
}

/** A parameter that can appear inside a repeatable group entry. */
export type LeafParameter =
  NumberParameter | BooleanParameter | ColorParameter | EnumParameter | Vector2Parameter;

/**
 * A repeatable set of entries, each carrying its own parameters — mesh gradient
 * poles, metaball balls, gradient stops.
 *
 * `maxEntries` is required because GLSL uniform arrays are sized at compile
 * time: the runtime allocates for the maximum and binds an active count.
 */
export interface GroupParameter extends BaseParameter {
  readonly type: 'group';
  readonly maxEntries: number;
  readonly minEntries?: number;
  /** The parameters each entry carries. */
  readonly entryParameters: readonly LeafParameter[];
  /** Entries present before the user adds or removes any. */
  readonly defaultEntries: readonly ParameterValues[];
}

export type ShaderParameter = LeafParameter | GroupParameter;

/** A single parameter's value. Plain data so it serializes without help. */
export type LeafParameterValue = number | boolean | string | Vector2Value;

export type ParameterValue = LeafParameterValue | readonly ParameterValues[];

/** A complete or partial set of values, keyed by parameter name. */
export type ParameterValues = Readonly<Record<string, ParameterValue>>;

export type ParameterSchema = readonly ShaderParameter[];

export function isGroupParameter(parameter: ShaderParameter): parameter is GroupParameter {
  return parameter.type === 'group';
}

export function isLeafParameter(parameter: ShaderParameter): parameter is LeafParameter {
  return parameter.type !== 'group';
}

export function isParameterType(value: unknown): value is ParameterType {
  return typeof value === 'string' && (PARAMETER_TYPES as readonly string[]).includes(value);
}

export function parameterGroup(parameter: ShaderParameter): string {
  return parameter.group ?? DEFAULT_PARAMETER_GROUP;
}

/**
 * The schema's parameters collected under their group headings, preserving the
 * order groups and parameters were declared in.
 */
export function groupParameters(
  schema: ParameterSchema,
): { group: string; parameters: readonly ShaderParameter[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, ShaderParameter[]>();

  for (const parameter of schema) {
    const group = parameterGroup(parameter);
    let bucket = byGroup.get(group);
    if (!bucket) {
      bucket = [];
      byGroup.set(group, bucket);
      order.push(group);
    }
    bucket.push(parameter);
  }

  return order.map((group) => ({ group, parameters: byGroup.get(group) ?? [] }));
}

/** The value a parameter takes when nothing else supplies one. */
export function defaultValueOf(parameter: ShaderParameter): ParameterValue {
  return isGroupParameter(parameter) ? parameter.defaultEntries : parameter.defaultValue;
}

/** Every parameter at its declared default. */
export function defaultValues(schema: ParameterSchema): ParameterValues {
  const values: Record<string, ParameterValue> = {};
  for (const parameter of schema) {
    values[parameter.name] = defaultValueOf(parameter);
  }
  return values;
}
