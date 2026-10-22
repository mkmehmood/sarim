const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const keyOf = (name) => String(name || '').trim().toLowerCase();

export function cleanExpenseItems(list) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    const name = String((it && it.name) || '').trim();
    const amount = r2(it && it.amount);
    if (name && amount > 0) out.push({ name, amount });
  }
  return out;
}

export function addExpenseItem(list, name, amount) {
  const label = String(name || '').trim();
  const value = r2(amount);
  const items = cleanExpenseItems(list).map((it) => ({ ...it }));
  if (!label || !(value > 0)) return items;
  const hit = items.find((it) => keyOf(it.name) === keyOf(label));
  if (hit) hit.amount = r2(hit.amount + value);
  else items.push({ name: label, amount: value });
  return items;
}

export function removeExpenseItem(list, index) {
  return cleanExpenseItems(list).filter((_, i) => i !== index);
}

export function expenseTotal(list) {
  return r2(cleanExpenseItems(list).reduce((sum, it) => sum + it.amount, 0));
}

export const OTHER_EXPENSE_LABEL = 'Other';

export function expenseItemsOfRecord(rec) {
  const items = cleanExpenseItems(rec && rec.fieldExpenseItems);
  if (items.length) return items;
  const total = r2(rec && rec.fieldExpenses);
  return total > 0 ? [{ name: OTHER_EXPENSE_LABEL, amount: total }] : [];
}

export const COMMISSION_LABEL = 'Commission';

export function commissionItemsOfRecord(rec) {
  const items = cleanExpenseItems(rec && rec.commissionPaidItems);
  if (items.length) return items;
  const total = r2(rec && rec.commissionPaid);
  return total > 0 ? [{ name: COMMISSION_LABEL, amount: total }] : [];
}

export function mergeExpenseItems(a, b) {
  let out = cleanExpenseItems(a);
  for (const it of cleanExpenseItems(b)) out = addExpenseItem(out, it.name, it.amount);
  return out;
}

export function sortedExpenseEntries(list) {
  return cleanExpenseItems(list).sort((x, y) => y.amount - x.amount).map((it) => [it.name, it.amount]);
}
