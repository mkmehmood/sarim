import { localDateStr } from './finance.js';
import { auditData, isLedgerRow } from './overview-audit.js';

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
  const sum = (f) => list.reduce((s, m) => s + m[f], 0);
  const totals = { prodKg: sum('prodKg'), prodProfit: sum('prodProfit'), salesValue: sum('salesValue'), salesProfit: sum('salesProfit'), salesCount: sum('salesCount'), cashIn: sum('cashIn'), cashOut: sum('cashOut'), expenses: sum('expenses') };
  totals.margin = totals.salesValue > 0 ? (totals.salesProfit / totals.salesValue) * 100 : 0;
  totals.net = totals.cashIn - totals.cashOut;
  const withCount = (v) => ({ count: v.count });
  return {
    months: list, totals, running: run, thisMonth,
    profit: analyseProfit(data.sales, new Set(list.map((m) => m.key))),
    audit: auditData(data, today),
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
const section = (title, to, body, t = 'good', chipText = 'Open', attr = 'data-go') => `<div class="card sx-card sx-card--accent" data-money><div class="sx-card-head"><h4 class="sx-card-title">${title}</h4>${chip(to, chipText, attr)}</div>${body}</div>`;

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

function profitCheckHtml(p) {
  if (!p.count) return '';
  const lines = [];
  lines.push(`<b>${p.losing.count}</b> of ${p.count} sales made a loss, losing <b>${fmt(-p.losing.sum)}</b> in total. The other ${p.gaining.count} earned <b>${fmt(p.gaining.sum)}</b>, so the net is <b>${fmt(p.net)}</b>.`);
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
  return `<div class="card sx-card sx-card--accent" data-money><div class="sx-card-head"><h4 class="sx-card-title">Profit and data check</h4>${status}</div>${hasProfit ? profitCheckHtml(p) : ''}${hasAudit ? auditHtml(a) : ''}</div>`;
}

export function overviewHtml(model, range = 6) {
  const r = model.running;
  const t = model.totals;
  const toggle = RANGES.map((n) => `<div class="toggle-opt${n === range ? ' active' : ''}" role="button" tabindex="0" data-range="${n}">${n}M</div>`).join('');
  const hero = `<div class="card sx-card sx-card--accent" data-money><div class="sx-card-head"><h4 class="sx-card-title">Last ${range} months</h4>${t.salesValue > 0 ? `<span class="badge badge-tint sx-chip sx-tone-good">${t.margin.toFixed(1)}% margin</span>` : ''}</div>`
    + `<div class="sx-hero sx-tone-good"><span class="sx-hero-label">Sales value</span><div class="sx-hero-value">${fmt(t.salesValue)}</div></div>`
    + `<div class="sx-grid sx-cols-2">${stat('Sales profit', fmt(t.salesProfit), 'good', 'sales')}${stat('Sales made', String(t.salesCount), 'info', 'sales')}${stat('Produced', `${fmt(t.prodKg)} kg`, 'info', 'prod')}${stat('Production profit', fmt(t.prodProfit), 'good', 'prod')}${stat('Cash in', fmt(t.cashIn), 'good', 'payments')}${stat('Cash out', fmt(t.cashOut), 'bad', 'payments')}${stat('Expenses', fmt(t.expenses), 'warn', 'payments')}${stat('Net cash', fmt(t.net), t.net >= 0 ? 'good' : 'bad', 'payments')}</div></div>`;
  const pc = checkCardHtml(model);
  const now = `<div class="section-header"><h3>Right now</h3></div><div class="sx-grid sx-cols-2 ov-now" data-money>`
    + `${stat('Production today', `${fmt(r.todayProdKg)} kg`, 'info', 'prod', 'data-go', `${r.todayProdCount} entr${r.todayProdCount === 1 ? 'y' : 'ies'}`)}`
    + `${stat('Sales today', fmt(r.todaySalesValue), 'good', 'sales', 'data-go', `${r.todaySalesCount} sale${r.todaySalesCount === 1 ? '' : 's'}`)}`
    + `${stat('Cash in today', fmt(r.todayIn), 'good', 'payments')}${stat('Cash out today', fmt(r.todayOut), 'bad', 'payments')}`
    + `${stat('Open credit sales', fmt(r.openCreditValue), 'warn', 'sales', 'data-go', `${r.openCreditCount} not yet received`)}`
    + `${stat('Stock on hand', fmt(r.stockValue), 'purple', 'raw-material-screen', 'data-screen', `${r.stockItems} material${r.stockItems === 1 ? '' : 's'}`)}</div>`;
  const rec = model.recent.length ? `<div class="ov-recent">${model.recent.map((x) => `<button type="button" class="ov-recent-row ${tone(x.tone)}" data-go="${x.go}"><span class="ov-recent-main"><span class="ov-recent-title">${esc(x.title)}</span><span class="ov-recent-sub">${esc(x.kind)}${x.sub ? ` · ${esc(x.sub)}` : ''}</span></span><span class="ov-recent-amt">${x.amount}</span></button>`).join('')}</div>` : '<div class="ov-empty">No activity yet.</div>';
  return `<header class="u-497acf1 d-flex"><h1 class="shimmer-text u-heading-bold">Overview</h1></header>`
    + `<div class="section-header"><h3>Summary</h3><div class="toggle-group" id="ov-range-toggle">${toggle}</div></div>${hero}${pc}${now}`
    + `<div class="section-header"><h3>Over time</h3></div>`
    + section('Sales value', 'sales', chart(model.months, [{ f: 'salesValue', name: 'Sales', t: 'good' }], 'sales'))
    + section('Production (kg)', 'prod', chart(model.months, [{ f: 'prodKg', name: 'Production', t: 'info' }], 'prod'))
    + section('Cash in and out', 'payments', chart(model.months, [{ f: 'cashIn', name: 'In', t: 'good' }, { f: 'cashOut', name: 'Out', t: 'bad' }], 'payments'))
    + `<div class="section-header"><h3>Breakdown</h3></div>`
    + section('Top customers', 'sales', ranked(model.customers, '', 'sales', 'good'))
    + section('Production by formula', 'prod', ranked(model.formulas.concat(model.formulaMoves || []), ' kg', 'prod', 'info'))
    + section('Production by store', 'prod', ranked(model.stores.concat(model.storeMoves || []), ' kg', 'prod', 'info'))
    + section('Expenses by category', 'payments', ranked(model.expenseCats, '', 'payments', 'warn'))
    + section('Stock by value', 'raw-material-screen', ranked(model.stock, '', 'raw-material-screen', 'purple', 'data-screen'), 'purple', 'Open', 'data-screen')
    + `<div class="section-header"><h3>Recent activity</h3></div><div class="card sx-card" data-money>${rec}</div>`
    + `<div class="section-header"><h3>Monthly summary</h3></div><div class="card sx-card" data-money><div class="ov-table-wrap"><table class="table ov-table"><thead><tr><th>Month</th><th>Produced kg</th><th>Sales</th><th>Profit</th><th>In</th><th>Out</th><th>Expenses</th></tr></thead><tbody>${model.months.slice().reverse().map((m) => `<tr><td>${m.label}</td><td>${fmt(m.prodKg)}</td><td>${fmt(m.salesValue)}</td><td>${fmt(m.salesProfit)}</td><td>${fmt(m.cashIn)}</td><td>${fmt(m.cashOut)}</td><td>${fmt(m.expenses)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
