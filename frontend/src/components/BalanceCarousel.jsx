import { useRef, useState } from 'react';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

// A swipeable "which currency am I looking at" balance switcher — the
// same pattern Revolut/Wise use for a multi-currency account. Only the
// first entry (isBase) is Meridian's real ledger balance in
// brand.homeCurrency; every other entry is that same balance converted at
// today's rate, marked with "≈" so it never reads as separate pots of
// money. CSS scroll-snap does the actual swiping/paging — the dots below
// just mirror scroll position and let a tap jump straight to a currency.
export function BalanceCarousel({ entries }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  const scrollToIndex = (i) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <div className="balance-carousel">
      <div className="balance-track" ref={trackRef} onScroll={handleScroll}>
        {entries.map((e) => (
          <div className="balance-page" key={e.code}>
            <div className="label">Your balance</div>
            <div className="amount">
              {!e.isBase && <span className="approx">≈</span>}
              {fmt(e.amount)}
            </div>
            <div className="currency-tag">
              <span className="flag">{e.flag}</span> {e.code}
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
