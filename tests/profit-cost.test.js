import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCostIndex, costPerKgFromIndex, repriceSale, repriceCalc, isCostedSale } from '../modules/profit-cost.js';
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
