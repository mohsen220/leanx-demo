import { useState } from 'react';
import { leanConsentsApi } from '../leanConsentsApi.js';
import { logSdkEvent } from '../logStore.js';
import { BackIcon, ShieldIcon } from '../icons.jsx';

// CMI (Consent Management Interface) — a regulatory requirement for any
// AoF/SIP integration, not optional: the customer needs a surface to view
// and revoke their own consents. A separate screen (not folded into
// Profile) since it's Lean's own self-contained widget, not app content —
// same reasoning as Top Up/Send each getting their own screen.
//
// consent_type scopes it to what this app actually has (there's a known bug
// pattern where a payments-only integration that omits this shows a
// data-consents view first, since Lean.manageConsents() defaults to that)
// — confirmed live the real enum is lowercase/singular ('data' | 'payment'
// | 'payment_history'), not 'PAYMENTS'; the SDK rejects that with
// CONFIG_ERROR__INVALID_PARAM_TYPE. No consent_id — omitting it opens the
// full list rather than deep-linking one.
export function ManageConsents({ userId, setError, onBack }) {
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    const groupId = `consents-${crypto.randomUUID()}`;
    try {
      const { appToken, customerId, accessToken } = await leanConsentsApi.startSession(userId, groupId);
      const config = {
        app_token: appToken,
        customer_id: customerId,
        access_token: accessToken,
        consent_type: 'payment',
        sandbox: true,
        callback: (payload) => {
          console.log('[lean-consents] manageConsents callback:', payload);
          logSdkEvent({ method: 'manageConsents', group: groupId, kind: 'callback', payload });
        },
      };
      logSdkEvent({ method: 'manageConsents', group: groupId, kind: 'invoke', config });
      window.Lean.manageConsents(config);
    } catch (err) {
      setError(err.message);
    } finally {
      // The widget is fully self-contained from here — nothing further for
      // this screen to wait on, so loading clears right after invoking
      // rather than inside the callback.
      setOpening(false);
    }
  };

  return (
    <div className="phone-screen" style={{ justifyContent: 'space-between', flex: 1 }}>
      <div>
        <div className="topbar">
          <button className="back-btn" onClick={onBack}>
            <BackIcon />
          </button>
          <h1>Manage consents</h1>
        </div>

        <div className="empty-state" style={{ paddingTop: 32 }}>
          <ShieldIcon width={40} height={40} style={{ color: 'var(--text-muted)' }} />
          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 4 }}>Your bank consents</div>
          <span className="muted" style={{ textAlign: 'center' }}>
            View every bank consent you've authorized, revoke one you no longer want active, and see the payments made
            against it.
          </span>
        </div>
      </div>

      <button className="btn btn-primary" disabled={opening} onClick={open}>
        {opening ? <span className="spinner" /> : 'Open consent manager'}
      </button>
    </div>
  );
}
