import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { debtDelta, ledgerDelta, ledgerSplit, allocatedToSale, allocatedByCollection, round2 } from '../modules/finance.js';
import { planCollectionAllocation, applyCollectionAlloc, sortForCollection, collectionEligible } from '../modules/link-graph.js';

const day = (n) => `2026-10-${String(n).padStart(2, '0')}`;
const sale = (id, d, value, extra = {}) => ({ id, date: day(d), timestamp: Date.parse(day(d)) + 1, paymentType: 'CREDIT', creditReceived: false, totalValue: value, ...extra });
const oldDebt = (id, value) => ({ id, date: day(1), timestamp: Date.parse(day(1)), transactionType: 'OLD_DEBT', paymentType: 'CREDIT', creditReceived: false, totalValue: value });

function collect(sales, id, d, amount, expiredValue = 0) {
  const col = { id, date: day(d), timestamp: Date.parse(day(d)) + 2, paymentType: 'COLLECTION', totalValue: amount };
  const cands = sortForCollection(collectionEligible(sales.filter(s => (s.paymentType === 'CREDIT' || s.transactionType === 'OLD_DEBT') && !s.creditReceived), col.date));
  const plan = planCollectionAllocation(amount + expiredValue, cands.map(s => ({ id: s.id, due: debtDelta(s, s.totalValue) })));
  plan.allocs.forEach(a => applyCollectionAlloc(sales.find(s => s.id === a.saleId), a, id, {}));
  const allocated = plan.allocs.reduce((n, a) => n + a.amount, 0);
  if (expiredValue > 0) col.expiredValue = expiredValue;
  if (plan.allocs.length) {
    const cashPaid = Math.min(amount, allocated);
    col.collectedAmount = amount;
    col.allocations = plan.allocs;
    col.totalValue = round2(amount - cashPaid);
    if (round2(allocated - cashPaid) > 0) col.expiredAllocated = round2(allocated - cashPaid);
  }
  return col;
}

const rows = (sales, cols) => [...sales, ...cols].sort((a, b) => a.timestamp - b.timestamp);
const walk = (list, fn) => { let run = 0; return list.map(t => { run = round2(run + fn(t, t.totalValue)); return run; }); };

describe('ledgerDelta: a collection reduces the balance on its own date', () => {
  it('old behaviour hid the payment (documents the bug)', () => {
    const sales = [sale('a', 1, 100), sale('b', 2, 100)];
    const c = collect(sales, 'c', 3, 100);
    assert.deepEqual(walk(rows(sales, [c]), debtDelta), [100, 100, 100]);
  });
  it('new behaviour shows 100 -> 200 -> 100', () => {
    const sales = [sale('a', 1, 100), sale('b', 2, 100)];
    const c = collect(sales, 'c', 3, 100);
    assert.deepEqual(walk(rows(sales, [c]), ledgerDelta), [100, 200, 100]);
    assert.equal(ledgerDelta(c, 0), -100);
    assert.equal(ledgerDelta(sales[1], 100), 100);
  });
  it('a part-paid sale keeps its full gross and the payment appears once', () => {
    const sales = [sale('a', 1, 9600)];
    const c = collect(sales, 'c', 2, 450);
    assert.equal(sales[0].partialPaymentReceived, 450);
    assert.equal(ledgerDelta(sales[0], 9600), 9600);
    assert.equal(ledgerDelta(c, 0), -450);
    assert.deepEqual(ledgerSplit(sales[0], 9600), { debit: 9600, credit: 0, delta: 9600 });
    assert.deepEqual(ledgerSplit(c, 0), { debit: 0, credit: 450, delta: -450 });
  });
  it('expired credit that pays sales is part of the collection credit', () => {
    const sales = [sale('a', 1, 500), sale('b', 2, 500)];
    const c = collect(sales, 'c', 3, 300, 200);
    assert.equal(allocatedByCollection(c), 500);
    assert.equal(ledgerDelta(c, 0), -500);
    assert.deepEqual(walk(rows(sales, [c]), ledgerDelta), [500, 1000, 500]);
  });
  it('cash sales, manually settled sales and legacy collections are unchanged', () => {
    const cash = { id: 'k', paymentType: 'CASH', totalValue: 50 };
    const manual = sale('m', 1, 80, { creditReceived: true });
    const legacy = { id: 'l', paymentType: 'COLLECTION', totalValue: 40 };
    assert.equal(ledgerDelta(cash, 50), 0);
    assert.equal(ledgerDelta(manual, 0), 0);
    assert.deepEqual(ledgerSplit(manual, 80), { debit: 80, credit: 80, delta: 0 });
    assert.equal(ledgerDelta(legacy, 0), -40);
    assert.equal(allocatedToSale(manual), 0);
  });
});

describe('ledgerDelta: the final balance never changes', () => {
  it('sum of ledgerDelta equals sum of debtDelta for random histories', () => {
    let seed = 12345;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 300; run++) {
      const sales = [];
      if (rnd(3) === 0) sales.push(oldDebt('od', 100 * (1 + rnd(50))));
      const nSales = 2 + rnd(8);
      for (let i = 0; i < nSales; i++) sales.push(sale(`s${i}`, 2 + rnd(20), 10 * (1 + rnd(200)), rnd(5) === 0 ? { paymentType: 'CASH', creditReceived: false } : {}));
      const cols = [];
      const nCols = 1 + rnd(6);
      for (let i = 0; i < nCols; i++) cols.push(collect(sales, `c${i}`, 3 + rnd(25), 10 * (1 + rnd(300)), rnd(4) === 0 ? 10 * (1 + rnd(40)) : 0));
      const all = rows(sales, cols);
      const owed = all.reduce((n, t) => n + debtDelta(t, t.totalValue), 0);
      const ledger = all.reduce((n, t) => n + ledgerDelta(t, t.totalValue), 0);
      assert.ok(Math.abs(owed - ledger) < 0.011, `run ${run}: debt ${owed} vs ledger ${ledger}`);
    }
  });
  it('every running balance equals credit sales so far minus money received so far', () => {
    const sales = [sale('a', 1, 1000), sale('b', 3, 700), sale('c', 6, 900)];
    const cols = [collect(sales.slice(0, 1), 'c1', 2, 400)];
    cols.push(collect(sales.filter(s => s.date <= day(5)), 'c2', 5, 500, 100));
    cols.push(collect(sales, 'c3', 9, 1200));
    const all = rows(sales, cols);
    const got = walk(all, ledgerDelta);
    let billed = 0, recv = 0;
    const want = all.map(t => {
      if (t.paymentType === 'COLLECTION') recv += (t.collectedAmount != null ? t.collectedAmount : t.totalValue) + (t.expiredValue || 0);
      else billed += t.totalValue;
      return round2(billed - recv);
    });
    assert.deepEqual(got, want);
  });
});
