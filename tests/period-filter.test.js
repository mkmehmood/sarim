import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');
const start = src.indexOf('function _inPeriod(');
const end = src.indexOf('\n}\n', start) + 3;
if (start < 0) throw new Error('_inPeriod not found');
const inPeriod = new Function(src.slice(start, end) + '\nreturn _inPeriod;')();

function reference(dateStr, mode, selectedDate, selectedDateObj, selectedYear, selectedMonth) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth();
  let inc = false;
  if (mode === 'day' && dateStr === selectedDate) inc = true;
  else if (mode === 'week') {
    const weekStart = new Date(selectedDateObj);
    weekStart.setDate(selectedDateObj.getDate() - 6);
    if (d >= weekStart && d <= selectedDateObj) inc = true;
  }
  else if (mode === 'month' && y === selectedYear && m === selectedMonth) inc = true;
  else if (mode === 'year' && y === selectedYear) inc = true;
  else if (mode === 'all') inc = true;
  return inc;
}

describe('_inPeriod matches the original inline period test', () => {
  const selectedDate = '2026-03-15';
  const selectedDateObj = new Date(selectedDate);
  const dates = ['2026-03-15', '2026-03-09', '2026-03-08', '2026-03-16', '2026-03-01', '2026-02-28', '2025-03-15', '2026-12-31', 'bad-date', undefined];
  for (const mode of ['day', 'week', 'month', 'year', 'all', 'other', undefined]) {
    it(`mode ${mode}`, () => {
      for (const ds of dates) {
        assert.equal(
          inPeriod(ds, mode, selectedDate, selectedDateObj, 2026, 2),
          reference(ds, mode, selectedDate, selectedDateObj, 2026, 2),
          `${mode} ${ds}`
        );
      }
    });
  }
});
