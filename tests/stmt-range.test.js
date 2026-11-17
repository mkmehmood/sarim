import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDayMonthYear } from '../modules/date-format.js';

const src = readFileSync(new URL('../modules/stmt-range.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/export (async )?function/g, '$1function');
const api = new Function('formatDayMonthYear', `${src}\nreturn { isValidRange, rangeBounds, rangeLabel, todayIso };`)(formatDayMonthYear);

describe('statement date range', () => {
  it('accepts an ordered From/To pair and rejects the rest', () => {
    assert.equal(api.isValidRange('2026-01-01', '2026-01-31'), true);
    assert.equal(api.isValidRange('2026-01-31', '2026-01-01'), false);
    assert.equal(api.isValidRange('', '2026-01-01'), false);
    assert.equal(api.isValidRange('2026-1-1', '2026-01-02'), false);
  });
  it('builds inclusive local day bounds', () => {
    const b = api.rangeBounds('2026-03-01', '2026-03-05');
    assert.equal(b.start.getHours(), 0);
    assert.equal(b.end.getHours(), 23);
    assert.equal(b.end.getDate(), 5);
  });
  it('returns open bounds when no range is given', () => {
    const b = api.rangeBounds('', undefined);
    assert.equal(b.start, null);
    assert.equal(b.end, null);
    assert.equal(api.rangeLabel('', ''), 'All Time');
  });
  it('labels a range with both dates', () => {
    const t = api.rangeLabel('2026-03-01', '2026-03-05');
    assert.match(t, /01 MAR 2026/);
    assert.match(t, /05 MAR 2026/);
  });
});
