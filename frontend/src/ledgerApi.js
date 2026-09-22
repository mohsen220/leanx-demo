// Meridian's own back-office data — customers, saved recipients, transactions.
// Deliberately NOT routed through logStore/api.js: it isn't SwiftX/Lean X
// traffic, so it has no business appearing in the Lean X Developer Console,
// which traces the rail, not Meridian's internal ledger.
const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function ledgerRequest(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

function qs(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

export const ledgerApi = {
  getUser: (userId) => ledgerRequest(`/api/users/${userId}`),
  listUsers: () => ledgerRequest('/api/users'),
  // Sign-up and sign-in in one call — a new email creates a Meridian account
  // (ledger only, no Lean involved), an existing one checks the password.
  login: (email, password) =>
    ledgerRequest('/api/users/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  topUp: (userId, amount) =>
    ledgerRequest(`/api/users/${userId}/topup`, { method: 'POST', body: JSON.stringify({ amount }) }),

  listRecipients: (userId) => ledgerRequest(`/api/users/${userId}/recipients`),
  saveRecipient: (userId, recipient) =>
    ledgerRequest(`/api/users/${userId}/recipients`, { method: 'POST', body: JSON.stringify(recipient) }),

  listTransactions: (userId) => ledgerRequest(`/api/transactions${qs({ userId })}`),
};
