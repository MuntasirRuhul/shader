import { beforeEach, describe, expect, it } from 'vitest';
import type { ParameterSchema } from '../../registry/parameterSchema';
import { sampleParameters } from '../../registry/testFixtures';
import { ProgramCache } from './ProgramCache';
import { FakeGl } from './testDouble';
import {
  bindParameters,
  declareUniforms,
  glslTypeOf,
  groupCountUniform,
  groupEntryUniform,
  hexToRgb,
} from './uniformBinding';

let gl: FakeGl;
const lookup = (name: string) => gl.getUniformLocation({}, name);

beforeEach(() => {
  gl = new FakeGl();
});

function bind(schema: ParameterSchema, values: Parameters<typeof bindParameters>[3]) {
  bindParameters(gl, lookup, schema, values);
}

/** Float32 storage rounds, so packed arrays are compared at float precision. */
function packed(name: string): number[] {
  const value = gl.lastWriteTo(name)?.value;
  if (typeof value === 'number' || value === undefined) {
    throw new Error(`${name} was not bound as an array`);
  }
  return [...value].map((component) => Number(component.toFixed(5)));
}

describe('hexToRgb', () => {
  it('converts a hex colour to unit components', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
  });

  it('handles black and white', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
  });

  it('is case insensitive', () => {
    expect(hexToRgb('#AABBCC')).toEqual(hexToRgb('#aabbcc'));
  });

  it('falls back to black for a malformed value', () => {
    expect(hexToRgb('nonsense')).toEqual([0, 0, 0]);
  });
});

describe('GLSL type mapping', () => {
  it('maps each parameter type to its GLSL type', () => {
    expect(
      glslTypeOf({
        name: 'a',
        label: 'A',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.1,
      }),
    ).toBe('float');
    expect(
      glslTypeOf({
        name: 'a',
        label: 'A',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 4,
        step: 1,
        integer: true,
      }),
    ).toBe('int');
    expect(glslTypeOf({ name: 'b', label: 'B', type: 'boolean', defaultValue: true })).toBe('bool');
    expect(glslTypeOf({ name: 'c', label: 'C', type: 'color', defaultValue: '#000000' })).toBe(
      'vec3',
    );
    expect(
      glslTypeOf({
        name: 'd',
        label: 'D',
        type: 'enum',
        defaultValue: 'x',
        options: [{ value: 'x', label: 'X' }],
      }),
    ).toBe('int');
    expect(
      glslTypeOf({
        name: 'e',
        label: 'E',
        type: 'vector2',
        defaultValue: { x: 0, y: 0 },
        min: { x: 0, y: 0 },
        max: { x: 1, y: 1 },
        step: 0.1,
      }),
    ).toBe('vec2');
  });
});

describe('uniform declarations', () => {
  it('declares one uniform per leaf parameter', () => {
    const declarations = declareUniforms(sampleParameters);

    expect(declarations).toContain('uniform float speed;');
    expect(declarations).toContain('uniform bool animate;');
    expect(declarations).toContain('uniform vec3 background;');
    expect(declarations).toContain('uniform int blendMode;');
  });

  it('declares a group as fixed-size arrays sized at maxEntries', () => {
    const declarations = declareUniforms(sampleParameters);

    expect(declarations).toContain('uniform vec3 poles_color[4];');
    expect(declarations).toContain('uniform vec2 poles_position[4];');
    expect(declarations).toContain('uniform float poles_radius[4];');
  });

  it('declares a count uniform for each group', () => {
    expect(declareUniforms(sampleParameters)).toContain('uniform int poles_count;');
  });

  it('names group uniforms predictably', () => {
    const group = sampleParameters.find((p) => p.name === 'poles');
    if (!group || group.type !== 'group') throw new Error('fixture changed');

    expect(groupEntryUniform(group, group.entryParameters[0]!)).toBe('poles_color');
    expect(groupCountUniform(group)).toBe('poles_count');
  });
});

describe('binding leaf parameters', () => {
  it('binds a number', () => {
    bind(sampleParameters, { speed: 1.25 });

    expect(gl.lastWriteTo('speed')?.value).toBe(1.25);
  });

  it('binds a boolean as an integer flag', () => {
    bind(sampleParameters, { animate: false });

    expect(gl.lastWriteTo('animate')?.value).toBe(0);
  });

  it('binds a colour as unit components', () => {
    bind(sampleParameters, { background: '#ff0000' });

    expect(gl.lastWriteTo('background')?.value).toEqual([1, 0, 0]);
  });

  it('binds an enum as the index of its option', () => {
    bind(sampleParameters, { blendMode: 'screen' });

    expect(gl.lastWriteTo('blendMode')?.value).toBe(1);
  });

  it('binds an unrecognised enum value as the first option', () => {
    bind(sampleParameters, { blendMode: 'nonsense' });

    expect(gl.lastWriteTo('blendMode')?.value).toBe(0);
  });

  it('reflects a changed value on the next bind', () => {
    bind(sampleParameters, { speed: 0.2 });
    bind(sampleParameters, { speed: 1.9 });

    expect(gl.lastWriteTo('speed')?.value).toBe(1.9);
  });
});

