import { POINTER_ABSENT, type AdvanceContext, type SimulationState } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { advanceInkTrail, INK_TRAIL_INITIAL_STATE, MAX_BLOBS } from './inkTrailSimulation';

/**
 * The ink trail: a lead point chasing the cursor, stamping the path it
 * actually travelled. All of it is a plain function of its arguments, so the
 * feel the prototype had — the lag, the density, the drying — is assertable
 * with no canvas at all.
 */

type Blob = { position: { x: number; y: number }; radius: number };

const parameters = {
  blobSize: 0.14,
  trailLife: 1.5,
  follow: 0.22,
  fatten: 0.45,
  breakup: 0.55,
  drift: 0,
};

function blobs(state: SimulationState): readonly Blob[] {
  return (state['blobs'] ?? []) as readonly Blob[];
}

function context(overrides: Partial<AdvanceContext> = {}): AdvanceContext {
  return {
    dt: 0.016,
    elapsed: 0,
    parameters,
    pointer: POINTER_ABSENT,
    // Square, so the field's aspect correction is the identity and positions
    // read as the fractions they are.
    width: 300,
    height: 300,
    ...overrides,
  };
}

function at(x: number, y: number) {
  return { present: true, x, y };
}

/** Runs a stroke across the object, a frame at a time. */
function stroke(frames: number, overrides: Partial<AdvanceContext> = {}): SimulationState {
  let state: SimulationState = INK_TRAIL_INITIAL_STATE;
  for (let frame = 0; frame < frames; frame += 1) {
    state = advanceInkTrail(state, {
      ...context(overrides),
      pointer: at(0.2 + frame * 0.02, 0.5),
    });
  }
  return state;
}

describe('drawing with the ink', () => {
  it('lays nothing down on the frame the pointer arrives', () => {
    // The lead starts where the hand is, rather than sweeping in from wherever
    // it was left — otherwise entering the object draws a stroke nobody made.
    const next = advanceInkTrail(INK_TRAIL_INITIAL_STATE, context({ pointer: at(0.7, 0.3) }));

    expect(blobs(next)).toEqual([]);
  });

  it('lays a trail down along the path', () => {
    expect(blobs(stroke(30)).length).toBeGreaterThan(3);
  });

  it('stamps by distance, so the density is the same however fast it was drawn', () => {
    // The same journey in five frames and in twenty.
    const quick = advanceInkTrail(
      advanceInkTrail(INK_TRAIL_INITIAL_STATE, context({ pointer: at(0.2, 0.5) })),
      context({ pointer: at(0.8, 0.5), dt: 0.05 }),
    );
    let slow: SimulationState = advanceInkTrail(
      INK_TRAIL_INITIAL_STATE,
      context({ pointer: at(0.2, 0.5) }),
    );
    for (let frame = 1; frame <= 10; frame += 1) {
      slow = advanceInkTrail(slow, context({ pointer: at(0.2 + frame * 0.06, 0.5) }));
    }

    // Both stamp along what the lead covered; neither stamps once per frame.
    const spacing = (state: SimulationState) => {
      const laid = blobs(state);
      const first = laid[0]?.position;
      const last = laid.at(-1)?.position;
      if (!first || !last || laid.length < 2) return 0;
      return Math.hypot(last.x - first.x, last.y - first.y) / (laid.length - 1);
    };

    expect(spacing(quick)).toBeCloseTo(spacing(slow), 2);
  });

  it('lags behind the hand rather than sitting under it', () => {
    const trailing = stroke(20);
    const last = blobs(trailing).at(-1);

    // Twenty frames at Follow 0.22 leaves the ink well short of the cursor.
    expect(last?.position.x).toBeLessThan(0.2 + 19 * 0.02);
  });

  it('keeps up more closely when Follow is turned up', () => {
    const loose = blobs(stroke(20)).at(-1)?.position.x ?? 0;
    const tight =
      blobs(stroke(20, { parameters: { ...parameters, follow: 0.9 } })).at(-1)?.position.x ?? 0;

    expect(tight).toBeGreaterThan(loose);
  });

  it('dries: what was drawn is gone once its life is up', () => {
    let state = stroke(20);
    expect(blobs(state).length).toBeGreaterThan(0);

    // Well past the trail life, with nothing drawing.
    for (let frame = 0; frame < 200; frame += 1) {
      state = advanceInkTrail(state, context());
    }

    expect(blobs(state)).toEqual([]);
  });

  it('shrinks each blob as it dries', () => {
    // The same blob, watched as it dries: the newest one, since nothing is
    // being drawn to add another.
    let state = stroke(20);
    const fresh = blobs(state).at(-1)?.radius ?? 0;

    for (let frame = 0; frame < 20; frame += 1) state = advanceInkTrail(state, context());
    const older = blobs(state).at(-1)?.radius ?? 0;

    expect(older).toBeLessThan(fresh);
    expect(older).toBeGreaterThan(0);
  });

  it('thins the ink out when it is drawn quickly', () => {
    const slowStroke = stroke(12, { parameters: { ...parameters, fatten: 0 } });
    const fastStroke = stroke(12, { parameters: { ...parameters, fatten: 1 } });

    const widest = (state: SimulationState) =>
      Math.max(...blobs(state).map((blob) => blob.radius), 0);

    expect(widest(fastStroke)).toBeLessThan(widest(slowStroke));
  });

  it('keeps only as many blobs as the program allocates for', () => {
    let state: SimulationState = INK_TRAIL_INITIAL_STATE;
    for (let frame = 0; frame < 400; frame += 1) {
      const angle = frame * 0.2;
      state = advanceInkTrail(state, {
        ...context({ parameters: { ...parameters, trailLife: 60, follow: 1 } }),
        pointer: at(0.5 + 0.4 * Math.cos(angle), 0.5 + 0.4 * Math.sin(angle)),
      });
    }

    expect(blobs(state).length).toBeLessThanOrEqual(MAX_BLOBS);
    expect(blobs(state).length).toBeGreaterThan(0);
  });

  it('draws the same trail twice, so what it looks like is reproducible', () => {
    const first = blobs(stroke(25)).map((blob) => blob.radius);
    const second = blobs(stroke(25)).map((blob) => blob.radius);

    expect(first).toEqual(second);
  });
});

