import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { THEME_STORAGE_KEY, type ThemeEnvironment } from './themeStore';

/** A controllable stand-in for `prefers-color-scheme`. */
class FakeMediaQuery {
  matches: boolean;
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener);
  }

  /** Simulates the operating system switching theme while the app is open. */
  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) {
      listener({ matches } as MediaQueryListEvent);
    }
  }
}

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

interface Harness {
  readonly environment: ThemeEnvironment;
  readonly media: FakeMediaQuery;
  readonly storage: MemoryStorage;
  readonly root: HTMLElement;
}

function createHarness(options: { systemDark?: boolean; storage?: MemoryStorage } = {}): Harness {
  const media = new FakeMediaQuery(options.systemDark ?? false);
  const storage = options.storage ?? new MemoryStorage();
  const root = document.createElement('html');

  return {
    media,
    storage,
    root,
    environment: {
      root,
      storage,
      matchMedia: () => media as unknown as MediaQueryList,
    },
  };
}

function ThemeProbe() {
  const { theme, preference, setPreference, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="preference">{preference}</span>
      <button onClick={() => setPreference('light')}>choose light</button>
      <button onClick={() => setPreference('dark')}>choose dark</button>
      <button onClick={() => setPreference('system')}>choose system</button>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function renderWithHarness(harness: Harness) {
  return render(
    <ThemeProvider environment={harness.environment}>
      <ThemeProbe />
    </ThemeProvider>,
  );
}

const currentTheme = (): string => screen.getByTestId('theme').textContent ?? '';
const currentPreference = (): string => screen.getByTestId('preference').textContent ?? '';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider — system preference default', () => {
  it('follows a light operating system when nothing is stored', () => {
    const harness = createHarness({ systemDark: false });
    renderWithHarness(harness);

    expect(currentTheme()).toBe('light');
    expect(currentPreference()).toBe('system');
    expect(harness.root.getAttribute('data-theme')).toBe('light');
  });

  it('follows a dark operating system when nothing is stored', () => {
    const harness = createHarness({ systemDark: true });
    renderWithHarness(harness);

    expect(currentTheme()).toBe('dark');
    expect(harness.root.getAttribute('data-theme')).toBe('dark');
  });
});

describe('ThemeProvider — live system changes', () => {
  it('updates when the operating system switches while open', () => {
    const harness = createHarness({ systemDark: false });
    renderWithHarness(harness);
    expect(currentTheme()).toBe('light');

    act(() => {
      harness.media.set(true);
    });

    expect(currentTheme()).toBe('dark');
    expect(harness.root.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores system changes once the user has chosen explicitly', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ systemDark: false });
    renderWithHarness(harness);

    await user.click(screen.getByRole('button', { name: 'choose light' }));
    act(() => {
      harness.media.set(true);
    });

    expect(currentTheme()).toBe('light');
  });

  it('resumes following the system when the preference returns to system', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ systemDark: false });
    renderWithHarness(harness);

    await user.click(screen.getByRole('button', { name: 'choose dark' }));
    expect(currentTheme()).toBe('dark');

    act(() => {
      harness.media.set(false);
    });
    await user.click(screen.getByRole('button', { name: 'choose system' }));

    expect(currentTheme()).toBe('light');
  });
});

describe('ThemeProvider — explicit override', () => {
  it('overrides a dark operating system with an explicit light choice', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ systemDark: true });
    renderWithHarness(harness);
    expect(currentTheme()).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'choose light' }));

    expect(currentTheme()).toBe('light');
    expect(currentPreference()).toBe('light');
    expect(harness.root.getAttribute('data-theme')).toBe('light');
  });

  it('toggles between light and dark', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ systemDark: false });
    renderWithHarness(harness);

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(currentTheme()).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(currentTheme()).toBe('light');
  });
});

describe('ThemeProvider — persistence across reloads', () => {
  it('restores an explicit choice after a remount', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();

    const first = renderWithHarness(createHarness({ systemDark: true, storage }));
    await user.click(screen.getByRole('button', { name: 'choose light' }));
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    first.unmount();

    // A fresh provider stands in for reloading the page.
    renderWithHarness(createHarness({ systemDark: true, storage }));

    expect(currentTheme()).toBe('light');
    expect(currentPreference()).toBe('light');
  });

  it('treats an unreadable stored value as system', () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'chartreuse');

    renderWithHarness(createHarness({ systemDark: true, storage }));

    expect(currentPreference()).toBe('system');
    expect(currentTheme()).toBe('dark');
  });

  it('still themes correctly when storage is unavailable', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ systemDark: false });
    const withoutStorage: ThemeEnvironment = { ...harness.environment, storage: null };

    render(
      <ThemeProvider environment={withoutStorage}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'choose dark' }));

    expect(currentTheme()).toBe('dark');
    expect(harness.root.getAttribute('data-theme')).toBe('dark');
  });
});

describe('useTheme', () => {
  it('fails clearly when used outside a provider', () => {
    expect(() => render(<ThemeProbe />)).toThrow(/ThemeProvider/);
  });
});
