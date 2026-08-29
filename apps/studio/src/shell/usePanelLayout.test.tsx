import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_LAYOUT, PANEL_LIMITS, PANEL_STORAGE_KEY } from './panelState';
import { usePanelLayout, type PanelStorage } from './usePanelLayout';

class MemoryStorage implements PanelStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

/** Throws on every access, as a browser in a restricted privacy mode does. */
const hostileStorage: PanelStorage = {
  getItem() {
    throw new Error('storage unavailable');
  },
  setItem() {
    throw new Error('storage unavailable');
  },
};

describe('usePanelLayout — collapse and restore', () => {
  it('starts with both panels expanded', () => {
    const { result } = renderHook(() => usePanelLayout(new MemoryStorage()));

    expect(result.current.layout).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('collapses one panel without affecting the other', () => {
    const { result } = renderHook(() => usePanelLayout(new MemoryStorage()));

    act(() => {
      result.current.toggleCollapsed('library');
    });

    expect(result.current.layout.library.collapsed).toBe(true);
    expect(result.current.layout.inspector.collapsed).toBe(false);
  });

  it('keeps the width while collapsed so restoring returns to it', () => {
    const { result } = renderHook(() => usePanelLayout(new MemoryStorage()));

    act(() => {
      result.current.setWidth('library', 300);
    });
    act(() => {
      result.current.toggleCollapsed('library');
    });

    expect(result.current.layout.library.width).toBe(300);

    act(() => {
      result.current.toggleCollapsed('library');
    });

    expect(result.current.layout.library).toEqual({ width: 300, collapsed: false });
  });
});

describe('usePanelLayout — width limits', () => {
  it('follows the requested width inside the allowed range', () => {
    const { result } = renderHook(() => usePanelLayout(new MemoryStorage()));

    act(() => {
      result.current.setWidth('library', 280);
    });

    expect(result.current.layout.library.width).toBe(280);
  });

  it('clamps at the minimum rather than going below it', () => {
    const { result } = renderHook(() => usePanelLayout(new MemoryStorage()));

    act(() => {
      result.current.setWidth('library', 10);
    });

    expect(result.current.layout.library.width).toBe(PANEL_LIMITS.library.min);
  });

  it('clamps at the maximum rather than exceeding it', () => {
    const { result } = renderHook(() => usePanelLayout(new MemoryStorage()));

    act(() => {
      result.current.setWidth('inspector', 5000);
    });

    expect(result.current.layout.inspector.width).toBe(PANEL_LIMITS.inspector.max);
  });
});

describe('usePanelLayout — persistence', () => {
  it('restores a collapsed panel after a reload', () => {
    const storage = new MemoryStorage();
    const first = renderHook(() => usePanelLayout(storage));

    act(() => {
      first.result.current.toggleCollapsed('inspector');
    });
    first.unmount();

    const second = renderHook(() => usePanelLayout(storage));

    expect(second.result.current.layout.inspector.collapsed).toBe(true);
  });

  it('restores panel widths after a reload', () => {
    const storage = new MemoryStorage();
    const first = renderHook(() => usePanelLayout(storage));

    act(() => {
      first.result.current.setWidth('library', 321);
    });
    first.unmount();

    const second = renderHook(() => usePanelLayout(storage));

    expect(second.result.current.layout.library.width).toBe(321);
  });

  it('writes the layout to storage', () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() => usePanelLayout(storage));

    act(() => {
      result.current.setWidth('library', 250);
    });

    expect(storage.getItem(PANEL_STORAGE_KEY)).toContain('250');
  });

  it('falls back to defaults when storage throws', () => {
    const { result } = renderHook(() => usePanelLayout(hostileStorage));

    expect(result.current.layout).toEqual(DEFAULT_PANEL_LAYOUT);

    act(() => {
      result.current.toggleCollapsed('library');
    });

    expect(result.current.layout.library.collapsed).toBe(true);
  });

  it('works with no storage at all', () => {
    const { result } = renderHook(() => usePanelLayout(null));

    act(() => {
      result.current.setWidth('inspector', 300);
    });

    expect(result.current.layout.inspector.width).toBe(300);
  });
});
