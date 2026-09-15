import { Router } from 'express';
import { CORRIDORS } from '../corridors.js';

export const corridorsRouter = Router();

corridorsRouter.get('/corridors', (_req, res) => {
  res.json(CORRIDORS);
});
