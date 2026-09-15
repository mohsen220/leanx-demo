import { useEffect, useRef, useState } from 'react';
import { leanPayApi } from '../../leanPayApi.js';
import { CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';

const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Statuses Lean reports on a payment intent's latest attempt.
const TERMINAL = new Set(['ACCEPTED_BY_BANK', 'FAILED', 'REJECTED']);

function classify(status) {
  if (status === 'ACCEPTED_BY_BANK') return 'success';
  if (status === 'PENDING_WITH_BANK' || status === 'PENDING') return 'pending';
  return 'fail';
}

// Fetches its own state from the intent id alone (amount, currency, status)
// rather than being handed a pre-fetched intent — this is what lets the same
// component work both right after Authorize and when resuming after a
// redirect back from Lean's hosted page (App.jsx only has the id then).
export function TopupStatus({ intentId, userId, setError, onDone }) {
  const [data, setData] = useState(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const delayFor = (n) => (n < 5 ? 1200 : n < 12 ? 3000 : 6000);
    const poll = async () => {
      try {
        const result = await leanPayApi.getTopupIntent(intentId, userId);
        if (cancelled) return;
        setData(result);
        if (!TERMINAL.has(result.status)) setTimeout(poll, delayFor(attemptRef.current++));
        else localStorage.removeItem('falcon_pending_topup');
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [intentId, userId, setError]);

  const status = data?.status ?? 'PENDING_WITH_BANK';
  const kind = classify(status);
  const icon = kind === 'success' ? <CheckIcon /> : kind === 'fail' ? <XIcon /> : <ClockIcon />;
  const title = kind === 'success' ? 'Top-up complete' : kind === 'fail' ? 'Top-up failed' : 'Waiting for your bank…';

  return (
    <div className="phone-screen" style={{ justifyContent: 'space-between', flex: 1 }}>
      <div className="status-hero">
        <div className={`status-icon ${kind}`}>{icon}</div>
        <h2>{title}</h2>
        <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{data ? fmt(data.amount) : '···'} AED</div>
        <div className="muted">to your Falcon balance</div>
        <span className={`status-badge ${kind === 'success' ? 'success' : kind === 'fail' ? 'fail' : 'pending'}`}>
          {status.replace(/_/g, ' ')}
        </span>
        {kind === 'pending' && <span className="spinner dark" />}
      </div>

      <button className="btn btn-primary" onClick={onDone} disabled={kind === 'pending'}>
        Done
      </button>
    </div>
  );
}