describe('binding omitted parameters', () => {
  it('binds the declared default when a value is absent', () => {
    bind(sampleParameters, {});

    expect(gl.lastWriteTo('speed')?.value).toBe(0.5);
    expect(gl.lastWriteTo('animate')?.value).toBe(1);
  });

  it('binds every parameter even when only one is supplied', () => {
    bind(sampleParameters, { speed: 1 });

    for (const name of ['speed', 'animate', 'background', 'blendMode', 'poles_count']) {
      expect(gl.writesTo(name).length, `${name} should be bound`).toBeGreaterThan(0);
    }
  });

  it('does not leave a stale value from the previous object', () => {
    bind(sampleParameters, { speed: 1.9 });
    gl.reset();
    // A second object that does not specify speed must get the default, not 1.9.
    bind(sampleParameters, {});

    expect(gl.lastWriteTo('speed')?.value).toBe(0.5);
  });
});

describe('binding repeatable groups', () => {
  it('binds the active entry count', () => {
    bind(sampleParameters, { poles: [{ radius: 0.1 }, { radius: 0.2 }] });

    expect(gl.lastWriteTo('poles_count')?.value).toBe(2);
  });

  it('packs entry values into the array', () => {
    bind(sampleParameters, { poles: [{ radius: 0.1 }, { radius: 0.2 }] });

    expect(packed('poles_radius')).toEqual([0.1, 0.2, 0, 0]);
  });

  it('packs colours three components at a time', () => {
    bind(sampleParameters, { poles: [{ color: '#ff0000' }, { color: '#0000ff' }] });

    expect(packed('poles_color')).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('packs vectors two components at a time', () => {
    bind(sampleParameters, { poles: [{ position: { x: 0.25, y: 0.75 } }] });

    expect(packed('poles_position')).toEqual([0.25, 0.75, 0, 0, 0, 0, 0, 0]);
  });

  it('fills entry defaults for a partially specified entry', () => {
    bind(sampleParameters, { poles: [{ radius: 0.9 }] });

    // The entry's colour was omitted, so its declared default is packed.
    expect(packed('poles_color')).toEqual([
      ...hexToRgb('#4d7cff').map((c) => Number(c.toFixed(5))),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it('always writes an array sized at maxEntries', () => {
    bind(sampleParameters, { poles: [{ radius: 0.5 }] });

    expect(packed('poles_radius')).toHaveLength(4);
  });

  it('reports zero active entries for an empty group', () => {
    bind(sampleParameters, { poles: [] });

    expect(gl.lastWriteTo('poles_count')?.value).toBe(0);
  });

  it('clamps to maxEntries rather than overflowing the array', () => {
    bind(sampleParameters, {
      poles: [{ radius: 0.1 }, { radius: 0.2 }, { radius: 0.3 }, { radius: 0.4 }, { radius: 0.5 }],
    });

    expect(gl.lastWriteTo('poles_count')?.value).toBe(4);
    expect(packed('poles_radius')).toHaveLength(4);
  });
});

describe('changing the entry count does not recompile', () => {
  it('binds a new count against the same cached program', () => {
    const cache = new ProgramCache(gl);
    const manifest = {
      schemaVersion: 1,
      id: 'grouped',
      name: 'Grouped',
      category: 'Test',
      fragmentSource: 'void main() { outColor = vec4(1.0); }',
      parameters: sampleParameters,
      presets: [{ id: 'default', name: 'Default', values: {} }],
    };

    const first = cache.acquire(manifest);
    if (!first.ok) throw new Error('expected compilation to succeed');

    bindParameters(gl, first.compiled.location, sampleParameters, { poles: [{ radius: 0.1 }] });
    expect(gl.lastWriteTo('poles_count')?.value).toBe(1);

    bindParameters(gl, first.compiled.location, sampleParameters, {
      poles: [{ radius: 0.1 }, { radius: 0.2 }, { radius: 0.3 }],
    });

    expect(gl.lastWriteTo('poles_count')?.value).toBe(3);
    expect(cache.compilations).toBe(1);
  });
});

describe('binding is shader-agnostic', () => {
  it('binds a schema this file has never seen, by type alone', () => {
    const unseen: ParameterSchema = [
      {
        name: 'brandNew',
        label: 'Brand new',
        type: 'number',
        defaultValue: 3,
        min: 0,
        max: 10,
        step: 1,
      },
      { name: 'freshColor', label: 'Fresh', type: 'color', defaultValue: '#123456' },
    ];

    bind(unseen, { brandNew: 7 });

    expect(gl.lastWriteTo('brandNew')?.value).toBe(7);
    expect(packed('freshColor')).toEqual(hexToRgb('#123456').map((c) => Number(c.toFixed(5))));
  });
});
