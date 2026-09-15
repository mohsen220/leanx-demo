import { useState } from 'react';
import { leanAofApi } from '../../leanAofApi.js';
import { brand } from '../../brand.js';
import { BackIcon, BankIcon } from '../../icons.jsx';

const QUICK_AMOUNTS = ['100', '250', '500', '1000'];

// Starts an Account-on-File top-up. Two outcomes from the backend:
//  - mode: 'instant'   — customer already linked their bank; charged
//    immediately, no bank interaction at all.
//  - mode: 'authorize' — first top-up ever: opens Lean's own LinkSDK widget
//    right here (no separate "authorize" screen — the widget itself is
//    the authorization step), then charges the now-authorized consent the
//    moment it reports success.
export function EnterTopupAmount({ userId, setError, onBack, onPaymentStarted }) {
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const result = await leanAofApi.startTopup(userId, Number(amount));

      if (result.mode === 'instant') {
        onPaymentStarted({ paymentId: result.paymentId, amount: Number(amount) });
        return;
      }

      const { appToken, customerId, consentId, accessToken } = result;
      // Must be the EXACT string already whitelisted in the Lean Dashboard
      // (Development → Integration settings) — no query string, no trailing-
      // slash mismatch. Lean matches this exactly, not by prefix, so a URL
      // that merely looks equivalent (e.g. with ?aof_status=... appended)
      // gets rejected at the final redirect-back step rather than at setup,
      // which shows up as "Something went wrong" only after the customer has
      // already completed real bank authorization.
      const redirectUrl = `${window.location.origin}/`;

      // Real Open Finance bank authorization is a genuine top-level
      // navigation away to the bank and back — not something that stays
      // embedded in this page. That means this whole JS context (including
      // the callback below) can be wiped out by the time the customer
      // returns, so what to do next is persisted here, before handing off,
      // and picked back up by App.jsx on the next load if the callback
      // never gets the chance to fire.
      localStorage.setItem('falcon_pending_aof_charge', JSON.stringify({ userId, amount: Number(amount) }));

      window.Lean.authorizeConsent({
        app_token: appToken,
        customer_id: customerId,
        consent_id: consentId,
        access_token: accessToken,
        sandbox: true,
        success_redirect_url: redirectUrl,
        fail_redirect_url: redirectUrl,
        // Only fires if the flow stayed embedded (e.g. cancelled before ever
        // reaching the bank) — a completed authorization redirects for real
        // and reloads the app instead, per the comment above.
        callback: async (payload) => {
          if (payload.status !== 'SUCCESS') {
            localStorage.removeItem('falcon_pending_aof_charge');
            setLoading(false);
            if (payload.status !== 'CANCELLED') setError(payload.message ?? `Authorization ${payload.status}`);
            return;
          }
          try {
            localStorage.removeItem('falcon_pending_aof_charge');
            const { paymentId } = await leanAofApi.chargeAfterAuthorization(userId, Number(amount));
            onPaymentStarted({ paymentId, amount: Number(amount) });
          } catch (err) {
            setError(err.message);
            setLoading(false);
          }
        },
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Top up</h1>
      </div>

      <div className="muted" style={{ textAlign: 'center' }}>
        Add money to your Falcon balance from your own bank.
      </div>

      <div className="amount-input-wrap">
        <span className="currency">AED</span>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          autoFocus
        />
      </div>

      <div className="chip-row">
        {QUICK_AMOUNTS.map((v) => (
          <button key={v} className={`chip ${amount === v ? 'active' : ''}`} onClick={() => setAmount(v)}>
            {v} AED
          </button>
        ))}
      </div>

      <div className="k" style={{ padding: '4px 4px 6px' }}>
        Payment method
      </div>
      <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BankIcon width={20} height={20} />
        <span style={{ fontWeight: 600 }}>Pay by Bank</span>
      </div>

      <button className="btn btn-primary" disabled={loading || !(Number(amount) > 0)} onClick={submit} style={{ marginTop: 12 }}>
        {loading ? <span className="spinner" /> : `Pay ${amount || 0} AED`}
      </button>

      <div className="powered-by">
        Powered by <strong>{brand.poweredByPay}</strong>
      </div>
    </div>
  );
}
