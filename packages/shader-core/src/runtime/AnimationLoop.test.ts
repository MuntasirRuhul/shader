import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationLoop, MAX_FRAME_DELTA_MS, type LoopEnvironment } from './AnimationLoop';

/**
 * A controllable frame scheduler and clock, so frame timing and visibility can
 * be driven exactly rather than waited on.
 */
class FakeHost {
  private pending: ((timestamp: number) => void) | null = null;
  private nextHandle = 1;
  private cancelled: number[] = [];
  time = 0;
  visible = true;
  private visibilityListeners = new Set<() => void>();

  readonly environment: LoopEnvironment = {
    requestFrame: (callback) => {
      this.pending = callback;
      return this.nextHandle++;
    },
    cancelFrame: (handle) => {
      this.cancelled.push(handle);
      this.pending = null;
    },
    now: () => this.time,
    isVisible: () => this.visible,
    onVisibilityChange: (listener) => {
      this.visibilityListeners.add(listener);
      return () => this.visibilityListeners.delete(listener);
    },
  };

  get hasPendingFrame(): boolean {
    return this.pending !== null;
  }

  /** Runs the scheduled frame after advancing the clock by `deltaMs`. */
  advance(deltaMs: number): void {
    this.time += deltaMs;
    const callback = this.pending;
    this.pending = null;
    callback?.(this.time);
  }

  /** Runs `count` frames, each `deltaMs` apart. */
  run(count: number, deltaMs: number): void {
    for (let i = 0; i < count; i += 1) this.advance(deltaMs);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const listener of this.visibilityListeners) listener();
  }
}

let host: FakeHost;
let render: ReturnType<typeof vi.fn>;
let animating: boolean;

function createLoop() {
  return new AnimationLoop({
    render: render as unknown as (elapsed: number) => void,
    needsAnimation: () => animating,
    environment: host.environment,
  });
}

beforeEach(() => {
  host = new FakeHost();
  render = vi.fn();
  animating = true;
});

