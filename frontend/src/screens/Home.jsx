import { useState } from 'react';
import { brand, indicativeRate, homeCurrencyToUsd } from '../brand.js';
import { CURRENCY_NAME, flagImgFor } from '../currencies.js';
import { initials, avatarColor, STATUS_LABEL } from '../stores.js';
import { getCachedRate } from '../rateStore.js';
import { TickerStrip } from '../components/TickerStrip.jsx';
import { BalanceCarousel } from '../components/BalanceCarousel.jsx';
import { BankIcon, PlusIcon, SendIcon, UserIcon, ShieldIcon, LogoutIcon } from '../icons.jsx';

const fmt = (n, max = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: max });

function greetingFor(date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// The customer's view of their exchange house's app. No treasury / settlement
// wallet here — that's the exchange house's back office, not the customer's.
// The balance shown below is Meridian's own (Meridian's ledger, backend/src/db.js),
// entirely separate from the pooled Lean X wallet Meridian funds behind the scenes.
export function Home({
  corridors,
  tickerCorridors,
  recipients,
  recentPayments,
  sender,
  onSendTo,
  onOpenProfile,
  onOpenConsents,
  onTopUp,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const corridorByCode = Object.fromEntries(corridors.map((c) => [c.code, c]));
  // The Send flow only offers `corridors` (India-only in this demo — see
  // App.jsx's DEMO_CORRIDOR_CODES), but the rate ticker below is deliberately
  // shown for a broader set via the separate `tickerCorridors` prop. The
  // balance carousel's conversions ride on that same broader set, not the
  // narrower `corridors`, so PKR/NGN don't silently disappear.
  const tickerCorridorByCode = Object.fromEntries(tickerCorridors.map((c) => [c.code, c]));
  const firstName = sender.sender_name.split(' ')[0];
  const sortedRecipients = [...recipients].sort((a, b) => (b.lastSentAt ?? 0) - (a.lastSentAt ?? 0));

  // Same rate source the ticker below already uses (a real cached quote if
  // one exists, otherwise the indicative peg) — so the carousel and
  // "Today's rates" never disagree on the same screen.
  const rateFor = (code) => {
    const corridor = tickerCorridorByCode[code];
    return corridor ? getCachedRate(corridor.code) ?? indicativeRate(corridor, brand.homeCurrency) : null;
  };
  const inrRate = rateFor('IND');
  const pkrRate = rateFor('PAK');
  const ngnRate = rateFor('NGA');

  const balanceEntries = [
    { code: brand.homeCurrency, name: CURRENCY_NAME[brand.homeCurrency] ?? brand.homeCurrency, flagImg: flagImgFor(brand.homeCurrency), amount: sender.balance, isBase: true },
    { code: 'USD', name: CURRENCY_NAME.USD, flagImg: flagImgFor('USD'), amount: homeCurrencyToUsd(sender.balance) },
    inrRate != null && { code: 'INR', name: CURRENCY_NAME.INR, flagImg: flagImgFor('INR'), amount: sender.balance * inrRate },
    pkrRate != null && { code: 'PKR', name: CURRENCY_NAME.PKR, flagImg: flagImgFor('PKR'), amount: sender.balance * pkrRate },
    ngnRate != null && { code: 'NGN', name: CURRENCY_NAME.NGN, flagImg: flagImgFor('NGN'), amount: sender.balance * ngnRate },
  ].filter(Boolean);

  return (
    <div className="phone-screen">
      <div className="topbar">
        <div className="greeting" style={{ flex: 1 }}>
          {greetingFor(new Date())},<strong>{firstName}</strong>
        </div>

        <div className="avatar-menu-wrap">
          <button
            className="avatar"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
              boxShadow: '0 4px 10px -3px rgba(30, 41, 59, 0.45)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
          >
            {initials(sender.sender_name)}
          </button>

          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="avatar-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenProfile();
                  }}
                >
                  <UserIcon width={16} height={16} /> Profile
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenConsents();
                  }}
                >
                  <ShieldIcon width={16} height={16} /> Manage consents
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  <LogoutIcon width={16} height={16} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section-title">Your balance</div>
      <BalanceCarousel entries={balanceEntries} />

      <div className="pill-actions">
        <button className="pill-action" onClick={onTopUp}>
          <span className="pill-icon">
            <PlusIcon width={14} height={14} />
          </span>
          Top up
        </button>
        <button className="pill-action" onClick={() => onSendTo(null)}>
          <span className="pill-icon">
            <SendIcon width={14} height={14} />
          </span>
          Send
        </button>
      </div>

      <div className="section-title">Today's rates</div>
      <TickerStrip
        corridors={tickerCorridors}
        base={brand.homeCurrency}
        anchors={Object.fromEntries(
          tickerCorridors.map((c) => [c.code, getCachedRate(c.code) ?? indicativeRate(c, brand.homeCurrency)]),
        )}
      />

      <div className="section-title">Send again</div>
      <div className="chip-scroller">
        {sortedRecipients.map((r) => {
          const corridor = corridorByCode[r.corridorCode];
          return (
            <button key={r.id} className="recipient-chip" onClick={() => onSendTo(r)}>
              <div className="avatar" style={{ background: avatarColor(r.name) }}>
                {initials(r.name)}
                <span className="flag-badge">{corridor?.flag}</span>
              </div>
              <span className="chip-name">{r.name.split(' ')[0]}</span>
            </button>
          );
        })}
        <button className="recipient-chip" onClick={() => onSendTo(null)}>
          <div className="avatar add">
            <PlusIcon width={20} height={20} />
          </div>
          <span className="chip-name">New</span>
        </button>
      </div>

      {recentPayments.length > 0 && (
        <>
          <div className="section-title">Recent activity</div>
          {recentPayments.slice(0, 3).map((p) =>
            p.type === 'topup' ? (
              <div key={p.id} className="list-row" style={{ cursor: 'default' }}>
                <div className="avatar" style={{ background: 'var(--primary)' }}>
                  <BankIcon width={18} height={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="title">Top-up from your bank</div>
                  <div className="sub">
                    {STATUS_LABEL[p.status] ?? p.status} · {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="trailing" style={{ color: 'var(--primary)' }}>
                  +{fmt(p.amount)} {p.currency}
                </div>
              </div>
            ) : (
              <div key={p.id} className="list-row" style={{ cursor: 'default' }}>
                <div className="avatar" style={{ background: avatarColor(p.recipientName) }}>
                  {initials(p.recipientName)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{p.recipientName}</div>
                  <div className="sub">
                    {corridorByCode[p.corridorCode]?.flag} {STATUS_LABEL[p.status] ?? p.status} ·{' '}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="trailing">
                  -{fmt(p.sourceAmount)} {p.sourceCurrency}
                </div>
              </div>
            ),
          )}
        </>
      )}
    </div>
  );
}
