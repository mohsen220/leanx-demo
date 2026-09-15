import { Router } from 'express';
import { swiftxApi } from '../swiftxApi.js';

export const quotesRouter = Router();

quotesRouter.post('/quotes', async (req, res, next) => {
  try {
    const data = await swiftxApi.createQuote(req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

quotesRouter.get('/quotes/:id', async (req, res, next) => {
  try {
    const data = await swiftxApi.getQuoteById(req.params.id, req.query.country);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
