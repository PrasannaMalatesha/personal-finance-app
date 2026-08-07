import type { Logger } from 'pino';

/**
 * Minimal email sender interface — kept small so a Resend/Postmark adapter
 * can drop in later without touching callers. Everything is text-safe;
 * HTML rendering is a v3 concern.
 */
export interface EmailAdapter {
  sendPasswordReset(input: {
    to: string;
    resetUrl: string;
    ttlMinutes: number;
  }): Promise<void>;
}

/**
 * Fallback adapter — logs the reset URL to server stdout at info level.
 * Suitable for local dev, staging, and the portfolio demo (a reviewer can
 * grab the link from Render logs). PII (email address) is intentionally
 * redacted by the pino logger config in prod.
 */
export function createConsoleEmailAdapter(logger: Logger): EmailAdapter {
  return {
    async sendPasswordReset({ to, resetUrl, ttlMinutes }) {
      logger.info(
        { to, resetUrl, ttlMinutes },
        'Password reset requested — click the URL to complete (console adapter, no email sent)',
      );
    },
  };
}
