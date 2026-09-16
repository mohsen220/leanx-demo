import { useState } from 'react';
import { leanAofApi } from '../../leanAofApi.js';
import { leanSipApi } from '../../leanSipApi.js';
import { brand } from '../../brand.js';
import { BackIcon } from '../../icons.jsx';

// Must be the EXACT string already whitelisted in the Lean Dashboard
// (Development → Integration settings) — no query string, no trailing-slash
// mismatch. Lean matches this exactly, not by prefix, so a URL that merely
// looks equivalent gets rejected at the final redirect-back step rather than
// at setup, which shows up as "Something went wrong" only after the
// customer has already completed real bank authorization.
const redirectUrl = () => `${window.location.origin}/`;

// Two top-up rails, same screen: AoF (leanAofApi) trades a one-time bank
// link for instant repeat top-ups; SIP (leanSipApi) skips any setup but
// needs a fresh bank login every single time — mirrors Lean's own AOF/SIP
// split for Pay by Bank. Both survive a real bank redirect the same way
// (see the localStorage handoff below and App.jsx's resume effect), since
// Open Finance authorization is a genuine top-level navigation that wipes
// this whole JS context.
export function EnterTopupAmount({ userId, setError, onBack, onPaymentStarted }) {
  const [amount, setAmount] = useState('500');
  const [method, setMethod] = useState('aof');
  const [loading, setLoading] = useState(false);
  // One id per attempt, so every call it takes (start, charge/checkout,
  // status polls) groups together as one journey in the Developer Console —
  // same pattern as SendFlow.jsx's flowId. Prefixed so the console can tell
  // a top-up journey apart from a transfer at a glance.
  const [topupGroupId] = useState(() => `topup-${crypto.randomUUID()}`);

  const submitAof = async () => {
    const result = await leanAofApi.startTopup(userId, Number(amount), topupGroupId);

    if (result.mode === 'instant') {
      onPaymentStarted({ paymentId: result.paymentId, amount: Number(amount), method: 'aof', groupId: topupGroupId });
      return;
    }

    const { appToken, customerId, consentId, accessToken } = result;

    // Persisted before handing off to the bank, since this whole JS context
    // (including the callback below) can be wiped by a real redirect before
    // it ever gets to fire — picked back up by App.jsx on the next load.
    // groupId travels with it so calls made after the redirect still join
    // the same Developer Console journey as the ones made before it.
    localStorage.setItem(
      'falcon_pending_aof_charge',
      JSON.stringify({ userId, amount: Number(amount), groupId: topupGroupId }),
    );
    console.log('[lean-aof] persisted pending charge before authorization:', localStorage.getItem('falcon_pending_aof_charge'));

    window.Lean.authorizeConsent({
      app_token: appToken,
      customer_id: customerId,
      consent_id: consentId,
      access_token: accessToken,
      sandbox: true,
      success_redirect_url: redirectUrl(),
      fail_redirect_url: redirectUrl(),
      // This callback is NOT a reliable terminal signal — confirmed by a
      // real capture where it fired with a non-SUCCESS status almost
      // immediately, and the SDK then went on to do the actual bank
      // redirect anyway (real navigation to the bank, real login, real
      // redirect back with an auth code). Treating that early callback as a
      // definitive failure — clearing the pending-charge flag and
      // abandoning the consent — was actively destroying state for a flow
      // that was still genuinely in progress. So only two outcomes are
      // treated as final here:
      //  - SUCCESS: charge immediately (covers the case where the flow
      //    somehow stays embedded rather than redirecting for real).
      //  - CANCELLED: the customer explicitly closed the dialog before
      //    reaching the bank — safe to treat as truly done.
      // Anything else is logged and otherwise ignored: if a real redirect
      // follows (as observed), this whole JS context reloads anyway and
      // App.jsx's resume effect is the actual source of truth on return; if
      // no redirect follows, the button just stays disabled rather than
      // risk corrupting state on a guess.
      callback: async (payload) => {
        console.log('[lean-aof] authorizeConsent callback:', payload);

        if (payload.status === 'CANCELLED') {
          localStorage.removeItem('falcon_pending_aof_charge');
          setLoading(false);
          return;
        }

        if (payload.status !== 'SUCCESS') {
          console.log('[lean-aof] non-terminal callback status, waiting to see if a real redirect follows');
          return;
        }

        try {
          localStorage.removeItem('falcon_pending_aof_charge');
          const { paymentId } = await leanAofApi.chargeAfterAuthorization(userId, Number(amount), topupGroupId);
          onPaymentStarted({ paymentId, amount: Number(amount), method: 'aof', groupId: topupGroupId });
        } catch (err) {
          setError(err.message);
          setLoading(false);
        }
      },
    });
  };

  const submitSip = async () => {
    const { appToken, customerId, paymentIntentId, accessToken } = await leanSipApi.startTopup(
      userId,
      Number(amount),
      topupGroupId,
    );

    // Same redirect-survival handoff as AoF above — SIP's Lean.checkout() is
    // just as much a real top-level navigation to the bank and back.
    localStorage.setItem(
      'falcon_pending_sip_topup',
      JSON.stringify({ userId, amount: Number(amount), paymentIntentId, groupId: topupGroupId }),
    );
    console.log('[lean-sip] persisted pending topup before authorization:', localStorage.getItem('falcon_pending_sip_topup'));

    // Per Lean's own SIP flow (docs.leantech.me/docs/getting-started-with-
    // single-instant-payments): create the intent, then LinkSDK's
    // checkout(payment_intent_id) — not pay(), which is for a standalone
    // payment source rather than an Open Finance SIP intent.
    window.Lean.checkout({
      app_token: appToken,
      customer_id: customerId,
      payment_intent_id: paymentIntentId,
      access_token: accessToken,
      sandbox: true,
      success_redirect_url: redirectUrl(),
      fail_redirect_url: redirectUrl(),
      // Same lesson as AoF's authorizeConsent callback: only SUCCESS and
      // CANCELLED are treated as final, everything else is logged and
      // ignored in case a real bank redirect is still coming. Unlike AoF,
      // SUCCESS here needs no separate "charge" call — checkout() already IS
      // the payment — so this just starts polling the intent for settlement.
      callback: (payload) => {
        console.log('[lean-sip] checkout callback:', payload);

        if (payload.status === 'CANCELLED') {
          localStorage.removeItem('falcon_pending_sip_topup');
          setLoading(false);
          return;
        }

        if (payload.status !== 'SUCCESS') {
          console.log('[lean-sip] non-terminal callback status, waiting to see if a real redirect follows');
          return;
        }

        localStorage.removeItem('falcon_pending_sip_topup');
        onPaymentStarted({ paymentId: paymentIntentId, amount: Number(amount), method: 'sip', groupId: topupGroupId });
      },
    });
  };

  const submit = async () => {
    setLoading(true);
    try {
      if (method === 'aof') await submitAof();
      else await submitSip();
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
        Add money to your {brand.shortName} balance from your own bank.
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

      <label className="field">
        Payment method
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="aof">AoF - Account on File</option>
          <option value="sip">SIP - Single Instant Payment</option>
        </select>
      </label>

      <button className="btn btn-primary" disabled={loading || !(Number(amount) > 0)} onClick={submit} style={{ marginTop: 12 }}>
        {loading ? <span className="spinner" /> : `Pay ${amount || 0} AED`}
      </button>

      <div className="powered-by">
        Powered by <strong>{brand.poweredByPay}</strong>
      </div>
    </div>
  );
}
