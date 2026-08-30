import {
  composeFragmentSource,
  createRectangle,
  declareUniforms,
  MANIFEST_SCHEMA_VERSION,
  resetObjectIds,
  resolvePreset,
  shaderFill,
  ShaderRegistry,
  validateManifest,
  type ShaderManifest,
} from '@shader/core';
import { addObjects, createDocument } from '@shader/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/buildScene';

/**
 * The open-closed contract, checked at every layer a shader passes through.
 *
 * This shader exists only in this file. Nothing in the registry, the runtime,
 * the scene builder, or the inspector was changed to accommodate it. If it
 * travels the whole pipeline, then adding a shader really is a matter of
 * writing a manifest.
 */
const outsiderManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'outsider',
  name: 'Outsider',
  category: 'Test',
  fragmentSource: `
void main() {
  // An integer parameter binds as a GLSL int, so it is converted explicitly.
  float band = step(0.5, fract(vUv.x * float(bands) + uTime * drift));
  vec3 col = mix(low, high, band);
  outColor = vec4(col, 1.0);
}
`,
  parameters: [
    { name: 'low', label: 'Low', type: 'color', group: 'Colour', defaultValue: '#101014' },
    { name: 'high', label: 'High', type: 'color', group: 'Colour', defaultValue: '#f0f0f5' },
    {
      name: 'bands',
      label: 'Bands',
      type: 'number',
      group: 'Pattern',
      defaultValue: 8,
      min: 1,
      max: 64,
      step: 1,
      integer: true,
    },
    {
      name: 'drift',
      label: 'Drift',
      type: 'number',
      group: 'Pattern',
      defaultValue: 0.2,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      name: 'stops',
      label: 'Stop',
      type: 'group',
      group: 'Pattern',
      maxEntries: 4,
      entryParameters: [
        { name: 'tint', label: 'Tint', type: 'color', defaultValue: '#ff0000' },
        {
          name: 'weight',
          label: 'Weight',
          type: 'number',
          defaultValue: 1,
          min: 0,
          max: 4,
          step: 0.1,
        },
      ],
      defaultEntries: [{ tint: '#ff0000', weight: 1 }],
    },
  ],
  presets: [
    { id: 'default', name: 'Default', values: {} },
    { id: 'dense', name: 'Dense', values: { bands: 40, drift: 0 } },
  ],
};

let registry: ShaderRegistry;

beforeEach(() => {
  resetObjectIds();
  registry = new ShaderRegistry();
});

describe('a shader that exists only in this test', () => {
  it('passes validation with no special handling', () => {
    expect(validateManifest(outsiderManifest)).toEqual([]);
  });

  it('registers and is found by identifier', () => {
    registry.registerOrThrow(outsiderManifest);

    expect(registry.get('outsider')).toBe(outsiderManifest);
  });

  it('gets a complete uniform block generated from its schema', () => {
    const source = declareUniforms(outsiderManifest.parameters);

    // An integer parameter declares as int; everything else follows its type.
    for (const declaration of [
      'uniform vec3 low;',
      'uniform vec3 high;',
      'uniform int bands;',
      'uniform float drift;',
      'uniform vec3 stops_tint[4];',
      'uniform float stops_weight[4];',
      'uniform int stops_count;',
    ]) {
      expect(source, `should declare ${declaration}`).toContain(declaration);
    }
  });

  it('receives the shared ABI without declaring it', () => {
    const source = composeFragmentSource(
      outsiderManifest.fragmentSource,
      declareUniforms(outsiderManifest.parameters),
    );

    expect(source).toContain('vUv');
    expect(source).toContain('uResolution');
    expect(source).toContain('uTime');
    expect(source).toContain('outColor');
  });

  it('reaches the renderer as a scene item carrying its values', () => {
    const document = addObjects(createDocument(), [
      createRectangle({
        id: 'a',
        fill: shaderFill('outsider', resolvePreset(outsiderManifest, 'dense'), 'dense'),
      }),
    ]);

    const item = buildScene(document).items[0];

    expect(item?.shaderId).toBe('outsider');
    expect(item?.values['bands']).toBe(40);
    expect(item?.values['drift']).toBe(0);
  });

  it('resolves a preset that leaves parameters unspecified', () => {
    const resolved = resolvePreset(outsiderManifest, 'dense');

    // Unspecified parameters fall to their declared defaults.
    expect(resolved['low']).toBe('#101014');
    expect(resolved['stops']).toEqual([{ tint: '#ff0000', weight: 1 }]);
  });
});

describe('what the contract refuses', () => {
  it('rejects a duplicate identifier rather than shadowing a shader', () => {
    registry.registerOrThrow(outsiderManifest);

    expect(() => {
      registry.registerOrThrow(outsiderManifest);
    }).toThrow(/outsider/);
  });

  it('reports an unknown identifier rather than returning something partial', () => {
    expect(registry.get('never-registered')).toBeUndefined();
  });
});
