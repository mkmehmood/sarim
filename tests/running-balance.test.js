import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { debtDelta, ledgerDelta, allocHonor, collectionUnapplied, round2 } from '../modules/finance.js';
import { planCollectionAllocation, applyCollectionAlloc, revertCollectionAlloc, getCollectionRevertIssue, sortForCollection, collectionEligible } from '../modules/link-graph.js';

const D = (n) => `2026-11-${String(n).padStart(2, '0')}`;
let ts = 1000;
const mkSale = (id, d, v) => ({ id, date: D(d), timestamp: ++ts, paymentType: 'CREDIT', creditReceived: false, totalValue: v });

function apply(sales, col, amount, original) {
  if (original && original.allocations) for (const a of original.allocations) { const s = sales.find((x) => x.id === a.saleId); if (s) revertCollectionAlloc(s, original.id); }
  const cands = sortForCollection(collectionEligible(sales.filter((s) => !s.creditReceived), col.date));
  const plan = planCollectionAllocation(amount, cands.map((s) => ({ id: s.id, due: debtDelta(s, s.totalValue) })));
  plan.allocs.forEach((a) => applyCollectionAlloc(sales.find((s) => s.id === a.saleId), a, col.id, {}));
  const al = plan.allocs.reduce((n, a) => n + a.amount, 0);
  if (plan.allocs.length) { col.collectedAmount = amount; col.allocations = plan.allocs; col.totalValue = round2(amount - Math.min(amount, al)); }
  else { delete col.collectedAmount; delete col.allocations; col.totalValue = amount; }
}
const mkCol = (sales, id, d, amount) => { const c = { id, date: D(d), timestamp: ++ts, paymentType: 'COLLECTION', totalValue: 0 }; apply(sales, c, amount); return c; };
const walk = (list) => { const honor = allocHonor(list); let run = 0; return list.map((t) => (run = round2(run + ledgerDelta(t, t.totalValue, { honor })))); };
const chrono = (list) => list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.timestamp - b.timestamp));

