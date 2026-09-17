import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { getLog, subscribeLog, clearLog } from './logStore.js';
import { BoltIcon, BankIcon } from './icons.jsx';

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
};

const TOPUP_METHOD_LABEL = { aof: 'Account on File', sip: 'Single Instant Payment', re: 'Reverse Engineered' };
// The rail-level grouping the customer actually chose between: AoF and SIP
// are both Open Finance under the hood, RE is the separate mechanism.
const TOPUP_RAIL_LABEL = { aof: 'OF', sip: 'OF', re: 'RE' };

function classifyGroup(groupId) {
  if (!groupId) return 'ungrouped';
  if (groupId.startsWith('home-')) return 'home-visit';
  if (groupId.startsWith('history-')) return 'history-visit';
  if (groupId.startsWith('topup-')) return 'topup';
  return 'transfer';
}

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

function statusClass(status) {
  if (status == null) return 'pending';
  return status < 400 ? 'ok' : 'fail';
}

// One-line "what happened" summary per call, so a journey reads top-to-bottom
// without needing to open every step — the whole point being asked for here.
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
      if (p.invoked) return 'widget opened';
      return p.status ? `callback → ${p.status}` : null;
    default:
      return null;
  }
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

// Status polling repeats the same GET dozens of times — collapse consecutive
// same path+method calls into one step, keeping the latest as the result.
function collapseConsecutivePolls(calls) {
  const runs = [];
  for (const call of calls) {
    const last = runs[runs.length - 1];
    if (last && last[0].path === call.path && last[0].method === call.method) last.push(call);
    else runs.push([call]);
  }
  return runs;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
    const kind = classifyGroup(id);
    const country = chronological.map((c) => c.body?.country ?? c.payload?.country).find(Boolean);
    const status = [...chronological].reverse().map((c) => c.payload?.status).find(Boolean);
    const method = kind === 'topup' ? topupMethodOf(chronological) : null;
    return {
      id,
      kind,
      calls: chronological,
      country,
      status,
      method,
      startTime: chronological[0]?.time,
      endTime: chronological[chronological.length - 1]?.time,
    };
  });
  built.sort((a, b) => b.startTime - a.startTime);
  return {
    transferGroups: built.filter((g) => g.kind === 'transfer'),
    topupGroups: built.filter((g) => g.kind === 'topup'),
    bgGroups: built.filter((g) => g.kind !== 'transfer' && g.kind !== 'topup'),
    standalone: flat,
  };
}

