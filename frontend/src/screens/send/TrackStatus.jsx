import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { brand } from '../../brand.js';
import { CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';

const STEPS = [
  { key: 'queued', label: 'Sent', sub: `Received by ${brand.shortName}` },
  { key: 'processing', label: 'On its way', sub: 'Being paid out to the bank' },
  { key: 'succeeded', label: 'Delivered', sub: 'Money is in their account' },
];

// Maps every documented v2 status to one of the 3 visual steps. The real
// sandbox returns `pending` as an in-progress state (despite the spec marking
// it deprecated), and it belongs on the "processing" step, not step 0.
const STEP_INDEX = {
  queued: 0,
  pending: 1,
  processing: 1,
  succeeded: 2,
  failed: 1,
  rejected: 1,
  unknown: 1,
  canceled: 1,
  reversed: 2,
};
const FAILED_STATUSES = ['failed', 'rejected', 'unknown', 'canceled'];
const TERMINAL = ['succeeded', 'failed', 'rejected', 'unknown', 'canceled', 'reversed'];

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

export function TrackStatus({ corridor, recipient, quote, purpose, payment, flowId, setError, onDone }) {
  const [current, setCurrent] = useState(payment);
  // Anchor on the API's own `created` timestamp, not component mount time, so
  // the "delivered in" figure is the real server-side duration and survives a
  // re-render/remount mid-flight.
  const startRef = useRef(payment.created ? new Date(payment.created).getTime() : Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    // Quick polls while the payment is fresh (most mock/sandbox transitions
    // land in the first seconds), then back off so a slow sandbox isn't
    // hammered — it's a shared environment behind a WAF.
    const delayFor = (n) => (n < 5 ? 1200 : n < 15 ? 3000 : 6000);
    const poll = async () => {
      try {
        const data = await api.getPayment(payment.id, corridor.code, flowId);
        if (cancelled) return;
        setCurrent(data);
        if (!TERMINAL.includes(data.status)) setTimeout(poll, delayFor(attempt++));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (TERMINAL.includes(current.status)) return;
    const t = setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);
    return () => clearInterval(t);
  }, [current.status]);

  const activeIndex = STEP_INDEX[current.status] ?? 0;
  const succeeded = current.status === 'succeeded';
  const failed = FAILED_STATUSES.includes(current.status);

  const elapsedSeconds = current.transaction_completed
    ? Math.max(0, (new Date(current.transaction_completed) - startRef.current) / 1000)
    : elapsedMs / 1000;
  const elapsedLabel = elapsedSeconds >= 90 ? `${Math.round(elapsedSeconds / 60)} min` : `${elapsedSeconds.toFixed(1)}s`;

  const account = recipient.details.beneficiary_account_number ?? '';
  // Customers get a short reference on the receipt; the full payment id is in
  // the Developer Console and the History screen's detail.
  const shortRef = `${brand.initials}-${String(current.id).replace(/-/g, '').slice(0, 10).toUpperCase()}`;

  return (
    <div className="phone-screen">
      <div className="topbar">
        <h1>{succeeded ? 'Transfer complete' : failed ? 'Transfer not completed' : 'Sending…'}</h1>
      </div>

      {!succeeded && (
        <div className="timeline">
          {STEPS.map((step, i) => {
            const done = failed ? i < activeIndex : i < activeIndex;
            const active = !failed && i === activeIndex;
            const isFailedHere = failed && i === activeIndex;
            const isLast = i === STEPS.length - 1;
            return (
              <div key={step.key} className={`timeline-step ${done ? 'done' : ''} ${active ? 'active' : ''} ${isFailedHere ? 'failed' : ''}`}>
                <div className="dot-col">
                  <div className="dot">
                    {done ? <CheckIcon /> : isFailedHere ? <XIcon /> : active ? <span className="spinner dark" /> : <ClockIcon />}
                  </div>
                  {!isLast && <div className="line" />}
                </div>
                <div className="body">
                  <div className="title">{step.label}</div>
                  <div className="sub">{step.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {succeeded && (
        <>
          <div className="receipt">
            <div className="receipt-head">
              <div className="brand-mark">{brand.initials}</div>
              <span className="delivered-pill">
                <CheckIcon width={14} height={14} /> Delivered in {elapsedLabel}
              </span>
              <div className="amount-big">
                {fmt(current.amount ?? quote.amount_destination)} {current.amount_currency ?? corridor.currency}
              </div>
              <div className="muted">to {recipient.name}</div>
            </div>

            <div className="receipt-row">
              <span className="k">Bank</span>
              <span className="v">
                {recipient.details.bank_name} ····{account.slice(-4)}
              </span>
            </div>
            <div className="receipt-row">
              <span className="k">You sent</span>
              <span className="v">
                {fmt(quote.amount, 2)} {quote.currency}
              </span>
            </div>
            <div className="receipt-row">
              <span className="k">Rate</span>
              <span className="v">
                1 {quote.currency} = {fmt(quote.rate, 4)} {corridor.currency}
              </span>
            </div>
            <div className="receipt-row">
              <span className="k">Purpose</span>
              <span className="v">{purpose}</span>
            </div>
            <div className="receipt-row">
              <span className="k">Reference</span>
              <span className="v mono" title={current.id}>
                {shortRef}
              </span>
            </div>
            <div className="receipt-row">
              <span className="k">Bank UTR</span>
              <span className="v mono">{current.bank_reference ?? 'Pending'}</span>
            </div>
            <div className="receipt-row">
              <span className="k">Date</span>
              <span className="v">{new Date(current.transaction_completed ?? Date.now()).toLocaleString()}</span>
            </div>

            <div className="receipt-foot">
              {brand.name} · Support {brand.supportPhone}
              <br />
              Powered by {brand.poweredBy}
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => onDone(current)}>
            Done
          </button>
        </>
      )}

      {failed && (
        <>
          <div className="error-banner">
            This transfer could not be completed ({current.status}). You have not been charged. Reference:{' '}
            <code>{current.id}</code>
          </div>
          <button className="btn btn-secondary" onClick={() => onDone(current)}>
            Back to home
          </button>
        </>
      )}
    </div>
  );
}
