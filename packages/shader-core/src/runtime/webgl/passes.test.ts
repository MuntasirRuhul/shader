import { beforeEach, describe, expect, it } from 'vitest';
import type { PassInput, ShaderPass } from '../../registry/manifest';
import { ShaderRegistry } from '../../registry/ShaderRegistry';
import { manifestWith, sampleManifest } from '../../registry/testFixtures';
import type { RenderItem, RenderScene } from '../renderingPort';
import { FakeGl } from './testDouble';
import { WebGlRenderer } from './WebGlRenderer';

/**
 * Multi-pass rendering, which is only observable through where each draw
 * landed and what it sampled. The double records both.
 */

let gl: FakeGl;
let registry: ShaderRegistry;
let surface: { width: number; height: number };

function pass(name: string, reads?: readonly PassInput[]): ShaderPass {
  return {
    name,
    fragmentSource: `void main() { outColor = vec4(${String(name.length)}.0); }`,
    ...(reads ? { reads } : {}),
  };
}

/** Field then draw: the shape the ink studio and the water ripple both take. */
const twoPass = manifestWith({
  id: 'two-pass',
  parameters: [],
  presets: [{ id: 'default', name: 'Default', values: {} }],
  passes: [pass('field'), pass('draw', [{ uniform: 'uField', pass: 'field' }])],
});

/** A pass reading what it wrote last frame — a simulation held on the GPU. */
const feedback = manifestWith({
  id: 'feedback',
  parameters: [],
  presets: [{ id: 'default', name: 'Default', values: {} }],
  passes: [
    pass('height', [{ uniform: 'uPrevious', pass: 'height', previousFrame: true }]),
    pass('refract', [{ uniform: 'uHeight', pass: 'height' }]),
  ],
});

/** Three passes, so a fill can shed targets without shedding all of them. */
const threePass = manifestWith({
  id: 'three-pass',
  parameters: [],
  presets: [{ id: 'default', name: 'Default', values: {} }],
  passes: [
    pass('blur'),
    pass('glow', [{ uniform: 'uBlur', pass: 'blur' }]),
    pass('composite', [{ uniform: 'uGlow', pass: 'glow' }]),
  ],
});

function item(overrides: Partial<RenderItem> = {}): RenderItem {
  return {
    objectId: 'object-1',
    shaderId: 'two-pass',
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
  registry.register(twoPass);
  registry.register(feedback);
  registry.register(threePass);
});

describe('a shader declaring no passes', () => {
  it('draws straight to the canvas, as it did before passes existed', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'sample' })));
    renderer.renderFrame(0);

    expect(gl.draws).toHaveLength(1);
    expect(gl.draws[0]?.target).toBeNull();
  });

  it('allocates no intermediate target', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'sample' })));
    renderer.renderFrame(0);

    expect(renderer.targetCount).toBe(0);
    expect(gl.liveFramebuffers).toBe(0);
  });
});

describe('rendering passes in order', () => {
  it('runs each pass once per frame', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    expect(gl.draws).toHaveLength(2);
  });

  it('draws only the last pass onto the canvas', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    // The first lands in a target; only the second reaches the object.
    expect(gl.draws[0]?.target).not.toBeNull();
    expect(gl.draws[1]?.target).toBeNull();
  });

  it('gives a pass reading an earlier one that pass current-frame output', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    const fieldTarget = gl.draws[0]?.target;
    expect(fieldTarget).toBeDefined();
    const written = fieldTarget ? gl.textureOf(fieldTarget) : null;

    // The second pass samples exactly the texture the first just wrote.
    expect(gl.draws[1]?.textures.get(2)).toBe(written);
  });

  it('gives each pass the object size as its resolution', () => {
    const renderer = createRenderer();
    renderer.setScene(
      scene(item({ transform: { x: 0, y: 0, width: 320, height: 240, rotation: 0 } })),
    );
    renderer.renderFrame(0);

    expect(
      gl.writesTo('uResolution').every((write) => {
        const value = write.value as number[];
        return value[0] === 320 && value[1] === 240;
      }),
    ).toBe(true);
  });

  it('applies the object opacity once, when the last pass reaches the canvas', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ opacity: 0.25 })));
    renderer.renderFrame(0);

    const written = gl.writesTo('uOpacity').map((write) => write.value);
    expect(written).toEqual([1, 0.25]);
  });

  it('keeps drawing the other objects when a pass fails to compile', () => {
    const failing = new FakeGl({ failCompileMatching: /vec4\(5\.0\)/ });
    const renderer = new WebGlRenderer({ gl: failing, surface, registry });

    renderer.setScene(scene(item(), item({ objectId: 'other', shaderId: 'sample' })));
    renderer.renderFrame(0);

    // The broken shader draws nothing; the working one still reaches the canvas.
    expect(failing.draws).toHaveLength(1);
    expect(failing.draws[0]?.target).toBeNull();
  });
});

