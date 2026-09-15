import crypto from 'node:crypto';
import { getCorridor } from './corridors.js';

// In-memory simulation of the real v2 API's behavior, close enough to the
// documented response shapes (SolEng Notion checklist + Postman collection)
// that the frontend can't tell the difference from the real sandbox.
const quotes = new Map();
const payments = new Map();
const externalIndex = new Map();

// A few well-known account numbers double as easter eggs so the demo can
// show every validate_account state without needing real bank data.
const VALIDATE_STATES = {
  '00000000000': 'invalid',
  '11111111111': 'nre',
  '22222222222': 'pending',
};

export function validateAccount({ country, account_number, bank_branch_code }) {
  const corridor = getCorridor(country);
  if (!corridor.hasValidateAccount) {
    const err = new Error(`validate_account is not available for ${country}`);
    err.status = 400;
    throw err;
  }

  const status = VALIDATE_STATES[account_number] ?? 'valid';
  const name = status === 'valid' ? corridor.sample.beneficiary_name : null;
  return { status, country, account_number, bank_branch_code, name };
}

export function getBalance(country) {
  const corridor = getCorridor(country);
  const walletBalance = 985_432.17;
  return {
    currency: corridor.currency,
    balance: Math.round(walletBalance * corridor.rate * 100) / 100,
    wallet_currency: 'USDT',
    wallet_currency_rate: corridor.rate,
    wallet_balance: walletBalance,
  };
}

export function createQuote({ country, currency, amount, amount_destination, beneficiary_account_number, bank_branch_code }) {
  const corridor = getCorridor(country);
  const rate = corridor.rate;

  let amountSource;
  let amountDestination;
  if (amount_destination !== undefined && amount_destination !== null && amount_destination !== '') {
    amountDestination = Number(amount_destination);
    amountSource = Math.round((amountDestination / rate) * 10_000) / 10_000;
  } else {
    amountSource = Number(amount);
    amountDestination = Math.round(amountSource * rate * 100) / 100;
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const record = {
    id,
    country,
    currency,
    amount: amountSource,
    amount_destination: amountDestination,
    rate,
    wallet_rate: rate,
    timestamp: now.toISOString(),
    expires: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    min_amount_destination: Math.round(rate * 5 * 100) / 100,
    max_amount_destination: Math.round(rate * 5000 * 100) / 100,
    beneficiary_account_number,
    bank_branch_code,
    consumed: false,
  };
  quotes.set(id, record);

  const { consumed, ...response } = record;
  return response;
}

export function getQuoteById(id) {
  const quote = quotes.get(id);
  if (!quote) {
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }
  const { consumed, ...response } = quote;
  return response;
}

function assertQuoteUsable(quote, amount) {
  if (!quote) {
    const err = new Error('Unable to fetch quote (min/max amount requirements)');
    err.status = 400;
    throw err;
  }
  if (quote.consumed) {
    const err = new Error('Quote already used');
    err.status = 400;
    throw err;
  }
  if (new Date(quote.expires).getTime() < Date.now()) {
    const err = new Error('Quote has expired');
    err.status = 400;
    throw err;
  }
  if (Math.abs(amount - quote.amount_destination) > 0.01) {
    const err = new Error("Payment amount must equal the quote's amount_destination");
    err.status = 400;
    throw err;
  }
}

export function findPaymentByExternalId(externalId) {
  const id = externalIndex.get(externalId);
  return id ? payments.get(id) : null;
}

export function createPayment(body) {
  const { country, currency, quote: quoteId, amount, external_id } = body;

  if (!external_id) {
    const err = new Error('external_id is required');
    err.status = 400;
    throw err;
  }
  if (externalIndex.has(external_id)) {
    const err = new Error(`Payment with external_id ${external_id} already exists`);
    err.status = 409;
    throw err;
  }

  const quote = quotes.get(quoteId);
  assertQuoteUsable(quote, Number(amount));
  quote.consumed = true;

  const corridor = getCorridor(country);
  const id = crypto.randomUUID();
  const now = new Date();
  const record = {
    id,
    external_id,
    status: 'queued',
    country,
    amount: quote.amount_destination,
    amount_currency: corridor.currency,
    base_amount: quote.amount,
    base_currency: currency,
    wallet_amount: quote.amount,
    wallet_currency: 'USDT',
    bank_name: body.bank_name ?? null,
    beneficiary_name: body.beneficiary_name ?? null,
    beneficiary_account_number: body.beneficiary_account_number ?? null,
    remarks: body.remarks ?? null,
    created: now.toISOString(),
    transaction_completed: null,
  };
  payments.set(id, record);
  externalIndex.set(external_id, id);

  // Simulated settlement: queued -> processing -> succeeded. Real stablecoin
  // settlement is the whole point of the demo (seconds, not days), so these
  // delays are tuned to be visibly fast without feeling instantaneous/fake.
  setTimeout(() => {
    const p = payments.get(id);
    if (p) p.status = 'processing';
  }, 3000);
  setTimeout(() => {
    const p = payments.get(id);
    if (p) {
      p.status = 'succeeded';
      p.transaction_completed = new Date().toISOString();
    }
  }, 9000);

  return { ...record };
}

export function getPayment(idOrExternal, { external, country } = {}) {
  const record = external ? findPaymentByExternalId(idOrExternal) : payments.get(idOrExternal);
  if (!record) {
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }
  if (country && record.country !== country) {
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }
  return { ...record };
}

export function listPayments({ country, limit = 10, offset = 0 } = {}) {
  let all = [...payments.values()].sort((a, b) => new Date(b.created) - new Date(a.created));
  if (country) all = all.filter((p) => p.country === country);
  return all.slice(Number(offset), Number(offset) + Number(limit));
}
