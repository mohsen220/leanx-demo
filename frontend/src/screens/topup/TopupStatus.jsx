import { useEffect, useRef, useState } from 'react';
import { leanAofApi } from '../../leanAofApi.js';
import { CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';

const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// AoF payment statuses, straight from GET /consents/v1/{id}/payments.
const TERMINAL = new Set(['ACCEPTED_BY_BANK', 'FAILED']);

function classify(status) {
  if (status === 'ACCEPTED_BY_BANK') return 'success';
  if (status === 'PENDING_WITH_BANK') return 'pending';
  return 'fail';
}

// Fetches its own state from the payment id alone. The `amount` prop is
// just what to show before the first poll resolves — the payment doesn't
// show up in the consent's payment list for a moment after being charged,
// so the backend's own response can't be relied on for that first paint.
export function TopupStatus({ paymentId, amount: initialAmount, userId, setError, onDone }) {
  const [data, setData] = useState(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const delayFor = (n) => (n < 5 ? 1200 : n < 12 ? 3000 : 6000);
    const poll = async () => {
      try {
        const result = await leanAofApi.getTopup(paymentId, userId);
        if (cancelled) return;
        setData(result);
        if (!TERMINAL.has(result.status)) setTimeout(poll, delayFor(attemptRef.current++));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [paymentId, userId, setError]);

  const status = data?.status ?? 'PENDING_WITH_BANK';
  const amount = data?.amount ?? initialAmount;
  const kind = classify(status);
  const icon = kind === 'success' ? <CheckIcon /> : kind === 'fail' ? <XIcon /> : <ClockIcon />;
  const title = kind === 'success' ? 'Top-up complete' : kind === 'fail' ? 'Top-up failed' : 'Waiting for your bank…';

  return (
    <div className="phone-screen" style={{ justifyContent: 'space-between', flex: 1 }}>
      <div className="status-hero">
        <div className={`status-icon ${kind}`}>{icon}</div>
        <h2>{title}</h2>
        <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{fmt(amount)} AED</div>
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
