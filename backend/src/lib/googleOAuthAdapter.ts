import { OAuth2Client } from 'google-auth-library';

/**
 * Thin wrapper around google-auth-library — trims the surface we depend on
 * to three calls and makes the whole thing injectable for tests.
 *
 * Google's OAuth 2.0 authorization-code flow:
 *   1. Browser hits /auth/oauth/google/start → we build authorize URL, 302.
 *   2. Google returns to /callback?code=…&state=… after user consent.
 *   3. We exchange the code for tokens; the ID token is a signed JWT whose
 *      payload identifies the user (sub, email, email_verified, name).
 */
export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

export interface GoogleOAuthAdapter {
  /** Build the redirect URL for step 1. */
  getAuthorizeUrl(input: { state: string }): string;
  /** Exchange the ?code from the callback for an ID token (verified). */
  verifyCode(input: { code: string }): Promise<GoogleIdTokenPayload>;
}

export interface GoogleOAuthAdapterConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function createGoogleOAuthAdapter(
  config: GoogleOAuthAdapterConfig,
): GoogleOAuthAdapter {
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });

  return {
    getAuthorizeUrl({ state }) {
      return client.generateAuthUrl({
        access_type: 'online', // no refresh token — we only need identity
        scope: ['openid', 'email', 'profile'],
        state,
        prompt: 'select_account',
      });
    },

    async verifyCode({ code }) {
      const { tokens } = await client.getToken({
        code,
        redirect_uri: config.redirectUri,
      });
      if (!tokens.id_token) throw new Error('Google exchange returned no id_token');
      // verifyIdToken checks signature against Google's JWKS + expiry + audience.
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Google id_token has no payload');
      if (!payload.sub || !payload.email) {
        throw new Error('Google id_token missing required claims');
      }
      return {
        sub: payload.sub,
        email: payload.email,
        email_verified: Boolean(payload.email_verified),
        name: payload.name,
      };
    },
  };
}
