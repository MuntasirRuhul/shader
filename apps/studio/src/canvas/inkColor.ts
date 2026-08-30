import type { ThemeName } from '@shader/design-system';

/**
 * The colour something new is drawn in, so that it can be seen.
 *
 * A default that ignores the ground it lands on is a default that sometimes
 * lands invisibly: near-black text on a near-black canvas is not a choice
 * anyone made, it is the absence of one. New objects therefore take the ink
 * the canvas contrasts with, and remain free to be recoloured afterwards.
 *
 * These are the `text-primary` values of each theme, which is exactly what the
 * canvas already contrasts against everywhere else.
 */
export const INK: Readonly<Record<ThemeName, string>> = {
  light: '#18181b',
  dark: '#ececee',
};

export function inkFor(theme: ThemeName): string {
  return INK[theme];
}
