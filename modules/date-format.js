const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDayMonthYear(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  return m && MONTHS[Number(m[2]) - 1] ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/**
 * Extra text a date search should match besides what is on screen, so typing the old style
 * (OCT 21 26, OCT 21) or the plain key (2026-10-21) still finds the row. Lower case.
 */
export function dateSearchText(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  const mon = m && MONTHS[Number(m[2]) - 1];
  if (!mon) return '';
  const [, y, , d] = m;
  return `${mon} ${d} ${y.slice(-2)}|${mon} ${d} ${y}|${mon} ${d}|${d} ${mon}|${m[0]}`.toLowerCase();
}
