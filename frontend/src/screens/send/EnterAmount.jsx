import { useState } from 'react';
import { api } from '../../api.js';
import { brand, indicativeRate } from '../../brand.js';
import { PURPOSES } from '../../stores.js';
import { getCachedRate, setCachedRate } from '../../rateStore.js';
import { BackIcon } from '../../icons.jsx';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

export function EnterAmount({ corridor, recipient, balance, flowId, setError, onBack, onQuoted }) {
  // The customer pays in the exchange house's home currency, full stop. The API
  // also accepts USD/BHD as source currencies, but that's a treasury decision,
  // not something a customer picks per transfer.
  const currency = corridor.sourceCurrencies.includes(brand.homeCurrency)
    ? brand.homeCurrency
    : corridor.sourceCurrencies[0];
  const [amount, setAmount] = useState('500');
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [loading, setLoading] = useState(false);

  // Converts as you type — a top complaint in real exchange-house app reviews
  // is having to tap a button to see the rate. Prefer the last real rate
  // SwiftX actually quoted for this corridor over the static estimate in
  // corridors.js; either way this is still indicative — the firm rate is
  // locked by the quote below when the customer continues.
  const rate = getCachedRate(corridor.code) ?? indicativeRate(corridor, currency);
  const receive = Number(amount) > 0 ? Number(amount) * rate : 0;
  const insufficientFunds = Number(amount) > balance;

  const submit = async () => {
    setLoading(true);
    try {
      const quote = await api.getQuote(
        {
          country: corridor.code,
          currency,
          amount: Number(amount),
          // Real recipient details as routing hints (the API recommends them).
          beneficiary_account_number: recipient.details.beneficiary_account_number,
          bank_branch_code: recipient.details.bank_branch_code,
        },
        flowId,
      );
      // A real rate just came back — refresh the cached figure so Home's
      // rate board (and this screen, next time) reflect it instead of the
      // static estimate.
      setCachedRate(corridor.code, quote.rate);
      onQuoted({ quote, purpose });
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
        <h1>Send to {recipient.name.split(' ')[0]}</h1>
      </div>

      <div className="amount-input-wrap">
        <span className="currency">{currency}</span>
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>

      <div className="conversion-preview">
        <div className="receive">
          {corridor.flag} {receive ? fmt(receive) : '—'} {corridor.currency}
        </div>
        <div className="rate-note">
          Indicative rate 1 {currency} ≈ {fmt(rate, 4)} {corridor.currency} · final rate locked on the next step
        </div>
      </div>

      <div className="faint" style={{ textAlign: 'center' }}>
        Balance: {fmt(balance)} {currency}
      </div>
      {insufficientFunds && (
        <div className="balance-warning">Not enough balance — top up from Home to send this amount.</div>
      )}

      <label className="field">
        Purpose of transfer
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <button className="btn btn-primary" disabled={loading || !(Number(amount) > 0) || insufficientFunds} onClick={submit}>
        {loading ? <span className="spinner" /> : 'Continue'}
      </button>

      <div className="powered-by">
        Powered by <strong>{brand.poweredBy}</strong>
      </div>
    </div>
  );
}
