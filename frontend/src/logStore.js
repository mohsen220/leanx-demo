// Shared request/response log, readable from any tab on this origin —
// the demo's phone UI and the separate Developer Console page both write
// to and read from this same store. Two mechanisms, for two situations:
//   - BroadcastChannel: live delivery to *other* already-open tabs.
//   - localStorage: so a Developer Console opened *after* the fact still
//     shows everything that already happened, not just new calls.
const CHANNEL_NAME = 'swiftx-demo-log';
const STORAGE_KEY = 'swiftx_demo_log_v1';
const MAX_ENTRIES = 2000;

const channel = (() => {
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
})();

function loadPersisted() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist(calls) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calls.slice(0, MAX_ENTRIES)));
  } catch {
    // storage full or unavailable — the in-memory copy still works for this tab
  }
}

let calls = loadPersisted();
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn(calls);
}

// Merges one wire event (a request just sent, or a response just received)
// into the call list, pairing request+response by id into a single record.
function applyEntry(entry) {
  if (entry.dir === 'out') {
    const call = {
      id: entry.id,
      group: entry.group ?? null,
      category: entry.category ?? 'other',
      method: entry.method,
      path: entry.path,
      body: entry.body,
      time: entry.time,
      status: null,
      payload: null,
      duration: null,
    };
    calls = [call, ...calls].slice(0, MAX_ENTRIES);
  } else {
    calls = calls.map((c) =>
      c.id === entry.id ? { ...c, status: entry.status, payload: entry.payload, duration: entry.time - c.time } : c,
    );
  }
  persist(calls);
  notify();
}

if (channel) {
  channel.onmessage = (ev) => applyEntry(ev.data);
}

// Called by api.js for every request sent and every response received.
// Applies locally immediately (BroadcastChannel never delivers back to the
// tab that posted the message) and broadcasts to every other open tab.
export function publishLogEntry(entry) {
  applyEntry(entry);
  channel?.postMessage(entry);
}

export function getLog() {
  return calls;
}

export function subscribeLog(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function clearLog() {
  calls = [];
  persist(calls);
  notify();
}
