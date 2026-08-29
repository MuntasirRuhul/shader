import { createRectangle, resetObjectIds, unionBounds } from '@shader/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZOOM_LIMITS, type ViewportState } from '../store/slices';
import {
  anchorFor,
  cursorForHandle,
  handlePoint,
  normaliseRotation,
  resizeFromHandle,
  rotationFromPointer,
  snapRotation,
} from './transformHandles';
import {
  canvasRectToScreen,
  canvasToScreen,
  fitToBounds,
  screenToCanvas,
  zoomAbout,
  zoomPercent,
  zoomStep,
} from './viewport';

const identity: ViewportState = { zoom: 1, panX: 0, panY: 0 };

beforeEach(() => {
  resetObjectIds();
});

describe('screen and canvas coordinates', () => {
  it('are the same under the identity view', () => {
    expect(screenToCanvas({ x: 100, y: 50 }, identity)).toEqual({ x: 100, y: 50 });
  });

  it('account for pan', () => {
    const panned: ViewportState = { zoom: 1, panX: 40, panY: 10 };

    expect(screenToCanvas({ x: 100, y: 50 }, panned)).toEqual({ x: 60, y: 40 });
  });

  it('account for zoom', () => {
    const zoomed: ViewportState = { zoom: 2, panX: 0, panY: 0 };

    expect(screenToCanvas({ x: 100, y: 50 }, zoomed)).toEqual({ x: 50, y: 25 });
  });

  it('round-trip through both directions', () => {
    const viewport: ViewportState = { zoom: 1.75, panX: -30, panY: 22 };
    const canvasPoint = { x: 123, y: 456 };

    const roundTripped = screenToCanvas(canvasToScreen(canvasPoint, viewport), viewport);

    expect(roundTripped.x).toBeCloseTo(canvasPoint.x, 6);
    expect(roundTripped.y).toBeCloseTo(canvasPoint.y, 6);
  });

  it('scale a rectangle into screen space', () => {
    const viewport: ViewportState = { zoom: 2, panX: 10, panY: 20 };

    expect(canvasRectToScreen({ x: 5, y: 5, width: 50, height: 25 }, viewport)).toEqual({
      x: 20,
      y: 30,
      width: 100,
      height: 50,
    });
  });
});

