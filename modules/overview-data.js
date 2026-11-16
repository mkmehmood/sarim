import { localDateStr } from './finance.js';

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
  const customers = new Map();
  const cats = new Map();
  const recent = [];
  const add = (map, key, val, sub) => { const o = map.get(key) || { value: 0, count: 0 }; o.value += val; o.count += sub; map.set(key, o); };

  _arr(data.production).filter(live).forEach((p) => {
    const k = dayKey(p);
    const m = byKey.get(k.slice(0, 7));
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
  const sum = (f) => list.reduce((s, m) => s + m[f], 0);
  const totals = { prodKg: sum('prodKg'), prodProfit: sum('prodProfit'), salesValue: sum('salesValue'), salesProfit: sum('salesProfit'), salesCount: sum('salesCount'), cashIn: sum('cashIn'), cashOut: sum('cashOut'), expenses: sum('expenses') };
  totals.margin = totals.salesValue > 0 ? (totals.salesProfit / totals.salesValue) * 100 : 0;
  totals.net = totals.cashIn - totals.cashOut;
  const withCount = (v) => ({ count: v.count });
  return {
    months: list, totals, running: run, thisMonth,
    formulas: top(formulas, 6, withCount), stores: top(stores, 5, withCount), customers: top(customers, 6, withCount), expenseCats: top(cats, 5, withCount),
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
const section = (title, to, body, t = 'good', chipText = 'Open', attr = 'data-go') => `<div class="card sx-card sx-card--accent" data-money><div class="sx-card-head"><h4 class="sx-card-title">${title}</h4>${chip(to, chipText, attr)}</div>${body}</div>`;

function chart(months, series, to) {
  const max = Math.max(1, ...months.flatMap((m) => series.map((s) => m[s.f])));
  const cols = months.map((m) => `<button type="button" class="ov-col" data-go="${to}" aria-label="${m.label}: ${series.map((s) => `${s.name} ${fmt(m[s.f])}`).join(', ')}">`
    + `<span class="ov-pair">${series.map((s) => `<span class="ov-fill ${tone(s.t)}" style="--h:${Math.max(2, Math.round((m[s.f] / max) * 100))}%"></span>`).join('')}</span>`
    + `<span class="ov-val">${fmt(m[series[0].f])}</span><span class="ov-lbl">${m.label}</span></button>`).join('');
  const key = series.length > 1 ? `<div class="ov-key">${series.map((s) => `<span class="ov-key-i ${tone(s.t)}"><i></i>${s.name}</span>`).join('')}</div>` : '';
  return `${key}<div class="ov-cols">${cols}</div>`;
}

function ranked(rows, unit, to, t, attr = 'data-go') {
  if (!rows.length) return '<div class="ov-empty">Nothing recorded in this period.</div>';
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="ov-rank">${rows.map((r) => `<button type="button" class="ov-rank-row ${tone(t)}" ${go(to, attr)}><span class="ov-rank-top"><span class="ov-rank-name">${esc(r.name)}</span><span class="ov-rank-val">${fmt(r.value)}${unit}</span></span><span class="bar ov-bar-track"><i style="--w:${Math.max(3, Math.round((r.value / max) * 100))}%"></i></span></button>`).join('')}</div>`;
}

export function overviewHtml(model, range = 6) {
  const r = model.running;
  const t = model.totals;
  const toggle = RANGES.map((n) => `<div class="toggle-opt${n === range ? ' active' : ''}" role="button" tabindex="0" data-range="${n}">${n}M</div>`).join('');
  const hero = `<div class="card sx-card sx-card--accent" data-money><div class="sx-card-head"><h4 class="sx-card-title">Last ${range} months</h4>${t.salesValue > 0 ? `<span class="badge badge-tint sx-chip sx-tone-good">${t.margin.toFixed(1)}% margin</span>` : ''}</div>`
    + `<div class="sx-hero sx-tone-good"><span class="sx-hero-label">Sales value</span><div class="sx-hero-value">${fmt(t.salesValue)}</div></div>`
    + `<div class="sx-grid sx-cols-2">${stat('Sales profit', fmt(t.salesProfit), 'good', 'sales')}${stat('Sales made', String(t.salesCount), 'info', 'sales')}${stat('Produced', `${fmt(t.prodKg)} kg`, 'info', 'prod')}${stat('Production profit', fmt(t.prodProfit), 'good', 'prod')}${stat('Cash in', fmt(t.cashIn), 'good', 'payments')}${stat('Cash out', fmt(t.cashOut), 'bad', 'payments')}${stat('Expenses', fmt(t.expenses), 'warn', 'payments')}${stat('Net cash', fmt(t.net), t.net >= 0 ? 'good' : 'bad', 'payments')}</div></div>`;
  const now = `<div class="section-header"><h3>Right now</h3></div><div class="sx-grid sx-cols-2 ov-now" data-money>`
    + `${stat('Production today', `${fmt(r.todayProdKg)} kg`, 'info', 'prod', 'data-go', `${r.todayProdCount} entr${r.todayProdCount === 1 ? 'y' : 'ies'}`)}`
    + `${stat('Sales today', fmt(r.todaySalesValue), 'good', 'sales', 'data-go', `${r.todaySalesCount} sale${r.todaySalesCount === 1 ? '' : 's'}`)}`
    + `${stat('Cash in today', fmt(r.todayIn), 'good', 'payments')}${stat('Cash out today', fmt(r.todayOut), 'bad', 'payments')}`
    + `${stat('Open credit sales', fmt(r.openCreditValue), 'warn', 'sales', 'data-go', `${r.openCreditCount} not yet received`)}`
    + `${stat('Stock on hand', fmt(r.stockValue), 'purple', 'raw-material-screen', 'data-screen', `${r.stockItems} material${r.stockItems === 1 ? '' : 's'}`)}</div>`;
  const rec = model.recent.length ? `<div class="ov-recent">${model.recent.map((x) => `<button type="button" class="ov-recent-row ${tone(x.tone)}" data-go="${x.go}"><span class="ov-recent-main"><span class="ov-recent-title">${esc(x.title)}</span><span class="ov-recent-sub">${esc(x.kind)}${x.sub ? ` · ${esc(x.sub)}` : ''}</span></span><span class="ov-recent-amt">${x.amount}</span></button>`).join('')}</div>` : '<div class="ov-empty">No activity yet.</div>';
  return `<header class="u-497acf1 d-flex"><h1 class="shimmer-text u-heading-bold">Overview</h1></header>`
    + `<div class="section-header"><h3>Summary</h3><div class="toggle-group" id="ov-range-toggle">${toggle}</div></div>${hero}${now}`
    + `<div class="section-header"><h3>Over time</h3></div>`
    + section('Sales value', 'sales', chart(model.months, [{ f: 'salesValue', name: 'Sales', t: 'good' }], 'sales'))
    + section('Production (kg)', 'prod', chart(model.months, [{ f: 'prodKg', name: 'Production', t: 'info' }], 'prod'))
    + section('Cash in and out', 'payments', chart(model.months, [{ f: 'cashIn', name: 'In', t: 'good' }, { f: 'cashOut', name: 'Out', t: 'bad' }], 'payments'))
    + `<div class="section-header"><h3>Breakdown</h3></div>`
    + section('Top customers', 'sales', ranked(model.customers, '', 'sales', 'good'))
    + section('Production by formula', 'prod', ranked(model.formulas, ' kg', 'prod', 'info'))
    + section('Production by store', 'prod', ranked(model.stores, ' kg', 'prod', 'info'))
    + section('Expenses by category', 'payments', ranked(model.expenseCats, '', 'payments', 'warn'))
    + section('Stock by value', 'raw-material-screen', ranked(model.stock, '', 'raw-material-screen', 'purple', 'data-screen'), 'purple', 'Open', 'data-screen')
    + `<div class="section-header"><h3>Recent activity</h3></div><div class="card sx-card" data-money>${rec}</div>`
    + `<div class="section-header"><h3>Monthly summary</h3></div><div class="card sx-card" data-money><div class="ov-table-wrap"><table class="table ov-table"><thead><tr><th>Month</th><th>Produced kg</th><th>Sales</th><th>Profit</th><th>In</th><th>Out</th><th>Expenses</th></tr></thead><tbody>${model.months.slice().reverse().map((m) => `<tr><td>${m.label}</td><td>${fmt(m.prodKg)}</td><td>${fmt(m.salesValue)}</td><td>${fmt(m.salesProfit)}</td><td>${fmt(m.cashIn)}</td><td>${fmt(m.cashOut)}</td><td>${fmt(m.expenses)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
