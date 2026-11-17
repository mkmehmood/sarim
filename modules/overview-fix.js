import { describeFormula } from './formula-links.js';

const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _arr = (v) => (Array.isArray(v) ? v : []);
const blank = (v) => v === undefined || v === null || v === '';
const notNumber = (v) => !blank(v) && !Number.isFinite(parseFloat(v));
const round2 = (v) => Math.round(v * 100) / 100;

const NUMERIC = {
  sales: ['quantity', 'totalValue', 'totalCost', 'profit', 'unitPrice'],
  production: ['net', 'totalSale', 'totalCost', 'profit'],
  transactions: ['amount'],
  expenses: ['amount'],
  inventory: ['quantity', 'cost'],
};

export function parseInput(fix, raw) {
  const text = String(raw == null ? '' : raw).trim();
  const inp = fix.input;
  if (!inp) return { ok: true, value: null };
  if (inp.type === 'select') return inp.options.some((o) => o.value === text) ? { ok: true, value: text } : { ok: false, message: `Choose a ${inp.label.toLowerCase()}.` };
  if (inp.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { ok: true, value: text } : { ok: false, message: 'Pick a valid date.' };
  const v = parseFloat(text);
  if (!Number.isFinite(v) || text === '') return { ok: false, message: `${inp.label} must be a number.` };
  if (inp.min !== undefined && (inp.exclusive ? v <= inp.min : v < inp.min)) return { ok: false, message: `${inp.label} must be ${inp.exclusive ? 'more than' : 'at least'} ${inp.min}.` };
  return { ok: true, value: v };
}

const salesProfit = (rec, value, cost) => ({ profit: round2(value - cost) });

export function planFixes(col, rec, codes, today, ctx = {}) {
  const fixes = [];
  const seen = new Set();
  const add = (f) => { if (!seen.has(f.id)) { seen.add(f.id); fixes.push(f); } };
  const has = (c) => codes.includes(c);
  const v = _n(rec.totalValue);
  const c = _n(rec.totalCost);
  const q = _n(rec.quantity);

  if (has('sale_profit_mismatch')) add({ id: 'profit', label: 'Set profit to value minus cost', hint: `${round2(v - c).toLocaleString('en-US')}`, patch: () => salesProfit(rec, v, c) });
  if (has('sale_total_mismatch')) {
    add({ id: 'total_from_price', label: 'Set total to quantity x price', hint: `${round2(_n(rec.unitPrice) * q).toLocaleString('en-US')}`, patch: () => ({ totalValue: round2(_n(rec.unitPrice) * q), ...salesProfit(rec, round2(_n(rec.unitPrice) * q), c) }) });
    if (q > 0) add({ id: 'price_from_total', label: 'Set price to total divided by quantity', hint: `${round2(v / q)}`, patch: () => ({ unitPrice: round2(v / q) }) });
  }
  if (has('sale_no_cost')) add({ id: 'cost', label: 'Enter the cost', input: { field: 'totalCost', label: 'Total cost', type: 'number', min: 0, exclusive: true, value: '' }, patch: (x) => ({ totalCost: x, ...salesProfit(rec, v, x) }) });
  if (has('sale_cash_unreceived')) add({ id: 'received', label: 'Mark the cash as received', patch: () => ({ creditReceived: true }) });
  if (has('sale_bad_qty')) add({ id: 'qty', label: 'Enter the quantity', input: { field: 'quantity', label: 'Quantity', type: 'number', min: 0, exclusive: true, value: '' }, patch: (x) => ({ quantity: x }) });
  if (has('sale_negative_value')) add({ id: 'value', label: 'Enter the sale value', input: { field: 'totalValue', label: 'Total value', type: 'number', min: 0, value: '' }, patch: (x) => ({ totalValue: x, ...salesProfit(rec, x, c) }) });
  if (has('bad_date') || has('future_date')) add({ id: 'date', label: 'Set the date', input: { field: 'date', label: 'Date', type: 'date', value: today }, patch: (x) => ({ date: x }) });
  if (has('not_a_number')) {
    (NUMERIC[col] || []).filter((k) => notNumber(rec[k])).forEach((k) => add({ id: `num_${k}`, label: `Set ${k}`, input: { field: k, label: k, type: 'number', value: '' }, patch: (x) => ({ [k]: x }) }));
  }
  if (has('prod_profit_mismatch')) add({ id: 'profit', label: 'Set profit to sale minus cost', hint: `${round2(_n(rec.totalSale) - _n(rec.totalCost)).toLocaleString('en-US')}`, patch: () => ({ profit: round2(_n(rec.totalSale) - _n(rec.totalCost)) }) });
  if (has('prod_no_formula') && _arr(ctx.formulas).length) {
    const options = ctx.formulas.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' }));
    const find = (id) => ctx.formulas.find((f) => String(f.id) === String(id));
    const units = _n(rec.formulaUnits);
    const label = { field: 'formula', label: 'Formula', type: 'select', options, value: '' };
    if (units > 0) {
      add({ id: 'formula_cost', label: 'Assign a formula and recalculate cost and profit', input: label, patch: (id) => {
        const f = find(id);
        const d = describeFormula(f, ctx.formulas, ctx.inventory);
        const total = round2(d.perUnit * units);
        const net = _n(rec.net);
        return { formulaId: f.id, formulaName: f.name || 'Untitled', formulaCost: total, totalCost: total, cp: net > 0 ? round2(total / net) : 0, profit: round2(_n(rec.totalSale) - total) };
      } });
    }
    add({ id: 'formula_only', label: 'Assign a formula and keep the saved cost', input: label, patch: (id) => { const f = find(id); return { formulaId: f.id, formulaName: f.name || 'Untitled' }; } });
  }
  if (has('prod_bad_net')) add({ id: 'net', label: 'Enter the weight (kg)', input: { field: 'net', label: 'Weight', type: 'number', min: 0, exclusive: true, value: '' }, patch: (x) => ({ net: x }) });
  if (has('txn_bad_type')) { add({ id: 'type_in', label: 'Make it cash in', patch: () => ({ type: 'IN' }) }); add({ id: 'type_out', label: 'Make it cash out', patch: () => ({ type: 'OUT' }) }); }
  if (has('txn_bad_amount')) add({ id: 'amount', label: 'Enter the amount', input: { field: 'amount', label: 'Amount', type: 'number', min: 0, value: '' }, patch: (x) => ({ amount: x }) });
  if (has('exp_bad_amount')) add({ id: 'amount', label: 'Enter the amount', input: { field: 'amount', label: 'Amount', type: 'number', min: 0, exclusive: true, value: '' }, patch: (x) => ({ amount: x }) });
  if (has('inv_negative_qty')) add({ id: 'stock', label: 'Set the stock quantity', input: { field: 'quantity', label: 'Quantity', type: 'number', min: 0, value: '0' }, patch: (x) => ({ quantity: x }) });
  if (has('inv_bad_cost')) add({ id: 'invcost', label: 'Enter the cost', input: { field: 'cost', label: 'Cost per unit', type: 'number', min: 0, exclusive: true, value: '' }, patch: (x) => ({ cost: x }) });
  if (has('duplicate_id')) add({ id: 'newid', label: 'Give this record a new id', kind: 'newid' });
  if (col !== 'inventory') add({ id: 'delete', label: has('duplicate_record') ? 'Delete this copy' : 'Delete this record', kind: 'delete', danger: true });
  add({ id: 'open', label: 'Open the screen instead', kind: 'open' });
  return fixes;
}

export function applyFix(rec, fix, value) {
  const next = { ...rec };
  if (fix.patch) Object.assign(next, fix.patch(value));
  return next;
}