describe('zooming about the pointer', () => {
  it('keeps the canvas point under the pointer fixed', () => {
    const pointer = { x: 400, y: 300 };
    const before = screenToCanvas(pointer, identity);

    const zoomed = zoomAbout(identity, pointer, 2.5);
    const after = screenToCanvas(pointer, zoomed);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('holds the anchor when zooming out too', () => {
    const start: ViewportState = { zoom: 3, panX: -200, panY: -100 };
    const pointer = { x: 250, y: 180 };
    const before = screenToCanvas(pointer, start);

    const after = screenToCanvas(pointer, zoomAbout(start, pointer, 0.8));

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps at the maximum', () => {
    expect(zoomAbout(identity, { x: 0, y: 0 }, 1000).zoom).toBe(ZOOM_LIMITS.max);
  });

  it('clamps at the minimum', () => {
    expect(zoomAbout(identity, { x: 0, y: 0 }, 0.0001).zoom).toBe(ZOOM_LIMITS.min);
  });

  it('leaves the view untouched when the zoom does not change', () => {
    expect(zoomAbout(identity, { x: 10, y: 10 }, 1)).toBe(identity);
  });

  it('steps proportionally, so a notch feels the same at any magnification', () => {
    const fromOne = zoomStep(1, -100) / 1;
    const fromFour = zoomStep(4, -100) / 4;

    expect(fromOne).toBeCloseTo(fromFour, 6);
  });

  it('reports the level as a percentage', () => {
    expect(zoomPercent(1)).toBe(100);
    expect(zoomPercent(0.755)).toBe(76);
  });
});

describe('panning leaves the document alone', () => {
  it('changes only the view', () => {
    const object = createRectangle({ x: 100, y: 100, width: 50, height: 50 });
    const panned: ViewportState = { zoom: 1, panX: 500, panY: 500 };

    // The object's own coordinates are untouched; only where it appears moves.
    expect(object.x).toBe(100);
    expect(canvasToScreen({ x: object.x, y: object.y }, panned)).toEqual({ x: 600, y: 600 });
  });
});

describe('zoom to fit', () => {
  const view = { viewWidth: 800, viewHeight: 600, padding: 0 };

  it('brings a region fully into view', () => {
    const fitted = fitToBounds({ x: 0, y: 0, width: 1600, height: 600 }, view);

    expect(fitted.zoom).toBeCloseTo(0.5, 6);
  });

  it('centres the region', () => {
    const bounds = { x: 100, y: 100, width: 200, height: 200 };
    const fitted = fitToBounds(bounds, view);

    const centre = canvasToScreen({ x: 200, y: 200 }, fitted);
    expect(centre.x).toBeCloseTo(400, 6);
    expect(centre.y).toBeCloseTo(300, 6);
  });

  it('fits the union of several objects', () => {
    const bounds = unionBounds([
      createRectangle({ x: 0, y: 0, width: 100, height: 100 }),
      createRectangle({ x: 1500, y: 400, width: 100, height: 100 }),
    ]);

    // The union spans 1600 across an 800-wide view, so it must scale down.
    expect(fitToBounds(bounds, view).zoom).toBeCloseTo(0.5, 6);
  });

  it('resets the view for an empty canvas', () => {
    expect(fitToBounds(undefined, view)).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it('resets rather than dividing by zero for a collapsed region', () => {
    expect(fitToBounds({ x: 0, y: 0, width: 0, height: 0 }, view)).toEqual({
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  });

  it('respects the zoom limits', () => {
    const tiny = fitToBounds({ x: 0, y: 0, width: 1, height: 1 }, view);

    expect(tiny.zoom).toBeLessThanOrEqual(ZOOM_LIMITS.max);
  });
});

describe('resize handles', () => {
  const bounds = { x: 100, y: 100, width: 200, height: 100 };

  it('places each handle at its corner', () => {
    expect(handlePoint(bounds, 'top-left')).toEqual({ x: 100, y: 100 });
    expect(handlePoint(bounds, 'bottom-right')).toEqual({ x: 300, y: 200 });
    expect(handlePoint(bounds, 'top-right')).toEqual({ x: 300, y: 100 });
    expect(handlePoint(bounds, 'bottom-left')).toEqual({ x: 100, y: 200 });
  });

  it('anchors at the opposite corner', () => {
    expect(anchorFor(bounds, 'top-left')).toEqual({ x: 300, y: 200 });
    expect(anchorFor(bounds, 'bottom-right')).toEqual({ x: 100, y: 100 });
  });

  it('leaves the anchor fixed while dragging', () => {
    const resized = resizeFromHandle(bounds, 'bottom-right', { x: 500, y: 400 });

    expect(resized).toEqual({ x: 100, y: 100, width: 400, height: 300 });
  });

  it('follows the pointer past the anchor, flipping the rectangle', () => {
    const resized = resizeFromHandle(bounds, 'bottom-right', { x: 40, y: 30 });

    // The anchor was the top-left corner, so the box now extends up and left.
    expect(resized).toEqual({ x: 40, y: 30, width: 60, height: 70 });
  });

  it('preserves the aspect ratio when constrained', () => {
    const resized = resizeFromHandle(
      bounds,
      'bottom-right',
      { x: 500, y: 150 },
      { constrain: true },
    );

    expect(resized.width / resized.height).toBeCloseTo(bounds.width / bounds.height, 6);
  });

  it('sizes a constrained drag by the axis that moved further', () => {
    const resized = resizeFromHandle(
      bounds,
      'bottom-right',
      { x: 500, y: 120 },
      { constrain: true },
    );

    expect(resized.width).toBeCloseTo(400, 6);
  });

  it('never collapses below the minimum size', () => {
    const resized = resizeFromHandle(bounds, 'bottom-right', { x: 100, y: 100 }, { minSize: 4 });

    expect(resized.width).toBe(4);
    expect(resized.height).toBe(4);
  });
});

describe('rotation', () => {
  const object = { x: 100, y: 100, width: 100, height: 100 };

  it('reads no rotation when the pointer is straight above the centre', () => {
    expect(rotationFromPointer(object, { x: 150, y: 0 })).toBeCloseTo(0, 6);
  });

  it('reads a quarter turn when the pointer is to the right', () => {
    expect(rotationFromPointer(object, { x: 300, y: 150 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it('rotates about the centre, so distance does not matter', () => {
    const near = rotationFromPointer(object, { x: 160, y: 140 });
    const far = rotationFromPointer(object, { x: 250, y: 50 });

    expect(near).toBeCloseTo(far, 6);
  });

  it('snaps to an increment', () => {
    const snapped = snapRotation((20 * Math.PI) / 180);

    expect((snapped * 180) / Math.PI).toBeCloseTo(15, 6);
  });

  it('normalises into a single turn', () => {
    expect(normaliseRotation(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 6);
    expect(normaliseRotation(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
  });
});

describe('cursor feedback', () => {
  it('offers a resize cursor matching the handle diagonal', () => {
    expect(cursorForHandle('top-left')).toBe('nwse-resize');
    expect(cursorForHandle('bottom-right')).toBe('nwse-resize');
    expect(cursorForHandle('top-right')).toBe('nesw-resize');
    expect(cursorForHandle('bottom-left')).toBe('nesw-resize');
  });

  it('offers a grab cursor for rotation', () => {
    expect(cursorForHandle('rotate')).toBe('grab');
  });
});
