import { localDateStr } from './finance.js';
import { isLedgerRow } from './overview-audit.js';
import { describeFormula } from './formula-links.js';

const _arr = (v) => (Array.isArray(v) ? v : []);
const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const live = (r) => !!r && typeof r === 'object' && !r.isDeleted;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const dateOf = (r) => (typeof r.date === 'string' && DATE.test(r.date) ? r.date.slice(0, 10) : '');
const ranked = (map, limit) => [...map.entries()].map(([name, v]) => ({ name, value: v.value, count: v.count })).sort((a, b) => b.value - a.value).slice(0, limit || undefined);
const bump = (map, key, value) => { const o = map.get(key) || { value: 0, count: 0 }; o.value += value; o.count += 1; map.set(key, o); };

export function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}

export function buildExtras(data, now, keys) {
  const today = localDateStr(now);
  const keySet = new Set(keys);
  const owed = { total: 0, count: 0, d30: 0, d60: 0, d90: 0, oldest: 0, customers: [] };
  const owedBy = new Map();
  const oldestBy = new Map();
  const byStore = new Map();
  const byPay = new Map();
  _arr(data.sales).filter(live).forEach((s) => {
    if (isLedgerRow(s)) return;
    const val = _n(s.totalValue);
    const d = dateOf(s);
    const pay = String(s.paymentType || '').toUpperCase() === 'CASH' ? 'Cash' : 'Credit';
    if (keySet.has(d.slice(0, 7))) { bump(byStore, s.supplyStore || 'Unassigned', val); bump(byPay, pay, val); }
    if (pay === 'Credit' && s.creditReceived !== true && val > 0) {
      const age = d ? daysBetween(d, today) : 0;
      owed.total += val; owed.count += 1;
      if (age <= 30) owed.d30 += val; else if (age <= 60) owed.d60 += val; else owed.d90 += val;
      owed.oldest = Math.max(owed.oldest, age);
      const name = s.customerName || 'Walk-in';
      bump(owedBy, name, val);
      oldestBy.set(name, Math.max(oldestBy.get(name) || 0, age));
    }
  });
  owed.customers = ranked(owedBy).map((c) => ({ ...c, oldest: oldestBy.get(c.name) || 0 }));

  const fMonths = new Map(keys.map((k) => [k, 0]));
  const fFormula = new Map();
  let fUnits = 0;
  _arr(data.factory).filter(live).forEach((f) => {
    const d = dateOf(f);
    const k = d.slice(0, 7);
    if (!fMonths.has(k)) return;
    const u = _n(f.units);
    fMonths.set(k, fMonths.get(k) + u);
    fUnits += u;
    bump(fFormula, f.formulaName || 'No formula', u);
  });
  const factory = { total: fUnits, months: keys.map((k) => ({ key: k, units: fMonths.get(k) })), formulas: ranked(fFormula) };

  const inv = _arr(data.inventory).filter(live).filter((i) => !i.isPurchaseLot);
  const out = inv.filter((i) => _n(i.quantity) <= 0).map((i) => i.name || 'Material');
  const formulas = _arr(data.formulas).filter((f) => f && f.id);
  const costs = formulas.map((f) => {
    const d = describeFormula(f, formulas, inv);
    return { name: f.name || 'Untitled', value: d.weight > 0 ? d.perUnit / d.weight : 0, linked: _arr(f.ingredients).some((i) => i && i.kind === 'formula') };
  }).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  return {
    owed,
    salesByStore: ranked(byStore),
    salesByPay: ranked(byPay),
    factory,
    outOfStock: { count: out.length, names: out },
    formulaCosts: costs,
  };
}
