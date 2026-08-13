import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createUsersRepo } from './repositories/users.repo';
import { createRefreshTokensRepo } from './repositories/refreshTokens.repo';
import { createIdempotencyKeysRepo } from './repositories/idempotencyKeys.repo';
import { createCategoriesRepo } from './repositories/categories.repo';
import { createAccountsRepo } from './repositories/accounts.repo';
import { createTransactionsRepo } from './repositories/transactions.repo';
import { createRulesRepo } from './repositories/rules.repo';
import { createImportBatchesRepo } from './repositories/importBatches.repo';
import { createBudgetsRepo } from './repositories/budgets.repo';
import { createDashboardRepo } from './repositories/dashboard.repo';
import { createRecurringRepo } from './repositories/recurring.repo';
import { createPasswordResetTokensRepo } from './repositories/passwordResetTokens.repo';
import { createFxRatesRepo } from './repositories/fxRates.repo';
import { createFrankfurterAdapter } from './lib/fxAdapter';
import { createFxService } from './services/fx.service';
import { createPlaidItemsRepo } from './repositories/plaidItems.repo';
import { createPlaidAdapter } from './lib/plaidAdapter';
import { createPlaidService, type PlaidService } from './services/plaid.service';
import { createAesGcm } from './lib/crypto';
import {
  createPlaidController,
  type PlaidController,
} from './controllers/plaid.controller';
import { createGoogleOAuthAdapter } from './lib/googleOAuthAdapter';
import { createOAuthService, type OAuthService } from './services/oauth.service';
import {
  createOAuthController,
  type OAuthController,
} from './controllers/oauth.controller';
import { createAuthService, type AuthService } from './services/auth.service';
import { createPasswordResetService } from './services/passwordReset.service';
import { createCategoriesService } from './services/categories.service';
import { createAccountsService } from './services/accounts.service';
import { createCategorizationService } from './services/categorization.service';
import { createTransactionsService } from './services/transactions.service';
import { createCsvImportService } from './services/csvImport.service';
import { createBudgetsService } from './services/budgets.service';
import { createDashboardService } from './services/dashboard.service';
import { createRulesService } from './services/rules.service';
import { createRecurringService } from './services/recurring.service';
import { createAuthController, type AuthController } from './controllers/auth.controller';
import { createCategoriesController, type CategoriesController } from './controllers/categories.controller';
import { createAccountsController, type AccountsController } from './controllers/accounts.controller';
import { createTransactionsController, type TransactionsController } from './controllers/transactions.controller';
import { createImportsController, type ImportsController } from './controllers/imports.controller';
import { createBudgetsController, type BudgetsController } from './controllers/budgets.controller';
import { createDashboardController, type DashboardController } from './controllers/dashboard.controller';
import { createRulesController, type RulesController } from './controllers/rules.controller';
import { createRecurringController, type RecurringController } from './controllers/recurring.controller';
import { createPasswordResetController, type PasswordResetController } from './controllers/passwordReset.controller';
import { createAuthMiddleware } from './middleware/auth';
import {
  createConsoleEmailAdapter,
  createResendEmailAdapter,
} from './lib/emailAdapter';
import { createIdempotency, type IdempotencyWrapper } from './middleware/idempotency';
import { createTokenSigner } from './lib/tokens';
import { createPreviewTokenSigner } from './lib/previewToken';
import { bcryptHasher } from './lib/password';
import { systemClock } from './lib/clock';

export interface Container {
  authService: AuthService;
  authController: AuthController;
  categoriesController: CategoriesController;
  accountsController: AccountsController;
  transactionsController: TransactionsController;
  importsController: ImportsController;
  budgetsController: BudgetsController;
  dashboardController: DashboardController;
  rulesController: RulesController;
  recurringController: RecurringController;
  passwordResetController: PasswordResetController;
  plaidController: PlaidController | null;
  oauthController: OAuthController | null;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  idempotent: IdempotencyWrapper;
}

