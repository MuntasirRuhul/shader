import { beforeEach, describe, expect, it } from 'vitest';
import { ShaderRegistrationError, ShaderRegistry } from './ShaderRegistry';
import { manifestWith, sampleManifest } from './testFixtures';

let registry: ShaderRegistry;

beforeEach(() => {
  registry = new ShaderRegistry();
});

describe('registering a valid manifest', () => {
  it('succeeds and lists the shader', () => {
    const result = registry.register(sampleManifest);

    expect(result.ok).toBe(true);
    expect(registry.list()).toHaveLength(1);
    expect(registry.has('sample')).toBe(true);
  });

  it('returns the registered manifest', () => {
    const result = registry.register(sampleManifest);

    expect(result.ok && result.manifest.id).toBe('sample');
  });

  it('registers several shaders', () => {
    registry.register(sampleManifest);
    registry.register(manifestWith({ id: 'second', name: 'Second' }));

    expect(registry.size).toBe(2);
  });
});

describe('registering an invalid manifest', () => {
  it('fails and reports the reasons', () => {
    const result = registry.register(manifestWith({ id: '' }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.length).toBeGreaterThan(0);
  });

  it('does not list a shader that failed validation', () => {
    registry.register(manifestWith({ name: '' }));

    expect(registry.list()).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it('throws from registerOrThrow with the shader named', () => {
    expect(() => registry.registerOrThrow(manifestWith({ id: 'broken', category: '' }))).toThrow(
      ShaderRegistrationError,
    );
    expect(() => registry.registerOrThrow(manifestWith({ id: 'broken', category: '' }))).toThrow(
      /broken/,
    );
  });

  it('carries the errors on the thrown error', () => {
    try {
      registry.registerOrThrow(manifestWith({ id: 'broken', category: '' }));
      expect.unreachable('registration should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ShaderRegistrationError);
      expect((error as ShaderRegistrationError).errors.length).toBeGreaterThan(0);
      expect((error as ShaderRegistrationError).shaderId).toBe('broken');
    }
  });
});

describe('duplicate identifiers', () => {
  it('refuses a second registration of the same identifier', () => {
    registry.register(sampleManifest);
    const result = registry.register(manifestWith({ name: 'Different name' }));

    expect(result.ok).toBe(false);
  });

  it('names the conflicting identifier', () => {
    registry.register(sampleManifest);
    const result = registry.register(sampleManifest);

    expect(result.ok === false && result.errors.map((e) => e.message).join()).toContain('"sample"');
  });

  it('leaves the original registration intact', () => {
    registry.register(sampleManifest);
    registry.register(manifestWith({ name: 'Impostor' }));

    expect(registry.get('sample')?.name).toBe('Sample');
    expect(registry.size).toBe(1);
  });
});

describe('lookup', () => {
  beforeEach(() => {
    registry.register(sampleManifest);
  });

  it('returns the manifest for a known identifier', () => {
    expect(registry.get('sample')).toBe(sampleManifest);
  });

  it('reports not-found for an unknown identifier rather than a partial manifest', () => {
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.has('missing')).toBe(false);
  });

  it('throws a named error from getOrThrow for an unknown identifier', () => {
    expect(() => registry.getOrThrow('missing')).toThrow(/"missing"/);
  });
});

describe('listing', () => {
  it('returns every registered shader with its display metadata', () => {
    registry.register(sampleManifest);
    registry.register(
      manifestWith({ id: 'other', name: 'Other', category: 'Patterns', description: 'A pattern' }),
    );

    expect(registry.summaries()).toEqual([
      { id: 'sample', name: 'Sample', category: 'Gradients' },
      { id: 'other', name: 'Other', category: 'Patterns', description: 'A pattern' },
    ]);
  });

  it('omits shaders that failed to register', () => {
    registry.register(sampleManifest);
    registry.register(manifestWith({ id: 'bad', fragmentSource: '' }));

    expect(registry.summaries().map((s) => s.id)).toEqual(['sample']);
  });

  it('preserves registration order', () => {
    registry.register(manifestWith({ id: 'first' }));
    registry.register(manifestWith({ id: 'second' }));
    registry.register(manifestWith({ id: 'third' }));

    expect(registry.list().map((m) => m.id)).toEqual(['first', 'second', 'third']);
  });

  it('is empty before anything registers', () => {
    expect(registry.list()).toEqual([]);
    expect(registry.summaries()).toEqual([]);
  });
});

describe('grouping by category', () => {
  it('collects shaders under their category in registration order', () => {
    registry.register(manifestWith({ id: 'a', category: 'Gradients' }));
    registry.register(manifestWith({ id: 'b', category: 'Patterns' }));
    registry.register(manifestWith({ id: 'c', category: 'Gradients' }));

    expect(registry.byCategory()).toEqual([
      {
        category: 'Gradients',
        shaders: [
          { id: 'a', name: 'Sample', category: 'Gradients' },
          { id: 'c', name: 'Sample', category: 'Gradients' },
        ],
      },
      { category: 'Patterns', shaders: [{ id: 'b', name: 'Sample', category: 'Patterns' }] },
    ]);
  });
});

describe('the open-closed contract', () => {
  it('accepts a shader written entirely as data, with no registry changes', () => {
    // This manifest is defined here, in a test, and nothing in the registry
    // knows about it. Registering it is all that is required.
    const newcomer = {
      schemaVersion: 1,
      id: 'stripes',
      name: 'Stripes',
      category: 'Patterns',
      fragmentSource: 'void main() { outColor = vec4(1.0); }',
      parameters: [
        {
          name: 'frequency',
          label: 'Frequency',
          type: 'number' as const,
          defaultValue: 8,
          min: 1,
          max: 64,
          step: 1,
          integer: true,
        },
      ],
      presets: [{ id: 'default', name: 'Default', values: {} }],
    };

    expect(registry.register(newcomer).ok).toBe(true);
    expect(registry.get('stripes')?.parameters).toHaveLength(1);
  });
});

describe('clear', () => {
  it('removes every registration', () => {
    registry.register(sampleManifest);
    registry.clear();

    expect(registry.size).toBe(0);
    expect(registry.get('sample')).toBeUndefined();
  });
});
