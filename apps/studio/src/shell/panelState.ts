export type PanelSide = 'library' | 'inspector';

export interface PanelState {
  /** The width used when the panel is expanded, in pixels. */
  readonly width: number;
  readonly collapsed: boolean;
}

export type PanelLayout = Record<PanelSide, PanelState>;

export const PANEL_STORAGE_KEY = 'shader-builder.panels';

export const PANEL_LIMITS = {
  library: { min: 180, max: 420, default: 232 },
  inspector: { min: 220, max: 480, default: 264 },
} as const satisfies Record<PanelSide, { min: number; max: number; default: number }>;

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  library: { width: PANEL_LIMITS.library.default, collapsed: false },
  inspector: { width: PANEL_LIMITS.inspector.default, collapsed: false },
};

/** Keeps a width inside the side's allowed range. */
export function clampPanelWidth(side: PanelSide, width: number): number {
  const { min, max } = PANEL_LIMITS[side];
  if (!Number.isFinite(width)) return PANEL_LIMITS[side].default;
  return Math.min(max, Math.max(min, Math.round(width)));
}

function isPanelState(value: unknown): value is PanelState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.width === 'number' && typeof candidate.collapsed === 'boolean';
}

/**
 * Reads a stored layout, falling back to defaults for anything missing or
 * malformed. Persisted state is untrusted input: it may predate a change to
 * the limits, or have been edited by hand.
 */
export function parsePanelLayout(raw: string | null): PanelLayout {
  if (raw === null) return DEFAULT_PANEL_LAYOUT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }

  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PANEL_LAYOUT;
  const record = parsed as Record<string, unknown>;

  const read = (side: PanelSide): PanelState => {
    const value = record[side];
    if (!isPanelState(value)) return DEFAULT_PANEL_LAYOUT[side];
    return { width: clampPanelWidth(side, value.width), collapsed: value.collapsed };
  };

  return { library: read('library'), inspector: read('inspector') };
}

export function serializePanelLayout(layout: PanelLayout): string {
  return JSON.stringify(layout);
}
