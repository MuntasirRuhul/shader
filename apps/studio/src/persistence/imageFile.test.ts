import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDocument,
  createImage,
  deserializeDocument,
  isVectorImage,
  serializeDocument,
} from '@shader/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/buildScene';
import {
  IMAGE_FILE_ACCEPT,
  importImageFile,
  MAX_IMAGE_BYTES,
  mediaTypeOf,
  viewBoxOf,
} from './imageFile';

/**
 * Bringing a picture in from a file.
 *
 * The bytes travel inside the document, which is what lets one be sent or
 * opened elsewhere and still show its pictures — and what makes a size limit
 * necessary rather than fussy.
 */

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fileOf(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('what may be imported', () => {
  it('offers the formats a browser can decode', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) {
      expect(IMAGE_FILE_ACCEPT).toContain(type);
    }
  });

  it('refuses a file that is not a picture', async () => {
    const outcome = await importImageFile(fileOf('notes.txt', 'text/plain', 10));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('not a picture');
  });

  it('refuses one too large to live inside a document', async () => {
    const outcome = await importImageFile(fileOf('huge.png', 'image/png', MAX_IMAGE_BYTES + 1));

    expect(outcome.ok).toBe(false);
    // The reason is given, since the user chose the file deliberately.
    if (!outcome.ok) expect(outcome.message).toContain('inside the document');
  });

  it('recognises an SVG the browser gave no type for', () => {
    // Some platforms report an empty type for .svg; refusing it on that basis
    // would be refusing a file the user can plainly see is a picture.
    expect(mediaTypeOf({ name: 'logo.svg', type: '' })).toBe('image/svg+xml');
    expect(mediaTypeOf({ name: 'LOGO.SVG', type: '' })).toBe('image/svg+xml');
  });

  it('believes the type when there is one', () => {
    expect(mediaTypeOf({ name: 'photo.png', type: 'image/png' })).toBe('image/png');
  });

  it('gives up on a decode that never settles rather than hanging', async () => {
    // A truncated file fires neither load nor error on some engines, and an
    // import that waits for ever is worse than one that guesses the size.
    const outcome = await importImageFile(fileOf('broken.png', 'image/png', 4), 10);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.image.naturalWidth).toBeGreaterThan(0);
  });
});

describe('the proportions a vector declares', () => {
  it('reads them from a viewBox', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"></svg>';

    expect(viewBoxOf(svg)).toEqual({ width: 240, height: 120 });
  });

  it('reads them through a data URI', () => {
    const svg = '<svg viewBox="0 0 64 32"></svg>';

    expect(viewBoxOf(`data:image/svg+xml,${encodeURIComponent(svg)}`)).toEqual({
      width: 64,
      height: 32,
    });
  });

  it('reports none when there is no viewBox to read', () => {
    expect(viewBoxOf('<svg></svg>')).toBeUndefined();
  });

  it('reports none rather than a nonsense size', () => {
    expect(viewBoxOf('<svg viewBox="0 0 0 0"></svg>')).toBeUndefined();
  });
});

describe('an imported picture as an object', () => {
  it('keeps the proportions of the file', () => {
    const object = createImage(PIXEL, 'image/png', 1600, 800);

    expect(object.width / object.height).toBeCloseTo(2, 5);
  });

  it('arrives at a workable size rather than at camera resolution', () => {
    const object = createImage(PIXEL, 'image/png', 6000, 4000);

    expect(object.width).toBeLessThanOrEqual(640);
    expect(object.height).toBeLessThanOrEqual(640);
  });

  it('leaves a small picture at its own size', () => {
    const object = createImage(PIXEL, 'image/png', 120, 90);

    expect(object).toMatchObject({ width: 120, height: 90 });
  });

  it('remembers what the file was, so a vector can be told from a bitmap', () => {
    expect(isVectorImage(createImage('data:image/svg+xml,<svg/>', 'image/svg+xml', 10, 10))).toBe(
      true,
    );
    expect(isVectorImage(createImage(PIXEL, 'image/png', 10, 10))).toBe(false);
  });
});

describe('a picture travels with the document', () => {
  const object = createImage(PIXEL, 'image/png', 64, 64, { name: 'Pixel' });
  const document_ = createDocument({ objects: [object] });

  it('survives being saved and opened again', () => {
    const result = deserializeDocument(serializeDocument(document_));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const restored = result.document.objects[0];
    expect(restored).toMatchObject({ type: 'image', source: PIXEL, mediaType: 'image/png' });
  });

  it('carries its bytes, not a path that could stop resolving', () => {
    expect(serializeDocument(document_)).toContain('data:image/png;base64');
  });
});

describe('an image object on the canvas', () => {
  const object = createImage(PIXEL, 'image/png', 64, 64);
  const document_ = createDocument({ objects: [object] });

  it('is drawn by the built-in image fill', () => {
    const [item] = buildScene(document_).items;

    expect(item?.shaderId).toBe('@image');
  });

  it('carries its picture once one has decoded', () => {
    const picture = { source: {} as TexImageSource, revision: 1 };
    const [item] = buildScene(document_, { imageFor: () => picture }).items;

    expect(item?.image).toBe(picture);
  });

  it('is still drawn while its picture is decoding', () => {
    // Absent, not missing: the object exists and can be moved before its
    // bytes have finished arriving.
    const [item] = buildScene(document_, { imageFor: () => undefined }).items;

    expect(item).toBeDefined();
    expect(item?.image).toBeUndefined();
  });
});

describe('the canvas is actually told about pictures', () => {
  // buildScene only supplies an image when its caller passes `imageFor`. That
  // wiring is the one part no unit test reaches — the hook that does it needs a
  // graphics context — and when it was silently missing, every import produced
  // an object that drew nothing at all.
  it('the canvas hook supplies both a mask and an image to the scene', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'canvas', 'useShaderCanvas.ts'),
      'utf8',
    );

    expect(source).toMatch(/maskFor:/);
    expect(source).toMatch(/imageFor:/);
  });
});
