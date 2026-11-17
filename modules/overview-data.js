import { localDateStr } from './finance.js';
import { auditData, isLedgerRow } from './overview-audit.js';
import { buildExtras } from './overview-extra.js';

const _arr = (v) => (Array.isArray(v) ? v : []);
const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const RANGES = [3, 6, 12];
const live = (r) => !!r && typeof r === 'object' && !r.isDeleted;

export function dayKey(rec) {
  const d = rec && rec.date;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const t = rec && (rec.recordDate || rec.timestamp || rec.createdAt);
  const dt = t ? new Date(t) : null;
  if (!dt || Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const stamp = (r) => {
  const t = Date.parse(r.timestamp || r.createdAt || '') || Number(r.timestamp) || Number(r.recordDate) || 0;
  return t || Date.parse(dayKey(r)) || 0;
};

function top(map, limit, extra = () => ({})) {
  return [...map.entries()].map(([name, v]) => ({ name, ...extra(v), value: typeof v === 'number' ? v : v.value })).sort((a, b) => b.value - a.value).slice(0, limit);
}

export { isLedgerRow };

export function analyseProfit(sales, keys) {
  const inRange = _arr(sales).filter((x) => live(x) && keys.has(dayKey(x).slice(0, 7)));
  const out = { count: inRange.length, losing: { count: 0, sum: 0 }, gaining: { count: 0, sum: 0 }, net: 0, noCost: { count: 0, value: 0 }, mismatch: { count: 0, sum: 0 }, zeroQty: 0, qty: 0, value: 0, cost: 0, avgPrice: 0, avgCost: 0, worst: [], byCustomer: [], byStore: [], byMonth: [] };
  const cust = new Map();
  const store = new Map();
  const month = new Map();
  const bump = (map, key, v) => map.set(key, (map.get(key) || 0) + v);
  inRange.forEach((x) => {
    const profit = _n(x.profit);
    const value = _n(x.totalValue);
    const cost = _n(x.totalCost);
    const qty = _n(x.quantity);
    out.net += profit; out.qty += qty; out.value += value; out.cost += cost;
    if (profit < 0) { out.losing.count += 1; out.losing.sum += profit; } else { out.gaining.count += 1; out.gaining.sum += profit; }
    if (!isLedgerRow(x)) {
      if (cost <= 0 && value > 0) { out.noCost.count += 1; out.noCost.value += value; }
      if (Math.abs(profit - (value - cost)) > 1) { out.mismatch.count += 1; out.mismatch.sum += profit - (value - cost); }
      if (qty <= 0) out.zeroQty += 1;
    }
    bump(cust, x.customerName || 'Walk-in', profit);
    bump(store, x.supplyStore || 'Unassigned', profit);
    bump(month, dayKey(x).slice(0, 7), profit);
  });
  out.avgPrice = out.qty > 0 ? out.value / out.qty : 0;
  out.avgCost = out.qty > 0 ? out.cost / out.qty : 0;
  out.worst = inRange.filter((x) => _n(x.profit) < 0).sort((a, b) => _n(a.profit) - _n(b.profit)).map((x) => {
    const q = _n(x.quantity);
    return { date: dayKey(x), customer: x.customerName || 'Walk-in', store: x.supplyStore || '', qty: q, price: q > 0 ? _n(x.totalValue) / q : 0, cost: q > 0 ? _n(x.totalCost) / q : 0, profit: _n(x.profit) };
  });
  const rank = (m) => [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => a.value - b.value);
  out.byCustomer = rank(cust).filter((r) => r.value < 0).slice(0, 6);
  out.byStore = rank(store).filter((r) => r.value < 0).slice(0, 5);
  out.byMonth = rank(month).sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function buildOverview(data, now = new Date(), months = 6) {
  const span = RANGES.includes(months) ? months : 6;
  const list = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, prodKg: 0, prodProfit: 0, salesValue: 0, salesProfit: 0, salesCount: 0, cashIn: 0, cashOut: 0, expenses: 0 });
  }
  const byKey = new Map(list.map((m) => [m.key, m]));
  const today = localDateStr(now);
  const thisMonth = today.slice(0, 7);
  const run = { todayProdKg: 0, todayProdCount: 0, todaySalesValue: 0, todaySalesCount: 0, todayIn: 0, todayOut: 0, openCreditValue: 0, openCreditCount: 0, stockValue: 0, stockItems: 0 };
  const formulas = new Map();
  const stores = new Map();
  const moveFormulas = new Map();
  const moveStores = new Map();
  const customers = new Map();
  const cats = new Map();
  const recent = [];
  const add = (map, key, val, sub) => { const o = map.get(key) || { value: 0, count: 0 }; o.value += val; o.count += sub; map.set(key, o); };

  _arr(data.production).filter(live).forEach((p) => {
    const k = dayKey(p);
    const m = byKey.get(k.slice(0, 7));
    if (p.isReturn === true || p.isTransfer === true) {
      if (m) {
        const label = p.isTransfer === true ? 'Transfers' : 'Returns';
        add(moveFormulas, label, Math.abs(_n(p.net)), 1);
        add(moveStores, `${p.store || 'Unassigned'} \u2013 ${label}`, Math.abs(_n(p.net)), 1);
      }
      return;
    }
    if (m) {
      m.prodKg += _n(p.net); m.prodProfit += _n(p.profit);
      add(formulas, p.formulaName || 'No formula', _n(p.net), 1);
      add(stores, p.store || 'Unassigned', _n(p.net), 1);
    }
    if (k === today) { run.todayProdKg += _n(p.net); run.todayProdCount += 1; }
    recent.push({ kind: 'Production', title: p.store || 'Production', sub: p.formulaName || '', amount: `${Math.round(_n(p.net)).toLocaleString('en-US')} kg`, tone: 'info', go: 'prod', ts: stamp(p) });
  });
  _arr(data.sales).filter(live).forEach((s) => {
    const k = dayKey(s);
    const m = byKey.get(k.slice(0, 7));
    const val = _n(s.totalValue);
    if (m) { m.salesValue += val; m.salesProfit += _n(s.profit); m.salesCount += 1; add(customers, s.customerName || 'Walk-in', val, 1); }
    if (k === today) { run.todaySalesValue += val; run.todaySalesCount += 1; }
    if (String(s.paymentType || '').toUpperCase() !== 'CASH' && s.creditReceived !== true) { run.openCreditValue += val; run.openCreditCount += 1; }
    recent.push({ kind: 'Sale', title: s.customerName || 'Sale', sub: s.supplyStore || '', amount: Math.round(val).toLocaleString('en-US'), tone: 'good', go: 'sales', ts: stamp(s) });
  });
  _arr(data.transactions).filter(live).forEach((t) => {
    const k = dayKey(t);
    const m = byKey.get(k.slice(0, 7));
    const amt = _n(t.amount);
    const isIn = t.type === 'IN';
    if (m) { if (isIn) m.cashIn += amt; else m.cashOut += amt; }
    if (k === today) { if (isIn) run.todayIn += amt; else run.todayOut += amt; }
    recent.push({ kind: isIn ? 'Cash in' : 'Cash out', title: t.entityName || 'Payment', sub: '', amount: Math.round(amt).toLocaleString('en-US'), tone: isIn ? 'good' : 'bad', go: 'payments', ts: stamp(t) });
  });
  _arr(data.expenses).filter(live).forEach((e) => {
    const m = byKey.get(dayKey(e).slice(0, 7));
    const amt = _n(e.amount);
    if (m) { m.expenses += amt; add(cats, e.category || 'Other', amt, 1); }
    recent.push({ kind: 'Expense', title: e.name || e.category || 'Expense', sub: e.category || '', amount: Math.round(amt).toLocaleString('en-US'), tone: 'warn', go: 'payments', ts: stamp(e) });
  });
  const stockRows = [];
  _arr(data.inventory).filter(live).forEach((i) => {
    if (i.isPurchaseLot) return;
    const q = _n(i.quantity);
    if (q > 0) { const v = q * _n(i.cost); run.stockValue += v; run.stockItems += 1; stockRows.push({ name: i.name || 'Material', value: v, qty: q }); }
  });
  list.forEach((m) => { m.totalProfit = m.salesProfit + m.prodProfit; });
  const sum = (f) => list.reduce((s, m) => s + m[f], 0);
  const totals = { prodKg: sum('prodKg'), prodProfit: sum('prodProfit'), salesValue: sum('salesValue'), salesProfit: sum('salesProfit'), salesCount: sum('salesCount'), cashIn: sum('cashIn'), cashOut: sum('cashOut'), expenses: sum('expenses') };
  totals.margin = totals.salesValue > 0 ? (totals.salesProfit / totals.salesValue) * 100 : 0;
  totals.net = totals.cashIn - totals.cashOut;
  totals.totalProfit = totals.salesProfit + totals.prodProfit;
  const withCount = (v) => ({ count: v.count });
  return {
    months: list, totals, running: run, thisMonth,
    profit: analyseProfit(data.sales, new Set(list.map((m) => m.key))),
    audit: auditData(data, today),
    extra: buildExtras(data, now, list.map((m) => m.key)),
    formulas: top(formulas, 6, withCount), stores: top(stores, 5, withCount),
    formulaMoves: top(moveFormulas, 3, (v) => ({ count: v.count, movement: true })), storeMoves: top(moveStores, 6, (v) => ({ count: v.count, movement: true })), customers: top(customers, 6, withCount), expenseCats: top(cats, 5, withCount),
    stock: stockRows.sort((a, b) => b.value - a.value).slice(0, 6),
    recent: recent.sort((a, b) => b.ts - a.ts).slice(0, 8),
  };
}

