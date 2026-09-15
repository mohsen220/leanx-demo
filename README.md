# SwiftX (Lean X) v2 Demo

Cross-border payout demo against SwiftX's v2.5.1 API: pick a corridor, get a quote,
send a payment, watch it settle via stablecoin rails — and see how that compares
to a traditional SWIFT transfer.

This is a separate product from the other `lean-demo` in this workspace. That one
uses Lean's main Dashboard (LinkSDK, OAuth `client_id`/`client_secret`). SwiftX has
its own, unrelated auth: a self-signed RS256 JWT built from a JWK issued specifically
for SwiftX.

## Setup

```bash
cd backend && npm install && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5174.

**No credentials needed to try it.** The backend ships with `backend/.env`'s
`SWIFTX_JWK` empty, which runs it in **mock mode** — an in-memory simulation that
mirrors the real v2 API's response shapes (quote → payment → status), seeded with
the actual example numbers from SwiftX's own sandbox documentation. Click through
the whole flow — corridor, amount, beneficiary, sender, review, send, tracking —
and it behaves like the real thing, settling in ~9 seconds.

## Going live against the real sandbox

1. Get a JWK from the SwiftX/SolEng team, delivered via 1Password (same one used
   for their Postman collection's `jwk_private_key` environment variable).
2. Paste the full JWK JSON (one line) into `backend/.env` as `SWIFTX_JWK`. **Don't
   paste it into a chat** — edit the file directly.
3. Restart the backend. The startup log will say it's hitting the real sandbox at
   `https://api.swiftxapptest.net/v2` instead of running mocked.
4. Confirm with SwiftX which corridor(s) are enabled on your sandbox account —
   only those are actually callable for real.

India is the best corridor to demo end-to-end either way — it's the only one with
a `validate_account` pre-check, and its sample beneficiary/sender data comes
straight from SwiftX's own documented sandbox example.

## Corridors and easter eggs

7 corridors are modeled (India, Pakistan, Bangladesh, Egypt, Philippines, Vietnam,
Nigeria), each with real example beneficiary/sender data from SwiftX's Postman
collection. Notice how the beneficiary form changes per corridor — India/Pakistan/
Bangladesh route on a branch/SWIFT code, Nigeria on a NIBSS bank code, the rest on
just bank name + account number.

For India's `validate_account` check (mock mode only), a few account numbers are
wired to specific states so you can see all four without needing real bank data:

| Account number    | Result    |
|--------------------|-----------|
| `20190100087322`   | `valid` (default pre-filled value) |
| `00000000000`       | `invalid` |
| `11111111111`       | `nre` |
| `22222222222`       | `pending` |

## Structure

- `backend/` — Express API: JWT signing (`jose`, RS256), a `swiftxApi.js` proxy
  that transparently switches between the real sandbox and the mock engine
  (`mockSwiftx.js`), corridor reference data (`corridors.js`), routes for quotes,
  payments, balance, validate-account.
- `frontend/` — React app: a step-by-step send-money flow (corridor → amount →
  beneficiary → sender → review → tracking), a history screen, and a developer
  screen showing the live request log.

The JWK (when set) never leaves the backend. The frontend only ever talks to the
local Express API.
