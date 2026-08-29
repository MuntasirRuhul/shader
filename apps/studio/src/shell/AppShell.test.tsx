import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { PANEL_LIMITS } from './panelState';

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  return render(
    <AppShell
      inspectorPanel={<p>inspector content</p>}
      libraryPanel={<p>library content</p>}
      stage={<p>stage content</p>}
      {...overrides}
    />,
  );
}

describe('AppShell — three-region layout', () => {
  it('shows all three regions once loaded', () => {
    renderShell();

    expect(screen.getByText('library content')).toBeInTheDocument();
    expect(screen.getByText('stage content')).toBeInTheDocument();
    expect(screen.getByText('inspector content')).toBeInTheDocument();
  });

  it('gives the panels fixed widths and lets the stage absorb the rest', () => {
    renderShell({
      layout: {
        library: { width: 200, collapsed: false },
        inspector: { width: 300, collapsed: false },
      },
    });

    expect(screen.getByRole('complementary', { name: 'Shader library' })).toHaveStyle({
      width: '200px',
    });
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveStyle({
      width: '300px',
    });
    // The stage takes its width from flex growth rather than a fixed value.
    expect(screen.getByRole('main')).not.toHaveAttribute('style');
  });

  it('falls back to default panel widths', () => {
    renderShell();

    expect(screen.getByRole('complementary', { name: 'Shader library' })).toHaveStyle({
      width: '232px',
    });
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveStyle({
      width: '264px',
    });
  });
});

describe('AppShell — regions are composed through slots', () => {
  it('renders substituted region content without shell changes', () => {
    const { rerender } = renderShell();
    expect(screen.getByText('library content')).toBeInTheDocument();

    rerender(
      <AppShell
        inspectorPanel={<button type="button">A control</button>}
        libraryPanel={
          <ul>
            <li>A shader</li>
          </ul>
        }
        stage={<canvas aria-label="Drawing surface" />}
      />,
    );

    expect(screen.getByRole('listitem')).toHaveTextContent('A shader');
    expect(screen.getByRole('button', { name: 'A control' })).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing surface')).toBeInTheDocument();
  });

  it('keeps the layout structure when region content changes', () => {
    const { rerender } = renderShell();

    rerender(
      <AppShell
        inspectorPanel={<p>different</p>}
        libraryPanel={<p>different</p>}
        stage={<p>different</p>}
      />,
    );

    expect(screen.getByRole('complementary', { name: 'Shader library' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('holds no knowledge of what fills a region', () => {
    renderShell({ libraryPanel: null, inspectorPanel: null, stage: null });

    // Empty regions are still laid out; the shell does not require content.
    expect(screen.getByRole('complementary', { name: 'Shader library' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('AppShell — floating toolbar', () => {
  it('omits the toolbar when none is supplied', () => {
    renderShell();

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('renders the toolbar inside the stage so it stays within its bounds', () => {
    renderShell({ toolbar: <button type="button">Select</button> });

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole('main').contains(toolbar)).toBe(true);
  });
});

describe('AppShell — collapsible panels', () => {
  it('hides a collapsed panel and leaves the other in place', () => {
    renderShell({
      layout: {
        library: { width: 232, collapsed: true },
        inspector: { width: 264, collapsed: false },
      },
    });

    expect(screen.queryByRole('complementary', { name: 'Shader library' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('restores a panel at the width it had before collapsing', () => {
    const collapsed = {
      library: { width: 310, collapsed: true },
      inspector: { width: 264, collapsed: false },
    };
    const { rerender } = renderShell({ layout: collapsed });

    rerender(
      <AppShell
        inspectorPanel={<p>inspector content</p>}
        layout={{ ...collapsed, library: { width: 310, collapsed: false } }}
        libraryPanel={<p>library content</p>}
        stage={<p>stage content</p>}
      />,
    );

    expect(screen.getByRole('complementary', { name: 'Shader library' })).toHaveStyle({
      width: '310px',
    });
  });
});

describe('AppShell — resizable panels', () => {
  it('offers no resize handle when the caller does not accept resizes', () => {
    renderShell();

    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('exposes a labelled handle per panel with its current width', () => {
    renderShell({ onResizePanel: () => undefined });

    const handle = screen.getByRole('separator', { name: 'Resize shader library' });
    expect(handle).toHaveAttribute('aria-valuenow', '232');
    expect(handle).toHaveAttribute('aria-valuemin', String(PANEL_LIMITS.library.min));
    expect(handle).toHaveAttribute('aria-valuemax', String(PANEL_LIMITS.library.max));
  });

  it('reports a wider library as the pointer moves right', async () => {
    const user = userEvent.setup();
    const onResizePanel = vi.fn();
    renderShell({ onResizePanel });

    const handle = screen.getByRole('separator', { name: 'Resize shader library' });
    await user.pointer([
      { target: handle, keys: '[MouseLeft>]', coords: { clientX: 232, clientY: 100 } },
      { target: handle, coords: { clientX: 282, clientY: 100 } },
      { keys: '[/MouseLeft]' },
    ]);

    expect(onResizePanel).toHaveBeenCalledWith('library', 282);
  });

  it('reports a wider inspector as the pointer moves left', async () => {
    const user = userEvent.setup();
    const onResizePanel = vi.fn();
    renderShell({ onResizePanel });

    const handle = screen.getByRole('separator', { name: 'Resize inspector' });
    await user.pointer([
      { target: handle, keys: '[MouseLeft>]', coords: { clientX: 500, clientY: 100 } },
      { target: handle, coords: { clientX: 450, clientY: 100 } },
      { keys: '[/MouseLeft]' },
    ]);

    expect(onResizePanel).toHaveBeenCalledWith('inspector', 314);
  });

  it('resizes from the keyboard so the edge is not pointer-only', async () => {
    const user = userEvent.setup();
    const onResizePanel = vi.fn();
    renderShell({ onResizePanel });

    screen.getByRole('separator', { name: 'Resize shader library' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onResizePanel).toHaveBeenCalledWith('library', 248);
  });

  it('jumps to the limits with Home and End', async () => {
    const user = userEvent.setup();
    const onResizePanel = vi.fn();
    renderShell({ onResizePanel });

    screen.getByRole('separator', { name: 'Resize shader library' }).focus();
    await user.keyboard('{Home}');
    expect(onResizePanel).toHaveBeenCalledWith('library', PANEL_LIMITS.library.min);

    await user.keyboard('{End}');
    expect(onResizePanel).toHaveBeenCalledWith('library', PANEL_LIMITS.library.max);
  });
});
