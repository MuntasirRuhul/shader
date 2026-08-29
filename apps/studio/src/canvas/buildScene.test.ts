import {
  createDocument,
  createRectangle,
  createText,
  resetObjectIds,
  shaderFill,
  solidFill,
  type CanvasDocument,
  type TexSource,
} from '@shader/core';
import { addObjects } from '@shader/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildScene } from './buildScene';

let document: CanvasDocument;

beforeEach(() => {
  resetObjectIds();
  document = createDocument();
});

describe('building the scene from a document', () => {
  it('is empty for an empty document', () => {
    expect(buildScene(document).items).toEqual([]);
  });

  it('includes objects with a shader fill', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', fill: shaderFill('gradient-blur', { angle: 90 }) }),
    ]);

    expect(buildScene(seeded).items).toHaveLength(1);
    expect(buildScene(seeded).items[0]).toMatchObject({
      objectId: 'a',
      shaderId: 'gradient-blur',
      values: { angle: 90 },
    });
  });

  it('preserves document order, so the scene is back to front', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'back', fill: shaderFill('s') }),
      createRectangle({ id: 'middle', fill: shaderFill('s') }),
      createRectangle({ id: 'front', fill: shaderFill('s') }),
    ]);

    expect(buildScene(seeded).items.map((item) => item.objectId)).toEqual([
      'back',
      'middle',
      'front',
    ]);
  });

  it('carries each object its own transform', () => {
    const seeded = addObjects(document, [
      createRectangle({
        id: 'a',
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        rotation: 0.5,
        fill: shaderFill('s'),
      }),
    ]);

    expect(buildScene(seeded).items[0]?.transform).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      rotation: 0.5,
    });
  });

  it('carries the object opacity', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', opacity: 0.35, fill: shaderFill('s') }),
    ]);

    expect(buildScene(seeded).items[0]?.opacity).toBe(0.35);
  });

  it('gives objects sharing a shader their own values', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', fill: shaderFill('s', { angle: 10 }) }),
      createRectangle({ id: 'b', fill: shaderFill('s', { angle: 200 }) }),
    ]);

    const items = buildScene(seeded).items;
    expect(items[0]?.values).toEqual({ angle: 10 });
    expect(items[1]?.values).toEqual({ angle: 200 });
  });
});

describe('what the scene leaves out', () => {
  it('omits a hidden object', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'shown', fill: shaderFill('s') }),
      createRectangle({ id: 'hidden', visible: false, fill: shaderFill('s') }),
    ]);

    expect(buildScene(seeded).items.map((item) => item.objectId)).toEqual(['shown']);
  });

  it('omits an object with a solid fill, which needs no shader program', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'solid', fill: solidFill('#ffffff') }),
    ]);

    expect(buildScene(seeded).items).toEqual([]);
  });
});

describe('text masks', () => {
  it('attaches a mask when one is supplied', () => {
    const mask: TexSource = { source: {} as TexImageSource, revision: 3 };
    const seeded = addObjects(document, [
      createText({ id: 't', text: 'Hello', fill: shaderFill('s') }),
    ]);

    const items = buildScene(seeded, { maskFor: () => mask }).items;

    expect(items[0]?.mask).toBe(mask);
  });

  it('omits the mask when none is supplied', () => {
    const seeded = addObjects(document, [
      createText({ id: 't', text: 'Hello', fill: shaderFill('s') }),
    ]);

    expect(buildScene(seeded).items[0]?.mask).toBeUndefined();
  });

  it('asks for a mask only for the objects in the scene', () => {
    const asked: string[] = [];
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', fill: shaderFill('s') }),
      createRectangle({ id: 'hidden', visible: false, fill: shaderFill('s') }),
    ]);

    buildScene(seeded, {
      maskFor: (object) => {
        asked.push(object.id);
        return undefined;
      },
    });

    expect(asked).toEqual(['a']);
  });
});
