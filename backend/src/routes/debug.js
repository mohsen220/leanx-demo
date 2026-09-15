import { Router } from 'express';
import { swiftxApi } from '../swiftxApi.js';
import { swiftxConfig } from '../swiftxConfig.js';

export const debugRouter = Router();

debugRouter.get('/debug', async (_req, res, next) => {
  try {
    const payload = await swiftxApi.debug();
    res.json({ mockMode: swiftxConfig.mockMode, ...payload });
  } catch (err) {
    next(err);
  }
});
