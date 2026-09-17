import { publishLogEntry, logUpstreamCalls } from './logStore.js';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';

async function request(path, options = {}) {
  // `group` and `category` aren't fetch options — `group` is our own
  // correlation id (one per send-money attempt or per page visit) and
  // `category` names which SwiftX capability this is, so the Developer
  // Console can group/filter by either axis.
  const { group, category, ...fetchOptions } = options;
  // A real UUID, not an incrementing counter — the log now persists across
  // page reloads and tabs (logStore.js), so a counter that resets to 0 on
  // every load would eventually collide with an earlier session's ids.
  const id = crypto.randomUUID();
  const body = fetchOptions.body ? JSON.parse(fetchOptions.body) : undefined;
  const method = fetchOptions.method ?? 'GET';

  console.log(`[frontend →${id}] ${method} ${path}`, body ?? '');
  publishLogEntry({ id, dir: 'out', method, path, body, group, category, time: Date.now() });

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...fetchOptions,
  });
  const payload = await res.json();

  console.log(`[frontend ←${id}] ${res.status} ${path}`, payload);
  logUpstreamCalls(payload, group);
  publishLogEntry({ id, dir: 'in', status: res.status, path, payload, group, category, time: Date.now() });

  if (!res.ok) throw new Error(payload.error ?? `Request to ${path} failed`);
  return payload;
}

function qs(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

export const api = {
  getHealth: (group) => request('/health', { group, category: 'system' }),
  getCorridors: (group) => request('/api/corridors', { group, category: 'corridors' }),

  validateAccount: (body, group) =>
    request('/api/validate-account', { method: 'POST', body: JSON.stringify(body), group, category: 'validation' }),
  getBalance: (country, group) => request(`/api/balance${qs({ country })}`, { group, category: 'balance' }),

  getQuote: (body, group) => request('/api/quotes', { method: 'POST', body: JSON.stringify(body), group, category: 'quote' }),

  sendPayment: (body, group) =>
    request('/api/payments', { method: 'POST', body: JSON.stringify(body), group, category: 'payment' }),
  getPayment: (id, country, group) =>
    request(`/api/payments/${id}${qs({ country })}`, { group, category: 'payment-status' }),
  listPayments: (country, group) =>
    request(`/api/payments${qs({ country, limit: 50 })}`, { group, category: 'history' }),
};
