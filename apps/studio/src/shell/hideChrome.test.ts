import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePanelLayout } from './usePanelLayout';

/**
 * Clearing the panels away to see the work.
 *
 * All or nothing: half a cleared screen is not what the gesture is for, and
 * restoring has to bring the panels back at the widths they were given rather
 * than at whatever the defaults happen to be.
 */

const memory = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

describe('hiding every panel at once', () => {
  it('starts with them showing', () => {
    const { result } = renderHook(() => usePanelLayout(memory()));

    expect(result.current.chromeHidden).toBe(false);
  });

  it('hides both together', () => {
    const { result } = renderHook(() => usePanelLayout(memory()));

    act(() => {
      result.current.toggleChrome();
    });

    expect(result.current.chromeHidden).toBe(true);
    expect(result.current.layout.library.collapsed).toBe(true);
    expect(result.current.layout.inspector.collapsed).toBe(true);
  });

  it('brings both back', () => {
    const { result } = renderHook(() => usePanelLayout(memory()));

    act(() => {
      result.current.toggleChrome();
    });
    act(() => {
      result.current.toggleChrome();
    });

    expect(result.current.chromeHidden).toBe(false);
    expect(result.current.layout.library.collapsed).toBe(false);
  });

  it('restores the widths they were given, not the defaults', () => {
    const { result } = renderHook(() => usePanelLayout(memory()));

    act(() => {
      result.current.setWidth('inspector', 400);
    });
    act(() => {
      result.current.toggleChrome();
    });
    act(() => {
      result.current.toggleChrome();
    });

    expect(result.current.layout.inspector.width).toBe(400);
  });

  it('clears the rest away when only one panel was collapsed', () => {
    // Half hidden is not hidden, so the gesture hides what is left.
    const { result } = renderHook(() => usePanelLayout(memory()));

    act(() => {
      result.current.setCollapsed('library', true);
    });
    act(() => {
      result.current.toggleChrome();
    });

    expect(result.current.chromeHidden).toBe(true);
  });
});
