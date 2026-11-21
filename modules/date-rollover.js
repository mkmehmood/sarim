import { localDateStr } from './finance.js';

export const DEFAULT_DATE_IDS = ['sys-date', 'sale-date', 'sale-date-from', 'cust-date', 'factory-date', 'expenseDate', 'rep-date', 'admin-rep-date', 'dl-date', 'stock-transfer-date'];

export function rolloverDates(ids, lastDay, today, getEl) {
  if (!lastDay || lastDay === today) return { changed: [], day: today };
  const changed = [];
  ids.forEach((id) => {
    const el = getEl(id);
    if (el && el.value === lastDay) {
      el.value = today;
      changed.push(id);
    }
  });
  return { changed, day: today };
}

let lastDay = '';

export function checkDateRollover(doc = document, win = window) {
  const today = localDateStr();
  if (!lastDay) { lastDay = today; return []; }
  const out = rolloverDates(DEFAULT_DATE_IDS, lastDay, today, (id) => { const el = doc.getElementById(id); return el && el === doc.activeElement ? null : el; });
  if (out.changed.length || lastDay !== today) {
    out.changed.forEach((id) => {
      const el = doc.getElementById(id);
      ['input', 'change'].forEach((type) => el.dispatchEvent(new win.Event(type, { bubbles: true })));
    });
    if (win.currentFactoryDate === lastDay) win.currentFactoryDate = today;
    lastDay = today;
  }
  return out.changed;
}

export function installDateRollover(doc = document, win = window) {
  lastDay = localDateStr();
  const run = () => checkDateRollover(doc, win);
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') run(); });
  win.addEventListener('focus', run);
  win.setInterval(run, 60000);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installDateRollover());
  else installDateRollover();
  window.checkDateRollover = () => checkDateRollover();
}
