import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPurchaseDelta, buildPurchaseLot, collectedKg, findMaterialByName, materialPending, materialRecords, purchasesOf, searchMaterials } from '../modules/raw-purchases.js';

const mat = (o = {}) => ({ id: 'm1', name: 'Sugar', quantity: 0, cost: 0, ...o });

describe('raw purchases', () => {
  it('blends cost and adds to collected weight across purchases', () => {
    const m = mat();
    applyPurchaseDelta(m, { deltaKg: 100, deltaAmount: 1000, conversionFactor: 1, costPerUnit: 10 });
    applyPurchaseDelta(m, { deltaKg: 100, deltaAmount: 2000, conversionFactor: 1, costPerUnit: 20 });
    assert.equal(m.quantity, 200);
    assert.equal(m.cost, 15);
    assert.equal(collectedKg(m), 200);
  });
  it('keeps collected weight when stock is used, and falls back to quantity for legacy rows', () => {
    const m = mat({ quantity: 50, cost: 10 });
    assert.equal(collectedKg(m), 50);
    applyPurchaseDelta(m, { deltaKg: 50, deltaAmount: 500 });
    m.quantity = 20;
    assert.equal(collectedKg(m), 100);
  });
  it('refuses to remove more weight than is in stock', () => {
    const m = mat({ quantity: 10, cost: 5, collectedKg: 10 });
    const r = applyPurchaseDelta(m, { deltaKg: -15, deltaAmount: -75 });
    assert.equal(r.ok, false);
    assert.equal(m.quantity, 10);
  });
  it('builds a purchase record with weight, amount and per kg cost', () => {
    const l = buildPurchaseLot(mat(), { id: 'l1', units: 4, conversionFactor: 25, costPerUnit: 500, unitName: 'bag', date: '2026-10-01' });
    assert.equal(l.purchaseKg, 100);
    assert.equal(l.totalValue, 2000);
    assert.equal(l.cost, 20);
    assert.equal(l.materialRefId, 'm1');
    assert.equal(l.quantity, 0);
  });
  it('lists materials without purchase records and finds them by name', () => {
    const inv = [mat(), { id: 'l1', isPurchaseLot: true, materialRefId: 'm1', purchaseDate: '2026-10-01' }, mat({ id: 'm2', name: 'Salt' })];
    assert.equal(materialRecords(inv).length, 2);
    assert.equal(findMaterialByName(inv, ' sugar ').id, 'm1');
    assert.deepEqual(searchMaterials(inv, 'sa').map((m) => m.id), ['m2']);
    assert.equal(purchasesOf(inv, 'm1').length, 1);
  });
  it('adds up what is still owed across purchases from different suppliers', () => {
    const lots = [{ supplierId: 'a', totalPayable: 300, paymentStatus: 'pending' }, { supplierId: 'b', totalPayable: 200 }, { supplierId: 'c', totalPayable: 0, paymentStatus: 'paid' }, { totalPayable: 999 }];
    assert.equal(materialPending(mat(), lots), 500);
  });
});
