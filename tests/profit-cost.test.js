import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCostIndex, costPerKgFromIndex, repriceSale, repriceCalc, isCostedSale, planNegativeProfitFix } from '../modules/profit-cost.js';
const production = [
  { id: 'p1', store: 'zubair', date: '2026-10-17', net: 100, totalCost: 30000 },
  { id: 'p2', store: 'zubair', date: '2026-10-18', net: 50, totalCost: 20000 },
  { id: 'p3', store: 'zubair', date: '2026-10-18', net: 10, totalCost: 9999, isReturn: true },
  { id: 'p4', store: 'zubair', date: '2026-10-19', net: 10, totalCost: 9999, deletedAt: 1 },
];
describe('realized cost per kg', () => {
  const idx = buildCostIndex(production);
  it('uses the production cost of the same store and day', () => {
    assert.equal(costPerKgFromIndex(idx, 'zubair', '2026-10-17'), 300);
    assert.equal(costPerKgFromIndex(idx, 'zubair', '2026-10-18'), 400);
  });
  it('falls back to the store weighted average and ignores returns and deleted entries', () => {
    assert.equal(costPerKgFromIndex(idx, 'zubair', '2026-12-01'), 50000 / 150);
    assert.equal(costPerKgFromIndex(idx, 'unknown', '2026-10-17'), 0);
  });
});
describe('repricing', () => {
  it('sale profit is value minus quantity times cost per kg', () => {
    assert.deepEqual(repriceSale({ quantity: 10, totalValue: 4000 }, 300), { totalCost: 3000, profit: 1000 });
  });
  it('calculator profit uses net sold quantity', () => {
    const r = repriceCalc({ totalSold: 78, returned: 1, expired: 2, shared: 2, revenue: 29200 }, 300);
    assert.deepEqual(r, { costPrice: 300, totalCost: 21900, profit: 7300 });
  });
  it('collections, transfers and old debt are never costed', () => {
    assert.equal(isCostedSale({ quantity: 0, paymentType: 'COLLECTION' }), false);
    assert.equal(isCostedSale({ quantity: 5, isRepTransfer: true }), false);
    assert.equal(isCostedSale({ quantity: 5, paymentType: 'CREDIT' }), true);
  });
});

describe('negative profit migration plan', () => {
  const sales = [
    { id: 's1', supplyStore: 'zubair', date: '2026-10-17', quantity: 65, totalValue: 26000, totalCost: 211876.3, profit: -185876.3 },
    { id: 's2', supplyStore: 'zubair', date: '2026-10-18', quantity: 10, totalValue: 3000, totalCost: 4000, profit: -1000 },
    { id: 's3', supplyStore: 'nowhere', date: '2026-10-18', quantity: 10, totalValue: 3000, totalCost: 9000, profit: -6000 },
    { id: 's4', supplyStore: 'zubair', date: '2026-10-17', quantity: 10, totalValue: 5000, totalCost: 3000, profit: 2000 },
    { id: 's5', supplyStore: 'zubair', date: '2026-10-17', quantity: 0, paymentType: 'COLLECTION', totalValue: 0, totalCost: 0, profit: -5 },
  ];
  const plan = planNegativeProfitFix(sales, production);
  it('reprices only losing sales using the store and day cost per kg', () => {
    assert.deepEqual(plan.fixed.map(f => [f.id, f.totalCost, f.profit]), [['s1', 19500, 6500]]);
  });
  it('leaves honest losses and sales with no known cost alone, and reports the latter', () => {
    assert.deepEqual(plan.unfixable, ['s3']);
  });
  it('is idempotent once applied', () => {
    const applied = sales.map(s => { const f = plan.fixed.find(x => x.id === s.id); return f ? { ...s, totalCost: f.totalCost, profit: f.profit } : s; });
    assert.equal(planNegativeProfitFix(applied, production).fixed.length, 0);
  });
});
