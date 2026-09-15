import { importJWK, SignJWT } from 'jose';
import { swiftxConfig } from './swiftxConfig.js';

// Caches the signed JWT in memory since it's reusable until it expires —
// same idea as leanAuth.js's cachedApiToken in the other demo.
let cachedToken = null; // { token, expiresAt }

export async function getSwiftxToken() {
  if (swiftxConfig.mockMode) return 'mock-token';

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const { jwk, host } = swiftxConfig;
  const key = await importJWK(jwk, jwk.alg ?? 'RS256');
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  // Header/claims shape matches the SwiftX JWT guide exactly: kid in the
  // header, sub = kid, aud/iss = the API host with no path.
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })
    .setSubject(jwk.kid)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setAudience(host)
    .setIssuer(host)
    .sign(key);

  cachedToken = { token, expiresAt: exp * 1000 };
  return token;
}
