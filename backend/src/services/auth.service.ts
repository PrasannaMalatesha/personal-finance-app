import type { Pool, PoolClient } from 'pg';
import type { Logger } from 'pino';
import type { Clock } from '../lib/clock';
import type { TokenSigner } from '../lib/tokens';
import { REFRESH_TTL_SEC } from '../lib/tokens';
import type { PasswordHasher } from '../lib/password';
import { withTransaction } from '../lib/tx';
import type { UsersRepo, UserRow } from '../repositories/users.repo';
import type { RefreshTokensRepo } from '../repositories/refreshTokens.repo';
import type {
  UserPublic,
  UpdateProfileInput,
  ChangePasswordInput,
  DeleteAccountInput,
} from '../schemas/auth';
import { CURRENCY_CODES } from '../schemas/auth';
import {
  ConflictError,
  UnauthenticatedError,
  NotFoundError,
  ValidationError,
} from '../errors/AppError';

export interface AuthServiceDeps {
  pool: Pool;
  usersRepo: UsersRepo;
  refreshTokensRepo: RefreshTokensRepo;
  clock: Clock;
  tokenSigner: TokenSigner;
  passwordHasher: PasswordHasher;
  logger: Logger;
  /** Hook run inside the signup transaction — used to seed default categories. */
  onUserCreated?: (userId: string, client: PoolClient) => Promise<void>;
}

export interface AuthResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
}

