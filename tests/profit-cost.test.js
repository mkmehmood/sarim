import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCostIndex, costPerKgFromIndex, repriceSale, repriceCalc, isCostedSale, kgPerUnitFromProduction, formulaCostPerKg } from '../modules/profit-cost.js';
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

describe('formula cost per kg', () => {
  it('converts formula unit cost to per-kg', () => {
    const prod = [{ store: 'zubair', net: 90, formulaUnits: 3 }, { store: 'zubair', net: 30, formulaUnits: 1 }];
    assert.equal(kgPerUnitFromProduction(prod, 'zubair'), 30);
    assert.equal(formulaCostPerKg(3259.62, 30), 108.654);
  });
});

it('planProductionDayReprice sets sales of that day to the production cost per kg', async () => {
  const { planProductionDayReprice, saleCostDate } = await import('../modules/profit-cost.js');
  const prod = [{ store: 'zubair', date: '2026-10-11', net: 100, totalCost: 34000 }];
  const sales = [
    { id: 's1', supplyStore: 'zubair', supplyDate: '2026-10-11', date: '2026-10-12', quantity: 65, totalValue: 26000, totalCost: 211875, profit: -185875 },
    { id: 's2', supplyStore: 'zubair', supplyDate: '2026-10-13', date: '2026-10-13', quantity: 5, totalValue: 2000, totalCost: 1, profit: 1999 },
  ];
  assert.equal(saleCostDate(sales[0]), '2026-10-11');
  const { fixed } = planProductionDayReprice(sales, prod, 'zubair', '2026-10-11');
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].totalCost, 22100);
  assert.equal(fixed[0].costSource, 'production-day');
});
