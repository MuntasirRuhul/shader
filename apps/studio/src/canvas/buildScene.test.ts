import {
  createDocument,
  createRectangle,
  createText,
  resetObjectIds,
  shaderFill,
  solidFill,
  SOLID_FILL_SHADER_ID,
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

  it('draws a solid fill through the built-in shader', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'solid', fill: solidFill('#ffffff') }),
    ]);

    // A plain object still has to be drawn, in the right place in the order.
    expect(buildScene(seeded).items[0]).toMatchObject({
      objectId: 'solid',
      shaderId: SOLID_FILL_SHADER_ID,
      values: { color: '#ffffff' },
    });
  });

  it('interleaves solid and shader fills in stacking order', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'back', fill: solidFill('#000000') }),
      createRectangle({ id: 'middle', fill: shaderFill('s') }),
      createRectangle({ id: 'front', fill: solidFill('#ffffff') }),
    ]);

    expect(buildScene(seeded).items.map((item) => item.objectId)).toEqual([
      'back',
      'middle',
      'front',
    ]);
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

describe('pointer input reaches each object in its own frame', () => {
  it('reports the pointer absent when none is given', () => {
    const seeded = addObjects(document, [createRectangle({ id: 'a', fill: shaderFill('s') })]);

    expect(buildScene(seeded).items[0]?.pointer?.present).toBe(false);
  });

  it('expresses the pointer as a fraction of the object', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', x: 100, y: 100, width: 200, height: 100, fill: shaderFill('s') }),
    ]);

    const pointer = buildScene(seeded, { pointer: { x: 150, y: 125 } }).items[0]?.pointer;

    expect(pointer?.present).toBe(true);
    expect(pointer?.x).toBeCloseTo(0.25, 6);
    expect(pointer?.y).toBeCloseTo(0.25, 6);
  });

  it('reports it absent when the pointer is outside the object', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', x: 0, y: 0, width: 100, height: 100, fill: shaderFill('s') }),
    ]);

    expect(buildScene(seeded, { pointer: { x: 500, y: 500 } }).items[0]?.pointer?.present).toBe(
      false,
    );
  });

  it('follows the object when it moves', () => {
    const moved = addObjects(document, [
      createRectangle({ id: 'a', x: 400, y: 400, width: 200, height: 100, fill: shaderFill('s') }),
    ]);

    // The same canvas point is now the object's centre rather than outside it.
    const pointer = buildScene(moved, { pointer: { x: 500, y: 450 } }).items[0]?.pointer;

    expect(pointer?.present).toBe(true);
    expect(pointer?.x).toBeCloseTo(0.5, 6);
    expect(pointer?.y).toBeCloseTo(0.5, 6);
  });

  it('accounts for the object being resized', () => {
    const wide = addObjects(document, [
      createRectangle({ id: 'a', x: 0, y: 0, width: 400, height: 100, fill: shaderFill('s') }),
    ]);

    expect(buildScene(wide, { pointer: { x: 100, y: 50 } }).items[0]?.pointer?.x).toBeCloseTo(
      0.25,
      6,
    );
  });

  it('accounts for the object being rotated', () => {
    const turned = addObjects(document, [
      createRectangle({
        id: 'a',
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        rotation: Math.PI / 2,
        fill: shaderFill('s'),
      }),
    ]);

    // The centre stays the centre however the object is turned.
    const pointer = buildScene(turned, { pointer: { x: 200, y: 200 } }).items[0]?.pointer;

    expect(pointer?.present).toBe(true);
    expect(pointer?.x).toBeCloseTo(0.5, 6);
    expect(pointer?.y).toBeCloseTo(0.5, 6);
  });

  it('gives each object its own view of one pointer', () => {
    const two = addObjects(document, [
      createRectangle({ id: 'left', x: 0, y: 0, width: 100, height: 100, fill: shaderFill('s') }),
      createRectangle({
        id: 'right',
        x: 200,
        y: 0,
        width: 100,
        height: 100,
        fill: shaderFill('s'),
      }),
    ]);

    const items = buildScene(two, { pointer: { x: 50, y: 50 } }).items;

    expect(items[0]?.pointer?.present).toBe(true);
    expect(items[1]?.pointer?.present).toBe(false);
  });
});
