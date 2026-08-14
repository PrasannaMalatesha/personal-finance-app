import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { darkTheme, lightTheme, type ColorMode } from './theme';
import { ColorModeContext, COLOR_MODE_STORAGE_KEY } from './colorMode';

function readStoredOverride(): ColorMode | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

/**
 * Wraps ThemeProvider + CssBaseline. Priority order:
 *   1. User override stored in localStorage
 *   2. `prefers-color-scheme` from the OS
 *   3. 'light' fallback
 *
 * The toggle button cycles override through light → dark → follow-system.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [override, setOverrideState] = useState<ColorMode | null>(() => readStoredOverride());

  const mode: ColorMode = override ?? (systemPrefersDark ? 'dark' : 'light');
  const theme = useMemo(() => (mode === 'dark' ? darkTheme : lightTheme), [mode]);

  const setOverride = useCallback((next: ColorMode | null) => {
    setOverrideState(next);
    if (typeof window === 'undefined') return;
    if (next) window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
    else window.localStorage.removeItem(COLOR_MODE_STORAGE_KEY);
  }, []);

  const toggle = useCallback(() => {
    // light → dark → follow-system (null) → light → …
    setOverride(override === 'light' ? 'dark' : override === 'dark' ? null : 'light');
  }, [override, setOverride]);

  // Keep the <meta name="theme-color"> in sync so mobile browsers match.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = theme.palette.background.default;
  }, [theme]);

  const ctx = useMemo(
    () => ({ mode, override, toggle, setOverride }),
    [mode, override, toggle, setOverride],
  );

  return (
    <ColorModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
