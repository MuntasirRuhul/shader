import type { AdvanceContext, ParameterValues, SimulationState } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { metaballManifest } from './metaball';
import { createMetaballAdvance, MAX_BALLS, METABALL_INITIAL_STATE } from './metaballSimulation';

/**
 * The metaball's motion, run with no canvas at all — which is the point of an
 * advance being a plain function: what the shader does can be asserted rather
 * than watched.
 */

/**
 * A repeatable stand-in for `Math.random`, so a run can be reproduced. It has
 * to spread its values as the real one does: balls that all spawn in the same
 * place would make every question about how they move unanswerable.
 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** A fresh simulation, so two runs are comparable rather than consecutive. */
function simulation() {
  return createMetaballAdvance(seeded(20260830));
}

function context(overrides: Partial<AdvanceContext> = {}): AdvanceContext {
  return {
    dt: 1 / 60,
    elapsed: 0,
    parameters: { ballCount: 3, size: 0.06, blur: 0, magnet: 0, speed: 1 },
    pointer: { present: false, x: 0, y: 0 },
    width: 400,
    height: 400,
    ...overrides,
  };
}

interface Ball {
  position: { x: number; y: number };
  radius: number;
  color: string;
  weight: number;
}

function ballsOf(state: SimulationState): Ball[] {
  return (state['balls'] ?? []) as unknown as Ball[];
}

/** Runs a fresh simulation for a while at a steady frame rate. */
function run(frames: number, overrides: Partial<AdvanceContext> = {}): SimulationState {
  const advance = simulation();
  const dt = overrides.dt ?? 1 / 60;
  let state: SimulationState = METABALL_INITIAL_STATE;

  for (let frame = 0; frame < frames; frame += 1) {
    state = advance(state, context({ ...overrides, dt, elapsed: frame * dt }));
  }

  return state;
}

/** How far apart the balls are on average, which Magnet should reduce. */
function spread(state: SimulationState): number {
  const balls = ballsOf(state);
  let total = 0;
  let pairs = 0;

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      if (!a || !b) continue;
      total += Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      pairs += 1;
    }
  }

  return pairs === 0 ? 0 : total / pairs;
}

describe('running with no canvas', () => {
  it('spawns as many balls as Count asks for', () => {
    expect(ballsOf(run(1)).length).toBe(3);
    expect(ballsOf(run(1, { parameters: { ballCount: 12 } })).length).toBe(12);
  });

  it('never spawns more than the program allocates for', () => {
    expect(ballsOf(run(1, { parameters: { ballCount: 999 } })).length).toBe(MAX_BALLS);
  });

  it('removes balls when Count falls', () => {
    const advance = simulation();
    let state = advance(METABALL_INITIAL_STATE, context({ parameters: { ballCount: 8 } }));
    state = advance(state, context({ parameters: { ballCount: 2 } }));

    expect(ballsOf(state).length).toBe(2);
  });

  it('leaves the declared initial state untouched, so a second object starts fresh', () => {
    run(20);

    expect(METABALL_INITIAL_STATE.balls).toEqual([]);
    expect(METABALL_INITIAL_STATE.clock).toBe(0);
  });

  it('eases a new ball in rather than popping it into the field', () => {
    const first = simulation()(METABALL_INITIAL_STATE, context());
    const later = run(60);

    expect(ballsOf(first)[0]?.weight).toBeLessThan(0.2);
    expect(ballsOf(later)[0]?.weight).toBe(1);
  });

  it('gives each ball a colour from the palette, in turn', () => {
    const palette: ParameterValues = { color: '#ff0000' };
    const state = run(2, {
      parameters: { ballCount: 3, palette: [palette, { color: '#00ff00' }] },
    });

    expect(ballsOf(state).map((ball) => ball.color)).toEqual(['#ff0000', '#00ff00', '#ff0000']);
  });

  it('sizes the balls around Size, varying them as the source does', () => {
    const state = run(2, { parameters: { ballCount: 4, size: 0.1 } });

    for (const ball of ballsOf(state)) {
      expect(ball.radius).toBeGreaterThanOrEqual(0.1 * 0.6);
      expect(ball.radius).toBeLessThanOrEqual(0.1 * 1.4);
    }
  });
});

