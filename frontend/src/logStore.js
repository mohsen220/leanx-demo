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
// Unpacks the `_upstream` array the backend transparently attaches to any
// JSON response (see requestContext.js/server.js) — the real Lean/SwiftX
// API calls made while handling that request — and logs each as its own
// out+in pair under the same journey `group`, category 'lean-api'. This is
// what lets the Developer Console show the actual upstream calls behind our
// own route, not just the route itself. Every lean*Api.js/api.js client
// calls this right after receiving a response.
export function logUpstreamCalls(payload, group) {
  const upstream = payload?._upstream;
  if (!Array.isArray(upstream) || !upstream.length) return;
  for (const u of upstream) {
    const id = crypto.randomUUID();
    publishLogEntry({
      id,
      dir: 'out',
      method: u.method,
      path: u.path,
      body: u.requestBody,
      group,
      category: `${u.api}-api`,
      time: u.startedAt,
    });
    publishLogEntry({
      id,
      dir: 'in',
      status: u.status,
      path: u.path,
      payload: u.responseBody,
      group,
      category: `${u.api}-api`,
      time: u.endedAt,
    });
  }
  delete payload._upstream;
}

// manageConsents is a view/manage widget, not something to authorize or
// complete — there's nothing to "back out of," so however the customer
// closes it (CANCELLED included) is a normal terminal outcome, not a
// failure. Only authorization-style methods (authorizeConsent, checkout,
// connect, pay) have a real "gave up before finishing" case.
const VIEW_ONLY_SDK_METHODS = new Set(['manageConsents']);

export function logSdkEvent({ method, group, kind, config, payload }) {
  const id = crypto.randomUUID();
  const time = Date.now();
  const request = kind === 'invoke' ? redactSdkConfig(config) : undefined;
  // A callback whose status is neither SUCCESS nor CANCELLED isn't a
  // failure — some LinkSDK methods (authorizeConsent in particular) are
  // documented to fire an early, non-terminal callback before the real
  // outcome arrives, and callers correctly treat it as "still in
  // progress," not an error. Coding it as a 4xx here would show a red
  // "failed" pill on a step that's actually pending — `null` renders as
  // the same "···" pending state a call still in flight gets.
  const status =
    kind === 'invoke' || VIEW_ONLY_SDK_METHODS.has(method)
      ? 200
      : payload?.status === 'SUCCESS'
        ? 200
        : payload?.status === 'CANCELLED'
          ? 499
          : null;

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
