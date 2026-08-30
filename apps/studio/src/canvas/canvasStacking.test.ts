import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * What the canvas stage paints, and in what order.
 *
 * The layers are drawn by two different systems — the ground and the overlays
 * in the DOM, the work in WebGL — so nothing about the source says which ends
 * up on top. The order is declared, and this is what holds it: raising the
 * drawing surface over the ground without also raising the overlays over the
 * surface would paint the artwork across its own selection handles.
 */

const here = dirname(fileURLToPath(import.meta.url));

function layerIndex(file: string, selector: string): number {
  const css = readFileSync(join(here, file), 'utf8');
  const rule = new RegExp(`\\.${selector}\\s*\\{[^}]*?z-index:\\s*(-?\\d+)`, 's').exec(css);

  expect(rule?.[1], `${file} .${selector} declares no z-index`).toBeDefined();
  return Number(rule?.[1]);
}

describe('the canvas layers are ordered explicitly', () => {
  const ground = () => layerIndex('CanvasStage.module.css', 'ground');
  const surface = () => layerIndex('CanvasStage.module.css', 'surface');
  const overlay = () => layerIndex('SelectionOverlay.module.css', 'overlay');
  const editor = () => layerIndex('TextEditor.module.css', 'editor');

  it('puts the ground beneath the work', () => {
    expect(ground()).toBeLessThan(surface());
  });

  it('puts the selection over the work', () => {
    // A shader fills its object opaquely, so an overlay below it is invisible.
    expect(overlay()).toBeGreaterThan(surface());
  });

  it('puts the ground beneath the selection too', () => {
    expect(ground()).toBeLessThan(overlay());
  });

  it('puts the text editor over everything', () => {
    expect(editor()).toBeGreaterThan(overlay());
  });
});

describe('the ground is not the renderer business', () => {
  it('is drawn in CSS, so it costs nothing while the loop is idle', () => {
    const ground = readFileSync(join(here, 'ground.ts'), 'utf8');

    // No graphics call anywhere in it: a still document keeps its background
    // without the render loop having to run to maintain it.
    expect(ground).not.toMatch(/\bgl\b|WebGL|drawArrays|renderFrame/);
  });

  it('is inert to the pointer, so it never intercepts a drag', () => {
    const css = readFileSync(join(here, 'CanvasStage.module.css'), 'utf8');
    const rule = /\.ground\s*\{[^}]*\}/s.exec(css)?.[0] ?? '';

    expect(rule).toContain('pointer-events: none');
  });
});
