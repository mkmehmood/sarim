import { allocHonor, collectionUnapplied, debtDelta, lockedSaleValue, round2 } from './finance.js';
import { applyCollectionAlloc, collectionEligible, planCollectionAllocation, revertCollectionAlloc, sortForCollection } from './link-graph.js';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const alive = (r) => !!r && typeof r === 'object' && !r.isDeleted && !r.deletedAt;
const isCol = (t) => !!t && (t.paymentType === 'COLLECTION' || t.paymentType === 'PARTIAL_PAYMENT');
const lc = (v) => String(v || '').trim().toLowerCase();

export const LINK_CODES = ['col_unapplied', 'link_orphan'];

export function defaultGross(s) {
  const v = lockedSaleValue(s);
  return v == null ? num(s && s.totalValue) : v;
}

function customerSales(records, kind, col) {
  const name = lc(col.customerName);
  return records.filter((s) => alive(s) && !isCol(s) && !s.isMerged && s.customerName && lc(s.customerName) === name &&
    (kind === 'rep'
      ? s.salesRep === col.salesRep
      : (s.currentRepProfile === 'admin' && (s.transactionType === 'OLD_DEBT' || !s.salesRep || s.salesRep === 'NONE'))));
}

export function auditLinks(records, kind = 'sales') {
  const list = (Array.isArray(records) ? records : []).filter(alive);
  const honor = allocHonor(list);
  const liveCols = new Set(list.filter(isCol).map((c) => c.id));
  const issues = [];
  list.forEach((r) => {
    if (isCol(r)) {
      const left = collectionUnapplied(r, honor);
      if (left > 0.01) issues.push({ code: 'col_unapplied', rec: r, amount: left, detail: `${Math.round(left).toLocaleString('en-US')} received but not applied to any sale` });
    } else if (Array.isArray(r.collectionAllocs)) {
      const gone = r.collectionAllocs.filter((e) => e && !liveCols.has(e.cid));
      if (gone.length) {
        const amount = round2(gone.reduce((n, e) => n + Math.max(0, num(e.amount)), 0));
        issues.push({ code: 'link_orphan', rec: r, amount, detail: `${Math.round(amount).toLocaleString('en-US')} marked as paid by a collection that no longer exists` });
      }
    }
  });
  return issues;
}

function splitCollection(col, allocs) {
  const amount = col.collectedAmount != null ? num(col.collectedAmount) : num(col.totalValue);
  if (!allocs.length) {
    delete col.collectedAmount;
    delete col.allocations;
    delete col.expiredAllocated;
    col.totalValue = amount;
    col.profit = amount;
    return;
  }
  const allocated = allocs.reduce((n, a) => n + num(a.amount), 0);
  const cashPaid = Math.min(amount, allocated);
  const cashLeft = round2(amount - cashPaid);
  const creditPaid = round2(allocated - cashPaid);
  col.collectedAmount = amount;
  col.allocations = allocs;
  col.totalValue = cashLeft;
  col.profit = cashLeft;
  if (creditPaid > 0) col.expiredAllocated = creditPaid; else delete col.expiredAllocated;
}

