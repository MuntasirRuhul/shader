import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A visible focus indicator is a styling property, and jsdom applies no CSS —
 * a rendered assertion would pass even with the indicator suppressed. This
 * checks the stylesheets themselves instead, which does catch suppression.
 */

const primitivesDir = dirname(fileURLToPath(import.meta.url));

function stylesheetsIn(dir: string): { name: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const folder = join(dir, entry.name);
      return readdirSync(folder)
        .filter((file) => file.endsWith('.module.css'))
        .map((file) => ({
          name: `${entry.name}/${file}`,
          source: readFileSync(join(folder, file), 'utf8'),
        }));
    });
}

/** The rule bodies declared against `:focus-visible` in a stylesheet. */
function focusVisibleRules(source: string): string[] {
  const rules: string[] = [];
  const pattern = /:focus-visible[^{]*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    rules.push(match[1] ?? '');
  }
  return rules;
}

const stylesheets = stylesheetsIn(primitivesDir);

/** Stylesheets for primitives that render no focusable control of their own. */
const NON_FOCUSABLE = new Set(['Tooltip/Tooltip.module.css']);

describe('primitive focus indicators', () => {
  it('finds the primitive stylesheets to check', () => {
    expect(stylesheets.length).toBeGreaterThan(0);
  });

  const focusable = stylesheets.filter((sheet) => !NON_FOCUSABLE.has(sheet.name));

  it.each(focusable)('$name declares a :focus-visible rule', ({ source }) => {
    expect(focusVisibleRules(source).length).toBeGreaterThan(0);
  });

  it.each(focusable)('$name draws a visible indicator on focus', ({ source }) => {
    for (const body of focusVisibleRules(source)) {
      const drawsOutline = /outline:\s*(?!none)[^;]+/.test(body);
      const drawsRing = /box-shadow:\s*(?!none)[^;]+/.test(body);
      const drawsBorder = /border-color:\s*(?!transparent)[^;]+/.test(body);

      expect(
        drawsOutline || drawsRing || drawsBorder,
        `a :focus-visible rule must draw an indicator, but it declared: ${body.trim()}`,
      ).toBe(true);
    }
  });

  it.each(stylesheets)('$name never suppresses focus outright', ({ source }) => {
    // `outline: none` outside a :focus-visible rule that replaces it removes
    // the indicator for keyboard users.
    const suppressions = /outline:\s*none/.test(source);
    const replaced = focusVisibleRules(source).some((body) =>
      /box-shadow:\s*(?!none)[^;]+/.test(body),
    );

    expect(suppressions && !replaced).toBe(false);
  });
});
