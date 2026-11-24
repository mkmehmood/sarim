import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { debtDelta, ledgerDelta, allocHonor, collectionUnapplied, round2 } from '../modules/finance.js';
import { auditLinks, repairCollection, repairOrphans, repairStore, repairSummary } from '../modules/link-repair.js';

const D = (n) => `2026-11-${String(n).padStart(2, '0')}`;
let ts = 1000;
const sale = (id, d, v, x = {}) => ({ id, date: D(d), timestamp: ++ts, paymentType: 'CREDIT', creditReceived: false, totalValue: v, customerName: 'IHSAN KHAN', currentRepProfile: 'admin', ...x });
const col = (id, d, amount, allocations, x = {}) => ({ id, date: D(d), timestamp: ++ts, paymentType: 'COLLECTION', customerName: 'IHSAN KHAN', currentRepProfile: 'admin', collectedAmount: amount, totalValue: 0, allocations, ...x });
const owed = (list) => round2(list.reduce((n, t) => n + debtDelta(t, t.totalValue), 0));
const ledger = (list) => { const honor = allocHonor(list); return round2(list.reduce((n, t) => n + ledgerDelta(t, t.totalValue, { honor }), 0)); };

function reported() {
  const s8 = sale('s8', 8, 1600, { creditReceived: true, collectionAllocs: [{ cid: 'c8', amount: 1600, full: true }] });
  const s9 = sale('s9', 9, 9600);
  const s12 = sale('s12', 12, 9600, { creditReceived: true, collectionAllocs: [{ cid: 'c17a', amount: 9000, full: false }, { cid: 'c17b', amount: 600, full: true }] });
  const s17 = sale('s17', 17, 6400, { partialPaymentReceived: 4800, collectionAllocs: [{ cid: 'c22', amount: 4800, full: false }] });
  const s20 = sale('s20', 20, 4800, { creditReceived: true, collectionAllocs: [{ cid: 'c20', amount: 4800, full: true }] });
  const cols = [
    col('c8', 8, 1600, [{ saleId: 's8', amount: 1600, full: true }]),
    col('c17a', 17, 9000, [{ saleId: 's12', amount: 9000, full: false }]),
    col('c17b', 17, 600, [{ saleId: 's12', amount: 600, full: true }]),
    col('c20', 20, 6400, [{ saleId: 's20', amount: 4800, full: true }, { saleId: 's17', amount: 1600, full: false }]),
    col('c22', 22, 4800, [{ saleId: 's17', amount: 4800, full: false }]),
  ];
  return [s8, s9, s12, s17, s20, ...cols];
}

