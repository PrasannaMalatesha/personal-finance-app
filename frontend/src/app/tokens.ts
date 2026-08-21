/**
 * Design tokens — single source of truth for the visual system.
 *
 * Voice: editorial minimalism with a glass signature on elevated surfaces.
 * Restrained by default; hover / focus / entry are where the app "speaks".
 *
 * These are consumed by theme.ts (colors + typography), motion.ts (easings
 * + durations), and inline sx props on components that need to reach past
 * MUI's own tokens (e.g. glass surfaces).
 */

// ---------- Type scale ------------------------------------------------------
// Modular scale @ 1.2 (minor third) — comfortable for finance data density
// without shouting. Base 16px; sizes rounded to whole px so text renders
// crisply on non-retina displays.
export const type = {
  fontFamily:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMono:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
  scale: {
    display: { size: 48, lh: 1.05, tracking: '-0.03em', weight: 700 },
    h1: { size: 34, lh: 1.15, tracking: '-0.02em', weight: 700 },
    h2: { size: 26, lh: 1.2, tracking: '-0.015em', weight: 700 },
    h3: { size: 20, lh: 1.3, tracking: '-0.01em', weight: 700 },
    title: { size: 16, lh: 1.4, tracking: '-0.005em', weight: 600 },
    body: { size: 14, lh: 1.55, tracking: 0, weight: 400 },
    bodyLg: { size: 16, lh: 1.55, tracking: 0, weight: 400 },
    caption: { size: 12, lh: 1.45, tracking: '0.02em', weight: 500 },
    overline: { size: 11, lh: 1.4, tracking: '0.08em', weight: 600 },
  },
} as const;

// ---------- Spacing rhythm --------------------------------------------------
// MUI uses 8pt; kept aligned. Named tokens give component authors a shared
// vocabulary — "sizeIntent(4)" reads better than a bare number in a sx prop.
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ---------- Radii -----------------------------------------------------------
export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// ---------- Elevation -------------------------------------------------------
// Two-layer soft shadows — one 1px sharp for definition, one wider diffuse
// for depth. Values scale with mode (opacity per mode set in theme).
export const elevation = {
  card: {
    light: '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)',
    dark: '0 1px 2px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.35)',
  },
  cardHover: {
    light: '0 2px 4px rgba(15,23,42,0.06), 0 12px 28px rgba(15,23,42,0.08)',
    dark: '0 2px 4px rgba(0,0,0,0.55), 0 12px 28px rgba(0,0,0,0.5)',
  },
  dialog: {
    light: '0 8px 16px rgba(15,23,42,0.08), 0 24px 48px rgba(15,23,42,0.12)',
    dark: '0 8px 16px rgba(0,0,0,0.55), 0 24px 48px rgba(0,0,0,0.55)',
  },
} as const;

// ---------- Motion ----------------------------------------------------------
// Durations tuned to "purposeful, not decorative" — hover 120ms feels
// instant; entry 360ms is deliberate enough to notice but not sluggish.
export const motion = {
  duration: {
    fast: 120,
    med: 200,
    slow: 360,
  },
  easing: {
    /** Material-style ease-out — most page + card work. */
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    /**
     * Strong ease-out from Emil's playbook. Punchier than MUI's default;
     * used for UI responses (button press release, hover exits, dropdowns).
     * Feels crisp because the initial movement is instant — where the
     * user is watching most closely.
     */
    emil: 'cubic-bezier(0.23, 1, 0.32, 1)',
    /** Strong ease-in-out for on-screen movement (drawers, morphs). */
    inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
    /** Overshoot for playful bits (rare). */
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    /** Symmetric ease for theme swaps + reversible transitions. */
    linear: 'cubic-bezier(0.4, 0, 0.6, 1)',
  },
} as const;

// ---------- Semantic colors -------------------------------------------------
// These layer over MUI's palette — they name intents that MUI doesn't
// natively express (e.g. "surface tinted with primary for KPIs").
export const semantic = {
  // Warmer neutrals than pure slate — reads editorial, not clinical.
  neutrals: {
    ink: '#0B1220', // warm near-black
    inkSubtle: '#334155',
    inkMuted: '#64748B',
    parchment: '#FBFAF7', // warm off-white bg for light mode
    paper: '#FFFFFF',
    line: '#E7EAEE',
    // Dark mode
    inkDark: '#F5F7FA',
    parchmentDark: '#0A0F1A', // deeper than slate.900 for editorial contrast
    paperDark: '#141B27',
    lineDark: '#232B39',
  },
  // Glass surface — background varies with mode; blur is constant.
  glass: {
    bgLight: 'rgba(255, 255, 255, 0.62)',
    bgDark: 'rgba(20, 27, 39, 0.55)',
    borderLight: 'rgba(255, 255, 255, 0.7)',
    borderDark: 'rgba(255, 255, 255, 0.08)',
    blur: 'blur(14px) saturate(140%)',
  },
} as const;
