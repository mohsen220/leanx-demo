import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { getLog, subscribeLog, clearLog } from './logStore.js';
import { BoltIcon, BankIcon, ShieldIcon, CheckIcon } from './icons.jsx';

// Every product this console can trace. `steps` is the always-visible
// reference integration flow — the sequence of things that happen for a
// clean run, laid out across three lanes (browser/LinkSDK, our backend,
// Lean's API) — independent of whether any traffic has happened yet. Each
// step's `category` is the same log category the matching real call is
// published under, so a selected run's calls can be overlaid onto the row
// they belong to. `backend: null` means this step never touches our
// backend at all (LinkSDK talks to Lean directly); `lean` on those rows is
// therefore always descriptive text, never overlaid — we have no way to
// capture that traffic.
const PRODUCTS = [
  {
    id: 'leanx',
    label: 'Lean X',
    sublabel: 'Cross-border transfers',
    icon: BoltIcon,
    steps: [
      { category: 'quote', browser: 'Customer picks a corridor and enters an amount', backend: 'POST /api/quotes', lean: 'POST /quote' },
      {
        category: 'validation',
        browser: 'Enters beneficiary bank details (India only)',
        backend: 'POST /api/validate-account',
        lean: 'POST /validate_account',
        optional: true,
      },
      { category: 'payment', browser: 'Reviews and confirms the transfer', backend: 'POST /api/payments', lean: 'POST /payment' },
      { category: 'payment-status', browser: 'Watches the live status timeline', backend: 'GET /api/payments/:id', lean: 'GET /payments/:id' },
    ],
  },
  {
    id: 'pbb-aof',
    label: 'Pay by Bank',
    sublabel: 'Account on File',
    icon: BankIcon,
    steps: [
      {
        category: 'aof-start',
        browser: 'Taps "Top up" and chooses Account on File',
        backend: 'POST /api/lean/aof/topup',
        lean: 'Checks for / creates a standing consent',
      },
      {
        category: 'sdk-authorizeConsent',
        browser: 'Lean.authorizeConsent() opens the bank redirect',
        backend: null,
        lean: 'Lean hosts the consent-authorization UI directly',
      },
      { category: 'aof-charge', browser: 'Callback reports SUCCESS', backend: 'POST /api/lean/aof/topup/charge', lean: 'POST /payments/v1/account-on-file' },
      { category: 'aof-status', browser: 'Polls for the result', backend: 'GET /api/lean/aof/topup/:id', lean: 'GET status' },
    ],
  },
  {
    id: 'pbb-sip',
    label: 'Pay by Bank',
    sublabel: 'Single Instant Payment',
    icon: BankIcon,
    steps: [
      {
        category: 'sip-start',
        browser: 'Taps "Top up" and chooses Single Instant Payment',
        backend: 'POST /api/lean/sip/topup',
        lean: 'POST /payments/v1/intents',
      },
      { category: 'sdk-checkout', browser: 'Lean.checkout() opens the bank redirect', backend: null, lean: 'Lean hosts the checkout UI directly' },
      { category: 'sip-status', browser: 'Polls for the result', backend: 'GET /api/lean/sip/topup/:id', lean: 'GET /payments/v1/intents/:id' },
    ],
  },
  {
    id: 'pbb-re',
    label: 'Pay by Bank',
    sublabel: 'Reverse Engineered',
    icon: BankIcon,
    steps: [
      {
        category: 're-start',
        browser: 'Taps "Top up" and chooses Reverse Engineered',
        backend: 'POST /api/lean/re/topup',
        lean: 'POST /payments/v1/destinations',
      },
      { category: 'sdk-connect', browser: 'Lean.connect() links the bank account', backend: null, lean: 'Lean hosts the connect UI directly' },
      { category: 'sdk-pay', browser: 'Lean.pay() executes the payment', backend: null, lean: 'Lean hosts the payment UI directly' },
      { category: 're-status', browser: 'Polls for the result', backend: 'GET /api/lean/re/topup/:id', lean: 'GET status' },
    ],
  },
  {
    id: 'consents',
    label: 'Consents',
    sublabel: 'CMI',
    icon: ShieldIcon,
    steps: [
      {
        category: 'consents-start',
        browser: 'Taps "Manage consents"',
        backend: 'POST /api/lean/consents/session',
        lean: 'Mints a customer-scoped access token',
      },
      { category: 'sdk-manageConsents', browser: 'Lean.manageConsents() opens the consent list', backend: null, lean: 'Lean hosts the CMI UI directly' },
    ],
  },
  {
    id: 'verify',
    label: 'Verification',
    sublabel: 'AVS',
    icon: CheckIcon,
    steps: [
      {
        category: 'verify-account',
        browser: 'Enters IBAN and account-holder name',
        backend: 'POST /api/lean/verify-account',
        lean: 'POST /verifications/v1/accounts',
      },
    ],
  },
];

