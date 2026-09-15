// Account-on-File (AoF) client — a standing bank consent, authorized once,
// that lets Falcon initiate top-ups afterward without a fresh bank redirect
// each time. This is the app's top-up rail (replaced an earlier Payment
// Links/Sessions API attempt that reliably failed at the authorization step
// on this sandbox app).
const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanRequest(path, options = {}) {
  const method = options.method ?? 'GET';
  console.log(`[lean-aof →] ${method} ${path}`, options.body ? JSON.parse(options.body) : '');

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-aof ←] ${res.status} ${path}`, payload);
  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanAofApi = {
  // Starts a top-up. Returns either:
  //   { mode: 'instant', paymentId, status }              — already linked, charged immediately
  //   { mode: 'authorize', appToken, customerId, consentId, accessToken } — needs Lean.authorizeConsent() first
  startTopup: (userId, amount) =>
    leanRequest('/api/lean/aof/topup', { method: 'POST', body: JSON.stringify({ userId, amount }) }),

  // Called right after Lean.authorizeConsent() reports SUCCESS — charges
  // the now-authorized consent for this top-up's amount.
  chargeAfterAuthorization: (userId, amount) =>
    leanRequest('/api/lean/aof/topup/charge', { method: 'POST', body: JSON.stringify({ userId, amount }) }),

  getTopup: (paymentId, userId) => leanRequest(`/api/lean/aof/topup/${paymentId}?userId=${userId}`),

  // Called when authorization fails for any reason other than a clean
  // cancel — a genuine attempt leaves the consent unable to accept a retry
  // (Lean rejects a second authorization attempt against the same consent
  // with 409 Conflict), so the next top-up needs a fresh one instead.
  abandonConsent: (userId) =>
    leanRequest('/api/lean/aof/consent/abandon', { method: 'POST', body: JSON.stringify({ userId }) }),
};
