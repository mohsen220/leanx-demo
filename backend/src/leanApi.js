import { leanConfig } from './leanConfig.js';
import { getApiToken, getCustomerToken } from './leanAuth.js';
import { recordUpstreamCall } from './requestContext.js';

let requestCounter = 0;

function truncate(value, max = 4000) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}… [truncated ${str.length - max} chars]` : str;
}

// Raw authenticated call to any Lean sandbox/production path. Every call is
// logged in full (method, path, body, status, response) so the wire-level
// traffic is visible while poking at the API from the explorer or routes.
//
// `scope` is either 'api' (default, backend-to-backend) or a customer_id
// string, in which case a `customer.<id>` scoped token is minted instead.
export async function leanRequest({ method = 'GET', path, query, body, scope = 'api', headers = {} }) {
  const id = ++requestCounter;
  const startedAt = Date.now();
  const accessToken =
    scope === 'api' ? await getApiToken() : (await getCustomerToken(scope)).accessToken;

  const url = new URL(`${leanConfig.apiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
  }

  const hasBody = body !== undefined && body !== null && method !== 'GET' && method !== 'DELETE';

  console.log(`\n[lean →${id}] ${method} ${url.pathname}${url.search}`);
  console.log(`[lean →${id}] scope=${scope} auth=Bearer ${accessToken.slice(0, 12)}…`);
  if (hasBody) console.log(`[lean →${id}] body: ${truncate(body)}`);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  console.log(`[lean ←${id}] ${res.status} ${res.statusText}`);
  console.log(`[lean ←${id}] response: ${truncate(payload)}\n`);

  recordUpstreamCall({
    api: 'lean',
    method,
    path: `${url.pathname}${url.search}`,
    status: res.status,
    requestBody: hasBody ? body : undefined,
    responseBody: payload,
    startedAt,
    endedAt: Date.now(),
  });

  return { status: res.status, ok: res.ok, payload };
}

// Convenience wrapper matching the old leanApiFetch(path, options) shape used
// by the hand-written routes (customers.js, data.js). Throws on non-2xx so
// those routes can keep their simple try/catch style.
export async function leanApiFetch(path, options = {}) {
  const { status, ok, payload } = await leanRequest({
    method: options.method ?? 'GET',
    path,
    body: options.body ? JSON.parse(options.body) : undefined,
    headers: options.headers,
  });

  if (!ok) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const err = new Error(`Lean API ${options.method ?? 'GET'} ${path} failed (${status}): ${message}`);
    err.status = status;
    err.payload = payload;
    throw err;
  }

  return payload;
}
