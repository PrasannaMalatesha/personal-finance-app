import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createUsersRepo } from './repositories/users.repo';
import { createRefreshTokensRepo } from './repositories/refreshTokens.repo';
import { createIdempotencyKeysRepo } from './repositories/idempotencyKeys.repo';
import { createCategoriesRepo } from './repositories/categories.repo';
import { createAccountsRepo } from './repositories/accounts.repo';
import { createTransactionsRepo } from './repositories/transactions.repo';
import { createRulesRepo } from './repositories/rules.repo';
import { createAuthService } from './services/auth.service';
import { createCategoriesService } from './services/categories.service';
import { createAccountsService } from './services/accounts.service';
import { createCategorizationService } from './services/categorization.service';
import { createTransactionsService } from './services/transactions.service';
import { createCsvImportService } from './services/csvImport.service';
import { createAuthController, type AuthController } from './controllers/auth.controller';
import { createCategoriesController, type CategoriesController } from './controllers/categories.controller';
import { createAccountsController, type AccountsController } from './controllers/accounts.controller';
import { createTransactionsController, type TransactionsController } from './controllers/transactions.controller';
import { createImportsController, type ImportsController } from './controllers/imports.controller';
import { createAuthMiddleware } from './middleware/auth';
import { createIdempotency, type IdempotencyWrapper } from './middleware/idempotency';
import { createTokenSigner } from './lib/tokens';
import { createPreviewTokenSigner } from './lib/previewToken';
import { bcryptHasher } from './lib/password';
import { systemClock } from './lib/clock';

export interface Container {
  authController: AuthController;
  categoriesController: CategoriesController;
  accountsController: AccountsController;
  transactionsController: TransactionsController;
  importsController: ImportsController;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  idempotent: IdempotencyWrapper;
}

export interface ContainerConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
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

  const categoriesService = createCategoriesService({ categoriesRepo });
  const accountsService = createAccountsService({ accountsRepo });
  const categorizationService = createCategorizationService({ rulesRepo });
  const transactionsService = createTransactionsService({
    transactionsRepo,
    accountsRepo,
    categoriesRepo,
    categorization: categorizationService,
  });
  // previewToken reuses the access secret with a distinct `aud` claim — a
  // signed value that can't be mistaken for or used as an access token.
  const previewTokenSigner = createPreviewTokenSigner(config.jwtAccessSecret);
  const csvImportService = createCsvImportService({
    accountsRepo,
    categoriesRepo,
    transactionsRepo,
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
    // Seed default categories inside the signup transaction — atomic with user create.
    onUserCreated: categoriesService.seedDefaultsForUser,
  });

  const authController = createAuthController(authService);
  const categoriesController = createCategoriesController(categoriesService);
  const accountsController = createAccountsController(accountsService);
  const transactionsController = createTransactionsController(transactionsService);
  const importsController = createImportsController(csvImportService);
  const authMiddleware = createAuthMiddleware(tokenSigner);
  const idempotent = createIdempotency(pool, idempotencyKeysRepo);

  return {
    authController,
    categoriesController,
    accountsController,
    transactionsController,
    importsController,
    authMiddleware,
    idempotent,
  };
}
