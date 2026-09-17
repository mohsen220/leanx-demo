// RE (Reverse Engineered) payments client — Lean's original, pre-Open-
// Finance UAE A2A rail: the customer connects their bank once (permissions:
// ['payments']) via Lean.connect(), then Lean.pay() executes against that
// connection directly, entirely within this app (no redirect, unlike
// AoF/SIP). Every call publishes into the same shared logStore.js the
// SwiftX remittance flow uses (api.js), so a top-up traces in the
// Developer Console exactly like a transfer does.
import { publishLogEntry, logUpstreamCalls } from './logStore.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, { group, category, ...options } = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  const id = crypto.randomUUID();

  console.log(`[lean-re →${id}] ${method} ${path}`, body ?? '');
  publishLogEntry({ id, dir: 'out', method, path, body, group, category, time: Date.now() });

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-re ←${id}] ${res.status} ${path}`, payload);
  logUpstreamCalls(payload, group);
  publishLogEntry({ id, dir: 'in', status: res.status, path, payload, group, category, time: Date.now() });

  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanReApi = {
  // Returns { appToken, customerId, destinationId, paymentIntentId, accessToken }
  // — destinationId is what Lean.connect() needs (payment_destination_id).
  startTopup: (userId, amount, group) =>
    leanRequest('/api/lean/re/topup', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
      group,
      category: 're-start',
    }),

  getTopup: (paymentIntentId, userId, group) =>
    leanRequest(`/api/lean/re/topup/${paymentIntentId}?userId=${userId}`, { group, category: 're-status' }),
};
