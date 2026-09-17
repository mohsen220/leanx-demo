// Plain-English descriptions for real Lean/SwiftX API field names, shown
// as a hover tooltip on every annotated key in the Developer Console's
// JSON viewer. Keyed by the field's own name (not its full path) since
// Lean reuses the same field name consistently across endpoints — except
// `status`, which genuinely means something different per resource, so
// that one is resolved separately from the call's real path instead of a
// single flat description that would be wrong half the time.
//
// Deliberately NOT annotated: `type`, `value`, `id`, `name` — each means
// something different in nearly every object it appears in
// (account_details.type vs control_parameters.type vs
// bank_identifiers[].type, etc.), so a single description would mislead
// more often than it would help.
const FIELD_GLOSSARY = {
  // ---- identity / auth ----
  userId: 'Meridian’s own internal user id — not sent to Lean, used only to look up the right customer/consent/token server-side.',
  customer_id: 'The Lean-assigned id for this end customer, created once via POST /customers/v1 and reused for every later call.',
  app_token: 'Identifies this application to Lean — the same value LinkSDK needs to know which app’s flow it’s running.',
  appToken: 'Identifies this application to Lean — the same value LinkSDK needs to know which app’s flow it’s running.',
  access_token: 'A short-lived, customer-scoped bearer token minted for LinkSDK — grants just enough scope for this one widget session, not a general API credential.',
  accessToken: 'A short-lived, customer-scoped bearer token minted for LinkSDK — grants just enough scope for this one widget session, not a general API credential.',
  government_identifier: 'A government-issued ID Lean requires on file before it will create an Account-on-File consent for this customer.',

  // ---- consents (AoF / CMI) ----
  consent_id: 'The standing Account-on-File consent this call acts on — created once via POST /consents/v1/account-on-file, then reused for every future instant charge as long as it stays AUTHORISED.',
  consentId: 'The standing Account-on-File consent this call acts on — created once via POST /consents/v1/account-on-file, then reused for every future instant charge as long as it stays AUTHORISED.',
  destination_account_id: 'Which of Meridian’s registered bank destinations this consent/payment pays into.',
  destination_account_ids: 'Same as destination_account_id, but for a consent allowed to pay into more than one registered destination.',
  beneficiary_type: '"SINGLE" restricts a consent to one destination account; a consent could instead allow paying into any of several.',
  control_parameters: 'The spending rules Lean enforces on this consent — how often it can be charged and the ceiling per charge.',
  period_type: 'The time window control_parameters’ limits reset on (e.g. "Day") — max_individual_amount applies per charge regardless.',
  max_individual_amount: 'The largest single charge Lean will allow against this consent, in the consent’s currency.',
  max_cumulative_amount: 'The most this consent can move in total across its lifetime, if the consent caps cumulative spend.',
  max_cumulative_number_of_payments: 'The most times this consent can be charged in total, if the consent caps charge count.',
  max_cumulative_amount_per_period: 'The most this consent can move within one period_type window (e.g. per day).',
  max_cumulative_number_of_payments_per_period: 'The most times this consent can be charged within one period_type window.',
  immediate_payment: 'Whether this consent also authorized an immediate first payment at creation time, instead of only future ones.',
  creditor_reference: 'A reference the creditor (destination) side attaches to the consent, distinct from Meridian’s own `reference`.',
  start_date_time: 'When this consent became valid to use.',
  expiration_date_time: 'When this consent stops being usable — Lean requires a fresh one after this.',
  application_id: 'Which Lean application this consent belongs to — matches app_token.',
  consent_type: 'Which LinkSDK consent flow to open — "payment" here, since Meridian only uses manageConsents for payment consents.',

  // ---- payments / charges ----
  paymentId: 'The id of the payment this top-up or transfer created — used to poll for its settlement status.',
  amount: 'The amount being quoted, charged, or reported on, in the surrounding object’s currency.',
  purpose: 'Lean’s required payment-purpose code (e.g. "GDS" for goods & services) — used for compliance categorization, not displayed to the customer.',
  reference: 'A free-text reference Meridian attaches to the payment for its own reconciliation — shows up on some bank statements too.',
  risk_details: 'Fraud/risk context Lean asks for on real-money charges.',
  transaction_indicators: 'Signals about how this transaction was initiated, used for risk scoring.',
  channel: 'The channel the customer initiated this payment from (e.g. "WEB") — part of transaction_indicators’ risk context.',
  external_id: 'Meridian’s own id for this transfer, generated client-side before sending — lets Meridian recognize its own payment on lookup and avoid double-submitting the same transfer.',
  amount_destination: 'How much the recipient actually receives after conversion — this is what gets locked in by the quote, not the source amount.',
  rate: 'The exchange rate this quote locked in — expires with the quote, so the payment must be submitted before it lapses.',
  expires: 'When this quote’s locked-in rate stops being honored — submit the payment before this or request a fresh quote.',
  bank_reference: 'The receiving bank’s own reference for this credit, once it has one — useful for the customer to quote if they call their bank.',
  beneficiary_name: 'The recipient’s name as registered with their bank — must match for the payment to land correctly.',
  beneficiary_account_number: 'The recipient’s account number at the destination bank.',
  wallet_amount: 'The amount actually deducted from Meridian’s own settlement wallet for this transfer, in wallet_currency.',
  wallet_currency: 'The currency Meridian’s settlement wallet holds — usually different from what the customer sent or the recipient received.',
  wallet_premium: 'The margin/markup Meridian earned on this transfer’s conversion.',
  wallet_txn_cost: 'The processing cost this transfer incurred, deducted from wallet_premium.',
  base_amount: 'The transfer amount expressed in the base settlement currency, before wallet conversion.',
  base_currency: 'The base settlement currency this transfer was priced in.',
  transaction_completed: 'When this transfer’s funds actually landed — null until the bank confirms settlement.',
  sender_details: 'Who the money actually came from, once Lean’s bank confirms it — often still null until settlement, since the bank fills this in late.',
  recipient_details: 'Meridian’s own registered destination for this payment — populated immediately since it doesn’t depend on the bank.',
  initiation_timestamp: 'When this payment was first submitted to the bank, as recorded by Lean.',

  // ---- verification (AVS) ----
  country_code: 'ISO country code for the account being checked — determines which local bank-identifier scheme Lean expects.',
  account_details: 'The bank account being verified — its type (e.g. IBAN) and the actual value to check.',
  identifications: 'What Lean compares the account’s registered owner against — usually the full name the customer entered.',
  results_id: 'Lean’s id for this specific verification result, for audit/reference.',
  status_detail: 'Extra detail on the verification result when `status` alone doesn’t explain enough — usually null on a clean OK.',
  verifications: 'The actual Confirmation-of-Payee outcome — whether the name matches, plus the bank’s own details for the account.',
  account_ownership_verified: 'The real yes/no answer this whole check exists to produce — true only if the name matches the bank’s records for this account.',
  matching: 'Lean’s finer-grained match detail behind account_ownership_verified (e.g. partial-match info), when it has any to report.',
  bank_details: 'The account’s bank as identified by Lean during verification — independent of whatever the customer typed in.',
  bank_name: 'The verified bank’s name, in English and Arabic.',
  bank_identifiers: 'The verified bank’s own routing identifiers (e.g. BIC, local bank code) as Lean resolved them — not what the customer entered.',
  account_status: 'Whether the bank reports this account as currently active, closed, dormant, etc.',
  account_holder_name: 'The name Lean’s check found actually registered to this account — compare against what the customer typed to see if it matched.',
  account_currency: 'The account’s currency, when the bank reports one.',
  verification_method: 'Which real-world check Lean actually ran to produce this result (e.g. a live Confirmation-of-Payee call to the bank).',
  fullName: 'The account-holder name Meridian is asking Lean to confirm against the bank’s own records.',
  iban: 'The IBAN Meridian is asking Lean to verify.',

  // ---- generic / envelope ----
  message: 'A human-readable explanation of the result — mainly useful for debugging, not meant to be shown to the customer verbatim.',
  metadata: 'Extra machine-readable context Lean sometimes attaches to a response — null when there’s nothing extra to say.',
  meta: 'Extra machine-readable context Lean sometimes attaches to a response — null when there’s nothing extra to say.',
  granular_status_code: 'A more specific, machine-readable reason code than the top-level status — this is what code should actually branch on, since `status` alone is often too coarse.',
  timestamp: 'When Lean generated this response.',
  currency: 'The ISO currency code this amount is denominated in.',
  country: 'The corridor/country this record belongs to.',
  ok: 'A simple boolean success flag for calls that don’t need a richer status vocabulary.',
  invoked: 'Marks that this log entry represents the SDK method being called, not a result — the real outcome arrives in a later callback event.',
  mode: '"instant" means this call already charged an existing authorized consent; "authorize" means the frontend still needs to open LinkSDK before anything can be charged.',
  sandbox: 'Tells LinkSDK to run against Lean’s sandbox environment rather than production.',
  success_redirect_url: 'Where Lean redirects the browser after a successful bank authorization, if the flow leaves the embedded widget for a real redirect.',
  fail_redirect_url: 'Where Lean redirects the browser after a failed or abandoned authorization.',
};