const PRODUCTS_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

const STEP_LABELS = {
  quote: 'Get quote',
  validation: 'Validate account',
  payment: 'Send payment',
  'payment-status': 'Track status',
  balance: 'Check balance',
  corridors: 'Load corridors',
  system: 'Health check',
  history: 'Load history',
  other: 'API call',
  'aof-start': 'Start top-up (AoF)',
  'aof-charge': 'Charge consent',
  'aof-abandon': 'Abandon consent',
  'aof-status': 'Track status',
  'sip-start': 'Create payment intent (SIP)',
  'sip-status': 'Track status',
  're-start': 'Create payment intent (RE)',
  're-status': 'Track status',
  'sdk-authorizeConsent': 'Lean.authorizeConsent()',
  'sdk-checkout': 'Lean.checkout()',
  'sdk-connect': 'Lean.connect()',
  'sdk-pay': 'Lean.pay()',
  'sdk-captureRedirect': 'Lean.captureRedirect()',
  'consents-start': 'Start CMI session',
  'sdk-manageConsents': 'Lean.manageConsents()',
  'verify-account': 'Verify account (AVS)',
};

const UPSTREAM_TAG_LABEL = { 'lean-api': 'Lean API (real)', 'swiftx-api': 'SwiftX API (real)', 'mock-api': 'SwiftX API (mock)' };
const UPSTREAM_CATEGORIES = new Set(Object.keys(UPSTREAM_TAG_LABEL));

const BG_GROUP_LABEL = { 'home-visit': 'Home refresh', 'history-visit': 'History visit' };

const TOPUP_METHOD_LABEL = { aof: 'Account on File', sip: 'Single Instant Payment', re: 'Reverse Engineered' };

// AoF vs SIP vs RE, inferred from whichever categories actually show up in
// the group — cheaper than threading a separate "method" field through
// every call site just for the console's own display. Checked against both
// the REST categories (leanAofApi.js etc.) and the SDK-call categories
// (logSdkEvent in EnterTopupAmount.jsx/App.jsx), since either can be the
// first call logged for a given journey.
function topupMethodOf(calls) {
  if (calls.some((c) => c.category?.startsWith('aof') || c.category === 'sdk-authorizeConsent')) return 'aof';
  if (calls.some((c) => c.category?.startsWith('sip') || c.category === 'sdk-checkout')) return 'sip';
  if (calls.some((c) => c.category?.startsWith('re-') || c.category === 'sdk-connect' || c.category === 'sdk-pay')) {
    return 're';
  }
  return null;
}

// Buckets a journey's group id into one of the six product ids the nav is
// organized by, or a background/uncorrelated bucket. `topup-*` groups don't
// say which rail on their own — topupMethodOf inspects the categories that
// actually showed up to tell AoF/SIP/RE apart.
function classifyGroup(groupId, groupCalls) {
  if (!groupId) return 'ungrouped';
  if (groupId.startsWith('home-')) return 'home-visit';
  if (groupId.startsWith('history-')) return 'history-visit';
  if (groupId.startsWith('consents-')) return 'consents';
  if (groupId.startsWith('verify-')) return 'verify';
  if (groupId.startsWith('topup-')) return `pbb-${topupMethodOf(groupCalls) ?? 'aof'}`;
  return 'leanx';
}

function statusClass(status) {
  if (status == null) return 'pending';
  return status < 400 ? 'ok' : 'fail';
}

