// Lean's Account Verification Service (AVS) — a third, distinct Lean
// product (OKYC / Verify Suite) from Lean Pay and Lean X. Kept separate for
// the same reason as leanAofApi.js: this isn't SwiftX/Lean X traffic, so it
// doesn't belong in that Developer Console's trace.
const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function leanVerifyRequest(path, options = {}) {
  const method = options.method ?? 'GET';
  console.log(`[lean-verify →] ${method} ${path}`, options.body ? JSON.parse(options.body) : '');

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await res.json();

  console.log(`[lean-verify ←] ${res.status} ${path}`, payload);
  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

export const leanVerifyApi = {
  verifyAccount: (userId, iban, fullName) =>
    leanVerifyRequest('/api/lean/verify-account', {
      method: 'POST',
      body: JSON.stringify({ userId, iban, fullName }),
    }),
};
