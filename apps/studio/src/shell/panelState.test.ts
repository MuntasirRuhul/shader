import { describe, expect, it } from 'vitest';
import {
  clampPanelWidth,
  DEFAULT_PANEL_LAYOUT,
  PANEL_LIMITS,
  parsePanelLayout,
  serializePanelLayout,
} from './panelState';

describe('clampPanelWidth', () => {
  it('leaves a width inside the range untouched', () => {
    expect(clampPanelWidth('library', 250)).toBe(250);
  });

  it('raises a width below the minimum', () => {
    expect(clampPanelWidth('library', 0)).toBe(PANEL_LIMITS.library.min);
  });

  it('lowers a width above the maximum', () => {
    expect(clampPanelWidth('inspector', 9999)).toBe(PANEL_LIMITS.inspector.max);
  });

  it('rounds fractional widths', () => {
    expect(clampPanelWidth('library', 250.6)).toBe(251);
  });

  it('falls back to the default for a non-finite width', () => {
    expect(clampPanelWidth('library', Number.NaN)).toBe(PANEL_LIMITS.library.default);
  });
});

describe('parsePanelLayout — persisted state is untrusted', () => {
  it('returns defaults when nothing is stored', () => {
    expect(parsePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('returns defaults for unparseable data', () => {
    expect(parsePanelLayout('{not json')).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('returns defaults for a non-object payload', () => {
    expect(parsePanelLayout('42')).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('fills in a side that is missing', () => {
    const parsed = parsePanelLayout(JSON.stringify({ library: { width: 300, collapsed: true } }));

    expect(parsed.library).toEqual({ width: 300, collapsed: true });
    expect(parsed.inspector).toEqual(DEFAULT_PANEL_LAYOUT.inspector);
  });

  it('replaces a malformed side with its default', () => {
    const parsed = parsePanelLayout(JSON.stringify({ library: { width: 'wide' } }));

    expect(parsed.library).toEqual(DEFAULT_PANEL_LAYOUT.library);
  });

  it('clamps a stored width that falls outside the current limits', () => {
    const parsed = parsePanelLayout(JSON.stringify({ library: { width: 4000, collapsed: false } }));

    expect(parsed.library.width).toBe(PANEL_LIMITS.library.max);
  });
});

describe('serializePanelLayout', () => {
  it('round-trips a layout', () => {
    const layout = {
      library: { width: 300, collapsed: true },
      inspector: { width: 280, collapsed: false },
    };

    expect(parsePanelLayout(serializePanelLayout(layout))).toEqual(layout);
  });
});
