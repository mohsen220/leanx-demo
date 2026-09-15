import { Router } from 'express';
import { swiftxApi } from '../swiftxApi.js';
import { db } from '../db.js';

export const paymentsRouter = Router();

// The frontend attaches a few underscore-prefixed fields (_userId,
// _recipientId, _sourceAmount, ...) so this route can write Falcon's own
// ledger. They're local bookkeeping only — strip them before anything is
// sent to SwiftX, which has no concept of them.
function splitLedgerFields(body) {
  const ledger = {};
  const swiftxBody = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('_')) ledger[key.slice(1)] = value;
    else swiftxBody[key] = value;
  }
  return { ledger, swiftxBody };
}

paymentsRouter.post('/payments', async (req, res, next) => {
  try {
    const { ledger, swiftxBody } = splitLedgerFields(req.body);
    const { external_id, country } = swiftxBody;

    // Duplicate check first, exactly as the SolEng checklist prescribes:
    // 404 means clear to send, 200 means stop.
    let existing = null;
    try {
      existing = await swiftxApi.getPaymentByExternalId(external_id, country);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (existing) {
      const err = new Error(`Payment with external_id ${external_id} already exists`);
      err.status = 409;
      throw err;
    }

    const data = await swiftxApi.createPayment(swiftxBody);

    // Falcon's own ledger — debited the moment the transfer is submitted to
    // the rail, not when it later settles. Independent of the SwiftX record.
    if (ledger.userId) {
      db.transactions.insert({
        id: data.id,
        type: 'remittance',
        userId: ledger.userId,
        recipientId: ledger.recipientId ?? null,
        recipientName: swiftxBody.beneficiary_name,
        corridorCode: country,
        sourceAmount: ledger.sourceAmount,
        sourceCurrency: swiftxBody.currency,
        destAmount: ledger.destAmount ?? swiftxBody.amount,
        destCurrency: ledger.destCurrency,
        rate: ledger.rate,
        purpose: swiftxBody.remarks,
        externalId: external_id,
        status: data.status,
        bankReference: data.bank_reference ?? null,
        createdAt: data.created ?? new Date().toISOString(),
        completedAt: null,
      });

      const user = db.users.get(ledger.userId);
      if (user && ledger.sourceAmount) {
        db.users.update(user.id, {
          balance: Math.round((user.balance - Number(ledger.sourceAmount)) * 100) / 100,
        });
      }
    }

    res.status(202).json(data);
  } catch (err) {
    next(err);
  }
});

paymentsRouter.get('/payments/:id', async (req, res, next) => {
  try {
    const data = await swiftxApi.getPaymentById(req.params.id, req.query.country);

    // Keep Falcon's ledger row in sync with the rail's status as the
    // customer's own status polling naturally happens.
    const tx = db.transactions.get(req.params.id);
    if (tx && tx.status !== data.status) {
      db.transactions.update(tx.id, {
        status: data.status,
        bankReference: data.bank_reference ?? tx.bankReference,
        completedAt:
          data.status === 'succeeded' ? data.transaction_completed ?? new Date().toISOString() : tx.completedAt,
      });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

paymentsRouter.get('/payments', async (req, res, next) => {
  try {
    const { country, limit, offset } = req.query;
    const data = await swiftxApi.listPayments({ country, limit, offset });
    res.json(data);
  } catch (err) {
    next(err);
  }
});
