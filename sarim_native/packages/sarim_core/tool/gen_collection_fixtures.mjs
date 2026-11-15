// Differential fixtures for collection allocation. The orchestration below is the body of
// applyCollectionToSales (modules/link-guards.js) with its I/O stripped; the allocation maths comes
// straight from the web app's link-graph.js and finance.js.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as F from '../../../../modules/finance.js';
import { planCollectionAllocation, applyCollectionAlloc, revertCollectionAlloc, sortForCollection, collectionEligible, getCollectionRevertIssue } from '../../../../modules/link-graph.js';

const here = dirname(fileURLToPath(import.meta.url));
let seed = 424242;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const day = (n) => `2026-10-${String(1 + (n % 28)).padStart(2, '0')}`;
const STAMP = 777000;

function apply({ arr, record, amount, expiredValue = 0, name, original }) {
  const lname = String(name || '').trim().toLowerCase();
  const mine = arr.filter(s => s && !s.deletedAt && !s.isMerged && s.customerName && String(s.customerName).trim().toLowerCase() === lname &&
    (s.currentRepProfile === 'admin' && (s.transactionType === 'OLD_DEBT' || !s.salesRep || s.salesRep === 'NONE')));
  const changed = new Set();
  const hadOld = original && original.paymentType === 'COLLECTION' && Array.isArray(original.allocations) && original.allocations.length;
  if (hadOld) {
    const issue = getCollectionRevertIssue(original, arr);
    if (issue) throw new Error(issue);
    for (const a of original.allocations) {
      const sale = arr.find(s => s && s.id === a.saleId);
      if (sale && revertCollectionAlloc(sale, original.id)) changed.add(sale.id);
    }
  }
  const collectionDate = record.date;
  const candidates = sortForCollection(collectionEligible(mine.filter(s =>
    (s.paymentType === 'CREDIT' || s.transactionType === 'OLD_DEBT') && !s.creditReceived && !s.usedInCalcId &&
    !(s.isRepTransfer || (s.isTransfer && s.transferFrom))), collectionDate));
  const dues = [];
  for (const s of candidates) dues.push({ id: s.id, due: F.debtDelta(s, F.debtNeedsGross(s) ? (F.lockedSaleValue(s) ?? 0) : 0) });
  const credit = Math.max(0, Number(expiredValue) || 0);
  const plan = planCollectionAllocation(amount + credit, dues);
  for (const a of plan.allocs) {
    const sale = candidates.find(s => s.id === a.saleId);
    applyCollectionAlloc(sale, a, record.id, {});
    changed.add(sale.id);
  }
  [...changed].forEach(id => { const s = arr.find(x => x && x.id === id); if (s) s.updatedAt = STAMP; });
  const allocated = plan.allocs.reduce((t, a) => t + a.amount, 0);
  if (plan.allocs.length) {
    const cashPaid = Math.min(amount, allocated);
    const cashLeft = Math.round((amount - cashPaid) * 100) / 100;
    const creditPaid = Math.round((allocated - cashPaid) * 100) / 100;
    record.collectedAmount = amount;
    record.allocations = plan.allocs;
    record.totalValue = cashLeft;
    record.profit = cashLeft;
    if (creditPaid > 0) record.expiredAllocated = creditPaid; else delete record.expiredAllocated;
  } else {
    delete record.collectedAmount; delete record.allocations; delete record.expiredAllocated;
  }
  return { changedIds: [...changed].sort(), allocated, paid: plan.allocs.filter(a => a.full).length, partial: plan.allocs.filter(a => !a.full).length };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const cases = [];
for (let run = 0; run < 300; run++) {
  const name = 'Cust' + rnd(2);
  const sales = [];
  const n = 1 + rnd(6);
  for (let i = 0; i < n; i++) {
    const d = 1 + rnd(25), qty = 1 + rnd(30), price = 10 + rnd(60);
    const k = rnd(8);
    const base = { id: 's' + i, customerName: rnd(10) === 0 ? name.toUpperCase() : name, currentRepProfile: 'admin', date: day(d), timestamp: d * 1000 + i, quantity: qty, unitPrice: price, totalValue: qty * price };
    if (k < 5) sales.push({ ...base, paymentType: 'CREDIT', creditReceived: false, ...(rnd(3) === 0 ? { partialPaymentReceived: 10 * (1 + rnd(20)) } : {}) });
    else if (k === 5) sales.push({ ...base, paymentType: 'CASH' });
    else if (k === 6) sales.push({ id: 'od' + i, customerName: name, currentRepProfile: 'admin', transactionType: 'OLD_DEBT', paymentType: 'CREDIT', creditReceived: false, totalValue: 100 * (1 + rnd(20)), date: day(0), timestamp: 1, quantity: 0 });
    else sales.push({ ...base, paymentType: 'CREDIT', creditReceived: true });
  }
  const steps = [];
  let cur = clone(sales);
  const cols = [];
  for (let c = 0; c < 1 + rnd(3); c++) {
    const rec = { id: 'c' + c, date: day(1 + rnd(27)), paymentType: 'COLLECTION', customerName: name, currentRepProfile: 'admin', totalValue: 0, timestamp: 100000 + c };
    const amount = 10 * (1 + rnd(120));
    const before = clone(cur);
    const out = apply({ arr: cur, record: rec, amount, name });
    steps.push({ op: 'collect', amount, record: clone(rec), out, after: clone(cur), before });
    cur.push(rec); cols.push(rec);
  }
  // Delete the newest collection (revert) and check the web gives the same result.
  const last = cols[cols.length - 1];
  let revert;
  const snapshot = clone(cur);
  const issue = getCollectionRevertIssue(last, cur);
  if (issue) revert = { issue };
  else {
    const ids = [];
    for (const a of last.allocations || []) { const s = cur.find(x => x.id === a.saleId); if (s && revertCollectionAlloc(s, last.id)) { s.updatedAt = STAMP; ids.push(s.id); } }
    revert = { issue: null, ids: ids.sort(), after: clone(cur) };
  }
  cases.push({ name, sales, amountsOrder: steps.map((s) => s.amount), steps, snapshot, revertTarget: last.id, revert });
}
writeFileSync(join(here, '..', 'test', 'fixtures', 'collection_cases.json'), JSON.stringify({ cases, stamp: STAMP }));
console.log(`wrote ${cases.length} collection scenarios`);