const fmt = (v) => Math.round(v).toLocaleString('en-US');
const tone = (cls) => `sx-tone-${cls}`;
const go = (to, attr = 'data-go') => `${attr}="${to}"`;
const chip = (to, text = 'Open', attr = 'data-go') => `<button type="button" class="badge badge-tint sx-chip sx-tone-good ov-chip" ${go(to, attr)}>${text}</button>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stat = (label, value, t, to, attr = 'data-go', sub = '') => `<button type="button" class="card stat ov-stat ${tone(t)}" ${go(to, attr)}><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</button>`;
const section = (title, to, body, t = 'good', chipText = 'Open', attr = 'data-go') => `<div class="card sx-card sx-card--accent ov-c" data-money><div class="sx-card-head"><h4 class="sx-card-title">${title}</h4>${chip(to, chipText, attr)}</div>${body}</div>`;

function chart(months, series, to) {
  const max = Math.max(1, ...months.flatMap((m) => series.map((s) => Math.abs(m[s.f]))));
  const cols = months.map((m) => `<button type="button" class="ov-col" data-go="${to}" aria-label="${m.label}: ${series.map((s) => `${s.name} ${fmt(m[s.f])}`).join(', ')}">`
    + `<span class="ov-pair">${series.map((s) => `<span class="ov-fill ${tone(s.t)}" style="--h:${Math.max(2, Math.round((Math.abs(m[s.f]) / max) * 100))}%"></span>`).join('')}</span>`
    + `<span class="ov-val">${fmt(m[series[0].f])}</span><span class="ov-lbl">${m.label}</span></button>`).join('');
  const key = series.length > 1 ? `<div class="ov-key">${series.map((s) => `<span class="ov-key-i ${tone(s.t)}"><i></i>${s.name}</span>`).join('')}</div>` : '';
  return `${key}<div class="ov-cols">${cols}</div>`;
}

function ranked(rows, unit, to, t, attr = 'data-go') {
  if (!rows.length) return '<div class="ov-empty">Nothing recorded in this period.</div>';
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="ov-rank">${rows.map((r) => `<button type="button" class="ov-rank-row ${tone(t)}" ${go(to, attr)}><span class="ov-rank-top"><span class="ov-rank-name">${esc(r.name)}</span><span class="ov-rank-val">${fmt(r.value)}${unit}</span></span><span class="bar ov-bar-track"><i style="--w:${Math.max(3, Math.round((r.value / max) * 100))}%"></i></span></button>`).join('')}</div>`;
}

