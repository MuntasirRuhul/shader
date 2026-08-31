import type { AdvanceContext, ParameterValues, SimulationState } from '@shader/core';

/**
 * The ink trail, ported from the `general builder` prototype's blob studio.
 *
 * The cursor is not the ink. A lead point chases the cursor with a lag, and
 * stamps a blob every fixed step along the path it actually travelled — which
 * is what gives the trail its weight, and what makes a fast flick stretch the
 * blobs out rather than teleport them.
 *
 * Each blob then ages: it shrinks, and its lifetime and roundness are varied
 * per blob so the tail breaks into separate drops rather than fading as one
 * even sausage. The variation is seeded from the state, so the same trail runs
 * the same way twice and can be asserted in a test.
 */

/** What the shader's uniform arrays allocate for; the source's own ceiling. */
export const MAX_BLOBS = 96;

/** How far the lead travels between stamps, in object widths. */
const SPACING = 0.011;

/** A long frame is treated as a short one, so a stall does not fling the ink. */
const MAX_STEP = 0.05;

/** How quickly the measured speed follows the real one. */
const SPEED_SMOOTHING = 0.2;

/** Below this the blob is smaller than a dither cell, and is not worth binding. */
const MIN_RADIUS = 0.0005;

type Point = { readonly x: number; readonly y: number };

/**
 * One stamp. `position` and `radius` are what the field pass reads; the rest
 * is the trail's own bookkeeping, which the state schema does not name and the
 * uniform binding therefore ignores.
 */
type Blob = {
  /** In the field's space: x is multiplied by the object's aspect. */
  readonly position: Point;
  readonly radius: number;
  /** Seconds since it was stamped. */
  readonly age: number;
  /** How much the lead had slowed when it was stamped: fast strokes thin out. */
  readonly swell: number;
  /** Its own lopsidedness and lifetime, so the tail breaks up unevenly. */
  readonly jitter: number;
  readonly lifeMul: number;
};

// A type alias rather than an interface, so it satisfies the state's index
// signature: a state value is whatever the schema can bind.
type InkTrailState = SimulationState & {
  readonly blobs: readonly Blob[];
  /** The chasing point, in the field's space. Absent until the first frame. */
  readonly lead: Point;
  readonly lastEmit: Point;
  readonly leadSpeed: number;
  readonly started: boolean;
  readonly seed: number;
};

export const INK_TRAIL_INITIAL_STATE: InkTrailState = {
  blobs: [],
  lead: { x: 0.5, y: 0.5 },
  lastEmit: { x: 0.5, y: 0.5 },
  leadSpeed: 0,
  started: false,
  seed: 1,
};

function numberAt(values: ParameterValues, name: string, fallback: number): number {
  const value = values[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A deterministic pseudo-random number and the seed that follows it. */
function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed * 1664525 + 1013904223) % 4294967296;
  return { value: next / 4294967296, seed: next };
}

function pointAt(state: SimulationState, name: string, fallback: Point): Point {
  const value = state[name];
  if (typeof value !== 'object' || value === null) return fallback;
  const candidate = value as Point;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number' ? candidate : fallback;
}

function asState(previous: SimulationState): InkTrailState {
  return {
    blobs: Array.isArray(previous['blobs']) ? (previous['blobs'] as readonly Blob[]) : [],
    lead: pointAt(previous, 'lead', INK_TRAIL_INITIAL_STATE.lead),
    lastEmit: pointAt(previous, 'lastEmit', INK_TRAIL_INITIAL_STATE.lastEmit),
    leadSpeed: typeof previous['leadSpeed'] === 'number' ? previous['leadSpeed'] : 0,
    started: previous['started'] === true,
    seed: typeof previous['seed'] === 'number' ? previous['seed'] : 1,
  };
}

/**
 * Where the ink goes when nobody is drawing with it.
 *
 * The prototype was one canvas with a cursor over it, and drew nothing until
 * the pointer arrived. An object among other objects has to show what it is,
 * so it draws itself a slow figure; setting the drift to zero waits for a
 * hand, as the prototype did.
 */
function driftTarget(elapsed: number, aspect: number): Point {
  const angle = elapsed * 0.42;
  return {
    x: (0.5 + 0.24 * Math.sin(angle) * Math.cos(angle * 0.37)) * aspect,
    y: 0.5 + 0.2 * Math.cos(angle * 0.71),
  };
}

/** The lifetime one blob was given, in seconds. */
function lifeOf(blob: Blob, trailLife: number, breakup: number): number {
  return trailLife * (1 + (blob.lifeMul - 1) * breakup);
}

/**
 * The radius the field pass draws a blob at: shrinking with age, thinned by
 * how fast it was laid down, and thrown off round as it dies.
 */