describe('a pass reading its own previous frame', () => {
  it('receives a cleared target on the first frame', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'feedback' })));
    renderer.renderFrame(0);

    const sampled = gl.draws[0]?.textures.get(2);
    expect(sampled).not.toBeNull();
    // Both buffers were cleared when allocated, so nothing undefined is read.
    expect(gl.clears.length).toBeGreaterThanOrEqual(2);
  });

  it('receives the previous frame output rather than what it is writing', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'feedback' })));
    renderer.renderFrame(0);
    gl.reset();
    renderer.renderFrame(0.016);

    const writtenTo = gl.draws[0]?.target;
    const read = gl.draws[0]?.textures.get(2);
    expect(writtenTo).toBeDefined();
    expect(read).not.toBe(writtenTo ? gl.textureOf(writtenTo) : null);
  });

  it('swaps targets, so the frame after reads what this frame wrote', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'feedback' })));
    renderer.renderFrame(0);

    const firstFrameOutput = gl.draws[0]?.target;
    gl.reset();
    renderer.renderFrame(0.016);

    const read = gl.draws[0]?.textures.get(2);
    expect(read).toBe(firstFrameOutput ? gl.textureOf(firstFrameOutput) : null);
  });

  it('holds two buffers for the self-reading pass, and the shader sees one', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'feedback' })));
    renderer.renderFrame(0);

    // The refracting pass draws to the canvas, so only the height field has a
    // target — doubled underneath, which the shader never sees.
    expect(renderer.targetCount).toBe(1);
    expect(gl.liveFramebuffers).toBe(2);
  });

  it('composites the last pass onto the object when something reads it', () => {
    const selfReadingLast = manifestWith({
      id: 'self-last',
      parameters: [],
      presets: [{ id: 'default', name: 'Default', values: {} }],
      passes: [pass('trail', [{ uniform: 'uPrevious', pass: 'trail', previousFrame: true }])],
    });
    registry.register(selfReadingLast);

    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'self-last' })));
    renderer.renderFrame(0);

    // The pass keeps its output for next frame, and a compositing draw still
    // puts it on the canvas.
    expect(gl.draws).toHaveLength(2);
    expect(gl.draws[0]?.target).not.toBeNull();
    expect(gl.draws[1]?.target).toBeNull();
  });
});

describe('state and passes together', () => {
  /**
   * The two capabilities composing rather than merely coexisting: the field
   * pass draws from simulated positions into a target, and the treatment pass
   * reads that target — which is the shape the ink studio takes.
   */
  const both = manifestWith({
    id: 'both',
    parameters: [],
    presets: [{ id: 'default', name: 'Default', values: {} }],
    simulation: {
      schema: [
        {
          name: 'travelled',
          label: 'Travelled',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 1000,
          step: 0.001,
        },
      ],
      initial: { travelled: 0 },
      advance: (previous, context) => ({
        travelled: (previous['travelled'] as number) + context.dt,
      }),
    },
    passes: [
      { name: 'field', fragmentSource: 'void main() { outColor = vec4(travelled); }' },
      {
        name: 'treat',
        fragmentSource: 'void main() { outColor = texture(uField, vUv) * travelled; }',
        reads: [{ uniform: 'uField', pass: 'field' }],
      },
    ],
  });

  beforeEach(() => {
    registry.register(both);
  });

  it('gives every pass the advancing state', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'both' })));
    renderer.renderFrame(0, 0.5);
    renderer.renderFrame(0.5, 0.5);

    // Two passes a frame, four writes, all reaching one second of travel.
    const written = gl.writesTo('travelled').map((write) => write.value);
    expect(written).toHaveLength(4);
    expect(written.at(-1)).toBeCloseTo(1, 5);
    expect(written.at(-2)).toBeCloseTo(1, 5);
  });

  it('advances once per frame however many passes read the state', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'both' })));
    renderer.renderFrame(0, 1);

    // One advance, not one per pass: both passes see the same instant.
    const written = gl.writesTo('travelled').map((write) => write.value);
    expect(written).toEqual([1, 1]);
  });

  it('still renders the passes in order, through a target', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'both' })));
    renderer.renderFrame(0, 1 / 60);

    expect(gl.draws).toHaveLength(2);
    expect(gl.draws[0]?.target).not.toBeNull();
    expect(gl.draws[1]?.target).toBeNull();
  });

  it('keeps each object own state and own targets', () => {
    const renderer = createRenderer();
    renderer.setScene(
      scene(item({ shaderId: 'both' }), item({ objectId: 'object-2', shaderId: 'both' })),
    );
    renderer.renderFrame(0, 0.25);

    expect(renderer.targetCount).toBe(2);
    expect(gl.draws).toHaveLength(4);
  });
});

