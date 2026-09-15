import { useEffect, useState } from 'react';
import { api } from './api.js';
import { ledgerApi } from './ledgerApi.js';
import { brand } from './brand.js';
import { initials, avatarColor, STATUS_LABEL, STATUS_CLASS } from './stores.js';
import { BankIcon, SendIcon, CheckIcon, UserIcon, PlusIcon } from './icons.jsx';

// Meridian's back-office view: the pooled Lean X wallet (real rail traffic, so
// it's fetched through api.js and does show up in the Lean X Developer
// Console) alongside Meridian's own customer ledger (ledgerApi.js, which never
// touches SwiftX). Built on the same design tokens as the customer app
// (styles.css) rather than the Developer Console's engineer-facing look —
// this page is read by ops staff, not developers.
const fmt = (n, max = 2) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: max });
const AUTO_REFRESH_MS = 20_000;

export function AdminDashboard() {
  const [mockMode, setMockMode] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [corridors, setCorridors] = useState([]);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.allSettled([
      api.getHealth().then((h) => setMockMode(h.mockMode)),
      api.getCorridors().then(setCorridors),
      // The pooled wallet isn't per-corridor, but /balance still asks for one
      // to know which currency to report capacity in — India is the only
      // corridor live on this sandbox org right now. No group id: this is a
      // background check, not a transfer, so the Developer Console files it
      // under background activity instead of showing it as its own journey.
      api.getBalance('IND').then(setWallet),
      ledgerApi.listUsers().then(setUsers),
      ledgerApi.listTransactions().then(setTransactions),
    ]).then((results) => {
      const failed = results.find((r) => r.status === 'rejected');
      setError(failed ? failed.reason.message : null);
      setLastUpdated(new Date());
      setRefreshing(false);
    });
  };

  useEffect(() => {
    load();
    const id = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const remittances = transactions.filter((t) => t.type !== 'topup');
  const topups = transactions.filter((t) => t.type === 'topup');
  const succeeded = transactions.filter((t) => t.status === 'succeeded');
  const totalSent = remittances.reduce((sum, t) => sum + Number(t.sourceAmount ?? 0), 0);
  const totalToppedUp = topups.reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
  const successRate = transactions.length ? Math.round((succeeded.length / transactions.length) * 100) : 100;
  const customerFloat = users.reduce((sum, u) => sum + Number(u.balance ?? 0), 0);
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const corridorByCode = Object.fromEntries(corridors.map((c) => [c.code, c]));

  return (
    <div className="ad-page">
      <header className="ad-header">
        <div className="ad-header-left">
          <div className="ad-logo">{brand.initials}</div>
          <div>
            <h1>{brand.name}</h1>
            <div className="ad-header-sub">Operations</div>
          </div>
          {mockMode !== null && (
            <span className={`status-badge ${mockMode ? 'pending' : 'success'}`}>
              {mockMode ? 'Mock mode' : 'Real sandbox'}
            </span>
          )}
        </div>
        <div className="ad-header-right">
          {lastUpdated && (
            <span className="ad-updated">Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
          )}
          <button className="ad-refresh-btn" onClick={load} disabled={refreshing}>
            {refreshing ? <span className="spinner dark" /> : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="ad-error">{error}</div>}

      <div className="ad-body">
        <section className="ad-kpi-row ad-kpi-row-hero">
          <div className="ad-kpi ad-kpi-hero">
            <div className="ad-kpi-icon">
              <BankIcon width={20} height={20} />
            </div>
            <div>
              <div className="ad-kpi-label">Pooled Lean X wallet</div>
              <div className="ad-kpi-value">
                {wallet ? fmt(wallet.wallet_balance) : '—'} <small>USDT</small>
              </div>
              <div className="ad-kpi-note">
                {wallet ? `≈ ${fmt(wallet.balance)} ${wallet.currency} available to pay out via India` : 'Loading…'}
              </div>
            </div>
          </div>

          <div className="ad-kpi">
            <div className="ad-kpi-icon ad-kpi-icon-blue">
              <UserIcon width={20} height={20} />
            </div>
            <div>
              <div className="ad-kpi-label">Customer float</div>
              <div className="ad-kpi-value">
                {fmt(customerFloat)} <small>AED</small>
              </div>
              <div className="ad-kpi-note">Held across {users.length} customer{users.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        </section>

        <section className="ad-kpi-row">
          <div className="ad-kpi ad-kpi-compact">
            <div className="ad-kpi-icon ad-kpi-icon-muted">
              <SendIcon width={18} height={18} />
            </div>
            <div>
              <div className="ad-kpi-label">Transactions</div>
              <div className="ad-kpi-value">{transactions.length}</div>
            </div>
          </div>

          <div className="ad-kpi ad-kpi-compact">
            <div className="ad-kpi-icon ad-kpi-icon-blue">
              <PlusIcon width={18} height={18} />
            </div>
            <div>
              <div className="ad-kpi-label">Topped up (Lean Pay)</div>
              <div className="ad-kpi-value">
                {fmt(totalToppedUp)} <small>AED</small>
              </div>
            </div>
          </div>

          <div className="ad-kpi ad-kpi-compact">
            <div className="ad-kpi-icon ad-kpi-icon-muted">
              <BankIcon width={18} height={18} />
            </div>
            <div>
              <div className="ad-kpi-label">Sent abroad (Lean X)</div>
              <div className="ad-kpi-value">
                {fmt(totalSent)} <small>AED</small>
              </div>
            </div>
          </div>

          <div className="ad-kpi ad-kpi-compact">
            <div className="ad-kpi-icon ad-kpi-icon-success">
              <CheckIcon width={18} height={18} />
            </div>
            <div>
              <div className="ad-kpi-label">Success rate</div>
              <div className="ad-kpi-value">{successRate}%</div>
            </div>
          </div>
        </section>

        <section className="ad-section">
          <h2 className="ad-section-title">Customers <span className="ad-count">{users.length}</span></h2>
          <div className="ad-card ad-table-card">
            {users.length === 0 && <div className="ad-empty">No customers yet</div>}
            {users.map((u) => (
              <div className="ad-row" key={u.id}>
                <div className="avatar" style={{ background: avatarColor(u.sender_name) }}>
                  {initials(u.sender_name)}
                </div>
                <div className="ad-row-main">
                  <div className="ad-row-title">{u.sender_name}</div>
                  <div className="ad-row-sub">{u.sender_mobile}</div>
                </div>
                <div className="ad-row-trailing">
                  <div className="ad-row-amount">{fmt(u.balance)} AED</div>
                  <div className="ad-row-caption">{brand.shortName} balance</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ad-section">
          <h2 className="ad-section-title">Recent transactions <span className="ad-count">{transactions.length}</span></h2>
          <div className="ad-card ad-table-card">
            {transactions.length === 0 && <div className="ad-empty">No transactions yet</div>}
            {transactions.map((t) =>
              t.type === 'topup' ? (
                <div className="ad-row" key={t.id}>
                  <div className="avatar" style={{ background: 'var(--primary)' }}>
                    <BankIcon width={18} height={18} />
                  </div>
                  <div className="ad-row-main">
                    <div className="ad-row-title">Top-up · Lean Pay</div>
                    <div className="ad-row-sub">
                      {usersById[t.userId]?.sender_name ?? t.userId} ·{' '}
                      {new Date(t.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="ad-row-trailing">
                    <div className="ad-row-amount">
                      +{fmt(t.amount)} {t.currency}
                    </div>
                    <span className={`status-badge ${STATUS_CLASS[t.status] ?? 'pending'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="ad-row" key={t.id}>
                  <div className="avatar" style={{ background: avatarColor(t.recipientName) }}>
                    {initials(t.recipientName)}
                  </div>
                  <div className="ad-row-main">
                    <div className="ad-row-title">{t.recipientName}</div>
                    <div className="ad-row-sub">
                      {usersById[t.userId]?.sender_name ?? t.userId} · {corridorByCode[t.corridorCode]?.flag}{' '}
                      {corridorByCode[t.corridorCode]?.name ?? t.corridorCode} ·{' '}
                      {new Date(t.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="ad-row-trailing">
                    <div className="ad-row-amount">
                      {fmt(t.sourceAmount)} {t.sourceCurrency} <span className="ad-arrow">→</span> {fmt(t.destAmount)}{' '}
                      {t.destCurrency}
                    </div>
                    <span className={`status-badge ${STATUS_CLASS[t.status] ?? 'pending'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