// `status` means a genuinely different thing depending on which endpoint
// produced it — a single flat description would be right for one call and
// wrong for the next, so it’s resolved from the call’s real path instead.
const STATUS_HINTS = [
  { test: (p) => p.includes('/verifications/'), desc: 'Whether Lean’s check ran at all (e.g. "OK") — the actual verification result is in verifications.account_ownership_verified, not here.' },
  { test: (p) => p.includes('/consents/') || p.includes('consent'), desc: 'This consent’s lifecycle state: AWAITING_AUTHORISATION → AUTHORISED, or REVOKED/REJECTED if the customer or bank ended it.' },
  { test: (p) => p.includes('validate_account') || p.includes('validate-account'), desc: 'Whether this bank account/branch combination is real and chargeable: "valid" or "invalid".' },
  { test: (p) => p.includes('/quote') },
  { test: (p) => p.includes('/payment') || p.includes('/intents') || p.includes('account-on-file') || p.includes('topup'),
    desc: 'Where this payment currently is. Lean X/SwiftX uses queued/processing/succeeded/failed; Lean Pay’s own poll endpoints use ACCEPTED_BY_BANK/PENDING_WITH_BANK/FAILED instead.' },
];

export function describeField(key, ctx) {
  if (key === 'status') {
    const path = ctx?.path ?? '';
    const hit = STATUS_HINTS.find((h) => h.test(path));
    return hit?.desc ?? 'This resource’s current lifecycle or result state — the exact vocabulary depends on which endpoint produced it.';
  }
  return FIELD_GLOSSARY[key];
}
