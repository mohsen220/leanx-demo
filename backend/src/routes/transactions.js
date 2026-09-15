import { Router } from 'express';
import { db } from '../db.js';

export const transactionsRouter = Router();

// The customer's own History screen passes ?userId=; the admin dashboard
// omits it to see every customer's transfers.
transactionsRouter.get('/transactions', (req, res) => {
  const { userId } = req.query;
  let list = db.transactions.all();
  if (userId) list = list.filter((t) => t.userId === userId);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});
