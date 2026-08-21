import { createTheme, alpha, type Theme } from '@mui/material/styles';
import { elevation, motion, radius, semantic, type } from './tokens';

export type ColorMode = 'light' | 'dark';

/**
 * MUI Theme augmentation — see theme.d.ts. Duplicating the declare block
 * here (in the module we actually import from every consumer) guarantees
 * TypeScript picks the augmentation up regardless of tsconfig include order.
 */
export interface PfaTheme {
  glass: { bg: string; border: string; blur: string };
  elevation: { card: string; cardHover: string; dialog: string };
  motion: typeof motion;
  radius: typeof radius;
}
declare module '@mui/material/styles' {
  interface Theme {
    pfa: PfaTheme;
  }
  interface ThemeOptions {
    pfa?: PfaTheme;
  }
}

// Teal primary — kept from the previous palette but re-anchored around the
// warmer neutrals in tokens.semantic. Values chosen for AA contrast against
// paper in both modes.
const teal = {
  50: '#EDF7F5',
  100: '#CFEAE3',
  200: '#A9D9CD',
  300: '#7CC3B2',
  400: '#4DAB96',
  500: '#0F766E',
  600: '#0B5D57',
  700: '#08453F',
};

const tealDark = {
  400: '#2DD4BF',
  500: '#5EEAD4',
  600: '#99F6E4',
};

function createAppTheme(mode: ColorMode): Theme {
  const isDark = mode === 'dark';
  const N = semantic.neutrals;
  const G = semantic.glass;

  const primaryMain = isDark ? tealDark[500] : teal[500];
  const bg = {
    default: isDark ? N.parchmentDark : N.parchment,
    paper: isDark ? N.paperDark : N.paper,
  };
  const border = isDark ? N.lineDark : N.line;
  const cardShadow = isDark ? elevation.card.dark : elevation.card.light;
  const cardShadowHover = isDark ? elevation.cardHover.dark : elevation.cardHover.light;
  const dialogShadow = isDark ? elevation.dialog.dark : elevation.dialog.light;
  const glassBg = isDark ? G.bgDark : G.bgLight;
  const glassBorder = isDark ? G.borderDark : G.borderLight;

  // Helper to spell out the type scale block for MUI.
  const t = (
    v: { size: number; lh: number; tracking: string | number; weight: number },
  ) => ({
    fontSize: `${v.size / 16}rem`,
    lineHeight: v.lh,
    letterSpacing: v.tracking,
    fontWeight: v.weight,
  });

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryMain,
        dark: isDark ? tealDark[400] : teal[700],
        light: isDark ? tealDark[600] : teal[300],
        contrastText: isDark ? N.ink : '#ffffff',
      },
      secondary: {
        main: isDark ? '#94A3B8' : '#475569',
        contrastText: isDark ? N.ink : '#ffffff',
      },
      background: bg,
      text: {
        primary: isDark ? N.inkDark : N.ink,
        secondary: isDark ? '#94A3B8' : N.inkSubtle,
      },
      divider: border,
      success: { main: isDark ? '#4ADE80' : '#15803D' },
      warning: { main: isDark ? '#FBBF24' : '#B45309' },
      error: { main: isDark ? '#F87171' : '#B91C1C' },
    },
    typography: {
      fontFamily: type.fontFamily,
      h1: t(type.scale.h1),
      h2: t(type.scale.h2),
      h3: t(type.scale.h3),
      h4: t(type.scale.h2), // MUI's h4 is our biggest page-header; map to editorial h2
      h5: t(type.scale.h3),
      h6: t(type.scale.title),
      subtitle1: t(type.scale.title),
      subtitle2: t(type.scale.title),
      body1: t(type.scale.body),
      body2: t(type.scale.body),
      caption: t(type.scale.caption),
      overline: {
        ...t(type.scale.overline),
        textTransform: 'uppercase',
      },
      button: {
        fontWeight: 600,
        textTransform: 'none',
        letterSpacing: 0,
        fontSize: `${14 / 16}rem`,
      },
    },
    shape: { borderRadius: radius.md },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Smooth theme swap without flashing.
          body: {
            transition: `background-color ${motion.duration.slow}ms ${motion.easing.linear}, color ${motion.duration.slow}ms ${motion.easing.linear}`,
          },
          // Global entry animation utility. Components opt in via
          // className="pfa-fade-up" when they want a subtle entrance.
          '@keyframes pfa-fade-up': {
            from: { opacity: 0, transform: 'translateY(6px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '.pfa-fade-up': {
            animation: `pfa-fade-up ${motion.duration.slow}ms ${motion.easing.standard} both`,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            paddingInline: 16,
            paddingBlock: 8,
            borderRadius: radius.md,
            transition: `background-color ${motion.duration.fast}ms ${motion.easing.standard}, transform ${motion.duration.fast}ms ${motion.easing.standard}, box-shadow ${motion.duration.fast}ms ${motion.easing.standard}`,
          },
          containedPrimary: {
            '&:hover': { backgroundColor: isDark ? tealDark[400] : teal[600] },
          },
          outlined: {
            borderColor: border,
            '&:hover': {
              borderColor: isDark ? tealDark[400] : teal[500],
              backgroundColor: alpha(primaryMain, 0.06),
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: `background-color ${motion.duration.fast}ms ${motion.easing.standard}`,
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            transition: `box-shadow ${motion.duration.fast}ms ${motion.easing.standard}`,
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(primaryMain, 0.18)}`,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${border}`,
            borderRadius: radius.lg,
            boxShadow: cardShadow,
            transition: `box-shadow ${motion.duration.med}ms ${motion.easing.standard}, transform ${motion.duration.med}ms ${motion.easing.standard}, border-color ${motion.duration.med}ms ${motion.easing.standard}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          // Outlined papers (used by TableContainer + AccountsPage) — round
          // corners + border tint consistent with cards.
          outlined: {
            borderRadius: radius.lg,
            borderColor: border,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: border,
          },
          head: {
            fontWeight: 600,
            fontSize: `${12 / 16}rem`,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : N.inkMuted,
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'default' },
        styleOverrides: {
          root: {
            // Glass app bar — the app's other signature moment beyond dashboard KPIs.
            backgroundColor: glassBg,
            backdropFilter: G.blur,
            WebkitBackdropFilter: G.blur,
            borderBottom: `1px solid ${border}`,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: radius.lg,
            boxShadow: dialogShadow,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: radius.pill,
            fontWeight: 500,
          },
        },
      },
      MuiLink: {
        defaultProps: { underline: 'hover' },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: radius.md,
            boxShadow: dialogShadow,
            border: `1px solid ${border}`,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: radius.sm,
            fontSize: `${12 / 16}rem`,
            paddingInline: 10,
            paddingBlock: 6,
          },
        },
      },
    },
    // Custom fields exposed via the theme so components can reach these
    // without importing tokens directly (keeps sx props readable).
    ...({
      pfa: {
        glass: {
          bg: glassBg,
          border: glassBorder,
          blur: G.blur,
        },
        elevation: {
          card: cardShadow,
          cardHover: cardShadowHover,
          dialog: dialogShadow,
        },
        motion,
        radius,
      },
    } as Record<string, unknown>),
  });
}

export const lightTheme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');

/** Back-compat export — legacy imports keep working. */
export const theme = lightTheme;

// Exported so pages can pull matching gradient bg / brand colors without
// hardcoding hex values twice.
export const brand = {
  teal,
  neutrals: semantic.neutrals,
};