export interface ContainerConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  /** Public origin for building reset URLs sent to users. */
  frontendOrigin: string;
  /** Both must be present to enable Resend; otherwise the console adapter runs. */
  resendApiKey?: string;
  resendFromEmail?: string;
  /** Both client_id + secret must be present to enable Plaid; otherwise plaidController stays null. */
  plaidClientId?: string;
  plaidSecret?: string;
  plaidEnv?: 'sandbox' | 'development' | 'production';
  /** Shown as the connecting-app name inside Plaid Link. */
  plaidClientName?: string;
  /** AES-256-GCM key (base64, 32 bytes) for encrypting access tokens at rest. */
  plaidEncryptionKey?: string;
  /** Google OAuth: both required together to enable sign-in-with-Google. */
  googleClientId?: string;
  googleClientSecret?: string;
  /** Public origin of this backend, used to build the OAuth redirect URI. */
  apiBaseUrl?: string;
}

function pickEmailAdapter(config: ContainerConfig, logger: Logger) {
  if (config.resendApiKey && config.resendFromEmail) {
    logger.info(
      { fromEmail: config.resendFromEmail },
      'Password reset email adapter: Resend',
    );
    return createResendEmailAdapter({
      apiKey: config.resendApiKey,
      fromEmail: config.resendFromEmail,
      logger,
    });
  }
  logger.info(
    'Password reset email adapter: console (set RESEND_API_KEY + RESEND_FROM_EMAIL to enable real email)',
  );
  return createConsoleEmailAdapter(logger);
}

