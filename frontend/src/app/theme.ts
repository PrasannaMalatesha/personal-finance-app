import { createTheme, alpha } from '@mui/material/styles';

// Palette centered on a muted teal (finance app tone, not the default MUI blue).
// Slate neutrals with a warm off-white background so cards pop without being harsh.
const teal = {
  50: '#e6f4f1',
  100: '#c2e4dc',
  200: '#9dd3c7',
  300: '#75c2b0',
  400: '#54b39d',
  500: '#0f766e', // primary
  600: '#0c5f58',
  700: '#0a4842',
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

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: teal[500],
      dark: teal[700],
      light: teal[300],
      contrastText: '#ffffff',
    },
    secondary: {
      main: slate[700],
      contrastText: '#ffffff',
    },
    background: {
      default: '#f7f9fb',
      paper: '#ffffff',
    },
    text: {
      primary: slate[900],
      secondary: slate[600],
    },
    divider: slate[200],
    success: { main: '#15803d' },
    warning: { main: '#b45309' },
    error: { main: '#b91c1c' },
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
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { paddingInline: 16, paddingBlock: 8 },
        containedPrimary: {
          '&:hover': { backgroundColor: teal[600] },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${slate[200]}`,
          boxShadow: `0 1px 3px 0 ${alpha(slate[900], 0.04)}, 0 1px 2px -1px ${alpha(slate[900], 0.04)}`,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          borderBottom: `1px solid ${slate[200]}`,
        },
      },
    },
    MuiLink: {
      defaultProps: { underline: 'hover' },
    },
  },
});

// Exported so pages can pull matching gradient bg / brand colors without
// hardcoding hex values twice.
export const brand = { teal, slate };
