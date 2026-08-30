import { describe, expect, it } from 'vitest';
import type { RenderTransform, RenderViewport } from '../renderingPort';
import { applyModelMatrix, buildModelMatrix } from './transform';

const CANVAS = { width: 800, height: 600 };

function corners(transform: RenderTransform, viewport?: RenderViewport) {
  const matrix = buildModelMatrix(transform, CANVAS.width, CANVAS.height, viewport);
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

describe('the viewport places the object as it is being looked at', () => {
  const object: RenderTransform = { x: 100, y: 50, width: 200, height: 120, rotation: 0 };
  const at = (viewport: RenderViewport) => corners(object, viewport);

  it('draws it where it is stored when the view is identity', () => {
    // What every existing shader and every existing test relies on.
    const identity = toPixels(at({ zoom: 1, panX: 0, panY: 0 }).topLeft);

    expect(identity).toEqual({ x: closeTo(100), y: closeTo(50) });
  });

  it('translates it by the pan, and only by the pan', () => {
    const panned = at({ zoom: 1, panX: -230, panY: 75 });

    expect(toPixels(panned.topLeft)).toEqual({ x: closeTo(-130), y: closeTo(125) });
    expect(toPixels(panned.bottomRight)).toEqual({ x: closeTo(70), y: closeTo(245) });
  });

  it('magnifies it about the canvas origin', () => {
    const magnified = at({ zoom: 2, panX: 0, panY: 0 });

    expect(toPixels(magnified.topLeft)).toEqual({ x: closeTo(200), y: closeTo(100) });
    expect(toPixels(magnified.bottomRight)).toEqual({ x: closeTo(600), y: closeTo(340) });
  });

  it('magnifies then translates, in that order', () => {
    // A view is a magnification of the canvas, then a move of the result.
    const both = at({ zoom: 2, panX: -150, panY: 40 });

    expect(toPixels(both.topLeft)).toEqual({ x: closeTo(50), y: closeTo(140) });
    expect(toPixels(both.bottomRight)).toEqual({ x: closeTo(450), y: closeTo(380) });
  });

  it('draws it at the magnified size', () => {
    const magnified = at({ zoom: 3, panX: 17, panY: -4 });
    const width = toPixels(magnified.topRight).x - toPixels(magnified.topLeft).x;
    const height = toPixels(magnified.bottomLeft).y - toPixels(magnified.topLeft).y;

    expect(width).toBeCloseTo(600, 3);
    expect(height).toBeCloseTo(360, 3);
  });

  it('leaves an object exactly where it was when the view returns', () => {
    const before = toPixels(at({ zoom: 1, panX: 0, panY: 0 }).centre);
    at({ zoom: 4.5, panX: -900, panY: 320 });
    const after = toPixels(at({ zoom: 1, panX: 0, panY: 0 }).centre);

    expect(after).toEqual({ x: closeTo(before.x), y: closeTo(before.y) });
  });
});

describe('the view composes with the object own transform', () => {
  const view: RenderViewport = { zoom: 2.5, panX: -320, panY: 110 };

  /** Where the view puts a canvas point, independently of any matrix. */
  const seen = (x: number, y: number) => ({
    x: x * view.zoom + view.panX,
    y: y * view.zoom + view.panY,
  });

  it('places a moved and resized object where the view predicts', () => {
    const drawn = corners({ x: 240, y: 180, width: 90, height: 60, rotation: 0 }, view);

    expect(toPixels(drawn.topLeft)).toEqual({
      x: closeTo(seen(240, 180).x),
      y: closeTo(seen(240, 180).y),
    });
    expect(toPixels(drawn.bottomRight)).toEqual({
      x: closeTo(seen(330, 240).x),
      y: closeTo(seen(330, 240).y),
    });
  });

  it('turns a rotated object about the same centre the view puts it at', () => {
    const object: RenderTransform = { x: 240, y: 180, width: 90, height: 60, rotation: 0.9 };
    const drawn = toPixels(corners(object, view).centre);
    const predicted = seen(240 + 45, 180 + 30);

    expect(drawn).toEqual({ x: closeTo(predicted.x), y: closeTo(predicted.y) });
  });

  it('magnifies a rotated object without shearing it', () => {
    const object: RenderTransform = { x: 10, y: 10, width: 120, height: 40, rotation: 0.6 };
    const drawn = corners(object, view);

    const top = Math.hypot(
      toPixels(drawn.topRight).x - toPixels(drawn.topLeft).x,
      toPixels(drawn.topRight).y - toPixels(drawn.topLeft).y,
    );
    const side = Math.hypot(
      toPixels(drawn.bottomLeft).x - toPixels(drawn.topLeft).x,
      toPixels(drawn.bottomLeft).y - toPixels(drawn.topLeft).y,
    );

    // Magnified edges, and still a right angle between them.
    expect(top).toBeCloseTo(120 * view.zoom, 3);
    expect(side).toBeCloseTo(40 * view.zoom, 3);
  });

  it('keeps a rotation the view does not turn', () => {
    // Magnifying uniformly turns nothing, so the edge keeps its angle.
    const object: RenderTransform = { x: 0, y: 0, width: 100, height: 100, rotation: 0.4 };
    const angleOf = (viewport: RenderViewport) => {
      const drawn = corners(object, viewport);
      return Math.atan2(
        toPixels(drawn.topRight).y - toPixels(drawn.topLeft).y,
        toPixels(drawn.topRight).x - toPixels(drawn.topLeft).x,
      );
    };

    expect(angleOf(view)).toBeCloseTo(angleOf({ zoom: 1, panX: 0, panY: 0 }), 5);
  });
});

describe('an object far from the origin is placed as precisely as one near it', () => {
  /** How far the drawn corner is from where it should be, in canvas pixels. */
  function errorAt(x: number, viewport: RenderViewport): number {
    const drawn = toPixels(
      corners({ x, y: x, width: 100, height: 100, rotation: 0 }, viewport).topLeft,
    );
    return Math.hypot(
      drawn.x - (x * viewport.zoom + viewport.panX),
      drawn.y - (x * viewport.zoom + viewport.panY),
    );
  }

  it('places an object a million units out to within a fraction of a pixel', () => {
    // The view is centred on it, which is the only way to be looking at it.
    const far = 1_000_000;
    const zoom = 8;
    const error = errorAt(far, { zoom, panX: -far * zoom + 400, panY: -far * zoom + 300 });

    expect(error).toBeLessThan(0.01);
  });

  it('is no less accurate far out than at the origin', () => {
    const zoom = 8;
    const near = errorAt(0, { zoom, panX: 400, panY: 300 });
    const far = errorAt(1_000_000, {
      zoom,
      panX: -1_000_000 * zoom + 400,
      panY: -1_000_000 * zoom + 300,
    });

    // Both are far below a pixel; neither is meaningfully worse.
    expect(far).toBeLessThan(near + 0.01);
  });

  it('holds still while the view holds still', () => {
    const view = { zoom: 8, panX: -1_000_000 * 8 + 400, panY: -1_000_000 * 8 + 300 };
    const object = { x: 1_000_000, y: 1_000_000, width: 100, height: 100, rotation: 0 };

    const frames = Array.from({ length: 5 }, () => toPixels(corners(object, view).topLeft));

    for (const frame of frames) {
      expect(frame.x).toBe(frames[0]?.x);
      expect(frame.y).toBe(frames[0]?.y);
    }
  });

  it('moves smoothly when the view pans through a distant region', () => {
    const object = { x: 1_000_000, y: 1_000_000, width: 100, height: 100, rotation: 0 };
    const base = -1_000_000 * 8 + 400;

    // A pan of one pixel per frame must move the object by one pixel per frame.
    const positions = Array.from({ length: 12 }, (_, step) =>
      toPixels(corners(object, { zoom: 8, panX: base - step, panY: base }).topLeft),
    );

    for (let step = 1; step < positions.length; step += 1) {
      const moved = (positions[step]?.x ?? 0) - (positions[step - 1]?.x ?? 0);
      expect(moved).toBeCloseTo(-1, 2);
    }
  });
});
