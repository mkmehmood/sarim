import { localDateStr } from './finance.js';

const _arr = (v) => (Array.isArray(v) ? v : []);
const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const RANGES = [3, 6, 12];

export function dayKey(rec) {
  const d = rec && rec.date;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const t = rec && (rec.recordDate || rec.timestamp || rec.createdAt);
  const dt = t ? new Date(t) : null;
  if (!dt || Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function buildOverview(data, now = new Date(), months = 6) {
  const span = RANGES.includes(months) ? months : 6;
  const list = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, prodKg: 0, salesValue: 0, salesProfit: 0, salesCount: 0 });
  }
  const byKey = new Map(list.map((m) => [m.key, m]));
  const today = localDateStr(now);
  const run = { todayProdKg: 0, todayProdCount: 0, todaySalesValue: 0, todaySalesCount: 0, openCreditValue: 0, openCreditCount: 0, stockValue: 0, stockItems: 0, paymentsThisMonth: 0 };
  const thisMonth = today.slice(0, 7);
  _arr(data.production).forEach((p) => {
    if (!p || p.isDeleted) return;
    const k = dayKey(p);
    const m = byKey.get(k.slice(0, 7));
    if (m) m.prodKg += _n(p.net);
    if (k === today) { run.todayProdKg += _n(p.net); run.todayProdCount += 1; }
  });
  _arr(data.sales).forEach((s) => {
    if (!s || s.isDeleted) return;
    const k = dayKey(s);
    const m = byKey.get(k.slice(0, 7));
    if (m) { m.salesValue += _n(s.totalValue); m.salesProfit += _n(s.profit); m.salesCount += 1; }
    if (k === today) { run.todaySalesValue += _n(s.totalValue); run.todaySalesCount += 1; }
    if (String(s.paymentType || '').toUpperCase() !== 'CASH' && s.creditReceived !== true) { run.openCreditValue += _n(s.totalValue); run.openCreditCount += 1; }
  });
  _arr(data.inventory).forEach((i) => {
    if (!i || i.isPurchaseLot || i.isDeleted) return;
    const q = _n(i.quantity);
    if (q > 0) { run.stockValue += q * _n(i.cost); run.stockItems += 1; }
  });
  _arr(data.transactions).forEach((t) => { if (t && !t.isDeleted && dayKey(t).slice(0, 7) === thisMonth) run.paymentsThisMonth += 1; });
  return { months: list, running: run };
}

const fmt = (v) => Math.round(v).toLocaleString('en-US');

function bars(months, field, label, go) {
  const max = Math.max(1, ...months.map((m) => m[field]));
  const cols = months.map((m) => `<button type="button" class="ov-bar" data-go="${go}" title="${m.label}: ${fmt(m[field])}" aria-label="${label} ${m.label}: ${fmt(m[field])}"><span class="ov-bar-val">${fmt(m[field])}</span><span class="ov-bar-fill" style="--h:${Math.max(2, Math.round((m[field] / max) * 100))}%"></span><span class="ov-bar-lbl">${m.label}</span></button>`).join('');
  return `<section class="ov-card"><div class="ov-card-head"><h3>${label}</h3><button type="button" class="ov-link" data-go="${go}">Open</button></div><div class="ov-bars">${cols}</div></section>`;
}

export function overviewHtml(model, range = 6) {
  const r = model.running;
  const tile = (go, title, value, sub, extra = '') => `<button type="button" class="ov-tile" data-go="${go}" ${extra}><span class="ov-tile-title">${title}</span><span class="ov-tile-value">${value}</span><span class="ov-tile-sub">${sub}</span></button>`;
  const tiles = [
    tile('prod', 'Production today', `${fmt(r.todayProdKg)} kg`, `${r.todayProdCount} entr${r.todayProdCount === 1 ? 'y' : 'ies'}`),
    tile('sales', 'Sales today', fmt(r.todaySalesValue), `${r.todaySalesCount} sale${r.todaySalesCount === 1 ? '' : 's'}`),
    tile('sales', 'Open credit sales', fmt(r.openCreditValue), `${r.openCreditCount} not yet received`),
    tile('', 'Stock on hand', fmt(r.stockValue), `${r.stockItems} material${r.stockItems === 1 ? '' : 's'} in stock`, 'data-screen="raw-material-screen"'),
    tile('payments', 'Payments this month', String(r.paymentsThisMonth), 'entries recorded'),
  ].join('');
  const rows = model.months.slice().reverse().map((m) => `<tr><td>${m.label}</td><td>${fmt(m.prodKg)}</td><td>${fmt(m.salesValue)}</td><td>${fmt(m.salesProfit)}</td></tr>`).join('');
  const rb = RANGES.map((n) => `<button type="button" class="ov-range${n === range ? ' is-on' : ''}" data-range="${n}" aria-pressed="${n === range}">${n}M</button>`).join('');
  return `<header class="ov-head"><h2>Overview</h2><div class="ov-ranges" role="group" aria-label="Time range">${rb}</div></header>`
    + `<div class="ov-section-label">Running now</div><div class="ov-tiles">${tiles}</div>`
    + `<div class="ov-section-label">Over time</div><div class="ov-charts">${bars(model.months, 'salesValue', 'Sales value', 'sales')}${bars(model.months, 'prodKg', 'Production (kg)', 'prod')}</div>`
    + `<section class="ov-card"><div class="ov-card-head"><h3>Monthly summary</h3></div><div class="ov-table-wrap"><table class="table ov-table"><thead><tr><th>Month</th><th>Production kg</th><th>Sales</th><th>Sales profit</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

