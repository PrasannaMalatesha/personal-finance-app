import type { ReactNode } from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { brand } from '../../app/theme';

/**
 * Centered card wrapper for /login and /signup. Softly tinted gradient bg,
 * brand mark on top, card auto-sized to the form.
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
        background: `linear-gradient(180deg, ${brand.teal[50]} 0%, ${brand.slate[50]} 60%)`,
        py: { xs: 4, md: 8 },
        px: 2,
      }}
    >
      <Container maxWidth="xs" disableGutters>
        <Stack spacing={4} alignItems="center">
          <Stack spacing={0.5} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${brand.teal[500]}, ${brand.teal[700]})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: '-0.02em',
              }}
              aria-hidden
            >
              ₹
            </Box>
            <Typography variant="body2" color="text.secondary">
              Personal Finance
            </Typography>
          </Stack>

          <Box
            sx={{
              width: '100%',
              backgroundColor: 'background.paper',
              border: (t) => `1px solid ${t.palette.divider}`,
              borderRadius: 3,
              boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)',
              p: { xs: 3, sm: 4 },
            }}
          >
            <Stack spacing={0.5} sx={{ mb: 3 }}>
              <Typography variant="h5" component="h1">
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
