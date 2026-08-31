import { POINTER_ABSENT, type AdvanceContext, type SimulationState } from '@shader/core';
import { describe, expect, it } from 'vitest';
import {
  advanceWaterRipple,
  MAX_RIPPLES,
  WATER_RIPPLE_INITIAL_STATE,
} from './waterRippleSimulation';

/**
 * The water ripple's wake. It is a plain function of its arguments, so the
 * behaviour the source experiment kept in event handlers — a ring per stretch
 * of pointer travel, ageing, expiry — is assertable with no canvas at all.
 */

type Ripple = { position: { x: number; y: number }; age: number; strength: number };

function ripplesOf(state: SimulationState): readonly Ripple[] {
  return (state['ripples'] ?? []) as readonly Ripple[];
}

function context(overrides: Partial<AdvanceContext> = {}): AdvanceContext {
  return {
    dt: 0.016,
    elapsed: 0,
    parameters: { ringLife: 1.8, strength: 0.45, rain: 0 },
    pointer: POINTER_ABSENT,
    width: 400,
    height: 300,
    ...overrides,
  };
}

function at(x: number, y: number) {
  return { present: true, x, y };
}

describe('the wake', () => {
  it('rings where the pointer arrives', () => {
    const next = advanceWaterRipple(
      WATER_RIPPLE_INITIAL_STATE,
      context({ pointer: at(0.25, 0.75) }),
    );

    expect(ripplesOf(next)).toEqual([{ position: { x: 0.25, y: 0.75 }, age: 0, strength: 0.45 }]);
  });

  it('drops no second ring while the pointer holds still', () => {
    const first = advanceWaterRipple(
      WATER_RIPPLE_INITIAL_STATE,
      context({ pointer: at(0.5, 0.5) }),
    );
    const second = advanceWaterRipple(first, context({ pointer: at(0.5, 0.5) }));

    expect(ripplesOf(second)).toHaveLength(1);
  });

  it('drops another once the pointer has travelled far enough', () => {
    const first = advanceWaterRipple(
      WATER_RIPPLE_INITIAL_STATE,
      context({ pointer: at(0.5, 0.5) }),
    );
    const nudged = advanceWaterRipple(first, context({ pointer: at(0.505, 0.5) }));
    const moved = advanceWaterRipple(nudged, context({ pointer: at(0.6, 0.5) }));

    expect(ripplesOf(nudged)).toHaveLength(1);
    expect(ripplesOf(moved)).toHaveLength(2);
  });

  it('rings again when the pointer comes back after leaving', () => {
    const first = advanceWaterRipple(
      WATER_RIPPLE_INITIAL_STATE,
      context({ pointer: at(0.5, 0.5) }),
    );
    const gone = advanceWaterRipple(first, context());
    const back = advanceWaterRipple(gone, context({ pointer: at(0.5, 0.5) }));

    expect(ripplesOf(back)).toHaveLength(2);
  });

  it('ages every ring by the frame it was given', () => {
    const first = advanceWaterRipple(
      WATER_RIPPLE_INITIAL_STATE,
      context({ pointer: at(0.5, 0.5) }),
    );
    const later = advanceWaterRipple(first, context({ dt: 0.02 }));

    expect(ripplesOf(later)[0]?.age).toBeCloseTo(0.02, 5);
  });

  it('treats a long frame as a short one, so a stalled tab does not skip the wake', () => {
    const first = advanceWaterRipple(
      WATER_RIPPLE_INITIAL_STATE,
      context({ pointer: at(0.5, 0.5) }),
    );
    const later = advanceWaterRipple(first, context({ dt: 4 }));

    expect(ripplesOf(later)[0]?.age).toBeLessThanOrEqual(0.05);
  });

  it('forgets a ring once it has outlived its life', () => {
    let state = advanceWaterRipple(WATER_RIPPLE_INITIAL_STATE, context({ pointer: at(0.5, 0.5) }));

    for (let frame = 0; frame < 60; frame += 1) {
      state = advanceWaterRipple(state, context({ dt: 0.05 }));
    }

    expect(ripplesOf(state)).toEqual([]);
  });

  it('keeps only as many rings as the program allocates for', () => {
    let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;

    for (let frame = 0; frame < MAX_RIPPLES * 2; frame += 1) {
      state = advanceWaterRipple(state, context({ pointer: at(0.02 * frame, 0.5), dt: 0.001 }));
    }

    expect(ripplesOf(state)).toHaveLength(MAX_RIPPLES);
    // The oldest go first: what is left is the end of the path.
    expect(ripplesOf(state).at(-1)?.position.x).toBeCloseTo(0.02 * (MAX_RIPPLES * 2 - 1), 5);
  });
});

describe('the rain', () => {
  const raining = (rain: number) =>
    context({ parameters: { ringLife: 1.8, strength: 0.45, rain }, dt: 0.05 });

  it('falls on an object nobody is touching', () => {
    let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;
    for (let frame = 0; frame < 20; frame += 1) state = advanceWaterRipple(state, raining(2));

    expect(ripplesOf(state).length).toBeGreaterThan(0);
  });

  it('falls at the rate asked for', () => {
    const drops = (rain: number, frames: number) => {
      let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;
      for (let frame = 0; frame < frames; frame += 1) {
        state = advanceWaterRipple(state, {
          ...raining(rain),
          // Long enough that none of them expires before it is counted.
          parameters: { ringLife: 60, strength: 0.45, rain },
        });
      }
      return ripplesOf(state).length;
    };

    // Ten seconds at one a second, then at two. The accumulator carries what
    // is left over between frames, so the count is the rate, give or take the
    // drop that is still owed. Both stay under the list's own ceiling.
    expect(drops(1, 200)).toBeGreaterThanOrEqual(9);
    expect(drops(1, 200)).toBeLessThanOrEqual(10);
    expect(drops(2, 200)).toBeGreaterThanOrEqual(19);
    expect(drops(2, 200)).toBeLessThanOrEqual(20);
  });

  it('is quieter than the pointer', () => {
    let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;
    for (let frame = 0; frame < 20; frame += 1) state = advanceWaterRipple(state, raining(2));

    expect(ripplesOf(state)[0]?.strength).toBeLessThan(0.45);
  });

  it('falls in the same places every time it is run', () => {
    const run = () => {
      let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;
      for (let frame = 0; frame < 20; frame += 1) state = advanceWaterRipple(state, raining(3));
      return ripplesOf(state).map((ripple) => ripple.position);
    };

    expect(run()).toEqual(run());
  });

  it('falls somewhere on the object, not in one corner', () => {
    let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;
    for (let frame = 0; frame < 40; frame += 1) state = advanceWaterRipple(state, raining(3));

    for (const { position } of ripplesOf(state)) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(1);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThanOrEqual(1);
    }
    expect(new Set(ripplesOf(state).map((ripple) => ripple.position.x)).size).toBeGreaterThan(1);
  });

  it('stops entirely at zero, which is the source experiment behaviour', () => {
    let state: SimulationState = WATER_RIPPLE_INITIAL_STATE;
    for (let frame = 0; frame < 40; frame += 1) state = advanceWaterRipple(state, raining(0));

    expect(ripplesOf(state)).toEqual([]);
  });
});
