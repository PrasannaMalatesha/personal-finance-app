import type { ReactNode } from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { brand } from '../../app/theme';

/**
 * Centered card for /login and /signup. Light mode: soft teal wash gradient
 * with a subtle radial highlight so the surface has depth without shouting.
 * Dark mode: solid deep parchment. Card itself borrows the same treatment
 * shared by dashboard "raised" surfaces so the visual language is coherent.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Light: soft teal wash + a radial highlight. Dark: solid.
        background: (t) =>
          t.palette.mode === 'dark'
            ? t.palette.background.default
            : `radial-gradient(1200px 600px at 50% -10%, ${brand.teal[100]} 0%, ${brand.teal[50]} 35%, ${t.palette.background.default} 70%)`,
        py: { xs: 4, md: 8 },
        px: 2,
      }}
    >
      <Container maxWidth="xs" disableGutters>
        <Stack spacing={4} alignItems="center" className="pfa-fade-up">
          <Stack spacing={0.75} alignItems="center">
            <Box
              sx={(t) => ({
                width: 56,
                height: 56,
                borderRadius: `${t.pfa.radius.md}px`,
                background: `linear-gradient(135deg, ${brand.teal[500]}, ${brand.teal[700]})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: '-0.02em',
                boxShadow: t.pfa.elevation.card,
              })}
              aria-hidden
            >
              ₹
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Personal Finance
            </Typography>
          </Stack>

          <Box
            sx={(t) => ({
              width: '100%',
              backgroundColor: 'background.paper',
              border: `1px solid ${t.palette.divider}`,
              borderRadius: `${t.pfa.radius.lg}px`,
              boxShadow: t.pfa.elevation.dialog,
              p: { xs: 3, sm: 4 },
            })}
          >
            <Stack spacing={0.75} sx={{ mb: 3 }}>
              <Typography variant="h3" component="h1">
                {title}
              </Typography>
              {subtitle && (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              )}
            </Stack>

            {children}
          </Box>

          {footer && (
            <Typography variant="body2" color="text.secondary">
              {footer}
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
