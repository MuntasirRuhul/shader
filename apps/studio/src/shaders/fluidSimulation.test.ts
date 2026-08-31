import { POINTER_ABSENT, type AdvanceContext, type SimulationState } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { advanceFluid, FLUID_INITIAL_STATE, inkColour } from './fluidSimulation';

/**
 * What pushes the fluid. The solve is on the GPU; this is the hand on it, and
 * it is a plain function of its arguments.
 */

type Vector = { x: number; y: number };

const parameters = { force: 0.55, idleFlow: 0, ink1: '#111111', ink2: '#222222', ink3: '#333333' };

function context(overrides: Partial<AdvanceContext> = {}): AdvanceContext {
  return {
    dt: 0.016,
    elapsed: 0,
    parameters,
    pointer: POINTER_ABSENT,
    width: 400,
    height: 300,
    ...overrides,
  };
}

function at(x: number, y: number) {
  return { present: true, x, y };
}

const force = (state: SimulationState) => state['splatForce'] as Vector;
const inkAt = (state: SimulationState) => state['dyePoint'] as Vector;

describe('a hand in the water', () => {
  it('pushes nothing on the frame the pointer arrives', () => {
    // It has travelled nowhere yet; treating that as a stroke flings the water
    // every time the cursor enters the object.
    const next = advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.2, 0.2) }));

    expect(force(next)).toEqual({ x: 0, y: 0 });
    expect(next['dyeStrength']).toBe(0);
  });

  it('pushes where the pointer travelled, as hard as it travelled', () => {
    const arrived = advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.4, 0.5) }));
    const moved = advanceFluid(arrived, context({ pointer: at(0.5, 0.5) }));

    expect(force(moved).x).toBeGreaterThan(0);
    expect(force(moved).y).toBeCloseTo(0, 6);
    expect(moved['activity']).toBe(1);
  });

  it('pushes harder when Force is turned up', () => {
    const gentle = { ...parameters, force: 0.2 };
    const hard = { ...parameters, force: 1 };

    const start = advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.4, 0.5) }));
    const soft = advanceFluid(start, context({ pointer: at(0.5, 0.5), parameters: gentle }));
    const strong = advanceFluid(start, context({ pointer: at(0.5, 0.5), parameters: hard }));

    expect(Math.abs(force(strong).x)).toBeGreaterThan(Math.abs(force(soft).x));
  });

  it('drops the ink a little ahead of the cursor, along its travel', () => {
    const arrived = advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.4, 0.5) }));
    const moved = advanceFluid(arrived, context({ pointer: at(0.5, 0.5) }));

    // Ahead, so the ink gathers into a head rather than trailing as a streak.
    expect(inkAt(moved).x).toBeGreaterThan(0.5);
    expect(inkAt(moved).x).toBeLessThan(0.53);
  });

  it('ignores a jitter that is not really a movement', () => {
    const arrived = advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.5, 0.5) }));
    const still = advanceFluid(arrived, context({ pointer: at(0.50001, 0.5) }));

    expect(force(still)).toEqual({ x: 0, y: 0 });
  });

  it('starts a new stroke when the pointer comes back after leaving', () => {
    const arrived = advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.2, 0.2) }));
    const moved = advanceFluid(arrived, context({ pointer: at(0.4, 0.4) }));
    const gone = advanceFluid(moved, context());
    const back = advanceFluid(gone, context({ pointer: at(0.9, 0.9) }));

    // Without this, returning across the object counts as one enormous sweep.
    expect(force(back)).toEqual({ x: 0, y: 0 });
  });

  it('settles when nobody is pushing it', () => {
    let state: SimulationState = advanceFluid(
      advanceFluid(FLUID_INITIAL_STATE, context({ pointer: at(0.4, 0.5) })),
      context({ pointer: at(0.5, 0.5) }),
    );
    expect(state['activity']).toBe(1);

    for (let frame = 0; frame < 40; frame += 1) state = advanceFluid(state, context());

    expect(state['activity']).toBeLessThan(0.1);
  });

  it('steps by a stable amount however fast the display runs', () => {
    const slow = advanceFluid(FLUID_INITIAL_STATE, context({ dt: 2 }));
    const fast = advanceFluid(FLUID_INITIAL_STATE, context({ dt: 0.0001 }));

    expect(slow['dt']).toBeLessThanOrEqual(0.016);
    expect(fast['dt']).toBeGreaterThanOrEqual(0.008);
  });
});

describe('the water stirring itself', () => {
  const stirring = { ...parameters, idleFlow: 0.5 };

  it('keeps the ink moving when nobody is pushing', () => {
    const first = advanceFluid(FLUID_INITIAL_STATE, context({ parameters: stirring, elapsed: 0 }));
    const later = advanceFluid(first, context({ parameters: stirring, elapsed: 2 }));

    expect(inkAt(later)).not.toEqual(inkAt(first));
    expect(later['dyeStrength']).toBeGreaterThan(0);
  });

  it('stirs inside the object, not off the edge of it', () => {
    for (let elapsed = 0; elapsed < 40; elapsed += 0.7) {
      const state = advanceFluid(FLUID_INITIAL_STATE, context({ parameters: stirring, elapsed }));
      const point = inkAt(state);
      expect(point.x).toBeGreaterThan(0.1);
      expect(point.x).toBeLessThan(0.9);
      expect(point.y).toBeGreaterThan(0.1);
      expect(point.y).toBeLessThan(0.9);
    }
  });

  it('waits in the dark at zero, which is the source experiment behaviour', () => {
    let state: SimulationState = FLUID_INITIAL_STATE;
    for (let frame = 0; frame < 20; frame += 1) {
      state = advanceFluid(state, context({ elapsed: frame * 0.016 }));
    }

    expect(state['dyeStrength']).toBe(0);
    expect(force(state)).toEqual({ x: 0, y: 0 });
  });

  it('gives way to a hand the moment there is one', () => {
    const stirred = advanceFluid(FLUID_INITIAL_STATE, context({ parameters: stirring }));
    const arrived = advanceFluid(stirred, context({ parameters: stirring, pointer: at(0.3, 0.3) }));
    const pushed = advanceFluid(arrived, context({ parameters: stirring, pointer: at(0.5, 0.3) }));

    expect(pushed['activity']).toBe(1);
    expect(inkAt(pushed).x).toBeGreaterThan(0.4);
  });
});

describe('the ink being dipped into', () => {
  it('cycles through the three colours the user chose', () => {
    expect(inkColour(parameters, 0)).toBe('#111111');
    expect(inkColour(parameters, 29)).toBe('#111111');
    expect(inkColour(parameters, 30)).toBe('#222222');
    expect(inkColour(parameters, 60)).toBe('#333333');
    expect(inkColour(parameters, 90)).toBe('#111111');
  });

  it('follows the palette as it is edited', () => {
    expect(inkColour({ ...parameters, ink1: '#ff0000' }, 0)).toBe('#ff0000');
  });

  it('reaches the shader as state, so the pass binds it like any colour', () => {
    const state = advanceFluid(FLUID_INITIAL_STATE, context());

    expect(state['dyeColor']).toBe('#111111');
  });
});
