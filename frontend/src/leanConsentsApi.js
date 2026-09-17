// CMI (Consent Management Interface) client — Lean.manageConsents() lets
// the customer view and revoke their own AoF/SIP consents and see payment
// history against them. A regulatory requirement (OF taskforce, June),
// not optional. Every call publishes into the same shared logStore.js the
// rest of the app uses, so it traces in the Developer Console too.
import { publishLogEntry, logUpstreamCalls } from './logStore.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, { group, category, ...options } = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  const id = crypto.randomUUID();

  console.log(`[lean-consents →${id}] ${method} ${path}`, body ?? '');
  publishLogEntry({ id, dir: 'out', method, path, body, group, category, time: Date.now() });

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-consents ←${id}] ${res.status} ${path}`, payload);
  logUpstreamCalls(payload, group);
  publishLogEntry({ id, dir: 'in', status: res.status, path, payload, group, category, time: Date.now() });

  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanConsentsApi = {
  // Returns { appToken, customerId, accessToken } — everything
  // Lean.manageConsents() needs. No consent_id: omitting it opens the full
  // list rather than deep-linking one.
  startSession: (userId, group) =>
    leanRequest('/api/lean/consents/session', {
      method: 'POST',
      body: JSON.stringify({ userId }),
      group,
      category: 'consents-start',
    }),
};