describe('the ink drawing itself', () => {
  const drifting = { ...parameters, drift: 0.6 };

  it('keeps drawing when nobody is', () => {
    let state: SimulationState = INK_TRAIL_INITIAL_STATE;
    for (let frame = 0; frame < 60; frame += 1) {
      state = advanceInkTrail(
        state,
        context({ parameters: drifting, elapsed: frame * 0.016, dt: 0.016 }),
      );
    }

    expect(blobs(state).length).toBeGreaterThan(0);
  });

  it('stays on the object while it does', () => {
    let state: SimulationState = INK_TRAIL_INITIAL_STATE;
    for (let frame = 0; frame < 300; frame += 1) {
      state = advanceInkTrail(
        state,
        context({ parameters: drifting, elapsed: frame * 0.05, dt: 0.05 }),
      );
      for (const blob of blobs(state)) {
        expect(blob.position.x).toBeGreaterThan(0);
        expect(blob.position.x).toBeLessThan(1);
        expect(blob.position.y).toBeGreaterThan(0);
        expect(blob.position.y).toBeLessThan(1);
      }
    }
  });

  it('waits for a hand at zero, as the prototype did', () => {
    let state: SimulationState = INK_TRAIL_INITIAL_STATE;
    for (let frame = 0; frame < 60; frame += 1) {
      state = advanceInkTrail(state, context({ elapsed: frame * 0.016 }));
    }

    expect(blobs(state)).toEqual([]);
  });

  it('gives way to a hand the moment there is one', () => {
    let state: SimulationState = INK_TRAIL_INITIAL_STATE;
    for (let frame = 0; frame < 30; frame += 1) {
      state = advanceInkTrail(state, context({ parameters: drifting, elapsed: frame * 0.03 }));
    }

    for (let frame = 0; frame < 10; frame += 1) {
      state = advanceInkTrail(state, {
        ...context({ parameters: drifting, elapsed: 1 + frame * 0.03 }),
        pointer: at(0.85, 0.85),
      });
    }

    const last = blobs(state).at(-1)?.position;
    expect(last?.x).toBeGreaterThan(0.5);
    expect(last?.y).toBeGreaterThan(0.5);
  });
});
