import { Router } from 'express';
import { leanApiFetch } from '../leanApi.js';
import { getCustomerToken } from '../leanAuth.js';
import { leanConfig } from '../leanConfig.js';
import { db } from '../db.js';
import { ensureLeanCustomer, ensureFalconDestination } from '../leanCustomerSetup.js';

export const leanReRouter = Router();

// RE (Reverse Engineered) payments: Lean's original, pre-Open-Finance UAE
// A2A rail. The customer connects their bank once via Lean.connect()
// (permissions: ['payments']) rather than an Open Finance bank-hosted
// consent, then Lean.pay() executes against that connection directly — see
// EnterTopupAmount.jsx. Same intent underneath as SIP (same
// /payments/v1/intents contract, same customer/destination setup); only the
// LinkSDK authorization mechanism differs.
leanReRouter.post('/lean/re/topup', async (req, res, next) => {
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
        reference: 'Falcon top-up (RE)',
      }),
    });

    const { accessToken } = await getCustomerToken(customerId);
    res.json({
      appToken: leanConfig.appToken,
      customerId,
      destinationId,
      paymentIntentId: intent.id ?? intent.payment_intent_id,
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});

// Same polling shape as SIP (leanSip.js) — the intent's own top-level
// object has no status; it lives on the entries in its `payments` array.
leanReRouter.get('/lean/re/topup/:intentId', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const intentId = req.params.intentId;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const intent = await leanApiFetch(`/payments/v1/intents/${intentId}`);
    const payment = intent.payments?.[0];
    const status = payment?.status ?? 'PENDING_WITH_BANK';
    const amount = payment?.amount ?? intent.amount;
    const currency = payment?.currency ?? intent.currency ?? 'AED';

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

    res.json({
      amount,
      currency,
      status,
      // Straight off the payment resource — who it actually moved from/to.
      // Unlike OF, RE knows the connected account up front, so sender_details
      // is more likely to actually be populated here than for AoF/SIP.
      source: payment?.sender_details ?? null,
      destination: payment?.recipient_details ?? null,
    });
  } catch (err) {
    next(err);
  }
});
