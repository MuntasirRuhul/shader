import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParameterValues } from '../../registry/parameterSchema';
import { ShaderRegistry } from '../../registry/ShaderRegistry';
import { manifestWith, sampleManifest } from '../../registry/testFixtures';
import type { RenderItem, RenderScene } from '../renderingPort';
import { FakeGl } from './testDouble';
import { WebGlRenderer } from './WebGlRenderer';

let gl: FakeGl;
let registry: ShaderRegistry;
let surface: { width: number; height: number };

/**
 * A shader that reads uTime, so it needs continuous frames. It declares no
 * parameters of its own, which also lets a test break one shader without
 * breaking this one.
 */
const animatedManifest = manifestWith({
  id: 'animated',
  fragmentSource: 'void main() { outColor = vec4(vec3(sin(uTime)), 1.0); }',
  parameters: [],
  presets: [{ id: 'default', name: 'Default', values: {} }],
});

function item(overrides: Partial<RenderItem> = {}): RenderItem {
  return {
    objectId: 'object-1',
    shaderId: 'sample',
    values: {},
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    opacity: 1,
    ...overrides,
  };
}

function scene(...items: RenderItem[]): RenderScene {
  return { items };
}

function createRenderer(options: Partial<ConstructorParameters<typeof WebGlRenderer>[0]> = {}) {
  return new WebGlRenderer({ gl, surface, registry, ...options });
}

beforeEach(() => {
  gl = new FakeGl();
  surface = { width: 800, height: 600 };
  registry = new ShaderRegistry();
  registry.register(sampleManifest);
  registry.register(animatedManifest);
});

describe('drawing a scene', () => {
  it('draws one quad per item', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item(), item({ objectId: 'object-2' })));
    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(2);
    expect(gl.drawCalls[0]).toEqual({ first: 0, count: 4 });
  });

  it('draws items in the order given, back to front', () => {
    const renderer = createRenderer();
    renderer.setScene(
      scene(
        item({ objectId: 'back', transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0 } }),
        item({
          objectId: 'front',
          transform: { x: 50, y: 50, width: 10, height: 10, rotation: 0 },
        }),
      ),
    );
    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(2);
  });

  it('supplies the elapsed time to the shader', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(1.25);

    expect(gl.lastWriteTo('uTime')?.value).toBe(1.25);
  });

  it('supplies the object size as the resolution', () => {
    const renderer = createRenderer();
    renderer.setScene(
      scene(item({ transform: { x: 0, y: 0, width: 320, height: 240, rotation: 0 } })),
    );
    renderer.renderFrame(0);

    expect(gl.lastWriteTo('uResolution')?.value).toEqual([320, 240]);
  });

  it('supplies the object opacity', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ opacity: 0.4 })));
    renderer.renderFrame(0);

    expect(gl.lastWriteTo('uOpacity')?.value).toBeCloseTo(0.4, 5);
  });

  it('binds the shader parameters', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ values: { speed: 1.75 } })));
    renderer.renderFrame(0);

    expect(gl.lastWriteTo('speed')?.value).toBeCloseTo(1.75, 5);
  });

  it('skips an item whose shader is not registered', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'missing' })));
    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(0);
  });

  it('reports no mask when an item has none', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    expect(gl.lastWriteTo('uHasMask')?.value).toBe(0);
  });
});

describe('advancing a simulation', () => {
  it('gives the advance the resolved parameter values', () => {
    // An object carries only what has been changed about it. An advance
    // reading a parameter nobody touched must still see its declared default.
    const seen: ParameterValues[] = [];
    const reading = manifestWith({
      id: 'reading',
      fragmentSource: 'void main() { outColor = vec4(phase); }',
      presets: [{ id: 'default', name: 'Default', values: {} }],
      simulation: {
        schema: [
          {
            name: 'phase',
            label: 'Phase',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1,
            step: 0.01,
          },
        ],
        initial: { phase: 0 },
        advance: (previous, context) => {
          seen.push(context.parameters);
          return previous;
        },
      },
    });
    registry.register(reading);

    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'reading', values: { speed: 1.25 } })));
    renderer.renderFrame(0, 1 / 60);

    expect(seen[0]?.['speed']).toBe(1.25);
    // Untouched, so its declared default rather than nothing.
    expect(seen[0]?.['background']).toBe('#0a0a0b');
    expect(seen[0]?.['poles']).toHaveLength(1);
  });
});

