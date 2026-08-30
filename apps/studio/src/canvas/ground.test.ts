import { describe, expect, it } from 'vitest';
import { ZOOM_LIMITS, type ViewportState } from '../store/slices';
import { groundScreenSpacing, groundSpacing, groundStyle } from './ground';

/** Every magnification the canvas allows, sampled finely. */
const zooms = Array.from({ length: 200 }, (_, step) => {
  const t = step / 199;
  // Geometric, since zoom is used geometrically.
  return ZOOM_LIMITS.min * Math.pow(ZOOM_LIMITS.max / ZOOM_LIMITS.min, t);
});

const view = (over: Partial<ViewportState> = {}): ViewportState => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  ...over,
});

describe('the ground stays legible at every magnification', () => {
  it('never collapses into a solid field', () => {
    for (const zoom of zooms) {
      expect(groundScreenSpacing(zoom), `at zoom ${String(zoom)}`).toBeGreaterThanOrEqual(16);
    }
  });

  it('never spreads until it vanishes', () => {
    for (const zoom of zooms) {
      expect(groundScreenSpacing(zoom), `at zoom ${String(zoom)}`).toBeLessThanOrEqual(48);
    }
  });

  it('steps by whole factors, so the ground never appears to drift', () => {
    // Every spacing is a power-of-two multiple of the one below it, which is
    // what makes a step look like the ground thinning rather than moving.
    const spacings = [...new Set(zooms.map(groundSpacing))].sort((a, b) => a - b);

    expect(spacings.length).toBeGreaterThan(1);
    for (let index = 1; index < spacings.length; index += 1) {
      const ratio = (spacings[index] ?? 0) / (spacings[index - 1] ?? 1);
      expect(Math.log2(ratio) % 1).toBeCloseTo(0, 10);
    }
  });

  it('coarsens as the view pulls back and refines as it closes in', () => {
    expect(groundSpacing(ZOOM_LIMITS.min)).toBeGreaterThan(groundSpacing(ZOOM_LIMITS.max));
  });

  it('survives a nonsensical magnification rather than dividing by it', () => {
    expect(Number.isFinite(groundSpacing(0))).toBe(true);
    expect(Number.isFinite(groundSpacing(Number.NaN))).toBe(true);
    expect(Number.isFinite(groundSpacing(-2))).toBe(true);
  });
});

describe('the ground follows the view', () => {
  it('moves with a pan, so crossing emptiness is visible', () => {
    const still = groundStyle(view());
    const panned = groundStyle(view({ panX: 7 }));

    expect(panned.backgroundPosition).not.toBe(still.backgroundPosition);
  });

  it('moves by exactly the pan, within one cell', () => {
    const spacing = groundScreenSpacing(1);
    const panned = groundStyle(view({ panX: 5, panY: 9 }));

    expect(panned.backgroundPosition).toBe(`5px 9px`);
    // A pan of one whole cell returns the ground to where it started, which is
    // what makes the lattice look anchored to the work rather than sliding.
    expect(groundStyle(view({ panX: spacing, panY: 0 })).backgroundPosition).toBe('0px 0px');
  });

  it('keeps its offset small however far the view has travelled', () => {
    const far = groundStyle(view({ panX: -987_654.5, panY: 1_234_567.25 }));
    const [x, y] = String(far.backgroundPosition).split(' ').map(Number.parseFloat);
    const spacing = groundScreenSpacing(1);

    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(spacing);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(spacing);
  });

  it('scales with the magnification', () => {
    const near = groundStyle(view({ zoom: 4 }));
    const far = groundStyle(view({ zoom: 0.25 }));

    expect(near.backgroundSize).toBeDefined();
    expect(far.backgroundSize).toBeDefined();
    expect(near.backgroundSize).not.toBe('');
  });
});
