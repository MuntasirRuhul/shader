import { applyModelMatrix, buildModelMatrix, type RenderTransform } from '@shader/core';
import { describe, expect, it } from 'vitest';
import type { ViewportState } from '../store/slices';
import { canvasRectToScreen, canvasToScreen } from './viewport';

/**
 * The canvas draws in two systems: shaders through WebGL, everything else
 * through the DOM. They agree only because they are given the same view.
 *
 * They did not agree. The overlays were positioned through the viewport and
 * the shader layer was not, so the artwork separated from the box that claims
 * to contain it by exactly the pan and exactly the zoom — invisible at the
 * identity view, which is why it went unnoticed. These cases fail loudly if
 * the two ever diverge again.
 */

const SURFACE = { width: 1200, height: 800 };

/** Where the renderer draws a point of an object, in screen pixels. */
function drawn(transform: RenderTransform, viewport: ViewportState, u: number, v: number) {
  const matrix = buildModelMatrix(transform, SURFACE.width, SURFACE.height, viewport);
  const clip = applyModelMatrix(matrix, u, v);

  return {
    x: ((clip.x + 1) / 2) * SURFACE.width,
    y: ((1 - clip.y) / 2) * SURFACE.height,
  };
}

/** Where the overlay puts that object's box, in the same screen pixels. */
function overlaid(transform: RenderTransform, viewport: ViewportState) {
  return canvasRectToScreen(
    {
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
    },
    viewport,
  );
}

const object: RenderTransform = { x: 320, y: 140, width: 260, height: 180, rotation: 0 };

const views: { name: string; viewport: ViewportState }[] = [
  { name: 'the identity view', viewport: { zoom: 1, panX: 0, panY: 0 } },
  { name: 'a panned view', viewport: { zoom: 1, panX: -420, panY: 190 } },
  { name: 'a magnified view', viewport: { zoom: 2.4, panX: 0, panY: 0 } },
  { name: 'a reduced view', viewport: { zoom: 0.35, panX: 0, panY: 0 } },
  { name: 'a panned and magnified view', viewport: { zoom: 3.1, panX: -880, panY: -260 } },
  { name: 'a view far from the origin', viewport: { zoom: 6, panX: -9_400, panY: -3_100 } },
];

describe('what is drawn and what is overlaid occupy the same region', () => {
  it.each(views)('agree at $name', ({ viewport }) => {
    const box = overlaid(object, viewport);
    const topLeft = drawn(object, viewport, 0, 0);
    const bottomRight = drawn(object, viewport, 1, 1);

    expect(topLeft.x).toBeCloseTo(box.x, 3);
    expect(topLeft.y).toBeCloseTo(box.y, 3);
    expect(bottomRight.x).toBeCloseTo(box.x + box.width, 3);
    expect(bottomRight.y).toBeCloseTo(box.y + box.height, 3);
  });

  it.each(views)('agree on the object centre at $name', ({ viewport }) => {
    const centre = canvasToScreen(
      { x: object.x + object.width / 2, y: object.y + object.height / 2 },
      viewport,
    );
    const middle = drawn(object, viewport, 0.5, 0.5);

    expect(middle.x).toBeCloseTo(centre.x, 3);
    expect(middle.y).toBeCloseTo(centre.y, 3);
  });

  it.each(views)('agree for a rotated object at $name', ({ viewport }) => {
    // The overlay draws an axis-aligned box turned about the object's centre,
    // so the centres must coincide and the drawn corners must sit on it.
    const turned = { ...object, rotation: 0.7 };
    const centre = canvasToScreen(
      { x: turned.x + turned.width / 2, y: turned.y + turned.height / 2 },
      viewport,
    );
    const middle = drawn(turned, viewport, 0.5, 0.5);

    expect(middle.x).toBeCloseTo(centre.x, 3);
    expect(middle.y).toBeCloseTo(centre.y, 3);
  });

  it.each(views)('draw the object at the size the overlay boxes at $name', ({ viewport }) => {
    const box = overlaid(object, viewport);
    const topLeft = drawn(object, viewport, 0, 0);
    const topRight = drawn(object, viewport, 1, 0);
    const bottomLeft = drawn(object, viewport, 0, 1);

    expect(topRight.x - topLeft.x).toBeCloseTo(box.width, 3);
    expect(bottomLeft.y - topLeft.y).toBeCloseTo(box.height, 3);
  });
});

describe('a text object and its editor', () => {
  // The editor is an HTML element positioned by the same viewport, over the
  // masked shader that draws the glyphs. If they disagree, typing lands
  // somewhere other than where the text appears.
  const text: RenderTransform = { x: 80, y: 460, width: 340, height: 72, rotation: 0 };

  it.each(views)('put the text in the same place at $name', ({ viewport }) => {
    const editor = canvasRectToScreen(
      { x: text.x, y: text.y, width: text.width, height: text.height },
      viewport,
    );
    const topLeft = drawn(text, viewport, 0, 0);
    const bottomRight = drawn(text, viewport, 1, 1);

    expect(topLeft.x).toBeCloseTo(editor.x, 3);
    expect(topLeft.y).toBeCloseTo(editor.y, 3);
    expect(bottomRight.x).toBeCloseTo(editor.x + editor.width, 3);
    expect(bottomRight.y).toBeCloseTo(editor.y + editor.height, 3);
  });

  it.each(views)('scale the glyphs by the same magnification at $name', ({ viewport }) => {
    // The editor scales its font by the zoom; the drawn mask is the object
    // magnified by the same amount. One number, used twice.
    const editor = canvasRectToScreen(
      { x: text.x, y: text.y, width: text.width, height: text.height },
      viewport,
    );
    const drawnWidth = drawn(text, viewport, 1, 0).x - drawn(text, viewport, 0, 0).x;

    expect(drawnWidth / text.width).toBeCloseTo(viewport.zoom, 5);
    expect(editor.width / text.width).toBeCloseTo(viewport.zoom, 5);
  });
});
