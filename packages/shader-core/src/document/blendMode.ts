/**
 * How an object's colour combines with what is already beneath it.
 *
 * These are the modes the graphics hardware can perform while drawing. The
 * rest of the familiar set — overlay, soft light, colour burn and dodge, hue,
 * saturation — cannot be done this way: each needs to *read* the backdrop, and
 * a program cannot read the surface it is writing to. Those require the whole
 * canvas to be drawn into an off-screen target and composited afterwards,
 * which is a change to how everything is drawn rather than an addition to it.
 *
 * Offering only what actually works is the point. A menu listing sixteen modes
 * where seven quietly do nothing is worse than a menu listing six.
 */
export const BLEND_MODES = ['normal', 'darken', 'multiply', 'lighten', 'screen', 'add'] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export const DEFAULT_BLEND_MODE: BlendMode = 'normal';

export function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && (BLEND_MODES as readonly string[]).includes(value);
}

/** What each mode is called where someone has to choose one. */
export const BLEND_MODE_LABELS: Readonly<Record<BlendMode, string>> = {
  normal: 'Normal',
  darken: 'Darken',
  multiply: 'Multiply',
  lighten: 'Lighten',
  screen: 'Screen',
  add: 'Plus lighter',
};
