import type { AdvanceContext, ParameterValues, SimulationState } from '@shader/core';

/**
 * What pushes the fluid, ported from the `fluid-mvp` experiment.
 *
 * The solver itself is on the GPU — six passes of curl, vorticity, divergence,
 * pressure, velocity and dye. What lives here is everything the source kept in
 * its event handlers: where the pointer is, how fast it moved, how long ago it
 * did, and which colour of ink the next push carries.
 *
 * It is a plain function of its arguments, so the behaviour that makes the ink
 * feel alive — the impulse, the palette cycling, the decay to stillness — can
 * be asserted with no canvas at all.
 */

/** The step the solver is stable at, whatever the display is doing. */
const MIN_STEP = 0.008;
const MAX_STEP = 0.016;

/** How much of its push the water keeps each frame once nobody is pushing. */
const ACTIVITY_DECAY = 0.94;

/** Frames each ink colour lasts before the next is dipped into. */
const COLOUR_FRAMES = 30;

/** Pointer travel, in object widths, that counts as a push rather than a jitter. */
const MOVE_THRESHOLD = 0.0005;

/** Turns a pointer's travel per frame into the impulse the solver takes. */
const FORCE_SCALE = 9000;

/** How far ahead of the cursor the ink is dropped, so it forms a head. */
const MAX_LEAD = 0.02;

type Vector = { readonly x: number; readonly y: number };

// A type alias rather than an interface, so it satisfies the state's index
// signature: a state value is whatever the schema can bind.
type FluidState = SimulationState & {
  /** Seconds the solver steps by. Clamped, because a solve is not a movie. */
  readonly dt: number;
  /** 1 while the water is being pushed, decaying to 0 when it is left alone. */
  readonly activity: number;
  /** Where the velocity impulse lands, and how hard. */
  readonly splatPoint: Vector;
  readonly splatForce: Vector;
  /** Where the ink lands, what colour, and whether any is being added at all. */
  readonly dyePoint: Vector;
  readonly dyeColor: string;
  readonly dyeStrength: number;
  /** The pointer as it was last frame, for the travel between them. */
  readonly lastPointer: Vector;
  readonly pointerSeen: boolean;
  readonly frames: number;
};

export const FLUID_INITIAL_STATE: FluidState = {
  dt: MIN_STEP,
  activity: 0,
  splatPoint: { x: 0.5, y: 0.5 },
  splatForce: { x: 0, y: 0 },
  dyePoint: { x: 0.5, y: 0.5 },
  dyeColor: '#2b3cff',
  dyeStrength: 0,
  lastPointer: { x: 0.5, y: 0.5 },
  pointerSeen: false,
  frames: 0,
};

