import { Router } from 'express';
import { leanApiFetch } from '../leanApi.js';
import { getCustomerToken } from '../leanAuth.js';
import { leanConfig } from '../leanConfig.js';
import { db, newId } from '../db.js';
import { ensureLeanCustomer, ensureFalconDestination } from '../leanCustomerSetup.js';

export const leanAofRouter = Router();

// A UAE Open Finance AoF consent requires a government identifier for the
// paying customer (Lean rejects creation without one: "Government identifier
// is required"). Falcon doesn't collect a real Emirates ID anywhere in this
// demo's onboarding, so every customer shares this fixed placeholder — fine
// for sandbox, would need a real per-customer value in production.
const DEMO_GOVERNMENT_IDENTIFIER = { type: 'EMIRATES_ID', value: '784-1234-1234-1234' };

async function createAofConsent(user, customerId, destinationId) {
  const consent = await leanApiFetch('/consents/v1/account-on-file', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customerId,
      destination_account_id: destinationId,
      currency: 'AED',
      reference: 'Falcon top-up consent',
      purpose: 'GDS',
      control_parameters: {
        type: 'VariableOnDemand',
        period_type: 'Day',
        max_individual_amount: 5000,
      },
      government_identifier: DEMO_GOVERNMENT_IDENTIFIER,
    }),
  });
  db.users.update(user.id, { aofConsentId: consent.id, aofConsentStatus: consent.status });
  return consent;
}

// Actually moves money against an already-AUTHORISED consent — no bank
// redirect at all, which is the entire point of AoF over SIP/Payment Links.
// Idempotency-Key is required by this endpoint; a fresh one per call is
// correct here since each call represents a distinct top-up the customer
// initiated, not a retry of the same one.
async function chargeAofConsent(user, consentId, amount) {
  const payment = await leanApiFetch('/payments/v1/account-on-file', {
    method: 'POST',
    headers: { 'Idempotency-Key': newId() },
    body: JSON.stringify({
      consent_id: consentId,
      amount: Number(amount),
      purpose: 'GDS',
      reference: 'Falcon top-up',
      risk_details: { transaction_indicators: { channel: 'WEB' } },
    }),
  });
  return payment;
}

// The customer can revoke an AoF consent at any time from Manage Consents
// (CMI) — that's the entire point of consent management — but our cache
// (aofConsentId/aofConsentStatus) only ever changes in response to OUR
// OWN calls, so it has no way to learn about a revoke that happened over
// on Lean's side. Distinguishes "the cached consent is stale" from a
// genuine charge failure (insufficient funds, bank decline, etc.), which
// should still surface as a real error.
function isStaleConsentError(err) {
  return err.status === 400 && err.payload?.granular_status_code === 'INVALID_CONSENT_STATE';
}

