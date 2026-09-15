import { initials, avatarColor, STATUS_LABEL, STATUS_CLASS } from '../stores.js';
import { BankIcon } from '../icons.jsx';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// Reads straight from Meridian's own ledger (passed down from App.jsx) rather
// than calling SwiftX's history endpoint itself — an exchange house's
// transaction record is its own, not a live read-through of the rail. Two
// transaction types share this list: remittances (SwiftX/Lean X) and
// top-ups (Lean Pay/Open Finance) — same ledger, same status vocabulary.
export function History({ payments, corridors }) {
  const corridorByCode = Object.fromEntries(corridors.map((c) => [c.code, c]));

  return (
    <div className="phone-screen">
      <div className="topbar">
        <h1>History</h1>
      </div>

      {payments.length === 0 && (
        <div className="empty-state">
          <span className="muted">No activity yet</span>
        </div>
      )}

      {payments.map((p) =>
        p.type === 'topup' ? (
          <div key={p.id} className="list-row" style={{ cursor: 'default' }}>
            <div className="avatar" style={{ background: 'var(--primary)' }}>
              <BankIcon width={18} height={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="title">Top-up from your bank</div>
              <div className="sub">{new Date(p.createdAt).toLocaleString()}</div>
            </div>
            <div className="trailing">
              <div style={{ color: 'var(--primary)' }}>
                +{fmt(p.amount)} {p.currency}
              </div>
              <span className={`status-badge ${STATUS_CLASS[p.status] ?? 'pending'}`}>
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </div>
          </div>
        ) : (
          <div key={p.id} className="list-row" style={{ cursor: 'default' }}>
            <div className="avatar" style={{ background: avatarColor(p.recipientName) }}>
              {initials(p.recipientName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="title">{p.recipientName}</div>
              <div className="sub">
                {corridorByCode[p.corridorCode]?.flag ?? p.corridorCode} · {new Date(p.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="trailing">
              <div>
                -{fmt(p.sourceAmount)} {p.sourceCurrency}
              </div>
              <span className={`status-badge ${STATUS_CLASS[p.status] ?? 'pending'}`}>
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
