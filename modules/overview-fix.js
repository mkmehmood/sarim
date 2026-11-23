import { describeFormula } from './formula-links.js';
import { LINK_CODES } from './link-repair.js';
import { LIMITS, MAX_AMOUNT, dateIssue, numberIssue } from './input-guards.js';

const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const blank = (v) => v === undefined || v === null || v === '';
const notNumber = (v) => !blank(v) && !Number.isFinite(parseFloat(v));
const round2 = (v) => Math.round(v * 100) / 100;
const _arr = (v) => (Array.isArray(v) ? v : []);

const NUMERIC = {
  sales: ['quantity', 'totalValue', 'totalCost', 'profit', 'unitPrice'],
  production: ['net', 'totalSale', 'totalCost', 'profit'],
  transactions: ['amount'],
  expenses: ['amount'],
  inventory: ['quantity', 'cost'],
};

const LABELS = {
  quantity: 'Quantity', totalValue: 'Total value', totalCost: 'Total cost', profit: 'Profit', unitPrice: 'Unit price',
  net: 'Net weight (kg)', totalSale: 'Total sale', amount: 'Amount', cost: 'Cost per unit', date: 'Date',
};

const qty = (key, value = '') => ({ key, label: LABELS[key], type: 'number', value, min: LIMITS.QTY_MIN, max: LIMITS.QTY_MAX });
const money = (key, value = '', extra = {}) => ({ key, label: LABELS[key] || key, type: 'number', value, min: 0, max: MAX_AMOUNT, ...extra });

