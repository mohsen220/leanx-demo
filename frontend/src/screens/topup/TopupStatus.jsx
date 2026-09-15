import { useEffect, useRef, useState } from 'react';
import { leanAofApi } from '../../leanAofApi.js';
import { leanSipApi } from '../../leanSipApi.js';
import { brand } from '../../brand.js';
import { CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';

const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Same ACCEPTED_BY_BANK / PENDING_WITH_BANK / FAILED vocabulary for both
// rails (see leanAof.js and leanSip.js), so this one screen polls either.
const TERMINAL = new Set(['ACCEPTED_BY_BANK', 'FAILED']);
const API_BY_METHOD = { aof: leanAofApi, sip: leanSipApi };

function classify(status) {
  if (status === 'ACCEPTED_BY_BANK') return 'success';
  if (status === 'PENDING_WITH_BANK') return 'pending';
  return 'fail';
}

// Fetches its own state from the payment id alone. The `amount` prop is
// just what to show before the first poll resolves — the payment doesn't
// show up in the consent's payment list for a moment after being charged,
// so the backend's own response can't be relied on for that first paint.
export function TopupStatus({ paymentId, amount: initialAmount, userId, method = 'aof', setError, onDone }) {
  const [data, setData] = useState(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const api = API_BY_METHOD[method] ?? leanAofApi;
    const delayFor = (n) => (n < 5 ? 1200 : n < 12 ? 3000 : 6000);
    const poll = async () => {
      try {
        const result = await api.getTopup(paymentId, userId);
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
  }, [paymentId, userId, method, setError]);

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
        <div className="muted">to your {brand.shortName} balance</div>
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
