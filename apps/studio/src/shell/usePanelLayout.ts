import { useCallback, useEffect, useState } from 'react';
import {
  clampPanelWidth,
  DEFAULT_PANEL_LAYOUT,
  PANEL_STORAGE_KEY,
  parsePanelLayout,
  serializePanelLayout,
  type PanelLayout,
  type PanelSide,
} from './panelState';

/** Storage is injectable so tests can drive persistence without a real browser. */
export type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): PanelStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface PanelLayoutController {
  readonly layout: PanelLayout;
  readonly toggleCollapsed: (side: PanelSide) => void;
  readonly setCollapsed: (side: PanelSide, collapsed: boolean) => void;
  /** Sets the expanded width, clamped to the side's limits. */
  readonly setWidth: (side: PanelSide, width: number) => void;
}

/**
 * Holds panel collapse and width, restoring them on load and persisting every
 * change. Collapsing preserves the stored width so restoring returns the panel
 * to the size it had.
 */
export function usePanelLayout(
  storage: PanelStorage | null = defaultStorage(),
): PanelLayoutController {
  const [layout, setLayout] = useState<PanelLayout>(() => {
    try {
      return parsePanelLayout(storage?.getItem(PANEL_STORAGE_KEY) ?? null);
    } catch {
      return DEFAULT_PANEL_LAYOUT;
    }
  });

  useEffect(() => {
    try {
      storage?.setItem(PANEL_STORAGE_KEY, serializePanelLayout(layout));
    } catch {
      // Losing persistence must never break the layout.
    }
  }, [storage, layout]);

  const setCollapsed = useCallback((side: PanelSide, collapsed: boolean) => {
    setLayout((current) =>
      current[side].collapsed === collapsed
        ? current
        : { ...current, [side]: { ...current[side], collapsed } },
    );
  }, []);

  const toggleCollapsed = useCallback((side: PanelSide) => {
    setLayout((current) => ({
      ...current,
      [side]: { ...current[side], collapsed: !current[side].collapsed },
    }));
  }, []);

  const setWidth = useCallback((side: PanelSide, width: number) => {
    setLayout((current) => {
      const next = clampPanelWidth(side, width);
      return current[side].width === next
        ? current
        : { ...current, [side]: { ...current[side], width: next } };
    });
  }, []);

  return { layout, toggleCollapsed, setCollapsed, setWidth };
}