export function planFields(col, rec, codes, today, ctx = {}) {
  const fields = [];
  const notes = [];
  const seen = new Set();
  const add = (f) => { if (!seen.has(f.key)) { seen.add(f.key); fields.push(f); } };
  const has = (c) => codes.includes(c);
  if (codes.some((c) => LINK_CODES.includes(c))) {
    if (has('col_unapplied')) notes.push('This collection recorded more cash than the sales confirm. Repair keeps the part the sales confirm, then applies the rest to this customer\u2019s unpaid sales, newest first. Any cash left over stays as customer credit.');
    if (has('link_orphan')) notes.push('This sale is marked as paid by a collection that was deleted. Repair takes that payment off the sale so it is owed again.');
    return { fields, notes, newId: false, deletable: false, repair: true };
  }
  const v = _n(rec.totalValue);
  const c = _n(rec.totalCost);
  const q = _n(rec.quantity);
  let newId = false;

  if (has('sale_profit_mismatch')) { add(money('profit', round2(v - c), { min: -MAX_AMOUNT })); notes.push('Profit should equal total value minus total cost.'); }
  if (has('sale_total_mismatch')) {
    add(money('unitPrice', rec.unitPrice, { min: 0.01 }));
    add(money('totalValue', rec.totalValue));
    notes.push(`Quantity times unit price is ${round2(_n(rec.unitPrice) * q).toLocaleString('en-US')}, but the total value is ${round2(v).toLocaleString('en-US')}.`);
  }
  if (has('sale_no_cost')) add(money('totalCost', '', { min: 0.01 }));
  if (has('sale_loss')) { add(money('totalValue', rec.totalValue)); add(money('totalCost', rec.totalCost, { min: 0.01 })); }
  if (has('sale_bad_qty')) add(qty('quantity'));
  if (has('sale_negative_value')) add(money('totalValue', ''));
  if (has('sale_cash_unreceived')) add({ key: 'creditReceived', label: 'Cash has been received', type: 'check', value: true });
  if (has('bad_date') || has('future_date')) add({ key: 'date', label: LABELS.date, type: 'date', value: today });
  if (has('not_a_number')) {
    _arr(NUMERIC[col]).filter((k) => notNumber(rec[k])).forEach((k) => add(money(k, '', { min: k === 'profit' ? -MAX_AMOUNT : 0 })));
  }
  if (has('prod_profit_mismatch')) { add(money('profit', round2(_n(rec.totalSale) - _n(rec.totalCost)), { min: -MAX_AMOUNT })); notes.push('Profit should equal total sale minus total cost.'); }
  if (has('prod_bad_net')) add(qty('net'));
  if (has('prod_no_formula') && _arr(ctx.formulas).length) {
    add({ key: 'formulaId', label: 'Formula', type: 'select', value: '', options: ctx.formulas.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' })) });
    notes.push(_n(rec.formulaUnits) > 0 ? 'The cost and profit are recalculated from the formula.' : 'Only the formula is set; the saved cost stays.');
  }
  if (has('txn_bad_type')) add({ key: 'type', label: 'Type', type: 'select', value: '', options: [{ value: 'IN', label: 'Cash in' }, { value: 'OUT', label: 'Cash out' }] });
  if (has('txn_bad_amount')) add(money('amount', '', { min: 0 }));
  if (has('exp_bad_amount')) add(money('amount', '', { min: 0.01 }));
  if (has('txn_missing_entity') && _arr(ctx.entities).length) {
    add({ key: 'entityId', label: 'Account', type: 'select', value: '', options: ctx.entities.filter((e) => e && !e.isDeleted).map((e) => ({ value: String(e.id), label: e.name || 'Unnamed' })) });
  }
  if (has('inv_negative_qty')) add(money('quantity', 0));
  if (has('inv_bad_cost')) add(money('cost', '', { min: 0.01 }));
  if (has('duplicate_id')) { newId = true; notes.push('This record shares its id with another one. Saving gives it a new id.'); }
  if (has('duplicate_record')) notes.push('This looks like the same record entered twice. Delete the extra copy.');
  const deletable = col !== 'inventory' && (has('duplicate_record') || (!fields.length && !newId));
  return { fields, notes, newId, deletable };
}

export function validateValues(fields, raw, today) {
  const values = {};
  for (const f of fields) {
    const text = String(raw[f.key] == null ? '' : raw[f.key]).trim();
    if (f.type === 'check') { values[f.key] = raw[f.key] === true || raw[f.key] === 'true'; continue; }
    if (f.type === 'select') {
      if (!f.options.some((o) => o.value === text)) return { ok: false, message: `Choose a ${f.label.toLowerCase()}.` };
      values[f.key] = text;
      continue;
    }
    if (f.type === 'date') {
      if (!text) return { ok: false, message: 'Pick a date.' };
      const issue = dateIssue(text, today);
      if (issue) return { ok: false, message: issue };
      values[f.key] = text;
      continue;
    }
    const negative = text.startsWith('-') && f.min < 0;
    const issue = numberIssue(negative ? text.slice(1) : text, { label: f.label, min: 0, max: f.max, minExclusive: false });
    if (issue) return { ok: false, message: issue };
    const n = Number(String(negative ? text.slice(1) : text).replace(/,/g, '')) * (negative ? -1 : 1);
    if (n < f.min) return { ok: false, message: `${f.label} cannot be less than ${f.min}.` };
    values[f.key] = n;
  }
  return { ok: true, values };
}

export function applyValues(col, rec, values, ctx = {}) {
  const next = { ...rec };
  Object.keys(values).forEach((k) => {
    if (k === 'formulaId') {
      const f = _arr(ctx.formulas).find((x) => String(x.id) === String(values[k]));
      if (!f) return;
      next.formulaId = f.id;
      next.formulaName = f.name || 'Untitled';
      const units = _n(rec.formulaUnits);
      if (units > 0) {
        const total = round2(describeFormula(f, ctx.formulas, ctx.inventory).perUnit * units);
        const net = _n(rec.net);
        next.formulaCost = total;
        next.totalCost = total;
        next.cp = net > 0 ? round2(total / net) : 0;
        next.profit = round2(_n(rec.totalSale) - total);
      }
    } else if (k === 'entityId') {
      const e = _arr(ctx.entities).find((x) => String(x.id) === String(values[k]));
      if (!e) return;
      next.entityId = e.id;
      next.entityName = e.name || next.entityName;
    } else {
      next[k] = values[k];
    }
  });
  if (col === 'sales' && ('totalValue' in values || 'totalCost' in values) && !('profit' in values)) {
    next.profit = round2(_n(next.totalValue) - _n(next.totalCost));
  }
  return next;
}