export function radiusOf(
  blob: Blob,
  parameters: { blobSize: number; trailLife: number; breakup: number },
): number {
  const life = lifeOf(blob, parameters.trailLife, parameters.breakup);
  const age = Math.min(blob.age / Math.max(life, 1e-4), 1);
  const uneven = 1 + blob.jitter * 2 * parameters.breakup * age * age;

  return parameters.blobSize * Math.sqrt(Math.max(1 - age, 0)) * blob.swell * Math.max(uneven, 0);
}

/**
 * Advances the trail by one frame: the lead chases, the path is stamped, and
 * everything already stamped gets older.
 */
export function advanceInkTrail(
  previous: SimulationState,
  context: AdvanceContext,
): SimulationState {
  const state = asState(previous);
  const step = Math.min(Math.max(context.dt, 0), MAX_STEP);
  const aspect = context.width / Math.max(context.height, 1);

  const blobSize = numberAt(context.parameters, 'blobSize', 0.14);
  const trailLife = numberAt(context.parameters, 'trailLife', 1.5);
  const follow = numberAt(context.parameters, 'follow', 0.22);
  const fatten = numberAt(context.parameters, 'fatten', 0.45);
  const breakup = numberAt(context.parameters, 'breakup', 0.55);
  const drift = numberAt(context.parameters, 'drift', 0.4);

  // Everything already down gets older, and what has outlived its own life
  // goes. Ageing before stamping means a blob laid this frame is new.
  let blobs = state.blobs
    .map((blob) => ({ ...blob, age: blob.age + step }))
    .filter((blob) => blob.age < lifeOf(blob, trailLife, breakup));

  const hand = context.pointer.present
    ? { x: context.pointer.x * aspect, y: context.pointer.y }
    : undefined;
  const target = hand ?? (drift > 0 ? driftTarget(context.elapsed, aspect) : undefined);

  let { lead, lastEmit, leadSpeed, seed, started } = state;

  if (!started) {
    // The first frame places the lead rather than sweeping it across the
    // object from wherever the last object left it.
    const start = target ?? { x: 0.5 * aspect, y: 0.5 };
    lead = start;
    lastEmit = start;
    started = true;
  }

  // What the field reads is the radius each blob has *now*, so it is resolved
  // here rather than left for the shader to recompute per pixel — and on every
  // path, or ink left alone would hold its size and then vanish outright.
  const resolve = (laid: readonly Blob[]) =>
    laid
      .map((blob) => ({ ...blob, radius: radiusOf(blob, { blobSize, trailLife, breakup }) }))
      .filter((blob) => blob.radius > MIN_RADIUS);

  if (!target) {
    return { ...state, blobs: resolve(blobs), lead, lastEmit, leadSpeed, started, seed };
  }

  // The lead chases at a rate stated per second, so Follow means the same
  // thing at any frame rate.
  const chase = 1 - Math.pow(1 - Math.min(follow, 0.99), step * 60);
  const from = lead;
  const drifting = hand === undefined ? drift : 1;
  lead = {
    x: from.x + (target.x - from.x) * chase * drifting,
    y: from.y + (target.y - from.y) * chase * drifting,
  };

  const moved = Math.hypot(lead.x - from.x, lead.y - from.y);
  leadSpeed += (moved / Math.max(step, 1e-4) - leadSpeed) * SPEED_SMOOTHING;
  // A stroke laid down quickly is a thinner stroke.
  const swell = 1 / (1 + leadSpeed * fatten * 1.6);

  // Stamped by distance travelled rather than per frame: the trail then has
  // the same density whether it was drawn in one sweep or in twenty.
  let gap = Math.hypot(lead.x - lastEmit.x, lead.y - lastEmit.y);
  let guard = 0;

  while (gap >= SPACING && guard < MAX_BLOBS) {
    guard += 1;
    const t = SPACING / gap;
    lastEmit = {
      x: lastEmit.x + (lead.x - lastEmit.x) * t,
      y: lastEmit.y + (lead.y - lastEmit.y) * t,
    };

    const jitterDraw = nextRandom(seed);
    const lifeDraw = nextRandom(jitterDraw.seed);
    seed = lifeDraw.seed;

    blobs = [
      ...blobs,
      {
        position: lastEmit,
        radius: blobSize,
        age: 0,
        swell,
        jitter: jitterDraw.value - 0.5,
        lifeMul: 0.55 + lifeDraw.value * 0.8,
      },
    ];

    gap = Math.hypot(lead.x - lastEmit.x, lead.y - lastEmit.y);
  }

  // The program reads a fixed-size array, so the oldest stamps go first.
  if (blobs.length > MAX_BLOBS) blobs = blobs.slice(blobs.length - MAX_BLOBS);

  return { blobs: resolve(blobs), lead, lastEmit, leadSpeed, started, seed };
}
