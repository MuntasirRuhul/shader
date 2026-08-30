import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '../registry/manifest';
import { POINTER_ABSENT, type AdvanceContext, type SimulationState } from '../registry/simulation';
import {
  ADVANCE_BUDGET_MS,
  SimulationStore,
  type AdvanceFailure,
  type AdvanceRequest,
} from './SimulationStore';

/** A shader whose state counts up by elapsed time. */
function drifting(advance?: ShaderManifest['simulation']): ShaderManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: 'drifting',
    name: 'Drifting',
    category: 'Test',
    fragmentSource: 'void main() { outColor = vec4(0.0); }',
    parameters: [
      { name: 'speed', label: 'Speed', type: 'number', defaultValue: 1, min: 0, max: 4, step: 0.1 },
    ],
    presets: [{ id: 'default', name: 'Default', values: {} }],
    simulation: advance ?? {
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
      advance: (previous, ctx) => ({
        drift: (previous['drift'] as number) + ctx.dt * (ctx.parameters['speed'] as number),
      }),
    },
  };
}

const still: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'still',
  name: 'Still',
  category: 'Test',
  fragmentSource: 'void main() { outColor = vec4(0.0); }',
  parameters: [],
  presets: [{ id: 'default', name: 'Default', values: {} }],
};

function request(overrides: Partial<AdvanceRequest> = {}): AdvanceRequest {
  return {
    objectId: 'a',
    manifest: drifting(),
    parameters: { speed: 1 },
    pointer: POINTER_ABSENT,
    width: 800,
    height: 600,
    ...overrides,
  };
}

let store: SimulationStore;

beforeEach(() => {
  store = new SimulationStore();
});

describe('state is held per object', () => {
  it('starts from the declared initial state', () => {
    expect(store.advance(request(), 0)).toEqual({ drift: 0 });
  });

  it('keeps two objects using one shader independent', () => {
    store.advance(request({ objectId: 'a' }), 1);
    store.advance(request({ objectId: 'b' }), 3);

    expect(store.valuesFor('a')).toEqual({ drift: 1 });
    expect(store.valuesFor('b')).toEqual({ drift: 3 });
  });

  it('does not let one object advance affect another', () => {
    store.advance(request({ objectId: 'a' }), 1);
    const before = store.valuesFor('a');

    store.advance(request({ objectId: 'b' }), 10);

    expect(store.valuesFor('a')).toEqual(before);
  });

  it('holds nothing for a shader without a simulation', () => {
    expect(store.advance(request({ manifest: still }), 1)).toBeUndefined();
    expect(store.size).toBe(0);
  });
});

describe('advancing with time', () => {
  it('accumulates across frames', () => {
    store.advance(request(), 0.5);
    store.advance(request(), 0.5);

    expect(store.valuesFor('a')).toEqual({ drift: 1 });
  });

  it('runs at a consistent speed under a varying frame rate', () => {
    const steady = new SimulationStore();
    const erratic = new SimulationStore();

    for (let i = 0; i < 60; i += 1) steady.advance(request(), 1 / 60);
    for (const dt of [0.4, 0.05, 0.2, 0.3, 0.05]) erratic.advance(request(), dt);

    expect(steady.valuesFor('a')?.['drift']).toBeCloseTo(
      erratic.valuesFor('a')?.['drift'] as number,
      6,
    );
  });

  it('reflects a parameter change on the next advance', () => {
    store.advance(request(), 1);
    store.advance(request({ parameters: { speed: 4 } }), 1);

    expect(store.valuesFor('a')).toEqual({ drift: 5 });
  });

  it('passes total elapsed time alongside the step', () => {
    const seen: number[] = [];
    const manifest = drifting({
      schema: [],
      initial: {},
      advance: (previous: SimulationState, ctx: AdvanceContext) => {
        seen.push(ctx.elapsed);
        return previous;
      },
    });

    store.advance(request({ manifest }), 0.25);
    store.advance(request({ manifest }), 0.25);

    expect(seen).toEqual([0.25, 0.5]);
  });

  it('advances by the time given, not the time since it was last called', () => {
    // The loop supplies rendering time, so a suspension contributes nothing.
    store.advance(request(), 0.016);
    store.advance(request(), 0.016);

    expect(store.valuesFor('a')?.['drift']).toBeCloseTo(0.032, 6);
  });
});

