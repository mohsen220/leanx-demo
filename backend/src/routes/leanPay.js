import { Router } from 'express';
import { leanApiFetch } from '../leanApi.js';
import { db, newId } from '../db.js';

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
// (Development → Integration settings) — Lean rejects link creation
// outright otherwise ("Redirect URL ... is not allowed for application ...").
// Kept fixed and param-free rather than baking the link id into it: a
// redirect whitelist commonly matches the URL exactly, so a per-request
// query string would never match a pre-registered value. Which top-up is
// pending is tracked in the browser's own localStorage instead (see
// screens/topup/AuthorizeTopup.jsx), not carried through the redirect.
const TOPUP_REDIRECT_URL = `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5174'}/`;

// Uses Lean's Payment Links API rather than Sessions (POST /sessions/v1 +
// a pre-created Payment Intent) — that combination returned an opaque,
// unmapped 400 ({status: null, message: "Bad Request"}) on this app no
// matter what was tried, confirmed via a from-scratch reproduction outside
// this codebase entirely. Payment Links create everything Lean-side in one
// call and hand back a real hosted checkout URL, verified working directly
// against this same sandbox app.
//
// max_usages: 1 makes this a single-use link (Payment Links default to
// reusable, meant for merchant checkout pages) — right for a one-off
// top-up, wrong for anything meant to be shared.
leanPayRouter.post('/lean/topups', async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be a positive number' });

    const customerId = await ensureLeanCustomer(user);
    const destinationId = await ensureFalconDestination(user, customerId);

    const link = await leanApiFetch('/payment-links/v1', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        max_usages: 1,
        redirect_url: TOPUP_REDIRECT_URL,
        payment_details: {
          reference: `falcon-topup-${newId()}`,
          currency: 'AED',
          amount: Number(amount),
          destination_id: destinationId,
        },
      }),
    });

    res.json({ linkId: link.id, link: link.link });
  } catch (err) {
    next(err);
  }
});

// Polled by the frontend after the customer returns from Lean's hosted
// checkout page, since bank authorization settles asynchronously. A usage
// only appears once the customer actually completes (or fails) the flow —
// no usages yet just means still on Lean's page, not an error.
// usage_status: STARTED (awaiting bank) → PAYMENT_CREATED (check
// payment_status: PENDING_WITH_BANK | ACCEPTED_BY_BANK) | FAILED | EXPIRED.
// The moment it first sees ACCEPTED_BY_BANK, Falcon's ledger is credited —
// guarded so a re-poll of an already-credited link never double-credits.
leanPayRouter.get('/lean/topups/:id', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const linkId = req.params.id;

    const link = await leanApiFetch(`/payment-links/v1/${linkId}`);
    const { content: usages = [] } = await leanApiFetch(`/payment-links/v1/${linkId}/usages?size=10`);
    const usage = usages[0];

    let status = 'PENDING_WITH_BANK';
    if (usage?.usage_status === 'PAYMENT_CREATED') status = usage.payment_status ?? 'PENDING_WITH_BANK';
    else if (usage?.usage_status === 'FAILED' || usage?.usage_status === 'EXPIRED') status = 'FAILED';

    if (status === 'ACCEPTED_BY_BANK' && userId && !db.transactions.get(linkId)) {
      const user = db.users.get(userId);
      db.transactions.insert({
        id: linkId,
        type: 'topup',
        userId,
        amount: Number(link.payment_details.amount),
        currency: link.payment_details.currency ?? 'AED',
        status: 'succeeded',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      if (user) {
        db.users.update(user.id, {
          balance: Math.round((user.balance + Number(link.payment_details.amount)) * 100) / 100,
        });
      }
    }

    res.json({ amount: link.payment_details.amount, currency: link.payment_details.currency ?? 'AED', status });
  } catch (err) {
    next(err);
  }
});
