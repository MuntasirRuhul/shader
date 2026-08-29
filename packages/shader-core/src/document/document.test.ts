import { beforeEach, describe, expect, it } from 'vitest';
import { ShaderRegistry } from '../registry/ShaderRegistry';
import { sampleManifest } from '../registry/testFixtures';
import { describeMissingShader, resolveFill, unresolvedObjects } from './fillResolution';
import {
  createDocument,
  createEllipse,
  createRectangle,
  createText,
  DEFAULT_TEXT_SETTINGS,
  isCanvasObjectType,
  isShaderFill,
  isTextObject,
  resetObjectIds,
  shaderFill,
  solidFill,
  type CanvasDocument,
} from './model';
import {
  addObject,
  addObjects,
  bringToFront,
  findObject,
  lowerObject,
  raiseObject,
  referencedShaderIds,
  removeObject,
  removeObjects,
  replaceShaderValues,
  sendToBack,
  setFill,
  setShaderValues,
  updateObject,
  visibleObjects,
} from './operations';

let document: CanvasDocument;

beforeEach(() => {
  resetObjectIds();
  document = createDocument();
});

describe('a scene of objects', () => {
  it('starts empty', () => {
    expect(document.objects).toEqual([]);
  });

  it('adds an object with the supplied geometry and fill', () => {
    const rectangle = createRectangle({ x: 10, y: 20, width: 100, height: 50 });
    const next = addObject(document, rectangle);

    expect(next.objects).toHaveLength(1);
    expect(next.objects[0]).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('gives each object a unique identifier', () => {
    const next = addObjects(document, [createRectangle(), createRectangle(), createEllipse()]);
    const ids = next.objects.map((object) => object.id);

    expect(new Set(ids).size).toBe(3);
  });

  it('replaces an identifier that collides with one already present', () => {
    const first = createRectangle({ id: 'duplicate' });
    const second = createRectangle({ id: 'duplicate' });
    const next = addObjects(document, [first, second]);

    expect(next.objects).toHaveLength(2);
    expect(next.objects[0]?.id).not.toBe(next.objects[1]?.id);
  });

  it('carries every required property', () => {
    const object = createRectangle();

    expect(object).toMatchObject({
      id: expect.any(String) as string,
      type: 'rectangle',
      x: expect.any(Number) as number,
      y: expect.any(Number) as number,
      width: expect.any(Number) as number,
      height: expect.any(Number) as number,
      rotation: expect.any(Number) as number,
      opacity: expect.any(Number) as number,
      visible: true,
      locked: false,
      fill: expect.any(Object) as object,
    });
  });

  it('leaves the document unchanged when nothing is added', () => {
    expect(addObjects(document, [])).toBe(document);
  });
});

describe('removing objects', () => {
  it('removes the named object', () => {
    const next = removeObject(addObject(document, createRectangle({ id: 'a' })), 'a');

    expect(next.objects).toEqual([]);
  });

  it('leaves the remaining objects with their identifiers and order', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a' }),
      createRectangle({ id: 'b' }),
      createRectangle({ id: 'c' }),
    ]);

    const next = removeObject(seeded, 'b');

    expect(next.objects.map((object) => object.id)).toEqual(['a', 'c']);
  });

  it('ignores an unknown identifier', () => {
    const seeded = addObject(document, createRectangle({ id: 'a' }));

    expect(removeObject(seeded, 'missing')).toBe(seeded);
  });

  it('removes several objects at once', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a' }),
      createRectangle({ id: 'b' }),
      createRectangle({ id: 'c' }),
    ]);

    expect(removeObjects(seeded, ['a', 'c']).objects.map((o) => o.id)).toEqual(['b']);
  });
});

describe('object types', () => {
  it('recognises the supported types', () => {
    for (const type of ['rectangle', 'ellipse', 'text']) {
      expect(isCanvasObjectType(type)).toBe(true);
    }
  });

  it('rejects an unrecognised type', () => {
    expect(isCanvasObjectType('polygon')).toBe(false);
    expect(isCanvasObjectType(7)).toBe(false);
  });

  it('creates a rectangle with a corner radius', () => {
    expect(createRectangle({ cornerRadius: 8 })).toMatchObject({
      type: 'rectangle',
      cornerRadius: 8,
    });
  });

  it('creates an ellipse', () => {
    expect(createEllipse().type).toBe('ellipse');
  });

  it('creates a text object carrying its content', () => {
    const text = createText({ text: 'Hello' });

    expect(isTextObject(text)).toBe(true);
    expect(text.text).toBe('Hello');
  });

  it('gives a text object its type settings', () => {
    expect(createText().textSettings).toEqual(DEFAULT_TEXT_SETTINGS);
  });

  it('lets type settings be overridden individually', () => {
    const text = createText({ textSettings: { ...DEFAULT_TEXT_SETTINGS, fontSize: 96 } });

    expect(text.textSettings.fontSize).toBe(96);
    expect(text.textSettings.fontFamily).toBe(DEFAULT_TEXT_SETTINGS.fontFamily);
  });

  it('names a text object after its content so layers stay legible', () => {
    expect(createText({ text: 'A heading' }).name).toBe('A heading');
  });
});