function toUserPublic(row: UserRow): UserPublic {
  const currency = row.base_currency.trim();
  if (!(CURRENCY_CODES as readonly string[]).includes(currency)) {
    throw new Error(`Unexpected base_currency in DB: ${currency}`);
  }
  return {
    id: row.id,
    email: row.email,
    baseCurrency: currency as UserPublic['baseCurrency'],
    createdAt: row.created_at.toISOString(),
    hasPassword: row.password_hash !== null,
    hasGoogle: row.google_sub !== null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export function createAuthService(deps: AuthServiceDeps) {
  const {
    pool,
    usersRepo,
    refreshTokensRepo,
    clock,
    tokenSigner,
    passwordHasher,
    logger,
    onUserCreated,
  } = deps;

  async function issueTokensFor(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const { token: accessToken } = tokenSigner.signAccess(userId);
    const refreshToken = tokenSigner.generateRefreshToken();
    const tokenHash = tokenSigner.hashRefreshToken(refreshToken);
    const expiresAt = new Date(clock.now().getTime() + REFRESH_TTL_SEC * 1000);
    await refreshTokensRepo.create({ userId, tokenHash, expiresAt });
    return { accessToken, refreshToken };
  }

  async function signup(input: {
    email: string;
    password: string;
    baseCurrency: string;
  }): Promise<AuthResult> {
    const existing = await usersRepo.findByEmail(input.email);
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await passwordHasher.hash(input.password);

    // Atomic: user insert + seed defaults + refresh token issuance all in one tx.
    // If any step fails, the whole signup rolls back — no partial user.
    const { user, refreshToken } = await withTransaction(pool, async (client) => {
      let created: UserRow;
      try {
        created = await usersRepo.create(
          {
            email: input.email,
            passwordHash,
            baseCurrency: input.baseCurrency,
          },
          client,
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError('Email already registered');
        }
        throw err;
      }

      if (onUserCreated) {
        await onUserCreated(created.id, client);
      }

      const refresh = tokenSigner.generateRefreshToken();
      const tokenHash = tokenSigner.hashRefreshToken(refresh);
      const expiresAt = new Date(clock.now().getTime() + REFRESH_TTL_SEC * 1000);
      await refreshTokensRepo.create(
        { userId: created.id, tokenHash, expiresAt },
        client,
      );

      return { user: created, refreshToken: refresh };
    });

    const { token: accessToken } = tokenSigner.signAccess(user.id);
    return { user: toUserPublic(user), accessToken, refreshToken };
  }

  async function login(input: {
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const user = await usersRepo.findByEmail(input.email);
    if (!user) throw new UnauthenticatedError('Invalid credentials');
    // OAuth-only accounts have no password; reject cleanly without a
    // separate error message (avoids revealing which sign-in method the
    // account uses).
    if (!user.password_hash) throw new UnauthenticatedError('Invalid credentials');

    const ok = await passwordHasher.verify(input.password, user.password_hash);
    if (!ok) throw new UnauthenticatedError('Invalid credentials');

    const { accessToken, refreshToken } = await issueTokensFor(user.id);
    return { user: toUserPublic(user), accessToken, refreshToken };
  }

  type RefreshOutcome =
    | { kind: 'success'; result: AuthResult }
    | { kind: 'not_found' }
    | { kind: 'expired' }
    | { kind: 'user_missing' }
    | { kind: 'reuse'; userId: string };

  async function refresh(oldRefreshToken: string): Promise<AuthResult> {
    const tokenHash = tokenSigner.hashRefreshToken(oldRefreshToken);
    const now = clock.now();

    const outcome = await withTransaction(pool, async (client): Promise<RefreshOutcome> => {
      const row = await refreshTokensRepo.findByHashForUpdate(client, tokenHash);
      if (!row) return { kind: 'not_found' };
      if (row.revoked_at !== null) return { kind: 'reuse', userId: row.user_id };
      if (row.expires_at.getTime() <= now.getTime()) return { kind: 'expired' };

      await refreshTokensRepo.revoke(row.id, now, client);

      const user = await usersRepo.findById(row.user_id, client);
      if (!user) return { kind: 'user_missing' };

      const newRefreshToken = tokenSigner.generateRefreshToken();
      const newTokenHash = tokenSigner.hashRefreshToken(newRefreshToken);
      const expiresAt = new Date(now.getTime() + REFRESH_TTL_SEC * 1000);
      await refreshTokensRepo.create(
        { userId: user.id, tokenHash: newTokenHash, expiresAt },
        client,
      );

      const { token: accessToken } = tokenSigner.signAccess(user.id);
      return {
        kind: 'success',
        result: {
          user: toUserPublic(user),
          accessToken,
          refreshToken: newRefreshToken,
        },
      };
    });

    switch (outcome.kind) {
      case 'success':
        return outcome.result;
      case 'not_found':
        throw new UnauthenticatedError('Invalid refresh token');
      case 'expired':
        throw new UnauthenticatedError('Refresh token expired');
      case 'user_missing':
        throw new NotFoundError('User');
      case 'reuse':
        logger.warn(
          { userId: outcome.userId },
          'Refresh token reuse detected — revoking all tokens',
        );
        await withTransaction(pool, (client) =>
          refreshTokensRepo.revokeAllForUser(outcome.userId, now, client),
        );
        throw new UnauthenticatedError('Token reuse detected');
    }
  }

  async function logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = tokenSigner.hashRefreshToken(refreshToken);
    await withTransaction(pool, async (client) => {
      const row = await refreshTokensRepo.findByHashForUpdate(client, tokenHash);
      if (row && row.revoked_at === null) {
        await refreshTokensRepo.revoke(row.id, clock.now(), client);
      }
    });
  }

  async function me(userId: string): Promise<UserPublic> {
    const user = await usersRepo.findById(userId);
    if (!user) throw new UnauthenticatedError();
    return toUserPublic(user);
  }

  async function updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserPublic> {
    if (input.baseCurrency !== undefined) {
      await usersRepo.updateBaseCurrency(userId, input.baseCurrency);
    }
    const fresh = await usersRepo.findById(userId);
    if (!fresh) throw new NotFoundError('User');
    return toUserPublic(fresh);
  }

  /**
   * Two paths, disambiguated by the account's current password_hash:
   *   - Password user: currentPassword is required and must verify.
   *   - OAuth-only user: currentPassword must be omitted; a fresh password
   *     is set (they'll be able to log in with email + password afterward).
   * Revokes every existing refresh session on success so an attacker who
   * grabbed a session can't outlast the change.
   */
  async function changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await usersRepo.findById(userId);
    if (!user) throw new UnauthenticatedError();

    if (user.password_hash) {
      if (!input.currentPassword) {
        throw new ValidationError('currentPassword is required');
      }
      const ok = await passwordHasher.verify(input.currentPassword, user.password_hash);
      if (!ok) throw new UnauthenticatedError('Current password is incorrect');
    } else {
      // OAuth-only user setting a password for the first time.
      if (input.currentPassword) {
        throw new ValidationError(
          'currentPassword must be omitted when adding a password to an OAuth-only account',
        );
      }
    }

    const newHash = await passwordHasher.hash(input.newPassword);
    await withTransaction(pool, async (client) => {
      await usersRepo.updatePasswordHash(userId, newHash, client);
      await refreshTokensRepo.revokeAllForUser(userId, clock.now(), client);
    });
  }

  /**
   * Unlink the Google identity. Refuses when the user has no password —
   * that would leave them unable to sign in.
   */
  async function unlinkGoogle(userId: string): Promise<void> {
    const user = await usersRepo.findById(userId);
    if (!user) throw new UnauthenticatedError();
    if (!user.password_hash) {
      throw new ValidationError(
        'Set a password before unlinking Google, otherwise you would lose access to the account',
      );
    }
    if (!user.google_sub) {
      // Idempotent — treat as no-op rather than error.
      return;
    }
    await usersRepo.clearGoogleSub(userId);
  }

  /**
   * Delete the account. Client sends the current email as a confirmation —
   * catches obvious "clicked wrong button" mistakes. FK ON DELETE CASCADE
   * on every downstream table wipes accounts, transactions, categories,
   * rules, budgets, plaid_items, refresh_tokens, etc.
   */
  async function deleteAccount(
    userId: string,
    input: DeleteAccountInput,
  ): Promise<void> {
    const user = await usersRepo.findById(userId);
    if (!user) throw new UnauthenticatedError();
    if (user.email.toLowerCase() !== input.confirmEmail.toLowerCase()) {
      throw new ValidationError('Confirmation email does not match');
    }
    const deleted = await usersRepo.deleteById(userId);
    if (!deleted) throw new NotFoundError('User');
  }

  return {
    signup,
    login,
    refresh,
    logout,
    me,
    updateProfile,
    changePassword,
    unlinkGoogle,
    deleteAccount,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
