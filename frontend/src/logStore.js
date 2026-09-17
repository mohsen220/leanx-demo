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

// Drops anything unserializable/sensitive from a LinkSDK config object
// before it's logged: `callback` is a function (JSON.stringify would just
// silently omit it anyway, but this is explicit), and access_token is a
// full JWT — truncated so it's still recognizable without dumping the
// whole token into a log every screen can read.
function redactSdkConfig(config) {
  const { callback: _callback, ...rest } = config ?? {};
  if (rest.access_token) rest.access_token = `${rest.access_token.slice(0, 12)}…`;
  return rest;
}

// Every LinkSDK method call site (EnterTopupAmount.jsx, App.jsx) logs
// through this — one entry per SDK-level event, alongside the REST calls
// api.js/leanAofApi.js/leanSipApi.js/leanReApi.js already log, so the
// Developer Console can show the two interleaved: e.g. "POST
// /api/lean/sip/topup" immediately followed by "Lean.checkout()" for the
// same top-up. Call once when invoking the method (kind: 'invoke',
// config: the object passed in) and once per callback firing (kind:
// 'callback', payload: what the callback received) — including early,
// non-terminal firings some LinkSDK callbacks are known to send, since
// showing those (rather than only the final outcome) is the actual point
// of a "what is the SDK really doing" trace.
export function logSdkEvent({ method, group, kind, config, payload }) {
  const id = crypto.randomUUID();
  const time = Date.now();
  const request = kind === 'invoke' ? redactSdkConfig(config) : undefined;
  const status = kind === 'invoke' ? 200 : payload?.status === 'SUCCESS' ? 200 : payload?.status === 'CANCELLED' ? 499 : 400;

  publishLogEntry({
    id,
    dir: 'out',
    method: 'SDK',
    path: `Lean.${method}()`,
    body: request,
    group,
    category: `sdk-${method}`,
    time,
  });
  publishLogEntry({
    id,
    dir: 'in',
    status,
    path: `Lean.${method}()`,
    payload: kind === 'invoke' ? { invoked: true } : payload,
    group,
    category: `sdk-${method}`,
    time,
  });
}
