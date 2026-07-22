import { Router } from 'express';
import { testConnection } from '../db/client';

export const healthzRouter = Router();

healthzRouter.get('/', async (_req, res) => {
  const dbOk = await testConnection();
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    data: {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});