describe('a shader that fails to compile', () => {
  it('reports the failure with the shader identity and diagnostic', () => {
    const failing = new FakeGl({
      failCompileMatching: /shaderMain/,
      compileDiagnostic: 'ERROR: 0:9: undeclared identifier',
    });
    const onCompileFailure = vi.fn();
    const renderer = new WebGlRenderer({
      gl: failing,
      surface,
      registry,
      observer: { onCompileFailure },
    });

    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    expect(onCompileFailure).toHaveBeenCalledWith({
      shaderId: 'sample',
      stage: 'fragment',
      diagnostic: 'ERROR: 0:9: undeclared identifier',
    });
  });

  it('reports it once rather than on every frame', () => {
    const failing = new FakeGl({ failCompileMatching: /shaderMain/ });
    const onCompileFailure = vi.fn();
    const renderer = new WebGlRenderer({
      gl: failing,
      surface,
      registry,
      observer: { onCompileFailure },
    });

    renderer.setScene(scene(item()));
    renderer.renderFrame(0);
    renderer.renderFrame(0.016);
    renderer.renderFrame(0.032);

    expect(onCompileFailure).toHaveBeenCalledOnce();
  });

  it('keeps drawing the other objects', () => {
    const failing = new FakeGl({ failCompileMatching: /poles_color/ });
    const renderer = new WebGlRenderer({ gl: failing, surface, registry });

    renderer.setScene(scene(item(), item({ objectId: 'other', shaderId: 'animated' })));
    renderer.renderFrame(0);

    // The broken shader draws nothing; the working one still does.
    expect(failing.drawCalls.length).toBeGreaterThan(0);
  });
});

describe('drawing through a viewport', () => {
  /** Clip space back to canvas pixels, so assertions read as positions. */
  function drawnOrigin() {
    const matrix = gl.lastWriteTo('uModel')?.value as number[];
    const clipX = matrix[6] ?? 0;
    const clipY = matrix[7] ?? 0;
    return { x: ((clipX + 1) / 2) * 800, y: ((1 - clipY) / 2) * 600 };
  }

  const object = item({ transform: { x: 100, y: 80, width: 200, height: 120, rotation: 0 } });

  it('draws an object where it is stored when given no viewport', () => {
    // The migration: a runtime nobody tells about a view behaves as it always did.
    const renderer = createRenderer();
    renderer.setScene(scene(object));
    renderer.renderFrame(0);

    expect(drawnOrigin().x).toBeCloseTo(100, 3);
    expect(drawnOrigin().y).toBeCloseTo(80, 3);
  });

  it('translates what it draws by the pan', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(object));
    renderer.setViewport({ zoom: 1, panX: -60, panY: 25 });
    renderer.renderFrame(0);

    expect(drawnOrigin().x).toBeCloseTo(40, 3);
    expect(drawnOrigin().y).toBeCloseTo(105, 3);
  });

  it('magnifies what it draws by the zoom', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(object));
    renderer.setViewport({ zoom: 2, panX: 0, panY: 0 });
    renderer.renderFrame(0);

    expect(drawnOrigin().x).toBeCloseTo(200, 3);
    expect(drawnOrigin().y).toBeCloseTo(160, 3);
  });

  it('keeps the view across frames until it is changed', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(object));
    renderer.setViewport({ zoom: 2, panX: -100, panY: 0 });
    renderer.renderFrame(0);
    renderer.renderFrame(0.016);

    expect(drawnOrigin().x).toBeCloseTo(100, 3);
  });

  it('tells a shader its object canvas size, whatever the magnification', () => {
    // Magnifying enlarges what a shader drew; it does not make it draw
    // something else at a different scale.
    const renderer = createRenderer();
    renderer.setScene(scene(object));

    renderer.renderFrame(0);
    expect(gl.lastWriteTo('uResolution')?.value).toEqual([200, 120]);

    renderer.setViewport({ zoom: 6, panX: -400, panY: -220 });
    renderer.renderFrame(0.016);
    expect(gl.lastWriteTo('uResolution')?.value).toEqual([200, 120]);
  });

  it('gives an advance the pointer unchanged by the view', () => {
    const seen: { x: number; y: number; present: boolean }[] = [];
    const watching = manifestWith({
      id: 'watching',
      fragmentSource: 'void main() { outColor = vec4(phase); }',
      presets: [{ id: 'default', name: 'Default', values: {} }],
      simulation: {
        schema: [
          {
            name: 'phase',
            label: 'Phase',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1,
            step: 0.01,
          },
        ],
        initial: { phase: 0 },
        advance: (previous, context) => {
          seen.push({ ...context.pointer });
          return previous;
        },
      },
    });
    registry.register(watching);

    const renderer = createRenderer();
    renderer.setScene(
      scene(item({ shaderId: 'watching', pointer: { present: true, x: 0.25, y: 0.75 } })),
    );

    renderer.renderFrame(0, 1 / 60);
    renderer.setViewport({ zoom: 5, panX: -910, panY: 340 });
    renderer.renderFrame(0.016, 1 / 60);

    // Object-local, so where the view happens to be is none of its business.
    expect(seen).toEqual([
      { present: true, x: 0.25, y: 0.75 },
      { present: true, x: 0.25, y: 0.75 },
    ]);
  });

  it('reports the pointer absent at any view when it is not over the object', () => {
    const seen: boolean[] = [];
    const watching = manifestWith({
      id: 'watching-absent',
      fragmentSource: 'void main() { outColor = vec4(phase); }',
      presets: [{ id: 'default', name: 'Default', values: {} }],
      simulation: {
        schema: [
          {
            name: 'phase',
            label: 'Phase',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1,
            step: 0.01,
          },
        ],
        initial: { phase: 0 },
        advance: (previous, context) => {
          seen.push(context.pointer.present);
          return previous;
        },
      },
    });
    registry.register(watching);

    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'watching-absent' })));
    renderer.setViewport({ zoom: 3, panX: -200, panY: -100 });
    renderer.renderFrame(0, 1 / 60);

    expect(seen).toEqual([false]);
  });

  it('costs a redraw, not a rebuild: no resource is touched by a view change', () => {
    const mask = { source: {} as TexImageSource, revision: 1 };
    const renderer = createRenderer();
    renderer.setScene(scene(item({ mask })));
    renderer.renderFrame(0);

    const texturesBefore = gl.liveTextures;
    const deletedBefore = gl.deletedTextures.length;

    // A pan, frame by frame, as a drag produces.
    for (let step = 0; step < 30; step += 1) {
      renderer.setViewport({ zoom: 1, panX: -step, panY: 0 });
      renderer.renderFrame(step * 0.016);
    }

    expect(gl.liveTextures).toBe(texturesBefore);
    expect(gl.deletedTextures).toHaveLength(deletedBefore);
    expect(renderer.maskCount).toBe(1);
  });

  it('ignores a view set after disposal', () => {
    const renderer = createRenderer();
    renderer.dispose();

    expect(() => {
      renderer.setViewport({ zoom: 2, panX: 10, panY: 10 });
    }).not.toThrow();
  });
});

