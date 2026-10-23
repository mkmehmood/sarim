import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { periodTotals, periodQuantity } from '../modules/finance.js';
describe('periodTotals', () => {
  it('sums sales and collections plus returns', () => {
    const rows = [
      { t: { paymentType: 'CASH' }, value: 1000 },
      { t: { paymentType: 'CREDIT' }, value: 500 },
      { t: { paymentType: 'COLLECTION', totalValue: 300, expiredValue: 50 }, value: 300 },
      { t: { paymentType: 'PARTIAL_PAYMENT', totalValue: 200, collectedAmount: 150 }, value: 200 },
      { t: { isRepReturn: true, returnValue: 120 }, value: 0 },
    ];
    assert.deepEqual(periodTotals(rows), { totalSale: 1500, collection: 500, returns: 120, totalCollection: 620 });
  });
  it('ignores opening balances and merged records', () => {
    const rows = [
      { t: { transactionType: 'OLD_DEBT', totalValue: 900 }, value: 900 },
      { t: { isMerged: true, paymentType: 'CREDIT' }, value: 400 },
    ];
    assert.deepEqual(periodTotals(rows), { totalSale: 0, collection: 0, returns: 0, totalCollection: 0 });
  });
  it('handles empty input', () => {
    assert.equal(periodTotals().totalSale, 0);
  });
});
describe('periodQuantity', () => {
  it('sums kg of sale rows only', () => {
    const rows = [
      { t: { paymentType: 'CASH', quantity: 10.5 }, value: 1000 },
      { t: { paymentType: 'CREDIT', quantity: 4 }, value: 500 },
      { t: { paymentType: 'COLLECTION', quantity: 99, totalValue: 300 }, value: 300 },
      { t: { paymentType: 'PARTIAL_PAYMENT', quantity: 99, totalValue: 200 }, value: 200 },
      { t: { isRepReturn: true, quantity: 99, returnValue: 120 }, value: 0 },
      { t: { transactionType: 'OLD_DEBT', quantity: 99 }, value: 900 },
      { t: { isMerged: true, paymentType: 'CREDIT', quantity: 99 }, value: 400 },
    ];
    assert.equal(periodQuantity(rows), 14.5);
  });
  it('handles empty input', () => {
    assert.equal(periodQuantity(), 0);
  });
});
