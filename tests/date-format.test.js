import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { formatDayMonthYear, formatDateKey, dateSearchText } from '../modules/date-format.js';

describe('short date 21 OCT 2026', () => {
  it('formats a Date', () => {
    assert.equal(formatDayMonthYear(new Date(2026, 9, 21)), '21 OCT 2026');
    assert.equal(formatDayMonthYear(new Date(2026, 0, 5)), '05 JAN 2026');
  });
  it('formats a YYYY-MM-DD key without a timezone shift', () => {
    assert.equal(formatDateKey('2026-10-21'), '21 OCT 2026');
    assert.equal(formatDateKey('2026-12-31'), '31 DEC 2026');
  });
  it('gives an empty string for anything that is not a date', () => {
    assert.equal(formatDayMonthYear(new Date('x')), '');
    assert.equal(formatDayMonthYear(null), '');
    assert.equal(formatDateKey('nope'), '');
    assert.equal(formatDateKey('2026-13-01'), '');
  });

  it('search still matches the old date styles', () => {
    const t = dateSearchText('2026-10-21');
    for (const q of ['oct 21 26', 'oct 21', '21 oct', '2026-10-21', 'oct 21 2026']) assert.ok(t.includes(q), q);
    assert.equal(dateSearchText('x'), '');
  });

  it('no screen or export still builds a full date the old way', () => {
    const dir = new URL('../modules/', import.meta.url);
    const offenders = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      if (/month:\s*'long',\s*day:\s*'numeric'/.test(src) && /year:\s*'numeric',\s*month:\s*'long'/.test(src)) offenders.push(`${f}: long month date`);
      if (/day:\s*'(2-digit|numeric)',\s*month:\s*'short',\s*year:/.test(src)) offenders.push(`${f}: short month date`);
      if (/month:\s*'short',\s*day:\s*'2-digit',\s*year:\s*'2-digit'/.test(src)) offenders.push(`${f}: two-digit year`);
    }
    assert.deepEqual(offenders, []);
  });
});
