// SIP (Single Immediate Payment) client — a one-off Open Finance bank
// payment authorized fresh every time via Lean.pay(), no standing consent.
// The alternative to leanAofApi.js on the same top-up screen.
const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, options = {}) {
  const method = options.method ?? 'GET';
  console.log(`[lean-sip →] ${method} ${path}`, options.body ? JSON.parse(options.body) : '');

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-sip ←] ${res.status} ${path}`, payload);
  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanSipApi = {
  // Always returns { appToken, customerId, paymentIntentId, accessToken } —
  // unlike AoF there's no "already linked, charge instantly" path; every SIP
  // top-up needs a fresh Lean.pay() authorization.
  startTopup: (userId, amount) =>
    leanRequest('/api/lean/sip/topup', { method: 'POST', body: JSON.stringify({ userId, amount }) }),

  getTopup: (paymentIntentId, userId) => leanRequest(`/api/lean/sip/topup/${paymentIntentId}?userId=${userId}`),
};
