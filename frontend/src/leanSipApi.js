// SIP (Single Instant Payment) client — a one-off Open Finance bank
// payment authorized fresh every time via Lean.checkout(), no standing
// consent. The alternative to leanAofApi.js on the same top-up screen.
// Every call publishes into the same shared logStore.js the SwiftX
// remittance flow uses (api.js), so a top-up traces in the Developer
// Console exactly like a transfer does.
import { publishLogEntry } from './logStore.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, { group, category, ...options } = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  const id = crypto.randomUUID();

  console.log(`[lean-sip →${id}] ${method} ${path}`, body ?? '');
  publishLogEntry({ id, dir: 'out', method, path, body, group, category, time: Date.now() });

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-sip ←${id}] ${res.status} ${path}`, payload);
  publishLogEntry({ id, dir: 'in', status: res.status, path, payload, group, category, time: Date.now() });

  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanSipApi = {
  // Always returns { appToken, customerId, paymentIntentId, accessToken } —
  // unlike AoF there's no "already linked, charge instantly" path; every SIP
  // top-up needs a fresh Lean.checkout() authorization.
  startTopup: (userId, amount, group) =>
    leanRequest('/api/lean/sip/topup', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
      group,
      category: 'sip-start',
    }),

  getTopup: (paymentIntentId, userId, group) =>
    leanRequest(`/api/lean/sip/topup/${paymentIntentId}?userId=${userId}`, { group, category: 'sip-status' }),
};
