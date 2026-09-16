// Account-on-File (AoF) client — a standing bank consent, authorized once,
// that lets Meridian initiate top-ups afterward without a fresh bank redirect
// each time. This is one of the app's two top-up rails (see leanSipApi.js
// for the other, Single Instant Payment). Every call publishes into the
// same shared logStore.js the SwiftX remittance flow uses (api.js), so a
// top-up traces in the Developer Console exactly like a transfer does.
import { publishLogEntry } from './logStore.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, { group, category, ...options } = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  const id = crypto.randomUUID();

  console.log(`[lean-aof →${id}] ${method} ${path}`, body ?? '');
  publishLogEntry({ id, dir: 'out', method, path, body, group, category, time: Date.now() });

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-aof ←${id}] ${res.status} ${path}`, payload);
  publishLogEntry({ id, dir: 'in', status: res.status, path, payload, group, category, time: Date.now() });

  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanAofApi = {
  // Starts a top-up. Returns either:
  //   { mode: 'instant', paymentId, status }              — already linked, charged immediately
  //   { mode: 'authorize', appToken, customerId, consentId, accessToken } — needs Lean.authorizeConsent() first
  startTopup: (userId, amount, group) =>
    leanRequest('/api/lean/aof/topup', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
      group,
      category: 'aof-start',
    }),

  // Called right after Lean.authorizeConsent() reports SUCCESS — charges
  // the now-authorized consent for this top-up's amount.
  chargeAfterAuthorization: (userId, amount, group) =>
    leanRequest('/api/lean/aof/topup/charge', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
      group,
      category: 'aof-charge',
    }),

  getTopup: (paymentId, userId, group) =>
    leanRequest(`/api/lean/aof/topup/${paymentId}?userId=${userId}`, { group, category: 'aof-status' }),

  // Called when authorization fails for any reason other than a clean
  // cancel — a genuine attempt leaves the consent unable to accept a retry
  // (Lean rejects a second authorization attempt against the same consent
  // with 409 Conflict), so the next top-up needs a fresh one instead.
  abandonConsent: (userId, group) =>
    leanRequest('/api/lean/aof/consent/abandon', {
      method: 'POST',
      body: JSON.stringify({ userId }),
      group,
      category: 'aof-abandon',
    }),
};