describe('fills', () => {
  it('defaults to a solid fill', () => {
    expect(createRectangle().fill.kind).toBe('solid');
  });

  it('applies a shader fill', () => {
    const object = createRectangle({ id: 'a', fill: shaderFill('sample', { speed: 1 }) });
    const next = addObject(document, object);
    const stored = findObject(next, 'a');

    expect(stored?.fill).toEqual({ kind: 'shader', shaderId: 'sample', values: { speed: 1 } });
  });

  it('records which preset the values came from', () => {
    expect(shaderFill('sample', {}, 'fast').presetId).toBe('fast');
  });

  it('copies the values so a later mutation cannot reach the fill', () => {
    const values = { speed: 1 };
    const fill = shaderFill('sample', values);
    values.speed = 99;

    expect(fill.values.speed).toBe(1);
  });

  it('replaces a solid fill with a shader fill', () => {
    const seeded = addObject(document, createRectangle({ id: 'a' }));
    const next = setFill(seeded, 'a', shaderFill('sample'));

    expect(findObject(next, 'a')?.fill.kind).toBe('shader');
  });
});

describe('two objects sharing a shader stay independent', () => {
  it('changes only the edited object', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'a', fill: shaderFill('sample', { speed: 0.5 }) }),
      createRectangle({ id: 'b', fill: shaderFill('sample', { speed: 0.5 }) }),
    ]);

    const next = setShaderValues(seeded, 'a', { speed: 1.8 });

    const a = findObject(next, 'a')?.fill;
    const b = findObject(next, 'b')?.fill;
    expect(isShaderFill(a!) && a.values.speed).toBe(1.8);
    expect(isShaderFill(b!) && b.values.speed).toBe(0.5);
  });

  it('merges values rather than replacing them', () => {
    const seeded = addObject(
      document,
      createRectangle({ id: 'a', fill: shaderFill('sample', { speed: 0.5, animate: true }) }),
    );

    const next = setShaderValues(seeded, 'a', { speed: 1 });
    const fill = findObject(next, 'a')?.fill;

    expect(isShaderFill(fill!) && fill.values).toEqual({ speed: 1, animate: true });
  });

  it('replaces values outright when a preset is applied', () => {
    const seeded = addObject(
      document,
      createRectangle({ id: 'a', fill: shaderFill('sample', { speed: 0.5, animate: false }) }),
    );

    const next = replaceShaderValues(seeded, 'a', { speed: 1.8 }, 'fast');
    const fill = findObject(next, 'a')?.fill;

    expect(isShaderFill(fill!) && fill.values).toEqual({ speed: 1.8 });
    expect(isShaderFill(fill!) && fill.presetId).toBe('fast');
  });

  it('ignores a value change on a solid fill', () => {
    const seeded = addObject(document, createRectangle({ id: 'a', fill: solidFill('#ffffff') }));

    expect(setShaderValues(seeded, 'a', { speed: 1 })).toBe(seeded);
  });
});

describe('stacking order', () => {
  let seeded: CanvasDocument;

  beforeEach(() => {
    seeded = addObjects(document, [
      createRectangle({ id: 'back' }),
      createRectangle({ id: 'middle' }),
      createRectangle({ id: 'front' }),
    ]);
  });

  const order = (doc: CanvasDocument) => doc.objects.map((object) => object.id);

  it('draws later objects above earlier ones', () => {
    expect(order(seeded)).toEqual(['back', 'middle', 'front']);
  });

  it('raises an object one step', () => {
    expect(order(raiseObject(seeded, 'back'))).toEqual(['middle', 'back', 'front']);
  });

  it('lowers an object one step', () => {
    expect(order(lowerObject(seeded, 'front'))).toEqual(['back', 'front', 'middle']);
  });

  it('brings an object to the front', () => {
    expect(order(bringToFront(seeded, 'back'))).toEqual(['middle', 'front', 'back']);
  });

  it('sends an object to the back', () => {
    expect(order(sendToBack(seeded, 'front'))).toEqual(['front', 'back', 'middle']);
  });

  it('does nothing raising the frontmost object', () => {
    expect(raiseObject(seeded, 'front')).toBe(seeded);
  });

  it('does nothing lowering the backmost object', () => {
    expect(lowerObject(seeded, 'back')).toBe(seeded);
  });

  it('ignores an unknown identifier', () => {
    expect(raiseObject(seeded, 'missing')).toBe(seeded);
  });

  it('raising an object changes which one is drawn on top', () => {
    // The scene is drawn back to front, so the last object is the visible one
    // where they overlap.
    expect(order(seeded).at(-1)).toBe('front');

    const raised = raiseObject(seeded, 'front');
    expect(order(raised).at(-1)).toBe('front');

    const promoted = bringToFront(seeded, 'back');
    expect(order(promoted).at(-1)).toBe('back');
  });

  it('puts a newly added object at the front', () => {
    const next = addObject(seeded, createRectangle({ id: 'newest' }));

    expect(order(next).at(-1)).toBe('newest');
  });
});

