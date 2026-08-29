import { describe, expect, it } from 'vitest';
import type { ShaderManifest } from './manifest';
import type { ShaderParameter } from './parameterSchema';
import { manifestWith, poleGroup, sampleManifest, sampleParameters } from './testFixtures';
import { formatManifestErrors, validateManifest } from './validateManifest';

/** The error messages produced for a manifest, joined for easy matching. */
function messages(manifest: ShaderManifest): string {
  return validateManifest(manifest)
    .map((error) => `${error.path}: ${error.message}`)
    .join('\n');
}

function withParameters(parameters: ShaderParameter[]): ShaderManifest {
  return manifestWith({ parameters, presets: [{ id: 'default', name: 'Default', values: {} }] });
}

describe('a valid manifest', () => {
  it('produces no errors', () => {
    expect(validateManifest(sampleManifest)).toEqual([]);
  });
});

describe('missing required fields', () => {
  it.each(['id', 'name', 'category', 'fragmentSource'] as const)(
    'reports a missing %s',
    (field) => {
      const errors = messages(manifestWith({ [field]: '' }));

      expect(errors).toContain(field);
      expect(errors).toContain('Missing required field');
    },
  );

  it('reports missing parameters', () => {
    expect(messages(manifestWith({ parameters: undefined as never }))).toContain(
      'Missing required field "parameters"',
    );
  });

  it('requires at least one preset', () => {
    expect(messages(manifestWith({ presets: [] }))).toContain('at least one preset');
  });
});

describe('schema version', () => {
  it('names both versions when the manifest declares an unsupported one', () => {
    const errors = messages(manifestWith({ schemaVersion: 99 }));

    expect(errors).toContain('99');
    expect(errors).toContain('version 1');
  });

  it('accepts the supported version', () => {
    expect(validateManifest(sampleManifest)).toEqual([]);
  });
});

describe('a manifest must not supply interface code', () => {
  it.each(['component', 'render', 'buildPanel', 'panel', 'controls', 'ui'])(
    'rejects a "%s" field',
    (field) => {
      const manifest = { ...sampleManifest, [field]: () => undefined };

      expect(messages(manifest)).toContain('must not supply interface code');
    },
  );
});

describe('parameter validation', () => {
  it('names the parameter and the unsupported type', () => {
    const errors = messages(
      withParameters([
        { name: 'weird', label: 'Weird', type: 'gradient', defaultValue: 1 } as never,
      ]),
    );

    expect(errors).toContain('parameters.weird.type');
    expect(errors).toContain('"gradient"');
  });

  it('rejects a numeric default outside the declared range', () => {
    const errors = messages(
      withParameters([
        {
          name: 'speed',
          label: 'Speed',
          type: 'number',
          defaultValue: 5,
          min: 0,
          max: 2,
          step: 0.1,
        },
      ]),
    );

    expect(errors).toContain('parameters.speed.defaultValue');
    expect(errors).toContain('outside the declared range');
  });

  it('rejects a minimum above the maximum', () => {
    expect(
      messages(
        withParameters([
          { name: 'x', label: 'X', type: 'number', defaultValue: 1, min: 5, max: 2, step: 0.1 },
        ]),
      ),
    ).toContain('Minimum is greater than maximum');
  });

  it('rejects a non-positive step', () => {
    expect(
      messages(
        withParameters([
          { name: 'x', label: 'X', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0 },
        ]),
      ),
    ).toContain('Step must be greater than zero');
  });

  it('rejects an enum default outside its options', () => {
    const errors = messages(
      withParameters([
        {
          name: 'mode',
          label: 'Mode',
          type: 'enum',
          defaultValue: 'overlay',
          options: [{ value: 'normal', label: 'Normal' }],
        },
      ]),
    );

    expect(errors).toContain('parameters.mode.defaultValue');
    expect(errors).toContain('not one of the declared options');
  });

  it('rejects an enum with no options', () => {
    expect(
      messages(
        withParameters([
          { name: 'mode', label: 'Mode', type: 'enum', defaultValue: 'a', options: [] },
        ]),
      ),
    ).toContain('at least one option');
  });

  it('rejects a malformed colour default', () => {
    expect(
      messages(
        withParameters([{ name: 'tint', label: 'Tint', type: 'color', defaultValue: 'blue' }]),
      ),
    ).toContain('expected a #rrggbb colour');
  });

  it('rejects a duplicate parameter name', () => {
    const duplicate: ShaderParameter = {
      name: 'speed',
      label: 'Speed again',
      type: 'number',
      defaultValue: 1,
      min: 0,
      max: 2,
      step: 0.1,
    };

    expect(messages(withParameters([...sampleParameters, duplicate]))).toContain(
      'Duplicate parameter name',
    );
  });
});

