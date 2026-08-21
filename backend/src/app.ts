import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { csrfMiddleware } from './middleware/csrf';
import { globalApiRateLimit } from './middleware/rateLimit';
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
import { createRecurringRouter } from './routes/recurring.routes';
import { createPasswordResetRouter } from './routes/passwordReset.routes';
import { createPlaidRouter } from './routes/plaid.routes';
import { createOAuthRouter } from './routes/oauth.routes';
import { flags } from './flags';
import type { Container } from './container';

export function createApp(container: Container): Express {
  const app = express();

  app.disable('x-powered-by');
  // Explicit helmet config — the defaults are decent but making the CSP
  // explicit means our security posture is version-locked (no silent drift
  // if helmet bumps its defaults) and reviewable at a glance.
  //
  // 'self' + credentials-scoped CORS is enough because the frontend is a
  // separate origin (Vercel) that talks to us over XHR — we never render
  // untrusted HTML server-side, and we never load third-party JS in the
  // API's own responses.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // HSTS max-age 180 days; browsers pin HTTPS after first successful hit.
      hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  // Blanket ceiling — catches enumeration scans and misbehaving clients.
  // Per-endpoint limiters (login/signup/reset) stack on top for the more
  // sensitive surfaces.
  app.use('/api/v1', globalApiRateLimit);
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
  // v2 features are conditionally mounted so they 404 cleanly when the flag
  // is off — no runtime cost, no exposed surface. Flip FLAG_RECURRING to
  // enable in a given environment.
  if (flags.recurringDetection) {
    app.use(
      '/api/v1/recurring',
      createRecurringRouter(container.recurringController, container.authMiddleware),
    );
  }
  // Password reset lives under /auth/* so it's colocated with signup/login
  // — same conditional-mount pattern as the other v2 features.
  if (flags.passwordReset) {
    app.use(
      '/api/v1/auth',
      createPasswordResetRouter(container.passwordResetController),
    );
  }
  // Plaid is doubly gated: the flag AND the controller being present
  // (which requires PLAID_CLIENT_ID + PLAID_SECRET in env). Either
  // condition unmet → routes 404, no cost.
  if (flags.plaid && container.plaidController) {
    app.use(
      '/api/v1/plaid',
      createPlaidRouter(container.plaidController, container.authMiddleware),
    );
  }
  // Google OAuth: same doubly-gated pattern — flag + env-derived controller
  // must both be present or the /auth/oauth/* routes 404.
  if (flags.oauth && container.oauthController) {
    app.use('/api/v1/auth/oauth', createOAuthRouter(container.oauthController));
  }

  app.use(errorHandler);

  return app;
}
