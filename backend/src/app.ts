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

  app.use(errorHandler);

  return app;
}
