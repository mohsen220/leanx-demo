import { swiftxConfig } from './swiftxConfig.js';
import { getSwiftxToken } from './swiftxAuth.js';
import * as mock from './mockSwiftx.js';
import { recordUpstreamCall } from './requestContext.js';

let requestCounter = 0;

function truncate(value, max = 4000) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}… [truncated ${str.length - max} chars]` : str;
}

// Real network call to the SwiftX sandbox — only used when swiftxConfig.mockMode is false.
async function rawRequest({ method, path, query, body }) {
  const token = await getSwiftxToken();
  const url = new URL(`${swiftxConfig.baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const hasBody = body !== undefined && body !== null && method !== 'GET';
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, payload };
}

// The real API's GET /payments{,/{id}} wraps everything as
// { id, order, response, quote } — live status lives at response.status,
// not top-level. Our mock already returns the flat shape the frontend
// expects, so this only transforms real-mode payloads (detected by the
// presence of `order`/`response`) and passes mock payloads through untouched.
function flattenPaymentOrderInfo(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (!raw.order && !raw.response) return raw;

  const { order = {}, response = {}, quote } = raw;
  return {
    id: raw.id,
    external_id: order.external_id ?? null,
    status: response.status,
    msg: response.msg ?? null,
    country: order.country,
    amount: response.amount ?? order.amount,
    amount_currency: response.amount_currency,
    base_amount: response.base_amount,
    base_currency: response.base_currency,
    wallet_amount: response.wallet_amount,
    wallet_currency: response.wallet_currency,
    wallet_premium: response.wallet_premium,
    wallet_txn_cost: response.wallet_txn_cost,
    bank_reference: response.bank_reference ?? response.payment_reference ?? null,
    bank_name: order.bank_name ?? null,
    beneficiary_name: order.beneficiary_name ?? null,
    beneficiary_account_number: order.beneficiary_account_number ?? null,
    remarks: order.remarks ?? null,
    created: order.timestamp ?? response.timestamp,
    transaction_completed: response.status === 'succeeded' ? response.timestamp : null,
    quote,
  };
}

// Every SwiftX call goes through here so the wire-level log looks identical
// whether it's hitting the real sandbox or the in-memory mock — the tag
// ([swiftx] vs [mock]) is the only visible difference.
async function call(label, { method, path, query, body }, mockFn) {
  const id = ++requestCounter;
  const startedAt = Date.now();
  const tag = swiftxConfig.mockMode ? 'mock' : 'swiftx';
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : '';

  console.log(`\n[${tag} →${id}] ${method} ${path}${qs}`);
  if (body) console.log(`[${tag} →${id}] body: ${truncate(body)}`);

  let status;
  let ok;
  let payload;

  if (swiftxConfig.mockMode) {
    try {
      payload = await mockFn();
      status = 200;
      ok = true;
    } catch (err) {
      status = err.status ?? 500;
      ok = false;
      payload = { detail: err.message };
    }
  } else {
    ({ status, ok, payload } = await rawRequest({ method, path, query, body }));
  }

  console.log(`[${tag} ←${id}] ${status}`);
  console.log(`[${tag} ←${id}] response: ${truncate(payload)}\n`);

  recordUpstreamCall({
    api: tag, // 'mock' or 'swiftx' — the console shows this distinctly from real Lean calls
    method,
    path: `${path}${qs}`,
    status,
    requestBody: body,
    responseBody: payload,
    startedAt,
    endedAt: Date.now(),
  });

  if (!ok) {
    const err = new Error(`SwiftX ${label} failed (${status}): ${truncate(payload)}`);
    err.status = status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export const swiftxApi = {
  debug: () => call('GET /debug', { method: 'GET', path: '/debug' }, () => ({ ok: true, mock: true })),

  validateAccount: (body) =>
    call('POST /validate_account', { method: 'POST', path: '/validate_account', body }, () =>
      mock.validateAccount(body),
    ),

  getBalance: (country) =>
    call('GET /balance', { method: 'GET', path: '/balance', query: { country } }, () => mock.getBalance(country)),

  createQuote: (body) =>
    call('POST /quote', { method: 'POST', path: '/quote', body }, () => mock.createQuote(body)),

  getQuoteById: (id, country) =>
    call('GET /quote/:id', { method: 'GET', path: `/quote/${id}`, query: { country } }, () => mock.getQuoteById(id)),

  createPayment: (body) =>
    call('POST /payment', { method: 'POST', path: '/payment', body }, () => mock.createPayment(body)),

  // 404 here is the expected "safe to send" signal, not a failure — callers
  // should catch and inspect err.status themselves.
  getPaymentByExternalId: async (externalId, country) =>
    flattenPaymentOrderInfo(
      await call(
        'GET /payments (external)',
        { method: 'GET', path: `/payments/${externalId}`, query: { external: 'true', country } },
        () => mock.getPayment(externalId, { external: true, country }),
      ),
    ),

  getPaymentById: async (id, country) =>
    flattenPaymentOrderInfo(
      await call('GET /payments/:id', { method: 'GET', path: `/payments/${id}`, query: { country } }, () =>
        mock.getPayment(id, { country }),
      ),
    ),

  listPayments: async ({ country, limit, offset }) => {
    const payload = await call(
      'GET /payments',
      { method: 'GET', path: '/payments', query: { country, limit, offset } },
      () => mock.listPayments({ country, limit, offset }),
    );
    return Array.isArray(payload) ? payload.map(flattenPaymentOrderInfo) : payload;
  },
};
