import type { AdvanceContext, ParameterValues, SimulationState } from '@shader/core';

/**
 * The water ripple's wake, ported from the `water-ripple-v4` experiment.
 *
 * In the source this lived in the page's own event handlers: a mousemove
 * pushed a point onto a list, and the frame loop aged and expired it. Here it
 * is state the manifest declares and a plain advance function steps, so the
 * wake can be run and asserted with no canvas at all.
 *
 * Each entry is a source of one expanding ring. A moving pointer leaves a
 * train of them, which is what reads as a wake rather than as one pulse.
 *
 * Ages are carried in the state rather than birth times compared against a
 * clock, because the runtime's `uTime` and an object's own elapsed seconds are
 * not the same number — a ring whose age came out negative would never appear.
 */

/** What the shader's uniform arrays allocate for. */
export const MAX_RIPPLES = 24;

/** How far the pointer must travel before it drops another ring. */
const EMIT_DISTANCE = 0.012;

/** A long frame is treated as a short one; a stalled tab must not skip a wake. */
const MAX_STEP = 0.05;

/** A drop that falls on its own is quieter than one the pointer makes. */
const RAIN_STRENGTH = 0.55;

/** One entry: where the ring started, how old it is, and how hard it hit. */
type Ripple = {
  readonly position: { readonly x: number; readonly y: number };
  readonly age: number;
  readonly strength: number;
};

// A type alias rather than an interface, so it satisfies the state's index
// signature: a state value is whatever the schema can bind.
type WaterRippleState = SimulationState & {
  readonly ripples: readonly Ripple[];
  /** Where the pointer last dropped a ring, so a still pointer drops none. */
  readonly lastEmit: { readonly x: number; readonly y: number };
  /** False until the pointer has been seen, so its arrival makes a ring. */
  readonly emitted: boolean;
  /** Seconds owed to the rain, so a slow rate still lands between frames. */
  readonly rainDue: number;
  /** The rain's own randomness, kept in state so a frame is reproducible. */
  readonly seed: number;
};

export const WATER_RIPPLE_INITIAL_STATE: WaterRippleState = {
  ripples: [],
  lastEmit: { x: 0.5, y: 0.5 },
  emitted: false,
  rainDue: 0,
  seed: 1,
};

function numberAt(values: ParameterValues, name: string, fallback: number): number {
  const value = values[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A deterministic pseudo-random number and the seed that follows it.
 *
 * The rain has to fall somewhere, and `Math.random` would make the simulation
 * untestable and every frame irreproducible.
 */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed * 1664525 + 1013904223) % 4294967296;
  return { value: next / 4294967296, seed: next };
}

function asState(previous: SimulationState): WaterRippleState {
  const ripples = Array.isArray(previous['ripples'])
    ? (previous['ripples'] as readonly Ripple[])
    : [];
  const lastEmit = previous['lastEmit'] as { x: number; y: number } | undefined;

  return {
    ripples,
    lastEmit: lastEmit ?? WATER_RIPPLE_INITIAL_STATE.lastEmit,
    emitted: previous['emitted'] === true,
    rainDue: typeof previous['rainDue'] === 'number' ? previous['rainDue'] : 0,
    seed: typeof previous['seed'] === 'number' ? previous['seed'] : 1,
  };
}

/**
 * Advances the wake by one frame: everything ages, what has outlived its ring
 * life goes, the pointer drops rings as it travels, and the rain drops its own.
 */
export function advanceWaterRipple(
  previous: SimulationState,
  context: AdvanceContext,
): SimulationState {
  const state = asState(previous);
  const step = Math.min(Math.max(context.dt, 0), MAX_STEP);

  const life = numberAt(context.parameters, 'ringLife', 1.8);
  const strength = numberAt(context.parameters, 'strength', 0.45);
  const rain = numberAt(context.parameters, 'rain', 0.6);

  const aged = state.ripples
    .map((ripple) => ({ ...ripple, age: ripple.age + step }))
    .filter((ripple) => ripple.age < life);

  let ripples = aged;
  let { lastEmit, emitted, rainDue, seed } = state;

  // The pointer drops a ring every so often along its path. Emitting on every
  // frame instead would spend the whole list on one flick of the wrist.
  if (context.pointer.present) {
    const here = { x: context.pointer.x, y: context.pointer.y };
    const travelled = Math.hypot(here.x - lastEmit.x, here.y - lastEmit.y);

    if (!emitted || travelled > EMIT_DISTANCE) {
      ripples = [...ripples, { position: here, age: 0, strength }];
      lastEmit = here;
      emitted = true;
    }
  } else {
    // Left the object: the next arrival should ring, wherever it lands.
    emitted = false;
  }

  // Rain, so an object nobody is touching is still water rather than a
  // photograph of water.
  if (rain > 0) {
    rainDue += step * rain;
    while (rainDue >= 1) {
      rainDue -= 1;
      const x = nextRandom(seed);
      const y = nextRandom(x.seed);
      seed = y.seed;
      ripples = [
        ...ripples,
        {
          position: { x: x.value, y: y.value },
          age: 0,
          strength: strength * RAIN_STRENGTH,
        },
      ];
    }
  } else {
    rainDue = 0;
  }

  // The program reads a fixed-size array, so the oldest rings go first.
  if (ripples.length > MAX_RIPPLES) ripples = ripples.slice(ripples.length - MAX_RIPPLES);

  return { ripples, lastEmit, emitted, rainDue, seed };
}