export function buildContainer(
  pool: Pool,
  logger: Logger,
  config: ContainerConfig,
): Container {
  const tokenSigner = createTokenSigner(
    config.jwtAccessSecret,
    config.jwtRefreshSecret,
  );

  const usersRepo = createUsersRepo(pool);
  const refreshTokensRepo = createRefreshTokensRepo(pool);
  const idempotencyKeysRepo = createIdempotencyKeysRepo();
  const categoriesRepo = createCategoriesRepo(pool);
  const accountsRepo = createAccountsRepo(pool);
  const transactionsRepo = createTransactionsRepo(pool);
  const rulesRepo = createRulesRepo(pool);
  const importBatchesRepo = createImportBatchesRepo(pool);
  const budgetsRepo = createBudgetsRepo(pool);
  const dashboardRepo = createDashboardRepo(pool);
  const recurringRepo = createRecurringRepo(pool);
  const passwordResetTokensRepo = createPasswordResetTokensRepo(pool);
  const fxRatesRepo = createFxRatesRepo(pool);
  const fxAdapter = createFrankfurterAdapter({ logger });
  const fxService = createFxService({ fxAdapter, fxRatesRepo, logger });
  // Encrypt Plaid access tokens at rest when a key is configured. Sandbox
  // may run without one for zero-config dev; development/production must
  // provide it (see plaid.ts + README).
  const plaidCipher = config.plaidEncryptionKey
    ? createAesGcm(config.plaidEncryptionKey)
    : null;
  if (
    !plaidCipher &&
    config.plaidClientId &&
    config.plaidSecret &&
    (config.plaidEnv === 'development' || config.plaidEnv === 'production')
  ) {
    throw new Error(
      `Plaid ${config.plaidEnv} tier requires PLAID_ENCRYPTION_KEY; storing access tokens plaintext is refused`,
    );
  }
  const plaidItemsRepo = createPlaidItemsRepo(pool, plaidCipher);

  const categoriesService = createCategoriesService({ categoriesRepo });
  const accountsService = createAccountsService({ accountsRepo, usersRepo });
  const categorizationService = createCategorizationService({ rulesRepo });

  let plaidService: PlaidService | null = null;
  let plaidController: PlaidController | null = null;
  if (config.plaidClientId && config.plaidSecret) {
    const plaidAdapter = createPlaidAdapter({
      clientId: config.plaidClientId,
      secret: config.plaidSecret,
      env: config.plaidEnv ?? 'sandbox',
    });
    plaidService = createPlaidService({
      pool,
      plaidAdapter,
      plaidItemsRepo,
      accountsRepo,
      usersRepo,
      categorization: categorizationService,
      logger,
      clientName: config.plaidClientName ?? 'Personal Finance',
    });
    plaidController = createPlaidController(plaidService);
    logger.info(
      { env: config.plaidEnv ?? 'sandbox' },
      'Plaid: enabled (client_id + secret present)',
    );
  } else {
    logger.info('Plaid: disabled (set PLAID_CLIENT_ID + PLAID_SECRET to enable)');
  }

  const transactionsService = createTransactionsService({
    transactionsRepo,
    accountsRepo,
    categoriesRepo,
    categorization: categorizationService,
  });
  // previewToken reuses the access secret with a distinct `aud` claim — a
  // signed value that can't be mistaken for or used as an access token.
  const previewTokenSigner = createPreviewTokenSigner(config.jwtAccessSecret);
  const budgetsService = createBudgetsService({ budgetsRepo, categoriesRepo });
  const dashboardService = createDashboardService({
    dashboardRepo,
    categoriesRepo,
    usersRepo,
    fxService,
  });
  const rulesService = createRulesService({
    pool,
    rulesRepo,
    categoriesRepo,
    transactionsRepo,
  });
  const recurringService = createRecurringService({ pool, recurringRepo });
  const emailAdapter = pickEmailAdapter(config, logger);
  const passwordResetService = createPasswordResetService({
    pool,
    usersRepo,
    passwordResetTokensRepo,
    refreshTokensRepo,
    passwordHasher: bcryptHasher,
    clock: systemClock,
    logger,
    emailAdapter,
    frontendOrigin: config.frontendOrigin,
  });
  const csvImportService = createCsvImportService({
    pool,
    accountsRepo,
    categoriesRepo,
    transactionsRepo,
    importBatchesRepo,
    categorization: categorizationService,
    previewTokenSigner,
  });

  const authService = createAuthService({
    pool,
    usersRepo,
    refreshTokensRepo,
    clock: systemClock,
    tokenSigner,
    passwordHasher: bcryptHasher,
    logger,
    // Seed defaults inside the signup transaction — categories first (rules
    // resolve category IDs by name against the just-inserted rows).
    onUserCreated: async (userId, client) => {
      await categoriesService.seedDefaultsForUser(userId, client);
      await rulesService.seedDefaultsForUser(userId, client);
    },
  });

  const authController = createAuthController(authService);
  const categoriesController = createCategoriesController(categoriesService);
  const accountsController = createAccountsController(accountsService);
  const transactionsController = createTransactionsController(
    transactionsService,
    rulesService,
  );
  const importsController = createImportsController(csvImportService);
  const budgetsController = createBudgetsController(budgetsService);
  const dashboardController = createDashboardController(dashboardService);
  const rulesController = createRulesController(rulesService);
  const recurringController = createRecurringController(recurringService);
  const passwordResetController = createPasswordResetController(passwordResetService);

  let oauthService: OAuthService | null = null;
  let oauthController: OAuthController | null = null;
  if (config.googleClientId && config.googleClientSecret) {
    const base = (config.apiBaseUrl ?? 'http://localhost:3001').replace(/\/$/, '');
    const googleAdapter = createGoogleOAuthAdapter({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: `${base}/api/v1/auth/oauth/google/callback`,
    });
    oauthService = createOAuthService({
      pool,
      googleAdapter,
      usersRepo,
      refreshTokensRepo,
      categoriesService,
      rulesService,
      tokenSigner,
      clock: systemClock,
      logger,
    });
    oauthController = createOAuthController(oauthService);
    logger.info(
      { redirectUri: `${base}/api/v1/auth/oauth/google/callback` },
      'Google OAuth: enabled',
    );
  } else {
    logger.info(
      'Google OAuth: disabled (set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET to enable)',
    );
  }

  const authMiddleware = createAuthMiddleware(tokenSigner);
  const idempotent = createIdempotency(pool, idempotencyKeysRepo);

  return {
    authService,
    authController,
    categoriesController,
    accountsController,
    transactionsController,
    importsController,
    budgetsController,
    dashboardController,
    rulesController,
    recurringController,
    passwordResetController,
    plaidController,
    oauthController,
    authMiddleware,
    idempotent,
  };
}
