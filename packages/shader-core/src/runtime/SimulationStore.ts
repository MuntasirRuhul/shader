import type { ShaderManifest } from '../registry/manifest';
import { POINTER_ABSENT, type PointerInput, type SimulationState } from '../registry/simulation';

/**
 * The simulation state of everything on the canvas.
 *
 * State is held per object, not per shader: two objects using one shader are
 * two instances of an effect, and sharing state would make one object's drift
 * visible in the other.
 */

export interface AdvanceRequest {
  readonly objectId: string;
  readonly manifest: ShaderManifest;
  /** The object's resolved parameter values. */
  readonly parameters: SimulationState;
  readonly pointer: PointerInput;
  readonly width: number;
  readonly height: number;
}

export interface AdvanceFailure {
  readonly shaderId: string;
  readonly objectId: string;
  readonly reason: 'threw' | 'too-slow';
  readonly message: string;
}

export interface SimulationObserver {
  readonly onAdvanceFailure?: (failure: AdvanceFailure) => void;
}

/**
 * How long an advance may take before it is reported.
 *
 * An advance runs every frame, so one that overruns costs frame rate directly.
 * Reporting it against the shader makes it read as a shader defect rather than
 * a canvas that mysteriously stutters.
 */
export const ADVANCE_BUDGET_MS = 4;
const OVERRUNS_BEFORE_REPORTING = 30;

interface Entry {
  state: SimulationState;
  elapsed: number;
  overruns: number;
  /** Set once an advance throws; that object stops advancing. */
  stopped: boolean;
}

export class SimulationStore {
  private readonly entries = new Map<string, Entry>();
  private readonly reported = new Set<string>();
  private readonly observer: SimulationObserver;
  private readonly now: () => number;

  constructor(observer: SimulationObserver = {}, now: () => number = () => performance.now()) {
    this.observer = observer;
    this.now = now;
  }

  /** How many objects currently hold state. */
  get size(): number {
    return this.entries.size;
  }

  /** The values to bind for an object, or nothing when its shader has no state. */
  valuesFor(objectId: string): SimulationState | undefined {
    return this.entries.get(objectId)?.state;
  }

  /**
   * Advances one object's state by `dt` seconds and returns the values to bind.
   *
   * A shader without a simulation costs nothing here — it returns immediately,
   * so the common case pays for a map lookup and no more.
   */
  advance(request: AdvanceRequest, dt: number): SimulationState | undefined {
    const simulation = request.manifest.simulation;
    if (!simulation) return undefined;

    let entry = this.entries.get(request.objectId);
    if (!entry) {
      entry = { state: simulation.initial, elapsed: 0, overruns: 0, stopped: false };
      this.entries.set(request.objectId, entry);
    }

    if (entry.stopped) return entry.state;

    entry.elapsed += dt;

    const startedAt = this.now();
    try {
      entry.state = simulation.advance(entry.state, {
        dt,
        elapsed: entry.elapsed,
        parameters: request.parameters,
        pointer: request.pointer ?? POINTER_ABSENT,
        width: request.width,
        height: request.height,
      });
    } catch (error) {
      // One shader's failure must not stop the whole canvas drawing.
      entry.stopped = true;
      this.report({
        shaderId: request.manifest.id,
        objectId: request.objectId,
        reason: 'threw',
        message: error instanceof Error ? error.message : String(error),
      });
      return entry.state;
    }

    const took = this.now() - startedAt;
    if (took > ADVANCE_BUDGET_MS) {
      entry.overruns += 1;
      if (entry.overruns >= OVERRUNS_BEFORE_REPORTING) {
        entry.overruns = 0;
        this.report({
          shaderId: request.manifest.id,
          objectId: request.objectId,
          reason: 'too-slow',
          message: `Advancing takes about ${took.toFixed(1)}ms, over the ${String(ADVANCE_BUDGET_MS)}ms budget, so it is costing frame rate.`,
        });
      }
    } else {
      // A single slow frame is noise; only a sustained overrun is worth saying.
      entry.overruns = 0;
    }

    return entry.state;
  }

  /** Forgets state for objects no longer on the canvas. */
  retainOnly(objectIds: Iterable<string>): void {
    const live = new Set(objectIds);
    for (const objectId of [...this.entries.keys()]) {
      if (!live.has(objectId)) this.entries.delete(objectId);
    }
  }

  release(objectId: string): void {
    this.entries.delete(objectId);
  }

  clear(): void {
    this.entries.clear();
    this.reported.clear();
  }

  private report(failure: AdvanceFailure): void {
    // Once per shader and reason: an advance failing every frame would
    // otherwise repeat the same message sixty times a second.
    const key = `${failure.shaderId}:${failure.reason}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.observer.onAdvanceFailure?.(failure);
  }
}
