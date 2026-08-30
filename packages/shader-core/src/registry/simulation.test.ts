import { describe, expect, it } from 'vitest';
import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from './manifest';
import { POINTER_ABSENT, type AdvanceContext, type SimulationState } from './simulation';
import { validateManifest } from './validateManifest';

function manifest(overrides: Partial<ShaderManifest> = {}): ShaderManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: 'test',
    name: 'Test',
    category: 'Test',
    fragmentSource: 'void main() { outColor = vec4(vUv, 0.0, 1.0); }',
    parameters: [
      { name: 'speed', label: 'Speed', type: 'number', defaultValue: 1, min: 0, max: 4, step: 0.1 },
    ],
    presets: [{ id: 'default', name: 'Default', values: {} }],
    ...overrides,
  };
}

function context(overrides: Partial<AdvanceContext> = {}): AdvanceContext {
  return {
    dt: 1 / 60,
    elapsed: 0,
    parameters: { speed: 1 },
    pointer: POINTER_ABSENT,
    width: 800,
    height: 600,
    ...overrides,
  };
}

describe('declaring a simulation', () => {
  it('accepts a manifest declaring both an initial state and an advance', () => {
    const withState = manifest({
      simulation: {
        schema: [
          {
            name: 'drift',
            label: 'Drift',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1e9,
            step: 1,
          },
        ],
        initial: { drift: 0 },
        advance: (previous) => previous,
      },
    });

    expect(validateManifest(withState)).toEqual([]);
  });

  it('accepts a manifest declaring no simulation at all', () => {
    expect(validateManifest(manifest())).toEqual([]);
  });

  it('rejects an initial state with no advance, naming the missing half', () => {
    const half = manifest({
      simulation: {
        schema: [
          {
            name: 'drift',
            label: 'Drift',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1,
            step: 1,
          },
        ],
        initial: { drift: 0 },
      } as never,
    });

    const errors = validateManifest(half);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('simulation.advance');
    expect(errors[0]?.message).toContain('both');
  });

  it('rejects an advance with no initial state, naming the missing half', () => {
    const half = manifest({
      simulation: {
        schema: [],
        advance: (previous: SimulationState) => previous,
      } as never,
    });

    const errors = validateManifest(half);
    expect(errors.some((error) => error.path === 'simulation.initial')).toBe(true);
  });

  it('rejects a state value colliding with a parameter', () => {
    const clashing = manifest({
      simulation: {
        schema: [
          {
            name: 'speed',
            label: 'Speed',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1,
            step: 1,
          },
        ],
        initial: { speed: 0 },
        advance: (previous) => previous,
      },
    });

    const errors = validateManifest(clashing);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('speed');
    expect(errors[0]?.message).toContain('overwrite');
  });

  it('allows a state value whose name no parameter uses', () => {
    const fine = manifest({
      simulation: {
        schema: [
          {
            name: 'positions',
            label: 'Positions',
            type: 'group',
            maxEntries: 4,
            entryParameters: [
              {
                name: 'x',
                label: 'X',
                type: 'number',
                defaultValue: 0,
                min: -1,
                max: 1,
                step: 0.01,
              },
            ],
            defaultEntries: [],
          },
        ],
        initial: { positions: [] },
        advance: (previous) => previous,
      },
    });

    expect(validateManifest(fine)).toEqual([]);
  });
});

describe('an advance is a pure function of what it is given', () => {
  const advance = (previous: SimulationState, ctx: AdvanceContext): SimulationState => ({
    drift: (previous['drift'] as number) + ctx.dt * (ctx.parameters['speed'] as number),
  });

  it('runs with no canvas and no document', () => {
    expect(advance({ drift: 0 }, context())).toEqual({ drift: 1 / 60 });
  });

  it('produces the same next state from the same inputs', () => {
    const first = advance({ drift: 5 }, context());
    const second = advance({ drift: 5 }, context());

    expect(first).toEqual(second);
  });

  it('scales with elapsed time rather than with the number of calls', () => {
    // One long step and several short ones covering the same time agree.
    const oneStep = advance({ drift: 0 }, context({ dt: 0.5 }));

    let many: SimulationState = { drift: 0 };
    for (let i = 0; i < 50; i += 1) many = advance(many, context({ dt: 0.01 }));

    expect(many['drift']).toBeCloseTo(oneStep['drift'] as number, 6);
  });

  it('sees a parameter change on the next advance', () => {
    const faster = advance({ drift: 0 }, context({ parameters: { speed: 4 } }));

    expect(faster['drift']).toBeCloseTo(4 / 60, 6);
  });
});

describe('pointer input', () => {
  it('reports the pointer as absent by default', () => {
    expect(POINTER_ABSENT.present).toBe(false);
  });

  it('reaches an advance in the object own coordinates', () => {
    const seen: { x: number; y: number }[] = [];
    const advance = (previous: SimulationState, ctx: AdvanceContext): SimulationState => {
      if (ctx.pointer.present) seen.push({ x: ctx.pointer.x, y: ctx.pointer.y });
      return previous;
    };

    advance({}, context({ pointer: { present: true, x: 0.25, y: 0.75 } }));

    expect(seen).toEqual([{ x: 0.25, y: 0.75 }]);
  });

  it('lets an advance ignore the pointer entirely', () => {
    const advance = (previous: SimulationState): SimulationState => previous;

    expect(advance({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('declaring passes', () => {
  const pass = (
    name: string,
    reads?: { uniform: string; pass: string; previousFrame?: boolean }[],
  ) => ({
    name,
    fragmentSource: 'void main() { outColor = vec4(0.0); }',
    ...(reads ? { reads } : {}),
  });

  it('accepts passes in order where a later one reads an earlier', () => {
    const twoPass = manifest({
      passes: [pass('field'), pass('draw', [{ uniform: 'uField', pass: 'field' }])],
    });

    expect(validateManifest(twoPass)).toEqual([]);
  });

  it('accepts a pass reading its own previous frame', () => {
    const feedback = manifest({
      passes: [pass('height', [{ uniform: 'uPrev', pass: 'height', previousFrame: true }])],
    });

    expect(validateManifest(feedback)).toEqual([]);
  });

  it('rejects a pass reading one that runs after it', () => {
    const backwards = manifest({
      passes: [pass('first', [{ uniform: 'uLater', pass: 'second' }]), pass('second')],
    });

    const errors = validateManifest(backwards);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('after it');
  });

  it('rejects a pass reading itself from the current frame', () => {
    const impossible = manifest({
      passes: [pass('loop', [{ uniform: 'uSelf', pass: 'loop' }])],
    });

    expect(validateManifest(impossible)[0]?.message).toContain('does not exist yet');
  });

  it('rejects a pass reading one the shader does not declare', () => {
    const missing = manifest({
      passes: [pass('draw', [{ uniform: 'uGhost', pass: 'nowhere' }])],
    });

    expect(validateManifest(missing)[0]?.message).toContain('does not declare');
  });

  it('rejects two passes sharing a name', () => {
    const clashing = manifest({ passes: [pass('same'), pass('same')] });

    expect(validateManifest(clashing)[0]?.message).toContain('distinct');
  });

  it('rejects declaring passes but listing none', () => {
    expect(validateManifest(manifest({ passes: [] }))[0]?.path).toBe('passes');
  });

  it('accepts a manifest declaring no passes', () => {
    expect(validateManifest(manifest())).toEqual([]);
  });
});