describe('the loop runs while something needs animating', () => {
  it('starts on reconcile', () => {
    const loop = createLoop();
    loop.reconcile();

    expect(loop.isRunning).toBe(true);
    expect(host.hasPendingFrame).toBe(true);
  });

  it('draws a frame per scheduled callback', () => {
    const loop = createLoop();
    loop.reconcile();
    host.run(3, 16);

    expect(loop.frames).toBe(3);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('keeps scheduling while it runs', () => {
    const loop = createLoop();
    loop.reconcile();
    host.advance(16);

    expect(host.hasPendingFrame).toBe(true);
  });
});

describe('the loop idles when nothing needs animating', () => {
  it('does not start when nothing animates', () => {
    animating = false;
    const loop = createLoop();
    loop.reconcile();

    expect(loop.isRunning).toBe(false);
    expect(host.hasPendingFrame).toBe(false);
  });

  it('stops when the scene stops needing frames', () => {
    const loop = createLoop();
    loop.reconcile();
    host.run(2, 16);

    animating = false;
    loop.reconcile();

    expect(loop.isRunning).toBe(false);
    expect(host.hasPendingFrame).toBe(false);
  });

  it('draws no further frames once idle', () => {
    const loop = createLoop();
    loop.reconcile();
    host.run(2, 16);
    animating = false;
    loop.reconcile();

    const framesWhenIdle = loop.frames;
    host.advance(16);

    expect(loop.frames).toBe(framesWhenIdle);
  });

  it('resumes when something needs animating again', () => {
    animating = false;
    const loop = createLoop();
    loop.reconcile();

    animating = true;
    loop.reconcile();

    expect(loop.isRunning).toBe(true);
  });

  it('still draws a single frame on demand while idle', () => {
    animating = false;
    const loop = createLoop();
    loop.reconcile();

    loop.renderOnce();

    expect(render).toHaveBeenCalledOnce();
    expect(loop.isRunning).toBe(false);
  });
});

describe('the loop suspends while the document is hidden', () => {
  it('stops when the document becomes hidden', () => {
    const loop = createLoop();
    loop.reconcile();
    host.run(2, 16);

    host.setVisible(false);

    expect(loop.isRunning).toBe(false);
    expect(host.hasPendingFrame).toBe(false);
  });

  it('resumes when the document becomes visible again', () => {
    const loop = createLoop();
    loop.reconcile();
    host.setVisible(false);

    host.setVisible(true);

    expect(loop.isRunning).toBe(true);
  });

  it('does not start while hidden even when animation is wanted', () => {
    host.visible = false;
    const loop = createLoop();
    loop.reconcile();

    expect(loop.isRunning).toBe(false);
  });
});

describe('elapsed time is frame-rate independent', () => {
  it('advances by the real interval between frames', () => {
    const loop = createLoop();
    loop.reconcile();

    host.advance(16); // first frame establishes the baseline
    host.advance(16);
    host.advance(16);

    expect(loop.elapsedSeconds).toBeCloseTo(0.032, 5);
  });

  it('reaches the same time through few slow frames as many fast ones', () => {
    const fast = createLoop();
    fast.reconcile();
    host.advance(0);
    host.run(10, 10); // 10 frames of 10ms

    const slowHost = new FakeHost();
    const slow = new AnimationLoop({
      render: () => undefined,
      needsAnimation: () => true,
      environment: slowHost.environment,
    });
    slow.reconcile();
    slowHost.advance(0);
    slowHost.run(2, 50); // 2 frames of 50ms

    expect(slow.elapsedSeconds).toBeCloseTo(fast.elapsedSeconds, 5);
  });

  it('passes the elapsed time to the renderer', () => {
    const loop = createLoop();
    loop.reconcile();
    host.advance(0);
    host.advance(20);

    expect(render).toHaveBeenLastCalledWith(0.02);
  });

  it('starts at zero', () => {
    expect(createLoop().elapsedSeconds).toBe(0);
  });
});

describe('elapsed time does not jump after a suspension', () => {
  it('continues from where it was suspended', () => {
    const loop = createLoop();
    loop.reconcile();
    host.advance(0);
    host.run(3, 16);
    const beforeHiding = loop.elapsedSeconds;

    host.setVisible(false);
    host.time += 60_000; // an hour of wall-clock time in a background tab
    host.setVisible(true);
    host.advance(16);

    expect(loop.elapsedSeconds).toBeCloseTo(beforeHiding, 5);
  });

  it('advances normally once resumed', () => {
    const loop = createLoop();
    loop.reconcile();
    host.advance(0);
    host.run(2, 16);
    const beforeHiding = loop.elapsedSeconds;

    host.setVisible(false);
    host.time += 10_000;
    host.setVisible(true);
    host.advance(16); // re-establishes the baseline
    host.advance(16);

    expect(loop.elapsedSeconds).toBeCloseTo(beforeHiding + 0.016, 5);
  });

  it('clamps an implausibly long frame rather than lurching', () => {
    const loop = createLoop();
    loop.reconcile();
    host.advance(0);
    host.advance(5000);

    expect(loop.elapsedSeconds).toBeCloseTo(MAX_FRAME_DELTA_MS / 1000, 5);
  });

  it('ignores a backwards timestamp', () => {
    const loop = createLoop();
    loop.reconcile();
    host.advance(0);
    host.advance(-50);

    expect(loop.elapsedSeconds).toBe(0);
  });
});

describe('disposal', () => {
  it('stops the loop', () => {
    const loop = createLoop();
    loop.reconcile();
    loop.dispose();

    expect(loop.isRunning).toBe(false);
    expect(host.hasPendingFrame).toBe(false);
  });

  it('ignores later reconciles', () => {
    const loop = createLoop();
    loop.dispose();
    loop.reconcile();

    expect(loop.isRunning).toBe(false);
  });

  it('draws nothing more on demand', () => {
    const loop = createLoop();
    loop.dispose();
    loop.renderOnce();

    expect(render).not.toHaveBeenCalled();
  });

  it('unsubscribes from visibility changes', () => {
    const loop = createLoop();
    loop.dispose();

    host.setVisible(false);
    host.setVisible(true);

    expect(loop.isRunning).toBe(false);
  });
});
