export const MAX_AMOUNT = 10000000000;

export function phoneIssue(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  if (!/^\+?[\d\s\-()]+$/.test(v)) return 'Phone number can only contain digits, spaces, dashes and an optional + at the start.';
  const digits = v.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) return 'Phone number must have between 7 and 15 digits.';
  return '';
}

export function dateIssue(raw, today) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return 'Please enter a valid date.';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return 'Please enter a valid date.';
  if (+m[1] < 2000) return 'Please enter a valid date.';
  if (today && v > today) return 'Date cannot be in the future.';
  return '';
}

export function strictAmount(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return NaN;
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return NaN;
  return Number(s.replace(/,/g, ''));
}

export const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function amountIssue(n) {
  if (!(n > 0)) return 'Please enter a valid amount greater than 0.';
  if (n > MAX_AMOUNT) return 'Amount is too large.';
  return '';
}

export function canonicalName(typed, known) {
  const clean = String(typed == null ? '' : typed).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const key = clean.toLowerCase();
  const hit = (Array.isArray(known) ? known : []).find((c) => c && c.name && String(c.name).replace(/\s+/g, ' ').trim().toLowerCase() === key);
  return hit ? String(hit.name).replace(/\s+/g, ' ').trim() : clean;
}
