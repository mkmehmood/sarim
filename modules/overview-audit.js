import { auditLinks } from './link-repair.js';

const _arr = (v) => (Array.isArray(v) ? v : []);
const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const blank = (v) => v === undefined || v === null || v === '';
const notNumber = (v) => !blank(v) && !Number.isFinite(parseFloat(v));
const live = (r) => !!r && typeof r === 'object' && !r.isDeleted;
const DATE = /^\d{4}-\d{2}-\d{2}/;

const LEDGER_PAYMENTS = new Set(['COLLECTION', 'PARTIAL_PAYMENT', 'MONEY_OUT', 'REP_RETURN']);
export function isLedgerRow(x) {
  return !!x && (!!x.isCollection || !!x.isRepTransfer || x.transactionType === 'OLD_DEBT' || LEDGER_PAYMENTS.has(x.paymentType));
}

export const CHECKS = {
  duplicate_id: { label: 'Same record id used twice', severity: 'error' },
  duplicate_record: { label: 'Identical records entered twice', severity: 'warn' },
  not_a_number: { label: 'Amount or quantity is not a number', severity: 'error' },
  bad_date: { label: 'Missing or invalid date', severity: 'error' },
  future_date: { label: 'Dated in the future', severity: 'warn' },
  sale_bad_qty: { label: 'Sale with zero or negative quantity', severity: 'error' },
  sale_negative_value: { label: 'Sale with negative value', severity: 'error' },
  sale_total_mismatch: { label: 'Sale total differs from quantity x price', severity: 'error' },
  sale_profit_mismatch: { label: 'Sale profit differs from value minus cost', severity: 'warn' },
  sale_no_cost: { label: 'Sale with no cost recorded', severity: 'warn' },
  sale_cash_unreceived: { label: 'Cash sale not marked as received', severity: 'warn' },
  prod_no_formula: { label: 'Production with no formula (cost and profit are unreliable)', severity: 'error' },
  prod_bad_net: { label: 'Production with zero or negative weight', severity: 'error' },
  prod_profit_mismatch: { label: 'Production profit differs from sale minus cost', severity: 'warn' },
  txn_bad_type: { label: 'Payment is neither in nor out', severity: 'error' },
  txn_bad_amount: { label: 'Payment with a negative amount', severity: 'error' },
  txn_missing_entity: { label: 'Payment for an account that no longer exists', severity: 'warn' },
  exp_bad_amount: { label: 'Expense with zero or negative amount', severity: 'error' },
  inv_negative_qty: { label: 'Material with negative stock', severity: 'error' },
  inv_bad_cost: { label: 'Material with no cost', severity: 'warn' },
  col_unapplied: { label: 'Collection cash not applied to any sale', severity: 'error' },
  link_orphan: { label: 'Sale marked paid by a collection that no longer exists', severity: 'error' },
};

const LINK_META = { rep: { label: 'Rep record', go: 'sales', title: (r) => r.customerName || 'Rep record' } };

const COLLECTIONS = {
  sales: { label: 'Sale', go: 'sales', title: (r) => r.customerName || 'Sale' },
  production: { label: 'Production', go: 'prod', title: (r) => r.store || r.formulaName || 'Production' },
  transactions: { label: 'Payment', go: 'payments', title: (r) => r.entityName || 'Payment' },
  expenses: { label: 'Expense', go: 'payments', title: (r) => r.name || r.category || 'Expense' },
  inventory: { label: 'Material', go: 'raw-material-screen', screen: true, title: (r) => r.name || 'Material' },
};

const day = (r) => {
  if (typeof r.date === 'string' && DATE.test(r.date)) return r.date.slice(0, 10);
  return '';
};

const NUMERIC = {
  sales: ['quantity', 'totalValue', 'totalCost', 'profit', 'unitPrice'],
  production: ['net', 'totalSale', 'totalCost', 'profit'],
  transactions: ['amount'],
  expenses: ['amount'],
  inventory: ['quantity', 'cost'],
};

