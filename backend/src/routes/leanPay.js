import { Router } from 'express';
import { leanApiFetch } from '../leanApi.js';
import { db } from '../db.js';

export const leanPayRouter = Router();

// Falcon's own collection account — where every customer's top-up lands.
// Fields follow the same UAE Open Finance Payment Destination shape (and the
// same documented sandbox IBAN pattern) as the working lean-demo reference.
//
// Destinations are scoped per Lean customer (customer_id in the create
// call) — this is the piece the first version of this route got wrong: it
// created one destination with no customer_id at all, which Lean accepted
// but stored as an APPLICATION-owned destination rather than one belonging
// to the paying customer. MockBank couldn't resolve it and silently
// rejected the payment before ever showing a login screen. Because
// destinations can't be edited, there's no fixing that one — a fresh,
// correctly-scoped destination is created per customer instead.
const FALCON_DESTINATION = {
  name: 'Falcon Exchange LLC',
  display_name: 'Falcon Exchange',
  address: 'Sheikh Zayed Road, Business Bay',
  city: 'Dubai',
  country: 'ARE',
  account_number: '1015000000777',
  iban: 'AE760260001015000000777',
  swift_code: 'EBILAEADXXX',
  bank_type: 'SME',
  government_identifier: { type: 'TRADE_LICENSE_NUMBER', value: 'CN-FALCON-0001' },
};

async function ensureLeanCustomer(user) {
  if (user.leanCustomerId) return user.leanCustomerId;
  const customer = await leanApiFetch('/customers/v1/', {
    method: 'POST',
    body: JSON.stringify({ app_user_id: user.id }),
  });
  db.users.update(user.id, { leanCustomerId: customer.customer_id });
  return customer.customer_id;
}

async function ensureFalconDestination(user, customerId) {
  if (user.falconDestinationId) return user.falconDestinationId;
  const destination = await leanApiFetch('/payments/v1/destinations', {
    method: 'POST',
    body: JSON.stringify({ ...FALCON_DESTINATION, customer_id: customerId }),
  });
  const destinationId = destination.payment_destination_id ?? destination.id;
  db.users.update(user.id, { falconDestinationId: destinationId });
  return destinationId;
}

// Must be added to this Lean app's allowed redirect URLs in the Dashboard
// (Development → Integration settings) — Lean rejects session creation
// outright otherwise ("Redirect URL ... is not allowed for application ...").
// Kept fixed and param-free rather than baking the intent id into it: a
// redirect whitelist commonly matches the URL exactly, so a per-request
// query string would never match a pre-registered value. Which top-up is
// pending is tracked in the browser's own localStorage instead (see
// screens/topup/AuthorizeTopup.jsx), not carried through the redirect.
const TOPUP_REDIRECT_URL = `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5174'}/`;

// Creates a Payment Intent against Falcon's own destination, then a Lean
// Session for it. The session_url is a real, full-page redirect to Lean's
// own hosted authorization flow — NOT an embedded modal. Open Finance bank
// consent screens generally refuse to render inside a third-party iframe,
// which is why an earlier version of this route (using the LinkSDK's
// embedded pay() call) failed silently: every intent it created shows an
// empty payments[] array, meaning the attempt never even reached Lean's
// backend as a real authorization.
leanPayRouter.post('/lean/topups', async (req, res, next) => {
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
        amount,
        currency: 'AED',
        payment_destination_id: destinationId,
        purpose_code: 'GDS',
        // Lean caps this at 32 chars.
        description: 'Falcon Exchange top-up',
      }),
    });

    const session = await leanApiFetch('/sessions/v1', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        flow: { type: 'PAY', payload: { payment_intent_id: intent.payment_intent_id } },
        redirect_url: TOPUP_REDIRECT_URL,
      }),
    });

    res.json({ intent, session });
  } catch (err) {
    next(err);
  }
});

// Polled by the frontend after pay() closes, since bank authorization
// settles asynchronously (PENDING_WITH_BANK → ACCEPTED_BY_BANK | FAILED).
// The moment it first sees ACCEPTED_BY_BANK, Falcon's ledger is credited —
// guarded so a re-poll of an already-credited intent never double-credits.
leanPayRouter.get('/lean/topups/:id', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const intent = await leanApiFetch(`/payments/v1/intents/${req.params.id}`);
    const latestPayment = intent.payments?.[intent.payments.length - 1];
    const status = latestPayment?.status ?? 'PENDING_WITH_BANK';

    if (status === 'ACCEPTED_BY_BANK' && userId && !db.transactions.get(req.params.id)) {
      const user = db.users.get(userId);
      db.transactions.insert({
        id: req.params.id,
        type: 'topup',
        userId,
        amount: Number(intent.amount),
        currency: intent.currency ?? 'AED',
        status: 'succeeded',
        createdAt: intent.created_at ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      if (user) {
        db.users.update(user.id, {
          balance: Math.round((user.balance + Number(intent.amount)) * 100) / 100,
        });
      }
    }

    res.json({ ...intent, status });
  } catch (err) {
    next(err);
  }
});