describe('a document reopened after a reload', () => {
  /**
   * State is per-session and never persisted, so a reopened document starts
   * from what the manifest declares. That is what the specification asks for —
   * correct for drifting motion, and worth knowing before someone expects a
   * saved arrangement to come back where they left it.
   */
  const drifting = manifestWith({
    id: 'drifting',
    parameters: [],
    presets: [{ id: 'default', name: 'Default', values: {} }],
    simulation: {
      schema: [
        {
          name: 'travelled',
          label: 'Travelled',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 1000,
          step: 0.001,
        },
      ],
      initial: { travelled: 0 },
      advance: (previous, context) => ({
        travelled: (previous['travelled'] as number) + context.dt,
      }),
    },
  });

  it('starts from the declared initial state rather than where it was left', () => {
    registry.register(drifting);

    const before = createRenderer();
    before.setScene(scene(item({ shaderId: 'drifting' })));
    for (let frame = 0; frame < 10; frame += 1) before.renderFrame(frame, 1);
    expect(gl.lastWriteTo('travelled')?.value).toBeCloseTo(10, 5);
    before.dispose();

    // The same document, opened again: a new surface over the same scene.
    gl.reset();
    const after = createRenderer();
    after.setScene(scene(item({ shaderId: 'drifting' })));
    after.renderFrame(0, 1);

    expect(gl.lastWriteTo('travelled')?.value).toBeCloseTo(1, 5);
  });
});

describe('targets follow the object', () => {
  it('sizes a target to the object, in drawing-buffer pixels', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 1 });
    renderer.resize(800, 600);
    renderer.setScene(
      scene(item({ transform: { x: 0, y: 0, width: 320, height: 240, rotation: 0 } })),
    );
    renderer.renderFrame(0);

    expect(renderer.targetSize('object-1', 'field')).toEqual({ width: 320, height: 240 });
  });

  it('scales a target by the device pixel ratio, as the canvas is', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 2 });
    renderer.resize(400, 300);
    renderer.setScene(
      scene(item({ transform: { x: 0, y: 0, width: 200, height: 100, rotation: 0 } })),
    );
    renderer.renderFrame(0);

    expect(renderer.targetSize('object-1', 'field')).toEqual({ width: 400, height: 200 });
  });

  it('resizes the target when the object is resized', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 1 });
    renderer.resize(800, 600);
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    renderer.setScene(
      scene(item({ transform: { x: 0, y: 0, width: 250, height: 90, rotation: 0 } })),
    );
    renderer.renderFrame(0.016);

    expect(renderer.targetSize('object-1', 'field')).toEqual({ width: 250, height: 90 });
    // The old storage went with it rather than being left behind.
    expect(gl.deletedFramebuffers).toHaveLength(1);
  });

  it('renders a pass into the whole of its target', () => {
    const renderer = createRenderer({ devicePixelRatio: () => 1 });
    renderer.resize(800, 600);
    renderer.setScene(
      scene(item({ transform: { x: 40, y: 60, width: 320, height: 240, rotation: 0 } })),
    );
    renderer.renderFrame(0);

    expect(gl.draws[0]?.viewport).toEqual({ width: 320, height: 240 });
    // The canvas draw goes back to the full drawing buffer.
    expect(gl.draws[1]?.viewport).toEqual({ width: 800, height: 600 });
  });
});

describe('releasing intermediate targets', () => {
  it('releases the targets of a deleted object', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);
    expect(renderer.targetCount).toBe(1);

    renderer.setScene(scene());

    expect(renderer.targetCount).toBe(0);
    expect(gl.liveFramebuffers).toBe(0);
  });

  it('keeps the targets of an object that is still there', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item(), item({ objectId: 'other' })));
    renderer.renderFrame(0);
    expect(renderer.targetCount).toBe(2);

    renderer.setScene(scene(item()));

    expect(renderer.targetCount).toBe(1);
  });

  it('releases the targets a fill no longer needs', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'three-pass' })));
    renderer.renderFrame(0);
    expect(renderer.targetCount).toBe(2);

    // The same object, refilled with a shader needing one target.
    renderer.setScene(scene(item({ shaderId: 'two-pass' })));
    renderer.renderFrame(0.016);

    expect(renderer.targetCount).toBe(1);
    expect(gl.liveFramebuffers).toBe(1);
  });

  it('releases every target when a fill needs none', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item({ shaderId: 'feedback' })));
    renderer.renderFrame(0);
    expect(renderer.targetCount).toBe(1);

    renderer.setScene(scene(item({ shaderId: 'sample' })));

    expect(renderer.targetCount).toBe(0);
    expect(gl.liveFramebuffers).toBe(0);
  });

  it('releases every target on teardown', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item(), item({ objectId: 'other', shaderId: 'feedback' })));
    renderer.renderFrame(0);

    renderer.dispose();

    expect(gl.liveFramebuffers).toBe(0);
    expect(gl.liveTextures).toBe(0);
  });

  it('does not delete targets the driver has already discarded', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);

    renderer.handleContextLost();

    expect(gl.deletedFramebuffers).toHaveLength(0);
    expect(renderer.targetCount).toBe(0);
  });

  it('allocates targets again after the context is restored', () => {
    const renderer = createRenderer();
    renderer.setScene(scene(item()));
    renderer.renderFrame(0);
    renderer.handleContextLost();

    gl.contextLost = false;
    renderer.handleContextRestored();
    renderer.renderFrame(0.016);

    expect(renderer.targetCount).toBe(1);
  });
});
