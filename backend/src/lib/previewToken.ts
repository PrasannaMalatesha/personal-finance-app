import jwt from 'jsonwebtoken';
import type { ParsedRow } from './csv';

const PREVIEW_AUDIENCE = 'import-preview';
const PREVIEW_TTL_SEC = 5 * 60;

export interface PreviewTokenPayload {
  userId: string;
  accountId: string;
  rows: ParsedRow[];
}

export interface PreviewTokenSigner {
  sign(payload: PreviewTokenPayload): { token: string; expiresInSec: number };
  verify(token: string, expected: { userId: string }): PreviewTokenPayload;
}

export class InvalidPreviewTokenError extends Error {
  constructor(message = 'previewToken is invalid or expired') {
    super(message);
    this.name = 'InvalidPreviewTokenError';
  }
}

/**
 * Sign / verify the previewToken (TRD §7.1 I7). Distinct `aud` claim keeps it
 * incompatible with the access token even though we sign with the same secret.
 * The token binds userId + accountId + parsed rows so commit-time reconciliation
 * cannot be tricked by swapping cookies or account IDs. TTL is short (5m).
 */
export function createPreviewTokenSigner(secret: string): PreviewTokenSigner {
  return {
    sign(payload) {
      const token = jwt.sign(
        {
          accountId: payload.accountId,
          rows: payload.rows,
        },
        secret,
        {
          subject: payload.userId,
          audience: PREVIEW_AUDIENCE,
          expiresIn: PREVIEW_TTL_SEC,
        },
      );
      return { token, expiresInSec: PREVIEW_TTL_SEC };
    },

    verify(token, expected) {
      let decoded: jwt.JwtPayload | string;
      try {
        decoded = jwt.verify(token, secret, { audience: PREVIEW_AUDIENCE });
      } catch {
        throw new InvalidPreviewTokenError();
      }
      if (typeof decoded !== 'object' || decoded === null) {
        throw new InvalidPreviewTokenError();
      }
      const { sub, accountId, rows } = decoded as {
        sub?: unknown;
        accountId?: unknown;
        rows?: unknown;
      };
      if (typeof sub !== 'string' || typeof accountId !== 'string' || !Array.isArray(rows)) {
        throw new InvalidPreviewTokenError();
      }
      if (sub !== expected.userId) {
        throw new InvalidPreviewTokenError('previewToken issued to a different user');
      }
      return { userId: sub, accountId, rows: rows as ParsedRow[] };
    },
  };
}
