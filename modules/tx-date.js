import { editDateValue } from './edit-date.js';

export function txEffectiveDate(t) {
  return editDateValue(t, ['supplyDate', 'date', 'createdAt', 'timestamp']);
}

export function txShowTime(t) {
  return !t || !t.supplyDate || t.supplyDate === t.date;
}

export function txChronoCompare(a, b) {
  const da = txEffectiveDate(a), db = txEffectiveDate(b);
  if (da !== db) return da < db ? -1 : 1;
  return (Number(a && a.timestamp) || 0) - (Number(b && b.timestamp) || 0);
}

export function txDeviceDate(t) {
  return editDateValue(t, ['date', 'createdAt', 'timestamp']);
}

export function txDeviceCompare(a, b) {
  const da = txDeviceDate(a), db = txDeviceDate(b);
  if (da !== db) return da < db ? -1 : 1;
  return (Number(a && a.timestamp) || 0) - (Number(b && b.timestamp) || 0);
}

export function ledgerEffectiveDate(t) {
  const pt = t.paymentType || 'CASH';
  if (t.transactionType === 'OLD_DEBT') return new Date(0);
  if (pt === 'COLLECTION' || pt === 'PARTIAL_PAYMENT' || (pt === 'CREDIT' && t.creditReceived)) {
    return new Date(t.creditReceivedDate || t.date || 0);
  }
  return new Date(t.supplyDate || t.date || 0);
}
