import { useEffect, useRef, useState } from 'react';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

const TICK_MS = 2200;
const JITTER = 0.0016; // ~±0.08% per tick
const PULL_TO_ANCHOR = 0.15; // keeps the walk from drifting far from the real rate

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// A horizontally scrolling rate ticker, matching the marquee strip in the
// tradestart project (its .ticker-strip: a row of symbol/price/change chips
// looping via translateX). Each corridor's price still nudges every couple
// of seconds — the same real-anchor, mean-reverting jitter as before — but
// motion now reads through the scroll instead of a vertical roll. State is
// tracked once per corridor code (not per repeated/duplicated chip) so every
// copy of e.g. "India" in the loop always shows the same number.
export function TickerStrip({ corridors, base, anchors }) {
  const anchorsRef = useRef(anchors);
  const [live, setLive] = useState(() =>
    Object.fromEntries(corridors.map((c) => [c.code, { rate: anchors[c.code], direction: 'flat' }])),
  );

  useEffect(() => {
    anchorsRef.current = anchors;
    setLive((prev) => {
      const next = { ...prev };
      for (const c of corridors) {
        if (!next[c.code]) next[c.code] = { rate: anchors[c.code], direction: 'flat' };
      }
      return next;
    });
  }, [anchors, corridors]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setLive((prev) => {
        const next = {};
        for (const c of corridors) {
          const anchor = anchorsRef.current[c.code];
          const prevRate = prev[c.code]?.rate ?? anchor;
          const pull = (anchor - prevRate) * PULL_TO_ANCHOR;
          const noise = anchor * (Math.random() - 0.5) * JITTER;
          const rate = prevRate + pull + noise;
          next[c.code] = { rate, direction: rate >= prevRate ? 'up' : 'down' };
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [corridors]);

  // Exactly two copies of the real corridor list — the minimum needed for a
  // seamless translateX(-50%) loop. Padding this out further just shows the
  // same rate sitting duplicated side by side in the strip at once.
  const loop = [...corridors, ...corridors];

  return (
    <div className="ticker-strip">
      <div className="ticker-inner">
        {loop.map((c, i) => {
          const anchor = anchorsRef.current[c.code];
          const state = live[c.code] ?? { rate: anchor, direction: 'flat' };
          const changePct = anchor ? ((state.rate - anchor) / anchor) * 100 : 0;
          return (
            <span className="ticker-item" key={`${c.code}-${i}`}>
              <span className="ticker-flag">{c.flag}</span>
              <span className="ticker-name">
                {base}/{c.currency}
              </span>
              <span className="ticker-price">{fmt(state.rate)}</span>
              <span className={`ticker-chg ${state.direction}`}>
                {changePct === 0 ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
