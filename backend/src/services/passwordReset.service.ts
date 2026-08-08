import { randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Clock } from '../lib/clock';
import { sha256 } from '../lib/hash';
import type { PasswordHasher } from '../lib/password';
import { withTransaction } from '../lib/tx';
import type { EmailAdapter } from '../lib/emailAdapter';
import type { UsersRepo } from '../repositories/users.repo';
import type { PasswordResetTokensRepo } from '../repositories/passwordResetTokens.repo';
import type { RefreshTokensRepo } from '../repositories/refreshTokens.repo';
import type {
  RequestResetInput,
  ResetPasswordInput,
} from '../schemas/passwordReset';
import { UnauthenticatedError } from '../errors/AppError';

const RESET_TOKEN_TTL_SEC = 60 * 60; // 1 hour
const RESET_TOKEN_BYTES = 32;

export interface PasswordResetServiceDeps {
  pool: Pool;
  usersRepo: UsersRepo;
  passwordResetTokensRepo: PasswordResetTokensRepo;
  refreshTokensRepo: RefreshTokensRepo;
  passwordHasher: PasswordHasher;
  clock: Clock;
  logger: Logger;
  emailAdapter: EmailAdapter;
  /** Public origin used to build the reset URL sent to the user. */
  frontendOrigin: string;
}

export function createPasswordResetService(deps: PasswordResetServiceDeps) {
  const {
    pool,
    usersRepo,
    passwordResetTokensRepo,
    refreshTokensRepo,
    passwordHasher,
    clock,
    logger,
    emailAdapter,
    frontendOrigin,
  } = deps;

  /**
   * Always returns void — the endpoint always responds 200 regardless of
   * whether the email exists, to avoid user enumeration. Any errors during
   * token creation or email send are logged but not surfaced.
   */
  async function requestReset(input: RequestResetInput): Promise<void> {
    const user = await usersRepo.findByEmail(input.email);
    if (!user) {
      logger.info(
        { email: input.email },
        'Password reset requested for unknown email — silently ignoring',
      );
      return;
    }

    // Raw token → sent to user; hash → stored server-side. Stolen DB dump
    // can't be replayed as an active reset link.
    const rawToken = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(clock.now().getTime() + RESET_TOKEN_TTL_SEC * 1000);

    try {
      await passwordResetTokensRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      const resetUrl = `${frontendOrigin.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await emailAdapter.sendPasswordReset({
        to: user.email,
        resetUrl,
        ttlMinutes: RESET_TOKEN_TTL_SEC / 60,
      });
    } catch (err) {
      // Don't leak the failure — 200 back to the caller regardless.
      logger.error({ err, userId: user.id }, 'Password reset send failed');
    }
  }

  /**
   * Verify token + rewrite password + mark token used + revoke every
   * existing refresh token for this user. All in one DB transaction so
   * a partial failure leaves nothing changed.
   */
  async function resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = sha256(input.token);

    await withTransaction(pool, async (client) => {
      const row = await passwordResetTokensRepo.findByHash(tokenHash, client);
      if (!row) throw new UnauthenticatedError('Invalid or expired reset token');
      const now = clock.now();
      if (row.used_at !== null) {
        throw new UnauthenticatedError('Reset token already used');
      }
      if (row.expires_at.getTime() <= now.getTime()) {
        throw new UnauthenticatedError('Reset token has expired');
      }

      const newHash = await passwordHasher.hash(input.newPassword);
      await usersRepo.updatePasswordHash(row.user_id, newHash, client);
      await passwordResetTokensRepo.markUsed(row.id, now, client);
      // Kick out every other logged-in session for this user.
      await refreshTokensRepo.revokeAllForUser(row.user_id, now, client);
    });
  }

  return { requestReset, resetPassword };
}

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;
