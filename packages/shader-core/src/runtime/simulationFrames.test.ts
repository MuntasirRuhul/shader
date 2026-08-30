import { beforeEach, describe, expect, it } from 'vitest';
import { ShaderRegistry } from '../registry/ShaderRegistry';
import type { AdvanceContext, SimulationState } from '../registry/simulation';
import { manifestWith } from '../registry/testFixtures';
import { AnimationLoop, type LoopEnvironment } from './AnimationLoop';
import { FakeGl } from './webgl/testDouble';
import { WebGlRenderer } from './webgl/WebGlRenderer';

/**
 * The loop and the renderer composed, which is the path a shader's motion
 * actually takes.
 *
 * Each is well covered on its own, and that is exactly how a real defect got
 * through: the loop offered the frame delta, the renderer needed it, and the
 * code between them dropped it — leaving every simulation frozen on its first
 * frame while both halves passed their own tests.
 */

/** A frame scheduler under the test's control, so time is exact. */
class FakeHost {
  private pending: ((timestamp: number) => void) | null = null;
  private handle = 1;
  time = 0;

  readonly environment: LoopEnvironment = {
    requestFrame: (callback) => {
      this.pending = callback;
      return this.handle++;
    },
    cancelFrame: () => {
      this.pending = null;
    },
    now: () => this.time,
    isVisible: () => true,
    onVisibilityChange: () => () => undefined,
  };

  run(frames: number, deltaMs: number): void {
    for (let frame = 0; frame < frames; frame += 1) {
      this.time += deltaMs;
      const callback = this.pending;
      this.pending = null;
      callback?.(this.time);
    }
  }
}

/** A shader whose only motion is in its advance, as the metaball's is. */
const drifting = manifestWith({
  id: 'drifting',
  fragmentSource: 'void main() { outColor = vec4(travelled, 0.0, 0.0, 1.0); }',
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
    advance: (previous: SimulationState, context: AdvanceContext): SimulationState => ({
      travelled: (previous['travelled'] as number) + context.dt,
    }),
  },
});

let gl: FakeGl;
let renderer: WebGlRenderer;
let host: FakeHost;
let loop: AnimationLoop;

beforeEach(() => {
  gl = new FakeGl();
  const registry = new ShaderRegistry();
  registry.register(drifting);

  renderer = new WebGlRenderer({
    gl,
    surface: { width: 800, height: 600 },
    registry,
  });
  renderer.setScene({
    items: [
      {
        objectId: 'object-1',
        shaderId: 'drifting',
        values: {},
        transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
        opacity: 1,
      },
    ],
  });

  host = new FakeHost();
  loop = new AnimationLoop({
    render: (elapsed, dt) => {
      renderer.renderFrame(elapsed, dt);
    },
    needsAnimation: () => renderer.hasAnimatedContent,
    environment: host.environment,
  });
});

describe('a shader whose motion is only in its advance', () => {
  it('keeps the loop running, though nothing in its program reads the clock', () => {
    loop.reconcile();

    expect(loop.isRunning).toBe(true);
  });

  it('advances by real seconds, frame after frame', () => {
    loop.reconcile();
    host.run(60, 1000 / 60);

    // One second of frames, so one second of travel.
    expect(gl.lastWriteTo('travelled')?.value).toBeCloseTo(1, 1);
  });

  it('advances by the same amount at half the frame rate', () => {
    loop.reconcile();
    host.run(30, 1000 / 30);

    expect(gl.lastWriteTo('travelled')?.value).toBeCloseTo(1, 1);
  });

  it('does not advance on a one-off redraw', () => {
    // A redraw after a parameter change must not step the simulation.
    loop.renderOnce();
    loop.renderOnce();

    expect(gl.lastWriteTo('travelled')?.value).toBe(0);
  });
});

describe('the view moves while the work keeps running', () => {
  it('steps the simulation by real time throughout a pan', () => {
    loop.reconcile();

    // A pan of one step per frame, for a second of frames.
    for (let frame = 0; frame < 60; frame += 1) {
      renderer.setViewport({ zoom: 1, panX: -frame * 4, panY: frame });
      host.run(1, 1000 / 60);
    }

    // Moving the view is not time passing, and not time standing still either.
    expect(gl.lastWriteTo('travelled')?.value).toBeCloseTo(1, 1);
  });

  it('steps it by the same amount whether the view moves or not', () => {
    loop.reconcile();
    // The loop's first tick has no previous timestamp to measure against, so
    // it advances nothing. Primed here, both halves count the same frames.
    host.run(1, 1000 / 60);

    const start = gl.lastWriteTo('travelled')?.value as number;
    host.run(30, 1000 / 60);
    const still = (gl.lastWriteTo('travelled')?.value as number) - start;

    const before = gl.lastWriteTo('travelled')?.value as number;
    for (let frame = 0; frame < 30; frame += 1) {
      renderer.setViewport({ zoom: 1 + frame * 0.1, panX: -frame * 7, panY: 0 });
      host.run(1, 1000 / 60);
    }
    const moved = (gl.lastWriteTo('travelled')?.value as number) - before;

    expect(moved).toBeCloseTo(still, 5);
  });

  it('moves what it draws while it draws it', () => {
    loop.reconcile();
    host.run(1, 1000 / 60);
    const before = [...(gl.lastWriteTo('uModel')?.value as number[])];

    renderer.setViewport({ zoom: 3, panX: -220, panY: 90 });
    host.run(1, 1000 / 60);
    const after = [...(gl.lastWriteTo('uModel')?.value as number[])];

    expect(after).not.toEqual(before);
  });

  it('tells the shader the same object size throughout', () => {
    loop.reconcile();

    const sizes = new Set<string>();
    for (let frame = 0; frame < 20; frame += 1) {
      renderer.setViewport({ zoom: 0.5 + frame * 0.4, panX: -frame * 12, panY: frame * 3 });
      host.run(1, 1000 / 60);
      sizes.add(JSON.stringify(gl.lastWriteTo('uResolution')?.value));
    }

    // One size, whatever the magnification: the artwork is magnified, not
    // redrawn at a different scale.
    expect(sizes.size).toBe(1);
  });

  it('keeps requesting frames while the view moves', () => {
    loop.reconcile();
    renderer.setViewport({ zoom: 2, panX: -50, panY: -50 });
    host.run(10, 1000 / 60);

    expect(loop.isRunning).toBe(true);
  });
});