describe('repeatable groups', () => {
  it('requires maxEntries so the runtime can size its arrays', () => {
    const errors = messages(withParameters([{ ...poleGroup, maxEntries: undefined as never }]));

    expect(errors).toContain('parameters.poles.maxEntries');
    expect(errors).toContain('maxEntries of at least 1');
  });

  it('rejects a maxEntries below one', () => {
    expect(messages(withParameters([{ ...poleGroup, maxEntries: 0 }]))).toContain(
      'maxEntries of at least 1',
    );
  });

  it('rejects minEntries above maxEntries', () => {
    expect(messages(withParameters([{ ...poleGroup, maxEntries: 2, minEntries: 5 }]))).toContain(
      'Minimum entries exceeds maxEntries',
    );
  });

  it('requires at least one entry parameter', () => {
    expect(
      messages(withParameters([{ ...poleGroup, entryParameters: [], defaultEntries: [] }])),
    ).toContain('at least one entry parameter');
  });

  it('rejects more default entries than maxEntries allows', () => {
    const errors = messages(
      withParameters([
        { ...poleGroup, maxEntries: 1, defaultEntries: [{ radius: 0.2 }, { radius: 0.3 }] },
      ]),
    );

    expect(errors).toContain('exceeding maxEntries');
  });

  it('validates values inside a default entry', () => {
    expect(
      messages(withParameters([{ ...poleGroup, defaultEntries: [{ radius: 99 }] }])),
    ).toContain('outside the declared range');
  });

  it('rejects a group nested inside a group', () => {
    const errors = messages(
      withParameters([{ ...poleGroup, entryParameters: [poleGroup as never], defaultEntries: [] }]),
    );

    expect(errors).toContain('cannot contain another');
  });
});

describe('preset validation', () => {
  it('names the shader, preset, and parameter for an out-of-range value', () => {
    const manifest = manifestWith({
      presets: [{ id: 'too-fast', name: 'Too fast', values: { speed: 99 } }],
    });

    const errors = validateManifest(manifest);
    const rendered = formatManifestErrors(manifest.id, errors);

    expect(rendered).toContain('"sample"');
    expect(rendered).toContain('Too fast');
    expect(rendered).toContain('speed');
    expect(rendered).toContain('outside the declared range');
  });

  it('rejects a preset value outside an enum option set', () => {
    expect(
      messages(
        manifestWith({
          presets: [{ id: 'p', name: 'P', values: { blendMode: 'overlay' } }],
        }),
      ),
    ).toContain('not one of the declared options');
  });

  it('rejects a preset naming an undeclared parameter', () => {
    expect(
      messages(manifestWith({ presets: [{ id: 'p', name: 'P', values: { nope: 1 } }] })),
    ).toContain('No parameter named "nope"');
  });

  it('accepts a preset that omits parameters', () => {
    expect(
      validateManifest(manifestWith({ presets: [{ id: 'p', name: 'P', values: { speed: 1 } }] })),
    ).toEqual([]);
  });

  it('validates entries inside a repeatable group value', () => {
    expect(
      messages(
        manifestWith({
          presets: [{ id: 'p', name: 'P', values: { poles: [{ radius: 42 }] } }],
        }),
      ),
    ).toContain('outside the declared range');
  });

  it('rejects more group entries than maxEntries allows', () => {
    expect(
      messages(
        manifestWith({
          presets: [
            {
              id: 'p',
              name: 'P',
              values: { poles: [{}, {}, {}, {}, {}] },
            },
          ],
        }),
      ),
    ).toContain('exceeding maxEntries');
  });

  it('rejects duplicate preset ids', () => {
    expect(
      messages(
        manifestWith({
          presets: [
            { id: 'same', name: 'One', values: {} },
            { id: 'same', name: 'Two', values: {} },
          ],
        }),
      ),
    ).toContain('Duplicate preset id');
  });
});

describe('formatManifestErrors', () => {
  it('names the shader and counts the faults', () => {
    const manifest = manifestWith({ id: 'broken', name: '' });
    const rendered = formatManifestErrors('broken', validateManifest(manifest));

    expect(rendered).toContain('Shader "broken"');
    expect(rendered).toMatch(/\d+ manifest error/);
  });

  it('collects every fault rather than stopping at the first', () => {
    const errors = validateManifest(manifestWith({ id: '', name: '', category: '' }));

    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
