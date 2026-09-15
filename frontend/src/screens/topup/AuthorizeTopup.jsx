import { brand } from '../../brand.js';
import { BackIcon } from '../../icons.jsx';

const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// This leaves the app for real — Lean's own hosted page, where the customer
// picks their bank and authorizes with them directly. That's a genuine
// full-page redirect, not a modal: Open Finance bank consent screens
// generally refuse to render inside a third-party iframe. The pending
// intent id is remembered locally so the app can resume tracking it the
// moment the customer is redirected back.
export function AuthorizeTopup({ amount, intentId, session, onBack }) {
  const goToLean = () => {
    localStorage.setItem('falcon_pending_topup', intentId);
    window.location.href = session.session_url;
  };

  return (
    <div className="phone-screen" style={{ justifyContent: 'space-between', flex: 1 }}>
      <div>
        <div className="topbar">
          <button className="back-btn" onClick={onBack}>
            <BackIcon />
          </button>
          <h1>Top up</h1>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div className="muted">You're adding</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, margin: '6px 0' }}>{fmt(amount)} AED</div>
          <div className="faint">to your Falcon balance</div>
        </div>

        <p className="faint" style={{ textAlign: 'center' }}>
          You'll be taken to Lean to choose your bank and authorize this payment. You'll land back here
          automatically once it's done.
        </p>
      </div>

      <div>
        <button className="btn btn-primary" onClick={goToLean}>
          Continue to your bank
        </button>
        <div className="powered-by">
          Powered by <strong>{brand.poweredByPay}</strong>
        </div>
      </div>
    </div>
  );
}
