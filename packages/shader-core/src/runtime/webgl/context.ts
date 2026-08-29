/** The context attributes the renderer needs. Premultiplied alpha off keeps
 * shader output predictable when objects are composited over one another. */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

export type ContextResult =
  | { readonly ok: true; readonly gl: WebGL2RenderingContext }
  | { readonly ok: false; readonly reason: string };

/**
 * Acquires a WebGL2 context, reporting unavailability rather than throwing.
 *
 * A browser without WebGL2 is a supported state, not an error: the shell shows
 * an explicit message for it. Some browsers also throw from `getContext`
 * outright rather than returning null, so the call is guarded.
 */
export function acquireContext(
  canvas: HTMLCanvasElement,
  attributes: WebGLContextAttributes = CONTEXT_ATTRIBUTES,
): ContextResult {
  let context: RenderingContext | null = null;

  try {
    context = canvas.getContext('webgl2', attributes);
  } catch (error) {
    return {
      ok: false,
      reason: `Requesting a WebGL2 context failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (!context) {
    return {
      ok: false,
      reason:
        'This browser did not provide a WebGL2 context. It may be unsupported, or hardware acceleration may be disabled.',
    };
  }

  return { ok: true, gl: context as WebGL2RenderingContext };
}

/** Whether a canvas can provide the context the renderer needs. */
export function isRenderingSupported(canvas: HTMLCanvasElement): boolean {
  return acquireContext(canvas).ok;
}