describe('the balls drift', () => {
  it('moves them over time', () => {
    const early = run(2);
    const late = run(600);

    const moved = ballsOf(early).some((ball, index) => {
      const after = ballsOf(late)[index];
      return (
        after !== undefined &&
        Math.hypot(after.position.x - ball.position.x, after.position.y - ball.position.y) > 0.01
      );
    });

    expect(moved).toBe(true);
  });

  it('holds still when Speed is zero', () => {
    const advance = simulation();
    const still = { ballCount: 3, speed: 0 };
    const first = advance(METABALL_INITIAL_STATE, context({ parameters: still }));
    let state = first;
    for (let frame = 1; frame < 300; frame += 1) {
      state = advance(state, context({ parameters: still, elapsed: frame / 60 }));
    }

    expect(ballsOf(state)[0]?.position).toEqual(ballsOf(first)[0]?.position);
    // Still visible, though: a paused field is not an empty one.
    expect(ballsOf(state)[0]?.weight).toBe(1);
  });

  it('runs faster at a higher Speed', () => {
    const slow = run(300, { parameters: { ballCount: 3, speed: 0.5 } });
    const fast = run(300, { parameters: { ballCount: 3, speed: 2 } });

    expect((fast['clock'] as number) / (slow['clock'] as number)).toBeCloseTo(4, 5);
  });

  it('reaches the same place under a varying frame rate as a steady one', () => {
    // Two seconds of simulation, once at 60fps and once at 30.
    const steady = run(120, { parameters: { ballCount: 2 }, dt: 1 / 60 });
    const halved = run(60, { parameters: { ballCount: 2 }, dt: 1 / 30 });

    const a = ballsOf(steady)[0];
    const b = ballsOf(halved)[0];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;

    // Integration is not exact across step sizes; it must not diverge.
    expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeLessThan(0.02);
  });

  it('keeps every ball inside the object', () => {
    const state = run(900, { parameters: { ballCount: 6, size: 0.08 } });

    for (const ball of ballsOf(state)) {
      expect(ball.position.x).toBeGreaterThanOrEqual(0);
      expect(ball.position.x).toBeLessThanOrEqual(1);
      expect(ball.position.y).toBeGreaterThanOrEqual(0);
      expect(ball.position.y).toBeLessThanOrEqual(1);
    }
  });
});

describe('Magnet pulls the balls together', () => {
  it('closes the distance between them', () => {
    const apart = run(300, { parameters: { ballCount: 4, magnet: 0 } });
    const drawn = run(300, { parameters: { ballCount: 4, magnet: 1 } });

    expect(spread(drawn)).toBeLessThan(spread(apart));
  });

  it('pulls harder the higher it is set', () => {
    const gentle = run(300, { parameters: { ballCount: 4, magnet: 0.2 } });
    const strong = run(300, { parameters: { ballCount: 4, magnet: 1 } });

    expect(spread(strong)).toBeLessThan(spread(gentle));
  });
});

describe('the pointer pushes the balls away', () => {
  it('moves them away from where the pointer is', () => {
    const parameters = { ballCount: 3, speed: 1, magnet: 0 };
    const pointer = { present: true, x: 0.5, y: 0.5 };

    const undisturbed = run(120, { parameters });
    const pushed = run(120, { parameters, pointer });

    const distanceFromPointer = (state: SimulationState) => {
      const balls = ballsOf(state);
      return (
        balls.reduce(
          (total, ball) => total + Math.hypot(ball.position.x - 0.5, ball.position.y - 0.5),
          0,
        ) / Math.max(balls.length, 1)
      );
    };

    expect(distanceFromPointer(pushed)).toBeGreaterThan(distanceFromPointer(undisturbed));
  });

  it('stops pushing once the pointer leaves', () => {
    const parameters = { ballCount: 2 };
    const pointer = { present: false, x: 0.5, y: 0.5 };

    // With the pointer absent the position it carries is meaningless, and must
    // not still be repelling anything.
    expect(ballsOf(run(60, { parameters, pointer }))).toEqual(
      ballsOf(run(60, { parameters, pointer: { present: false, x: 0.9, y: 0.9 } })),
    );
  });
});

describe('the shipped manifest', () => {
  it('carries the simulation, so the shader moves in the application too', () => {
    expect(metaballManifest.simulation?.advance).toBeTypeOf('function');
    expect(metaballManifest.simulation?.initial).toEqual({ clock: 0, balls: [] });
  });

  it('offers the controls the source experiment has', () => {
    const names = metaballManifest.parameters.map((parameter) => parameter.name);

    expect(names).toEqual([
      'ballCount',
      'size',
      'blur',
      'magnet',
      'speed',
      'palette',
      'background',
    ]);
  });

  it('leaves no ball editable, since the simulation owns them', () => {
    // The inspector builds from `parameters`; the balls are not there.
    const editable = metaballManifest.parameters.map((parameter) => parameter.name);

    expect(editable).not.toContain('balls');
  });
});
