import { AsyncLocalStorage } from 'node:async_hooks';

// Correlates every upstream call (leanApi.js, swiftxApi.js) with whichever
// frontend-triggered backend request caused it, so the Developer Console can
// show the real Lean/SwiftX API calls behind our own route — not just our
// own route itself. AsyncLocalStorage rather than threading a request id
// through every function signature: leanApiFetch() is called from a dozen
// route files several layers deep, and passing an id through all of them
// just to reach the wire-level logger is exactly the kind of plumbing this
// exists to avoid.
const als = new AsyncLocalStorage();

export function withRequestContext(_req, _res, next) {
  als.run({ upstream: [] }, next);
}

export function recordUpstreamCall(entry) {
  const store = als.getStore();
  if (store) store.upstream.push(entry);
}

export function getUpstreamCalls() {
  return als.getStore()?.upstream ?? [];
}
