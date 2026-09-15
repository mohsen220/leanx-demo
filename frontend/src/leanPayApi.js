// Lean Pay (Open Finance top-up) client. Kept separate from api.js on
// purpose: api.js's calls are traced in the Lean X Developer Console, which
// is built around the cross-border rail (corridors, quotes, remittances).
// Lean Pay is a genuinely different rail with its own auth and concepts
// (customers, payment intents, hosted sessions), so it gets its own console
// logging here rather than being force-fit into that UI. A combined "both
// rails, one timeline" trace view is a natural next step, not built yet.
const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, options = {}) {
  const method = options.method ?? 'GET';
  console.log(`[lean-pay →] ${method} ${path}`, options.body ? JSON.parse(options.body) : '');

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-pay ←] ${res.status} ${path}`, payload);
  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanPayApi = {
  // Creates a Payment Intent against Falcon's own collection account, plus a
  // Lean-hosted Session for it — the session_url is where the customer
  // actually authorizes, via a full-page redirect (not an embedded modal).
  createTopupIntent: (userId, amount) =>
    leanRequest('/api/lean/topups', { method: 'POST', body: JSON.stringify({ userId, amount }) }),

  // Polled after the customer returns from Lean's hosted flow, since bank
  // authorization settles asynchronously. The backend credits Falcon's
  // ledger the first time this sees ACCEPTED_BY_BANK.
  getTopupIntent: (intentId, userId) => leanRequest(`/api/lean/topups/${intentId}?userId=${userId}`),
};
