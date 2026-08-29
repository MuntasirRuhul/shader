import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

function renderShell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  return render(
    <AppShell
      inspectorPanel={<p>inspector</p>}
      libraryPanel={<p>library</p>}
      stage={<canvas aria-label="Drawing surface" />}
      toolbar={<button type="button">Select</button>}
      {...props}
    />,
  );
}

describe('AppShell — unsupported rendering environment', () => {
  it('renders the canvas when rendering is supported', () => {
    renderShell({ renderingSupported: true });

    expect(screen.getByLabelText('Drawing surface')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats support as present by default', () => {
    renderShell();

    expect(screen.getByLabelText('Drawing surface')).toBeInTheDocument();
  });

  it('replaces the stage with a message when support is unavailable', () => {
    renderShell({ renderingSupported: false });

    expect(screen.queryByLabelText('Drawing surface')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('states the requirement rather than showing a blank canvas', () => {
    renderShell({ renderingSupported: false });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('WebGL2 is required');
    expect(alert).toHaveTextContent(/cannot provide a WebGL2 rendering context/);
  });

  it('names whichever requirement it is given', () => {
    renderShell({ renderingSupported: false, renderingRequirement: 'WebGPU' });

    expect(screen.getByRole('alert')).toHaveTextContent('WebGPU is required');
  });

  it('hides the canvas toolbar, which has nothing to act on', () => {
    renderShell({ renderingSupported: false });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('keeps the panels usable so the rest of the application still works', () => {
    renderShell({ renderingSupported: false });

    expect(screen.getByRole('complementary', { name: 'Shader library' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByText('library')).toBeInTheDocument();
  });

  it('announces the message without needing focus moved to it', () => {
    renderShell({ renderingSupported: false });

    // role="alert" is announced on appearance.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('AppShell — needs no rendering context to be tested', () => {
  it('renders without a WebGL context ever being requested', () => {
    const requested: unknown[] = [];
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((...args: unknown[]) => {
        requested.push(args[0]);
        return null;
      });

    try {
      renderShell({ renderingSupported: true });

      expect(screen.getByLabelText('Drawing surface')).toBeInTheDocument();
      expect(requested).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
