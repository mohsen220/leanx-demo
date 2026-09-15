import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith('REPLACE_WITH')) {
    throw new Error(`Missing/placeholder env var ${name} — set it in backend/.env`);
  }
  return value;
}

const isSandbox = (process.env.LEAN_ENV ?? 'sandbox') !== 'production';

export const leanConfig = {
  clientId: process.env.LEAN_CLIENT_ID,
  clientSecret: process.env.LEAN_CLIENT_SECRET,
  appToken: required('LEAN_APP_TOKEN'),
  webhookSecret: required('LEAN_WEBHOOK_SECRET'),
  isSandbox,
  authBaseUrl: isSandbox ? 'https://auth.sandbox.leantech.me' : 'https://auth.leantech.me',
  apiBaseUrl: isSandbox ? 'https://sandbox.leantech.me' : 'https://api2.leantech.me',
};

export function requireOAuthCredentials() {
  required('LEAN_CLIENT_ID');
  required('LEAN_CLIENT_SECRET');
}