export function DeveloperConsole() {
  const [calls, setCalls] = useState(() => getLog());
  const [corridors, setCorridors] = useState([]);
  const [mockMode, setMockMode] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [bgOpen, setBgOpen] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState(() => new Set());

  useEffect(() => subscribeLog(setCalls), []);

  useEffect(() => {
    api.getCorridors().then(setCorridors).catch(() => {});
    api.getHealth().then((h) => setMockMode(h.mockMode)).catch(() => {});
  }, []);

  const corridorByCode = useMemo(() => Object.fromEntries(corridors.map((c) => [c.code, c])), [corridors]);
  const { transferGroups, topupGroups, bgGroups, standalone } = useMemo(() => buildGroups(calls), [calls]);

  const q = search.trim().toLowerCase();
  const haystackOf = (group) => {
    const corridor = corridorByCode[group.country];
    return [corridor?.name, corridor?.code, group.method, ...group.calls.map((c) => `${c.path} ${JSON.stringify(c.body ?? '')} ${JSON.stringify(c.payload ?? '')}`)]
      .join(' ')
      .toLowerCase();
  };
  const visibleTransfers = q ? transferGroups.filter((g) => haystackOf(g).includes(q)) : transferGroups;
  const visibleTopups = q ? topupGroups.filter((g) => haystackOf(g).includes(q)) : topupGroups;
  const visibleBg = q ? bgGroups.filter((g) => haystackOf(g).includes(q)) : bgGroups;

  const selectedGroup = [...transferGroups, ...topupGroups, ...bgGroups].find((g) => g.id === selectedId) ?? null;
  const standaloneSelected = selectedId === '__standalone__';

  const toggleStep = (id) =>
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stats = useMemo(() => {
    const withStatus = calls.filter((c) => c.status != null);
    const ok = withStatus.filter((c) => c.status < 400).length;
    return {
      total: calls.length,
      successRate: withStatus.length ? Math.round((ok / withStatus.length) * 100) : null,
      transfers: transferGroups.length,
      topups: topupGroups.length,
    };
  }, [calls, transferGroups, topupGroups]);

  const renderTrace = (title, icon, statusPill, traceCalls) => {
    const steps = collapseConsecutivePolls(traceCalls);
    const start = traceCalls[0]?.time;
    const end = traceCalls[traceCalls.length - 1]?.time;
    return (
      <>
        <div className="dc-trace-head">
          {icon && <span className="flag">{icon}</span>}
          <h2>{title}</h2>
          {statusPill}
        </div>
        <div className="dc-trace-meta">
          <span>
            <b>Started</b> {new Date(start).toLocaleTimeString()}
          </span>
          <span>
            <b>Duration</b> {formatDuration(end - start)}
          </span>
          <span>
            <b>API calls</b> {traceCalls.length}
          </span>
        </div>

        <ol className="dc-timeline">
          {steps.map((run, i) => {
            const call = run[run.length - 1];
            const first = run[0];
            const isOpen = expandedSteps.has(first.id);
            const summary = summarize(call);
            const label = STEP_LABELS[call.category] ?? call.path;
            return (
              <li className="dc-step" key={first.id}>
                <div className="dc-step-rail">
                  <div className={`dc-step-marker ${statusClass(call.status)}`}>{i + 1}</div>
                  {i < steps.length - 1 && <div className="dc-step-line" />}
                </div>
                <div className="dc-step-body">
                  <button className="dc-step-head" onClick={() => toggleStep(first.id)}>
                    <div>
                      <div className="dc-step-label">
                        {label}
                        {run.length > 1 ? ` · called ${run.length}×` : ''}
                      </div>
                      <div className="dc-step-endpoint">
                        {first.method} {first.path}
                      </div>
                    </div>
                    <span className={`dc-step-status ${statusClass(call.status)}`}>{call.status ?? '···'}</span>
                    <span className="dc-step-duration">{call.duration != null ? `${call.duration}ms` : ''}</span>
                  </button>

                  {summary && <div className="dc-step-summary">→ {summary}</div>}

                  {isOpen && (
                    <div className="dc-step-detail">
                      <div className="dc-section">
                        <div className="dc-section-head">
                          <span className="dc-section-title">Request</span>
                          <button
                            className="dc-copy-btn"
                            onClick={() => navigator.clipboard?.writeText(JSON.stringify(first.body ?? {}, null, 2))}
                          >
                            Copy JSON
                          </button>
                        </div>
                        <pre className="dc-pre" dangerouslySetInnerHTML={{ __html: highlightJson(first.body) }} />
                      </div>
                      <div className="dc-section">
                        <div className="dc-section-head">
                          <span className="dc-section-title">
                            Response {run.length > 1 ? '(final)' : ''}
                          </span>
                          <button
                            className="dc-copy-btn"
                            onClick={() => navigator.clipboard?.writeText(JSON.stringify(call.payload ?? {}, null, 2))}
                          >
                            Copy JSON
                          </button>
                        </div>
                        <pre className="dc-pre" dangerouslySetInnerHTML={{ __html: highlightJson(call.payload) }} />
                      </div>
                      <div className="dc-section">
                        <div className="dc-section-head">
                          <span className="dc-section-title">Reproduce</span>
                          <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(toCurl(first))}>
                            Copy cURL
                          </button>
                        </div>
                        <pre className="dc-pre">{toCurl(first)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </>
    );
  };

  return (
    <div className="dc-root">
      <header className="dc-header">
        <div className="dc-header-left">
          <BoltIcon width={20} height={20} />
          <h1>Lean X Developer Console</h1>
          {mockMode !== null && (
            <span className={`dc-mode-badge ${mockMode ? 'mock' : 'real'}`}>{mockMode ? 'Mock mode' : 'Real sandbox'}</span>
          )}
        </div>
        <div className="dc-header-right">
          <button
            className="dc-btn danger"
            onClick={() => {
              clearLog();
              setSelectedId(null);
            }}
          >
            Clear log
          </button>
        </div>
      </header>

      <div className="dc-stats">
        <div className="dc-stat">
          <span className="n">{stats.transfers}</span>
          <span className="lbl">Transfers traced</span>
        </div>
        <div className="dc-stat">
          <span className="n">{stats.topups}</span>
          <span className="lbl">Top-ups traced</span>
        </div>
        <div className="dc-stat">
          <span className="n">{stats.total}</span>
          <span className="lbl">Total API calls</span>
        </div>
        <div className="dc-stat">
          <span className="n">{stats.successRate == null ? '—' : `${stats.successRate}%`}</span>
          <span className="lbl">Success rate</span>
        </div>
      </div>

      <div className="dc-body">
        <aside className="dc-journeys">
          <input className="dc-search" placeholder="Search corridor, field, value…" value={search} onChange={(e) => setSearch(e.target.value)} />

          <div className="dc-section-label">Journeys — end-to-end transfers ({visibleTransfers.length})</div>
          {visibleTransfers.length === 0 && (
            <div className="dc-empty-note">No transfers yet. Send money in the app to see one traced here, live.</div>
          )}
          {visibleTransfers.map((group) => {
            const corridor = corridorByCode[group.country];
            return (
              <button
                key={group.id}
                className={`dc-journey-card ${selectedId === group.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(group.id)}
              >
                <div className="dc-journey-top">
                  <span className="flag">{corridor?.flag ?? '🌐'}</span>
                  <span className="name">{corridor?.name ?? 'Transfer'}</span>
                  <span className={`dc-status-pill ${group.status ?? 'pending'}`}>{group.status ?? 'in progress'}</span>
                </div>
                <div className="dc-journey-meta">
                  {new Date(group.startTime).toLocaleTimeString()} · {group.calls.length} calls · {formatDuration(group.endTime - group.startTime)}
                </div>
              </button>
            );
          })}

          <div className="dc-section-label">Top-ups — OF &amp; RE ({visibleTopups.length})</div>
          {visibleTopups.length === 0 && (
            <div className="dc-empty-note">No top-ups yet. Top up your balance in the app to see one traced here, live.</div>
          )}
          {visibleTopups.map((group) => (
            <button
              key={group.id}
              className={`dc-journey-card ${selectedId === group.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(group.id)}
            >
              <div className="dc-journey-top">
                <BankIcon width={16} height={16} />
                {group.method && <span className="dc-rail-badge">{TOPUP_RAIL_LABEL[group.method]}</span>}
                <span className="name">{group.method ? TOPUP_METHOD_LABEL[group.method] : 'Top-up'}</span>
                <span className={`dc-status-pill ${group.status ?? 'pending'}`}>{group.status ?? 'in progress'}</span>
              </div>
              <div className="dc-journey-meta">
                {new Date(group.startTime).toLocaleTimeString()} · {group.calls.length} calls · {formatDuration(group.endTime - group.startTime)}
              </div>
            </button>
          ))}

          <button className={`dc-bg-toggle ${bgOpen ? 'open' : ''}`} onClick={() => setBgOpen((v) => !v)}>
            <svg className="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M9 6l6 6-6 6" />
            </svg>
            Background activity ({visibleBg.length + (standalone.length ? 1 : 0)})
          </button>

          {bgOpen && (
            <>
              <div className="dc-bg-note">
                Not a user transfer — page loads and screen visits (corridor list, balance checks, history lookups).
              </div>
              {visibleBg.map((group) => (
                <button
                  key={group.id}
                  className={`dc-bg-item ${selectedId === group.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(group.id)}
                >
                  <span>{group.kind === 'home-visit' ? 'Home refresh' : 'History visit'}</span>
                  <span className="count">{group.calls.length}</span>
                </button>
              ))}
              {standalone.length > 0 && (
                <button className={`dc-bg-item ${standaloneSelected ? 'selected' : ''}`} onClick={() => setSelectedId('__standalone__')}>
                  <span>Other (uncorrelated) calls</span>
                  <span className="count">{standalone.length}</span>
                </button>
              )}
            </>
          )}
        </aside>

        <section className="dc-trace">
          {!selectedGroup && !standaloneSelected && (
            <div className="dc-trace-empty">
              Select a transfer or top-up on the left to see every API call it took to complete — in order, with the full request and response for each step.
            </div>
          )}

          {selectedGroup &&
            selectedGroup.kind === 'transfer' &&
            renderTrace(
              corridorByCode[selectedGroup.country]?.name ?? 'Transfer',
              corridorByCode[selectedGroup.country]?.flag,
              <span className={`dc-status-pill ${selectedGroup.status ?? 'pending'}`}>{selectedGroup.status ?? 'in progress'}</span>,
              selectedGroup.calls,
            )}

          {selectedGroup &&
            selectedGroup.kind === 'topup' &&
            renderTrace(
              selectedGroup.method ? TOPUP_METHOD_LABEL[selectedGroup.method] : 'Top-up',
              selectedGroup.method ? <span className="dc-rail-badge">{TOPUP_RAIL_LABEL[selectedGroup.method]}</span> : null,
              <span className={`dc-status-pill ${selectedGroup.status ?? 'pending'}`}>{selectedGroup.status ?? 'in progress'}</span>,
              selectedGroup.calls,
            )}

          {selectedGroup &&
            selectedGroup.kind !== 'transfer' &&
            selectedGroup.kind !== 'topup' &&
            renderTrace(selectedGroup.kind === 'home-visit' ? 'Home refresh' : 'History visit', null, null, selectedGroup.calls)}

          {standaloneSelected && renderTrace('Other (uncorrelated) calls', null, null, standalone)}
        </section>
      </div>
    </div>
  );
}
