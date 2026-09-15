import { useRef, useState } from 'react';
import { api } from '../../api.js';
import { brand } from '../../brand.js';
import { RELATIONS, initials, avatarColor } from '../../stores.js';
import { BackIcon } from '../../icons.jsx';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// The API needs the sender's KYC on every payment; the customer entered it
// once at onboarding, so it's spread in from the stored profile here rather
// than re-asked. Fields that only make sense in Falcon's own ledger (id,
// balance, verifiedAt, createdAt) are stripped first — SwiftX has no use for them.
function senderFields(sender) {
  const { id, balance, verifiedAt, createdAt, ...rest } = sender;
  return rest;
}

export function ReviewAndSend({ corridor, recipient, quote, purpose, sender, flowId, setError, onBack, onSent }) {
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const pinInput = useRef(null);

  const relationLabel = RELATIONS.find((r) => r.value === recipient.relation)?.label ?? recipient.relation;
  const account = recipient.details.beneficiary_account_number ?? '';

  const send = async () => {
    setSending(true);
    try {
      const externalId = `falcon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        country: corridor.code,
        currency: quote.currency,
        quote: quote.id,
        amount: quote.amount_destination,
        external_id: externalId,
        ...recipient.details,
        ...senderFields(sender),
        sender_relation: recipient.relation,
        remarks: purpose,
        // Underscore-prefixed: stripped by the backend before it talks to
        // SwiftX, used only to write Falcon's own ledger (backend/src/db.js).
        _userId: sender.id,
        _recipientId: recipient.id,
        _sourceAmount: quote.amount,
        _destAmount: quote.amount_destination,
        _destCurrency: corridor.currency,
        _rate: quote.rate,
      };
      const payment = await api.sendPayment(payload, flowId);
      onSent(payment);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Review & confirm</h1>
      </div>

      <div className="card">
        <div className="muted">You send</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
          {fmt(quote.amount, 2)} {quote.currency}
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          {recipient.name.split(' ')[0]} receives
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
          {fmt(quote.amount_destination)} {corridor.currency}
        </div>
        <div className="faint" style={{ marginTop: 8 }}>
          Rate locked: 1 {quote.currency} = {fmt(quote.rate, 4)} {corridor.currency} · valid until{' '}
          {new Date(quote.expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="avatar" style={{ background: avatarColor(recipient.name) }}>
          {initials(recipient.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{recipient.name}</div>
          <div className="faint">
            {relationLabel} · {recipient.details.bank_name} ····{account.slice(-4)}
          </div>
          <div className="faint">Purpose: {purpose}</div>
        </div>
      </div>

      <div className="section-title">Confirm with your PIN</div>
      <div className="pin-row" onClick={() => pinInput.current?.focus()}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`pin-box ${pin.length > i ? 'filled' : ''}`}>
            {pin.length > i ? '•' : ''}
          </div>
        ))}
      </div>
      <input
        ref={pinInput}
        className="pin-hidden-input"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        autoFocus
        aria-label="4-digit PIN"
      />
      <div className="faint" style={{ textAlign: 'center', marginTop: -8 }}>
        Demo: any 4 digits work.
      </div>

      <button className="btn btn-primary" disabled={sending || pin.length < 4} onClick={send}>
        {sending ? <span className="spinner" /> : `Send ${fmt(quote.amount, 2)} ${quote.currency}`}
      </button>

      <div className="powered-by">
        Powered by <strong>{brand.poweredBy}</strong>
      </div>
    </div>
  );
}