function auditHtml(a) {
  if (!a || !a.total) return '';
  const head = a.findings.length
    ? `<b>${a.findings.length}</b> of ${a.total.toLocaleString('en-US')} records need attention: <b>${a.errors}</b> with errors and <b>${a.warnings}</b> with warnings. Errors break totals or links; warnings are unusual but may be intentional.`
    : `No problems found in ${a.total.toLocaleString('en-US')} records.`;
  const checks = a.byCheck.length ? `<div class="ov-sub">What was found</div><div class="ov-checks">${a.byCheck.map((c) => `<div class="ov-check sx-tone-${c.severity === 'error' ? 'bad' : 'warn'}"><span>${esc(c.label)}</span><b>${c.count}</b></div>`).join('')}</div>` : '';
  const rows = a.findings.length ? `<div class="ov-sub">Records to check</div><div class="ov-recent">${a.findings.map((f) => `<button type="button" class="ov-recent-row sx-tone-${f.severity === 'error' ? 'bad' : 'warn'}" data-fix="${f.collection}:${f.idx}"><span class="ov-recent-main"><span class="ov-recent-title">${esc(f.title)}</span><span class="ov-recent-sub">${esc(f.label)}${f.date ? ` · ${esc(f.date)}` : ''}${f.id ? ` · id ${esc(f.id)}` : ''}</span><span class="ov-reasons">${f.reasons.map((r) => `<span>${esc(r)}</span>`).join('')}</span></span>${f.impact ? `<span class="ov-recent-amt">${fmt(f.impact)}</span>` : ''}<span class="badge badge-tint sx-chip sx-tone-good ov-fixchip">Fix</span></button>`).join('')}</div>` : '';
  return `<div class="ov-sub">Data problems</div><p class="ov-lead">${head}</p>${checks}${rows}`;
}

