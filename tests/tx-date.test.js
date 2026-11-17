import test from 'node:test';
import assert from 'node:assert/strict';
import { txEffectiveDate, txShowTime, txChronoCompare } from '../modules/tx-date.js';
const backdated = { id: 'a', date: '2026-10-06', supplyDate: '2026-10-03', timestamp: 3000, time: '10:00 AM' };
const normal    = { id: 'b', date: '2026-10-05', timestamp: 2000, time: '09:00 AM' };
const sameDay   = { id: 'c', date: '2026-10-05', supplyDate: '2026-10-05', timestamp: 1000 };
test('effective date is the device date, never the picked supply date', () => {
  assert.equal(txEffectiveDate(backdated), '2026-10-06');
  assert.equal(txEffectiveDate(normal), '2026-10-05');
});
test('falls back to creation time when no date fields exist', () => {
  const created = new Date(2026, 9, 2, 12).getTime();
  assert.equal(txEffectiveDate({ createdAt: created }), '2026-10-02');
});
test('entry time is always shown because it belongs to the device date', () => {
  assert.equal(txShowTime(backdated), true);
  assert.equal(txShowTime(normal), true);
  assert.equal(txShowTime(sameDay), true);
});
test('chronological order follows the device date then time, not the supply date', () => {
  const asc = [normal, backdated, sameDay].sort(txChronoCompare).map(t => t.id);
  assert.deepEqual(asc, ['c', 'b', 'a']);
  const desc = [normal, backdated, sameDay].sort((x, y) => txChronoCompare(y, x)).map(t => t.id);
  assert.deepEqual(desc, ['a', 'b', 'c']);
});
import { txDeviceDate, txDeviceCompare } from '../modules/tx-date.js';
test('device date ignores the picked supply date', () => {
  assert.equal(txDeviceDate(backdated), '2026-10-06');
  assert.equal(txDeviceDate(normal), '2026-10-05');
});
test('device order follows the recorded date then time, not the supply date', () => {
  const asc = [normal, backdated, sameDay].sort(txDeviceCompare).map(t => t.id);
  assert.deepEqual(asc, ['c', 'b', 'a']);
  const desc = [normal, backdated, sameDay].sort((x, y) => txDeviceCompare(y, x)).map(t => t.id);
  assert.deepEqual(desc, ['a', 'b', 'c']);
});
const oldDebt = { id: 'od', transactionType: 'OLD_DEBT', date: '2026-10-22', timestamp: 9000, time: '04:00 PM' };
const merged  = { id: 'mg', isMerged: true, date: '2026-10-20', timestamp: 8000 };
const early   = { id: 'e', date: '2026-01-02', timestamp: 100 };
test('old debt is always the first transaction, whatever its own date and time', () => {
  const all = [normal, oldDebt, early, backdated];
  assert.equal(all.slice().sort(txChronoCompare)[0].id, 'od');
  assert.equal(all.slice().sort(txDeviceCompare)[0].id, 'od');
  assert.equal(all.slice().sort((x, y) => txChronoCompare(y, x)).at(-1).id, 'od');
  assert.equal(all.slice().sort((x, y) => txDeviceCompare(y, x)).at(-1).id, 'od');
});
test('year-end merged balances come before old debt, then everything else by date and time', () => {
  assert.deepEqual([normal, oldDebt, merged, early].sort(txChronoCompare).map(t => t.id), ['mg', 'od', 'e', 'b']);
  assert.deepEqual([normal, oldDebt, merged, early].sort(txDeviceCompare).map(t => t.id), ['mg', 'od', 'e', 'b']);
});
import { pinOpeningDays } from '../modules/tx-date.js';
test('old debt and merged rows are pinned to the earliest day so they group first', () => {
  const rows = [{ id: 'n', dkey: '2026-10-05' }, { id: 'od', dkey: '2026-10-22', opening: true }, { id: 'e', dkey: '2026-01-02' }];
  pinOpeningDays(rows);
  assert.equal(rows[1].dkey, '2026-01-02');
  const keep = [{ id: 'n', dkey: '2026-10-05' }, { id: 'od', dkey: '2026-01-01', opening: true }];
  pinOpeningDays(keep);
  assert.equal(keep[1].dkey, '2026-01-01');
});
