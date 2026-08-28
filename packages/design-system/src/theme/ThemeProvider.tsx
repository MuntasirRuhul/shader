import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ThemeName } from '../tokens/types';
import {
  applyTheme,
  browserEnvironment,
  readStoredPreference,
  resolveTheme,
  watchSystemTheme,
  writeStoredPreference,
  type ThemeEnvironment,
  type ThemePreference,
} from './themeStore';

export interface ThemeContextValue {
  /** What the user chose, including `system`. */
  readonly preference: ThemePreference;
  /** The theme actually in effect right now. */
  readonly theme: ThemeName;
  readonly setPreference: (preference: ThemePreference) => void;
  /** Flips between light and dark, leaving `system` behind. */
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Injectable for tests; defaults to the real document, storage, and media query. */
  readonly environment?: ThemeEnvironment;
}

export function ThemeProvider({ children, environment }: ThemeProviderProps) {
  const env = useMemo(() => environment ?? browserEnvironment(), [environment]);

  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(env),
  );
  const [systemThemeName, setSystemThemeName] = useState<ThemeName>(() =>
    resolveTheme('system', env),
  );

  const theme: ThemeName = preference === 'system' ? systemThemeName : preference;

  // Follow the operating system while the preference is `system`. The listener
  // stays attached either way so returning to `system` is immediately correct.
  useEffect(() => watchSystemTheme(env, setSystemThemeName), [env]);

  useEffect(() => {
    applyTheme(env, theme);
  }, [env, theme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      writeStoredPreference(env, next);
    },
    [env],
  );

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [setPreference, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference, toggleTheme }),
    [preference, theme, setPreference, toggleTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs beside its provider
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return value;
}