function profitCheckHtml(p, t) {
  if (!p.count) return '';
  const lines = [];
  lines.push(`<b>${p.losing.count}</b> of ${p.count} sales made a loss, losing <b>${fmt(-p.losing.sum)}</b> in total. The other ${p.gaining.count} earned <b>${fmt(p.gaining.sum)}</b>, so the net is <b>${fmt(p.net)}</b>.`);
  if (t && t.prodProfit !== 0) lines.push(`Production booked <b>${fmt(t.prodProfit)}</b> profit when goods were made, and sales profit of <b>${fmt(t.salesProfit)}</b> is what sales added or took off after that. Together total profit is <b>${fmt(t.totalProfit)}</b>.`);
  if (p.qty > 0) lines.push(`Average selling price was <b>${p.avgPrice.toFixed(2)}</b> per kg against an average cost of <b>${p.avgCost.toFixed(2)}</b> per kg${p.avgPrice < p.avgCost ? ', so on average you sold below cost' : ''}.`);
  const worst = p.worst.length ? `<div class="ov-sub">Biggest losses</div><div class="ov-recent">${p.worst.map((w) => `<button type="button" class="ov-recent-row sx-tone-bad" data-go="sales"><span class="ov-recent-main"><span class="ov-recent-title">${esc(w.customer)}</span><span class="ov-recent-sub">${esc(w.date)}${w.store ? ` · ${esc(w.store)}` : ''} · ${fmt(w.qty)} kg at ${w.price.toFixed(2)} vs cost ${w.cost.toFixed(2)}</span></span><span class="ov-recent-amt">${fmt(w.profit)}</span></button>`).join('')}</div>` : '';
  const flip = (rows) => rows.map((r) => ({ ...r, value: -r.value }));
  const by = (title, rows) => (rows.length ? `<div class="ov-sub">${title}</div>${ranked(flip(rows), '', 'sales', 'bad')}` : '');
  const months = `<div class="ov-sub">Profit by month</div>${chart(p.byMonth.map((m) => ({ label: m.name, profit: m.value })), [{ f: 'profit', name: 'Profit', t: p.net < 0 ? 'bad' : 'good' }], 'sales')}`;
  return `<div class="ov-sub">Profit</div><ul class="ov-notes">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>${months}${by('Loss by customer', p.byCustomer)}${by('Loss by store', p.byStore)}${worst}`;
}

