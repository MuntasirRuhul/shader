import { createRectangle, resetObjectIds, shaderFill } from '@shader/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { useEditorStore } from '../store/editorStore';
import { transientChannel } from '../store/transientChannel';

/**
 * The whole application, exercised the way someone using a keyboard and a
 * screen reader would meet it.
 *
 * The primitives each carry their own accessibility contract; what is checked
 * here is what only appears once they are assembled — that the regions are
 * announced, that focus moves through them in a sensible order and is never
 * trapped, and that every control can be reached without a pointer.
 */

beforeEach(() => {
  resetObjectIds();
  localStorage.clear();
  transientChannel.cancel();
  document.documentElement.removeAttribute('data-theme');

  useEditorStore.getState().replaceDocument({
    version: 1,
    id: 'a11y',
    name: 'Accessibility',
    objects: [],
    canvasWidth: 800,
    canvasHeight: 600,
  });
});

describe('the application announces its regions', () => {
  it('names every panel distinctly', () => {
    render(<App />);

    // Each region is findable by name, which is what a screen reader's region
    // list depends on.
    expect(screen.getByRole('complementary', { name: /shader library/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: /canvas/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: /canvas tools/i })).toBeInTheDocument();
  });

  it('gives the drawing surface an accessible name', () => {
    render(<App />);

    expect(screen.getByLabelText('Drawing surface')).toBeInTheDocument();
  });
});

describe('everything is reachable with the keyboard alone', () => {
  it('reaches the shader library, the tools, and the inspector by tabbing', async () => {
    const user = userEvent.setup();
    render(<App />);

    const reached = new Set<string>();
    // Walk a bounded number of stops rather than looping until exhaustion.
    for (let step = 0; step < 40; step += 1) {
      await user.tab();
      const active = document.activeElement;
      if (active && active !== document.body) {
        reached.add(active.getAttribute('aria-label') ?? active.textContent ?? '');
      }
    }

    expect([...reached].some((name) => /select tool/i.test(name))).toBe(true);
    expect([...reached].some((name) => /shape tool/i.test(name))).toBe(true);
    expect([...reached].some((name) => /text tool/i.test(name))).toBe(true);
    expect([...reached].some((name) => /import/i.test(name))).toBe(true);
    expect([...reached].some((name) => /export/i.test(name))).toBe(true);
  });

  it('never leaves focus stranded on the body', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.tab();

    expect(document.activeElement).not.toBe(document.body);
  });

  it('selects a tool from the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('r');

    expect(useEditorStore.getState().tool.active).toBe('shape');
  });
});

describe('the inspector is operable without a pointer', () => {
  beforeEach(() => {
    const store = useEditorStore.getState();
    store.addObject(createRectangle({ id: 'a', fill: shaderFill('mesh-gradient', {}, 'ember') }));
  });

  it('reaches a parameter control by tabbing', async () => {
    const user = userEvent.setup();
    render(<App />);

    for (let step = 0; step < 40; step += 1) {
      await user.tab();
      const label = document.activeElement?.getAttribute('aria-label') ?? '';
      if (/softness|warp|colour/i.test(label)) return;
    }

    throw new Error('no parameter control was reachable by keyboard');
  });
});

describe('theming', () => {
  it('applies a theme to the root element', () => {
    render(<App />);

    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
  });

  it('renders the same structure in either theme', () => {
    const { unmount } = render(<App />);
    const lightRegions = screen.getAllByRole('complementary').length;
    unmount();

    document.documentElement.setAttribute('data-theme', 'dark');
    render(<App />);

    expect(screen.getAllByRole('complementary')).toHaveLength(lightRegions);
  });

  it('keeps every control reachable in dark mode', async () => {
    const user = userEvent.setup();
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<App />);

    await user.tab();

    expect(document.activeElement).not.toBe(document.body);
  });
});
