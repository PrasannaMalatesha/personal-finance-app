import { createApp } from './app';
import { env } from './config/env';
import { initSentry } from './sentry';
import logger from './logger';
import { pool } from './db/client';
import { buildContainer } from './container';

initSentry();

const container = buildContainer(pool, logger, {
  jwtAccessSecret: env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  frontendOrigin: env.FRONTEND_ORIGIN,
  resendApiKey: env.RESEND_API_KEY,
  resendFromEmail: env.RESEND_FROM_EMAIL,
  plaidClientId: env.PLAID_CLIENT_ID,
  plaidSecret: env.PLAID_SECRET,
  plaidEnv: env.PLAID_ENV,
  googleClientId: env.GOOGLE_OAUTH_CLIENT_ID,
  googleClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  apiBaseUrl: env.API_BASE_URL,
});

const app = createApp(container);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server listening');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