describe('resizing the drawing surface', () => {
  it('sizes the buffer to the CSS size at ratio one', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 1 });
    renderer.resize(400, 300);

    expect(surface).toEqual({ width: 400, height: 300 });
  });

  it('scales the buffer by the device pixel ratio', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 2 });
    renderer.resize(400, 300);

    expect(surface).toEqual({ width: 800, height: 600 });
  });

  it('caps an extreme device pixel ratio', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 8 });
    renderer.resize(400, 300);

    expect(surface).toEqual({ width: 800, height: 600 });
  });

  it('maps object coordinates through the CSS size, not the drawing buffer', () => {
    // On a high-density display the buffer is larger than the CSS box. Mapping
    // objects through the buffer would draw everything at 1/ratio scale.
    const renderer = createRenderer({ devicePixelRatio: () => 2 });
    renderer.resize(800, 600);
    renderer.setScene(
      scene(item({ transform: { x: 0, y: 0, width: 800, height: 600, rotation: 0 } })),
    );
    renderer.renderFrame(0);

    const matrix = gl.lastWriteTo('uModel')?.value as number[];
    // An object filling the CSS box must fill clip space: the unit quad maps
    // from -1 to +1 across both axes.
    const originX = matrix[6] ?? 0;
    const originY = matrix[7] ?? 0;
    const spanX = matrix[0] ?? 0;

    expect(originX).toBeCloseTo(-1, 5);
    expect(originY).toBeCloseTo(1, 5);
    expect(spanX).toBeCloseTo(2, 5);
  });

  it('renders into the resized viewport', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 1 });
    renderer.resize(500, 250);
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    expect(surface).toEqual({ width: 500, height: 250 });
    expect(gl.drawCalls).toHaveLength(1);
  });
});

