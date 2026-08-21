import { Box, type BoxProps } from '@mui/material';
import { forwardRef, type ReactNode } from 'react';

type Variant = 'plain' | 'raised' | 'glass' | 'accent';

/**
 * Shared surface primitive — one place to apply the app's card / KPI-tile
 * treatment consistently. Wraps a Box so any Box prop still works.
 *
 * Variants:
 *   plain  — flat, bordered. Neutral card look.
 *   raised — plain + soft shadow that deepens on hover; slight lift on hover.
 *   glass  — translucent bg + backdrop blur. The app's "signature" surface
 *            (dashboard KPIs, dialog headers). Falls back gracefully to a
 *            solid paper background where backdrop-filter isn't supported.
 *   accent — subtle teal-tinted background (used for a KPI hero card).
 */
export interface SurfaceProps extends Omit<BoxProps, 'component'> {
  variant?: Variant;
  hover?: boolean;
  children?: ReactNode;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { variant = 'plain', hover = false, sx, children, ...rest },
  ref,
) {
  return (
    <Box
      ref={ref}
      {...rest}
      sx={[
        (t) => ({
          borderRadius: `${t.pfa.radius.lg}px`,
          border: `1px solid ${t.palette.divider}`,
          backgroundColor: t.palette.background.paper,
          transition: `box-shadow ${t.pfa.motion.duration.med}ms ${t.pfa.motion.easing.standard}, transform ${t.pfa.motion.duration.med}ms ${t.pfa.motion.easing.standard}, border-color ${t.pfa.motion.duration.med}ms ${t.pfa.motion.easing.standard}, background-color ${t.pfa.motion.duration.med}ms ${t.pfa.motion.easing.standard}`,
          ...(variant === 'raised' && { boxShadow: t.pfa.elevation.card }),
          ...(variant === 'glass' && {
            backgroundColor: t.pfa.glass.bg,
            border: `1px solid ${t.pfa.glass.border}`,
            backdropFilter: t.pfa.glass.blur,
            WebkitBackdropFilter: t.pfa.glass.blur,
            boxShadow: t.pfa.elevation.card,
          }),
          ...(variant === 'accent' && {
            background: `linear-gradient(135deg, ${t.palette.primary.main}0d 0%, ${t.palette.primary.main}05 100%)`,
            borderColor: `${t.palette.primary.main}33`,
            boxShadow: t.pfa.elevation.card,
          }),
          ...(hover && {
            '&:hover': {
              boxShadow: t.pfa.elevation.cardHover,
              transform: 'translateY(-2px)',
              borderColor:
                variant === 'accent' ? `${t.palette.primary.main}66` : t.palette.divider,
            },
          }),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
});
