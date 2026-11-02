import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { debtDelta, ledgerDelta, ledgerSplit, allocHonor, honoredToSale, round2 } from '../modules/finance.js';
import { planCollectionAllocation, applyCollectionAlloc, revertCollectionAlloc, sortForCollection, collectionEligible } from '../modules/link-graph.js';

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
const walk = (list, fn) => { const honor = allocHonor(list); let run = 0; return list.map(t => { run = round2(run + fn(t, t.totalValue, { honor })); return run; }); };
const L = (list, t, v) => ledgerDelta(t, v, { honor: allocHonor(list) });

describe('ledgerDelta: a collection reduces the balance on its own date', () => {
  it('old behaviour hid the payment (documents the bug)', () => {
    const sales = [sale('a', 1, 100), sale('b', 2, 100)];
    const c = collect(sales, 'c', 3, 100);
    assert.deepEqual(walk(rows(sales, [c]), (t, v) => debtDelta(t, v)), [100, 100, 100]);
  });
  it('new behaviour shows 100 -> 200 -> 100', () => {
    const sales = [sale('a', 1, 100), sale('b', 2, 100)];
    const c = collect(sales, 'c', 3, 100);
    assert.deepEqual(walk(rows(sales, [c]), ledgerDelta), [100, 200, 100]);
    const all = rows(sales, [c]);
    assert.equal(L(all, c, 0), -100);
    assert.equal(L(all, sales[1], 100), 100);
  });
  it('a part-paid sale keeps its full gross and the payment appears once', () => {
    const sales = [sale('a', 1, 9600)];
    const c = collect(sales, 'c', 2, 450);
    assert.equal(sales[0].partialPaymentReceived, 450);
    const honor = allocHonor([sales[0], c]);
    assert.equal(ledgerDelta(sales[0], 9600, { honor }), 9600);
    assert.equal(ledgerDelta(c, 0, { honor }), -450);
    assert.deepEqual(ledgerSplit(sales[0], 9600, { honor }), { debit: 9600, credit: 0, delta: 9600 });
    assert.deepEqual(ledgerSplit(c, 0, { honor }), { debit: 0, credit: 450, delta: -450 });
  });
  it('expired credit that pays sales is part of the collection credit', () => {
    const sales = [sale('a', 1, 500), sale('b', 2, 500)];
    const c = collect(sales, 'c', 3, 300, 200);
    assert.equal(L([...sales, c], c, 0), -500);
    assert.deepEqual(walk(rows(sales, [c]), ledgerDelta), [500, 1000, 500]);
  });
  it('cash sales, manually settled sales and legacy collections are unchanged', () => {
    const cash = { id: 'k', paymentType: 'CASH', totalValue: 50 };
    const manual = sale('m', 1, 80, { creditReceived: true });
    const legacy = { id: 'l', paymentType: 'COLLECTION', totalValue: 40 };
    const honor = allocHonor([cash, manual, legacy]);
    assert.equal(ledgerDelta(cash, 50, { honor }), 0);
    assert.equal(ledgerDelta(manual, 0, { honor }), 0);
    assert.deepEqual(ledgerSplit(manual, 80, { honor }), { debit: 80, credit: 80, delta: 0 });
    assert.equal(ledgerDelta(legacy, 0, { honor }), -40);
    assert.equal(honoredToSale(honor, manual), 0);
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
      const honor = allocHonor(all);
      const ledger = all.reduce((n, t) => n + ledgerDelta(t, t.totalValue, { honor }), 0);
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

const col = (id, d, amount) => ({ id, date: day(d), timestamp: Date.parse(day(d)) + 2, paymentType: 'COLLECTION', totalValue: amount });

describe('ledgerDelta never trusts a link the sale does not confirm', () => {
  it('unpaid sales that still carry links are not counted twice (the reported 19,200 / 12,800 bug)', () => {
    const a = sale('a', 5, 9600, { collectionAllocs: [{ cid: 'c', amount: 9600, full: true }] });
    const b = sale('b', 7, 6400, { collectionAllocs: [{ cid: 'c', amount: 6400, full: true }] });
    const c = col('c', 9, 20000);
    Object.assign(c, { collectedAmount: 20000, totalValue: 4000, allocations: [{ saleId: 'a', amount: 9600, full: true }, { saleId: 'b', amount: 6400, full: true }] });
    const all = rows([a, b], [c]);
    const honor = allocHonor(all);
    assert.equal(ledgerDelta(a, 9600, { honor }), 9600);
    assert.equal(ledgerDelta(b, 6400, { honor }), 6400);
    assert.deepEqual(ledgerSplit(a, 9600, { honor }), { debit: 9600, credit: 0, delta: 9600 });
    const owed = all.reduce((n, t) => n + debtDelta(t, t.totalValue), 0);
    const ledger = all.reduce((n, t) => n + ledgerDelta(t, t.totalValue, { honor }), 0);
    assert.equal(ledger, owed);
  });
  it('a link with no matching link on the other side is ignored', () => {
    const a = sale('a', 5, 100, { creditReceived: true, collectionAllocs: [{ cid: 'x', amount: 100, full: true }] });
    const honor = allocHonor([a]);
    assert.equal(ledgerDelta(a, 100, { honor }), 0);
  });
  it('without honor data the ledger equals the debt delta', () => {
    const a = sale('a', 5, 100, { creditReceived: true, collectionAllocs: [{ cid: 'c', amount: 100, full: true }] });
    assert.equal(ledgerDelta(a, 100), debtDelta(a, 100));
  });
  it('a sale delta can never exceed its own value, whatever the links say', () => {
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 300; run++) {
      const sales = [sale('a', 5, 1000), sale('b', 6, 500, { creditReceived: rnd(2) === 0 })];
      sales.forEach(x => { if (rnd(2)) x.collectionAllocs = [{ cid: 'c', amount: 100 * (1 + rnd(12)), full: rnd(2) === 0 }]; if (rnd(3) === 0) x.partialPaymentReceived = 100 * rnd(5); });
      const c = col('c', 9, 0);
      if (rnd(2)) c.allocations = sales.map(x => ({ saleId: x.id, amount: 100 * (1 + rnd(12)), full: false }));
      const all = rows(sales, [c]);
      const honor = allocHonor(all);
      all.forEach(t => { if (t.paymentType === 'CREDIT') assert.ok(ledgerDelta(t, t.totalValue, { honor }) <= t.totalValue + 0.011); });
      const owed = all.reduce((n, t) => n + debtDelta(t, t.totalValue), 0);
      const ledger = all.reduce((n, t) => n + ledgerDelta(t, t.totalValue, { honor }), 0);
      assert.ok(Math.abs(owed - ledger) < 0.011, `run ${run}`);
    }
  });
});

describe('ledger stays consistent through any sequence of app operations', () => {
  it('apply, revert and re-apply collections: ledger always equals outstanding and no sale exceeds its value', () => {
    let seed = 99;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 200; run++) {
      const sales = [];
      for (let i = 0; i < 3 + rnd(6); i++) sales.push(sale(`s${i}`, 1 + rnd(10), 10 * (1 + rnd(150))));
      const cols = [];
      for (let step = 0; step < 4 + rnd(8); step++) {
        if (cols.length && rnd(3) === 0) {
          const c = cols.splice(rnd(cols.length), 1)[0];
          (c.allocations || []).forEach(a => revertCollectionAlloc(sales.find(s => s.id === a.saleId), c.id));
        } else {
          cols.push(collect(sales, `c${run}_${step}`, 11 + rnd(15), 10 * (1 + rnd(200)), rnd(5) === 0 ? 10 * (1 + rnd(30)) : 0));
        }
        const all = rows(sales, cols);
        const honor = allocHonor(all);
        const owed = all.reduce((n, t) => n + debtDelta(t, t.totalValue), 0);
        const ledger = all.reduce((n, t) => n + ledgerDelta(t, t.totalValue, { honor }), 0);
        assert.ok(Math.abs(owed - ledger) < 0.011, `run ${run} step ${step}: ${owed} vs ${ledger}`);
        sales.forEach(t => assert.ok(ledgerDelta(t, t.totalValue, { honor }) <= t.totalValue + 0.011));
        cols.forEach(t => assert.ok(ledgerDelta(t, 0, { honor }) <= 0.001));
      }
    }
  });
});
