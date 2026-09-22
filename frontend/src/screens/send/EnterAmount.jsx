import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { brand, indicativeRate } from '../../brand.js';
import { flagImgFor } from '../../currencies.js';
import { PURPOSES } from '../../stores.js';
import { getCachedRate, setCachedRate } from '../../rateStore.js';
import { FitText } from '../../components/FitText.jsx';
import { BackIcon, ExchangeIcon } from '../../icons.jsx';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// Deterministic pseudo-RNG (mulberry32) seeded from a string hash — same
// corridor always draws the same-looking wiggle, so the chart doesn't
// re-shuffle itself on every keystroke or re-render.
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A believable-looking 30-day rate wiggle ending exactly at today's real
// rate — there's no actual historical rate series stored anywhere in this
// demo, so this is explicitly synthetic (small wander band around the real
// current rate, not invented from nothing).
function useSyntheticRateHistory(seedKey, currentRate, points = 22) {
  return useMemo(() => {
    const rng = mulberry32(hashSeed(seedKey));
    const spread = currentRate * 0.01;
    const values = [currentRate];
    let v = currentRate;
    for (let i = 1; i < points; i++) {
      v += (rng() - 0.5) * spread * 0.5;
      values.push(v);
    }
    values.reverse();
    values[values.length - 1] = currentRate;
    return values;
  }, [seedKey, currentRate, points]);
}

function RateChart({ values }) {
  const w = 300;
  const h = 78;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * (w - pad * 2) + pad,
    h - pad - ((v - min) / range) * (h - pad * 2),
  ]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <div className="rate-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="rate-chart-svg" preserveAspectRatio="none">
        <line x1="0" y1={pad} x2={w} y2={pad} className="rate-chart-grid" />
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} className="rate-chart-grid" />
        <line x1="0" y1={h - pad} x2={w} y2={h - pad} className="rate-chart-grid" />
        <path d={path} className="rate-chart-line" fill="none" />
        <circle cx={lastX} cy={lastY} r="3.5" className="rate-chart-dot" />
      </svg>
      <div className="rate-chart-yaxis">
        <span>{fmt(max, 4)}</span>
        <span>{fmt((max + min) / 2, 4)}</span>
        <span>{fmt(min, 4)}</span>
      </div>
      <div className="rate-chart-xaxis">
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export function EnterAmount({ corridor, recipient, balance, flowId, setError, onBack, onQuoted }) {
  // The customer pays in the exchange house's home currency, full stop. The API
  // also accepts USD/BHD as source currencies, but that's a treasury decision,
  // not something a customer picks per transfer.
  const currency = corridor.sourceCurrencies.includes(brand.homeCurrency)
    ? brand.homeCurrency
    : corridor.sourceCurrencies[0];
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [loading, setLoading] = useState(false);

  // Converts as you type — a top complaint in real exchange-house app reviews
  // is having to tap a button to see the rate. Prefer the last real rate
  // SwiftX actually quoted for this corridor over the static estimate in
  // corridors.js; either way this is still indicative — the firm rate is
  // locked by the quote below when the customer continues.
  const rate = getCachedRate(corridor.code) ?? indicativeRate(corridor, currency);
  const history = useSyntheticRateHistory(corridor.code, rate);

  // Either side can be the one the customer is actually typing into — Wise's
  // own send screen works the same way ("how much do I send" vs "how much
  // do they get" are just two views of the same number). Only one raw text
  // value is ever live-edited; the other side is always derived from it, so
  // there's nothing to keep in sync by hand.
  const [activeSide, setActiveSide] = useState('send');
  const [rawText, setRawText] = useState('500');
  const rawAmount = Number(rawText) || 0;
  const sendAmount = activeSide === 'send' ? rawAmount : rawAmount / rate;
  const receiveAmount = activeSide === 'receive' ? rawAmount : rawAmount * rate;
  const insufficientFunds = sendAmount > balance;

  const swap = () => {
    if (activeSide === 'send') {
      setRawText(receiveAmount ? String(Math.round(receiveAmount * 100) / 100) : '');
      setActiveSide('receive');
    } else {
      setRawText(sendAmount ? String(Math.round(sendAmount * 100) / 100) : '');
      setActiveSide('send');
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      const quote = await api.getQuote(
        {
          country: corridor.code,
          currency,
          amount: Number(sendAmount.toFixed(2)),
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

      <RateChart values={history} />
      <div className="rate-note" style={{ textAlign: 'center', marginTop: -4 }}>
        1 {currency} = {fmt(rate, 4)} {corridor.currency}
      </div>

      <div className="convert-pair">
        <div className={`convert-pair-card ${activeSide === 'send' ? 'active' : ''}`}>
          <div className="convert-pair-label">You send</div>
          <div className="convert-pair-row">
            {activeSide === 'send' ? (
              <input
                className="convert-pair-input"
                type="number"
                inputMode="decimal"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                autoFocus
              />
            ) : (
              <FitText className="convert-pair-amount" text={fmt(sendAmount)} max={28} min={16} />
            )}
            <div className="convert-pair-currency">
              <img className="convert-flag" src={flagImgFor(currency)} alt="" />
              <span>{currency}</span>
            </div>
          </div>
        </div>

        <button className="convert-swap-btn" onClick={swap} aria-label="Switch which amount you're entering">
          <ExchangeIcon width={16} height={16} />
        </button>

        <div className={`convert-pair-card ${activeSide === 'receive' ? 'active' : ''}`}>
          <div className="convert-pair-label">{recipient.name.split(' ')[0]} gets</div>
          <div className="convert-pair-row">
            {activeSide === 'receive' ? (
              <input
                className="convert-pair-input"
                type="number"
                inputMode="decimal"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            ) : (
              <FitText className="convert-pair-amount" text={fmt(receiveAmount)} max={28} min={16} />
            )}
            <div className="convert-pair-currency">
              <img className="convert-flag" src={flagImgFor(corridor.currency)} alt="" />
              <span>{corridor.currency}</span>
            </div>
          </div>
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

      <button className="btn btn-primary" disabled={loading || !(sendAmount > 0) || insufficientFunds} onClick={submit}>
        {loading ? <span className="spinner" /> : 'Continue'}
      </button>

      <div className="powered-by">
        Powered by <strong>{brand.poweredBy}</strong>
      </div>
    </div>
  );
}
