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
