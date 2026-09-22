// Keeps a Lean X transfer's status polling running independent of any
// screen — the entire point being that navigating away from TrackStatus
// (or reloading the page) must not kill it. Same shape as logStore.js:
// a module-level array persisted to localStorage, a subscriber set, and a
// polling loop that lives here rather than inside a React effect, so it
// has no component lifecycle to be killed by.
import { api } from './api.js';

const STORAGE_KEY = 'falcon_inflight_transfers';
const TERMINAL = ['succeeded', 'failed', 'rejected', 'unknown', 'canceled', 'reversed'];

function loadPersisted() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trackers));
  } catch {
    // storage full/unavailable — the in-memory copy still works for this tab
  }
}

let trackers = loadPersisted();
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn(trackers);
}

function patchTracker(id, patch) {
  trackers = trackers.map((t) => (t.id === id ? { ...t, ...patch } : t));
  persist();
  notify();
}

// Quick polls while the payment is fresh, then back off — same timing
// TrackStatus.jsx used to run itself, kept here so a slow sandbox (a
// shared environment behind a WAF) still isn't hammered. On any single
// poll failure this stops and records the error on the tracker rather
// than retrying forever silently in the background — matches the
// original component's stop-on-error behavior, just visible whenever the
// tracker is next looked at instead of requiring a live setError() call.
function pollTracker(id, attempt = 0) {
  const delayFor = (n) => (n < 5 ? 1200 : n < 15 ? 3000 : 6000);
  const tracker = trackers.find((t) => t.id === id);
  if (!tracker || tracker.completed) return;

  api
    .getPayment(id, tracker.corridor.code, tracker.flowId)
    .then((data) => {
      if (!trackers.some((t) => t.id === id)) return; // dismissed while this call was in flight
      const isTerminal = TERMINAL.includes(data.status);
      patchTracker(id, {
        status: data.status,
        amount: data.amount,
        amountCurrency: data.amount_currency,
        bankReference: data.bank_reference,
        transactionCompleted: data.transaction_completed,
        completed: isTerminal,
      });
      if (!isTerminal) setTimeout(() => pollTracker(id, attempt + 1), delayFor(attempt));
    })
    .catch((err) => {
      if (!trackers.some((t) => t.id === id)) return;
      patchTracker(id, { error: err.message });
    });
}

// `entry` is a full snapshot of everything the receipt/timeline needs
// ({ id, flowId, corridor, recipient, quote, purpose, status, ... }) — see
// SendFlow.jsx's call site. Storing the whole snapshot (not just display
// strings) means a resumed TrackStatus needs nothing from its parent but
// the tracker id.
export function startTracking(entry) {
  trackers = [{ completed: false, ...entry }, ...trackers];
  persist();
  notify();
  pollTracker(entry.id);
}

export function getTrackers() {
  return trackers;
}

export function getTracker(id) {
  return trackers.find((t) => t.id === id) ?? null;
}

export function subscribeInflight(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// Once the customer has acknowledged an outcome (tapped "Done" on
// TrackStatus, or dismissed the background banner) there's nothing left to
// track — drop it rather than keeping a growing list of finished transfers.
export function dismissTracker(id) {
  trackers = trackers.filter((t) => t.id !== id);
  persist();
  notify();
}

// Resume polling anything still in flight from before a reload/tab close —
// this is what makes "let them leave" survive more than just an in-app
// navigation.
for (const t of trackers) {
  if (!t.completed) pollTracker(t.id);
}
