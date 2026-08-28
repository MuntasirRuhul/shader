import type { ThemeName } from '../tokens/types';

/** What the user chose. `system` means "follow the operating system". */
export type ThemePreference = ThemeName | 'system';

export const THEME_STORAGE_KEY = 'shader-builder.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export interface ThemeEnvironment {
  /** Where the `data-theme` attribute is written. */
  readonly root: HTMLElement;
  /** Persistence. Optional so a private-mode failure degrades instead of throwing. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly matchMedia: ((query: string) => MediaQueryList) | null;
}

export function browserEnvironment(): ThemeEnvironment {
  return {
    root: document.documentElement,
    storage: safeStorage(),
    matchMedia: typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null,
  };
}

/** Storage access throws outright in some privacy modes, so probe it once. */
function safeStorage(): ThemeEnvironment['storage'] {
  try {
    const probeKey = `${THEME_STORAGE_KEY}.probe`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readStoredPreference(environment: ThemeEnvironment): ThemePreference {
  try {
    const stored = environment.storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeStoredPreference(
  environment: ThemeEnvironment,
  preference: ThemePreference,
): void {
  try {
    environment.storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Persistence is a convenience; losing it must never break theming.
  }
}

export function systemTheme(environment: ThemeEnvironment): ThemeName {
  return environment.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

/** The theme actually applied, once the preference is resolved against the system. */
export function resolveTheme(
  preference: ThemePreference,
  environment: ThemeEnvironment,
): ThemeName {
  return preference === 'system' ? systemTheme(environment) : preference;
}

/**
 * Writes the resolved theme to the root element. The generated stylesheet keys
 * off `data-theme`, so this attribute is the whole switching mechanism.
 */
export function applyTheme(environment: ThemeEnvironment, theme: ThemeName): void {
  environment.root.setAttribute('data-theme', theme);
}

/** Subscribes to operating-system theme changes. Returns an unsubscribe function. */
export function watchSystemTheme(
  environment: ThemeEnvironment,
  onChange: (theme: ThemeName) => void,
): () => void {
  const query = environment.matchMedia?.(DARK_QUERY);
  if (!query) return () => undefined;

  const listener = (event: MediaQueryListEvent): void => {
    onChange(event.matches ? 'dark' : 'light');
  };

  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}
