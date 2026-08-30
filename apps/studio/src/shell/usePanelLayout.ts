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
  /** Whether every panel is hidden, leaving the canvas alone on screen. */
  readonly chromeHidden: boolean;
  /** Hides every panel, or brings them all back to the widths they had. */
  readonly toggleChrome: () => void;
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

  // Hiding is all-or-nothing: the point is to see the work without anything
  // around it, and a half-cleared screen is not that.
  const chromeHidden = layout.library.collapsed && layout.inspector.collapsed;

  const toggleChrome = useCallback(() => {
    setLayout((current) => {
      const hidden = current.library.collapsed && current.inspector.collapsed;
      return {
        library: { ...current.library, collapsed: !hidden },
        inspector: { ...current.inspector, collapsed: !hidden },
      };
    });
  }, []);

  return { layout, toggleCollapsed, setCollapsed, setWidth, chromeHidden, toggleChrome };
}
