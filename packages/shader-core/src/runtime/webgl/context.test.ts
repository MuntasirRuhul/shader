import { describe, expect, it, vi } from 'vitest';
import { acquireContext, CONTEXT_ATTRIBUTES, isRenderingSupported } from './context';

/**
 * These run headlessly, so there is no real WebGL2 context. That is the point:
 * the unsupported path is the one that must never throw, and it is exercised
 * here exactly as it would be in a browser without WebGL2.
 */

function fakeCanvas(getContext: (id: string, attributes?: unknown) => unknown): HTMLCanvasElement {
  return { getContext } as unknown as HTMLCanvasElement;
}

describe('when WebGL2 is unavailable', () => {
  it('reports unavailability rather than throwing', () => {
    const canvas = fakeCanvas(() => null);

    const result = acquireContext(canvas);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/WebGL2/);
  });

  it('explains what the user might do about it', () => {
    const result = acquireContext(fakeCanvas(() => null));

    expect(result.ok === false && result.reason).toMatch(/hardware acceleration/i);
  });

  it('does not throw when getContext itself throws', () => {
    const canvas = fakeCanvas(() => {
      throw new Error('context creation blocked');
    });

    let result;
    expect(() => {
      result = acquireContext(canvas);
    }).not.toThrow();
    expect(result).toMatchObject({ ok: false });
  });

  it('carries the thrown message into the reason', () => {
    const result = acquireContext(
      fakeCanvas(() => {
        throw new Error('context creation blocked');
      }),
    );

    expect(result.ok === false && result.reason).toContain('context creation blocked');
  });

  it('reports unsupported from the convenience check', () => {
    expect(isRenderingSupported(fakeCanvas(() => null))).toBe(false);
  });
});

describe('when WebGL2 is available', () => {
  const context = { drawingBufferWidth: 0 };

  it('returns the context', () => {
    const result = acquireContext(fakeCanvas(() => context));

    expect(result.ok).toBe(true);
    expect(result.ok && result.gl).toBe(context);
  });

  it('reports supported from the convenience check', () => {
    expect(isRenderingSupported(fakeCanvas(() => context))).toBe(true);
  });

  it('requests webgl2 specifically', () => {
    const getContext = vi.fn(() => context);
    acquireContext(fakeCanvas(getContext));

    expect(getContext).toHaveBeenCalledWith('webgl2', CONTEXT_ATTRIBUTES);
  });

  it('asks for attributes suited to compositing shader output', () => {
    // Premultiplied alpha off keeps a shader's own alpha meaningful when
    // objects are drawn over one another.
    expect(CONTEXT_ATTRIBUTES.premultipliedAlpha).toBe(false);
    expect(CONTEXT_ATTRIBUTES.alpha).toBe(true);
    expect(CONTEXT_ATTRIBUTES.depth).toBe(false);
  });

  it('accepts caller-supplied attributes', () => {
    const getContext = vi.fn(() => context);
    acquireContext(fakeCanvas(getContext), { alpha: false });

    expect(getContext).toHaveBeenCalledWith('webgl2', { alpha: false });
  });
});
