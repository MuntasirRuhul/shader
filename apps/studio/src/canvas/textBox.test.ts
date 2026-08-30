import { createRectangle, createText, createDocument } from '@shader/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from './buildScene';
import { fitTextBox, wrapText } from './textRasterizer';

/**
 * What a text object is worth drawing, and how big its box should be.
 *
 * A text object is its glyphs. Drawn without any, the shader fills the whole
 * box instead — which is what a newly created text object looked like: a solid
 * slab of colour with a caret standing in it.
 */

describe('an empty text object draws nothing', () => {
  it('is left out of the scene entirely', () => {
    const document = createDocument({ objects: [createText({ x: 10, y: 10 })] });

    expect(buildScene(document).items).toHaveLength(0);
  });

  it('is left out while it holds only whitespace', () => {
    const document = createDocument({ objects: [createText({ text: '   \n  ' })] });

    expect(buildScene(document).items).toHaveLength(0);
  });

  it('is drawn as soon as it has something to say', () => {
    const document = createDocument({ objects: [createText({ text: 'Hello' })] });

    expect(buildScene(document).items).toHaveLength(1);
  });

  it('leaves every other kind of object alone', () => {
    // Only text is its glyphs; an empty rectangle is still a rectangle.
    const document = createDocument({ objects: [createRectangle({ width: 10, height: 10 })] });

    expect(buildScene(document).items).toHaveLength(1);
  });

  it('still lets the empty object be selected and edited', () => {
    // It is absent from the scene, not from the document: the caret has to
    // have something to sit in, and the object has to survive being typed into.
    const object = createText({ x: 10, y: 10 });
    const document = createDocument({ objects: [object] });

    expect(document.objects).toHaveLength(1);
    expect(buildScene(document).items).toHaveLength(0);
  });
});

describe('a new text object starts the size of one line', () => {
  it('is one line high rather than an arbitrary rectangle', () => {
    const object = createText();
    const { fontSize, lineHeight } = object.textSettings;

    expect(object.height).toBe(Math.round(fontSize * lineHeight));
  });

  it('scales that line with the font it is given', () => {
    const large = createText({ textSettings: { fontSize: 96 } as never });

    expect(large.height).toBeGreaterThan(createText().height);
  });
});

describe('the box fits the words', () => {
  const settings = createText().textSettings;

  it('keeps a width it is given, so a box sized by hand stays that width', () => {
    expect(fitTextBox('anything at all', settings, 320).width).toBe(320);
  });

  it('is never shorter than one line, even with nothing in it', () => {
    const empty = fitTextBox('', settings, 320);

    expect(empty.height).toBeGreaterThanOrEqual(settings.fontSize * settings.lineHeight);
  });

  it('grows down as lines are added', () => {
    const one = fitTextBox('one', settings, 320);
    const three = fitTextBox('one\ntwo\nthree', settings, 320);

    expect(three.height).toBeGreaterThan(one.height);
  });

  it('grows by whole lines rather than by arbitrary amounts', () => {
    const line = settings.fontSize * settings.lineHeight;
    const two = fitTextBox('one\ntwo', settings, 320);

    expect(two.height / line).toBeCloseTo(2, 5);
  });
});

describe('wrapping decides how many lines there are', () => {
  // Measured against a stand-in, since a headless run has no font metrics.
  const context = { measureText: (text: string) => ({ width: text.length * 10 }) } as never;

  it('breaks a long line at the box width', () => {
    expect(wrapText(context, 'aaa bbb ccc ddd', 70)).toEqual(['aaa bbb', 'ccc ddd']);
  });

  it('honours the breaks that were typed', () => {
    expect(wrapText(context, 'one\ntwo', 1000)).toEqual(['one', 'two']);
  });

  it('keeps an empty line that was typed', () => {
    expect(wrapText(context, 'one\n\ntwo', 1000)).toEqual(['one', '', 'two']);
  });
});