describe('pointer input reaches the advance', () => {
  it('passes the pointer through', () => {
    const seen: { x: number; y: number; present: boolean }[] = [];
    const manifest = drifting({
      schema: [],
      initial: {},
      advance: (previous: SimulationState, ctx: AdvanceContext) => {
        seen.push({ ...ctx.pointer });
        return previous;
      },
    });

    store.advance(request({ manifest, pointer: { present: true, x: 0.3, y: 0.7 } }), 0.1);

    expect(seen[0]).toEqual({ present: true, x: 0.3, y: 0.7 });
  });

  it('reports it absent when it is not over the object', () => {
    const seen: boolean[] = [];
    const manifest = drifting({
      schema: [],
      initial: {},
      advance: (previous: SimulationState, ctx: AdvanceContext) => {
        seen.push(ctx.pointer.present);
        return previous;
      },
    });

    store.advance(request({ manifest, pointer: POINTER_ABSENT }), 0.1);

    expect(seen).toEqual([false]);
  });
});

describe('a failing advance is contained', () => {
  it('reports an advance that throws, naming the shader', () => {
    const failures: AdvanceFailure[] = [];
    const failing = new SimulationStore({ onAdvanceFailure: (f) => failures.push(f) });
    const manifest = drifting({
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
      advance: () => {
        throw new Error('bad maths');
      },
    });

    failing.advance(request({ manifest }), 0.1);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ shaderId: 'drifting', objectId: 'a', reason: 'threw' });
    expect(failures[0]?.message).toContain('bad maths');
  });

  it('stops advancing that object but keeps its last good state', () => {
    const manifest = drifting({
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
      initial: { drift: 7 },
      advance: () => {
        throw new Error('nope');
      },
    });

    store.advance(request({ manifest }), 0.1);
    store.advance(request({ manifest }), 0.1);

    expect(store.valuesFor('a')).toEqual({ drift: 7 });
  });

  it('leaves other objects advancing', () => {
    const manifest = drifting({
      schema: [],
      initial: {},
      advance: () => {
        throw new Error('nope');
      },
    });

    store.advance(request({ objectId: 'broken', manifest }), 0.1);
    store.advance(request({ objectId: 'fine' }), 1);

    expect(store.valuesFor('fine')).toEqual({ drift: 1 });
  });

  it('reports a shader once rather than every frame', () => {
    const failures: AdvanceFailure[] = [];
    const failing = new SimulationStore({ onAdvanceFailure: (f) => failures.push(f) });
    const manifest = drifting({
      schema: [],
      initial: {},
      advance: () => {
        throw new Error('nope');
      },
    });

    for (let i = 0; i < 10; i += 1) failing.advance(request({ manifest }), 0.1);

    expect(failures).toHaveLength(1);
  });
});

describe('a slow advance is reported against its shader', () => {
  it('reports one that consistently overruns the budget', () => {
    const failures: AdvanceFailure[] = [];
    let clock = 0;
    // Every advance appears to take twice the budget.
    const now = vi.fn(() => {
      clock += ADVANCE_BUDGET_MS * 2;
      return clock;
    });
    const slow = new SimulationStore({ onAdvanceFailure: (f) => failures.push(f) }, now);

    for (let i = 0; i < 40; i += 1) slow.advance(request(), 0.016);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe('too-slow');
    expect(failures[0]?.shaderId).toBe('drifting');
  });

  it('says nothing about an advance within budget', () => {
    const failures: AdvanceFailure[] = [];
    const fast = new SimulationStore({ onAdvanceFailure: (f) => failures.push(f) }, () => 0);

    for (let i = 0; i < 100; i += 1) fast.advance(request(), 0.016);

    expect(failures).toEqual([]);
  });

  it('tolerates a single slow frame', () => {
    const failures: AdvanceFailure[] = [];
    let clock = 0;
    let call = 0;
    const now = vi.fn(() => {
      // One slow advance among many fast ones.
      call += 1;
      clock += call === 2 ? ADVANCE_BUDGET_MS * 5 : 0;
      return clock;
    });
    const store2 = new SimulationStore({ onAdvanceFailure: (f) => failures.push(f) }, now);

    for (let i = 0; i < 50; i += 1) store2.advance(request(), 0.016);

    expect(failures).toEqual([]);
  });
});

describe('releasing state', () => {
  it('forgets an object that is gone', () => {
    store.advance(request(), 1);
    store.release('a');

    expect(store.size).toBe(0);
  });

  it('keeps only the objects still present', () => {
    store.advance(request({ objectId: 'a' }), 1);
    store.advance(request({ objectId: 'b' }), 1);

    store.retainOnly(['a']);

    expect(store.size).toBe(1);
    expect(store.valuesFor('b')).toBeUndefined();
  });

  it('starts fresh after an object is released', () => {
    store.advance(request(), 5);
    store.release('a');

    expect(store.advance(request(), 0)).toEqual({ drift: 0 });
  });
});