// One-line "what happened" summary for a call, used on run cards so a list
// of runs reads as real facts rather than a repeated generic label.
function summarize(call) {
  const p = call.payload;
  if (!p) return null;
  switch (call.category) {
    case 'quote':
      return `${call.body?.amount ?? p.amount} ${p.currency} → ${p.amount_destination} (rate ${p.rate})`;
    case 'validation':
      return `${p.status}${p.name ? ` — ${p.name}` : ''}`;
    case 'payment':
      return `accepted — ${p.status}`;
    case 'payment-status':
      return `${p.status}`;
    case 'balance':
      return `${p.balance?.toLocaleString?.() ?? p.balance} ${p.currency} available`;
    case 'history':
      return Array.isArray(p) ? `${p.length} record${p.length === 1 ? '' : 's'}` : null;
    case 'corridors':
      return Array.isArray(p) ? `${p.length} corridors` : null;
    case 'aof-start':
      return p.mode === 'instant' ? `instant — ${p.status}` : 'needs authorization — opening LinkSDK';
    case 'aof-charge':
    case 'aof-status':
    case 'sip-status':
    case 're-status':
      return p.status ? `${p.status}` : null;
    case 'aof-abandon':
      return p.ok ? 'consent abandoned' : null;
    case 'sip-start':
    case 're-start':
      return p.paymentIntentId ? `intent ${p.paymentIntentId.slice(0, 8)}… — opening LinkSDK` : null;
    case 'sdk-authorizeConsent':
    case 'sdk-checkout':
    case 'sdk-connect':
    case 'sdk-pay':
    case 'sdk-captureRedirect':
    case 'sdk-manageConsents':
      if (p.invoked) return 'widget opened';
      return p.status ? `callback → ${p.status}` : null;
    case 'consents-start':
      return p.customerId ? `customer ${p.customerId.slice(0, 8)}… — opening CMI` : null;
    case 'verify-account':
      if (!p.verifications) return null;
      return p.verifications.account_ownership_verified ? 'ownership verified' : 'not verified';
    default:
      return null;
  }
}

