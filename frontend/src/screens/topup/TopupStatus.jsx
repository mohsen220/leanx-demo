import { useEffect, useRef, useState } from 'react';
import { leanAofApi } from '../../leanAofApi.js';
import { leanSipApi } from '../../leanSipApi.js';
import { leanReApi } from '../../leanReApi.js';
import { brand } from '../../brand.js';
import { CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';

const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const maskIban = (iban) => (iban ? `•••• ${iban.slice(-4)}` : null);

// sender_details/recipient_details come straight off the real Lean payment
// resource (see leanAof.js/leanSip.js/leanRe.js) — name falls back to
// bank_identifier since sender_details.name is frequently still null even
// once the payment has settled (Lean doesn't always resolve it for OF).
function describeParty(party) {
  if (!party) return null;
  const label = party.name ?? party.bank_identifier ?? null;
  const masked = maskIban(party.iban);
  if (!label && !masked) return null;
  return [label, masked].filter(Boolean).join(' · ');
}

// Same ACCEPTED_BY_BANK / PENDING_WITH_BANK / FAILED vocabulary for all
// three rails (see leanAof.js, leanSip.js, leanRe.js), so this one screen
// polls any of them.
const TERMINAL = new Set(['ACCEPTED_BY_BANK', 'FAILED']);
const API_BY_METHOD = { aof: leanAofApi, sip: leanSipApi, re: leanReApi };

function classify(status) {
  if (status === 'ACCEPTED_BY_BANK') return 'success';
  if (status === 'PENDING_WITH_BANK') return 'pending';
  return 'fail';
}

// Fetches its own state from the payment id alone. The `amount` prop is
// just what to show before the first poll resolves — the payment doesn't
// show up in the consent's payment list for a moment after being charged,
// so the backend's own response can't be relied on for that first paint.
// `autoAdvance` is set when the customer just saw Lean's own captureRedirect
// outcome screen (App.jsx) — requiring a second "Done" tap here for the same
// success reads as a redundant confirmation, so this skips straight past it.
// Scoped to success only: a failure still needs the customer's attention.
export function TopupStatus({ paymentId, amount: initialAmount, userId, method = 'aof', groupId, autoAdvance, setError, onDone }) {
  const [data, setData] = useState(null);
  const attemptRef = useRef(0);
  const advancedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const api = API_BY_METHOD[method] ?? leanAofApi;
    const delayFor = (n) => (n < 5 ? 1200 : n < 12 ? 3000 : 6000);
    const poll = async () => {
      try {
        const result = await api.getTopup(paymentId, userId, groupId);
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
  }, [paymentId, userId, method, groupId, setError]);

  const status = data?.status ?? 'PENDING_WITH_BANK';
  const amount = data?.amount ?? initialAmount;
  const kind = classify(status);

  useEffect(() => {
    if (autoAdvance && kind === 'success' && !advancedRef.current) {
      advancedRef.current = true;
      onDone();
    }
  }, [autoAdvance, kind, onDone]);

  const icon = kind === 'success' ? <CheckIcon /> : kind === 'fail' ? <XIcon /> : <ClockIcon />;
  const title = kind === 'success' ? 'Top-up complete' : kind === 'fail' ? 'Top-up failed' : 'Waiting for your bank…';
  const source = describeParty(data?.source);
  const destination = describeParty(data?.destination);

  return (
    <div className="phone-screen" style={{ justifyContent: 'space-between', flex: 1 }}>
      <div>
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

        {kind === 'success' && (source || destination) && (
          <div className="card" style={{ marginTop: 16 }}>
            {source && (
              <div className="receipt-row">
                <span className="k">From</span>
                <span className="v">{source}</span>
              </div>
            )}
            {destination && (
              <div className="receipt-row">
                <span className="k">To</span>
                <span className="v">{destination}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={onDone} disabled={kind === 'pending'}>
        Done
      </button>
    </div>
  );
}
