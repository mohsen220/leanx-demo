// Falcon's own back-office records — customers, saved recipients, and the
// transaction ledger. This is deliberately separate from SwiftX/Lean X: the
// rail never sees a customer's name, balance, or transaction history, only
// the corridor/quote/payment calls we choose to make. A real exchange house
// keeps exactly this kind of ledger in its own database; here it's a single
// JSON file so the demo needs zero extra services or native dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CORRIDORS } from './corridors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'store.json');

const DEMO_USER_ID = 'u_rahul';

// One seeded customer, plus one saved recipient per corridor pulled from the
// same sandbox-documented sample data the send flow pre-fills — so the local
// ledger and the SwiftX-facing forms always agree on who "Arun Kumar" is.
function seed() {
  const relationFor = { IND: 'brother', PAK: 'father', NGA: 'wife' };
  const recipients = {};
  for (const c of CORRIDORS) {
    const id = `seed-${c.code}`;
    recipients[id] = {
      id,
      userId: DEMO_USER_ID,
      corridorCode: c.code,
      name: c.sample.beneficiary_name,
      relation: relationFor[c.code] ?? 'other',
      lastSentAt: null,
      details: {
        bank_name: c.sample.bank_name,
        ...(c.identifierField ? { [c.identifierField]: c.sample[c.identifierField] } : {}),
        ...(c.hasAccountType ? { beneficiary_account_type: c.sample.beneficiary_account_type } : {}),
        beneficiary_name: c.sample.beneficiary_name,
        beneficiary_account_number: c.sample.beneficiary_account_number,
        beneficiary_city: c.sample.beneficiary_city,
        beneficiary_address: c.sample.beneficiary_address,
        beneficiary_mobile: c.sample.beneficiary_mobile,
      },
    };
  }

  return {
    users: {
      [DEMO_USER_ID]: {
        id: DEMO_USER_ID,
        // Everything below (except id/balance/verifiedAt/createdAt) is spread
        // straight into every payment's sender_* fields — see ReviewAndSend.jsx.
        sender_name: 'Rahul Menon',
        sender_birthdate: '1993-05-12',
        sender_country: 'ARE',
        sender_city: 'Dubai',
        sender_address: 'Deira Naif Road',
        sender_mobile: '+971554221334',
        sender_identity_doc_type: 'idcard',
        sender_identity_doc: 'P384910223',
        sender_identity_doc_exp: '2027-11-14',
        sender_identity_doc_country: 'ARE',
        verifiedAt: '2026-08-14',
        balance: 5000,
        createdAt: new Date().toISOString(),
      },
    },
    recipients,
    transactions: {},
    // Singleton config rows, e.g. the Lean Pay collection destination id
    // (created once, reused by every top-up) — keyed like any other
    // collection so it gets the same get/insert/update helpers.
    settings: {},
  };
}

function persist(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // Migration for stores written before a collection existed.
    data.settings ??= {};
    return { data, fresh: false };
  } catch {
    const data = seed();
    persist(data);
    return { data, fresh: true };
  }
}

const { data, fresh } = load();
console.log(
  fresh
    ? `💾 Local ledger seeded at ${DB_PATH}`
    : `💾 Local ledger loaded from ${DB_PATH} (${Object.keys(data.transactions).length} transaction(s))`,
);

function collection(name) {
  return {
    all: () => Object.values(data[name]),
    get: (id) => data[name][id] ?? null,
    insert: (row) => {
      data[name][row.id] = row;
      persist(data);
      return row;
    },
    update: (id, patch) => {
      if (!data[name][id]) return null;
      data[name][id] = { ...data[name][id], ...patch };
      persist(data);
      return data[name][id];
    },
  };
}

export const db = {
  users: collection('users'),
  recipients: collection('recipients'),
  transactions: collection('transactions'),
  settings: collection('settings'),
};

export function newId() {
  return crypto.randomUUID();
}

export { DEMO_USER_ID };
