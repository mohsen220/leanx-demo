import { useRef, useState } from 'react';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// A swipeable multi-currency balance switcher, styled as a real centered
// carousel: the active card sits front-and-center at full size on a white,
// shadowed surface, while its neighbors recede — smaller, dimmer, flat —
// with a visible sliver of each so it reads as "there's more to swipe to."
// Only the first entry (isBase) is Meridian's real ledger balance in
// brand.homeCurrency; every other entry is that same balance converted at
// today's rate, and gets a small "Converted" tag instead of an inline
// symbol, so it never reads as separate pots of money. CSS scroll-snap
// does the actual swiping — the dots just mirror scroll position and let a
// tap jump straight to a currency.
export function BalanceCarousel({ entries }) {
  const trackRef = useRef(null);
  const cardRefs = useRef([]);
  const [active, setActive] = useState(0);

  const scrollToIndex = (i) => {
    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const viewportCenter = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let closestDist = Infinity;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - viewportCenter);
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
          <div
            className={`balance-card ${i === active ? 'active' : ''}`}
            key={e.code}
            ref={(el) => (cardRefs.current[i] = el)}
          >
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
