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

export interface ResendEmailAdapterConfig {
  apiKey: string;
  /** RFC 5322 address — e.g. "Personal Finance <noreply@yourdomain.com>". */
  fromEmail: string;
  logger: Logger;
  /** Injectable for tests; defaults to global fetch (Node 20+). */
  fetchImpl?: typeof fetch;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends transactional email via Resend's REST API. Uses the platform
 * `fetch` — no SDK dependency. Throws on non-2xx so the caller's error
 * path runs (the password-reset service swallows + logs, keeping the
 * public 200-always contract intact).
 */
export function createResendEmailAdapter(
  config: ResendEmailAdapterConfig,
): EmailAdapter {
  const { apiKey, fromEmail, logger } = config;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async sendPasswordReset({ to, resetUrl, ttlMinutes }) {
      const subject = 'Reset your Personal Finance password';
      const text = [
        'We received a request to reset your password.',
        '',
        `Open the link below within ${ttlMinutes} minutes to choose a new one:`,
        resetUrl,
        '',
        "If you didn't ask for this, you can safely ignore this email — your password won't change.",
      ].join('\n');
      const safeUrl = escapeHtml(resetUrl);
      const html = `<p>We received a request to reset your password.</p>
<p>Open the link below within ${ttlMinutes} minutes to choose a new one:</p>
<p><a href="${safeUrl}">${safeUrl}</a></p>
<p>If you didn't ask for this, you can safely ignore this email — your password won't change.</p>`;

      const res = await fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromEmail, to, subject, text, html }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error(
          { status: res.status, body },
          'Resend rejected password-reset email',
        );
        throw new Error(`Resend send failed with status ${res.status}`);
      }
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
