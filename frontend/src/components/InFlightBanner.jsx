import { CheckIcon, XIcon } from '../icons.jsx';
import { dismissTracker } from '../inflightStore.js';

const FAILED_STATUSES = ['failed', 'rejected', 'unknown', 'canceled'];
const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// The visible half of "let them leave": a slim, persistent strip (shown on
// every screen except while actively inside the send flow) so a
// backgrounded transfer is never just silently forgotten. Tapping a
// still-running one jumps back into its live TrackStatus; tapping a
// finished one dismisses it — there's nothing left to track once
// acknowledged.
export function InFlightBanner({ trackers, onResume }) {
  if (!trackers.length) return null;

  return (
    <div className="inflight-stack">
      {trackers.map((t) => {
        const failed = FAILED_STATUSES.includes(t.status);
        const done = t.completed && !failed;
        const firstName = t.recipient?.name?.split(' ')[0] ?? 'recipient';
        return (
          <button
            key={t.id}
            className={`inflight-banner ${done ? 'done' : failed ? 'failed' : 'pending'}`}
            onClick={() => (t.completed ? dismissTracker(t.id) : onResume(t.id))}
          >
            <span className="inflight-icon">
              {done ? <CheckIcon width={15} height={15} /> : failed ? <XIcon width={15} height={15} /> : <span className="spinner dark" />}
            </span>
            <span className="inflight-text">
              {done
                ? `Delivered ${fmt(t.quote?.amount_destination)} ${t.corridor?.currency ?? ''} to ${firstName}`
                : failed
                  ? `Transfer to ${firstName} didn't go through`
                  : `Sending ${fmt(t.quote?.amount)} ${t.quote?.currency ?? ''} to ${firstName}…`}
            </span>
            <span className="inflight-action">{t.completed ? 'Dismiss' : 'View'}</span>
          </button>
        );
      })}
    </div>
  );
}
