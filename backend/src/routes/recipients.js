import { Router } from 'express';
import { db, newId } from '../db.js';

export const recipientsRouter = Router();

recipientsRouter.get('/users/:userId/recipients', (req, res) => {
  const list = db.recipients.all().filter((r) => r.userId === req.params.userId);
  res.json(list);
});

// Same person = same corridor + account number for this customer — merge
// into the existing row instead of saving a duplicate.
recipientsRouter.post('/users/:userId/recipients', (req, res) => {
  const { userId } = req.params;
  const incoming = req.body;

  const existing = db.recipients
    .all()
    .find(
      (r) =>
        r.userId === userId &&
        r.corridorCode === incoming.corridorCode &&
        r.details?.beneficiary_account_number === incoming.details?.beneficiary_account_number,
    );

  const id = existing?.id ?? incoming.id ?? newId();
  const saved = db.recipients.insert({ ...existing, ...incoming, id, userId });
  res.json(saved);
});
