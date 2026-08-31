import { beforeEach, describe, expect, it } from 'vitest';
import { ShaderRegistry } from '../../registry/ShaderRegistry';
import { manifestWith } from '../../registry/testFixtures';
import type { RenderItem, RenderScene, TexSource } from '../renderingPort';
import { FakeGl } from './testDouble';
import { WebGlRenderer } from './WebGlRenderer';

/**
 * A picture a shader was pointed at, which the renderer binds exactly as it
 * binds a mask: a unit of its own, a flag saying whether it is there at all,
 * and the picture's own dimensions for a shader that fits it.
 */

let gl: FakeGl;
let registry: ShaderRegistry;

const withPicture = manifestWith({
  id: 'with-picture',
  fragmentSource: 'void main() { outColor = texture(source, vUv); }',
  parameters: [
    { name: 'source', label: 'Picture', type: 'image', defaultValue: '' },
    {
      name: 'amount',
      label: 'Amount',
      type: 'number',
      defaultValue: 1,
      min: 0,
      max: 2,
      step: 0.1,
    },
  ],
  presets: [{ id: 'default', name: 'Default', values: {} }],
});

/** A decoded picture, as the image cache hands one over. */
function picture(width: number, height: number, revision = 1): TexSource {
  return { source: { width, height } as unknown as TexImageSource, revision };
}

function item(overrides: Partial<RenderItem> = {}): RenderItem {
  return {
    objectId: 'object-1',
    shaderId: 'with-picture',
    values: {},
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    opacity: 1,
    ...overrides,
  };
}

function scene(...items: RenderItem[]): RenderScene {
  return { items };
}

function render(items: RenderItem[]): WebGlRenderer {
  const renderer = new WebGlRenderer({
    gl,
    surface: { width: 200, height: 200 },
    registry,
    devicePixelRatio: () => 1,
  });
  renderer.resize(200, 200);
  renderer.setScene(scene(...items));
  renderer.renderFrame(0, 0.016);
  return renderer;
}

beforeEach(() => {
  gl = new FakeGl();
  registry = new ShaderRegistry();
  registry.registerOrThrow(withPicture);
});

describe('a shader with a picture of its own', () => {
  it('declares a sampler, a presence flag, and the picture size', () => {
    render([item({ parameterImages: { source: picture(800, 600) } })]);

    const source = gl.compiledSources.join('\n');
    expect(source).toContain('uniform sampler2D source;');
    expect(source).toContain('uniform bool source_present;');
    expect(source).toContain('uniform vec2 source_size;');
  });

  it('binds the picture and reports it present, with its own dimensions', () => {
    render([item({ parameterImages: { source: picture(800, 600) } })]);

    expect(gl.lastWriteTo('source_present')?.value).toBe(1);
    expect(gl.lastWriteTo('source_size')?.value).toEqual([800, 600]);
    // The mask holds unit 0 and the object's own picture unit 1, so a
    // shader's picture takes the first unit after them.
    expect(gl.lastWriteTo('source')?.value).toBe(2);
  });

  it('reports absent when nothing has been chosen', () => {
    render([item()]);

    expect(gl.lastWriteTo('source_present')?.value).toBe(0);
    expect(gl.lastWriteTo('source_size')?.value).toEqual([0, 0]);
  });

  it('reports absent while the file is still decoding', () => {
    // The value is set; the cache has not produced the pixels yet.
    render([item({ values: { source: 'data:image/png;base64,AAAA' } })]);

    expect(gl.lastWriteTo('source_present')?.value).toBe(0);
  });

  it('uploads again only when the picture has actually changed', () => {
    const renderer = render([item({ parameterImages: { source: picture(4, 4, 1) } })]);
    const afterFirst = gl.uploads;

    renderer.setScene(scene(item({ parameterImages: { source: picture(4, 4, 1) } })));
    renderer.renderFrame(0.016, 0.016);
    expect(gl.uploads).toBe(afterFirst);

    renderer.setScene(scene(item({ parameterImages: { source: picture(4, 4, 2) } })));
    renderer.renderFrame(0.032, 0.016);
    expect(gl.uploads).toBeGreaterThan(afterFirst);
  });

  it('keeps two objects pointed at different pictures apart', () => {
    const renderer = render([
      item({ parameterImages: { source: picture(4, 4) } }),
      item({ objectId: 'object-2', parameterImages: { source: picture(8, 8) } }),
    ]);

    expect(renderer.parameterImageCount).toBe(2);
  });

  it('releases a picture when its object leaves the scene', () => {
    const renderer = render([item({ parameterImages: { source: picture(4, 4) } })]);
    expect(renderer.parameterImageCount).toBe(1);

    renderer.setScene(scene());
    renderer.renderFrame(0.016, 0.016);

    expect(renderer.parameterImageCount).toBe(0);
  });
});