describe('running balance follows the money on a customer ledger', () => {
  it('the reported customer: collections of 22,400 against 32,000 of sales end at 9,600', () => {
    const sales = [mkSale('s8', 8, 1600)];
    const cols = [mkCol(sales, 'c8', 8, 1600)];
    sales.push(mkSale('s9', 9, 9600), mkSale('s12', 12, 9600));
    cols.push(mkCol(sales, 'c17a', 17, 9000));
    sales.push(mkSale('s17', 17, 6400));
    cols.push(mkCol(sales, 'c17b', 17, 600));
    sales.push(mkSale('s20', 20, 4800));
    cols.push(mkCol(sales, 'c20', 20, 6400), mkCol(sales, 'c22', 22, 4800));
    const all = chrono([...sales, ...cols]);
    const bal = walk(all);
    assert.equal(bal[bal.length - 1], 9600);
    const c20 = all.indexOf(cols.find((c) => c.id === 'c20'));
    assert.equal(round2(bal[c20 - 1] - bal[c20]), 6400, 'the 6,400 collection takes 6,400 off the balance');
  });

  it('every collection is fully accounted for through adds, edits and deletes', () => {
    let seed = 11;
    const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
    for (let run = 0; run < 400; run++) {
      const sales = [], cols = [];
      for (let i = 0; i < 12; i++) {
        const k = rnd(10), d = 1 + rnd(25);
        if (k < 4) sales.push(mkSale('s' + i, d, (1 + rnd(10)) * 800));
        else if (k < 7) cols.push(mkCol(sales, 'c' + i, d, (1 + rnd(12)) * 400));
        else if (k < 9 && cols.length) {
          const c = cols[rnd(cols.length)]; const orig = JSON.parse(JSON.stringify(c));
          if (!getCollectionRevertIssue(orig, sales)) apply(sales, c, (1 + rnd(12)) * 400, orig);
        } else if (cols.length) {
          const idx = rnd(cols.length), c = cols[idx];
          if (getCollectionRevertIssue(c, sales)) continue;
          (c.allocations || []).forEach((a) => revertCollectionAlloc(sales.find((x) => x.id === a.saleId), c.id));
          cols.splice(idx, 1);
        }
      }
      const all = chrono([...sales, ...cols]);
      const honor = allocHonor(all);
      const owed = round2(all.reduce((n, t) => n + debtDelta(t, t.totalValue), 0));
      const ledger = round2(all.reduce((n, t) => n + ledgerDelta(t, t.totalValue, { honor }), 0));
      assert.equal(ledger, owed, 'the last running balance equals what the customer owes');
      for (const c of cols) assert.equal(collectionUnapplied(c, honor), 0, `collection ${c.id} is fully applied`);
    }
  });

  it('flags cash a collection shows but the balance does not take off', () => {
    const a = mkSale('a', 5, 4800);
    const b = mkSale('b', 6, 6400);
    a.creditReceived = true; a.collectionAllocs = [{ cid: 'c', amount: 4800, full: true }];
    b.partialPaymentReceived = 3200;
    const c = { id: 'c', date: D(9), timestamp: ++ts, paymentType: 'COLLECTION', totalValue: 0, collectedAmount: 6400, allocations: [{ saleId: 'a', amount: 4800, full: true }, { saleId: 'b', amount: 1600, full: false }] };
    const honor = allocHonor([a, b, c]);
    assert.equal(ledgerDelta(c, 0, { honor }), -4800);
    assert.equal(collectionUnapplied(c, honor), 1600);
  });

  it('a collection with nothing wrong shows no unapplied cash', () => {
    const sales = [mkSale('a', 1, 1000)];
    const c = mkCol(sales, 'c', 2, 400);
    assert.equal(collectionUnapplied(c, allocHonor([...sales, c])), 0);
    assert.equal(collectionUnapplied(sales[0], allocHonor([...sales, c])), 0);
  });
});

describe('edits no longer break the link between a sale and its payments', () => {
  const read = (f) => readFileSync(new URL('../modules/' + f, import.meta.url), 'utf8');
  it('editing a customer or rep sale keeps the collections that paid it', () => {
    assert.match(read('utilities-sales.js'), /saleRecord\.collectionAllocs = o\.collectionAllocs/);
    assert.match(read('rep-sales.js'), /transactionRecord\.collectionAllocs = o\.collectionAllocs/);
  });
  it('changing a rep customer old debt keeps what was already collected', () => {
    const rep = read('rep-sales.js');
    assert.match(rep, /getOldDebtChangeIssue\(tx, oldDebit, 'rep'\)/);
    assert.doesNotMatch(rep, /tx\.creditReceived = false; tx\.partialPaymentReceived = 0;/);
    assert.match(read('link-guards.js'), /getOldDebtChangeIssue\(oldDebtRecord, newAmount, kind = 'customer'\)/);
  });
  it('the ledger rows say when cash is not applied', () => {
    assert.match(read('customers.js'), /not applied to a sale/);
    assert.match(read('rep-sales.js'), /not applied to a sale/);
  });
});

describe('entity ledger running balance', () => {
  const core = readFileSync(new URL('../modules/utilities-core.js', import.meta.url), 'utf8');
  it('orders by transaction date first, so back-dated entries sit on the right day', () => {
    assert.match(core, /const _entCmp = /);
    assert.match(core, /sort\(\(a, b\) => _entCmp\(a\.t, b\.t\)/);
  });
  it('the PDF statement starts from the old balance and breaks same-day ties like the screen', () => {
    assert.match(core, /const _entOpen = openingBalanceOf\(entity\)/);
    assert.match(core, /\(Number\(a\.timestamp\) \|\| 0\) - \(Number\(b\.timestamp\) \|\| 0\)/);
  });
});
