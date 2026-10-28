import { editDateValue } from './edit-date.js';

export function txDeviceDate(t) {
  return editDateValue(t, ['date', 'createdAt', 'timestamp']);
}

export const txEffectiveDate = txDeviceDate;

export function txShowTime() {
  return true;
}

function txOpeningRank(t) {
  if (t && t.isMerged) return 0;
  return t && t.transactionType === 'OLD_DEBT' ? 1 : 2;
}

export function txDeviceCompare(a, b) {
  const ra = txOpeningRank(a), rb = txOpeningRank(b);
  if (ra !== rb) return ra - rb;
  const da = txDeviceDate(a), db = txDeviceDate(b);
  if (da !== db) return da < db ? -1 : 1;
  return (Number(a && a.timestamp) || 0) - (Number(b && b.timestamp) || 0);
}

export const txChronoCompare = txDeviceCompare;

export function ledgerEffectiveDate(t) {
  const pt = t.paymentType || 'CASH';
  if (t.transactionType === 'OLD_DEBT') return new Date(0);
  if (pt === 'COLLECTION' || pt === 'PARTIAL_PAYMENT' || (pt === 'CREDIT' && t.creditReceived)) {
    return new Date(t.creditReceivedDate || t.date || 0);
  }
  return new Date(t.date || 0);
}

export function pinOpeningDays(entries) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let first = null;
  for (const e of entries) if (!e.opening && iso.test(e.dkey) && (first === null || e.dkey < first)) first = e.dkey;
  if (first === null) return entries;
  for (const e of entries) if (e.opening && (!iso.test(e.dkey) || e.dkey > first)) e.dkey = first;
  return entries;
}
