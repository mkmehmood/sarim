import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { debtDelta, debtNeedsGross } from '../modules/finance.js';
import { weightedUnitPrice, planGoodsCredit, planCollectionAllocation, collectionPartialCash } from '../modules/link-graph.js';

const owed = (recs, opts) => Math.max(0, recs.reduce((t, r) => t + debtDelta(r, debtNeedsGross(r) ? r._g || 0 : 0, opts), 0));
const credit = (over = {}) => ({ id: 's1', paymentType: 'CREDIT', currentRepProfile: 'admin', customerName: 'ALI', quantity: 10, totalValue: 1000, _g: 1000, ...over });

describe('weightedUnitPrice / planGoodsCredit', () => {
  it('prices goods at total value / total kg of the unpaid sales', () => {
    assert.equal(weightedUnitPrice([{ quantity: 10, value: 1000 }, { quantity: 10, value: 1200 }]), 110);
    assert.equal(weightedUnitPrice([]), 0);
    assert.equal(weightedUnitPrice([{ quantity: 0, value: 50 }]), 0);
  });
  it('credits qty x price, never more than is owed', () => {
    assert.deepEqual(planGoodsCredit(3, 100, 1000), { value: 300, raw: 300, capped: false });
    assert.deepEqual(planGoodsCredit(8, 100, 500), { value: 500, raw: 800, capped: true });
    assert.equal(planGoodsCredit(3, 100, 0).value, 0);
    assert.equal(planGoodsCredit(3, 100, -1).value, 300, 'unknown balance applies no cap');
  });
});

describe('direct customer: amount received + expired product both deduct', () => {
  it('cash alone lowers the balance (existing behaviour kept)', () => {
    const coll = { id: 'c1', paymentType: 'COLLECTION', totalValue: 400 };
    assert.equal(owed([credit(), coll]), 600);
  });
  it('expired credit lowers the balance without being cash', () => {
    const coll = { id: 'c1', paymentType: 'COLLECTION', totalValue: 0, expiredQty: 3, expiredValue: 300 };
    assert.equal(debtDelta(coll, 0), -300);
    assert.equal(owed([credit(), coll]), 700);
    assert.equal(collectionPartialCash(credit({ collectionAllocs: [] })), 0);
  });
  it('cash + expired credit together', () => {
    const coll = { id: 'c1', paymentType: 'COLLECTION', totalValue: 0, collectedAmount: 400, allocations: [{ saleId: 's1', amount: 400, full: false }], expiredValue: 300 };
    const sale = credit({ partialPaymentReceived: 400, collectionAllocs: [{ cid: 'c1', amount: 400, full: false }] });
    assert.equal(owed([sale, coll]), 300);
    assert.equal(collectionPartialCash(sale), 400, 'only the 400 cash counts as money in; the 300 never does');
  });
  it('paying the remainder after an expired credit clears the account exactly', () => {
    const exp = { id: 'c1', paymentType: 'COLLECTION', totalValue: 0, expiredValue: 300 };
    const plan = planCollectionAllocation(700, [{ id: 's1', due: 1000 }]);
    const sale = credit({ partialPaymentReceived: plan.allocs[0].amount });
    const pay = { id: 'c2', paymentType: 'COLLECTION', totalValue: plan.leftover };
    assert.equal(owed([sale, exp, pay]), 0);
  });
});

describe('sales rep: return + expired deduct from the rep balance until reconciled', () => {
  const ret = { id: 'r1', isRepReturn: true, paymentType: 'REP_RETURN', creditReceived: true, expiredQty: 2, returnedQty: 3, returnValue: 500, currentRepProfile: 'admin' };
  it('a pending return lowers what the rep owes', () => {
    assert.equal(owed([credit({ customerName: 'REP' }), ret]), 500);
  });
  it('once the Calculator reconciles it, the return stops deducting (sales are paid then)', () => {
    const done = new Set(['r1']);
    const paidSale = credit({ customerName: 'REP', creditReceived: true });
    assert.equal(owed([paidSale, ret], { reconciledReturnIds: done }), 0);
    assert.equal(debtDelta(ret, 0, { reconciledReturnIds: done }), 0);
  });
  it('un-reconciling (deleting the calculator record) makes it deduct again', () => {
    assert.equal(debtDelta(ret, 0, { reconciledReturnIds: new Set() }), -500);
  });
  it('a return recorded without a value (older data) is unchanged', () => {
    assert.equal(debtDelta({ ...ret, returnValue: undefined }, 0), 0);
  });
});
