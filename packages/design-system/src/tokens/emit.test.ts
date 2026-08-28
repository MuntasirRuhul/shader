import { describe, expect, it } from 'vitest';
import { emitTokensCss, tokenNames } from './emit';
import { tokens } from './tokens';
import { cssVariableName, isThemedTokenValue, TOKEN_CATEGORIES, type TokenSet } from './types';

const css = emitTokensCss(tokens);

/** The declaration block a selector opens, so we can assert per-theme content. */
function blockFor(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start, `selector ${selector} should exist`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces after ${selector}`);
}

describe('emitTokensCss', () => {
  it('declares every token in the light theme', () => {
    const light = blockFor(css, ':root {');
    for (const name of tokenNames(tokens)) {
      expect(light, `light theme should declare ${name}`).toContain(`${cssVariableName(name)}:`);
    }
  });

  it('declares every token in the dark theme', () => {
    const dark = blockFor(css, ":root[data-theme='dark']");
    for (const name of tokenNames(tokens)) {
      expect(dark, `dark theme should declare ${name}`).toContain(`${cssVariableName(name)}:`);
    }
  });

  it('declares every token in the system dark-preference block', () => {
    const media = blockFor(css, '@media (prefers-color-scheme: dark)');
    for (const name of tokenNames(tokens)) {
      expect(media).toContain(`${cssVariableName(name)}:`);
    }
  });

  it('resolves themed tokens to different values per theme', () => {
    const light = blockFor(css, ':root {');
    const dark = blockFor(css, ":root[data-theme='dark']");

    expect(light).toContain(`${cssVariableName('surface-canvas')}: #f4f4f5;`);
    expect(dark).toContain(`${cssVariableName('surface-canvas')}: #0a0a0b;`);
  });

  it('emits theme-invariant tokens identically in both themes', () => {
    const light = blockFor(css, ':root {');
    const dark = blockFor(css, ":root[data-theme='dark']");
    const declaration = `${cssVariableName('space-4')}: 8px;`;

    expect(light).toContain(declaration);
    expect(dark).toContain(declaration);
  });

  it('lets an explicit light choice win over the system dark preference', () => {
    expect(css).toContain(":root:not([data-theme='light'])");
  });

  it('sets color-scheme so native controls match the theme', () => {
    expect(blockFor(css, ':root {')).toContain('color-scheme: light');
    expect(blockFor(css, ":root[data-theme='dark']")).toContain('color-scheme: dark');
  });

  it('refuses to emit an invalid token set', () => {
    const broken: TokenSet = {
      color: { 'surface-panel': { light: '#fff' } as unknown as string },
      space: {},
      radius: {},
      typography: {},
      elevation: {},
      motion: {},
    };

    expect(() => emitTokensCss(broken)).toThrow(/surface-panel/);
  });
});

describe('tokenNames', () => {
  it('lists every token across every category', () => {
    const expected = TOKEN_CATEGORIES.reduce(
      (total, category) => total + Object.keys(tokens[category]).length,
      0,
    );

    expect(tokenNames(tokens)).toHaveLength(expected);
  });

  it('covers every category the token set declares', () => {
    for (const category of TOKEN_CATEGORIES) {
      expect(
        Object.keys(tokens[category]).length,
        `${category} should define tokens`,
      ).toBeGreaterThan(0);
    }
  });

  it('includes both themed and invariant tokens', () => {
    const values = TOKEN_CATEGORIES.flatMap((category) => Object.values(tokens[category]));

    expect(values.some(isThemedTokenValue)).toBe(true);
    expect(values.some((value) => !isThemedTokenValue(value))).toBe(true);
  });
});
