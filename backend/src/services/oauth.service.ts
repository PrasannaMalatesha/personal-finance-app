import { randomBytes } from 'crypto';
import type { Logger } from 'pino';
import type { Clock } from '../lib/clock';
import type { TokenSigner } from '../lib/tokens';
import { REFRESH_TTL_SEC } from '../lib/tokens';
import type { GoogleOAuthAdapter } from '../lib/googleOAuthAdapter';
import type { UsersRepo } from '../repositories/users.repo';
import type { RefreshTokensRepo } from '../repositories/refreshTokens.repo';
import type { CategoriesService } from './categories.service';
import type { RulesService } from './rules.service';
import type { Pool } from 'pg';
import { withTransaction } from '../lib/tx';

export interface OAuthServiceDeps {
  pool: Pool;
  googleAdapter: GoogleOAuthAdapter;
  usersRepo: UsersRepo;
  refreshTokensRepo: RefreshTokensRepo;
  categoriesService: CategoriesService;
  rulesService: RulesService;
  tokenSigner: TokenSigner;
  clock: Clock;
  logger: Logger;
}

export interface OAuthSessionResult {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface OAuthService {
  startFlow(): { authorizeUrl: string; state: string };
  completeFlow(input: {
    code: string;
    stateFromQuery: string;
    stateFromCookie: string;
  }): Promise<OAuthSessionResult>;
}

/**
 * Google sign-in flow:
 *   startFlow  → random state + built authorize URL. State is stored by the
 *                controller in a short-lived signed cookie; the callback
 *                compares that cookie to the ?state query param.
 *   completeFlow →
 *     - reject if state mismatch (CSRF)
 *     - verify code with adapter → get { sub, email, email_verified }
 *     - find user: (a) by google_sub, (b) if not, by email (auto-link when
 *       email_verified), (c) otherwise create a fresh OAuth-only user
 *     - issue our own JWT access + refresh session
 */
export function createOAuthService(deps: OAuthServiceDeps): OAuthService {
  const {
    pool,
    googleAdapter,
    usersRepo,
    refreshTokensRepo,
    categoriesService,
    rulesService,
    tokenSigner,
    clock,
    logger,
  } = deps;

  function startFlow() {
    const state = randomBytes(24).toString('base64url');
    const authorizeUrl = googleAdapter.getAuthorizeUrl({ state });
    return { authorizeUrl, state };
  }

  async function issueTokensFor(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { token: accessToken } = tokenSigner.signAccess(userId);
    const refreshToken = tokenSigner.generateRefreshToken();
    const tokenHash = tokenSigner.hashRefreshToken(refreshToken);
    const expiresAt = new Date(clock.now().getTime() + REFRESH_TTL_SEC * 1000);
    await refreshTokensRepo.create({ userId, tokenHash, expiresAt });
    return { accessToken, refreshToken };
  }

  async function completeFlow({
    code,
    stateFromQuery,
    stateFromCookie,
  }: {
    code: string;
    stateFromQuery: string;
    stateFromCookie: string;
  }): Promise<OAuthSessionResult> {
    if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
      throw new Error('OAuth state mismatch');
    }
    const payload = await googleAdapter.verifyCode({ code });

    // Path A: existing account already linked to this Google sub.
    const user = await usersRepo.findByGoogleSub(payload.sub);
    if (user) {
      logger.info({ userId: user.id }, 'OAuth: existing google-linked account');
      const tokens = await issueTokensFor(user.id);
      return { userId: user.id, ...tokens };
    }

    // Path B: existing password account with the same verified email.
    // Only link when Google has verified the email — otherwise a malicious
    // Google account could hijack a password account by claiming its email.
    const byEmail = await usersRepo.findByEmail(payload.email);
    if (byEmail && payload.email_verified) {
      await usersRepo.linkGoogleSub(byEmail.id, payload.sub);
      logger.info({ userId: byEmail.id }, 'OAuth: linked to existing password account');
      const tokens = await issueTokensFor(byEmail.id);
      return { userId: byEmail.id, ...tokens };
    }
    if (byEmail && !payload.email_verified) {
      // Same email but Google hasn't verified it — refuse to auto-link.
      throw new Error('Google account email is not verified');
    }

    // Path C: brand-new user. Signup transaction — user row + default
    // categories + default rules + refresh token, all rolled back on any
    // failure. Currency defaults to USD; a follow-up settings page lets the
    // user change it later.
    const { userId, refreshToken } = await withTransaction(pool, async (client) => {
      const created = await usersRepo.createOAuth(
        { email: payload.email, baseCurrency: 'USD', googleSub: payload.sub },
        client,
      );
      await categoriesService.seedDefaultsForUser(created.id, client);
      await rulesService.seedDefaultsForUser(created.id, client);
      const refresh = tokenSigner.generateRefreshToken();
      const expiresAt = new Date(clock.now().getTime() + REFRESH_TTL_SEC * 1000);
      await refreshTokensRepo.create(
        { userId: created.id, tokenHash: tokenSigner.hashRefreshToken(refresh), expiresAt },
        client,
      );
      return { userId: created.id, refreshToken: refresh };
    });
    const { token: accessToken } = tokenSigner.signAccess(userId);
    logger.info({ userId }, 'OAuth: created new user');
    return { userId, accessToken, refreshToken };
  }

  return { startFlow, completeFlow };
}
