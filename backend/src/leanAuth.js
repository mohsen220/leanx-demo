import { leanConfig, requireOAuthCredentials } from './leanConfig.js';

// Caches the backend-to-backend ("api" scope) token in memory since it's
// reused across requests until it expires. Customer-scoped tokens (minted
// per LinkSDK session) are never cached — each one is single-purpose.
let cachedApiToken = null; // { accessToken, expiresAt }

async function requestToken(scope) {
  requireOAuthCredentials();

  const body = new URLSearchParams({
    client_id: leanConfig.clientId,
    client_secret: leanConfig.clientSecret,
    grant_type: 'client_credentials',
    scope,
  });

  const res = await fetch(`${leanConfig.authBaseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lean token request failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function getApiToken() {
  const now = Date.now();
  if (cachedApiToken && cachedApiToken.expiresAt > now + 30_000) {
    return cachedApiToken.accessToken;
  }

  const { access_token, expires_in } = await requestToken('api');
  cachedApiToken = {
    accessToken: access_token,
    expiresAt: now + expires_in * 1000,
  };
  return access_token;
}

export async function getCustomerToken(customerId) {
  const { access_token, expires_in } = await requestToken(`customer.${customerId}`);
  return { accessToken: access_token, expiresIn: expires_in };
}