describe('updating objects', () => {
  it('applies a partial change', () => {
    const seeded = addObject(document, createRectangle({ id: 'a', x: 0 }));

    expect(findObject(updateObject(seeded, 'a', { x: 50 }), 'a')?.x).toBe(50);
  });

  it('leaves other properties untouched', () => {
    const seeded = addObject(document, createRectangle({ id: 'a', x: 0, y: 10, width: 100 }));
    const next = updateObject(seeded, 'a', { x: 50 });

    expect(findObject(next, 'a')).toMatchObject({ x: 50, y: 10, width: 100 });
  });

  it('ignores an unknown identifier', () => {
    const seeded = addObject(document, createRectangle({ id: 'a' }));

    expect(updateObject(seeded, 'missing', { x: 1 })).toBe(seeded);
  });

  it('does not mutate the original document', () => {
    const seeded = addObject(document, createRectangle({ id: 'a', x: 0 }));
    updateObject(seeded, 'a', { x: 99 });

    expect(findObject(seeded, 'a')?.x).toBe(0);
  });
});

describe('querying the document', () => {
  it('lists only visible objects for drawing', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'shown' }),
      createRectangle({ id: 'hidden', visible: false }),
    ]);

    expect(visibleObjects(seeded).map((o) => o.id)).toEqual(['shown']);
  });

  it('lists the shaders the document references, without duplicates', () => {
    const seeded = addObjects(document, [
      createRectangle({ fill: shaderFill('sample') }),
      createRectangle({ fill: shaderFill('sample') }),
      createRectangle({ fill: shaderFill('other') }),
      createRectangle({ fill: solidFill('#ffffff') }),
    ]);

    expect(referencedShaderIds(seeded).sort()).toEqual(['other', 'sample']);
  });
});

describe('resolving fills against the registry', () => {
  let registry: ShaderRegistry;

  beforeEach(() => {
    registry = new ShaderRegistry();
    registry.register(sampleManifest);
  });

  it('resolves a solid fill', () => {
    expect(resolveFill(solidFill('#ff0000'), registry)).toEqual({
      kind: 'solid',
      color: '#ff0000',
    });
  });

  it('resolves a shader fill to its manifest and complete values', () => {
    const resolved = resolveFill(shaderFill('sample', { speed: 1.5 }), registry);

    expect(resolved.kind).toBe('shader');
    expect(resolved.kind === 'shader' && resolved.values.speed).toBe(1.5);
    // Omitted parameters come back at their declared defaults.
    expect(resolved.kind === 'shader' && resolved.values.animate).toBe(true);
  });

  it('reports an unresolved fill naming the missing shader', () => {
    const resolved = resolveFill(shaderFill('vanished', { speed: 2 }), registry);

    expect(resolved).toEqual({
      kind: 'unresolved',
      shaderId: 'vanished',
      values: { speed: 2 },
    });
  });

  it('keeps the values so they survive the missing state', () => {
    const resolved = resolveFill(shaderFill('vanished', { speed: 2 }), registry);

    expect(resolved.kind === 'unresolved' && resolved.values).toEqual({ speed: 2 });
  });

  it('names the missing shader in a message for the user', () => {
    expect(describeMissingShader('vanished')).toContain('vanished');
  });

  it('lists the objects whose shader is missing, leaving the rest alone', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'fine', fill: shaderFill('sample') }),
      createRectangle({ id: 'broken', fill: shaderFill('vanished') }),
      createRectangle({ id: 'plain', fill: solidFill('#ffffff') }),
    ]);

    const unresolved = unresolvedObjects(seeded, registry);

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.object.id).toBe('broken');
    expect(unresolved[0]?.shaderId).toBe('vanished');
  });

  it('leaves the rest of the document editable', () => {
    const seeded = addObjects(document, [
      createRectangle({ id: 'broken', fill: shaderFill('vanished') }),
      createRectangle({ id: 'fine' }),
    ]);

    const next = updateObject(seeded, 'fine', { x: 42 });

    expect(findObject(next, 'fine')?.x).toBe(42);
    expect(findObject(next, 'broken')).toBeDefined();
  });
});
