import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDocument,
  createImage,
  createRectangle,
  MANIFEST_SCHEMA_VERSION,
  shaderFill,
  solidFill,
  type ShaderManifest,
  type TexSource,
} from '@shader/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from './buildScene';
import { ImageCache } from './imageCache';
import { shaderPicturesFor } from './shaderPictures';

/**
 * A picture a shader samples: how it reaches the renderer from the value the
 * inspector stored.
 */

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const refracting: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'refracting',
  name: 'Refracting',
  category: 'Test',
  fragmentSource: 'void main() { outColor = texture(source, vUv); }',
  parameters: [
    { name: 'source', label: 'Picture', type: 'image', defaultValue: '' },
    { name: 'tint', label: 'Tint', type: 'color', defaultValue: '#ffffff' },
  ],
  presets: [{ id: 'default', name: 'Default', values: {} }],
};

const plain: ShaderManifest = { ...refracting, id: 'plain', parameters: [] };

const manifests = new Map([
  [refracting.id, refracting],
  [plain.id, plain],
]);
const manifestOf = (shaderId: string) => manifests.get(shaderId);

const decoded: TexSource = { source: {} as TexImageSource, revision: 1 };

describe('resolving a shader picture', () => {
  it('offers the picture chosen for an image parameter', () => {
    const object = createRectangle({
      fill: shaderFill('refracting', { source: PIXEL }),
    });

    expect(shaderPicturesFor(object, manifestOf, () => decoded)).toEqual({ source: decoded });
  });

  it('offers nothing while the file is still decoding', () => {
    const object = createRectangle({
      fill: shaderFill('refracting', { source: PIXEL }),
    });

    expect(shaderPicturesFor(object, manifestOf, () => undefined)).toBeUndefined();
  });

  it('offers nothing when no picture has been chosen', () => {
    const object = createRectangle({ fill: shaderFill('refracting', {}) });
    let asked = false;

    expect(
      shaderPicturesFor(object, manifestOf, () => {
        asked = true;
        return decoded;
      }),
    ).toBeUndefined();
    expect(asked, 'an unset picture should not be decoded').toBe(false);
  });

  it('names the parameter, so a shader with two pictures keeps them apart', () => {
    const twoPictures: ShaderManifest = {
      ...refracting,
      id: 'two-pictures',
      parameters: [
        { name: 'source', label: 'Picture', type: 'image', defaultValue: '' },
        { name: 'backdrop', label: 'Backdrop', type: 'image', defaultValue: '' },
      ],
    };
    const object = createRectangle({
      fill: shaderFill('two-pictures', { source: PIXEL, backdrop: PIXEL }),
    });

    const pictures = shaderPicturesFor(
      object,
      (id) => (id === 'two-pictures' ? twoPictures : undefined),
      (name) => ({ source: {} as TexImageSource, revision: name === 'source' ? 1 : 2 }),
    );

    expect(pictures?.['source']?.revision).toBe(1);
    expect(pictures?.['backdrop']?.revision).toBe(2);
  });

  it('offers nothing for a shader that declares no picture', () => {
    const object = createRectangle({ fill: shaderFill('plain', {}) });

    expect(shaderPicturesFor(object, manifestOf, () => decoded)).toBeUndefined();
  });

  it('offers nothing for a plain fill, or a shader nobody knows', () => {
    expect(
      shaderPicturesFor(createRectangle({ fill: solidFill('#ff0000') }), manifestOf, () => decoded),
    ).toBeUndefined();
    expect(
      shaderPicturesFor(createRectangle({ fill: shaderFill('absent') }), manifestOf, () => decoded),
    ).toBeUndefined();
  });
});

describe('the scene carries a shader picture to the renderer', () => {
  const object = createRectangle({ id: 'a', fill: shaderFill('refracting', { source: PIXEL }) });
  const document_ = createDocument({ objects: [object] });

  it('puts it on the item, keyed by parameter', () => {
    const [item] = buildScene(document_, {
      shaderImagesFor: () => ({ source: decoded }),
    }).items;

    expect(item?.parameterImages).toEqual({ source: decoded });
  });

  it('draws the object anyway while the picture is decoding', () => {
    const [item] = buildScene(document_, { shaderImagesFor: () => undefined }).items;

    expect(item).toBeDefined();
    expect(item?.parameterImages).toBeUndefined();
  });
});

describe('the image cache serving a shader', () => {
  it('has nothing until the picture has decoded', () => {
    const cache = new ImageCache();

    expect(cache.parameterSource('object-1', 'object-1::source', PIXEL)).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it('forgets a shader picture when its object goes', () => {
    const cache = new ImageCache();
    cache.parameterSource('object-1', 'object-1::source', PIXEL);

    cache.retainOnly(['object-2']);

    expect(cache.size).toBe(0);
  });

  it('keeps an object picture and a shader picture apart on the same object', () => {
    const cache = new ImageCache();
    const object = createImage(PIXEL, 'image/png', 8, 8, { id: 'object-1' });

    cache.sourceFor(object, 1);
    cache.parameterSource('object-1', 'object-1::source', PIXEL);

    expect(cache.size).toBe(2);
  });
});

describe('the canvas is actually told about shader pictures', () => {
  // The wiring no unit test reaches: the hook needs a graphics context. The
  // same seam has been empty before — an `imageFor` that was never passed
  // meant every imported picture drew nothing at all.
  it('the canvas hook supplies them to the scene', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'useShaderCanvas.ts'),
      'utf8',
    );

    expect(source).toMatch(/shaderImagesFor:/);
    expect(source).toMatch(/shaderPicturesFor\(/);
  });
});
