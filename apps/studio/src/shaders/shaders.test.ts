import { resolvePreset, validateManifest } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { gradientBlurManifest } from './gradientBlur';
import { meshGradientManifest } from './meshGradient';
import { libraryShaders, registry } from './registry';

const shipped = [meshGradientManifest, gradientBlurManifest];

describe('every shipped shader', () => {
  it.each(shipped)('$id passes manifest validation', (manifest) => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it.each(shipped)('$id declares at least one preset', (manifest) => {
    expect(manifest.presets.length).toBeGreaterThan(0);
  });

  it.each(shipped)('$id resolves every preset to a complete value set', (manifest) => {
    for (const preset of manifest.presets) {
      const resolved = resolvePreset(manifest, preset.id);
      for (const parameter of manifest.parameters) {
        expect(
          resolved[parameter.name],
          `${manifest.id}:${preset.id}:${parameter.name}`,
        ).toBeDefined();
      }
    }
  });

  it.each(shipped)('$id reads vUv rather than screen coordinates', (manifest) => {
    // An object is a transformed quad, so gl_FragCoord cannot express which
    // rectangle a shader is meant to fill.
    expect(manifest.fragmentSource).not.toContain('gl_FragCoord');
  });

  it.each(shipped)('$id is registered', (manifest) => {
    expect(registry.get(manifest.id)).toBeDefined();
  });
});

describe('the mesh gradient port', () => {
  it('declares its poles as a repeatable group', () => {
    const poles = meshGradientManifest.parameters.find((parameter) => parameter.name === 'poles');

    expect(poles?.type).toBe('group');
  });

  it('caps the poles at what the shader allocates for', () => {
    const poles = meshGradientManifest.parameters.find((parameter) => parameter.name === 'poles');

    expect(poles?.type === 'group' && poles.maxEntries).toBe(8);
    // The loop is written against the same fixed size.
    expect(meshGradientManifest.fragmentSource).toContain('i < 8');
  });

  it('binds the group through the array names the runtime supplies', () => {
    for (const uniform of ['poles_count', 'poles_position', 'poles_color', 'poles_radius']) {
      expect(meshGradientManifest.fragmentSource).toContain(uniform);
    }
  });

  it('exercises every part of the parameter vocabulary', () => {
    const types = new Set(meshGradientManifest.parameters.map((parameter) => parameter.type));

    expect(types).toContain('group');
    expect(types).toContain('color');
    expect(types).toContain('number');
  });

  it('blends in OKLab rather than sRGB', () => {
    // sRGB interpolation sends two saturated colours through a grey trough.
    expect(meshGradientManifest.fragmentSource).toContain('rgb2oklab');
    expect(meshGradientManifest.fragmentSource).toContain('oklab2rgb');
  });

  it('offers a preset that overrides the pole group', () => {
    const bleed = meshGradientManifest.presets.find((preset) => preset.id === 'full-bleed');
    const poles = bleed?.values['poles'];

    expect(Array.isArray(poles) && poles.length).toBe(4);
  });
});

describe('the library listing', () => {
  it('offers the shipped shaders', () => {
    const ids = libraryShaders().map((manifest) => manifest.id);

    expect(ids).toContain('mesh-gradient');
    expect(ids).toContain('gradient-blur');
  });

  it('hides the built-in solid fill, which is not something to pick', () => {
    expect(libraryShaders().map((manifest) => manifest.id)).not.toContain('@solid');
  });
});
