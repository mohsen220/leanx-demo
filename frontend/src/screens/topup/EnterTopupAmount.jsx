import { useState } from 'react';
import { leanPayApi } from '../../leanPayApi.js';
import { brand } from '../../brand.js';
import { BackIcon } from '../../icons.jsx';

const QUICK_AMOUNTS = ['100', '250', '500', '1000'];

// Creates the Lean Payment Link up front — the Authorize screen just needs
// its hosted checkout URL to redirect to.
export function EnterTopupAmount({ userId, setError, onBack, onIntentCreated }) {
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { linkId, link } = await leanPayApi.createTopupIntent(userId, Number(amount));
      onIntentCreated({ intentId: linkId, link, amount: Number(amount) });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="phone-screen">
      <div className="topbar">
        <button className="back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <h1>Top up</h1>
      </div>

      <div className="muted" style={{ textAlign: 'center' }}>
        Add money to your Falcon balance from your own bank.
      </div>

      <div className="amount-input-wrap">
        <span className="currency">AED</span>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          autoFocus
        />
      </div>

      <div className="chip-row">
        {QUICK_AMOUNTS.map((v) => (
          <button key={v} className={`chip ${amount === v ? 'active' : ''}`} onClick={() => setAmount(v)}>
            {v} AED
          </button>
        ))}
      </div>

      <button className="btn btn-primary" disabled={loading || !(Number(amount) > 0)} onClick={submit}>
        {loading ? <span className="spinner" /> : 'Continue'}
      </button>

      <div className="powered-by">
        Powered by <strong>{brand.poweredByPay}</strong>
      </div>
    </div>
  );
}
