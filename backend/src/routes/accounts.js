import { Router } from 'express';
import { swiftxApi } from '../swiftxApi.js';

export const accountsRouter = Router();

// India only — validate_account isn't offered on other corridors.
accountsRouter.post('/validate-account', async (req, res, next) => {
  try {
    const data = await swiftxApi.validateAccount(req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

accountsRouter.get('/balance', async (req, res, next) => {
  try {
    const data = await swiftxApi.getBalance(req.query.country);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
