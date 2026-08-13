import { Button, Divider, Stack, Typography } from '@mui/material';

/**
 * Kicks off the OAuth flow by top-level-navigating to the backend's
 * /auth/oauth/google/start endpoint. Backend sets a signed state cookie
 * and 302s to Google. On return, cookies are set and the user is
 * redirected back to the app root.
 */
export function GoogleSignInButton({ label }: { label?: string }) {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const href = `${apiBase.replace(/\/$/, '')}/api/v1/auth/oauth/google/start`;

  return (
    <Stack spacing={2}>
      <Divider>
        <Typography variant="caption" color="text.secondary">
          or
        </Typography>
      </Divider>
      <Button
        variant="outlined"
        size="large"
        fullWidth
        component="a"
        href={href}
        startIcon={<GoogleGlyph />}
      >
        {label ?? 'Continue with Google'}
      </Button>
    </Stack>
  );
}

// Inline Google "G" — avoids a font/image dependency.
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.6 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.5 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.7-9.8 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.5 28.6c-1-2.9-1-6 0-8.9l-7.9-6.1C-.6 19.1-.6 28.9 2.6 34.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.4 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.6 2.2-8.6 2.2-6.3 0-11.6-4-13.5-9.7l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