export function repairCollection(records, colId, opts = {}) {
  const kind = opts.kind === 'rep' ? 'rep' : 'sales';
  const getGross = opts.getGross || defaultGross;
  const col = records.find((r) => r && r.id === colId && alive(r) && isCol(r));
  const out = { changed: new Set(), restored: 0, dropped: 0, applied: 0 };
  if (!col) return out;
  const hasClaims = Array.isArray(col.allocations) && col.allocations.length > 0;
  if (!hasClaims && !(collectionUnapplied(col, allocHonor(records.filter(alive))) > 0.01)) return out;
  if (!hasClaims) splitCollection(col, []);
  const mine = customerSales(records, kind, col);
  const confirmedSum = (s) => (Array.isArray(s.collectionAllocs) ? s.collectionAllocs.reduce((n, e) => n + (e && records.some((c) => c && c.id === e.cid && alive(c)) ? num(e.amount) : 0), 0) : 0);
  const kept = [];
  let droppedAmount = 0;
  for (const claim of (hasClaims ? col.allocations : [])) {
    const sale = mine.find((s) => s.id === claim.saleId);
    const has = sale && Array.isArray(sale.collectionAllocs) && sale.collectionAllocs.some((e) => e && e.cid === col.id);
    if (has) { kept.push(claim); continue; }
    if (sale) {
      const paid = sale.creditReceived ? num(getGross(sale)) : num(sale.partialPaymentReceived);
      if (paid + 0.01 >= confirmedSum(sale) + num(claim.amount)) {
        if (!Array.isArray(sale.collectionAllocs)) sale.collectionAllocs = [];
        sale.collectionAllocs.push({ cid: col.id, amount: round2(num(claim.amount)), full: !!claim.full });
        out.changed.add(sale.id);
        out.restored += 1;
        kept.push(claim);
        continue;
      }
    }
    droppedAmount = round2(droppedAmount + num(claim.amount));
    out.dropped += 1;
  }
  if (out.dropped || !hasClaims) {
    splitCollection(col, kept);
    const amount = col.collectedAmount != null ? num(col.collectedAmount) : num(col.totalValue);
    const held = round2(num(col.totalValue) + Math.max(0, num(col.expiredValue) - num(col.expiredAllocated)));
    const budget = hasClaims ? Math.min(droppedAmount, held) : held;
    if (budget > 0.004) {
      const open = sortForCollection(collectionEligible(mine.filter((s) =>
        (s.paymentType === 'CREDIT' || s.transactionType === 'OLD_DEBT') && !s.creditReceived && !s.usedInCalcId &&
        !(s.isRepTransfer || (s.isTransfer && s.transferFrom))), col.date));
      const dues = open.map((s) => ({ id: s.id, due: debtDelta(s, getGross(s)) }));
      const plan = planCollectionAllocation(budget, dues);
      const next = kept.slice();
      for (const a of plan.allocs) {
        const sale = open.find((s) => s.id === a.saleId);
        applyCollectionAlloc(sale, a, col.id, {});
        next.push(a);
        out.changed.add(sale.id);
        out.applied += 1;
      }
      if (plan.allocs.length) {
        const fresh = next.reduce((n, a) => n + num(a.amount), 0);
        splitCollection(col, next);
        if (fresh > amount + num(col.expiredValue) + 0.01) splitCollection(col, kept);
      }
    }
    out.changed.add(col.id);
  } else if (out.restored) {
    out.changed.add(col.id);
  }
  return out;
}

export function repairOrphans(records, ids) {
  const scope = ids ? new Set(ids) : null;
  const out = { changed: new Set(), cleared: 0 };
  const list = records.filter(alive);
  const liveCols = new Set(list.filter(isCol).map((c) => c.id));
  list.forEach((r) => {
    if (isCol(r) || !Array.isArray(r.collectionAllocs) || (scope && !scope.has(r.id))) return;
    r.collectionAllocs.filter((e) => e && !liveCols.has(e.cid)).map((e) => e.cid).forEach((cid) => {
      if (revertCollectionAlloc(r, cid)) { out.changed.add(r.id); out.cleared += 1; }
    });
  });
  return out;
}

export function repairStore(records, kind, opts = {}) {
  const changed = new Set();
  const totals = { restored: 0, dropped: 0, applied: 0, cleared: 0 };
  if (!opts.only || opts.orphanIds) {
    const orphans = repairOrphans(records, opts.orphanIds);
    orphans.changed.forEach((id) => changed.add(id));
    totals.cleared = orphans.cleared;
  }
  const order = (a, b) => (String(a.date || '') < String(b.date || '') ? -1 : String(a.date || '') > String(b.date || '') ? 1 : num(a.timestamp) - num(b.timestamp));
  const only = opts.only ? new Set(opts.only) : null;
  const flagged = auditLinks(records, kind).filter((i) => i.code === 'col_unapplied' && (!only || only.has(i.rec.id)) && !opts.orphanIds).map((i) => i.rec).sort(order);
  for (const col of flagged) {
    const r = repairCollection(records, col.id, { kind, getGross: opts.getGross });
    r.changed.forEach((id) => changed.add(id));
    totals.restored += r.restored; totals.dropped += r.dropped; totals.applied += r.applied;
  }
  return { changedIds: [...changed], ...totals };
}

export function repairSummary(r) {
  const parts = [];
  if (r.cleared) parts.push(`${r.cleared} stale payment link${r.cleared === 1 ? '' : 's'} removed`);
  if (r.restored) parts.push(`${r.restored} lost link${r.restored === 1 ? '' : 's'} restored`);
  if (r.applied) parts.push(`cash applied to ${r.applied} sale${r.applied === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'Nothing needed changing';
}
