import type { ParameterValue, ParameterValues } from './parameterSchema';

/**
 * A shader that owns state between frames.
 *
 * Most shaders here are not pure functions of time. The metaball integrates
 * ball positions, the ink trail ages its points, and neither can be expressed
 * as data because the next value depends on the last. A shader declares what
 * it starts with and how to advance it; the runtime does the rest.
 */

/** The values a simulation produces, bound to the program as uniforms are. */
export type SimulationState = ParameterValues;

/** Where the pointer is, in the object's own coordinates. */
export interface PointerInput {
  /** False when the pointer is elsewhere, or has left the canvas entirely. */
  readonly present: boolean;
  /**
   * Object-local, `0..1` across the object, matching what the shader reads as
   * `vUv`. Meaningless when `present` is false.
   */
  readonly x: number;
  readonly y: number;
}

export const POINTER_ABSENT: PointerInput = { present: false, x: 0, y: 0 };

/** Everything an advance is allowed to depend on. */
export interface AdvanceContext {
  /** Real seconds since the previous advance, never the time spent suspended. */
  readonly dt: number;
  /** Total seconds this object has been advancing. */
  readonly elapsed: number;
  /** The object's resolved parameter values. */
  readonly parameters: ParameterValues;
  readonly pointer: PointerInput;
  /** The object's size in pixels, for a simulation that cares about aspect. */
  readonly width: number;
  readonly height: number;
}

/**
 * Advances a shader's state by one frame.
 *
 * Deliberately a plain function of its arguments: it reaches neither the
 * document nor the browser, so a shader's motion can be exercised in a test
 * with no canvas at all.
 */
export type AdvanceFunction = (
  previous: SimulationState,
  context: AdvanceContext,
) => SimulationState;

export interface SimulationDeclaration {
  /** What the state holds before the first advance. */
  readonly initial: SimulationState;
  readonly advance: AdvanceFunction;
}

export function isParameterValue(value: unknown): value is ParameterValue {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    Array.isArray(value) ||
    (typeof value === 'object' && value !== null)
  );
}
