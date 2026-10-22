import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDayMonthYear, formatDateKey } from '../modules/date-format.js';

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
});
