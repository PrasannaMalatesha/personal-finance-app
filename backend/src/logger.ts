import pino from 'pino';
import { env } from './config/env';

const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        }
      : undefined,
  // Keep this list in sync with any new PII fields — add the path here as they land.
  redact: {
    paths: [
      'password',
      'password_hash',
      'token',
      'email',
      '*.password',
      '*.token',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
