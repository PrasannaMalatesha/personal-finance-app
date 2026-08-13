import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import type { Pool } from 'pg';
import { createOAuthService } from '../../src/services/oauth.service';
import type { GoogleOAuthAdapter } from '../../src/lib/googleOAuthAdapter';
import type { UsersRepo, UserRow } from '../../src/repositories/users.repo';
import type { RefreshTokensRepo } from '../../src/repositories/refreshTokens.repo';
import type { CategoriesService } from '../../src/services/categories.service';
import type { RulesService } from '../../src/services/rules.service';
import type { TokenSigner } from '../../src/lib/tokens';
import type { Clock } from '../../src/lib/clock';

const silentLogger = pino({ level: 'silent' });

function fakePool(): Pool {
  const client = { query: vi.fn(async () => ({ rowCount: 0, rows: [] })), release: vi.fn() };
  return { connect: async () => client, query: vi.fn() } as unknown as Pool;
}

function makeMocks(overrides: {
  adapter?: Partial<GoogleOAuthAdapter>;
  usersRepo?: Partial<UsersRepo>;
} = {}) {
  const googleAdapter: GoogleOAuthAdapter = {
    getAuthorizeUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/auth?state=xyz'),
    verifyCode: vi.fn(async () => ({
      sub: 'google-sub-123',
      email: 'newuser@example.com',
      email_verified: true,
      name: 'New User',
    })),
    ...overrides.adapter,
  };
  const usersRepo = {
    findByGoogleSub: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
    findById: vi.fn(),
    createOAuth: vi.fn(async (input) => ({
      id: 'user-new',
      email: input.email,
      password_hash: null,
      base_currency: input.baseCurrency,
      google_sub: input.googleSub,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    linkGoogleSub: vi.fn(async () => {}),
    create: vi.fn(),
    updatePasswordHash: vi.fn(),
    ...overrides.usersRepo,
  } as UsersRepo;
  const refreshTokensRepo = {
    create: vi.fn(async () => ({
      id: 'rt-1',
      user_id: 'user-1',
      token_hash: 'h',
      expires_at: new Date(),
      revoked_at: null,
      created_at: new Date(),
    })),
    findByHashForUpdate: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
  } as unknown as RefreshTokensRepo;
  const categoriesService = { seedDefaultsForUser: vi.fn(async () => {}) } as unknown as CategoriesService;
  const rulesService = { seedDefaultsForUser: vi.fn(async () => {}) } as unknown as RulesService;
  const tokenSigner: TokenSigner = {
    signAccess: vi.fn(() => ({ token: 'access-jwt', expiresAt: new Date() })),
    verifyAccess: vi.fn(),
    generateRefreshToken: vi.fn(() => 'refresh-raw'),
    hashRefreshToken: vi.fn(() => 'refresh-hash'),
  } as unknown as TokenSigner;
  const clock: Clock = { now: () => new Date('2026-08-13T00:00:00Z') };

  return { googleAdapter, usersRepo, refreshTokensRepo, categoriesService, rulesService, tokenSigner, clock };
}

const existingUser: UserRow = {
  id: 'user-existing',
  email: 'existing@example.com',
  password_hash: 'hash',
  base_currency: 'USD',
  google_sub: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const linkedUser: UserRow = {
  ...existingUser,
  id: 'user-linked',
  google_sub: 'google-sub-123',
};

describe('OAuthService.startFlow', () => {
  it('returns a fresh state and the adapter-built authorize URL', () => {
    const m = makeMocks();
    const svc = createOAuthService({
      pool: fakePool(),
      googleAdapter: m.googleAdapter,
      usersRepo: m.usersRepo,
      refreshTokensRepo: m.refreshTokensRepo,
      categoriesService: m.categoriesService,
      rulesService: m.rulesService,
      tokenSigner: m.tokenSigner,
      clock: m.clock,
      logger: silentLogger,
    });
    const a = svc.startFlow();
    const b = svc.startFlow();
    expect(a.authorizeUrl).toBe('https://accounts.google.com/o/oauth2/auth?state=xyz');
    expect(a.state).not.toBe(b.state);
    expect(a.state.length).toBeGreaterThanOrEqual(24);
  });
});

describe('OAuthService.completeFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects on state mismatch (CSRF)', async () => {
    const m = makeMocks();
    const svc = createOAuthService({
      pool: fakePool(),
      googleAdapter: m.googleAdapter,
      usersRepo: m.usersRepo,
      refreshTokensRepo: m.refreshTokensRepo,
      categoriesService: m.categoriesService,
      rulesService: m.rulesService,
      tokenSigner: m.tokenSigner,
      clock: m.clock,
      logger: silentLogger,
    });
    await expect(
      svc.completeFlow({ code: 'c', stateFromQuery: 'a', stateFromCookie: 'b' }),
    ).rejects.toThrow(/state mismatch/);
    expect(m.googleAdapter.verifyCode).not.toHaveBeenCalled();
  });

  it('path A: existing google-linked account → issues tokens for that user', async () => {
    const m = makeMocks({
      usersRepo: { findByGoogleSub: vi.fn(async () => linkedUser) },
    });
    const svc = createOAuthService({
      pool: fakePool(),
      googleAdapter: m.googleAdapter,
      usersRepo: m.usersRepo,
      refreshTokensRepo: m.refreshTokensRepo,
      categoriesService: m.categoriesService,
      rulesService: m.rulesService,
      tokenSigner: m.tokenSigner,
      clock: m.clock,
      logger: silentLogger,
    });
    const res = await svc.completeFlow({
      code: 'c',
      stateFromQuery: 's',
      stateFromCookie: 's',
    });
    expect(res.userId).toBe('user-linked');
    expect(m.usersRepo.linkGoogleSub).not.toHaveBeenCalled();
    expect(m.usersRepo.createOAuth).not.toHaveBeenCalled();
    expect(m.tokenSigner.signAccess).toHaveBeenCalledWith('user-linked');
  });

  it('path B: existing password account with verified email → links google_sub', async () => {
    const m = makeMocks({
      usersRepo: {
        findByGoogleSub: vi.fn(async () => null),
        findByEmail: vi.fn(async () => existingUser),
      },
    });
    const svc = createOAuthService({
      pool: fakePool(),
      googleAdapter: m.googleAdapter,
      usersRepo: m.usersRepo,
      refreshTokensRepo: m.refreshTokensRepo,
      categoriesService: m.categoriesService,
      rulesService: m.rulesService,
      tokenSigner: m.tokenSigner,
      clock: m.clock,
      logger: silentLogger,
    });
    const res = await svc.completeFlow({
      code: 'c',
      stateFromQuery: 's',
      stateFromCookie: 's',
    });
    expect(m.usersRepo.linkGoogleSub).toHaveBeenCalledWith(
      'user-existing',
      'google-sub-123',
    );
    expect(res.userId).toBe('user-existing');
    expect(m.usersRepo.createOAuth).not.toHaveBeenCalled();
  });

  it('refuses to link when Google says email is NOT verified', async () => {
    const m = makeMocks({
      adapter: {
        verifyCode: vi.fn(async () => ({
          sub: 'google-sub-x',
          email: 'existing@example.com',
          email_verified: false,
          name: 'X',
        })),
      },
      usersRepo: {
        findByGoogleSub: vi.fn(async () => null),
        findByEmail: vi.fn(async () => existingUser),
      },
    });
    const svc = createOAuthService({
      pool: fakePool(),
      googleAdapter: m.googleAdapter,
      usersRepo: m.usersRepo,
      refreshTokensRepo: m.refreshTokensRepo,
      categoriesService: m.categoriesService,
      rulesService: m.rulesService,
      tokenSigner: m.tokenSigner,
      clock: m.clock,
      logger: silentLogger,
    });
    await expect(
      svc.completeFlow({ code: 'c', stateFromQuery: 's', stateFromCookie: 's' }),
    ).rejects.toThrow(/not verified/);
    expect(m.usersRepo.linkGoogleSub).not.toHaveBeenCalled();
  });

  it('path C: no existing account → createOAuth + seed defaults', async () => {
    const m = makeMocks();
    const svc = createOAuthService({
      pool: fakePool(),
      googleAdapter: m.googleAdapter,
      usersRepo: m.usersRepo,
      refreshTokensRepo: m.refreshTokensRepo,
      categoriesService: m.categoriesService,
      rulesService: m.rulesService,
      tokenSigner: m.tokenSigner,
      clock: m.clock,
      logger: silentLogger,
    });
    const res = await svc.completeFlow({
      code: 'c',
      stateFromQuery: 's',
      stateFromCookie: 's',
    });
    expect(m.usersRepo.createOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newuser@example.com',
        baseCurrency: 'USD',
        googleSub: 'google-sub-123',
      }),
      expect.anything(),
    );
    expect(m.categoriesService.seedDefaultsForUser).toHaveBeenCalled();
    expect(m.rulesService.seedDefaultsForUser).toHaveBeenCalled();
    expect(res.userId).toBe('user-new');
  });
});