function numberAt(values: ParameterValues, name: string, fallback: number): number {
  const value = values[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorAt(values: ParameterValues, name: string, fallback: string): string {
  const value = values[name];
  return typeof value === 'string' ? value : fallback;
}

function vectorAt(state: SimulationState, name: string, fallback: Vector): Vector {
  const value = state[name];
  if (typeof value !== 'object' || value === null) return fallback;
  const candidate = value as Vector;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number' ? candidate : fallback;
}

/** The ink dipped into next, cycling through the three the user chose. */
export function inkColour(parameters: ParameterValues, frames: number): string {
  const palette = [
    colorAt(parameters, 'ink1', '#2b3cff'),
    colorAt(parameters, 'ink2', '#00b3ff'),
    colorAt(parameters, 'ink3', '#a24bff'),
  ];
  return palette[Math.floor(frames / COLOUR_FRAMES) % palette.length] ?? palette[0] ?? '#2b3cff';
}

function asState(previous: SimulationState): FluidState {
  return {
    dt: typeof previous['dt'] === 'number' ? previous['dt'] : MIN_STEP,
    activity: typeof previous['activity'] === 'number' ? previous['activity'] : 0,
    splatPoint: vectorAt(previous, 'splatPoint', FLUID_INITIAL_STATE.splatPoint),
    splatForce: vectorAt(previous, 'splatForce', FLUID_INITIAL_STATE.splatForce),
    dyePoint: vectorAt(previous, 'dyePoint', FLUID_INITIAL_STATE.dyePoint),
    dyeColor: typeof previous['dyeColor'] === 'string' ? previous['dyeColor'] : '#2b3cff',
    dyeStrength: typeof previous['dyeStrength'] === 'number' ? previous['dyeStrength'] : 0,
    lastPointer: vectorAt(previous, 'lastPointer', FLUID_INITIAL_STATE.lastPointer),
    pointerSeen: previous['pointerSeen'] === true,
    frames: typeof previous['frames'] === 'number' ? previous['frames'] : 0,
  };
}

/**
 * Where the water stirs itself, when nobody is stirring it.
 *
 * The source experiment was a hero behind a headline: black until the visitor
 * moved, which on that page is the whole invitation. An object on a canvas of
 * objects is different — one that shows nothing until it is touched reads as
 * broken — so the ink keeps moving on a slow path of its own, and setting the
 * flow to zero gives the source's behaviour back.
 */
function idleStir(elapsed: number): { point: Vector; direction: Vector } {
  // Two frequencies that do not divide into one another, so the path drifts
  // instead of retracing a figure of eight for ever.
  const angle = elapsed * 0.31;
  const point = {
    x: 0.5 + 0.26 * Math.cos(angle),
    y: 0.5 + 0.21 * Math.sin(angle * 1.37),
  };
  // The tangent of that path: the stir pushes along the way it is travelling.
  const direction = {
    x: -0.26 * 0.31 * Math.sin(angle),
    y: 0.21 * 0.31 * 1.37 * Math.cos(angle * 1.37),
  };
  return { point, direction };
}

/**
 * Advances the pushing by one frame: the pointer's impulse, or the idle stir
 * standing in for it, and the ink that goes with either.
 */
export function advanceFluid(previous: SimulationState, context: AdvanceContext): SimulationState {
  const state = asState(previous);
  const step = Math.min(Math.max(context.dt, MIN_STEP), MAX_STEP);

  const force = numberAt(context.parameters, 'force', 0.55);
  const idleFlow = numberAt(context.parameters, 'idleFlow', 0.35);

  const frames = state.frames + 1;
  const colour = inkColour(context.parameters, frames);

  let activity = state.activity * ACTIVITY_DECAY;
  let splatPoint = state.splatPoint;
  let splatForce = { x: 0, y: 0 };
  let dyePoint = state.dyePoint;
  let dyeStrength = 0;
  let lastPointer = state.lastPointer;
  let pointerSeen = state.pointerSeen;

  if (context.pointer.present) {
    const here = { x: context.pointer.x, y: context.pointer.y };
    // A pointer that has just arrived has travelled nowhere, so its first
    // frame pushes nothing — otherwise entering the object flings the water.
    const travel = pointerSeen
      ? { x: here.x - lastPointer.x, y: here.y - lastPointer.y }
      : { x: 0, y: 0 };
    const speed = Math.hypot(travel.x, travel.y);

    if (speed > MOVE_THRESHOLD) {
      activity = 1;
      splatPoint = here;
      splatForce = { x: travel.x * force * FORCE_SCALE, y: travel.y * force * FORCE_SCALE };

      // The ink is dropped a little ahead of the cursor along its travel, so
      // it gathers into a rounded head rather than trailing as a streak.
      const lead = Math.min(speed * 0.6, MAX_LEAD);
      dyePoint = {
        x: here.x + (travel.x / speed) * lead,
        y: here.y + (travel.y / speed) * lead,
      };
      dyeStrength = 1;
    }

    lastPointer = here;
    pointerSeen = true;
  } else {
    // Gone: the next arrival starts a new stroke rather than joining the last.
    pointerSeen = false;
  }

  if (dyeStrength === 0 && idleFlow > 0) {
    const stir = idleStir(context.elapsed);
    splatPoint = stir.point;
    splatForce = {
      x: stir.direction.x * idleFlow * force * FORCE_SCALE * step,
      y: stir.direction.y * idleFlow * force * FORCE_SCALE * step,
    };
    dyePoint = stir.point;
    dyeStrength = idleFlow;
    // A stir keeps the water lively enough for the vorticity to bite, without
    // ever reaching what a hand does.
    activity = Math.max(activity, idleFlow * 0.5);
  }

  return {
    dt: step,
    activity,
    splatPoint,
    splatForce,
    dyePoint,
    dyeColor: colour,
    dyeStrength,
    lastPointer,
    pointerSeen,
    frames,
  };
}
