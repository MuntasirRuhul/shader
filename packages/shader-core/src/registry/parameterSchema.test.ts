import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETER_GROUP,
  defaultValues,
  groupParameters,
  isGroupParameter,
  isLeafParameter,
  isParameterType,
  parameterGroup,
  type ColorParameter,
  type EnumParameter,
  type GroupParameter,
  type NumberParameter,
  type ParameterSchema,
  type Vector2Parameter,
} from './parameterSchema';

const speed: NumberParameter = {
  name: 'speed',
  label: 'Speed',
  type: 'number',
  defaultValue: 0.5,
  min: 0,
  max: 2,
  step: 0.01,
  group: 'Motion',
};

const tint: ColorParameter = {
  name: 'tint',
  label: 'Tint',
  type: 'color',
  defaultValue: '#4d7cff',
  group: 'Colour',
};

const blendMode: EnumParameter = {
  name: 'blendMode',
  label: 'Blend mode',
  type: 'enum',
  defaultValue: 'normal',
  options: [
    { value: 'normal', label: 'Normal' },
    { value: 'screen', label: 'Screen' },
  ],
  group: 'Colour',
};

const center: Vector2Parameter = {
  name: 'center',
  label: 'Center',
  type: 'vector2',
  defaultValue: { x: 0.5, y: 0.5 },
  min: { x: 0, y: 0 },
  max: { x: 1, y: 1 },
  step: 0.01,
};

const poles: GroupParameter = {
  name: 'poles',
  label: 'Colour poles',
  type: 'group',
  maxEntries: 8,
  minEntries: 1,
  entryParameters: [tint, center],
  defaultEntries: [{ tint: '#ff0000', center: { x: 0.25, y: 0.25 } }],
  group: 'Colour',
};

describe('parameter type vocabulary', () => {
  it('recognises every supported type', () => {
    for (const type of ['number', 'boolean', 'color', 'enum', 'vector2', 'group']) {
      expect(isParameterType(type)).toBe(true);
    }
  });

  it('rejects a type outside the vocabulary', () => {
    expect(isParameterType('gradient')).toBe(false);
    expect(isParameterType(42)).toBe(false);
    expect(isParameterType(undefined)).toBe(false);
  });

  it('distinguishes repeatable groups from leaf parameters', () => {
    expect(isGroupParameter(poles)).toBe(true);
    expect(isGroupParameter(speed)).toBe(false);
    expect(isLeafParameter(speed)).toBe(true);
    expect(isLeafParameter(poles)).toBe(false);
  });
});

describe('parameter grouping and ordering', () => {
  const schema: ParameterSchema = [speed, tint, center, blendMode];

  it('preserves the declared order of groups', () => {
    expect(groupParameters(schema).map((entry) => entry.group)).toEqual([
      'Motion',
      'Colour',
      DEFAULT_PARAMETER_GROUP,
    ]);
  });

  it('preserves the declared order of parameters within a group', () => {
    const colour = groupParameters(schema).find((entry) => entry.group === 'Colour');

    expect(colour?.parameters.map((parameter) => parameter.name)).toEqual(['tint', 'blendMode']);
  });

  it('assigns an ungrouped parameter to the default group rather than dropping it', () => {
    expect(parameterGroup(center)).toBe(DEFAULT_PARAMETER_GROUP);

    const names = groupParameters(schema)
      .flatMap((entry) => entry.parameters)
      .map((parameter) => parameter.name);
    expect(names).toContain('center');
  });

  it('keeps every parameter across all groups', () => {
    const total = groupParameters(schema).reduce(
      (count, entry) => count + entry.parameters.length,
      0,
    );

    expect(total).toBe(schema.length);
  });
});

describe('default values', () => {
  it('reads each leaf parameter default', () => {
    expect(defaultValues([speed, tint, blendMode])).toEqual({
      speed: 0.5,
      tint: '#4d7cff',
      blendMode: 'normal',
    });
  });

  it('reads a vector default', () => {
    expect(defaultValues([center])).toEqual({ center: { x: 0.5, y: 0.5 } });
  });

  it('reads a repeatable group default as its entries', () => {
    expect(defaultValues([poles])).toEqual({
      poles: [{ tint: '#ff0000', center: { x: 0.25, y: 0.25 } }],
    });
  });
});

describe('schema is plain serializable data', () => {
  it('round-trips through JSON unchanged', () => {
    const schema: ParameterSchema = [speed, tint, blendMode, center, poles];

    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});
