import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soldStockValue, collectionExpiredCredit, isCashFlowRow } from '../modules/link-graph.js';
import { buildOverview } from '../modules/overview-data.js';

describe('cash model: unsold production is assumed cash, sold stock is not counted twice', () => {
  it('soldStockValue counts real sales and rep supply, never collections or money out', () => {
    assert.equal(soldStockValue({ paymentType: 'CASH', totalValue: 4000 }), 4000);
    assert.equal(soldStockValue({ paymentType: 'CREDIT', totalValue: 8000 }), 8000);
    assert.equal(soldStockValue({ paymentType: 'CREDIT', creditReceived: true, totalValue: 8000 }), 8000);
    assert.equal(soldStockValue({ paymentType: 'CREDIT', salesRep: 'ALI', totalValue: 12000 }), 12000);
    assert.equal(soldStockValue({ paymentType: 'COLLECTION', creditReceived: true, totalValue: 4000 }), 0);
    assert.equal(soldStockValue({ paymentType: 'MONEY_OUT', creditReceived: true, totalValue: 500 }), 0);
    assert.equal(soldStockValue({ paymentType: 'PARTIAL_PAYMENT', totalValue: 500 }), 0);
    assert.equal(soldStockValue({ isMerged: true, mergedSummary: { cashSales: 100, unpaidCredit: 50 } }), 150);
    assert.equal(soldStockValue(null), 0);
  });
  it('isCashFlowRow flags only collection, partial payment and money out', () => {
    for (const t of ['COLLECTION', 'PARTIAL_PAYMENT', 'MONEY_OUT']) assert.equal(isCashFlowRow({ paymentType: t }), true);
    for (const t of ['CASH', 'CREDIT', 'REP_RETURN']) assert.equal(isCashFlowRow({ paymentType: t }), false);
  });
  it('expired stock allocated by a collection is not cash', () => {
    assert.equal(collectionExpiredCredit({ paymentType: 'COLLECTION', expiredAllocated: 800 }), 800);
    assert.equal(collectionExpiredCredit({ paymentType: 'COLLECTION' }), 0);
    assert.equal(collectionExpiredCredit({ paymentType: 'CASH', expiredAllocated: 800 }), 0);
    assert.equal(collectionExpiredCredit({ paymentType: 'COLLECTION', salesRep: 'ALI', expiredAllocated: 800 }), 0);
  });
  it('all three cash formulas subtract sold stock and classify money rows by type', () => {
    const src = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');
    assert.match(src, /_gacProdVal - _gacSoldVal \+ _gacSalesCash/);
    assert.match(src, /finalTotals\.productionValue - finalTotals\.totalSoldValue \+ finalTotals\.returnedStockValue/);
    assert.match(src, /rawData\.totalProductionValue - rawData\.totalSoldValue \+ rawData\.returnedStockValue/);
    assert.equal((src.match(/&& !isCashFlowRow\(sale\)/g) || []).length, 3);
    assert.equal((src.match(/collectionExpiredCredit\(sale\)/g) || []).length, 3);
  });
});

describe('Overview cash', () => {
  it('a credit purchase from a supplier is not money in', () => {
    const now = new Date('2026-11-18T10:00:00');
    const data = { production: [], sales: [], inventory: [], expenses: [], transactions: [
      { id: 't1', type: 'IN', amount: 50000, date: '2026-11-18', isPayable: true, entityName: 'Supplier Two' },
      { id: 't2', type: 'IN', amount: 700, date: '2026-11-18', entityName: 'Supplier One' },
      { id: 't3', type: 'OUT', amount: 200, date: '2026-11-18', entityName: 'Supplier One' }
    ] };
    const model = buildOverview(data, now, 6);
    assert.equal(model.totals.cashIn, 700);
    assert.equal(model.totals.cashOut, 200);
    assert.equal(model.totals.net, 500);
  });
});
