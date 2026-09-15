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

// Fetches the consent's real status from Lean rather than trusting the
// locally cached one (see the route below for why). If the cached id no
// longer resolves at all — e.g. leftover test data from a different sandbox
// state — falls back to creating a fresh consent instead of hard-failing.
async function getLiveConsent(user, customerId, destinationId, consentId) {
  try {
    return await leanApiFetch(`/consents/v1/${consentId}`);
  } catch (err) {
    if (err.status !== 404) throw err;
    return createAofConsent(user, customerId, destinationId);
  }
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

    // Only re-check status for a consent that already existed before this
    // request — Lean's sandbox has a brief propagation delay right after
    // creation, and GETting a consent immediately after POSTing it can 404
    // even though it was created successfully seconds ago. Trusting a
    // freshly-created consent's own response (always AWAITING_AUTHORISATION)
    // avoids racing that delay and spuriously creating a duplicate.
    const consent = user.aofConsentId
      ? await getLiveConsent(user, customerId, destinationId, user.aofConsentId)
      : await createAofConsent(user, customerId, destinationId);

    if (consent.status !== user.aofConsentStatus || consent.id !== user.aofConsentId) {
      db.users.update(user.id, { aofConsentId: consent.id, aofConsentStatus: consent.status });
    }

    if (consent.status === 'AUTHORISED') {
      const payment = await chargeAofConsent(user, consent.id, amount);
      return res.json({ mode: 'instant', paymentId: payment.id, status: payment.status });
    }

    if (consent.status !== 'AWAITING_AUTHORISATION') {
      // REVOKED / REJECTED / EXPIRED / CONSUMED / SUSPENDED — none of these
      // can be authorized again; a fresh consent would be needed. Out of
      // scope to auto-recover here, so this surfaces clearly rather than
      // retrying a call Lean will reject anyway.
      return res.status(409).json({ error: `AoF consent is ${consent.status} — cannot top up` });
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

    res.json({ amount: payment?.amount, currency: payment?.currency ?? 'AED', status });
  } catch (err) {
    next(err);
  }
});
