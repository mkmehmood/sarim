import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planCollectionAllocation, applyCollectionAlloc, revertCollectionAlloc, collectionPartialCash,
  getCollectionRevertIssue, getCollectionReapplyIssue, sortForCollection, collectionCollected, collectionEligible,
} from '../modules/link-graph.js';
import { debtDelta, collectionExpiredLeft } from '../modules/finance.js';
const credit = (id, date, value) => ({ id, date, timestamp: Date.parse(date), paymentType: 'CREDIT', creditReceived: false, totalValue: value });
const owed = (sales) => sales.reduce((t, s) => t + debtDelta(s, s.totalValue), 0);
describe('collection allocation', () => {
  it('pays oldest sales in full, then part-pays the next', () => {
    const plan = planCollectionAllocation(250, [{ id: 'a', due: 100 }, { id: 'b', due: 100 }, { id: 'c', due: 100 }]);
    assert.deepEqual(plan.allocs, [
      { saleId: 'a', amount: 100, full: true }, { saleId: 'b', amount: 100, full: true }, { saleId: 'c', amount: 50, full: false },
    ]);
    assert.equal(plan.leftover, 0);
  });
  it('keeps the surplus as leftover when every sale is covered', () => {
    const plan = planCollectionAllocation(500, [{ id: 'a', due: 100 }]);
    assert.equal(plan.allocs.length, 1);
    assert.equal(plan.leftover, 400);
  });
  it('treats a tiny rounding gap as fully paid', () => {
    const plan = planCollectionAllocation(99.998, [{ id: 'a', due: 100 }]);
    assert.equal(plan.allocs[0].full, true);
    assert.equal(plan.leftover, 0);
  });
  it('orders newest first, then older ones, with old debt last', () => {
    const order = sortForCollection([credit('n', '2026-03-01', 1), { ...credit('o', '2026-05-01', 1), transactionType: 'OLD_DEBT' }, credit('m', '2026-02-01', 1), { ...credit('x', '2026-03-01', 1), timestamp: Date.parse('2026-03-01') + 5000 }]).map(s => s.id);
    assert.deepEqual(order, ['x', 'n', 'm', 'o']);
  });
});
describe('applying a collection to sales keeps the balance exact', () => {
  it('total owed drops by exactly the amount collected, and undo restores it', () => {
    const sales = [credit('a', '2026-01-01', 100), credit('b', '2026-01-02', 100), credit('c', '2026-01-03', 100)];
    const before = owed(sales);
    const plan = planCollectionAllocation(250, sales.map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) })));
    plan.allocs.forEach(a => applyCollectionAlloc(sales.find(s => s.id === a.saleId), a, 'col1', { date: '2026-02-01', time: '10:00 AM' }));
    assert.equal(owed(sales), before - 250);
    assert.equal(sales[0].creditReceived, true);
    assert.equal(sales[0].creditReceivedDate, undefined);
    assert.equal(sales[0].date, '2026-01-01');
    assert.equal(sales[1].creditReceived, true);
    assert.equal(sales[2].creditReceived, false);
    assert.equal(sales[2].partialPaymentReceived, 50);
    assert.equal(collectionPartialCash(sales[2]), 50);
    sales.forEach(s => revertCollectionAlloc(s, 'col1'));
    assert.equal(owed(sales), before);
    assert.equal(sales[0].creditReceived, false);
    assert.equal(sales[0].date, '2026-01-01');
    assert.equal(sales[2].partialPaymentReceived, 0);
    assert.equal(sales[2].collectionAllocs, undefined);
  });
  it('a second collection finishes a part-paid sale; undoing it leaves the first intact', () => {
    const s = credit('a', '2026-01-01', 100);
    applyCollectionAlloc(s, { amount: 40, full: false }, 'c1', {});
    const due = debtDelta(s, s.totalValue);
    assert.equal(due, 60);
    applyCollectionAlloc(s, { amount: 60, full: true }, 'c2', { date: '2026-02-02' });
    assert.equal(debtDelta(s, s.totalValue), 0);
    revertCollectionAlloc(s, 'c2');
    assert.equal(s.creditReceived, false);
    assert.equal(debtDelta(s, s.totalValue), 60);
    assert.equal(collectionPartialCash(s), 40);
  });
  it('only the newest collection on a sale can be undone first', () => {
    const s = credit('a', '2026-01-01', 100);
    applyCollectionAlloc(s, { amount: 40, full: false }, 'c1', {});
    applyCollectionAlloc(s, { amount: 60, full: true }, 'c2', {});
    const c1 = { id: 'c1', allocations: [{ saleId: 'a', amount: 40, full: false }] };
    const c2 = { id: 'c2', allocations: [{ saleId: 'a', amount: 60, full: true }] };
    assert.match(getCollectionRevertIssue(c1, [s]), /newer collection/);
    assert.equal(getCollectionRevertIssue(c2, [s]), null);
  });
  it('recovery is blocked when a sale is gone or already paid', () => {
    const c = { id: 'c', allocations: [{ saleId: 'a', amount: 10, full: true }] };
    assert.match(getCollectionReapplyIssue(c, []), /no longer/);
    assert.match(getCollectionReapplyIssue(c, [{ id: 'a', creditReceived: true }]), /settled another way/);
    assert.equal(getCollectionReapplyIssue(c, [credit('a', '2026-01-01', 10)]), null);
  });
  it('collectionCollected falls back to totalValue for older collections', () => {
    assert.equal(collectionCollected({ totalValue: 70 }), 70);
    assert.equal(collectionCollected({ totalValue: 0, collectedAmount: 250 }), 250);
  });
});
describe('old debt (opening balance)', () => {
  const od = () => ({ id: 'od', date: '2025-12-31', timestamp: 1, paymentType: 'CREDIT', transactionType: 'OLD_DEBT', creditReceived: false, partialPaymentReceived: 0, totalValue: 300 });
  it('is paid last: newer sales are cleared first and the remainder reaches old debt, keeping its date', () => {
    const sales = [od(), credit('a', '2026-01-01', 100), credit('b', '2026-01-05', 100)];
    const dues = sortForCollection(sales).map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) }));
    assert.deepEqual(dues.map(d => d.id), ['b', 'a', 'od']);
    const plan = planCollectionAllocation(450, dues);
    assert.deepEqual(plan.allocs.map(x => [x.saleId, x.amount, x.full]), [['b', 100, true], ['a', 100, true], ['od', 250, false]]);
    plan.allocs.forEach(x => applyCollectionAlloc(sales.find(s => s.id === x.saleId), x, 'c1', { date: '2026-02-01' }));
    const o = sales.find(s => s.id === 'od');
    assert.equal(o.creditReceived, false);
    assert.equal(o.partialPaymentReceived, 250);
    assert.equal(o.date, '2025-12-31');
    assert.equal(debtDelta(o, 300), 50);
    sales.forEach(s => revertCollectionAlloc(s, 'c1'));
    assert.equal(o.partialPaymentReceived, 0);
    assert.equal(debtDelta(o, 300), 300);
  });
  it('a part collection smaller than the newest sale only touches the newest sale', () => {
    const sales = [od(), credit('a', '2026-01-01', 100), credit('b', '2026-01-05', 100)];
    const plan = planCollectionAllocation(60, sortForCollection(sales).map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) })));
    assert.deepEqual(plan.allocs.map(x => [x.saleId, x.amount, x.full]), [['b', 60, false]]);
  });
  it('a collection that covers everything fully clears old debt and keeps its own timestamp', () => {
    const sales = [od(), credit('a', '2026-01-01', 100)];
    const plan = planCollectionAllocation(400, sortForCollection(sales).map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) })));
    plan.allocs.forEach(x => applyCollectionAlloc(sales.find(s => s.id === x.saleId), x, 'c1', {}));
    const o = sales.find(s => s.id === 'od');
    assert.equal(o.creditReceived, true);
    assert.equal(o.partialPaymentReceived, 300);
    assert.equal(o.timestamp, 1);
    assert.equal(debtDelta(o, 300), 0);
  });
  it('a part payment on old debt reduces what is owed', () => {
    const o = od();
    applyCollectionAlloc(o, { amount: 120, full: false }, 'c1', {});
    assert.equal(debtDelta(o, 300), 180);
  });
});

