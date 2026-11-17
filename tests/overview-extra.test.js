import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExtras, daysBetween } from '../modules/overview-extra.js';
import { buildOverview, overviewHtml } from '../modules/overview-data.js';

const now = new Date(2026, 10, 16);
const keys = ['2026-09', '2026-10', '2026-11'];
const sale = (o) => ({ id: 's', date: '2026-11-10', customerName: 'Ali', supplyStore: 'A', totalValue: 100, paymentType: 'CREDIT', creditReceived: false, ...o });
const data = {
  sales: [
    sale({ id: '1', date: '2026-11-10', totalValue: 500 }),
    sale({ id: '2', date: '2026-09-20', totalValue: 300, customerName: 'Sara', supplyStore: 'B' }),
    sale({ id: '3', date: '2026-07-01', totalValue: 200, customerName: 'Ali' }),
    sale({ id: '4', date: '2026-11-11', totalValue: 900, paymentType: 'CASH', creditReceived: true, supplyStore: 'A' }),
    sale({ id: '5', date: '2026-11-12', totalValue: 50, isCollection: true }),
    sale({ id: '6', date: '2026-11-12', totalValue: 70, isDeleted: true }),
  ],
  factory: [{ date: '2026-11-02', units: 10, formulaName: 'Base' }, { date: '2026-10-02', units: 4, formulaName: 'Base' }, { date: '2026-10-05', units: 6, formulaName: 'Top' }, { date: '2025-01-01', units: 99, formulaName: 'Old' }, { date: '2026-11-03', units: 5, isDeleted: true }],
  inventory: [{ name: 'Urea', quantity: 10, cost: 100 }, { name: 'DAP', quantity: 0, cost: 50 }, { name: 'Lot', quantity: 0, isPurchaseLot: true }],
  formulas: [
    { id: 'f1', name: 'Base', additionalCost: 0, ingredients: [{ id: 'u', name: 'Urea', cost: 90, quantity: 4 }] },
    { id: 'f2', name: 'Top', additionalCost: 4, ingredients: [{ id: 'u', name: 'Urea', cost: 90, quantity: 1 }, { id: 'formula:f1', kind: 'formula', formulaId: 'f1', name: 'Base', quantity: 2 }] },
    { id: 'f3', name: 'Empty', ingredients: [] },
  ],
};

describe('overview extras', () => {
  it('counts days between dates', () => {
    assert.equal(daysBetween('2026-11-10', '2026-11-16'), 6);
    assert.equal(daysBetween('2026-11-16', '2026-11-10'), 0);
    assert.equal(daysBetween('x', 'y'), 0);
  });

  it('works out who owes what and how old it is, ignoring cash, collections and deleted sales', () => {
    const o = buildExtras(data, now, keys).owed;
    assert.deepEqual([o.total, o.count], [1000, 3]);
    assert.deepEqual([o.d30, o.d60, o.d90], [500, 300, 200]);
    assert.equal(o.oldest, 138);
    assert.deepEqual(o.customers.map((c) => [c.name, c.value, c.count, c.oldest]), [['Ali', 700, 2, 138], ['Sara', 300, 1, 57]]);
  });

  it('splits the range sales by store and by cash or credit', () => {
    const x = buildExtras(data, now, keys);
    assert.deepEqual(x.salesByStore.map((r) => [r.name, r.value]), [['A', 1400], ['B', 300]]);
    assert.deepEqual(x.salesByPay.map((r) => [r.name, r.value]), [['Cash', 900], ['Credit', 800]]);
  });

  it('adds up factory units by month and by formula inside the range', () => {
    const f = buildExtras(data, now, keys).factory;
    assert.equal(f.total, 20);
    assert.deepEqual(f.months.map((m) => m.units), [0, 10, 10]);
    assert.deepEqual(f.formulas.map((r) => [r.name, r.value]), [['Base', 14], ['Top', 6]]);
  });

  it('lists out-of-stock materials and the live cost per kg of each formula, linked ones included', () => {
    const x = buildExtras(data, now, keys);
    assert.deepEqual([x.outOfStock.count, x.outOfStock.names], [1, ['DAP']]);
    assert.deepEqual(x.formulaCosts.map((c) => [c.name, Math.round(c.value * 100) / 100, c.linked]), [['Top', 101.33, true], ['Base', 100, false]]);
  });

  it('copes with empty data', () => {
    assert.doesNotThrow(() => buildExtras({}, now, keys));
    assert.doesNotThrow(() => overviewHtml(buildOverview({}, now, 3), 3));
  });

  it('adds the sections to the overview, each linked to its tab', () => {
    const html = overviewHtml(buildOverview(data, now, 3), 3);
    for (const t of ['Who owes you', 'Total owed', 'Over 60 days', 'Sales by store', 'Cash and credit sales', 'Factory output \\(units\\)', 'Factory output by formula', 'Formula cost per kg', 'Out of stock']) assert.match(html, new RegExp(t));
    assert.match(html, /Top \(linked\)/);
    assert.match(html, /Ali \(138d\)/);
    const bare = overviewHtml(buildOverview({ sales: [sale({ paymentType: 'CASH', creditReceived: true })] }, now, 3), 3);
    assert.doesNotMatch(bare, /Who owes you|Factory output|Formula cost/);
  });
});
