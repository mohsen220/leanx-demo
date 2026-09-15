import { BackIcon, PlusIcon } from '../../icons.jsx';
import { initials, avatarColor } from '../../stores.js';

// The step real remittance apps live on: pick someone you've sent to before.
// The recipient carries their corridor, so choosing one skips the country step.
export function SelectRecipient({ recipients, corridors, onSelect, onAddNew, onBack }) {
  const corridorByCode = Object.fromEntries(corridors.map((c) => [c.code, c]));
  const sorted = [...recipients].sort((a, b) => (b.lastSentAt ?? 0) - (a.lastSentAt ?? 0));

  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Send to</h1>
      </div>

      <button className="btn btn-secondary" onClick={onAddNew}>
        <PlusIcon width={18} height={18} /> New recipient
      </button>

      {sorted.length === 0 && (
        <div className="empty-state">
          <span className="muted">No saved recipients yet.</span>
        </div>
      )}

      {sorted.length > 0 && <div className="section-title">Saved recipients</div>}
      <div>
        {sorted.map((r) => {
          const corridor = corridorByCode[r.corridorCode];
          const account = r.details.beneficiary_account_number ?? '';
          return (
            <button key={r.id} className="list-row" onClick={() => onSelect(r)}>
              <div className="avatar" style={{ background: avatarColor(r.name) }}>
                {initials(r.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="title">{r.name}</div>
                <div className="sub">
                  {corridor?.flag} {corridor?.name} · {r.details.bank_name} ····{account.slice(-4)}
                </div>
              </div>
              <div className="trailing" style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>
                Send
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
