// Generates differential-test fixtures by running the WEB app's finance.js on random ledgers.
// Run from the repo root: node sarim_native/packages/sarim_core/tool/gen_fixtures.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as F from '../../../../modules/finance.js';
import { txDeviceCompare } from '../../../../modules/tx-date.js';
import { planCollectionAllocation, applyCollectionAlloc, sortForCollection, collectionEligible } from '../../../../modules/link-graph.js';

const here = dirname(fileURLToPath(import.meta.url));
let seed = 987654321;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const day = (n) => `2026-10-${String(1 + (n % 28)).padStart(2, '0')}`;
const D = (s) => Date.parse(s);

function collect(sales, id, d, amount, expiredValue) {
  const col = { id, date: day(d), timestamp: D(day(d)) + 2, paymentType: rnd(4) === 0 ? 'PARTIAL_PAYMENT' : 'COLLECTION', totalValue: amount };
  const cands = sortForCollection(collectionEligible(sales.filter((s) => (s.paymentType === 'CREDIT' || s.transactionType === 'OLD_DEBT') && !s.creditReceived), col.date));
  const plan = planCollectionAllocation(amount + expiredValue, cands.map((s) => ({ id: s.id, due: F.debtDelta(s, s.totalValue) })));
  plan.allocs.forEach((a) => applyCollectionAlloc(sales.find((s) => s.id === a.saleId), a, id, {}));
  const allocated = plan.allocs.reduce((n, a) => n + a.amount, 0);
  if (expiredValue > 0) col.expiredValue = expiredValue;
  if (plan.allocs.length) {
    const cashPaid = Math.min(amount, allocated);
    col.collectedAmount = amount;
    col.allocations = plan.allocs;
    col.totalValue = F.round2(amount - cashPaid);
    if (F.round2(allocated - cashPaid) > 0) col.expiredAllocated = F.round2(allocated - cashPaid);
  }
  return col;
}

const cases = [];
for (let run = 0; run < 400; run++) {
  const recs = [];
  const customerName = 'Cust' + rnd(3);
  const base = (r) => ({ customerName, currentRepProfile: 'admin', quantity: 0, ...r });
  if (rnd(3) === 0) recs.push(base({ id: 'od', date: day(0), timestamp: D(day(0)), transactionType: 'OLD_DEBT', paymentType: 'CREDIT', creditReceived: false, totalValue: 100 * (1 + rnd(50)) }));
  if (rnd(6) === 0) recs.push(base({ id: 'op', isMerged: true, paymentType: 'CREDIT', creditReceived: false, creditValue: 50 * (1 + rnd(20)), totalValue: 1000, date: day(0), timestamp: D(day(0)) - 5 }));
  const n = 1 + rnd(6);
  for (let i = 0; i < n; i++) {
    const kind = rnd(9);
    const d = 1 + rnd(25);
    const qty = 1 + rnd(40);
    const price = 10 + rnd(90);
    const common = { id: 's' + i, date: day(d), timestamp: D(day(d)) + i + 1, quantity: qty, unitPrice: price, totalValue: qty * price };
    if (kind <= 3) recs.push(base({ ...common, paymentType: 'CREDIT', creditReceived: false }));
    else if (kind === 4) recs.push(base({ ...common, paymentType: 'CREDIT', creditReceived: true, creditReceivedDate: day(d + 2) }));
    else if (kind === 5) recs.push(base({ ...common, paymentType: 'CASH' }));
    else if (kind === 6) recs.push(base({ id: 'm' + i, date: day(d), timestamp: D(day(d)) + i + 1, paymentType: 'MONEY_OUT', totalValue: 10 * (1 + rnd(90)), creditReceived: true }));
    else if (kind === 7) recs.push(base({ id: 'r' + i, date: day(d), timestamp: D(day(d)) + i + 1, paymentType: 'REP_RETURN', isRepReturn: true, returnValue: 10 * (1 + rnd(30)), returnedQty: 1 + rnd(5), expiredQty: rnd(2) }));
    else recs.push(base({ ...common, paymentType: 'CREDIT', creditReceived: false, partialPaymentReceived: rnd(2) ? rnd(qty * price) : 0 }));
  }
  const ncol = rnd(4);
  for (let i = 0; i < ncol; i++) recs.push(base(collect(recs, 'c' + i, 1 + rnd(27), 10 * (1 + rnd(60)), rnd(3) === 0 ? 10 * (1 + rnd(10)) : 0)));
  const reconciled = recs.filter((t) => t.isRepReturn && rnd(3) === 0).map((t) => t.id);
  const opts0 = { reconciledReturnIds: new Set(reconciled) };
  const honor = F.allocHonor(recs);
  const opts = { ...opts0, honor };
  const per = recs.map((t) => {
    const gross = F.debtNeedsGross(t) ? (t.isMerged ? t.totalValue : F.lockedSaleValue(t) ?? 0) : 0;
    const split = F.ledgerSplit(t, gross, opts);
    const rr = F.rowReceived(t, F.lockedSaleValue(t) ?? 0);
    return {
      id: t.id, gross,
      debt: F.debtDelta(t, gross, opts0),
      ledger: F.ledgerDelta(t, gross, opts),
      split: [split.debit, split.credit, split.delta],
      recv: [rr.sale, rr.collection, rr.returns, rr.cash, rr.paid, rr.received, rr.moneyOut],
      sold: F.soldQuantity(t), returned: F.returnedQuantity(t), net: F.netSoldQuantity(t),
      locked: F.lockedSaleValue(t), lockedUnit: F.lockedUnitPrice(t), needsGross: F.debtNeedsGross(t),
      honored: F.honoredToSale(honor, t),
    };
  });
  const tot = F.periodTotals(recs.map((t) => ({ t, value: F.lockedSaleValue(t) ?? 0 })));
  const asc = recs.map((t, i) => ({ t, i })).sort((a, b) => txDeviceCompare(a.t, b.t) || (a.i - b.i));
  let run2 = 0;
  const ledger = asc.map(({ t }) => {
    const gross = F.debtNeedsGross(t) ? (F.lockedSaleValue(t) ?? 0) : 0;
    run2 = F.round2(run2 + F.ledgerDelta(t, gross, opts));
    return { id: t.id, balance: run2 };
  });
  let credit = 0;
  for (const t of recs) credit = F.round2(credit + F.debtDelta(t, F.debtNeedsGross(t) ? (F.lockedSaleValue(t) ?? 0) : 0, opts0));
  cases.push({ customerName, ledger, credit, records: recs, reconciled, per, totals: tot, periodQty: F.periodQuantity(recs.map((t) => ({ t }))) });
}

const nums = [0, 1, 999, 1000, 1234.5, 12345.678, 123456, 1234567.891, 99999999.999, -1500.5, 0.005, 0.004, 2.675, 1.005, -0.001, 100000, 1e7 + 0.5];
const numbers = nums.map((v) => ({ v, fmt: F.fmtNum(v), round2: F.round2(v) }));
writeFileSync(join(here, '..', 'test', 'fixtures', 'finance_cases.json'), JSON.stringify({ cases, numbers }));
console.log(`wrote ${cases.length} ledger cases, ${numbers.length} number cases`);
