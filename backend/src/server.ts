import { createApp } from './app';
import { env } from './config/env';
import { initSentry } from './sentry';
import logger from './logger';

initSentry();

const app = createApp();

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
