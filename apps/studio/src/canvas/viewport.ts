import type { Point, Rect } from '@shader/core';
import { clampZoom, type ViewportState } from '../store/slices';

/**
 * Moving between screen pixels and canvas coordinates.
 *
 * Objects store canvas coordinates, which never change when the view moves —
 * panning and zooming are properties of the view, not of what is being viewed.
 */

export function screenToCanvas(point: Point, viewport: ViewportState): Point {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function canvasToScreen(point: Point, viewport: ViewportState): Point {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

export function canvasRectToScreen(rect: Rect, viewport: ViewportState): Rect {
  const origin = canvasToScreen({ x: rect.x, y: rect.y }, viewport);
  return {
    x: origin.x,
    y: origin.y,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

/**
 * Zooms about a fixed screen point.
 *
 * The canvas point under the pointer must stay under the pointer, which is
 * what makes wheel-zoom feel like it is following the cursor rather than the
 * origin.
 */
export function zoomAbout(
  viewport: ViewportState,
  screenPoint: Point,
  nextZoom: number,
): ViewportState {
  const zoom = clampZoom(nextZoom);
  if (zoom === viewport.zoom) return viewport;

  const anchor = screenToCanvas(screenPoint, viewport);

  return {
    zoom,
    panX: screenPoint.x - anchor.x * zoom,
    panY: screenPoint.y - anchor.y * zoom,
  };
}

/** A zoom step for a wheel or trackpad gesture. */
export function zoomStep(currentZoom: number, delta: number): number {
  // Exponential so each notch feels the same at any magnification.
  return currentZoom * Math.exp(-delta * 0.0015);
}

export interface FitOptions {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly padding?: number;
}

/**
 * The view that brings a region fully into sight.
 *
 * Returns the identity view for an empty region, so zoom-to-fit on an empty
 * canvas resets rather than dividing by zero.
 */
export function fitToBounds(bounds: Rect | undefined, options: FitOptions): ViewportState {
  const padding = options.padding ?? 48;

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  const availableWidth = Math.max(1, options.viewWidth - padding * 2);
  const availableHeight = Math.max(1, options.viewHeight - padding * 2);

  const zoom = clampZoom(Math.min(availableWidth / bounds.width, availableHeight / bounds.height));

  // Centre the region in the view at the chosen magnification.
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;

  return {
    zoom,
    panX: options.viewWidth / 2 - centreX * zoom,
    panY: options.viewHeight / 2 - centreY * zoom,
  };
}

/** The zoom level as a percentage, for display. */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}
