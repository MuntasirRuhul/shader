import { beforeEach, describe, expect, it } from 'vitest';
import { manifestWith, sampleManifest } from '../../registry/testFixtures';
import { ProgramCache } from './ProgramCache';
import { FakeGl } from './testDouble';

let gl: FakeGl;
let cache: ProgramCache;

beforeEach(() => {
  gl = new FakeGl();
  cache = new ProgramCache(gl);
});

describe("compiling one of a shader's passes", () => {
  const twoPass = manifestWith({
    id: 'two-pass',
    passes: [
      { name: 'field', fragmentSource: 'void main() { outColor = vec4(1.0); }' },
      {
        name: 'draw',
        fragmentSource: 'void main() { outColor = texture(uField, vUv); }',
        reads: [{ uniform: 'uField', pass: 'field' }],
      },
    ],
  });

  it('declares the samplers the pass reads through', () => {
    const pass = twoPass.passes?.[1];
    if (!pass) throw new Error('fixture has no second pass');
    cache.acquirePass(twoPass, pass);
    const fragment = gl.compiledSources[1] ?? '';

    expect(fragment).toContain('uniform sampler2D uField;');
    // And the shader's parameters, which a pass shares.
    expect(fragment).toContain('uniform float speed;');
  });

  it('compiles each pass as its own program', () => {
    for (const pass of twoPass.passes ?? []) cache.acquirePass(twoPass, pass);

    expect(cache.compilations).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('reuses a pass program rather than recompiling it', () => {
    const pass = twoPass.passes?.[0];
    if (!pass) throw new Error('fixture has no first pass');
    cache.acquirePass(twoPass, pass);
    cache.acquirePass(twoPass, pass);

    expect(cache.compilations).toBe(1);
  });

  it('names the pass in a compile failure, since a shader has several', () => {
    const failing = new ProgramCache(new FakeGl({ failCompileMatching: /shaderMain/ }));
    const pass = twoPass.passes?.[0];
    if (!pass) throw new Error('fixture has no first pass');

    const result = failing.acquirePass(twoPass, pass);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.shaderId).toBe('two-pass');
      expect(result.failure.diagnostic).toContain('Pass "field"');
    }
  });

  it('releases a shader pass programs along with its own', () => {
    for (const pass of twoPass.passes ?? []) cache.acquirePass(twoPass, pass);
    expect(cache.size).toBe(2);

    cache.release('two-pass');

    expect(cache.size).toBe(0);
    expect(gl.livePrograms).toBe(0);
  });
});

describe('compiling a shader for the first time', () => {
  it('compiles and links it', () => {
    const result = cache.acquire(sampleManifest);

    expect(result.ok).toBe(true);
    expect(cache.compilations).toBe(1);
  });

  it('compiles both stages', () => {
    cache.acquire(sampleManifest);

    expect(gl.compiledSources).toHaveLength(2);
  });

  it('compiles the shader body against the ABI preamble', () => {
    cache.acquire(sampleManifest);
    const fragment = gl.compiledSources[1] ?? '';

    expect(fragment).toContain('in vec2 vUv;');
    expect(fragment).toContain('uniform vec2 uResolution;');
    expect(fragment).toContain('uniform float uTime;');
    // The shader's own main is wrapped so opacity and masking can be applied.
    expect(fragment).toContain('void shaderMain()');
  });

  it('declares the shader parameters as uniforms', () => {
    cache.acquire(sampleManifest);
    const fragment = gl.compiledSources[1] ?? '';

    expect(fragment).toContain('uniform float speed;');
    expect(fragment).toContain('uniform bool animate;');
    expect(fragment).toContain('uniform vec3 background;');
    expect(fragment).toContain('uniform int blendMode;');
  });

  it('declares a repeatable group as fixed-size arrays with a count', () => {
    cache.acquire(sampleManifest);
    const fragment = gl.compiledSources[1] ?? '';

    expect(fragment).toContain('uniform vec3 poles_color[4];');
    expect(fragment).toContain('uniform vec2 poles_position[4];');
    expect(fragment).toContain('uniform float poles_radius[4];');
    expect(fragment).toContain('uniform int poles_count;');
  });

  it('declares the simulation state as uniforms too', () => {
    // State binds through the parameter binding, so it is declared the same
    // way: a shader author writes neither by hand.
    cache.acquire(
      manifestWith({
        id: 'stateful',
        simulation: {
          schema: [
            {
              name: 'phase',
              label: 'Phase',
              type: 'number',
              defaultValue: 0,
              min: 0,
              max: 1,
              step: 0.01,
            },
          ],
          initial: { phase: 0 },
          advance: (previous) => previous,
        },
      }),
    );
    const fragment = gl.compiledSources[1] ?? '';

    expect(fragment).toContain('uniform float phase;');
  });

  it('uses the runtime quad vertex stage by default', () => {
    cache.acquire(sampleManifest);

    expect(gl.compiledSources[0]).toContain('out vec2 vUv;');
  });

  it('releases the shader objects once linked', () => {
    cache.acquire(sampleManifest);

    expect(gl.deletedShaders).toHaveLength(2);
    expect(gl.liveShaders).toBe(0);
  });
});