// Entry point from the top-up screen. Two outcomes:
//  - The customer already has an AUTHORISED consent: charge immediately,
//    no redirect, no LinkSDK — the "instant top-up" AoF is meant to enable.
//  - First time (or consent still AWAITING_AUTHORISATION): the frontend
//    needs to open Lean.authorizeConsent() instead. Once that succeeds, it
//    calls /lean/aof/topup/charge below to actually move the money.
leanAofRouter.post('/lean/aof/topup', async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be a positive number' });

    const customerId = await ensureLeanCustomer(user);
    const destinationId = await ensureFalconDestination(user, customerId);

    // GET /consents/v1/{id} turns out to be unreliable for a consent still
    // AWAITING_AUTHORISATION — it can 404 a definitely-valid, previously-
    // created consent minutes later, not just in a brief window right after
    // creation. An earlier version of this route used that GET to decide
    // whether to reuse or recreate the consent, and the 404s made it
    // recreate (and thus force re-authorizing) a brand new consent on
    // nearly every single call — silently orphaning whatever authorization
    // progress the customer had just made in the bank's UI. So this never
    // calls that endpoint at all:
    //  - AUTHORISED locally → trust it and charge directly. This is only
    //    ever set by /lean/aof/topup/charge below, right after this app's
    //    own code confirmed a real authorization succeeded, so there's
    //    nothing to re-verify.
    //  - Any cached consent that isn't AUTHORISED → reuse the SAME id for
    //    another authorize attempt, rather than creating a new one. Retrying
    //    against the same consent is what actually lets a customer recover
    //    from a stalled/cancelled attempt.
    //  - No cached consent at all → create one.
    let consent;
    if (user.aofConsentId) {
      consent = { id: user.aofConsentId, status: user.aofConsentStatus };
    } else {
      consent = await createAofConsent(user, customerId, destinationId);
    }

    if (consent.status === 'AUTHORISED') {
      try {
        const payment = await chargeAofConsent(user, consent.id, amount);
        return res.json({ mode: 'instant', paymentId: payment.id, status: payment.status });
      } catch (err) {
        if (!isStaleConsentError(err)) throw err;
        // Our cache said AUTHORISED but Lean just rejected it as REVOKED
        // (or otherwise unusable) — drop the stale id and fall through to
        // the same "create a fresh consent, ask to authorize" path a
        // first-time top-up takes, rather than failing the request.
        db.users.update(user.id, { aofConsentId: null, aofConsentStatus: null });
        consent = await createAofConsent(user, customerId, destinationId);
      }
    }

    const { accessToken } = await getCustomerToken(customerId);
    res.json({
      mode: 'authorize',
      appToken: leanConfig.appToken,
      customerId,
      consentId: consent.id,
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});

// Called when Lean.authorizeConsent()'s callback reports anything other
// than a clean cancel — a genuine authorization attempt (e.g. a bank login
// error, or the sandbox's QR/passwordless path erroring out) leaves the
// consent unable to accept a second attempt: Lean's own
// POST /consents/{id}/authorization returns 409 Conflict on retry, since an
// attempt was already registered against it. Clearing the cached id here
// means the next top-up creates a genuinely fresh, untouched consent
// instead of retrying one that's already burned.
leanAofRouter.post('/lean/aof/consent/abandon', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.users.update(user.id, { aofConsentId: null, aofConsentStatus: null });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Called right after Lean.authorizeConsent()'s callback reports SUCCESS —
// marks the consent AUTHORISED locally (so every future top-up takes the
// instant path above) and immediately charges it for this top-up's amount.
leanAofRouter.post('/lean/aof/topup/charge', async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const user = db.users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.aofConsentId) return res.status(400).json({ error: 'No AoF consent set up for this user yet' });

    db.users.update(user.id, { aofConsentStatus: 'AUTHORISED' });
    const payment = await chargeAofConsent(user, user.aofConsentId, amount);
    res.json({ paymentId: payment.id, status: payment.status });
  } catch (err) {
    next(err);
  }
});

// Polled by the frontend until the charge settles. There's no "get one AoF
// payment" endpoint — the create call's own response status (CREATED/
// PROCESSING/PROCESSED/FAILED) doesn't get refreshed by re-fetching it, so
// polling instead lists payments under the consent (GET
// /consents/v1/{consent_id}/payments) and finds this one by id. That list
// uses a different status vocabulary — ACCEPTED_BY_BANK / PENDING_WITH_BANK
// / FAILED — which conveniently matches what the frontend's TopupStatus
// screen already expects from the SIP/Payment-Links flows, so no frontend
// changes were needed for this.
leanAofRouter.get('/lean/aof/topup/:paymentId', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const paymentId = req.params.paymentId;
    const user = db.users.get(userId);
    if (!user?.aofConsentId) return res.status(400).json({ error: 'No AoF consent for this user' });

    const { data: payments = [] } = await leanApiFetch(`/consents/v1/${user.aofConsentId}/payments?page_size=100`);
    const payment = payments.find((p) => p.id === paymentId);
    const status = payment?.status ?? 'PENDING_WITH_BANK';

    if (status === 'ACCEPTED_BY_BANK' && payment && !db.transactions.get(paymentId)) {
      db.transactions.insert({
        id: paymentId,
        type: 'topup',
        userId,
        amount: Number(payment.amount),
        currency: payment.currency ?? 'AED',
        status: 'succeeded',
        createdAt: payment.initiation_timestamp ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      db.users.update(user.id, {
        balance: Math.round((user.balance + Number(payment.amount)) * 100) / 100,
      });
    }

    res.json({
      amount: payment?.amount,
      currency: payment?.currency ?? 'AED',
      status,
      // Straight off the payment resource — who it actually moved from/to,
      // once Lean has that (sender_details is often still null until the
      // bank settles it; recipient_details is populated from the start
      // since it's just our own registered destination).
      source: payment?.sender_details ?? null,
      destination: payment?.recipient_details ?? null,
    });
  } catch (err) {
    next(err);
  }
});
