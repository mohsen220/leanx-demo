import 'dotenv/config';

const jwkRaw = process.env.SWIFTX_JWK?.trim();

// Mock mode is the supported default — no credentials needed to click
// through the demo. Drop a real JWK (delivered via 1Password by the
// SwiftX/SolEng team) into backend/.env to switch to the real sandbox.
export const swiftxConfig = {
  jwk: jwkRaw ? JSON.parse(jwkRaw) : null,
  mockMode: !jwkRaw,
  baseUrl: process.env.SWIFTX_BASE_URL ?? 'https://api.swiftxapptest.net/v2',
  host: process.env.SWIFTX_HOST ?? 'https://api.swiftxapptest.net',
};