export function auditData(data, today) {
  const findings = [];
  const counts = {};
  const scanned = {};
  const entityIds = new Set(_arr(data.entities).filter(live).map((e) => String(e.id)));
  const hasEntities = entityIds.size > 0;
  const flag = (col, rec, code, detail, impact = 0) => {
    counts[code] = (counts[code] || 0) + 1;
    let f = findings.find((x) => x.rec === rec);
    if (!f) {
      f = { rec, idx: _arr(data[col]).indexOf(rec), codes: [], collection: col, id: rec.id == null ? '' : String(rec.id), date: day(rec), title: (COLLECTIONS[col] || LINK_META[col]).title(rec), go: (COLLECTIONS[col] || LINK_META[col]).go, screen: !!(COLLECTIONS[col] || LINK_META[col]).screen, label: (COLLECTIONS[col] || LINK_META[col]).label, reasons: [], severity: 'warn', impact: 0 };
      findings.push(f);
    }
    f.codes.push(code);
    f.reasons.push(detail ? `${CHECKS[code].label} (${detail})` : CHECKS[code].label);
    if (CHECKS[code].severity === 'error') f.severity = 'error';
    if (Math.abs(impact) > Math.abs(f.impact)) f.impact = impact;
  };
  const fmt = (v) => Math.round(v).toLocaleString('en-US');

  Object.keys(COLLECTIONS).forEach((col) => {
    const rows = _arr(data[col]).filter(live);
    scanned[col] = rows.length;
    const ids = new Map();
    const sig = new Map();
    rows.forEach((r) => {
      if (!blank(r.id)) ids.set(String(r.id), (ids.get(String(r.id)) || 0) + 1);
      const bad = NUMERIC[col].filter((k) => notNumber(r[k]));
      if (bad.length) flag(col, r, 'not_a_number', bad.join(', '));
      if (col !== 'inventory') {
        if (!day(r)) flag(col, r, 'bad_date');
        else if (day(r) > today) flag(col, r, 'future_date', day(r));
      }
      if (col === 'sales' && !isLedgerRow(r)) {
        const q = _n(r.quantity); const v = _n(r.totalValue); const c = _n(r.totalCost); const p = _n(r.profit);
        if (q <= 0) flag(col, r, 'sale_bad_qty', String(r.quantity));
        if (v < 0) flag(col, r, 'sale_negative_value', fmt(v), v);
        if (!blank(r.unitPrice) && q > 0 && Math.abs(_n(r.unitPrice) * q - v) > Math.max(1, v * 0.005)) flag(col, r, 'sale_total_mismatch', `${fmt(q)} x ${_n(r.unitPrice).toFixed(2)} = ${fmt(_n(r.unitPrice) * q)}, saved ${fmt(v)}`, _n(r.unitPrice) * q - v);
        if (Math.abs(p - (v - c)) > 1) flag(col, r, 'sale_profit_mismatch', `saved ${fmt(p)}, value minus cost ${fmt(v - c)}`, p - (v - c));
        if (c <= 0 && v > 0) flag(col, r, 'sale_no_cost', `value ${fmt(v)}`, v);
        if (String(r.paymentType || '').toUpperCase() === 'CASH' && r.creditReceived === false) flag(col, r, 'sale_cash_unreceived');
        sig.set([r.customerName, r.date, r.time, r.quantity, r.totalValue].join('|'), [...(sig.get([r.customerName, r.date, r.time, r.quantity, r.totalValue].join('|')) || []), r]);
      }
      if (col === 'production' && r.isReturn !== true && r.isTransfer !== true) {
        if (_n(r.net) <= 0) flag(col, r, 'prod_bad_net', String(r.net));
        if (blank(r.formulaName)) flag(col, r, 'prod_no_formula', `${fmt(_n(r.net))} kg`, _n(r.profit));
        if (!blank(r.totalSale) && Math.abs(_n(r.profit) - (_n(r.totalSale) - _n(r.totalCost))) > 1) flag(col, r, 'prod_profit_mismatch', `saved ${fmt(_n(r.profit))}, expected ${fmt(_n(r.totalSale) - _n(r.totalCost))}`, _n(r.profit) - (_n(r.totalSale) - _n(r.totalCost)));
      }
      if (col === 'transactions') {
        if (r.type !== 'IN' && r.type !== 'OUT') flag(col, r, 'txn_bad_type', String(r.type));
        if (_n(r.amount) < 0) flag(col, r, 'txn_bad_amount', String(r.amount));
        if (hasEntities && r.entityId && !entityIds.has(String(r.entityId))) flag(col, r, 'txn_missing_entity', r.entityName || String(r.entityId), _n(r.amount));
      }
      if (col === 'expenses' && _n(r.amount) <= 0) flag(col, r, 'exp_bad_amount', String(r.amount));
      if (col === 'inventory' && !r.isPurchaseLot) {
        if (_n(r.quantity) < 0) flag(col, r, 'inv_negative_qty', String(r.quantity), _n(r.quantity) * _n(r.cost));
        if (_n(r.cost) <= 0 && _n(r.quantity) > 0) flag(col, r, 'inv_bad_cost');
      }
    });
    rows.forEach((r) => { if (!blank(r.id) && ids.get(String(r.id)) > 1) flag(col, r, 'duplicate_id', `id ${r.id}`); });
    sig.forEach((group) => { if (group.length > 1) group.forEach((r) => flag(col, r, 'duplicate_record', `${group.length} copies`, _n(r.totalValue))); });
  });

  ['sales', 'rep'].forEach((col) => {
    if (!_arr(data[col]).length) return;
    auditLinks(_arr(data[col]), col).forEach((i) => flag(col, i.rec, i.code, i.detail, i.amount));
  });

  const rank = (f) => (f.severity === 'error' ? 0 : 1);
  findings.sort((a, b) => rank(a) - rank(b) || Math.abs(b.impact) - Math.abs(a.impact) || b.date.localeCompare(a.date));
  const byCheck = Object.keys(counts).map((code) => ({ code, count: counts[code], ...CHECKS[code] })).sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'error' ? -1 : 1));
  const total = Object.values(scanned).reduce((s, n) => s + n, 0);
  return { findings, byCheck, scanned, total, errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity !== 'error').length };
}
