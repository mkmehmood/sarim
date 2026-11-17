import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { formatDayMonthYear, formatMonthYear, formatDateTime, formatDateKey } from '../modules/date-format.js';

describe('one date format everywhere: 20 OCT 2026', () => {
  const d = new Date(2026, 9, 20, 15, 45);
  it('formats day, month-year and date-time the same way', () => {
    assert.equal(formatDayMonthYear(d), '20 OCT 2026');
    assert.equal(formatMonthYear(d), 'OCT 2026');
    assert.equal(formatDateTime(d), '20 OCT 2026, 03:45 PM');
    assert.equal(formatDateKey('2026-10-05'), '05 OCT 2026');
  });
  it('rejects bad input without throwing', () => {
    assert.equal(formatDateTime('nope'), '');
    assert.equal(formatMonthYear(null), '');
  });
  it('no module prints dates through the device locale', () => {
    const dir = new URL('../modules/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      assert.ok(!/new Date\([^)]*\)\.toLocaleString\(/.test(src), `${f} uses locale date-time`);
      assert.ok(!/toLocaleDateString\('en-US',\s*\{[^}]*(month: 'long'|year)/.test(src), `${f} uses locale month-year`);
    }
  });
  it('date picker shows the same format', () => {
    const src = readFileSync(new URL('../modules/custom-date-picker.js', import.meta.url), 'utf8');
    assert.match(src, /toUpperCase\(\)\s*\+ ' ' \+ dt\.getFullYear\(\)/);
  });
});
