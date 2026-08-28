import {
  cssVariableName,
  isThemedTokenValue,
  TOKEN_CATEGORIES,
  type ThemeName,
  type TokenSet,
  type TokenValue,
} from './types';
import { assertValidTokenSet } from './validate';

/** Every token name in the set, in category then declaration order. */
export function tokenNames(tokenSet: TokenSet): string[] {
  return TOKEN_CATEGORIES.flatMap((category) => Object.keys(tokenSet[category]));
}

function resolve(value: TokenValue, theme: ThemeName): string {
  return isThemedTokenValue(value) ? value[theme] : value;
}

function declarationsFor(tokenSet: TokenSet, theme: ThemeName, indent: string): string {
  const lines: string[] = [];

  for (const category of TOKEN_CATEGORIES) {
    const entries = Object.entries(tokenSet[category]);
    if (entries.length === 0) continue;

    lines.push(`${indent}/* ${category} */`);
    for (const [name, value] of entries) {
      lines.push(`${indent}${cssVariableName(name)}: ${resolve(value, theme)};`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Emits both themes as CSS custom properties.
 *
 * The light theme is the base so that a page with no theme attribute is still
 * fully defined. Dark is applied by an explicit `data-theme="dark"` attribute,
 * and also under `prefers-color-scheme: dark` when no explicit choice is set —
 * which is how the system-preference default works without JavaScript.
 */
export function emitTokensCss(tokenSet: TokenSet): string {
  assertValidTokenSet(tokenSet);

  const light = declarationsFor(tokenSet, 'light', '  ');
  const dark = declarationsFor(tokenSet, 'dark', '  ');
  const darkNested = declarationsFor(tokenSet, 'dark', '    ');

  return `/*
 * Generated from src/tokens/tokens.ts by \`npm run build:tokens\`.
 * Do not edit by hand — edit the token source and regenerate.
 */

:root {
  color-scheme: light;

${light}
}

:root[data-theme='dark'] {
  color-scheme: dark;

${dark}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;

${darkNested}
  }
}
`;
}
