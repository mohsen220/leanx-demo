import { useEffect, useRef, useState } from 'react';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

const TICK_MS = 2200;
const JITTER = 0.0016; // ~±0.08% per tick
const PULL_TO_ANCHOR = 0.15; // keeps the walk from drifting far from the real rate

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// A small live-looking ticker, in the spirit of tradestart's watchlist rows
// (name + pair on the left, price + colored move on the right). Each tick the
// digits roll vertically into place — like a real price ticker — instead of
// just swapping in place. The anchor is the real rate this app already has:
// the live SwiftX-quoted rate if one's been fetched, otherwise the static
// reference rate (see Home.jsx). This only adds cosmetic, gently mean-
// reverting jitter around that anchor, so it reads as "live" without ever
// claiming a specific fabricated market move.
export function RateTickerRow({ flag, name, base, quote, anchorRate }) {
  const anchorRef = useRef(anchorRate);
  const [rate, setRate] = useState(anchorRate);
  const [direction, setDirection] = useState('flat');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    anchorRef.current = anchorRate;
    setRate(anchorRate);
  }, [anchorRate]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setRate((prev) => {
        const anchor = anchorRef.current;
        const pull = (anchor - prev) * PULL_TO_ANCHOR;
        const noise = anchor * (Math.random() - 0.5) * JITTER;
        const next = prev + pull + noise;
        setDirection(next >= prev ? 'up' : 'down');
        setTick((t) => t + 1);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const anchor = anchorRef.current;
  const changePct = anchor ? ((rate - anchor) / anchor) * 100 : 0;

  return (
    <div className="rate-row">
      <span className="pair">
        <span className="flag-chip">{flag}</span>
        <span className="rate-name-block">
          <span className="rate-name">{name}</span>
          <span className="rate-ticker">
            {base}/{quote}
          </span>
        </span>
      </span>
      <span className="rate-price-block">
        <span className="rate-price-wrap">
          <span key={tick} className={`rate-price-slide ${direction}`}>
            {fmt(rate)}
          </span>
        </span>
        <span className={`rate-change ${direction}`}>
          {changePct === 0 ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}
        </span>
      </span>
    </div>
  );
}
