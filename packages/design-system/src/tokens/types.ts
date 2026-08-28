/**
 * A value that differs between the light and dark themes. Both entries are
 * required so that a theme can never be left with an undefined token.
 */
export interface ThemedTokenValue {
  readonly light: string;
  readonly dark: string;
}

/** A token is either theme-invariant (one value) or themed (one value per theme). */
export type TokenValue = string | ThemedTokenValue;

export type TokenGroup = Readonly<Record<string, TokenValue>>;

/**
 * Token categories. Grouping exists for authoring and emission order only —
 * token names are unique across the whole set, so a CSS custom property name
 * is derived from the name alone.
 */
export interface TokenSet {
  readonly color: TokenGroup;
  readonly space: TokenGroup;
  readonly radius: TokenGroup;
  readonly typography: TokenGroup;
  readonly elevation: TokenGroup;
  readonly motion: TokenGroup;
}

export type TokenCategory = keyof TokenSet;

export const TOKEN_CATEGORIES: readonly TokenCategory[] = [
  'color',
  'space',
  'radius',
  'typography',
  'elevation',
  'motion',
];

export type ThemeName = 'light' | 'dark';

export const THEME_NAMES: readonly ThemeName[] = ['light', 'dark'];

/** The prefix every emitted custom property carries. */
export const TOKEN_PREFIX = '--sb';

export function isThemedTokenValue(value: TokenValue): value is ThemedTokenValue {
  return typeof value === 'object' && value !== null;
}

/** `surface-panel` becomes `--sb-surface-panel`. */
export function cssVariableName(tokenName: string): string {
  return `${TOKEN_PREFIX}-${tokenName}`;
}

/** `surface-panel` becomes `var(--sb-surface-panel)`. */
export function cssVariableReference(tokenName: string): string {
  return `var(${cssVariableName(tokenName)})`;
}