function checkCardHtml(model) {
  const p = model.profit;
  const a = model.audit;
  const hasProfit = !!(p && p.count);
  const hasAudit = !!(a && a.total);
  if (!hasProfit && !hasAudit) return '';
  const status = hasAudit ? `<span class="badge badge-tint sx-chip sx-tone-${a.errors ? 'bad' : a.warnings ? 'warn' : 'good'}">${a.errors ? `${a.errors} errors` : a.warnings ? `${a.warnings} warnings` : 'Clean'}</span>` : chip('sales');
  return `<div class="card sx-card sx-card--accent ov-c" data-money><div class="sx-card-head"><h4 class="sx-card-title">Profit and data check</h4>${status}</div>${hasProfit ? profitCheckHtml(p, model.totals) : ''}${hasAudit ? auditHtml(a) : ''}</div>`;
}

function owedSection(x) {
  if (!x || !x.owed.count) return '';
  const o = x.owed;
  const tiles = `<div class="sx-grid sx-cols-2">${stat('Total owed', fmt(o.total), 'warn', 'sales', 'data-go', `${o.count} sale${o.count === 1 ? '' : 's'}, oldest ${o.oldest} days`)}${stat('Up to 30 days', fmt(o.d30), 'good', 'sales')}${stat('31 to 60 days', fmt(o.d60), 'warn', 'sales')}${stat('Over 60 days', fmt(o.d90), 'bad', 'sales')}</div>`;
  const rows = o.customers.map((c) => ({ name: `${c.name} (${c.oldest}d)`, value: c.value }));
  return section('Who owes you', 'sales', `${tiles}<div class="ov-sub">By customer, with age of the oldest sale</div>${ranked(rows, '', 'sales', 'warn')}`);
}

const PANELS = [['sales', 'Sales'], ['prod', 'Production'], ['money', 'Money'], ['stock', 'Stock'], ['checks', 'Checks'], ['activity', 'Activity']];

function spark(values) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? 100 / (values.length - 1) : 100;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(22 - ((v - min) / span) * 20).toFixed(1)}`).join(' ');
  return `<svg class="ov-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/></svg>`;
}

function delta(values) {
  if (values.length < 2) return '';
  const prev = values[values.length - 2];
  const last = values[values.length - 1];
  if (!(Math.abs(prev) > 0)) return '';
  const pct = Math.round(((last - prev) / Math.abs(prev)) * 100);
  return `<span class="ov-delta">${pct >= 0 ? '\u25b2' : '\u25bc'} ${Math.abs(pct)}%</span>`;
}

function kpi(label, value, series, t, to, sub = '', attr = 'data-go') {
  return `<button type="button" class="ov-kpi ${tone(t)}" ${go(to, attr)}><span class="ov-kpi-l">${label}</span><span class="ov-kpi-v">${value}</span>${series ? `<span class="ov-kpi-s">${spark(series)}${delta(series)}</span>` : ''}${sub ? `<span class="ov-kpi-sub">${sub}</span>` : ''}</button>`;
}

function pill(label, value, t, to) {
  return `<button type="button" class="ov-pill ${tone(t)}" data-go="${to}"><span>${label}</span><b>${value}</b></button>`;
}

function donut(rows, to) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (!(total > 0)) return '<div class="ov-empty">Nothing recorded in this period.</div>';
  const pct = Math.round((rows[0].value / total) * 100);
  const legend = rows.map((r, i) => `<span class="ov-legend-row ${tone(i === 0 ? 'good' : 'warn')}"><i></i>${esc(r.name)}<b>${fmt(r.value)}</b><em>${Math.round((r.value / total) * 100)}%</em></span>`).join('');
  return `<button type="button" class="ov-donut-wrap" data-go="${to}"><span class="ov-donut sx-tone-good" style="--p:${pct}"></span><span class="ov-legend">${legend}</span></button>`;
}

