import test from 'node:test';
import assert from 'node:assert/strict';
import { planCalcRelink, applyCalcRelink } from '../modules/calc-relink.js';
import { readSource } from './_extract.js';

const sale = (id, date, seller = 'Ali', supplyDate) => ({ id, date, supplyDate, customerName: seller, paymentType: 'CREDIT', creditReceived: true });
const calc = (id, date, ids, seller = 'Ali') => ({ id, seller, date, timestamp: Date.parse(date), linkedSalesIds: ids });

test('a sale stays with the calculator record whose device-date cycle holds it', () => {
  const sales = [sale('a', '2026-10-02'), sale('b', '2026-10-09')];
  const calcs = [calc('c1', '2026-10-05', ['a']), calc('c2', '2026-10-10', ['b'])];
  assert.deepEqual(planCalcRelink(calcs, sales), []);
});

test('a sale linked by its old supply date moves to the record covering its device date', () => {
  const sales = [sale('a', '2026-10-08', 'Ali', '2026-10-02'), sale('b', '2026-10-09')];
  const calcs = [calc('c1', '2026-10-05', ['a']), calc('c2', '2026-10-10', ['b'])];
  assert.deepEqual(planCalcRelink(calcs, sales), [{ saleId: 'a', from: 'c1', to: 'c2' }]);
});

test('a sale created before an earlier record moves back to it', () => {
  const sales = [sale('a', '2026-10-03')];
  const calcs = [calc('c1', '2026-10-05', []), calc('c2', '2026-10-10', ['a'])];
  assert.deepEqual(planCalcRelink(calcs, sales), [{ saleId: 'a', from: 'c2', to: 'c1' }]);
});

test('a sale dated after the last record is left where it is', () => {
  const sales = [sale('a', '2026-10-20')];
  assert.deepEqual(planCalcRelink([calc('c1', '2026-10-10', ['a'])], sales), []);
});

test('records on the same day share one cycle and other sellers or deleted records are ignored', () => {
  const sales = [sale('a', '2026-10-10'), sale('x', '2026-10-01', 'Bilal')];
  const calcs = [calc('c1', '2026-10-10', []), calc('c2', '2026-10-10', ['a']), calc('c3', '2026-10-05', ['x'], 'Ali'), { ...calc('c4', '2026-10-02', ['a']), deletedAt: 1 }];
  assert.deepEqual(planCalcRelink(calcs, sales), []);
});

test('applying moves only changes links and the two records touched, and a second plan is empty', () => {
  const sales = [sale('a', '2026-10-08', 'Ali', '2026-10-02'), sale('b', '2026-10-09')];
  const calcs = [calc('c1', '2026-10-05', ['a']), calc('c2', '2026-10-10', ['b']), calc('c3', '2026-10-20', [])];
  const salesBefore = JSON.stringify(sales);
  const changed = applyCalcRelink(calcs, planCalcRelink(calcs, sales), () => 42);
  assert.deepEqual(changed.sort(), ['c1', 'c2']);
  assert.deepEqual(calcs.map(c => c.linkedSalesIds), [[], ['b', 'a'], []]);
  assert.equal(calcs[2].updatedAt, undefined);
  assert.equal(JSON.stringify(sales), salesBefore);
  assert.deepEqual(planCalcRelink(calcs, sales), []);
});

test('the migration runs once at startup after the data loads and is flagged', () => {
  const src = readSource('modules/utilities-payments.js');
  assert.match(src, /await loadAllData\(\);\n\s*try \{ await runCalcRelinkMigration\(\)/);
  assert.match(src, /sqliteStore\.set\(CALC_RELINK_FLAG/);
  assert.match(src, /if \(await sqliteStore\.get\(CALC_RELINK_FLAG\)\) return null;/);
});
