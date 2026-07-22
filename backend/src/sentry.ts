import * as Sentry from '@sentry/node';
import { env } from './config/env';
import logger from './logger';

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.info('Error tracking disabled (no DSN configured)');
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
  });
  logger.info('Error tracking initialized');
}