describe('collections only reach transactions on or before the collection date', () => {
  const od = () => ({ id: 'od', date: '2025-12-31', timestamp: 1, paymentType: 'CREDIT', transactionType: 'OLD_DEBT', creditReceived: false, partialPaymentReceived: 0, totalValue: 300 });
  const dues = (sales, date) => sortForCollection(collectionEligible(sales, date)).map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) }));
  it('skips sales dated after the collection and keeps same-day sales and old debt', () => {
    const sales = [od(), credit('a', '2026-01-01', 100), credit('b', '2026-01-05', 100), credit('late', '2026-01-10', 100)];
    assert.deepEqual(dues(sales, '2026-01-05').map(d => d.id), ['b', 'a', 'od']);
  });
  it('pays the latest earlier sales in full, then the remainder reaches old debt', () => {
    const sales = [od(), credit('a', '2026-01-01', 100), credit('b', '2026-01-05', 100), credit('late', '2026-01-10', 100)];
    const plan = planCollectionAllocation(250, dues(sales, '2026-01-06'));
    assert.deepEqual(plan.allocs.map(x => [x.saleId, x.amount, x.full]), [['b', 100, true], ['a', 100, true], ['od', 50, false]]);
    assert.equal(plan.leftover, 0);
  });
  it('a backdated collection leaves later sales unpaid and keeps any surplus as leftover', () => {
    const sales = [credit('a', '2026-01-01', 100), credit('late', '2026-01-10', 100)];
    const plan = planCollectionAllocation(500, dues(sales, '2026-01-02'));
    assert.deepEqual(plan.allocs.map(x => x.saleId), ['a']);
    assert.equal(plan.leftover, 400);
  });
  it('uses the supply date when a sale has one', () => {
    const sales = [{ ...credit('s', '2026-02-20', 100), supplyDate: '2026-01-03' }];
    assert.equal(collectionEligible(sales, '2026-01-05').length, 1);
    assert.equal(collectionEligible(sales, '2026-01-02').length, 0);
  });
});

describe('expired credit on a collection is allocated like cash', () => {
  it('cash and expired credit together clear the newest sales first', () => {
    const sales = [credit('a', '2026-01-01', 100), credit('b', '2026-01-05', 100)];
    const plan = planCollectionAllocation(60 + 80, sortForCollection(sales).map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) })));
    assert.deepEqual(plan.allocs.map(x => [x.saleId, x.amount, x.full]), [['b', 100, true], ['a', 40, false]]);
  });
  it('only the unallocated part of the credit still reduces the balance', () => {
    assert.equal(collectionExpiredLeft({ expiredValue: 80 }), 80);
    assert.equal(collectionExpiredLeft({ expiredValue: 80, expiredAllocated: 30 }), 50);
    assert.equal(collectionExpiredLeft({ expiredValue: 80, expiredAllocated: 80 }), 0);
    const rec = { paymentType: 'COLLECTION', totalValue: 10, expiredValue: 80, expiredAllocated: 30 };
    assert.equal(debtDelta(rec, 0), -60);
  });
});
