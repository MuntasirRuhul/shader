import type { AdvanceContext, ParameterValues, SimulationState } from '@shader/core';

/**
 * The metaball's motion, ported from the `metaball-shader-control` experiment.
 *
 * In the source this lived in the host page's frame loop, which is why the
 * first port stood still: there was nowhere in the manifest contract to put
 * it. It is a plain function of its arguments — no canvas, no document, no
 * clock of its own — so it can be run and asserted in a test.
 *
 * Balls follow a slowly-turning heading, attract each other under Magnet, flee
 * the pointer, lose speed to damping, and bounce off the object's edges. All
 * of it is integrated by real elapsed seconds, so the motion is the same
 * whatever frame rate the display runs at.
 */

/** What the shader's uniform arrays allocate for. */
export const MAX_BALLS = 24;

// Every constant below is the source experiment's, unchanged.
/** Acceleration along the wander heading, in object widths per second squared. */
const DRIFT_ACCEL = 0.03;
/** The fraction of a ball's velocity that survives one second. */
const DRIFT_DAMP_PER_SEC = 0.5;
/** Roughly forty seconds to cross the object — an ambient drift, not a dart. */
const MAX_SPEED = 0.025;
const REPEL_RADIUS = 0.22;
/** Acceleration at the pointer itself, tapering to nothing at the radius. */
const REPEL_ACCEL = 0.35;
const MAGNET_RADIUS = 0.5;
const MAGNET_ACCEL = 0.6;
/** Seconds a new ball takes to reach full weight. */
const SPAWN_EASE = 0.4;
/** How much of its speed a ball keeps when it meets an edge. */
const BOUNCE = 0.6;
/** A long frame is treated as a short one; a stalled tab must not teleport. */
const MAX_STEP = 0.05;

const DEFAULT_PALETTE = ['#ffffff'];

/**
 * One ball. The first four fields are what the program reads; the rest is the
 * simulation's own bookkeeping, which the state schema does not name and the
 * uniform binding therefore ignores.
 */
type Ball = {
  readonly position: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly color: string;
  /** Spawn easing, which the field weights each ball's contribution by. */
  readonly weight: number;
  readonly velocity: { readonly x: number; readonly y: number };
  /** Fixes this ball's wander so two balls never turn together. */
  readonly seed: number;
  /** Varies this ball's size around the shared Size, as the source does. */
  readonly jitter: number;
  readonly paletteIndex: number;
  /** When this ball appeared, in real seconds, for its easing in. */
  readonly spawnTime: number;
};

// Declared as type aliases rather than interfaces so they satisfy the
// state's index signature: a state value is whatever the schema can bind.
type MetaballState = SimulationState & {
  /** The drift clock, which runs at Speed rather than in real seconds. */
  readonly clock: number;
  readonly balls: readonly Ball[];
};

/** What the state holds before the first advance: no balls, no time. */
export const METABALL_INITIAL_STATE: MetaballState = { clock: 0, balls: [] };