// The status pill needs a value with the same vocabulary as the payment-
// status enum (succeeded/failed/etc.) even for products whose payload
// doesn't carry a `status` field of its own.
function runStatusOf(product, calls) {
  if (product === 'verify') {
    const c = [...calls].reverse().find((c) => c.category === 'verify-account' && c.payload);
    if (!c) return null;
    return c.payload.verifications?.account_ownership_verified ? 'succeeded' : 'failed';
  }
  if (product === 'consents') {
    return calls.some((c) => c.status != null) ? (calls.every((c) => c.status == null || c.status < 400) ? 'succeeded' : 'failed') : null;
  }
  return [...calls].reverse().map((c) => c.payload?.status).find(Boolean) ?? null;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Regex-based JSON syntax highlighter — escapes first, then wraps already-
// escaped tokens in span tags, so nothing from the payload can inject markup.
function highlightJson(value) {
  if (value === undefined) return '<span style="opacity:.5">— no payload —</span>';
  const escaped = escapeHtml(JSON.stringify(value, null, 2));
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'n';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'k' : 's';
      else if (/true|false|null/.test(match)) cls = 'b';
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function toCurl(call) {
  const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4100';
  let cmd = `curl -X ${call.method} '${base}${call.path}'`;
  if (call.body !== undefined) cmd += ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(call.body)}'`;
  return cmd;
}

function formatDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Rebuilds one run's flat call list into rows keyed by category — polling
// (many consecutive calls, same category) collapses into one row keeping
// every call so "called N×" and the final outcome both stay visible; any
// `_upstream` calls a route made are attached as children of the row that
// triggered them, since they were recorded strictly in between that row's
// request and the next one's.
function buildRunRows(runCalls) {
  const rows = [];
  for (const call of runCalls) {
    if (UPSTREAM_CATEGORIES.has(call.category)) {
      if (rows.length) rows[rows.length - 1].upstream.push(call);
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && last.category === call.category) last.calls.push(call);
    else rows.push({ category: call.category, calls: [call], upstream: [] });
  }
  return rows;
}

function buildGroups(calls) {
  const groups = new Map();
  const flat = [];
  for (const call of calls) {
    if (call.group) {
      if (!groups.has(call.group)) groups.set(call.group, []);
      groups.get(call.group).push(call);
    } else {
      flat.push(call);
    }
  }
  const built = [...groups.entries()].map(([id, groupCalls]) => {
    const chronological = [...groupCalls].reverse();
    const product = classifyGroup(id, chronological);
    const country = chronological.map((c) => c.body?.country ?? c.payload?.country).find(Boolean);
    return {
      id,
      product,
      calls: chronological,
      country,
      status: runStatusOf(product, chronological),
      startTime: chronological[0]?.time,
      endTime: chronological[chronological.length - 1]?.time,
    };
  });
  built.sort((a, b) => b.startTime - a.startTime);

  const runsByProduct = new Map();
  const bgGroups = [];
  for (const g of built) {
    if (PRODUCTS_BY_ID[g.product]) {
      if (!runsByProduct.has(g.product)) runsByProduct.set(g.product, []);
      runsByProduct.get(g.product).push(g);
    } else if (g.product !== 'ungrouped') {
      bgGroups.push(g);
    }
  }
  return { runsByProduct, bgGroups, standalone: flat };
}

export function DeveloperConsole() {
  const [calls, setCalls] = useState(() => getLog());
  const [corridors, setCorridors] = useState([]);
  const [mockMode, setMockMode] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState('leanx');
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [bgOpen, setBgOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => subscribeLog(setCalls), []);

  useEffect(() => {
    api.getCorridors().then(setCorridors).catch(() => {});
    api.getHealth().then((h) => setMockMode(h.mockMode)).catch(() => {});
  }, []);

  const corridorByCode = useMemo(() => Object.fromEntries(corridors.map((c) => [c.code, c])), [corridors]);
  const { runsByProduct, bgGroups, standalone } = useMemo(() => buildGroups(calls), [calls]);

  const selectProduct = (id) => {
    setSelectedProduct(id);
    setSelectedRunId(null);
    setExpandedCategory(null);
    setSearch('');
  };

  const product = PRODUCTS_BY_ID[selectedProduct];
  const allRuns = runsByProduct.get(selectedProduct) ?? [];
  const q = search.trim().toLowerCase();
  const runs = q
    ? allRuns.filter((run) => {
        const corridor = corridorByCode[run.country];
        return [corridor?.name, corridor?.code, ...run.calls.map((c) => `${c.path} ${JSON.stringify(c.body ?? '')} ${JSON.stringify(c.payload ?? '')}`)]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
    : allRuns;

  const selectedRun = selectedRunId ? allRuns.find((r) => r.id === selectedRunId) ?? null : null;
  const rowsByCategory = useMemo(() => {
    if (!selectedRun) return null;
    return new Map(buildRunRows(selectedRun.calls).map((r) => [r.category, r]));
  }, [selectedRun]);

  const extraRows = useMemo(() => {
    if (!selectedRun || !rowsByCategory) return [];
    const known = new Set(product.steps.map((s) => s.category));
    return [...rowsByCategory.values()].filter((r) => !known.has(r.category));
  }, [selectedRun, rowsByCategory, product]);

  const stats = useMemo(() => {
    const withStatus = calls.filter((c) => c.status != null);
    const ok = withStatus.filter((c) => c.status < 400).length;
    const totalRuns = [...runsByProduct.values()].reduce((n, arr) => n + arr.length, 0);
    const upstream = calls.filter((c) => UPSTREAM_CATEGORIES.has(c.category)).length;
    return {
      totalRuns,
      total: calls.length,
      upstream,
      successRate: withStatus.length ? Math.round((ok / withStatus.length) * 100) : null,
    };
  }, [calls, runsByProduct]);

  const toggleCategory = (category) => setExpandedCategory((prev) => (prev === category ? null : category));

  const renderCallDetail = (call, label) => (
    <div className="dc-section" key={`${label}-req`}>
      <div className="dc-section-head">
        <span className="dc-section-title">{label} — Request</span>
        <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(call.body ?? {}, null, 2))}>
          Copy JSON
        </button>
      </div>
      <pre className="dc-pre" dangerouslySetInnerHTML={{ __html: highlightJson(call.body) }} />
      <div className="dc-section-head" style={{ marginTop: 12 }}>
        <span className="dc-section-title">{label} — Response</span>
        <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(call.payload ?? {}, null, 2))}>
          Copy JSON
        </button>
      </div>
      <pre className="dc-pre" dangerouslySetInnerHTML={{ __html: highlightJson(call.payload) }} />
      {call.method !== 'SDK' && !UPSTREAM_CATEGORIES.has(call.category) && (
        <div className="dc-section-head" style={{ marginTop: 12 }}>
          <span className="dc-section-title">Reproduce</span>
          <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(toCurl(call))}>
            Copy cURL
          </button>
        </div>
      )}
      {call.method !== 'SDK' && !UPSTREAM_CATEGORIES.has(call.category) && <pre className="dc-pre">{toCurl(call)}</pre>}
    </div>
  );

  const renderFlowRow = (step) => {
    const row = rowsByCategory?.get(step.category) ?? null;
    const isSdkStep = step.category.startsWith('sdk-');
    const isOpen = expandedCategory === step.category;
    const missing = selectedRun && !row;

    let browserCell;
    if (isSdkStep && row) {
      const finalCall = row.calls[row.calls.length - 1];
      const eventNote = row.calls.length > 1 ? ` · ${row.calls.length} SDK events` : '';
      browserCell = (
        <button className="dc-flow-cell filled" onClick={() => toggleCategory(step.category)}>
          <span className={`dc-flow-cell-status ${statusClass(finalCall.status)}`}>{finalCall.status ?? '···'}</span>
          <span className="dc-flow-cell-text">
            {finalCall.path}
            {eventNote}
          </span>
          <span className="dc-flow-cell-summary">{summarize(finalCall)}</span>
        </button>
      );
    } else {
      browserCell = <div className="dc-flow-cell placeholder">{step.browser}</div>;
    }

    let backendCell;
    if (step.backend === null) {
      backendCell = <div className="dc-flow-cell empty">—</div>;
    } else if (row && !isSdkStep) {
      const finalCall = row.calls[row.calls.length - 1];
      const pollNote = row.calls.length > 1 ? ` · polled ${row.calls.length}×` : '';
      backendCell = (
        <button className="dc-flow-cell filled" onClick={() => toggleCategory(step.category)}>
          <span className={`dc-flow-cell-status ${statusClass(finalCall.status)}`}>{finalCall.status ?? '···'}</span>
          <span className="dc-flow-cell-text">
            {finalCall.method} {finalCall.path}
            {pollNote}
          </span>
          <span className="dc-flow-cell-summary">{finalCall.duration != null ? formatDuration(finalCall.duration) : ''}</span>
        </button>
      );
    } else if (missing) {
      backendCell = <div className="dc-flow-cell not-reached">{step.optional ? 'skipped this run' : 'not reached'}</div>;
    } else {
      backendCell = <div className="dc-flow-cell placeholder">{step.backend}</div>;
    }

    let leanCell;
    if (isSdkStep) {
      leanCell = <div className="dc-flow-cell placeholder muted">{step.lean}</div>;
    } else if (row && row.upstream.length > 0) {
      leanCell = (
        <button className="dc-flow-cell filled" onClick={() => toggleCategory(step.category)}>
          {row.upstream.map((u) => (
            <span className="dc-flow-cell-upstream" key={u.id}>
              <span className={`dc-flow-cell-status ${statusClass(u.status)}`}>{u.status ?? '···'}</span>
              <span className="dc-flow-cell-text">
                {u.method} {u.path}
              </span>
              <span className="dc-flow-cell-tag">{UPSTREAM_TAG_LABEL[u.category]}</span>
            </span>
          ))}
        </button>
      );
    } else if (missing) {
      leanCell = <div className="dc-flow-cell not-reached">{step.optional ? 'skipped this run' : 'not reached'}</div>;
    } else if (row) {
      leanCell = <div className="dc-flow-cell not-reached">no upstream call captured</div>;
    } else {
      leanCell = <div className="dc-flow-cell placeholder">{step.lean}</div>;
    }

    return (
      <div className="dc-flow-row-group" key={step.category}>
        <div className="dc-flow-row">
          {browserCell}
          {backendCell}
          {leanCell}
        </div>
        {isOpen && row && (
          <div className="dc-flow-detail">
            {!isSdkStep && row.calls.map((c, i) => renderCallDetail(c, row.calls.length > 1 ? `Your backend (call ${i + 1})` : 'Your backend'))}
            {isSdkStep && row.calls.map((c, i) => renderCallDetail(c, row.calls.length > 1 ? `Lean.${step.category.replace('sdk-', '')}() (event ${i + 1})` : `Lean.${step.category.replace('sdk-', '')}()`))}
            {row.upstream.map((u) => renderCallDetail(u, UPSTREAM_TAG_LABEL[u.category]))}
          </div>
        )}
      </div>
    );
  };

  const runHeadline = (run) => {
    if (run.product === 'leanx') {
      const corridor = corridorByCode[run.country];
      return { flag: corridor?.flag ?? '🌐', name: corridor?.name ?? 'Transfer' };
    }
    if (run.product.startsWith('pbb-')) return { flag: null, name: TOPUP_METHOD_LABEL[run.product.slice(4)] ?? 'Top-up' };
    if (run.product === 'consents') return { flag: null, name: 'Consent session' };
    if (run.product === 'verify') return { flag: null, name: 'Account verification' };
    return { flag: null, name: 'Run' };
  };

  const bgCount = bgGroups.length + (standalone.length ? 1 : 0);
  const bgSelected = selectedProduct === '__bg__';

  return (
    <div className="dc-root">
      <header className="dc-header">
        <div className="dc-header-left">
          <BoltIcon width={20} height={20} />
          <h1>Meridian Developer Console</h1>
          {mockMode !== null && (
            <span className={`dc-mode-badge ${mockMode ? 'mock' : 'real'}`}>{mockMode ? 'Mock mode' : 'Real sandbox'}</span>
          )}
        </div>
        <div className="dc-header-right">
          <button
            className="dc-btn danger"
            onClick={() => {
              clearLog();
              setSelectedRunId(null);
            }}
          >
            Clear log
          </button>
        </div>
      </header>

      <div className="dc-stats">
        <div className="dc-stat">
          <span className="n">{stats.totalRuns}</span>
          <span className="lbl">Runs traced</span>
        </div>
        <div className="dc-stat">
          <span className="n">{stats.total}</span>
          <span className="lbl">Total API calls</span>
        </div>
        <div className="dc-stat">
          <span className="n">{stats.upstream}</span>
          <span className="lbl">Upstream Lean calls</span>
        </div>
        <div className="dc-stat">
          <span className="n">{stats.successRate == null ? '—' : `${stats.successRate}%`}</span>
          <span className="lbl">Success rate</span>
        </div>
      </div>

      <div className="dc-body">
        <aside className="dc-journeys">
          <div className="dc-section-label">Products</div>
          {PRODUCTS.map((p) => {
            const Icon = p.icon;
            const count = (runsByProduct.get(p.id) ?? []).length;
            return (
              <button
                key={p.id}
                className={`dc-product-nav-item ${selectedProduct === p.id ? 'selected' : ''}`}
                onClick={() => selectProduct(p.id)}
              >
                <Icon width={16} height={16} />
                <span className="dc-product-nav-text">
                  <span className="dc-product-nav-label">{p.label}</span>
                  <span className="dc-product-nav-sub">{p.sublabel}</span>
                </span>
                <span className="dc-product-nav-count">{count}</span>
              </button>
            );
          })}

          <button className={`dc-bg-toggle ${bgOpen ? 'open' : ''}`} onClick={() => setBgOpen((v) => !v)}>
            <svg className="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M9 6l6 6-6 6" />
            </svg>
            Background activity ({bgCount})
          </button>

          {bgOpen && (
            <>
              <div className="dc-bg-note">
                Not a user journey — page loads and screen visits (corridor list, balance checks, history lookups).
              </div>
              {bgGroups.map((group) => (
                <button
                  key={group.id}
                  className={`dc-bg-item ${selectedProduct === group.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedProduct(group.id);
                    setSelectedRunId(null);
                    setExpandedCategory(null);
                  }}
                >
                  <span>{BG_GROUP_LABEL[group.product] ?? 'Other activity'}</span>
                  <span className="count">{group.calls.length}</span>
                </button>
              ))}
              {standalone.length > 0 && (
                <button className={`dc-bg-item ${bgSelected ? 'selected' : ''}`} onClick={() => selectProduct('__bg__')}>
                  <span>Other (uncorrelated) calls</span>
                  <span className="count">{standalone.length}</span>
                </button>
              )}
            </>
          )}
        </aside>

        <section className="dc-trace">
          {product && (
            <>
              <div className="dc-product-head">
                <product.icon width={22} height={22} />
                <div>
                  <h2>{product.label}</h2>
                  <div className="dc-product-head-sub">{product.sublabel}</div>
                </div>
                {selectedRun && (
                  <button className="dc-btn" onClick={() => setSelectedRunId(null)}>
                    Clear overlay
                  </button>
                )}
              </div>

              <div className="dc-flow">
                <div className="dc-flow-row-group">
                  <div className="dc-flow-row dc-flow-headrow">
                    <div className="dc-flow-lanehead">Browser / LinkSDK</div>
                    <div className="dc-flow-lanehead">Your backend</div>
                    <div className="dc-flow-lanehead">Lean API</div>
                  </div>
                </div>
                {product.steps.map(renderFlowRow)}
                {extraRows.length > 0 && (
                  <div className="dc-flow-extra-note">
                    Also observed in this run: {extraRows.map((r) => STEP_LABELS[r.category] ?? r.category).join(', ')}
                  </div>
                )}
              </div>

              <div className="dc-runs">
                <div className="dc-runs-head">
                  <div className="dc-section-label" style={{ margin: 0 }}>
                    Recent runs ({runs.length})
                  </div>
                  <input
                    className="dc-search dc-runs-search"
                    placeholder="Search corridor, field, value…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {runs.length === 0 && (
                  <div className="dc-empty-note">No runs yet — use this product in the app to see one traced here, live.</div>
                )}
                <div className="dc-runs-list">
                  {runs.map((run) => {
                    const { flag, name } = runHeadline(run);
                    return (
                      <button
                        key={run.id}
                        className={`dc-run-card ${selectedRunId === run.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedRunId((prev) => (prev === run.id ? null : run.id));
                          setExpandedCategory(null);
                        }}
                      >
                        <div className="dc-journey-top">
                          {flag && <span className="flag">{flag}</span>}
                          <span className="name">{name}</span>
                          <span className={`dc-status-pill ${run.status ?? 'pending'}`}>{run.status ?? 'in progress'}</span>
                        </div>
                        <div className="dc-journey-meta">
                          {new Date(run.startTime).toLocaleTimeString()} · {run.calls.length} calls · {formatDuration(run.endTime - run.startTime)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {selectedProduct === '__bg__' && (
            <>
              <div className="dc-product-head">
                <h2>Other (uncorrelated) calls</h2>
              </div>
              <ol className="dc-timeline">
                {standalone.map((call) => (
                  <li className="dc-step" key={call.id}>
                    <div className="dc-step-rail">
                      <div className={`dc-step-marker ${statusClass(call.status)}`}>·</div>
                    </div>
                    <div className="dc-step-body">
                      <div className="dc-step-label">{STEP_LABELS[call.category] ?? call.path}</div>
                      <div className="dc-step-endpoint">
                        {call.method} {call.path}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {bgGroups.some((g) => g.id === selectedProduct) &&
            (() => {
              const group = bgGroups.find((g) => g.id === selectedProduct);
              return (
                <>
                  <div className="dc-product-head">
                    <h2>{BG_GROUP_LABEL[group.product] ?? 'Other activity'}</h2>
                  </div>
                  <ol className="dc-timeline">
                    {group.calls.map((call) => (
                      <li className="dc-step" key={call.id}>
                        <div className="dc-step-rail">
                          <div className={`dc-step-marker ${statusClass(call.status)}`}>·</div>
                        </div>
                        <div className="dc-step-body">
                          <div className="dc-step-label">{STEP_LABELS[call.category] ?? call.path}</div>
                          <div className="dc-step-endpoint">
                            {call.method} {call.path}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              );
            })()}
        </section>
      </div>
    </div>
  );
}
