// Per-product reference flow, expressed as a graph rather than a flat list
// of steps — several of these flows genuinely branch (AoF's instant-vs-
// authorize split and its stale-consent self-heal, authorizeConsent's
// early-non-terminal-callback quirk, etc.), and a table row can't show a
// branch. `kind` drives both the node's visual treatment and what its
// detail drawer shows:
//   - 'browser'   — a pure UI action, no log category, no history to show.
//   - 'api'       — our backend route + whatever real Lean/SwiftX call(s)
//                   it made. `category` matches the shared log's category,
//                   so every real historical occurrence can be listed.
//   - 'sdk'       — a LinkSDK invoke+callback pair. Same deal, `category`
//                   is the `sdk-<method>` category logSdkEvent uses.
//   - 'decision'  — a branch point. Most of these are decided from local
//                   state (a cached consent, a callback's status) rather
//                   than a call of their own, so there's no history to
//                   list — the drawer just explains the logic.
//   - 'end-ok' / 'end-fail' / 'end-neutral' — terminal states; the drawer
//                   explains what actually happened to reach them.
export const FLOW_GRAPHS = {
  leanx: {
    nodes: [
      { id: 'b1', kind: 'browser', title: 'Pick a corridor & enter an amount', x: 280, y: 0,
        description: 'The customer chooses a destination corridor (India, Pakistan, Nigeria, …) from the home screen’s live rates and enters how much to send.' },
      { id: 'api1', kind: 'api', title: 'Get exchange quote', subtitle: 'POST /api/quotes → POST /quote', category: 'quote', x: 280, y: 150 },
      { id: 'dec1', kind: 'decision', title: 'India corridor?', x: 280, y: 300,
        description: 'Only the India corridor supports Lean X’s account-validation step today — every other corridor skips straight to review.' },
      { id: 'api2', kind: 'api', title: 'Validate beneficiary account', subtitle: 'POST /api/validate-account → POST /validate_account', category: 'validation', x: 600, y: 300 },
      { id: 'b2', kind: 'browser', title: 'Review & confirm the transfer', x: 280, y: 450,
        description: 'The customer sees the locked rate and destination amount, and taps to confirm.' },
      { id: 'api3', kind: 'api', title: 'Send payment', subtitle: 'POST /api/payments → POST /payment', category: 'payment', x: 280, y: 600 },
      { id: 'api4', kind: 'api', title: 'Track status', subtitle: 'GET /api/payments/:id → GET /payments/:id', category: 'payment-status', x: 280, y: 750,
        description: 'Polled every few seconds until the status leaves queued/processing.' },
      { id: 'endOk', kind: 'end-ok', title: 'Transfer succeeded', x: 140, y: 900,
        description: 'The payment reached the bank — money has arrived at the destination account.' },
      { id: 'endFail', kind: 'end-fail', title: 'Transfer failed', x: 460, y: 900,
        description: 'The bank rejected or failed the payment — no funds left Meridian’s wallet, and the customer can retry.' },
    ],
    edges: [
      { id: 'e1', source: 'b1', target: 'api1' },
      { id: 'e2', source: 'api1', target: 'dec1' },
      { id: 'e3', source: 'dec1', target: 'api2', label: 'India' },
      { id: 'e4', source: 'dec1', target: 'b2', label: 'other corridors' },
      { id: 'e5', source: 'api2', target: 'b2' },
      { id: 'e6', source: 'b2', target: 'api3' },
      { id: 'e7', source: 'api3', target: 'api4' },
      { id: 'e8', source: 'api4', target: 'endOk', label: 'succeeded', variant: 'success' },
      { id: 'e9', source: 'api4', target: 'endFail', label: 'failed', variant: 'fail' },
    ],
  },

  'pbb-aof': {
    nodes: [
      { id: 'b1', kind: 'browser', title: 'Tap "Top up" → choose Account on File', x: 280, y: 0 },
      { id: 'api1', kind: 'api', title: 'Check / create standing consent', category: 'aof-start', x: 280, y: 150,
        subtitle: 'POST /api/lean/aof/topup',
        description: 'Checks whether we already have a locally-cached AUTHORISED consent. If we do, it tries to charge it immediately in this same call — and if Lean rejects that charge because the consent has since been revoked or gone stale, it transparently creates a brand-new consent and returns the authorize flow instead, all within this one call. That self-heal shows up as two upstream calls on some occurrences below.' },
      { id: 'dec1', kind: 'decision', title: 'Cached consent already AUTHORISED?', x: 280, y: 320,
        description: 'Decided from our own cached state — no extra API call. "Already authorised" means api1 already charged it, straight to polling. Anything else needs a fresh bank authorization.' },
      { id: 'sdk1', kind: 'sdk', title: 'Lean.authorizeConsent() opens the bank redirect', category: 'sdk-authorizeConsent', x: 620, y: 420 },
      { id: 'dec2', kind: 'decision', title: 'Callback outcome', x: 620, y: 570,
        description: 'authorizeConsent()’s callback can fire more than once — an early, non-terminal firing is common right before the real bank redirect and isn’t a failure. Only SUCCESS and CANCELLED are treated as final.' },
      { id: 'api3', kind: 'api', title: 'Charge the now-authorized consent', subtitle: 'POST /api/lean/aof/topup/charge → POST /payments/v1/account-on-file', category: 'aof-charge', x: 620, y: 720 },
      { id: 'api5', kind: 'api', title: 'Abandon burned consent', subtitle: 'POST /api/lean/aof/consent/abandon', category: 'aof-abandon', x: 940, y: 720,
        description: 'Only called for a genuine authorization error, not a clean cancel — Lean refuses a second authorization attempt against the same consent (409 Conflict), so the cached id is dropped to force a fresh one next time.' },
      { id: 'endCancel', kind: 'end-neutral', title: 'Cancelled — left retryable', x: 620, y: 870,
        description: 'Customer closed the bank dialog before authorizing. The consent is left as-is (still AWAITING_AUTHORISATION) so the very next top-up attempt retries against the same consent.' },
      { id: 'endRetry', kind: 'end-neutral', title: 'Consent cleared — retry fresh', x: 940, y: 870,
        description: 'The consent was burned by a genuine authorization error and cleared. The next top-up attempt creates a brand-new consent from scratch.' },
      { id: 'api4', kind: 'api', title: 'Poll for settlement', subtitle: 'GET /api/lean/aof/topup/:id → GET /consents/v1/{consent}/payments', category: 'aof-status', x: 280, y: 870 },
      { id: 'endOk', kind: 'end-ok', title: 'Balance topped up', x: 280, y: 1020,
        description: 'The bank accepted the charge — Meridian’s balance has been updated.' },
    ],
    edges: [
      { id: 'e1', source: 'b1', target: 'api1' },
      { id: 'e2', source: 'api1', target: 'dec1' },
      { id: 'e3', source: 'dec1', target: 'api4', label: 'already authorised' },
      { id: 'e4', source: 'dec1', target: 'sdk1', label: 'needs authorization' },
      { id: 'e5', source: 'sdk1', target: 'dec2' },
      { id: 'e6', source: 'dec2', target: 'api3', label: 'SUCCESS', variant: 'success' },
      { id: 'e7', source: 'dec2', target: 'endCancel', label: 'CANCELLED' },
      { id: 'e8', source: 'dec2', target: 'api5', label: 'error', variant: 'fail' },
      { id: 'e9', source: 'api3', target: 'api4' },
      { id: 'e10', source: 'api5', target: 'endRetry' },
      { id: 'e11', source: 'api4', target: 'endOk', variant: 'success' },
    ],
  },

  'pbb-sip': {
    nodes: [
      { id: 'b1', kind: 'browser', title: 'Tap "Top up" → choose Single Instant Payment', x: 280, y: 0 },
      { id: 'api1', kind: 'api', title: 'Create payment intent', subtitle: 'POST /api/lean/sip/topup → POST /payments/v1/intents', category: 'sip-start', x: 280, y: 150 },
      { id: 'sdk1', kind: 'sdk', title: 'Lean.checkout() opens the bank redirect', category: 'sdk-checkout', x: 280, y: 300,
        description: 'Every SIP top-up needs a fresh authorization — unlike AoF there’s no "already linked, charge instantly" path.' },
      { id: 'dec1', kind: 'decision', title: 'Callback outcome', x: 280, y: 450,
        description: 'Same non-terminal-callback caveat as authorizeConsent — an early firing before the real redirect isn’t a failure.' },
      { id: 'api2', kind: 'api', title: 'Poll for settlement', subtitle: 'GET /api/lean/sip/topup/:id → GET /payments/v1/intents/:id', category: 'sip-status', x: 140, y: 600 },
      { id: 'endCancel', kind: 'end-neutral', title: 'Cancelled — no charge made', x: 460, y: 600,
        description: 'Customer closed the bank dialog — nothing was charged, nothing to clean up server-side.' },
      { id: 'endOk', kind: 'end-ok', title: 'Balance topped up', x: 140, y: 750,
        description: 'The payment intent settled — Meridian’s balance has been updated.' },
    ],
    edges: [
      { id: 'e1', source: 'b1', target: 'api1' },
      { id: 'e2', source: 'api1', target: 'sdk1' },
      { id: 'e3', source: 'sdk1', target: 'dec1' },
      { id: 'e4', source: 'dec1', target: 'api2', label: 'SUCCESS', variant: 'success' },
      { id: 'e5', source: 'dec1', target: 'endCancel', label: 'CANCELLED' },
      { id: 'e6', source: 'api2', target: 'endOk', variant: 'success' },
    ],
  },

  'pbb-re': {
    nodes: [
      { id: 'b1', kind: 'browser', title: 'Tap "Top up" → choose Reverse Engineered', x: 280, y: 0 },
      { id: 'api1', kind: 'api', title: 'Create payment destination', subtitle: 'POST /api/lean/re/topup → POST /payments/v1/destinations', category: 're-start', x: 280, y: 150 },
      { id: 'sdk1', kind: 'sdk', title: 'Lean.connect() links the bank account', category: 'sdk-connect', x: 280, y: 300,
        description: 'Links the customer’s bank account directly — no redirect back to a payment intent; this is UAE’s original pre-Open-Finance A2A rail.' },
      { id: 'dec1', kind: 'decision', title: 'Connect outcome', x: 280, y: 450 },
      { id: 'sdk2', kind: 'sdk', title: 'Lean.pay() executes the payment', category: 'sdk-pay', x: 280, y: 600,
        description: 'Executes the payment against the just-linked connection, still inside the same widget session.' },
      { id: 'endCancel1', kind: 'end-neutral', title: 'Not linked — nothing charged', x: 620, y: 600,
        description: 'Customer didn’t complete linking the bank account.' },
      { id: 'dec2', kind: 'decision', title: 'Pay outcome', x: 280, y: 750 },
      { id: 'api2', kind: 'api', title: 'Poll for settlement', subtitle: 'GET /api/lean/re/topup/:id → GET status', category: 're-status', x: 140, y: 900 },
      { id: 'endFail2', kind: 'end-fail', title: 'Charge failed', x: 460, y: 900,
        description: 'The linked account was charged but the bank declined or failed the payment.' },
      { id: 'endOk', kind: 'end-ok', title: 'Balance topped up', x: 140, y: 1050,
        description: 'The payment executed and settled — Meridian’s balance has been updated.' },
    ],
    edges: [
      { id: 'e1', source: 'b1', target: 'api1' },
      { id: 'e2', source: 'api1', target: 'sdk1' },
      { id: 'e3', source: 'sdk1', target: 'dec1' },
      { id: 'e4', source: 'dec1', target: 'sdk2', label: 'linked', variant: 'success' },
      { id: 'e5', source: 'dec1', target: 'endCancel1', label: 'failed / cancelled' },
      { id: 'e6', source: 'sdk2', target: 'dec2' },
      { id: 'e7', source: 'dec2', target: 'api2', label: 'success', variant: 'success' },
      { id: 'e8', source: 'dec2', target: 'endFail2', label: 'failed / cancelled', variant: 'fail' },
      { id: 'e9', source: 'api2', target: 'endOk', variant: 'success' },
    ],
  },

  consents: {
    nodes: [
      { id: 'b1', kind: 'browser', title: 'Tap "Manage consents"', x: 280, y: 0 },
      { id: 'api1', kind: 'api', title: 'Mint customer-scoped access token', subtitle: 'POST /api/lean/consents/session', category: 'consents-start', x: 280, y: 150 },
      { id: 'sdk1', kind: 'sdk', title: 'Lean.manageConsents() opens the consent list', category: 'sdk-manageConsents', x: 280, y: 300,
        description: 'A pure view/manage widget — the customer can see every consent they’ve authorized and revoke any of them. There’s no "complete this action" step, so however they close it is a normal outcome, never a failure.' },
      { id: 'end1', kind: 'end-neutral', title: 'Widget closed', x: 280, y: 450,
        description: 'Any revokes the customer made take effect on Lean’s side immediately — our own cached consent state (e.g. for AoF) only finds out the next time it tries to use that consent.' },
    ],
    edges: [
      { id: 'e1', source: 'b1', target: 'api1' },
      { id: 'e2', source: 'api1', target: 'sdk1' },
      { id: 'e3', source: 'sdk1', target: 'end1' },
    ],
  },

  verify: {
    nodes: [
      { id: 'b1', kind: 'browser', title: 'Enter IBAN & account-holder name', x: 280, y: 0 },
      { id: 'api1', kind: 'api', title: 'Verify account ownership', subtitle: 'POST /api/lean/verify-account → POST /verifications/v1/accounts', category: 'verify-account', x: 280, y: 150 },
      { id: 'dec1', kind: 'decision', title: 'account_ownership_verified?', x: 280, y: 300,
        description: 'Lean’s Confirmation-of-Payee check compares the name on the account against what was entered.' },
      { id: 'endOk', kind: 'end-ok', title: 'Bank verified', x: 140, y: 450,
        description: 'Ownership confirmed — the profile is marked bank-verified.' },
      { id: 'endFail', kind: 'end-fail', title: 'Not verified', x: 460, y: 450,
        description: 'The name didn’t match (or the account couldn’t be confirmed) — the customer can correct the details and try again.' },
    ],
    edges: [
      { id: 'e1', source: 'b1', target: 'api1' },
      { id: 'e2', source: 'api1', target: 'dec1' },
      { id: 'e3', source: 'dec1', target: 'endOk', label: 'yes', variant: 'success' },
      { id: 'e4', source: 'dec1', target: 'endFail', label: 'no', variant: 'fail' },
    ],
  },
};
