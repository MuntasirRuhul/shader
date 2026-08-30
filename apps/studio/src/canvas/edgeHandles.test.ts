import { describe, expect, it } from 'vitest';
import {
  anchorFor,
  EDGE_HANDLES,
  HANDLE_POSITIONS,
  handlePoint,
  isEdgeHandle,
  resizeFromHandle,
} from './transformHandles';

/**
 * Taking hold of an edge rather than a corner.
 *
 * With corners alone, every change of width is also a change of height —
 * which is the thing that makes resizing feel like a fight rather than an
 * adjustment.
 */

const box = { x: 100, y: 100, width: 200, height: 100 };

describe('there is a grip on every side and corner', () => {
  it('offers eight', () => {
    expect(HANDLE_POSITIONS).toHaveLength(8);
  });

  it('puts each one where its name says', () => {
    expect(handlePoint(box, 'top-left')).toEqual({ x: 100, y: 100 });
    expect(handlePoint(box, 'top')).toEqual({ x: 200, y: 100 });
    expect(handlePoint(box, 'right')).toEqual({ x: 300, y: 150 });
    expect(handlePoint(box, 'bottom')).toEqual({ x: 200, y: 200 });
    expect(handlePoint(box, 'left')).toEqual({ x: 100, y: 150 });
  });

  it('anchors each one against its opposite', () => {
    for (const handle of HANDLE_POSITIONS) {
      expect(anchorFor(box, handle)).toBeDefined();
    }
    expect(anchorFor(box, 'right')).toEqual(handlePoint(box, 'left'));
    expect(anchorFor(box, 'top')).toEqual(handlePoint(box, 'bottom'));
  });

  it('knows which are edges', () => {
    for (const handle of EDGE_HANDLES) expect(isEdgeHandle(handle)).toBe(true);
    expect(isEdgeHandle('top-left')).toBe(false);
  });
});

describe('an edge changes one dimension and leaves the other', () => {
  it('widens without changing the height', () => {
    const resized = resizeFromHandle(box, 'right', { x: 400, y: 999 });

    expect(resized).toMatchObject({ x: 100, y: 100, width: 300, height: 100 });
  });

  it('narrows from the left, keeping the right edge still', () => {
    const resized = resizeFromHandle(box, 'left', { x: 200, y: 0 });

    expect(resized).toMatchObject({ x: 200, y: 100, width: 100, height: 100 });
  });

  it('heightens without changing the width', () => {
    const resized = resizeFromHandle(box, 'bottom', { x: 999, y: 300 });

    expect(resized).toMatchObject({ x: 100, y: 100, width: 200, height: 200 });
  });

  it('lets an edge be dragged past its opposite', () => {
    // Flipping through is ordinary; refusing it strands the drag.
    const resized = resizeFromHandle(box, 'right', { x: 40, y: 150 });

    expect(resized.width).toBe(60);
    expect(resized.x).toBe(40);
  });

  it('never collapses below the minimum', () => {
    const resized = resizeFromHandle(box, 'right', { x: 100, y: 150 }, { minSize: 4 });

    expect(resized.width).toBe(4);
  });
});

describe('a corner still changes both', () => {
  it('moves both dimensions at once', () => {
    const resized = resizeFromHandle(box, 'bottom-right', { x: 400, y: 400 });

    expect(resized).toMatchObject({ width: 300, height: 300 });
  });

  it('keeps the proportions when asked', () => {
    const resized = resizeFromHandle(box, 'bottom-right', { x: 500, y: 400 }, { constrain: true });

    expect(resized.width / resized.height).toBeCloseTo(box.width / box.height, 5);
  });
});
