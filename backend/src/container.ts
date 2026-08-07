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
import { createAuthService, type AuthService } from './services/auth.service';
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
import { createAuthMiddleware } from './middleware/auth';
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
  const importBatchesRepo = createImportBatchesRepo(pool);
  const budgetsRepo = createBudgetsRepo(pool);
  const dashboardRepo = createDashboardRepo(pool);
  const recurringRepo = createRecurringRepo(pool);

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
  const budgetsService = createBudgetsService({ budgetsRepo, categoriesRepo });
  const dashboardService = createDashboardService({ dashboardRepo, categoriesRepo });
  const rulesService = createRulesService({ rulesRepo, categoriesRepo });
  const recurringService = createRecurringService({ pool, recurringRepo });
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
  const transactionsController = createTransactionsController(transactionsService);
  const importsController = createImportsController(csvImportService);
  const budgetsController = createBudgetsController(budgetsService);
  const dashboardController = createDashboardController(dashboardService);
  const rulesController = createRulesController(rulesService);
  const recurringController = createRecurringController(recurringService);
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
    authMiddleware,
    idempotent,
  };
}
