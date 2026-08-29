import { describe, expect, it } from 'vitest';
import { computeSurfaceSize, matchesSurfaceSize, MAX_DEVICE_PIXEL_RATIO } from './surfaceSize';

describe('rendering at the device pixel ratio', () => {
  it('matches the CSS size on a standard-density display', () => {
    const size = computeSurfaceSize(800, 600, 1);

    expect(size).toEqual({ pixelWidth: 800, pixelHeight: 600, appliedRatio: 1 });
  });

  it('doubles the buffer on a 2x display', () => {
    const size = computeSurfaceSize(800, 600, 2);

    expect(size).toEqual({ pixelWidth: 1600, pixelHeight: 1200, appliedRatio: 2 });
  });

  it('applies a fractional ratio', () => {
    const size = computeSurfaceSize(800, 600, 1.5);

    expect(size).toEqual({ pixelWidth: 1200, pixelHeight: 900, appliedRatio: 1.5 });
  });
});

describe('the ratio is capped', () => {
  it('caps a 3x display at the maximum', () => {
    const size = computeSurfaceSize(800, 600, 3);

    expect(size.appliedRatio).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(size.pixelWidth).toBe(800 * MAX_DEVICE_PIXEL_RATIO);
  });

  it('caps an extreme ratio rather than scaling without bound', () => {
    const size = computeSurfaceSize(800, 600, 100);

    expect(size.appliedRatio).toBe(MAX_DEVICE_PIXEL_RATIO);
  });

  it('honours a caller-supplied maximum', () => {
    const size = computeSurfaceSize(800, 600, 3, { maxRatio: 1 });

    expect(size).toEqual({ pixelWidth: 800, pixelHeight: 600, appliedRatio: 1 });
  });

  it('leaves a ratio below the cap untouched', () => {
    expect(computeSurfaceSize(400, 400, 1.25).appliedRatio).toBe(1.25);
  });
});

describe('responding to size changes', () => {
  it('reports the new buffer size after a resize', () => {
    const before = computeSurfaceSize(800, 600, 2);
    const after = computeSurfaceSize(1000, 400, 2);

    expect(after).not.toEqual(before);
    expect(after).toEqual({ pixelWidth: 2000, pixelHeight: 800, appliedRatio: 2 });
  });

  it('detects when a canvas already has the right size', () => {
    const size = computeSurfaceSize(800, 600, 2);

    expect(matchesSurfaceSize({ width: 1600, height: 1200 }, size)).toBe(true);
  });

  it('detects when a canvas needs resizing', () => {
    const size = computeSurfaceSize(800, 600, 2);

    expect(matchesSurfaceSize({ width: 800, height: 600 }, size)).toBe(false);
  });
});

describe('degenerate sizes never produce an invalid buffer', () => {
  it('floors fractional dimensions to whole pixels', () => {
    const size = computeSurfaceSize(100.7, 50.2, 1);

    expect(size.pixelWidth).toBe(100);
    expect(size.pixelHeight).toBe(50);
  });

  it('never returns a zero dimension', () => {
    const size = computeSurfaceSize(0, 0, 2);

    expect(size.pixelWidth).toBe(1);
    expect(size.pixelHeight).toBe(1);
  });

  it('treats a negative size as zero', () => {
    expect(computeSurfaceSize(-100, -50, 1).pixelWidth).toBe(1);
  });

  it('falls back to a ratio of one when the ratio is not a usable number', () => {
    expect(computeSurfaceSize(800, 600, Number.NaN).appliedRatio).toBe(1);
    expect(computeSurfaceSize(800, 600, 0).appliedRatio).toBe(1);
    expect(computeSurfaceSize(800, 600, -2).appliedRatio).toBe(1);
  });

  it('handles a non-finite CSS size', () => {
    const size = computeSurfaceSize(Number.POSITIVE_INFINITY, 600, 1);

    expect(Number.isFinite(size.pixelWidth)).toBe(true);
  });
});