describe('payment link audit and repair', () => {
  it('finds the reported customer: 1,600 received but applied nowhere', () => {
    const list = reported();
    const found = auditLinks(list, 'sales');
    assert.deepEqual(found.map((i) => [i.code, i.rec.id, i.amount]), [['col_unapplied', 'c20', 1600]]);
    assert.equal(owed(list), 11200);
  });

  it('repairs it so the balance, the sale statuses and the cash all agree at 9,600', () => {
    const list = reported();
    const r = repairStore(list, 'sales');
    assert.equal(r.dropped, 1);
    assert.equal(r.applied, 1);
    const s17 = list.find((x) => x.id === 's17');
    assert.equal(s17.creditReceived, true);
    assert.equal(owed(list), 9600);
    assert.equal(ledger(list), 9600);
    assert.deepEqual(auditLinks(list, 'sales'), []);
    const c20 = list.find((x) => x.id === 'c20');
    assert.equal(c20.totalValue, 0);
    assert.equal(c20.collectedAmount, 6400);
    assert.equal(collectionUnapplied(c20, allocHonor(list)), 0);
  });

  it('running it again changes nothing', () => {
    const list = reported();
    repairStore(list, 'sales');
    const snap = JSON.stringify(list);
    const again = repairStore(list, 'sales');
    assert.equal(again.changedIds.length, 0);
    assert.equal(JSON.stringify(list), snap);
  });

  it('only restores the link when the sale already shows the payment', () => {
    const list = reported();
    const s17 = list.find((x) => x.id === 's17');
    s17.creditReceived = true;
    s17.partialPaymentReceived = 4800;
    const r = repairStore(list, 'sales');
    assert.equal(r.restored, 1);
    assert.equal(r.dropped, 0);
    assert.ok(s17.collectionAllocs.some((e) => e.cid === 'c20'));
    assert.deepEqual(auditLinks(list, 'sales'), []);
  });

  it('holds the cash as customer credit when nothing is left to pay', () => {
    const list = reported();
    list.find((x) => x.id === 's17').creditReceived = false;
    list.find((x) => x.id === 's17').totalValue = 4800;
    list.find((x) => x.id === 's9').creditReceived = true;
    const r = repairStore(list, 'sales');
    const c20 = list.find((x) => x.id === 'c20');
    assert.equal(r.applied, 0);
    assert.equal(c20.totalValue, 1600);
    assert.deepEqual(auditLinks(list, 'sales'), []);
  });

  it('removes a payment link whose collection was deleted', () => {
    const a = sale('a', 5, 1000, { partialPaymentReceived: 400, collectionAllocs: [{ cid: 'gone', amount: 400, full: false }] });
    const b = sale('b', 6, 500, { creditReceived: true, collectionAllocs: [{ cid: 'gone', amount: 500, full: true }] });
    const list = [a, b];
    assert.deepEqual(auditLinks(list, 'sales').map((i) => [i.code, i.rec.id]), [['link_orphan', 'a'], ['link_orphan', 'b']]);
    const r = repairOrphans(list);
    assert.equal(r.cleared, 2);
    assert.equal(a.partialPaymentReceived, 0);
    assert.equal(b.creditReceived, false);
    assert.equal(owed(list), 1500);
  });

  it('works for a rep customer and leaves other customers alone', () => {
    const list = reported().map((r) => ({ ...r, salesRep: 'ALI', currentRepProfile: 'ALI' }));
    const other = sale('o1', 21, 7000, { salesRep: 'ALI', currentRepProfile: 'ALI', customerName: 'SOMEONE ELSE' });
    list.push(other);
    const r = repairStore(list, 'rep');
    assert.equal(r.applied, 1);
    assert.equal(other.creditReceived, false);
    assert.equal(other.collectionAllocs, undefined);
  });

  it('never touches healthy data', () => {
    const s = sale('a', 1, 1000, { creditReceived: true, collectionAllocs: [{ cid: 'c', amount: 1000, full: true }] });
    const c = col('c', 2, 1000, [{ saleId: 'a', amount: 1000, full: true }]);
    const list = [s, c];
    const snap = JSON.stringify(list);
    assert.deepEqual(auditLinks(list, 'sales'), []);
    assert.equal(repairStore(list, 'sales').changedIds.length, 0);
    assert.equal(JSON.stringify(list), snap);
  });

  it('can repair one collection on its own', () => {
    const list = reported();
    const r = repairCollection(list, 'c20', { kind: 'sales' });
    assert.ok(r.changed.has('c20') && r.changed.has('s17'));
  });

  it('repairs a collection whose cash was recorded but has no allocation list at all', () => {
    const list = [sale('a', 5, 4800), sale('b', 9, 6400), col('c', 12, 7000, undefined)];
    delete list[2].allocations;
    assert.deepEqual(auditLinks(list, 'sales').map((i) => [i.code, i.rec.id, i.amount]), [['col_unapplied', 'c', 7000]]);
    assert.equal(ledger(list), 11200);
    const r = repairStore(list, 'sales');
    assert.equal(r.applied, 2);
    assert.equal(ledger(list), 4200);
    assert.equal(owed(list), 4200);
    assert.deepEqual(auditLinks(list, 'sales'), []);
    assert.equal(repairStore(list, 'sales').changedIds.length, 0);
  });

  it('describes what it did', () => {
    assert.match(repairSummary({ cleared: 1, restored: 2, applied: 3 }), /1 stale payment link removed, 2 lost links restored, cash applied to 3 sales/);
    assert.equal(repairSummary({}), 'Nothing needed changing');
  });
});

describe('the Overview check finds and repairs payment links', async () => {
  const { auditData, CHECKS } = await import('../modules/overview-audit.js');
  const { planFields } = await import('../modules/overview-fix.js');
  const { readFileSync } = await import('node:fs');

  it('reports the unapplied collection as an error with the amount', () => {
    const data = { sales: reported(), rep: [], entities: [] };
    const a = auditData(data, '2026-11-30');
    const f = a.findings.find((x) => x.codes.includes('col_unapplied'));
    assert.ok(f);
    assert.equal(f.collection, 'sales');
    assert.equal(f.severity, 'error');
    assert.equal(f.impact, 1600);
    assert.equal(f.rec.id, 'c20');
    assert.ok(CHECKS.col_unapplied && CHECKS.link_orphan);
  });

  it('also checks rep records', () => {
    const rep = reported().map((r) => ({ ...r, salesRep: 'ALI', currentRepProfile: 'ALI' }));
    const a = auditData({ sales: [], rep, entities: [] }, '2026-11-30');
    const f = a.findings.find((x) => x.codes.includes('col_unapplied'));
    assert.equal(f.collection, 'rep');
  });

  it('a healthy ledger adds no findings', () => {
    const list = reported();
    repairStore(list, 'sales');
    const a = auditData({ sales: list, rep: [], entities: [] }, '2026-11-30');
    assert.equal(a.findings.filter((x) => x.codes.some((c) => c === 'col_unapplied' || c === 'link_orphan')).length, 0);
  });

  it('the fix dialog offers a repair instead of editable fields', () => {
    const plan = planFields('sales', reported()[8], ['col_unapplied'], '2026-11-30', {});
    assert.equal(plan.repair, true);
    assert.deepEqual(plan.fields, []);
    assert.equal(plan.deletable, false);
    assert.ok(plan.notes.length);
  });

  it('the screen loads rep data, repairs one record or all, and saves only what changed', () => {
    const src = readFileSync(new URL('../modules/overview.js', import.meta.url), 'utf8');
    assert.match(src, /'sales', 'rep', 'inventory'/);
    assert.match(src, /label: plan\.repair \? 'Repair'/);
    assert.match(src, /if \(LINK_CODES\.includes\(code\)\) \{ await fixAllLinks\(\); return; \}/);
    assert.match(src, /unifiedSave\(col, arr, null, result\.changedIds\)/);
    assert.match(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /link-repair\.js/);
  });
});
