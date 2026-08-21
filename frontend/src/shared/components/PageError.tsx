import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export type PageErrorVariant = 'not-found' | 'generic' | 'unauthenticated' | 'network';

interface Copy {
  code: string;
  title: string;
  description: string;
  primary?: { label: string; to?: string; onClick?: () => void };
  secondary?: { label: string; to?: string; onClick?: () => void };
}

// Copy names the problem AND the recovery — the "controls name their
// action" habit from the craft floor. Kept short so error pages don't
// feel like an essay.
const COPY: Record<PageErrorVariant, Copy> = {
  'not-found': {
    code: '404',
    title: "Nothing here",
    description:
      "The page you tried to open isn't part of the app, or the link is out of date.",
    primary: { label: 'Back to dashboard', to: '/dashboard' },
  },
  generic: {
    code: 'ERR',
    title: 'Something went wrong',
    description:
      "The screen failed to render. Reloading usually fixes it; if not, please tell us what you were doing.",
    primary: { label: 'Reload', onClick: () => window.location.reload() },
    secondary: { label: 'Back to dashboard', to: '/dashboard' },
  },
  unauthenticated: {
    code: '401',
    title: 'Session ended',
    description:
      'For your security, sessions end after a while of inactivity. Log in again to pick up where you left off.',
    primary: { label: 'Log in', to: '/login' },
  },
  network: {
    code: 'NET',
    title: 'Can’t reach the server',
    description:
      "The app is up, but the API isn't responding. Check your connection and try again.",
    primary: { label: 'Retry', onClick: () => window.location.reload() },
  },
};

/**
 * Full-screen error surface used by the router (404), the app error boundary
 * (generic), the auth guard (unauthenticated), and the API client (network).
 * One layout, four voices — swap the variant to change the copy + affordance.
 *
 * Sits in a plain <Box> rather than <Surface> because it's a full page, not
 * a card — and using page background keeps focus on the message.
 */
export function PageError({
  variant = 'generic',
  onRetry,
}: {
  variant?: PageErrorVariant;
  onRetry?: () => void;
}) {
  const copy = COPY[variant];
  const primary = onRetry
    ? { label: 'Retry', onClick: onRetry }
    : copy.primary;

  return (
    <Box
      sx={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ maxWidth: 480, textAlign: 'center' }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ letterSpacing: '0.16em' }}
        >
          {copy.code}
        </Typography>
        <Stack spacing={1.5} alignItems="center">
          <Typography variant="h2" component="h1">
            {copy.title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {copy.description}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.5}>
          {primary && (
            primary.to ? (
              <Button
                variant="contained"
                component={RouterLink}
                to={primary.to}
                size="large"
              >
                {primary.label}
              </Button>
            ) : (
              <Button variant="contained" onClick={primary.onClick} size="large">
                {primary.label}
              </Button>
            )
          )}
          {copy.secondary && (
            copy.secondary.to ? (
              <Button
                variant="text"
                component={RouterLink}
                to={copy.secondary.to}
                size="large"
              >
                {copy.secondary.label}
              </Button>
            ) : (
              <Button variant="text" onClick={copy.secondary.onClick} size="large">
                {copy.secondary.label}
              </Button>
            )
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
