import { useRef, useState } from 'react';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// A swipeable multi-currency balance switcher — a peeking card stack (the
// next card always shows a sliver on the right) rather than full-width
// pages, so it reads as "there's more to swipe to" without needing dots
// alone to say so. Only the first entry (isBase) is Meridian's real ledger
// balance in brand.homeCurrency; every other entry is that same balance
// converted at today's rate, and gets a small "Converted" tag instead of
// an inline symbol, so it never reads as separate pots of money. CSS
// scroll-snap does the actual swiping — the dots just mirror scroll
// position and let a tap jump straight to a currency.
export function BalanceCarousel({ entries }) {
  const trackRef = useRef(null);
  const cardRefs = useRef([]);
  const [active, setActive] = useState(0);

  const scrollToIndex = (i) => {
    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    let closest = 0;
    let closestDist = Infinity;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const dist = Math.abs(card.offsetLeft - track.scrollLeft);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setActive(closest);
  };

  return (
    <div className="balance-carousel">
      <div className="balance-track" ref={trackRef} onScroll={handleScroll}>
        {entries.map((e, i) => (
          <div className="balance-card" key={e.code} ref={(el) => (cardRefs.current[i] = el)}>
            <div className="balance-card-flag">{e.flag}</div>
            <div className="balance-card-body">
              <div className="balance-card-amount">{fmt(e.amount)}</div>
              <div className="balance-card-name-row">
                <span className="balance-card-name">{e.name}</span>
                {!e.isBase && <span className="balance-card-tag">Converted</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {entries.length > 1 && (
        <div className="balance-dots">
          {entries.map((e, i) => (
            <button
              key={e.code}
              className={`balance-dot ${i === active ? 'active' : ''}`}
              aria-label={`Show balance in ${e.code}`}
              onClick={() => scrollToIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
