import { describe, expect, it } from 'vitest';
import type { RenderTransform } from '../renderingPort';
import { applyModelMatrix, buildModelMatrix } from './transform';

const CANVAS = { width: 800, height: 600 };

function corners(transform: RenderTransform) {
  const matrix = buildModelMatrix(transform, CANVAS.width, CANVAS.height);
  return {
    topLeft: applyModelMatrix(matrix, 0, 0),
    topRight: applyModelMatrix(matrix, 1, 0),
    bottomLeft: applyModelMatrix(matrix, 0, 1),
    bottomRight: applyModelMatrix(matrix, 1, 1),
    centre: applyModelMatrix(matrix, 0.5, 0.5),
  };
}

/** Clip space back to canvas pixels, for readable assertions. */
function toPixels(point: { x: number; y: number }) {
  return {
    x: ((point.x + 1) / 2) * CANVAS.width,
    y: ((1 - point.y) / 2) * CANVAS.height,
  };
}

const closeTo = (value: number) => expect.closeTo(value, 4) as unknown as number;

describe('an unrotated object maps to its rectangle', () => {
  const transform: RenderTransform = { x: 100, y: 50, width: 200, height: 120, rotation: 0 };

  it('places the top-left corner at the object origin', () => {
    expect(toPixels(corners(transform).topLeft)).toEqual({
      x: closeTo(100),
      y: closeTo(50),
    });
  });

  it('places the bottom-right corner at the far edge', () => {
    expect(toPixels(corners(transform).bottomRight)).toEqual({
      x: closeTo(300),
      y: closeTo(170),
    });
  });

  it('places uv (0.5, 0.5) at the object centre', () => {
    expect(toPixels(corners(transform).centre)).toEqual({
      x: closeTo(200),
      y: closeTo(110),
    });
  });

  it('keeps u increasing to the right and v increasing downward', () => {
    const { topLeft, topRight, bottomLeft } = corners(transform);

    expect(toPixels(topRight).x).toBeGreaterThan(toPixels(topLeft).x);
    expect(toPixels(bottomLeft).y).toBeGreaterThan(toPixels(topLeft).y);
  });
});

describe('translation moves the object without distorting it', () => {
  it('shifts every corner by the same offset', () => {
    const before = corners({ x: 0, y: 0, width: 100, height: 100, rotation: 0 });
    const after = corners({ x: 60, y: 25, width: 100, height: 100, rotation: 0 });

    expect(toPixels(after.topLeft).x - toPixels(before.topLeft).x).toBeCloseTo(60, 4);
    expect(toPixels(after.bottomRight).y - toPixels(before.bottomRight).y).toBeCloseTo(25, 4);
  });

  it('leaves the object size unchanged', () => {
    const moved = corners({ x: 300, y: 200, width: 150, height: 80, rotation: 0 });

    expect(toPixels(moved.topRight).x - toPixels(moved.topLeft).x).toBeCloseTo(150, 4);
    expect(toPixels(moved.bottomLeft).y - toPixels(moved.topLeft).y).toBeCloseTo(80, 4);
  });
});

describe('scale changes the object size about its origin', () => {
  it('doubles the width when the width doubles', () => {
    const single = corners({ x: 10, y: 10, width: 100, height: 50, rotation: 0 });
    const doubled = corners({ x: 10, y: 10, width: 200, height: 50, rotation: 0 });

    const singleWidth = toPixels(single.topRight).x - toPixels(single.topLeft).x;
    const doubledWidth = toPixels(doubled.topRight).x - toPixels(doubled.topLeft).x;

    expect(doubledWidth).toBeCloseTo(singleWidth * 2, 4);
  });

  it('leaves uv (0,0) at the origin regardless of size', () => {
    const small = toPixels(corners({ x: 40, y: 30, width: 10, height: 10, rotation: 0 }).topLeft);
    const large = toPixels(corners({ x: 40, y: 30, width: 400, height: 300, rotation: 0 }).topLeft);

    expect(small.x).toBeCloseTo(large.x, 4);
    expect(small.y).toBeCloseTo(large.y, 4);
  });
});

describe('rotation turns the object about its centre', () => {
  const square: RenderTransform = { x: 100, y: 100, width: 100, height: 100, rotation: 0 };

  it('leaves the centre fixed', () => {
    const upright = toPixels(corners(square).centre);
    const turned = toPixels(corners({ ...square, rotation: Math.PI / 3 }).centre);

    expect(turned.x).toBeCloseTo(upright.x, 4);
    expect(turned.y).toBeCloseTo(upright.y, 4);
  });

  // Canvas y points down, so a positive angle turns clockwise on screen.
  it('turns clockwise: a quarter turn carries the top-left corner to the top-right', () => {
    const upright = corners(square);
    const turned = corners({ ...square, rotation: Math.PI / 2 });

    expect(toPixels(turned.topLeft).x).toBeCloseTo(toPixels(upright.topRight).x, 3);
    expect(toPixels(turned.topLeft).y).toBeCloseTo(toPixels(upright.topRight).y, 3);
  });

  it('carries each corner to the next one clockwise', () => {
    const upright = corners(square);
    const turned = corners({ ...square, rotation: Math.PI / 2 });

    expect(toPixels(turned.topRight).x).toBeCloseTo(toPixels(upright.bottomRight).x, 3);
    expect(toPixels(turned.bottomRight).x).toBeCloseTo(toPixels(upright.bottomLeft).x, 3);
  });

  it('returns to the original placement after a half turn twice', () => {
    const upright = toPixels(corners(square).topLeft);
    const fullTurn = toPixels(corners({ ...square, rotation: Math.PI * 2 }).topLeft);

    expect(fullTurn.x).toBeCloseTo(upright.x, 3);
    expect(fullTurn.y).toBeCloseTo(upright.y, 3);
  });

  it('preserves the edge length', () => {
    const turned = corners({ ...square, rotation: 0.7 });
    const topEdge = Math.hypot(
      toPixels(turned.topRight).x - toPixels(turned.topLeft).x,
      toPixels(turned.topRight).y - toPixels(turned.topLeft).y,
    );

    expect(topEdge).toBeCloseTo(100, 3);
  });
});

describe('degenerate inputs do not produce NaN', () => {
  it('handles a zero-sized canvas', () => {
    const matrix = buildModelMatrix({ x: 0, y: 0, width: 10, height: 10, rotation: 0 }, 0, 0);

    expect([...matrix].every(Number.isFinite)).toBe(true);
  });

  it('handles a zero-sized object', () => {
    const matrix = buildModelMatrix({ x: 5, y: 5, width: 0, height: 0, rotation: 0.4 }, 800, 600);

    expect([...matrix].every(Number.isFinite)).toBe(true);
  });
});
