/**
 * Drives every animated shader from one loop.
 *
 * One loop rather than one per object means all objects advance to the same
 * instant, and the browser schedules a single callback however many objects are
 * on screen.
 *
 * The loop suspends whenever nothing needs it — no animated object, or a hidden
 * document — because a canvas tool left open in a background tab should cost
 * nothing.
 */

/** The host services the loop needs, injectable so tests can drive time exactly. */
export interface LoopEnvironment {
  readonly requestFrame: (callback: (timestamp: number) => void) => number;
  readonly cancelFrame: (handle: number) => void;
  /** Milliseconds since some fixed origin. */
  readonly now: () => number;
  /** Whether the document is currently visible. */
  readonly isVisible: () => boolean;
  /** Subscribes to visibility changes; returns an unsubscribe function. */
  readonly onVisibilityChange: (listener: () => void) => () => void;
}

export function browserLoopEnvironment(): LoopEnvironment {
  return {
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => {
      cancelAnimationFrame(handle);
    },
    now: () => performance.now(),
    isVisible: () => document.visibilityState !== 'hidden',
    onVisibilityChange: (listener) => {
      document.addEventListener('visibilitychange', listener);
      return () => {
        document.removeEventListener('visibilitychange', listener);
      };
    },
  };
}

export interface AnimationLoopOptions {
  /**
   * Draws one frame at the given elapsed time, in seconds, having advanced by
   * `dt` seconds since the previous frame. `dt` is rendering time: a
   * suspension contributes nothing to it.
   */
  readonly render: (elapsedSeconds: number, dt: number) => void;
  /** Whether anything on screen currently needs continuous frames. */
  readonly needsAnimation: () => boolean;
  readonly environment?: LoopEnvironment;
}

export class AnimationLoop {
  private readonly env: LoopEnvironment;
  private handle: number | null = null;
  private unsubscribeVisibility: (() => void) | null = null;

  /**
   * Elapsed time advances only while the loop runs. Holding it separately from
   * wall-clock time is what stops a suspended tab from jumping the animation
   * forward by however long it was hidden.
   */
  private elapsedMs = 0;
  /** How far the last frame advanced, so a simulation steps by real time. */
  private lastDeltaMs = 0;
  private lastTimestamp: number | null = null;
  private running = false;
  private disposed = false;
  private frameCount = 0;

  constructor(private readonly options: AnimationLoopOptions) {
    this.env = options.environment ?? browserLoopEnvironment();
    this.unsubscribeVisibility = this.env.onVisibilityChange(() => {
      this.reconcile();
    });
  }

  /** Seconds of animation time elapsed. */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /** Frames actually drawn. Lets tests prove the loop idles. */
  get frames(): number {
    return this.frameCount;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Re-evaluates whether the loop should be running.
   *
   * Called whenever something that affects the answer changes: the scene, a
   * parameter, or document visibility.
   */
  reconcile(): void {
    if (this.disposed) return;

    const shouldRun = this.env.isVisible() && this.options.needsAnimation();
    if (shouldRun) this.start();
    else this.stop();
  }

  /**
   * Draws a single frame without starting the loop.
   *
   * A still scene still has to be drawn once — when a parameter changes on a
   * shader that does not animate, for instance.
   */
  renderOnce(): void {
    if (this.disposed) return;
    this.frameCount += 1;
    // A one-off redraw advances no time: reusing the last frame's delta would
    // step a simulation forward every time a parameter changed.
    this.options.render(this.elapsedSeconds, 0);
  }

  private start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    // Discarding the previous timestamp is what makes resumption seamless: the
    // first frame after a pause advances by one frame, not by the pause.
    this.lastTimestamp = null;
    this.schedule();
  }

  private stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== null) {
      this.env.cancelFrame(this.handle);
      this.handle = null;
    }
    this.lastTimestamp = null;
  }

  private schedule(): void {
    this.handle = this.env.requestFrame((timestamp) => {
      this.handle = null;
      this.tick(timestamp);
    });
  }

  private tick(timestamp: number): void {
    if (!this.running || this.disposed) return;

    // Advance by the real interval between frames, so a slow frame moves the
    // animation as far as several fast ones would. Animation speed then depends
    // on wall-clock time rather than on the frame rate achieved.
    if (this.lastTimestamp !== null) {
      const delta = timestamp - this.lastTimestamp;
      // A tab restored after a long pause can report an enormous delta; clamp
      // it so the animation never lurches.
      this.lastDeltaMs = Math.min(Math.max(delta, 0), MAX_FRAME_DELTA_MS);
      this.elapsedMs += this.lastDeltaMs;
    }
    this.lastTimestamp = timestamp;

    this.frameCount += 1;
    this.options.render(this.elapsedSeconds, this.lastDeltaMs / 1000);

    if (this.running) this.schedule();
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.unsubscribeVisibility?.();
    this.unsubscribeVisibility = null;
  }
}

/** Frames longer than this are treated as a stall rather than elapsed time. */
export const MAX_FRAME_DELTA_MS = 100;
