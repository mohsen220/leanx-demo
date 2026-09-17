import { useMemo, useState, useEffect } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from './api.js';
import { getLog, subscribeLog, clearLog } from './logStore.js';
import { BoltIcon, BankIcon, ShieldIcon, CheckIcon } from './icons.jsx';
import { FLOW_GRAPHS } from './flowGraphs.js';
import { describeField } from './fieldGlossary.js';

const PRODUCTS = [
  { id: 'leanx', label: 'Lean X', sublabel: 'Cross-border transfers', icon: BoltIcon },
  { id: 'pbb-aof', label: 'Pay by Bank', sublabel: 'Account on File', icon: BankIcon },
  { id: 'pbb-sip', label: 'Pay by Bank', sublabel: 'Single Instant Payment', icon: BankIcon },
  { id: 'pbb-re', label: 'Pay by Bank', sublabel: 'Reverse Engineered', icon: BankIcon },
  { id: 'consents', label: 'Consents', sublabel: 'CMI', icon: ShieldIcon },
  { id: 'verify', label: 'Verification', sublabel: 'AVS', icon: CheckIcon },
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

function topupMethodOf(calls) {
  if (calls.some((c) => c.category?.startsWith('aof') || c.category === 'sdk-authorizeConsent')) return 'aof';
  if (calls.some((c) => c.category?.startsWith('sip') || c.category === 'sdk-checkout')) return 'sip';
  if (calls.some((c) => c.category?.startsWith('re-') || c.category === 'sdk-connect' || c.category === 'sdk-pay')) {
    return 're';
  }
  return null;
}

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

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// `ctx` (a call's {category, path}) lets a field like `status` — which
// means a different thing on nearly every endpoint — resolve to the right
// description instead of one generic guess. See fieldGlossary.js.
function highlightJson(value, ctx) {
  if (value === undefined) return '<span style="opacity:.5">— no payload —</span>';
  const escaped = escapeHtml(JSON.stringify(value, null, 2));
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'n';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'k' : 's';
      else if (/true|false|null/.test(match)) cls = 'b';
      if (cls === 'k') {
        const fieldName = match.replace(/^"|"(\s*:)?$/g, '');
        const desc = describeField(fieldName, ctx);
        if (desc) return `<span class="k desc" title="${escapeAttr(desc)}">${match}</span>`;
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

// Walks a request/response body and collects a description for every
// distinct field name that has one — shown as an always-visible glossary
// under the JSON, since a hover-only tooltip is invisible on a plain read
// or a copy/paste (which is exactly how most people first look at this).
function collectFieldDescriptions(value, ctx, seen, acc) {
  if (!value || typeof value !== 'object') return acc;
  if (Array.isArray(value)) {
    for (const item of value) collectFieldDescriptions(item, ctx, seen, acc);
    return acc;
  }
  for (const [key, val] of Object.entries(value)) {
    if (!seen.has(key)) {
      const desc = describeField(key, ctx);
      if (desc) {
        seen.add(key);
        acc.push({ key, desc });
      }
    }
    collectFieldDescriptions(val, ctx, seen, acc);
  }
  return acc;
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

// Groups one run's flat, chronological call list into rows keyed by
// category — polling (many consecutive calls, same category) collapses
// into one row keeping every call, and any `_upstream` calls a route made
// attach as children of the row that triggered them (they were recorded
// strictly between that row's request and the next one's).
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

// Every real historical occurrence of one graph node's category, newest
// first — runs are already newest-first, and within a run there's
// normally exactly one row per category (polling collapses to one row).
function historyForCategory(runs, category) {
  const out = [];
  for (const run of runs) {
    for (const row of buildRunRows(run.calls)) {
      if (row.category === category) out.push({ runId: run.id, ...row });
    }
  }
  return out;
}

const EDGE_COLOR = { success: 'var(--dc-success)', fail: 'var(--dc-danger)', default: 'var(--dc-text-faint)' };

function buildFlowEdges(productId) {
  return FLOW_GRAPHS[productId].edges.map((e) => {
    const color = EDGE_COLOR[e.variant] ?? EDGE_COLOR.default;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      label: e.label,
      style: { stroke: color, strokeWidth: 1.6 },
      labelStyle: { fill: 'var(--dc-text-muted)', fontFamily: 'var(--dc-mono)', fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: 'var(--dc-surface)', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
    };
  });
}

function FlowNode({ data }) {
  const { kind, title, subtitle, count, lastOk, highlighted, selected } = data;
  return (
    <div className={`dc-node dc-node-${kind} ${highlighted ? 'hit' : ''} ${selected ? 'active' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="dc-node-title">{title}</div>
      {subtitle && <div className="dc-node-subtitle">{subtitle}</div>}
      {(kind === 'api' || kind === 'sdk') && (
        <div className="dc-node-foot">
          <span className={`dc-node-dot ${lastOk ?? 'none'}`} />
          <span>{count} call{count === 1 ? '' : 's'}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { flowNode: FlowNode };

function CallDetail({ call, label }) {
  const fields = useMemo(() => {
    const seen = new Set();
    const acc = [];
    collectFieldDescriptions(call.payload, call, seen, acc);
    collectFieldDescriptions(call.body, call, seen, acc);
    return acc;
  }, [call]);

  return (
    <div className="dc-section">
      <div className="dc-call-head">
        <span className="dc-call-label">{label}</span>
        <code className="dc-call-endpoint">
          {call.method} {call.path}
        </code>
      </div>
      <div className="dc-section-head">
        <span className="dc-section-title">Request</span>
        <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(call.body ?? {}, null, 2))}>
          Copy JSON
        </button>
      </div>
      <pre className="dc-pre" dangerouslySetInnerHTML={{ __html: highlightJson(call.body, call) }} />
      <div className="dc-section-head" style={{ marginTop: 12 }}>
        <span className="dc-section-title">Response</span>
        <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(call.payload ?? {}, null, 2))}>
          Copy JSON
        </button>
      </div>
      <pre className="dc-pre" dangerouslySetInnerHTML={{ __html: highlightJson(call.payload, call) }} />
      {fields.length > 0 && (
        <div className="dc-field-guide">
          <div className="dc-field-guide-title">What these fields mean</div>
          {fields.map((f) => (
            <div className="dc-field-guide-row" key={f.key}>
              <code>{f.key}</code>
              <span>{f.desc}</span>
            </div>
          ))}
        </div>
      )}
      {call.method !== 'SDK' && !UPSTREAM_CATEGORIES.has(call.category) && (
        <>
          <div className="dc-section-head" style={{ marginTop: 12 }}>
            <span className="dc-section-title">Reproduce</span>
            <button className="dc-copy-btn" onClick={() => navigator.clipboard?.writeText(toCurl(call))}>
              Copy cURL
            </button>
          </div>
          <pre className="dc-pre">{toCurl(call)}</pre>
        </>
      )}
    </div>
  );
}

function OccurrenceRow({ row, isSdk }) {
  const [open, setOpen] = useState(false);
  const finalCall = row.calls[row.calls.length - 1];
  const pollNote = row.calls.length > 1 ? ` · ${row.calls.length}×` : '';
  return (
    <div className="dc-occurrence">
      <button className="dc-occurrence-head" onClick={() => setOpen((v) => !v)}>
        <span className={`dc-flow-cell-status ${statusClass(finalCall.status)}`}>{finalCall.status ?? '···'}</span>
        <span className="dc-occurrence-path">
          {finalCall.method} {finalCall.path}
          {pollNote}
        </span>
        <span className="dc-occurrence-time">{new Date(finalCall.time).toLocaleString()}</span>
        {finalCall.duration != null && <span className="dc-occurrence-duration">{formatDuration(finalCall.duration)}</span>}
      </button>
      {open && (
        <div className="dc-occurrence-detail">
          {row.calls.map((c, i) =>
            isSdk ? (
              <CallDetail key={c.id} call={c} label={row.calls.length > 1 ? `Event ${i + 1}` : 'Event'} />
            ) : (
              <CallDetail key={c.id} call={c} label={row.calls.length > 1 ? `Call ${i + 1}` : 'Your backend'} />
            ),
          )}
          {row.upstream.map((u) => (
            <CallDetail key={u.id} call={u} label={UPSTREAM_TAG_LABEL[u.category]} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDrawer({ node, runs, onClose }) {
  const isHistorical = node.kind === 'api' || node.kind === 'sdk';
  const occurrences = useMemo(() => (isHistorical ? historyForCategory(runs, node.category) : []), [isHistorical, runs, node.category]);
  const okCount = occurrences.filter((o) => statusClass(o.calls[o.calls.length - 1].status) === 'ok').length;

  return (
    <>
      <div className="dc-drawer-backdrop" onClick={onClose} />
      <aside className="dc-drawer">
        <div className="dc-drawer-head">
          <div>
            <div className={`dc-drawer-kind dc-node-${node.kind}`}>{node.kind.replace('-', ' ')}</div>
            <h3>{node.title}</h3>
            {node.subtitle && <div className="dc-drawer-subtitle">{node.subtitle}</div>}
          </div>
          <button className="dc-btn" onClick={onClose}>
            Close
          </button>
        </div>

        {node.description && <p className="dc-drawer-desc">{node.description}</p>}

        {isHistorical && (
          <>
            <div className="dc-drawer-stats">
              <div>
                <span className="n">{occurrences.length}</span>
                <span className="lbl">Times seen</span>
              </div>
              <div>
                <span className="n">{occurrences.length ? `${Math.round((okCount / occurrences.length) * 100)}%` : '—'}</span>
                <span className="lbl">Success rate</span>
              </div>
            </div>
            <div className="dc-drawer-history-label">
              History (newest first) <span className="dc-drawer-hint">expand a call for its full request/response and a field-by-field guide</span>
            </div>
            {occurrences.length === 0 && (
              <div className="dc-empty-note">Not seen yet — use this step in the app to capture a real call here.</div>
            )}
            {occurrences.map((row, i) => (
              <OccurrenceRow key={`${row.runId}-${i}`} row={row} isSdk={node.kind === 'sdk'} />
            ))}
          </>
        )}
      </aside>
    </>
  );
}

export function DeveloperConsole() {
  const [calls, setCalls] = useState(() => getLog());
  const [corridors, setCorridors] = useState([]);
  const [mockMode, setMockMode] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState('leanx');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [highlightedRunId, setHighlightedRunId] = useState(null);
  const [bgOpen, setBgOpen] = useState(false);

  useEffect(() => subscribeLog(setCalls), []);

  useEffect(() => {
    api.getCorridors().then(setCorridors).catch(() => {});
    api.getHealth().then((h) => setMockMode(h.mockMode)).catch(() => {});
  }, []);

  const corridorByCode = useMemo(() => Object.fromEntries(corridors.map((c) => [c.code, c])), [corridors]);
  const { runsByProduct, bgGroups, standalone } = useMemo(() => buildGroups(calls), [calls]);

  const selectProduct = (id) => {
    setSelectedProduct(id);
    setSelectedNodeId(null);
    setHighlightedRunId(null);
  };

  const product = PRODUCTS_BY_ID[selectedProduct];
  const runs = runsByProduct.get(selectedProduct) ?? [];

  const highlightedCategories = useMemo(() => {
    if (!highlightedRunId) return null;
    const run = runs.find((r) => r.id === highlightedRunId);
    return run ? new Set(run.calls.map((c) => c.category)) : null;
  }, [highlightedRunId, runs]);

  const flowNodes = useMemo(() => {
    if (!product) return [];
    return FLOW_GRAPHS[selectedProduct].nodes.map((n) => {
      const matches = n.category ? calls.filter((c) => c.category === n.category) : [];
      return {
        id: n.id,
        type: 'flowNode',
        position: { x: n.x, y: n.y },
        draggable: false,
        data: {
          ...n,
          count: matches.length,
          lastOk: matches.length ? statusClass(matches[0].status) : null,
          highlighted: highlightedCategories?.has(n.category) ?? false,
          selected: selectedNodeId === n.id,
        },
      };
    });
  }, [product, selectedProduct, calls, highlightedCategories, selectedNodeId]);

  const flowEdges = useMemo(() => (product ? buildFlowEdges(selectedProduct) : []), [product, selectedProduct]);
  const selectedNode = selectedNodeId ? FLOW_GRAPHS[selectedProduct].nodes.find((n) => n.id === selectedNodeId) : null;

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
              setSelectedNodeId(null);
              setHighlightedRunId(null);
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
                  onClick={() => selectProduct(group.id)}
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
              </div>

              <div className="dc-graph-wrap">
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={NODE_TYPES}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                  proOptions={{ hideAttribution: true }}
                  nodesConnectable={false}
                  elementsSelectable
                  panOnScroll
                  zoomOnScroll={false}
                  minZoom={0.3}
                  maxZoom={1.5}
                >
                  <Background gap={18} size={1} color="var(--dc-border)" />
                  <Controls showInteractive={false} position="top-right" />
                </ReactFlow>
              </div>

              <div className="dc-runs">
                <div className="dc-section-label">Recent runs ({runs.length})</div>
                {runs.length === 0 && (
                  <div className="dc-empty-note">No runs yet — use this product in the app to see one traced here, live.</div>
                )}
                <div className="dc-runs-list">
                  {runs.map((run) => {
                    const { flag, name } = runHeadline(run);
                    return (
                      <button
                        key={run.id}
                        className={`dc-run-card ${highlightedRunId === run.id ? 'selected' : ''}`}
                        title="Highlight the nodes this run touched on the graph above"
                        onClick={() => setHighlightedRunId((prev) => (prev === run.id ? null : run.id))}
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

      {selectedNode && <NodeDrawer node={selectedNode} runs={runs} onClose={() => setSelectedNodeId(null)} />}
    </div>
  );
}