describe('context loss and restore', () => {
  it('stops issuing draws while the context is lost', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    gl.contextLost = true;

    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(0);
  });

  it('reports the lost status so the user can be told', () => {
    const onStatusChange = vi.fn();
    const renderer = createRenderer({ observer: { onStatusChange } });
    gl.contextLost = true;

    renderer.renderFrame(0);

    expect(onStatusChange).toHaveBeenCalledWith({ kind: 'context-lost' });
    expect(renderer.status).toEqual({ kind: 'context-lost' });
  });

  it('does not delete objects the driver has already discarded', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    renderer.handleContextLost();

    expect(gl.deletedPrograms).toHaveLength(0);
    expect(renderer.programCount).toBe(0);
  });

  it('recreates its resources on restore', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);
    renderer.handleContextLost();

    gl.contextLost = false;
    renderer.handleContextRestored();
    renderer.renderFrame(0);

    expect(renderer.status).toEqual({ kind: 'ready' });
    expect(renderer.programCount).toBe(1);
  });

  it('leaves the scene and its parameter values unchanged across loss and restore', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ values: { speed: 1.5 } })));
    renderer.renderFrame(0);

    renderer.handleContextLost();
    gl.contextLost = false;
    renderer.handleContextRestored();
    gl.reset();
    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(1);
    expect(gl.lastWriteTo('speed')?.value).toBeCloseTo(1.5, 5);
  });

  it('reports ready again after restore', () => {
    const onStatusChange = vi.fn();
    const renderer = createRenderer({ observer: { onStatusChange } });
    renderer.handleContextLost();
    renderer.handleContextRestored();

    expect(onStatusChange).toHaveBeenLastCalledWith({ kind: 'ready' });
  });
});

describe('releasing resources', () => {
  it('releases the mask texture of a removed object', () => {
    const mask = { source: {} as TexImageSource, revision: 1 };
    const renderer = createRenderer();
    renderer.setScene(scene(item({ mask })));
    renderer.renderFrame(0);
    expect(renderer.maskCount).toBe(1);

    renderer.setScene(scene());

    expect(renderer.maskCount).toBe(0);
    expect(gl.deletedTextures).toHaveLength(1);
  });

  it('keeps the mask of an object that is still present', () => {
    const mask = { source: {} as TexImageSource, revision: 1 };
    const renderer = createRenderer();
    renderer.setScene(scene(item({ mask }), item({ objectId: 'other', mask })));
    renderer.renderFrame(0);

    renderer.setScene(scene(item({ mask })));

    expect(renderer.maskCount).toBe(1);
    expect(gl.deletedTextures).toHaveLength(1);
  });

  it('releases the program for an unused shader', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);
    expect(renderer.programCount).toBe(1);

    renderer.releaseShader('sample');

    expect(renderer.programCount).toBe(0);
    expect(gl.deletedPrograms).toHaveLength(1);
  });

  it('re-uploads a mask only when its revision changes', () => {
    const renderer = createRenderer();
    const mask = { source: {} as TexImageSource, revision: 1 };
    renderer.setScene(scene(item({ mask })));

    renderer.renderFrame(0);
    renderer.renderFrame(0.016);

    // One texture created, and no second one for the unchanged mask.
    expect(gl.liveTextures).toBe(1);
  });
});

describe('teardown', () => {
  it('releases every graphics resource', () => {
    const mask = { source: {} as TexImageSource, revision: 1 };
    const renderer = createRenderer();
    renderer.setScene(scene(item({ mask }), item({ objectId: 'b', shaderId: 'animated' })));
    renderer.renderFrame(0);

    renderer.dispose();

    expect(gl.livePrograms).toBe(0);
    expect(gl.liveTextures).toBe(0);
    expect(gl.liveVertexArrays).toBe(0);
  });

  it('draws nothing more once disposed', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.dispose();
    gl.reset();

    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(0);
  });

  it('is safe to dispose twice', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    renderer.dispose();
    expect(() => {
      renderer.dispose();
    }).not.toThrow();
    expect(gl.livePrograms).toBe(0);
  });

  it('ignores a scene set after disposal', () => {
    const renderer = createRenderer();
    renderer.dispose();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    expect(gl.drawCalls).toHaveLength(0);
  });
});

describe('knowing when frames are needed', () => {
  it('reports animated content when a shader reads time', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'animated' })));

    expect(renderer.hasAnimatedContent).toBe(true);
  });

  it('reports animated content for a shader that owns state', () => {
    // Its motion is in the advance, not in the program, so nothing about its
    // source says it moves.
    const simulated = manifestWith({
      id: 'simulated',
      fragmentSource: 'void main() { outColor = vec4(phase); }',
      parameters: [],
      presets: [{ id: 'default', name: 'Default', values: {} }],
      simulation: {
        schema: [
          {
            name: 'phase',
            label: 'Phase',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 1,
            step: 0.01,
          },
        ],
        initial: { phase: 0 },
        advance: (previous) => previous,
      },
    });
    registry.register(simulated);

    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'simulated' })));

    expect(renderer.hasAnimatedContent).toBe(true);
  });

  it('reports no animated content for a still shader', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));

    expect(renderer.hasAnimatedContent).toBe(false);
  });

  it('reports no animated content for an empty scene', () => {
    expect(createRenderer().hasAnimatedContent).toBe(false);
  });
});
