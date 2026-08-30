import { createText } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { INK, inkFor } from '../canvas/inkColor';
import { fitTextBox } from '../canvas/textRasterizer';

/**
 * What the type panel has to keep true.
 *
 * The box and the type are one thing: text set larger, heavier, or more widely
 * spaced needs more room, and a box left at its old size crops it — which is
 * exactly what raising the size to 80 used to do.
 */

describe('the box follows the type', () => {
  const object = createText({ text: 'It getting', width: 600 });

  it('grows taller when the size grows', () => {
    const small = fitTextBox(object.text, { ...object.textSettings, fontSize: 24 }, object.width);
    const large = fitTextBox(object.text, { ...object.textSettings, fontSize: 80 }, object.width);

    expect(large.height).toBeGreaterThan(small.height);
  });

  it('is at least a line of the size asked for', () => {
    const box = fitTextBox(object.text, { ...object.textSettings, fontSize: 80 }, object.width);

    // A box shorter than one line is a box that crops its only line.
    expect(box.height).toBeGreaterThanOrEqual(80 * object.textSettings.lineHeight);
  });

  it('grows taller when the lines are spread further apart', () => {
    const tight = fitTextBox(object.text, { ...object.textSettings, lineHeight: 1 }, object.width);
    const loose = fitTextBox(object.text, { ...object.textSettings, lineHeight: 2 }, object.width);

    expect(loose.height).toBeGreaterThan(tight.height);
  });

  it('keeps the width it was given, so a box sized by hand stays put', () => {
    const box = fitTextBox(object.text, { ...object.textSettings, fontSize: 200 }, 600);

    expect(box.width).toBe(600);
  });
});

describe('new text can be read where it lands', () => {
  it('is light on a dark canvas and dark on a light one', () => {
    // A default that ignores the ground it lands on sometimes lands invisibly.
    expect(inkFor('dark')).toBe(INK.dark);
    expect(inkFor('light')).toBe(INK.light);
    expect(INK.dark).not.toBe(INK.light);
  });

  it('contrasts with the canvas rather than sitting near it', () => {
    const brightness = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return (((value >> 16) & 255) + ((value >> 8) & 255) + (value & 255)) / 3;
    };

    // The canvas is #0a0a0b dark and #f4f4f5 light.
    expect(brightness(INK.dark)).toBeGreaterThan(128);
    expect(brightness(INK.light)).toBeLessThan(128);
  });
});
