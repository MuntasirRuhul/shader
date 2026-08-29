import { describe, expect, it } from 'vitest';
import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from './manifest';
import { resolvePreset } from './presets';
import { ShaderRegistry } from './ShaderRegistry';
import { sampleManifest } from './testFixtures';
import { validateManifest } from './validateManifest';

/**
 * Manifests must survive a trip through plain data. This is what lets a
 * document store parameter values, and what a sync layer would carry later.
 */

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('the parameter schema round-trips', () => {
  it('is unchanged by serialization', () => {
    expect(roundTrip(sampleManifest.parameters)).toEqual(sampleManifest.parameters);
  });

  it('preserves repeatable group entry parameters and defaults', () => {
    const restored = roundTrip(sampleManifest.parameters);
    const poles = restored.find((parameter) => parameter.name === 'poles');

    expect(poles).toEqual(sampleManifest.parameters.find((p) => p.name === 'poles'));
  });

  it('preserves parameter and group ordering', () => {
    expect(roundTrip(sampleManifest.parameters).map((p) => p.name)).toEqual(
      sampleManifest.parameters.map((p) => p.name),
    );
  });
});

describe('presets round-trip', () => {
  it('are unchanged by serialization', () => {
    expect(roundTrip(sampleManifest.presets)).toEqual(sampleManifest.presets);
  });

  it('resolve to the same values before and after', () => {
    const restored = roundTrip(sampleManifest);

    expect(resolvePreset(restored, 'fast')).toEqual(resolvePreset(sampleManifest, 'fast'));
  });
});

describe('a whole manifest round-trips', () => {
  it('is unchanged by serialization', () => {
    expect(roundTrip(sampleManifest)).toEqual(sampleManifest);
  });

  it('still validates after the round trip', () => {
    expect(validateManifest(roundTrip(sampleManifest))).toEqual([]);
  });

  it('still registers after the round trip', () => {
    const registry = new ShaderRegistry();

    expect(registry.register(roundTrip(sampleManifest)).ok).toBe(true);
  });

  it('carries its schema version through', () => {
    expect(roundTrip(sampleManifest).schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });
});

describe('a manifest deserialized from an unsupported version is refused', () => {
  it('does not register', () => {
    const stored = JSON.stringify({ ...sampleManifest, schemaVersion: 2 });
    const restored = JSON.parse(stored) as ShaderManifest;
    const registry = new ShaderRegistry();

    const result = registry.register(restored);

    expect(result.ok).toBe(false);
    expect(registry.size).toBe(0);
  });
});