function numberAt(values: ParameterValues, name: string, fallback: number): number {
  const value = values[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The colour pool, which the user edits as a repeatable group. */
function paletteOf(values: ParameterValues): readonly string[] {
  const entries = values['palette'];
  if (!Array.isArray(entries) || entries.length === 0) return DEFAULT_PALETTE;

  const colors = (entries as readonly ParameterValues[])
    .map((entry) => entry['color'])
    .filter((color): color is string => typeof color === 'string');

  return colors.length > 0 ? colors : DEFAULT_PALETTE;
}

/**
 * A slowly-turning heading rather than random-walk jitter, which reads as
 * drift instead of as noise.
 */
function wanderAngle(seed: number, clock: number): number {
  return (
    (Math.sin(clock * 0.15 + seed * 7.1) +
      Math.sin(clock * 0.083 + seed * 3.7) * 0.6 +
      Math.sin(clock * 0.211 + seed * 11.3) * 0.4) *
    Math.PI
  );
}

/**
 * The metaball's advance.
 *
 * `random` is a parameter so a test can make the simulation repeatable; the
 * shipped shader spawns balls where the source experiment does, at random.
 */
export function createMetaballAdvance(
  random: () => number = Math.random,
): (previous: SimulationState, context: AdvanceContext) => SimulationState {
  function spawn(index: number, elapsed: number): Ball {
    return {
      position: { x: 0.1 + random() * 0.8, y: 0.1 + random() * 0.8 },
      radius: 0,
      color: DEFAULT_PALETTE[0] ?? '#ffffff',
      weight: 0,
      velocity: { x: 0, y: 0 },
      seed: random() * 1000,
      jitter: 0.6 + random() * 0.8,
      paletteIndex: index,
      spawnTime: elapsed,
    };
  }

  return (previous, context) => {
    const state = previous as MetaballState;
    const parameters = context.parameters;

    const count = Math.max(
      1,
      Math.min(MAX_BALLS, Math.round(numberAt(parameters, 'ballCount', 10))),
    );
    const speed = numberAt(parameters, 'speed', 1);
    const size = numberAt(parameters, 'size', 0.06);
    const magnet = numberAt(parameters, 'magnet', 0);
    const palette = paletteOf(parameters);

    // The clock runs at Speed, so Speed changes the rate of the whole
    // simulation — the wander included — rather than only the velocities.
    const step = Math.min(context.dt, MAX_STEP) * speed;
    const clock = state.clock + step;

    // Count is the only source of truth for how many balls there are: added
    // ones ease in from where they spawn, removed ones simply go.
    const existing = state.balls.slice(0, count);
    const balls: Ball[] = [...existing];
    while (balls.length < count) balls.push(spawn(balls.length, context.elapsed));

    const aspect = context.width / Math.max(context.height, 1);
    const damp = Math.pow(DRIFT_DAMP_PER_SEC, step);

    const advanced = balls.map((ball, index) => {
      const angle = wanderAngle(ball.seed, clock);
      let vx = ball.velocity.x + Math.cos(angle) * DRIFT_ACCEL * step;
      let vy = ball.velocity.y + Math.sin(angle) * DRIFT_ACCEL * step;

      // Cursor repulsion: a push away that releases smoothly with distance,
      // and never a pull.
      if (context.pointer.present) {
        const dx = (ball.position.x - context.pointer.x) * aspect;
        const dy = ball.position.y - context.pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < REPEL_RADIUS && distance > 0.0001) {
          const accel = (1 - distance / REPEL_RADIUS) * REPEL_ACCEL;
          vx += (dx / distance / aspect) * accel * step;
          vy += (dy / distance) * accel * step;
        }
      }

      // Magnet: mutual attraction, pulling balls into overlap so their fields
      // blend — the opposite pull to the cursor's.
      if (magnet > 0) {
        for (let other = 0; other < balls.length; other += 1) {
          if (other === index) continue;
          const target = balls[other];
          if (!target) continue;
          const dx = (target.position.x - ball.position.x) * aspect;
          const dy = target.position.y - ball.position.y;
          const distance = Math.hypot(dx, dy);
          if (distance < MAGNET_RADIUS && distance > 0.0001) {
            const accel = (1 - distance / MAGNET_RADIUS) * MAGNET_ACCEL * magnet;
            vx += (dx / distance / aspect) * accel * step;
            vy += (dy / distance) * accel * step;
          }
        }
      }

      vx *= damp;
      vy *= damp;

      const moving = Math.hypot(vx, vy);
      if (moving > MAX_SPEED) {
        vx = (vx / moving) * MAX_SPEED;
        vy = (vy / moving) * MAX_SPEED;
      }

      let x = ball.position.x + vx * step;
      let y = ball.position.y + vy * step;

      // A ball meets the object's edge and turns back, losing energy to it.
      const radius = size * ball.jitter;
      if (x < radius && vx < 0) {
        vx = -vx * BOUNCE;
        x = radius;
      }
      if (x > 1 - radius && vx > 0) {
        vx = -vx * BOUNCE;
        x = 1 - radius;
      }
      if (y < radius && vy < 0) {
        vy = -vy * BOUNCE;
        y = radius;
      }
      if (y > 1 - radius && vy > 0) {
        vy = -vy * BOUNCE;
        y = 1 - radius;
      }

      return {
        ...ball,
        position: { x, y },
        velocity: { x: vx, y: vy },
        radius,
        color: palette[ball.paletteIndex % palette.length] ?? DEFAULT_PALETTE[0] ?? '#ffffff',
        // Eased on real time rather than the drift clock: a ball that is
        // standing still because Speed is zero should still be visible.
        weight: Math.min(1, (context.elapsed - ball.spawnTime) / SPAWN_EASE),
      };
    });

    return { clock, balls: advanced };
  };
}
