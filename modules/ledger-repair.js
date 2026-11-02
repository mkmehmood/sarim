import { round2 } from './finance.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const live = (t) => !!t && !!t.id && !t.deletedAt;
const isCollection = (t) => t.paymentType === 'COLLECTION' || t.paymentType === 'PARTIAL_PAYMENT';
const amountOf = (a) => Math.max(0, Number(a && a.amount) || 0);
const total = (list) => round2((Array.isArray(list) ? list : []).reduce((n, a) => n + amountOf(a), 0));
const stampOf = (t) => Number(t.updatedAt) || Number(t.createdAt) || 0;

export function repairLedgerLinks(list, { now = Date.now(), minAgeMs = DAY_MS } = {}) {
  const arr = Array.isArray(list) ? list : [];
  const byId = new Map();
  arr.forEach(t => { if (live(t)) byId.set(t.id, t); });
  const changedIds = new Set();
  const report = { collectedFilled: [], danglingCollectionAllocs: [], orphanSaleAllocs: [], amountMismatch: [], skippedRecent: 0 };
  const colSide = new Set();
  const saleSide = new Set();
  byId.forEach(t => {
    if (isCollection(t) && Array.isArray(t.allocations)) t.allocations.forEach(a => a && colSide.add(`${t.id}|${a.saleId}`));
    if (Array.isArray(t.collectionAllocs)) t.collectionAllocs.forEach(e => e && saleSide.add(`${e.cid}|${t.id}`));
  });
  const recent = (t) => now - stampOf(t) < minAgeMs;

  byId.forEach(col => {
    if (!isCollection(col) || !Array.isArray(col.allocations) || !col.allocations.length) return;
    if (col.collectedAmount == null) {
      const cashPaid = Math.max(0, total(col.allocations) - (Number(col.expiredAllocated) || 0));
      col.collectedAmount = round2(Math.max(0, (Number(col.totalValue) || 0) + cashPaid));
      changedIds.add(col.id);
      report.collectedFilled.push({ collectionId: col.id, collectedAmount: col.collectedAmount });
    }
    const keep = [];
    col.allocations.forEach(a => {
      if (!a) return;
      if (saleSide.has(`${col.id}|${a.saleId}`)) {
        const entry = (byId.get(a.saleId).collectionAllocs || []).find(e => e && e.cid === col.id);
        if (entry && Math.abs(amountOf(entry) - amountOf(a)) > 0.01) report.amountMismatch.push({ collectionId: col.id, saleId: a.saleId, collection: amountOf(a), sale: amountOf(entry) });
        keep.push(a);
      } else if (recent(col)) {
        report.skippedRecent++;
        keep.push(a);
      } else {
        report.danglingCollectionAllocs.push({ collectionId: col.id, saleId: a.saleId, amount: amountOf(a) });
      }
    });
    if (keep.length !== col.allocations.length) {
      if (keep.length) col.allocations = keep; else delete col.allocations;
      changedIds.add(col.id);
    }
  });

  byId.forEach(sale => {
    if (!Array.isArray(sale.collectionAllocs) || !sale.collectionAllocs.length) return;
    const keep = [];
    sale.collectionAllocs.forEach(e => {
      if (!e) return;
      if (colSide.has(`${e.cid}|${sale.id}`)) keep.push(e);
      else if (recent(sale)) { report.skippedRecent++; keep.push(e); }
      else report.orphanSaleAllocs.push({ saleId: sale.id, collectionId: e.cid, amount: amountOf(e) });
    });
    if (keep.length !== sale.collectionAllocs.length) {
      if (keep.length) sale.collectionAllocs = keep; else delete sale.collectionAllocs;
      changedIds.add(sale.id);
    }
  });
  return { changedIds, report };
}
