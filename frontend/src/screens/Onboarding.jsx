import { useState } from 'react';
import { ledgerApi } from '../ledgerApi.js';
import { brand } from '../brand.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One form for both sign-up and sign-in — this is Falcon's own ledger only,
// nothing here talks to Lean. That relationship starts later, the first
// time this customer tops up (backend/src/routes/leanPay.js), which is the
// point: Lean only enters the picture when money actually needs to move.
export function Onboarding({ onCreated, setError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = EMAIL_RE.test(email.trim()) && password.length > 0;

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const user = await ledgerApi.login(email.trim().toLowerCase(), password);
      onCreated(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="phone-screen" style={{ justifyContent: 'space-between', flex: 1 }}>
      <div>
        <div style={{ textAlign: 'center', padding: '32px 0 12px' }}>
          <div className="brand-mark" style={{ margin: '0 auto 14px' }}>
            {brand.initials}
          </div>
          <h2 style={{ margin: 0 }}>{brand.name}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{brand.tagline}</p>
        </div>

        <label className="field">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. john@example.com"
            autoFocus
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. test123"
          />
        </label>
      </div>

      <div>
        <button className="btn btn-primary" disabled={loading || !valid} onClick={submit}>
          {loading ? <span className="spinner" /> : 'Continue'}
        </button>
      </div>
    </div>
  );
}
