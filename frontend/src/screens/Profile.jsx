import { useState } from 'react';
import { initials, avatarColor } from '../stores.js';
import { leanVerifyApi } from '../leanVerifyApi.js';
import { BackIcon, CheckIcon, ClockIcon, XIcon } from '../icons.jsx';

const DOC_LABELS = { idcard: 'Emirates ID', passport: 'Passport', other: 'ID document' };

// The sender's KYC, captured once at onboarding. Every transfer sends these
// details to the API (it's required by regulation), but the customer never
// re-types them — this screen is where they'd review or update them.
//
// "Bank verified" is a real check, not a stamp applied at signup: it's Lean's
// Account Verification Service (AVS — OKYC / Verify Suite), which confirms
// this IBAN genuinely belongs to this name via bank/regulatory sources.
// Lean's own documented sandbox fixture for a guaranteed match on this
// endpoint — pre-filled so "Verify account" succeeds with zero typing. Both
// fields are still editable to demo a real mismatch.
const SAMPLE_VERIFIED_NAME = 'ADAM AHMED';
const SAMPLE_VERIFIED_IBAN = 'AE420260001015819612801';

export function Profile({ sender, onBack, onVerified, setError }) {
  const [iban, setIban] = useState(SAMPLE_VERIFIED_IBAN);
  // Defaults to the sandbox's known-matching name rather than the account's
  // own — the check matches whatever name is submitted against the bank's
  // registered name, and the account's fictional name won't match a real
  // sandbox fixture. Still editable, e.g. to demo a real mismatch.
  const [fullName, setFullName] = useState(SAMPLE_VERIFIED_NAME);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const rows = [
    ['Mobile', sender.sender_mobile],
    ['Residence', `${sender.sender_city}, ${sender.sender_country}`],
    ['Address', sender.sender_address],
    ['Date of birth', sender.sender_birthdate],
    [DOC_LABELS[sender.sender_identity_doc_type] ?? 'ID', `····${String(sender.sender_identity_doc).slice(-4)}`],
    ['ID expiry', sender.sender_identity_doc_exp],
    ['Nationality', sender.sender_identity_doc_country],
  ];

  const verify = async () => {
    const trimmed = iban.trim();
    if (!trimmed) return;
    setChecking(true);
    setResult(null);
    try {
      const data = await leanVerifyApi.verifyAccount(sender.id, trimmed.toUpperCase(), fullName.trim());
      setResult(data);
      if (data.verifications?.account_ownership_verified) onVerified();
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const failureMessage = (data) => {
    const v = data.verifications;
    if (v?.account_status && v.account_status !== 'ACTIVE') {
      return `Account ${v.account_status.toLowerCase().replace(/_/g, ' ')}`;
    }
    if (v?.matching?.type === 'PARTIAL') return "Partial match — name doesn't quite match this account";
    return 'No match — check the IBAN and try again';
  };

  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Your profile</h1>
      </div>

      <div className="status-hero" style={{ padding: '12px 8px 4px' }}>
        <div
          className="avatar"
          style={{ width: 64, height: 64, fontSize: '1.3rem', background: avatarColor(sender.sender_name) }}
        >
          {initials(sender.sender_name)}
        </div>
        <h2>{sender.sender_name}</h2>
        {sender.bankVerifiedAt ? (
          <span className="delivered-pill">
            <CheckIcon width={14} height={14} /> Bank verified ·{' '}
            {new Date(sender.bankVerifiedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </span>
        ) : (
          <span className="validate-badge pending">
            <ClockIcon width={12} height={12} /> Bank not yet verified
          </span>
        )}
      </div>

      <div className="card" style={{ padding: '6px 18px' }}>
        {rows.map(([k, v]) => (
          <div className="receipt-row" key={k}>
            <span className="k">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>

      {sender.bankVerifiedAt ? (
        <p className="faint" style={{ textAlign: 'center' }}>
          Verified against {sender.verifiedBankName ?? 'your bank'} via Lean's Account Verification Service.
        </p>
      ) : (
        <>
          <label className="field">
            Name on the account
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className="field">
            IBAN
            <input value={iban} onChange={(e) => setIban(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} />
          </label>

          <button className="btn btn-secondary" disabled={checking || !iban.trim() || !fullName.trim()} onClick={verify}>
            {checking ? <span className="spinner" /> : 'Verify account'}
          </button>

          {result && !result.verifications?.account_ownership_verified && (
            <span className="validate-badge invalid">
              <XIcon width={12} height={12} /> {failureMessage(result)}
            </span>
          )}

          <p className="faint" style={{ textAlign: 'center' }}>
            Real check against Lean's Account Verification Service.
          </p>
        </>
      )}
    </div>
  );
}
