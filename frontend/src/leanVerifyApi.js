// Lean's Account Verification Service (AVS) — a third, distinct Lean
// product (OKYC / Verify Suite) from Lean Pay and Lean X. Publishes into the
// same shared logStore.js the rest of the app uses, tagged with its own
// `verify-<uuid>` group, so it traces in the Developer Console as its own
// product instead of being invisible to it.
import { publishLogEntry, logUpstreamCalls } from './logStore.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanVerifyRequest(path, { group, category, ...options } = {}) {
  const method = options.method ?? 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  const id = crypto.randomUUID();

  console.log(`[lean-verify →${id}] ${method} ${path}`, body ?? '');
  publishLogEntry({ id, dir: 'out', method, path, body, group, category, time: Date.now() });

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-verify ←${id}] ${res.status} ${path}`, payload);
  logUpstreamCalls(payload, group);
  publishLogEntry({ id, dir: 'in', status: res.status, path, payload, group, category, time: Date.now() });

  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanVerifyApi = {
  // Each verify attempt is its own journey — a fresh `verify-<uuid>` group
  // is minted per call rather than threaded in from the caller, since a
  // single request/response pair is the whole story here (unlike a
  // multi-step top-up flow).
  verifyAccount: (userId, iban, fullName) =>
    leanVerifyRequest('/api/lean/verify-account', {
      method: 'POST',
      body: JSON.stringify({ userId, iban, fullName }),
      group: `verify-${crypto.randomUUID()}`,
      category: 'verify-account',
    }),
};
