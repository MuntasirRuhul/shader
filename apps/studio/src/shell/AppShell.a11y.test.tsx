import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import type { PanelLayout } from './panelState';

const expanded: PanelLayout = {
  library: { width: 232, collapsed: false },
  inspector: { width: 264, collapsed: false },
};

/**
 * A shell with one focusable control in each region, so tab order can be
 * observed end to end.
 */
function renderFullShell(layout: PanelLayout = expanded) {
  return render(
    <AppShell
      inspectorPanel={<button type="button">Inspector control</button>}
      layout={layout}
      libraryPanel={<button type="button">Library control</button>}
      onResizePanel={() => undefined}
      stage={<button type="button">Stage control</button>}
      toolbar={<button type="button">Toolbar control</button>}
    />,
  );
}

/** The accessible names of every focusable element, in tab order. */
async function tabOrder(user: ReturnType<typeof userEvent.setup>, steps: number) {
  const seen: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    await user.tab();
    const active = document.activeElement;
    if (!active || active === document.body) break;
    seen.push(active.getAttribute('aria-label') ?? active.textContent?.trim() ?? active.tagName);
  }
  return seen;
}

describe('AppShell — regions are announced distinctly', () => {
  it('labels each region with a distinct name', () => {
    renderFullShell();

    expect(screen.getByRole('complementary', { name: 'Shader library' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Canvas tools' })).toBeInTheDocument();
  });

  it('gives every region a different label', () => {
    renderFullShell();

    const labels = [
      ...screen.getAllByRole('complementary').map((el) => el.getAttribute('aria-label')),
      screen.getByRole('main').getAttribute('aria-label'),
      screen.getByRole('toolbar').getAttribute('aria-label'),
    ];

    expect(new Set(labels).size).toBe(labels.length);
  });

  it('uses landmark elements so regions are enumerable', () => {
    renderFullShell();

    expect(screen.getAllByRole('complementary')).toHaveLength(2);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('labels each resize handle by the panel it resizes', () => {
    renderFullShell();

    expect(screen.getByRole('separator', { name: 'Resize shader library' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize inspector' })).toBeInTheDocument();
  });

  it('drops a collapsed panel from the enumerated regions', () => {
    renderFullShell({
      library: { width: 232, collapsed: true },
      inspector: { width: 264, collapsed: false },
    });

    expect(screen.getAllByRole('complementary')).toHaveLength(1);
    expect(
      screen.queryByRole('separator', { name: 'Resize shader library' }),
    ).not.toBeInTheDocument();
  });
});

describe('AppShell — keyboard order', () => {
  it('moves through the regions left to right', async () => {
    const user = userEvent.setup();
    renderFullShell();

    const order = await tabOrder(user, 6);

    expect(order).toEqual([
      'Library control',
      'Resize shader library',
      'Stage control',
      'Toolbar control',
      'Inspector control',
      'Resize inspector',
    ]);
  });

  it('keeps the order stable when a panel is collapsed', async () => {
    const user = userEvent.setup();
    renderFullShell({
      library: { width: 232, collapsed: true },
      inspector: { width: 264, collapsed: false },
    });

    const order = await tabOrder(user, 4);

    expect(order).toEqual([
      'Stage control',
      'Toolbar control',
      'Inspector control',
      'Resize inspector',
    ]);
  });

  it('does not trap focus: tabbing past the last control leaves the shell', async () => {
    const user = userEvent.setup();
    renderFullShell();

    // Six controls, then focus must escape rather than cycling inside a region.
    const order = await tabOrder(user, 7);

    expect(order).toHaveLength(6);
    expect(document.activeElement).toBe(document.body);
  });

  it('reaches every region backwards as well', async () => {
    const user = userEvent.setup();
    renderFullShell();

    await tabOrder(user, 6);
    expect(screen.getByRole('separator', { name: 'Resize inspector' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Inspector control' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Toolbar control' })).toHaveFocus();
  });
});
