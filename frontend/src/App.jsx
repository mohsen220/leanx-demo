import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { ledgerApi } from './ledgerApi.js';
import { leanAofApi } from './leanAofApi.js';
import { getActiveUserId, setActiveUserId, clearActiveUserId } from './stores.js';
import { BottomNav } from './components/BottomNav.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { Home } from './screens/Home.jsx';
import { SendFlow } from './screens/SendFlow.jsx';
import { TopUp } from './screens/TopUp.jsx';
import { History } from './screens/History.jsx';
import { Profile } from './screens/Profile.jsx';
import { SignalIcon, WifiIcon, BatteryIcon } from './icons.jsx';

const NAV_SCREENS = new Set(['home', 'history']);

// India only for now: it's the one corridor where AED quotes succeed on our
// sandbox org (Pakistan/Nigeria return 500 "Could not fetch quote"). The full
// 7 corridors live in the backend's reference data — add codes here to surface
// them once the SwiftX team enables them.
const DEMO_CORRIDOR_CODES = ['IND'];

const formatStatusTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function App() {
  // Which Falcon ledger customer this browser is acting as — remembered in
  // localStorage across reloads, null until onboarding creates one. This is
  // Falcon's own concept entirely; it has nothing to do with Lean, which
  // only enters the picture on this customer's first top-up.
  const [userId, setUserId] = useState(() => getActiveUserId());
  const [screen, setScreen] = useState('home');
  const [corridors, setCorridors] = useState([]);
  // sender: the signed-in customer's KYC profile + Falcon balance, from Falcon's
  // own ledger (backend/src/db.js) — not from SwiftX, which never sees either.
  const [sender, setSender] = useState(null);
  const [recipients, setRecipients] = useState(null);
  const [sendTo, setSendTo] = useState(null); // recipient pre-selected from "Send again"
  const [recentPayments, setRecentPayments] = useState([]);
  const [error, setError] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [statusTime, setStatusTime] = useState(() => formatStatusTime(new Date()));
  // Set once, right after a real bank redirect reloads the whole app —
  // see the localStorage handoff in EnterTopupAmount.jsx. Drives TopUp
  // straight into its status step instead of restarting from "amount".
  const [resumeTopup, setResumeTopup] = useState(null);

  // Real wall-clock time in the status bar, ticking on the minute.
  useEffect(() => {
    const id = setInterval(() => setStatusTime(formatStatusTime(new Date())), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.getCorridors().then(setCorridors).catch((err) => setError(err.message));
  }, []);

  const onOnboarded = (user) => {
    setActiveUserId(user.id);
    setUserId(user.id);
  };

  const logout = () => {
    clearActiveUserId();
    setUserId(null);
    setSender(null);
    setRecipients(null);
    setRecentPayments([]);
    setScreen('home');
  };

  useEffect(() => {
    if (!userId) return;
    ledgerApi
      .getUser(userId)
      .then(setSender)
      .catch((err) => {
        // The remembered account no longer exists on this backend (e.g. local
        // demo data was reset) — logging out here, rather than just showing
        // an error, is what keeps the app from getting stuck on the loading
        // screen with no way back to Onboarding.
        logout();
        setError(err.message);
      });
    ledgerApi.listRecipients(userId).then(setRecipients).catch((err) => setError(err.message));
  }, [userId]);

  // Picks up a top-up left mid-authorization when a real bank redirect
  // reloaded the app (see EnterTopupAmount.jsx) — the consent should now be
  // AUTHORISED, so this charges it for real and drops straight into the
  // status screen, rather than silently doing nothing (which is what was
  // happening before this existed: the redirect completed, but no charge
  // was ever actually made).
  useEffect(() => {
    if (!sender) return;
    const raw = localStorage.getItem('falcon_pending_aof_charge');
    if (!raw) return;
    localStorage.removeItem('falcon_pending_aof_charge');

    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      return;
    }
    if (pending.userId !== sender.id) return;

    leanAofApi
      .chargeAfterAuthorization(pending.userId, pending.amount)
      .then(({ paymentId }) => {
        setResumeTopup({ paymentId, amount: pending.amount });
        setScreen('topup');
      })
      .catch((err) => setError(err.message));
  }, [sender]);

  // Memoized: this must NOT be a new array reference on every render — several
  // child effects depend on it, and a fresh .filter() result on every render
  // caused a runaway re-fetch loop in an earlier version of this file.
  const displayCorridors = useMemo(
    () => corridors.filter((c) => DEMO_CORRIDOR_CODES.includes(c.code)),
    [corridors],
  );

  // Recent transfers come from Falcon's own ledger, not a live SwiftX call —
  // an exchange house keeps its own transaction record independent of the
  // rail. Refetched on load and after every completed transfer.
  useEffect(() => {
    if (!userId) return;
    ledgerApi
      .listTransactions(userId)
      .then(setRecentPayments)
      .catch((err) => setError(err.message));
  }, [userId, historyKey]);

  // Only show recipients in corridors the app currently offers — older saved
  // recipients (e.g. from a previously enabled corridor) stay in storage but
  // out of the UI.
  const visibleRecipients = useMemo(() => {
    if (recipients === null) return null;
    const codes = new Set(displayCorridors.map((c) => c.code));
    // Dedupe by corridor + account (keeping the most recently used) in case
    // storage holds two entries for the same person from an older version.
    const byAccount = new Map();
    for (const r of recipients) {
      if (!codes.has(r.corridorCode)) continue;
      const key = `${r.corridorCode}:${r.details.beneficiary_account_number}`;
      const prev = byAccount.get(key);
      if (!prev || (r.lastSentAt ?? 0) > (prev.lastSentAt ?? 0)) byAccount.set(key, r);
    }
    return [...byAccount.values()];
  }, [recipients, displayCorridors]);

  // Persists to Falcon's backend ledger (which itself dedupes by corridor +
  // account number) and folds the canonical saved row back into local state.
  const upsertRecipient = async (recipient) => {
    try {
      const saved = await ledgerApi.saveRecipient(userId, recipient);
      setRecipients((prev) => {
        const list = prev ?? [];
        const exists = list.some((r) => r.id === saved.id);
        return exists ? list.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...list];
      });
      return saved;
    } catch (err) {
      setError(err.message);
      return recipient;
    }
  };

  const refreshSender = () => ledgerApi.getUser(userId).then(setSender).catch(() => {});

  const onTopupComplete = () => {
    refreshSender(); // credited server-side once the bank authorization settled
    setHistoryKey((k) => k + 1);
    setResumeTopup(null); // otherwise a later top-up would resume straight into this stale payment
    setScreen('home');
  };

  const onPaymentComplete = (_payment, recipient) => {
    setHistoryKey((k) => k + 1);
    refreshSender(); // the balance was already debited server-side on submission
    if (recipient) upsertRecipient({ ...recipient, lastSentAt: Date.now() });
    setSendTo(null);
    setScreen('home');
  };

  const startSend = (recipient) => {
    setSendTo(recipient ?? null);
    setScreen('send');
  };

  // The Developer and Admin tabs each open a full, separate desktop page
  // rather than a cramped screen inside the phone. Developer reads the
  // cross-tab SwiftX/Lean X log (logStore.js); Admin reads Falcon's own
  // ledger (ledgerApi.js) — two different back-office audiences.
  const handleNavigate = (key) => {
    if (key === 'developer') {
      window.open('/developer.html', '_blank');
      return;
    }
    if (key === 'admin') {
      window.open('/admin.html', '_blank');
      return;
    }
    if (key === 'send') {
      startSend(null);
      return;
    }
    setScreen(key);
  };

  const ready = Boolean(userId) && displayCorridors.length > 0 && recipients !== null && sender !== null;

  return (
    <div className="shell">
      <div className="iphone">
        <div className="iphone-frame">
          <span className="side-btn mute" />
          <span className="side-btn vol-up" />
          <span className="side-btn vol-down" />
          <span className="side-btn power" />
          <div className="dynamic-island" />

          <div className="phone">
            <div className="status-bar">
              <span>{statusTime}</span>
              <div className="status-icons">
                <SignalIcon />
                <WifiIcon />
                <BatteryIcon />
              </div>
            </div>

            {error && (
              <div className="error-banner" style={{ margin: '12px 16px 0' }} onClick={() => setError(null)}>
                {error}
              </div>
            )}

            {!userId && <Onboarding onCreated={onOnboarded} setError={setError} />}

            {userId && !ready && (
              <div className="phone-screen">
                <div className="empty-state">
                  <span className="spinner dark" />
                  <span className="muted">Loading…</span>
                </div>
              </div>
            )}

            {ready && screen === 'home' && (
              <Home
                corridors={displayCorridors}
                recipients={visibleRecipients}
                recentPayments={recentPayments}
                sender={sender}
                onSendTo={startSend}
                onOpenProfile={() => setScreen('profile')}
                onTopUp={() => setScreen('topup')}
                onLogout={logout}
              />
            )}

            {ready && screen === 'topup' && (
              <TopUp
                userId={sender.id}
                resumePaymentId={resumeTopup?.paymentId}
                resumeAmount={resumeTopup?.amount}
                setError={setError}
                onExit={() => setScreen('home')}
                onComplete={onTopupComplete}
              />
            )}

            {ready && screen === 'send' && (
              <SendFlow
                corridors={displayCorridors}
                recipients={visibleRecipients}
                sender={sender}
                initialRecipient={sendTo}
                onRecipientSaved={upsertRecipient}
                setError={setError}
                onExit={() => {
                  setSendTo(null);
                  setScreen('home');
                }}
                onPaymentComplete={onPaymentComplete}
              />
            )}

            {ready && screen === 'history' && <History payments={recentPayments} corridors={displayCorridors} />}

            {ready && screen === 'profile' && (
              <Profile
                sender={sender}
                onBack={() => setScreen('home')}
                onVerified={refreshSender}
                setError={setError}
              />
            )}

            {ready && NAV_SCREENS.has(screen) && <BottomNav active={screen} onNavigate={handleNavigate} />}

            <div className="home-indicator-wrap">
              <div className="home-indicator" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
