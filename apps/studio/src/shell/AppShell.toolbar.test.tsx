import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import styles from './AppShell.module.css';
import type { PanelLayout } from './panelState';

/**
 * The stylesheet source. jsdom applies no CSS, so behaviour that lives purely
 * in the styles — layering, pointer transparency — has to be asserted here.
 */
const shellCss = ((): string => {
  const candidates = [
    'src/shell/AppShell.module.css',
    'apps/studio/src/shell/AppShell.module.css',
  ].map((relative) => resolve(process.cwd(), relative));

  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`AppShell.module.css not found near ${process.cwd()}`);
  return readFileSync(found, 'utf8');
})();

/** The declaration block for a class selector, for asserting on CSS mechanics. */
function ruleBody(css: string, className: string): string {
  const pattern = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`);
  const match = pattern.exec(css);
  if (!match) throw new Error(`No rule found for .${className}`);
  return match[1] ?? '';
}

const expanded: PanelLayout = {
  library: { width: 232, collapsed: false },
  inspector: { width: 264, collapsed: false },
};

function renderWithToolbar(layout: PanelLayout = expanded, onStageClick = vi.fn()) {
  render(
    <AppShell
      inspectorPanel={<p>inspector</p>}
      layout={layout}
      libraryPanel={<p>library</p>}
      stage={
        <button onClick={onStageClick} type="button">
          stage target
        </button>
      }
      toolbar={<button type="button">Select</button>}
    />,
  );
  return { onStageClick };
}

describe('AppShell — the toolbar stays within the stage', () => {
  it('renders inside the stage rather than the shell', () => {
    renderWithToolbar();

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(screen.getByRole('main').contains(toolbar)).toBe(true);
  });

  it('stays inside the stage when a panel is collapsed', () => {
    renderWithToolbar({
      library: { width: 232, collapsed: true },
      inspector: { width: 264, collapsed: false },
    });

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(screen.getByRole('main').contains(toolbar)).toBe(true);
  });

  it('stays inside the stage when a panel is resized', () => {
    renderWithToolbar({
      library: { width: 420, collapsed: false },
      inspector: { width: 480, collapsed: false },
    });

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(screen.getByRole('main').contains(toolbar)).toBe(true);
  });

  it('is positioned against the stage, centered near its lower edge', () => {
    renderWithToolbar();

    // The positioning wrapper is the toolbar's offset parent within the stage.
    const positioner = screen.getByRole('toolbar', { name: 'Canvas tools' }).parentElement;
    expect(positioner?.className).toContain(styles.toolbar ?? 'toolbar');
  });
});

describe('AppShell — the toolbar blocks the pointer only within its own bounds', () => {
  it('lets the toolbar itself receive clicks', async () => {
    const user = userEvent.setup();
    renderWithToolbar();

    const button = screen.getByRole('button', { name: 'Select' });
    await user.click(button);

    expect(button).toBeInTheDocument();
  });

  it('leaves the rest of the stage row clickable', async () => {
    const user = userEvent.setup();
    const { onStageClick } = renderWithToolbar();

    await user.click(screen.getByRole('button', { name: 'stage target' }));

    expect(onStageClick).toHaveBeenCalledOnce();
  });

  // jsdom applies no CSS, so a rendered click would pass whatever the styles
  // say. The mechanism lives in the stylesheet, so assert on it directly.
  it('declares pointer-events none on the positioner and auto on the bar', () => {
    const positionerRule = ruleBody(shellCss, 'toolbar');
    const barRule = ruleBody(shellCss, 'toolbarInner');

    expect(positionerRule).toMatch(/pointer-events:\s*none/);
    expect(barRule).toMatch(/pointer-events:\s*auto/);
  });

  it('positions the toolbar against the stage rather than the viewport', () => {
    // `position: fixed` would escape the stage when panels resize.
    expect(ruleBody(shellCss, 'toolbar')).toMatch(/position:\s*absolute/);
    expect(ruleBody(shellCss, 'stage')).toMatch(/position:\s*relative/);
  });
});
