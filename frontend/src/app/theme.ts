import { createTheme, alpha, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

// Palette centered on a muted teal (finance app tone, not the default MUI blue).
// Slate neutrals with a warm off-white background so cards pop without being harsh.
const teal = {
  50: '#e6f4f1',
  100: '#c2e4dc',
  200: '#9dd3c7',
  300: '#75c2b0',
  400: '#54b39d',
  500: '#0f766e', // primary (light mode)
  600: '#0c5f58',
  700: '#0a4842',
};

// Dark-mode teal — slightly lifted so it holds contrast against near-black.
const tealDark = {
  400: '#2dd4bf',
  500: '#5eead4',
  600: '#99f6e4',
};

const slate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
};

function createAppTheme(mode: ColorMode): Theme {
  const isDark = mode === 'dark';
  const primaryMain = isDark ? tealDark[500] : teal[500];
  const bg = {
    default: isDark ? slate[900] : '#f7f9fb',
    paper: isDark ? slate[800] : '#ffffff',
  };
  const border = isDark ? slate[700] : slate[200];
  const appBarBg = isDark ? slate[800] : '#ffffff';
  const cardShadowColor = isDark ? '#000000' : slate[900];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryMain,
        dark: isDark ? tealDark[400] : teal[700],
        light: isDark ? tealDark[600] : teal[300],
        contrastText: isDark ? slate[900] : '#ffffff',
      },
      secondary: {
        main: isDark ? slate[300] : slate[700],
        contrastText: isDark ? slate[900] : '#ffffff',
      },
      background: bg,
      text: {
        primary: isDark ? slate[50] : slate[900],
        secondary: isDark ? slate[400] : slate[600],
      },
      divider: border,
      success: { main: isDark ? '#4ade80' : '#15803d' },
      warning: { main: isDark ? '#fbbf24' : '#b45309' },
      error: { main: isDark ? '#f87171' : '#b91c1c' },
    },
    typography: {
      fontFamily:
        '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: { fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontWeight: 700, letterSpacing: '-0.02em' },
      h3: { fontWeight: 700, letterSpacing: '-0.02em' },
      h4: { fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { paddingInline: 16, paddingBlock: 8 },
          containedPrimary: {
            '&:hover': { backgroundColor: isDark ? tealDark[400] : teal[600] },
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${border}`,
            boxShadow: `0 1px 3px 0 ${alpha(cardShadowColor, isDark ? 0.4 : 0.04)}, 0 1px 2px -1px ${alpha(cardShadowColor, isDark ? 0.4 : 0.04)}`,
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'default' },
        styleOverrides: {
          root: {
            backgroundColor: appBarBg,
            borderBottom: `1px solid ${border}`,
          },
        },
      },
      MuiLink: {
        defaultProps: { underline: 'hover' },
      },
    },
  });
}

export const lightTheme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');

/** Back-compat export — legacy imports keep working. */
export const theme = lightTheme;

// Exported so pages can pull matching gradient bg / brand colors without
// hardcoding hex values twice.
export const brand = { teal, slate };