describe('a shader that fails to compile', () => {
  it('reports the shader identifier and the driver diagnostic', () => {
    const failing = new FakeGl({
      failCompileMatching: /shaderMain/,
      compileDiagnostic: "ERROR: 0:14: 'vUv2' : undeclared identifier",
    });
    const result = new ProgramCache(failing).acquire(manifestWith({ id: 'broken' }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure).toEqual({
      shaderId: 'broken',
      stage: 'fragment',
      diagnostic: "ERROR: 0:14: 'vUv2' : undeclared identifier",
    });
  });

  it('reports a vertex stage failure distinctly', () => {
    const failing = new FakeGl({ failCompileMatching: /out vec2 vUv/ });
    const result = new ProgramCache(failing).acquire(sampleManifest);

    expect(result.ok === false && result.failure.stage).toBe('vertex');
  });

  it('reports a link failure with the link diagnostic', () => {
    const failing = new FakeGl({ failLink: true, linkDiagnostic: 'ERROR: link failed' });
    const result = new ProgramCache(failing).acquire(sampleManifest);

    expect(result.ok === false && result.failure.stage).toBe('link');
    expect(result.ok === false && result.failure.diagnostic).toBe('ERROR: link failed');
  });

  it('does not retry a failed shader on every acquire', () => {
    const failing = new FakeGl({ failCompileMatching: /shaderMain/ });
    const failingCache = new ProgramCache(failing);

    failingCache.acquire(sampleManifest);
    failingCache.acquire(sampleManifest);
    failingCache.acquire(sampleManifest);

    expect(failingCache.compilations).toBe(1);
  });

  it('remembers the failure so callers can show an error state', () => {
    const failing = new FakeGl({ failCompileMatching: /shaderMain/ });
    const failingCache = new ProgramCache(failing);
    failingCache.acquire(sampleManifest);

    expect(failingCache.failureFor('sample')?.stage).toBe('fragment');
  });

  it('leaks no shader or program objects when compilation fails', () => {
    const failing = new FakeGl({ failCompileMatching: /shaderMain/ });
    new ProgramCache(failing).acquire(sampleManifest);

    expect(failing.liveShaders).toBe(0);
    expect(failing.livePrograms).toBe(0);
  });

  it('leaks no program when linking fails', () => {
    const failing = new FakeGl({ failLink: true });
    new ProgramCache(failing).acquire(sampleManifest);

    expect(failing.livePrograms).toBe(0);
    expect(failing.liveShaders).toBe(0);
  });

  it('reports a shader whose source has no main to wrap', () => {
    const result = cache.acquire(manifestWith({ id: 'nomain', fragmentSource: 'float x = 1.0;' }));

    expect(result.ok === false && result.failure.shaderId).toBe('nomain');
    expect(result.ok === false && result.failure.diagnostic).toMatch(/void main/);
  });
});

describe('caching', () => {
  it('compiles once when several objects use the same shader', () => {
    cache.acquire(sampleManifest);
    cache.acquire(sampleManifest);
    cache.acquire(sampleManifest);

    expect(cache.compilations).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('returns the same program each time', () => {
    const first = cache.acquire(sampleManifest);
    const second = cache.acquire(sampleManifest);

    expect(first.ok && second.ok && first.compiled.program).toBe(
      second.ok ? second.compiled.program : null,
    );
  });

  it('reuses the cached program when a shader is reselected', () => {
    cache.acquire(sampleManifest);
    cache.acquire(manifestWith({ id: 'other' }));
    cache.acquire(sampleManifest);

    expect(cache.compilations).toBe(2);
  });

  it('compiles distinct shaders separately', () => {
    cache.acquire(sampleManifest);
    cache.acquire(manifestWith({ id: 'second' }));

    expect(cache.compilations).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('looks up each uniform location only once', () => {
    const result = cache.acquire(sampleManifest);
    if (!result.ok) throw new Error('expected compilation to succeed');

    const first = result.compiled.location('speed');
    const second = result.compiled.location('speed');

    expect(first).toBe(second);
  });
});

describe('releasing resources', () => {
  it('deletes the program for one shader', () => {
    cache.acquire(sampleManifest);
    cache.release('sample');

    expect(gl.deletedPrograms).toHaveLength(1);
    expect(cache.size).toBe(0);
  });

  it('recompiles after a release', () => {
    cache.acquire(sampleManifest);
    cache.release('sample');
    cache.acquire(sampleManifest);

    expect(cache.compilations).toBe(2);
  });

  it('deletes every program on releaseAll', () => {
    cache.acquire(sampleManifest);
    cache.acquire(manifestWith({ id: 'second' }));
    cache.releaseAll();

    expect(gl.deletedPrograms).toHaveLength(2);
    expect(gl.livePrograms).toBe(0);
    expect(cache.size).toBe(0);
  });

  it('forgets without deleting after the context is lost', () => {
    cache.acquire(sampleManifest);
    cache.forgetAll();

    // The driver already discarded these; deleting them would be invalid.
    expect(gl.deletedPrograms).toHaveLength(0);
    expect(cache.size).toBe(0);
  });

  it('clears a recorded failure on release so a fixed shader can retry', () => {
    const failing = new FakeGl({ failCompileMatching: /shaderMain/ });
    const failingCache = new ProgramCache(failing);
    failingCache.acquire(sampleManifest);
    failingCache.release('sample');

    expect(failingCache.failureFor('sample')).toBeUndefined();
  });
});
