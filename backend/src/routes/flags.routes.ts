import { Router } from 'express';
import { flags } from '../flags';

export const flagsRouter = Router();

flagsRouter.get('/', (_req, res) => {
  res.json({ data: flags });
});