export function overviewHtml(model, range = 6, opts = {}) {
  const r = model.running;
  const t = model.totals;
  const x = model.extra;
  const panel = PANELS.some(([id]) => id === opts.panel) ? opts.panel : 'sales';
  const series = (f) => model.months.map((m) => m[f]);
  const netSeries = model.months.map((m) => m.cashIn - m.cashOut);
  const toggle = RANGES.map((n) => `<div class="toggle-opt${n === range ? ' active' : ''}" role="button" tabindex="0" data-range="${n}">${n}M</div>`).join('');
  const badge = model.audit && (model.audit.errors || model.audit.warnings) ? ` <span class="ov-count sx-tone-${model.audit.errors ? 'bad' : 'warn'}">${model.audit.errors + model.audit.warnings}</span>` : '';
  const tabs = PANELS.map(([id, label]) => `<div class="toggle-opt${id === panel ? ' active' : ''}" role="button" tabindex="0" data-panel="${id}">${label}${id === 'checks' ? badge : ''}</div>`).join('');
  const kpis = [
    kpi('Sales', fmt(t.salesValue), series('salesValue'), 'good', 'sales', `${t.salesCount} sale${t.salesCount === 1 ? '' : 's'}`),
    kpi('Profit', fmt(t.totalProfit), series('totalProfit'), t.totalProfit < 0 ? 'bad' : 'good', 'sales', `sales ${fmt(t.salesProfit)} \u00b7 production ${fmt(t.prodProfit)}`),
    kpi('Produced', `${fmt(t.prodKg)} kg`, series('prodKg'), 'info', 'prod', `profit ${fmt(t.prodProfit)} booked`),
    kpi('Net cash', fmt(t.net), netSeries, t.net < 0 ? 'bad' : 'good', 'payments', `in ${fmt(t.cashIn)} \u00b7 out ${fmt(t.cashOut)}`),
    kpi('Expenses', fmt(t.expenses), series('expenses'), 'warn', 'payments'),
    kpi('Owed to you', fmt(x && x.owed.count ? x.owed.total : r.openCreditValue), null, 'warn', 'sales', `${x && x.owed.count ? x.owed.count : r.openCreditCount} unreceived`),
    kpi('Stock', fmt(r.stockValue), null, 'purple', 'raw-material-screen', `${r.stockItems} material${r.stockItems === 1 ? '' : 's'}${x && x.outOfStock.count ? ` \u00b7 ${x.outOfStock.count} out` : ''}`, 'data-screen'),
  ].join('');
  const now = `<div class="ov-now-strip" data-money><span class="ov-now-label">Right now</span>${pill('Production', `${fmt(r.todayProdKg)} kg`, 'info', 'prod')}${pill('Sales', fmt(r.todaySalesValue), 'good', 'sales')}${pill('In', fmt(r.todayIn), 'good', 'payments')}${pill('Out', fmt(r.todayOut), 'bad', 'payments')}</div>`;
  const rec = model.recent.length ? `<div class="ov-recent">${model.recent.map((e) => `<button type="button" class="ov-recent-row ${tone(e.tone)}" data-go="${e.go}"><span class="ov-recent-main"><span class="ov-recent-title">${esc(e.title)}</span><span class="ov-recent-sub">${esc(e.kind)}${e.sub ? ` \u00b7 ${esc(e.sub)}` : ''}</span></span><span class="ov-recent-amt">${e.amount}</span></button>`).join('')}</div>` : '<div class="ov-empty">No activity yet.</div>';
  const table = `<div class="ov-table-wrap"><table class="table ov-table"><thead><tr><th>Month</th><th>Produced kg</th><th>Sales</th><th>Sales profit</th><th>Production profit</th><th>Total profit</th><th>In</th><th>Out</th><th>Expenses</th></tr></thead><tbody>${model.months.slice().reverse().map((m) => `<tr><td>${m.label}</td><td>${fmt(m.prodKg)}</td><td>${fmt(m.salesValue)}</td><td>${fmt(m.salesProfit)}</td><td>${fmt(m.prodProfit)}</td><td>${fmt(m.totalProfit)}</td><td>${fmt(m.cashIn)}</td><td>${fmt(m.cashOut)}</td><td>${fmt(m.expenses)}</td></tr>`).join('')}</tbody></table></div>`;
  const factoryChart = x && x.factory.total > 0 ? section('Factory output (units)', 'factory', chart(model.months.map((m, i) => ({ label: m.label, units: x.factory.months[i].units })), [{ f: 'units', name: 'Units', t: 'purple' }], 'factory')) : '';
  const panels = {
    sales: [
      section('Sales value', 'sales', chart(model.months, [{ f: 'salesValue', name: 'Sales', t: 'good' }], 'sales')),
      section('Profit: production and sales', 'sales', chart(model.months, [{ f: 'prodProfit', name: 'Production', t: 'info' }, { f: 'salesProfit', name: 'Sales', t: 'good' }, { f: 'totalProfit', name: 'Total', t: 'purple' }], 'sales')),
      owedSection(x),
      section('Top customers', 'sales', ranked(model.customers, '', 'sales', 'good')),
      x && x.salesByStore.length ? section('Sales by store', 'sales', ranked(x.salesByStore, '', 'sales', 'good')) : '',
      x && x.salesByPay.length ? section('Cash and credit sales', 'sales', donut(x.salesByPay, 'sales')) : '',
    ],
    prod: [
      section('Production (kg)', 'prod', chart(model.months, [{ f: 'prodKg', name: 'Production', t: 'info' }], 'prod')),
      factoryChart,
      section('Production by formula', 'prod', ranked(model.formulas.concat(model.formulaMoves || []), ' kg', 'prod', 'info')),
      section('Production by store', 'prod', ranked(model.stores.concat(model.storeMoves || []), ' kg', 'prod', 'info')),
      x && x.factory.formulas.length ? section('Factory output by formula', 'factory', ranked(x.factory.formulas, ' units', 'factory', 'purple')) : '',
      x && x.formulaCosts.length ? section('Formula cost per kg', 'factory', ranked(x.formulaCosts.map((c) => ({ ...c, name: c.linked ? `${c.name} (linked)` : c.name })), '', 'factory', 'purple')) : '',
    ],
    money: [
      section('Cash in and out', 'payments', chart(model.months, [{ f: 'cashIn', name: 'In', t: 'good' }, { f: 'cashOut', name: 'Out', t: 'bad' }], 'payments')),
      section('Expenses by category', 'payments', ranked(model.expenseCats, '', 'payments', 'warn')),
    ],
    stock: [
      section('Stock by value', 'raw-material-screen', ranked(model.stock, '', 'raw-material-screen', 'purple', 'data-screen'), 'purple', 'Open', 'data-screen'),
      x && x.outOfStock.count ? section('Out of stock', 'raw-material-screen', `<div class="ov-chips">${x.outOfStock.names.map((n) => `<span class="badge badge-tint sx-chip sx-tone-bad">${esc(n)}</span>`).join('')}</div>`, 'bad', 'Open', 'data-screen') : '',
    ],
    checks: [checkCardHtml(model)],
    activity: [
      `<div class="card sx-card ov-c" data-money><div class="sx-card-head"><h4 class="sx-card-title">Recent activity</h4></div>${rec}</div>`,
      `<div class="card sx-card ov-c" data-money><div class="sx-card-head"><h4 class="sx-card-title">Monthly summary</h4></div>${table}</div>`,
    ],
  };
  const body = PANELS.map(([id]) => `<div class="ov-panel ov-grid${id === 'checks' || id === 'activity' ? ' is-wide' : ''}" data-panel-id="${id}"${id === panel ? '' : ' hidden'}>${panels[id].join('')}</div>`).join('');
  return `<header class="ov-top"><h1 class="shimmer-text u-heading-bold">Overview</h1><div class="toggle-group" id="ov-range-toggle">${toggle}</div></header>`
    + `<div class="ov-kpis" data-money>${kpis}</div>${now}`
    + `<div class="toggle-group ov-tabs" id="ov-panel-toggle">${tabs}</div>${body}`;
}
