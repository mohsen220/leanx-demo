import { Router } from 'express';
import { leanApiFetch } from '../leanApi.js';
import { getCustomerToken } from '../leanAuth.js';
import { leanConfig } from '../leanConfig.js';
import { db } from '../db.js';
import { ensureLeanCustomer, ensureFalconDestination } from '../leanCustomerSetup.js';

export const leanSipRouter = Router();

// SIP (Single Immediate Payment): a one-off Open Finance bank payment — no
// standing consent, a fresh bank login every time. This is the alternative
// to AoF (leanAof.js) on the same top-up screen: AoF trades a one-time setup
// for instant repeat top-ups, SIP trades that setup for never having a
// consent to manage. Frontend authorizes it via Lean.pay() with the
// payment_intent_id this creates, rather than Lean.authorizeConsent().
leanSipRouter.post('/lean/sip/topup', async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be a positive number' });

    const customerId = await ensureLeanCustomer(user);
    const destinationId = await ensureFalconDestination(user, customerId);

    const intent = await leanApiFetch('/payments/v1/intents', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        payment_destination_id: destinationId,
        amount: Number(amount),
        currency: 'AED',
        reference: 'Falcon top-up (SIP)',
      }),
    });

    const { accessToken } = await getCustomerToken(customerId);
    res.json({
      appToken: leanConfig.appToken,
      customerId,
      paymentIntentId: intent.id ?? intent.payment_intent_id,
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});

// Polled by the frontend until the payment settles. Unlike AoF there's no
// consent to list payments under — the intent IS the payment record — so
// this just re-fetches the intent by id. Same ACCEPTED_BY_BANK /
// PENDING_WITH_BANK / FAILED vocabulary as AoF/Payment-Links, so
// TopupStatus.jsx needs no separate status handling for this rail.
leanSipRouter.get('/lean/sip/topup/:intentId', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const intentId = req.params.intentId;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const intent = await leanApiFetch(`/payments/v1/intents/${intentId}`);
    const status = intent.status ?? intent.payment?.status ?? 'PENDING_WITH_BANK';
    const amount = intent.amount ?? intent.payment?.amount;
    const currency = intent.currency ?? intent.payment?.currency ?? 'AED';

    if (status === 'ACCEPTED_BY_BANK' && amount != null && !db.transactions.get(intentId)) {
      db.transactions.insert({
        id: intentId,
        type: 'topup',
        userId,
        amount: Number(amount),
        currency,
        status: 'succeeded',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      db.users.update(user.id, {
        balance: Math.round((user.balance + Number(amount)) * 100) / 100,
      });
    }

    res.json({ amount, currency, status });
  } catch (err) {
    next(err);
  }
});
