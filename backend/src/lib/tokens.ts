import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { hmacSha256 } from './hash';

export interface AccessTokenPayload {
  sub: string;
}

export interface TokenSigner {
  signAccess(userId: string): { token: string; expiresInSec: number };
  verifyAccess(token: string): AccessTokenPayload;
  generateRefreshToken(): string;
  hashRefreshToken(token: string): string;
}

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

export function createTokenSigner(
  accessSecret: string,
  refreshSecret: string,
): TokenSigner {
  return {
    signAccess(userId) {
      const token = jwt.sign({ sub: userId }, accessSecret, {
        expiresIn: ACCESS_TTL_SEC,
      });
      return { token, expiresInSec: ACCESS_TTL_SEC };
    },
    verifyAccess(token) {
      const decoded = jwt.verify(token, accessSecret);
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        typeof (decoded as { sub?: unknown }).sub !== 'string'
      ) {
        throw new Error('Invalid token payload');
      }
      return decoded as AccessTokenPayload;
    },
    generateRefreshToken() {
      return randomBytes(48).toString('base64url');
    },
    hashRefreshToken(token) {
      return hmacSha256(token, refreshSecret);
    },
  };
}
