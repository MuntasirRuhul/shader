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
