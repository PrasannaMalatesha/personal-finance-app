import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { csrfMiddleware } from './middleware/csrf';
import { healthzRouter } from './routes/healthz.routes';
import { flagsRouter } from './routes/flags.routes';
import { createAuthRouter } from './routes/auth.routes';
import { createCategoriesRouter } from './routes/categories.routes';
import { createAccountsRouter } from './routes/accounts.routes';
import { createTransactionsRouter } from './routes/transactions.routes';
import { createImportsRouter } from './routes/imports.routes';
import { createBudgetsRouter } from './routes/budgets.routes';
import { createDashboardRouter } from './routes/dashboard.routes';
import { createRulesRouter } from './routes/rules.routes';
import type { Container } from './container';

export function createApp(container: Container): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(csrfMiddleware);

  app.use('/healthz', healthzRouter);
  app.use('/api/v1/flags', flagsRouter);
  app.use(
    '/api/v1/auth',
    createAuthRouter(container.authController, container.authMiddleware),
  );
  app.use(
    '/api/v1/categories',
    createCategoriesRouter(
      container.categoriesController,
      container.authMiddleware,
      container.idempotent,
    ),
  );
  app.use(
    '/api/v1/accounts',
    createAccountsRouter(
      container.accountsController,
      container.authMiddleware,
      container.idempotent,
    ),
  );
  app.use(
    '/api/v1/transactions',
    createTransactionsRouter(
      container.transactionsController,
      container.authMiddleware,
      container.idempotent,
    ),
  );
  app.use(
    '/api/v1/imports',
    createImportsRouter(
      container.importsController,
      container.authMiddleware,
      container.idempotent,
    ),
  );
  app.use(
    '/api/v1/budgets',
    createBudgetsRouter(container.budgetsController, container.authMiddleware),
  );
  app.use(
    '/api/v1/dashboard',
    createDashboardRouter(container.dashboardController, container.authMiddleware),
  );
  app.use(
    '/api/v1/rules',
    createRulesRouter(
      container.rulesController,
      container.authMiddleware,
      container.idempotent,
    ),
  );

  app.use(errorHandler);

  return app;
}
