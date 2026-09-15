// Customer-facing helpers for the exchange-house app. Recipients, the
// sender's KYC profile, and transaction history now live in Falcon's own
// backend ledger (see ledgerApi.js / backend/src/db.js) — this file keeps
// only the pure, storage-free bits: enum data and display helpers, plus
// which ledger customer this browser is currently "logged in" as.

// Remembers which Falcon customer this browser is acting as — set once
// onboarding creates a ledger user, cleared on log out. Nothing about Lean
// lives here: that relationship starts later, on the customer's first top-up.
const ACTIVE_USER_KEY = 'falcon_demo_active_user';

export function getActiveUserId() {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

export function setActiveUserId(id) {
  try {
    localStorage.setItem(ACTIVE_USER_KEY, id);
  } catch {
    // storage unavailable — the session still works, just won't survive a reload
  }
}

export function clearActiveUserId() {
  try {
    localStorage.removeItem(ACTIVE_USER_KEY);
  } catch {
    // no-op
  }
}

// Real values the API accepts for sender_relation (from the spec's Relation enum).
export const RELATIONS = [
  { value: 'own', label: 'Myself' },
  { value: 'wife', label: 'Wife' },
  { value: 'husband', label: 'Husband' },
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
];

// Purpose of transfer — sent in the API's free-text `remarks` field, but a
// regulatory requirement in most corridors, so it's a fixed list here.
export const PURPOSES = ['Family support', 'Education', 'Medical', 'Savings', 'Rent or bills', 'Gift', 'Other'];

// Customer-facing wording for the API's raw payment status values.
export const STATUS_LABEL = {
  succeeded: 'Delivered',
  queued: 'Sending',
  pending: 'Sending',
  processing: 'On its way',
  failed: 'Failed',
  rejected: 'Rejected',
  canceled: 'Cancelled',
  reversed: 'Refunded',
  unknown: 'Needs attention',
};

// Maps the same raw statuses to the .status-badge color variant (styles.css).
// Shared by History (customer) and the Admin Dashboard (ops) so both surfaces
// read the same transaction the same way.
export const STATUS_CLASS = {
  succeeded: 'success',
  queued: 'pending',
  pending: 'pending',
  processing: 'pending',
  failed: 'fail',
  rejected: 'fail',
  unknown: 'fail',
  canceled: 'fail',
};

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// Stable, pleasant avatar color per name so the same recipient always looks the same.
const AVATAR_COLORS = ['#12805c', '#1d4ed8', '#b45309', '#7c3aed', '#be185d', '#0e7490'];
export function avatarColor(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
