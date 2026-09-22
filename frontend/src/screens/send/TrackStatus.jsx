import { useEffect, useState } from 'react';
import { brand } from '../../brand.js';
import { CheckIcon, ClockIcon, XIcon } from '../../icons.jsx';
import { getTracker, subscribeInflight } from '../../inflightStore.js';

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

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// Reads everything from the shared inflightStore tracker rather than props —
// polling itself lives there now, independent of this component's own
// lifecycle, so leaving this screen (or reloading the page) doesn't kill an
// in-flight transfer. `trackerId` is the only thing this component actually
// needs from its parent; a resumed tracker (tapped back into from the
// in-flight banner elsewhere in the app) works identically to a freshly
// started one.
export function TrackStatus({ trackerId, onDone, onLeave }) {
  const [tracker, setTracker] = useState(() => getTracker(trackerId));

  useEffect(() => subscribeInflight(() => setTracker(getTracker(trackerId))), [trackerId]);

  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!tracker || tracker.completed) return;
    const start = tracker.createdAt ? new Date(tracker.createdAt).getTime() : Date.now();
    const t = setInterval(() => setElapsedMs(Date.now() - start), 200);
    return () => clearInterval(t);
  }, [tracker?.completed, tracker?.createdAt]);

  if (!tracker) return null;

  const { corridor, recipient, quote, purpose } = tracker;
  const activeIndex = STEP_INDEX[tracker.status] ?? 0;
  const succeeded = tracker.status === 'succeeded';
  const failed = FAILED_STATUSES.includes(tracker.status);

  const startTime = tracker.createdAt ? new Date(tracker.createdAt).getTime() : Date.now();
  const elapsedSeconds = tracker.transactionCompleted
    ? Math.max(0, (new Date(tracker.transactionCompleted) - startTime) / 1000)
    : elapsedMs / 1000;
  const elapsedLabel = elapsedSeconds >= 90 ? `${Math.round(elapsedSeconds / 60)} min` : `${elapsedSeconds.toFixed(1)}s`;

  const account = recipient.details.beneficiary_account_number ?? '';
  // Customers get a short reference on the receipt; the full payment id is in
  // the Developer Console and the History screen's detail.
  const shortRef = `${brand.initials}-${String(tracker.id).replace(/-/g, '').slice(0, 10).toUpperCase()}`;

  return (
    <div className="phone-screen">
      <div className="topbar">
        <h1>{succeeded ? 'Transfer complete' : failed ? 'Transfer not completed' : 'Sending…'}</h1>
      </div>

      {!succeeded && (
        <div className="timeline">
          {STEPS.map((step, i) => {
            const done = i < activeIndex;
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

      {!succeeded && !failed && (
        <button className="btn btn-secondary" onClick={onLeave}>
          Back to Home — we'll keep watching this for you
        </button>
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
                {fmt(tracker.amount ?? quote.amount_destination)} {tracker.amountCurrency ?? corridor.currency}
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
              <span className="v mono" title={tracker.id}>
                {shortRef}
              </span>
            </div>
            <div className="receipt-row">
              <span className="k">Bank UTR</span>
              <span className="v mono">{tracker.bankReference ?? 'Pending'}</span>
            </div>
            <div className="receipt-row">
              <span className="k">Date</span>
              <span className="v">{new Date(tracker.transactionCompleted ?? Date.now()).toLocaleString()}</span>
            </div>

            <div className="receipt-foot">
              {brand.name} · Support {brand.supportPhone}
              <br />
              Powered by {brand.poweredBy}
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => onDone(tracker)}>
            Done
          </button>
        </>
      )}

      {failed && (
        <>
          <div className="error-banner">
            This transfer could not be completed ({tracker.status}). You have not been charged. Reference:{' '}
            <code>{tracker.id}</code>
          </div>
          <button className="btn btn-secondary" onClick={() => onDone(tracker)}>
            Back to home
          </button>
        </>
      )}
    </div>
  );
}
