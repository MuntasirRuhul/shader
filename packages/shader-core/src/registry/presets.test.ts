import { describe, expect, it } from 'vitest';
import { defaultPreset, findPreset, resolvePreset, resolveValues } from './presets';
import { manifestWith, sampleManifest, sampleParameters } from './testFixtures';

describe('resolveValues — omitted parameters take their declared default', () => {
  it('fills every parameter when nothing is supplied', () => {
    expect(resolveValues(sampleParameters)).toEqual({
      speed: 0.5,
      animate: true,
      background: '#0a0a0b',
      blendMode: 'normal',
      poles: [{ color: '#ff5722', position: { x: 0.3, y: 0.3 }, radius: 0.5 }],
    });
  });

  it('keeps supplied values and defaults the rest', () => {
    const resolved = resolveValues(sampleParameters, { speed: 1.5, animate: false });

    expect(resolved.speed).toBe(1.5);
    expect(resolved.animate).toBe(false);
    expect(resolved.background).toBe('#0a0a0b');
    expect(resolved.blendMode).toBe('normal');
  });

  it('resolves a false boolean rather than treating it as absent', () => {
    expect(resolveValues(sampleParameters, { animate: false }).animate).toBe(false);
  });

  it('resolves a zero rather than treating it as absent', () => {
    expect(resolveValues(sampleParameters, { speed: 0 }).speed).toBe(0);
  });

  it('completes a partially specified group entry from the entry defaults', () => {
    const resolved = resolveValues(sampleParameters, { poles: [{ radius: 0.9 }] });

    expect(resolved.poles).toEqual([
      { color: '#4d7cff', position: { x: 0.5, y: 0.5 }, radius: 0.9 },
    ]);
  });

  it('resolves every entry of a group independently', () => {
    const resolved = resolveValues(sampleParameters, {
      poles: [{ radius: 0.1 }, { color: '#00ff00' }],
    });

    expect(resolved.poles).toEqual([
      { color: '#4d7cff', position: { x: 0.5, y: 0.5 }, radius: 0.1 },
      { color: '#00ff00', position: { x: 0.5, y: 0.5 }, radius: 0.4 },
    ]);
  });

  it('accepts an empty group value rather than substituting the defaults', () => {
    expect(resolveValues(sampleParameters, { poles: [] }).poles).toEqual([]);
  });
});

describe('preset lookup', () => {
  it('uses the first preset as the default', () => {
    expect(defaultPreset(sampleManifest)?.id).toBe('default');
  });

  it('finds a preset by id', () => {
    expect(findPreset(sampleManifest, 'fast')?.name).toBe('Fast');
  });

  it('returns nothing for an unknown preset id', () => {
    expect(findPreset(sampleManifest, 'nope')).toBeUndefined();
  });

  it('has no default preset when none are declared', () => {
    expect(defaultPreset(manifestWith({ presets: [] }))).toBeUndefined();
  });
});

describe('resolvePreset — a preset supplies a complete value set', () => {
  it('resolves the named preset over the defaults', () => {
    const values = resolvePreset(sampleManifest, 'fast');

    expect(values.speed).toBe(1.8);
    expect(values.animate).toBe(true);
    expect(values.blendMode).toBe('normal');
  });

  it('resolves the default preset when none is named', () => {
    expect(resolvePreset(sampleManifest).speed).toBe(0.5);
  });

  it('falls back to declared defaults for an unknown preset id', () => {
    expect(resolvePreset(sampleManifest, 'nope')).toEqual(resolveValues(sampleParameters));
  });

  it('produces a value for every declared parameter', () => {
    const values = resolvePreset(sampleManifest, 'fast');

    for (const parameter of sampleParameters) {
      expect(values[parameter.name], `${parameter.name} should be resolved`).toBeDefined();
    }
  });
});

describe('resolved values are plain serializable data', () => {
  it('round-trips through JSON unchanged', () => {
    const values = resolvePreset(sampleManifest, 'fast');

    expect(JSON.parse(JSON.stringify(values))).toEqual(values);
  });
});
