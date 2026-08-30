import type { CSSProperties } from 'react';
import type { ViewportState } from '../store/slices';

/**
 * The ground the canvas sits on.
 *
 * An unbounded surface with nothing on it gives no sign that a pan is doing
 * anything — the work moves, and the emptiness around it does not. A regular
 * ground that follows the view makes movement visible.
 *
 * It is drawn beneath the transparent canvas rather than by the renderer. In
 * the shader layer it would be a full-surface pass every frame, on a canvas
 * whose whole idle strategy is to stop drawing when nothing moves: a still
 * document would either keep burning frames to hold its own background, or
 * stop and lose it. Beneath the canvas it costs nothing, survives the loop
 * idling, and is behind every object by construction.
 */

/** The finest spacing the ground uses, in canvas units. */
const BASE_SPACING = 8;

/** What the spacing aims for on screen. Steps land within a factor of √2. */
const TARGET_SCREEN_SPACING = 24;

/**
 * The ground's spacing in canvas units, for a magnification.
 *
 * Spacing steps by powers of two rather than scaling continuously: a ground
 * that simply scaled would become a solid field when zoomed out and a single
 * line when zoomed in. Powers of two keep every step a whole multiple of the
 * one below, so the ground never appears to drift between magnifications.
 */
export function groundSpacing(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return BASE_SPACING;

  const steps = Math.round(Math.log2(TARGET_SCREEN_SPACING / (BASE_SPACING * zoom)));
  return BASE_SPACING * Math.pow(2, steps);
}

/** How far apart the ground reads on screen, which is what has to stay legible. */
export function groundScreenSpacing(zoom: number): number {
  return groundSpacing(zoom) * zoom;
}

/**
 * Where to put the ground for a given view.
 *
 * The lattice is anchored to the canvas origin, so it moves with the work
 * rather than with the window. Only the offset within one cell is needed,
 * which keeps the numbers small however far the view has travelled.
 */
export function groundStyle(viewport: ViewportState): CSSProperties {
  const spacing = groundScreenSpacing(viewport.zoom);
  if (!Number.isFinite(spacing) || spacing <= 0) return { backgroundImage: 'none' };

  const offsetX = ((viewport.panX % spacing) + spacing) % spacing;
  const offsetY = ((viewport.panY % spacing) + spacing) % spacing;

  return {
    backgroundSize: `${String(spacing)}px ${String(spacing)}px`,
    backgroundPosition: `${String(offsetX)}px ${String(offsetY)}px`,
  };
}
