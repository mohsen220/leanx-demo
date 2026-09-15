import { Router } from 'express';
import { db, newId } from '../db.js';

export const usersRouter = Router();

// Demo-only credential store — plaintext is fine here (fake sandbox data,
// no real accounts), but there's no reason to ever hand it back over the
// wire, so every response strips it.
function stripPassword(user) {
  const { password, ...safe } = user;
  return safe;
}

function displayNameFromEmail(email) {
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Admin dashboard: every customer, so it can list balances.
usersRouter.get('/users', (_req, res) => {
  res.json(db.users.all().map(stripPassword));
});

// One endpoint for both sign-up and sign-in — purely Falcon's own ledger,
// no Lean customer is created here. Lean only enters the picture the first
// time this customer tops up (see routes/leanPay.js's ensureLeanCustomer).
// A brand-new email creates an account with balance 0 on purpose: nothing
// to send until it's funded, which is the point of the demo.
usersRouter.post('/users/login', (req, res) => {
  const email = (req.body.email ?? '').trim().toLowerCase();
  const password = req.body.password ?? '';
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const existing = db.users.all().find((u) => u.email === email);
  if (existing) {
    if (existing.password !== password) return res.status(401).json({ error: 'Incorrect password' });
    return res.json(stripPassword(existing));
  }

  const id = newId();
  const user = {
    id,
    email,
    password,
    sender_name: displayNameFromEmail(email),
    sender_birthdate: '1990-01-01',
    sender_country: 'ARE',
    sender_city: 'Dubai',
    sender_address: 'Business Bay',
    sender_mobile: `+9715${id.replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
    sender_identity_doc_type: 'idcard',
    sender_identity_doc: `DEMO-${id.slice(0, 8).toUpperCase()}`,
    sender_identity_doc_exp: '2028-01-01',
    sender_identity_doc_country: 'ARE',
    verifiedAt: new Date().toISOString().slice(0, 10),
    balance: 0,
    createdAt: new Date().toISOString(),
  };
  db.users.insert(user);
  res.status(201).json(stripPassword(user));
});

usersRouter.get('/users/:id', (req, res) => {
  const user = db.users.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(stripPassword(user));
});

// A customer topping up their Falcon balance — separate from anything SwiftX
// sees, since that's a Falcon-held float, not a Lean X wallet operation.
usersRouter.post('/users/:id/topup', (req, res) => {
  const user = db.users.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const amount = Number(req.body.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be a positive number' });

  const updated = db.users.update(user.id, { balance: Math.round((user.balance + amount) * 100) / 100 });
  res.json(stripPassword(updated));
});
