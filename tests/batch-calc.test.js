import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SAVED_CALCS, calcsOf, defaultCalcName, planBatch, planCorrection, removeCalc, unitWeight, upsertCalc } from '../modules/batch-calc.js';
const formula = {
  id: 'f1',
  name: 'Basic',
  ingredients: [
    { id: 'chem', name: 'Chemical', quantity: 1.68 },
    { id: 'pow', name: 'Powder', quantity: 0.7 },
    { id: 'tam', name: 'Taman', quantity: 0.3 },
    { id: 'lime', name: 'Lime', quantity: 0.32 },
  ],
};
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
describe('planBatch', () => {
  it('unit weight is the sum of ingredient quantities', () => {
    near(unitWeight(formula), 3);
  });
  it('builds a full batch for a target total weight', () => {
    const p = planBatch(formula, 'total', 100);
    near(p.totalWeight, 100);
    near(p.units, 100 / 3);
    near(p.rows.reduce((s, r) => s + r.total, 0), 100);
    near(p.rows[0].total, 56);
  });
  it('builds a batch from a number of units', () => {
    const p = planBatch(formula, 'units', 10);
    near(p.totalWeight, 30);
    near(p.rows[1].total, 7);
  });
  it('builds a batch that uses up the ingredient on hand', () => {
    const p = planBatch(formula, 'ingredient', 84, 'chem');
    near(p.units, 50);
    near(p.totalWeight, 150);
    near(p.rows[0].total, 84);
  });
  it('returns an empty plan for blank or invalid input', () => {
    assert.equal(planBatch(formula, 'total', '').units, 0);
    assert.equal(planBatch(formula, 'total', -5).units, 0);
    assert.equal(planBatch({ ingredients: [] }, 'total', 10).rows.length, 0);
  });
});
const shot = {
  id: 'f2',
  name: 'Shot',
  ingredients: [
    { id: 'chem', name: 'Chemical', quantity: 1.68 },
    { id: 'bar', name: 'Barlanza', quantity: 0.212 },
    { id: 'pow', name: 'Powder', quantity: 0.704 },
    { id: 'tam', name: 'Taman', quantity: 0.303 },
    { id: 'lime', name: 'Lime', quantity: 0.101 },
  ],
};
describe('planCorrection', () => {
  it('computes the remaining batch from original minus used or lost', () => {
    const r = planCorrection(shot, { original: 89.98, used: 15 });
    assert.equal(r.ok, true);
    near(r.remaining, 74.98);
    near(r.rows.reduce((sum, x) => sum + x.present, 0), 74.98);
  });
  it('needs nothing added by default when the remainder already follows the formula', () => {
    const r = planCorrection(shot, { original: 90, used: 15 });
    assert.equal(r.addTotal, 0);
    assert.equal(r.adjusted, false);
  });
  it('scales every other ingredient when one add amount is typed', () => {
    const r = planCorrection(shot, { original: 90, used: 15, manual: { id: 'chem', add: 5 } });
    near(r.rows[0].add, 5);
    assert.equal(r.adjusted, true);
    assert.equal(r.manualId, 'chem');
    const total = r.requiredTotal;
    near(r.rows[0].target / total, 1.68 / unitWeight(shot));
    near(r.rows[2].target / total, 0.704 / unitWeight(shot));
    near(r.requiredTotal, r.remaining + r.addTotal);
  });
  it('scales every ingredient to a typed total to add', () => {
    const r = planCorrection(shot, { original: 90, used: 15, manual: { total: 30 } });
    near(r.addTotal, 30);
    near(r.requiredTotal, 105);
    assert.equal(r.adjusted, true);
    assert.equal(r.manualId, '');
    near(r.rows[0].target / r.requiredTotal, 1.68 / unitWeight(shot));
    near(r.rows.reduce((sum, x) => sum + x.present + x.add, 0), 105);
  });
  it('keeps a typed total to add at or above the minimum', () => {
    const none = planCorrection(shot, { original: 90, used: 15, manual: { total: 0 } });
    assert.equal(none.adjusted, false);
    assert.equal(none.addTotal, 0);
    const skew = planCorrection(formula, { original: 28, used: 0, actual: { chem: 16.8, pow: 5, tam: 3, lime: 3.2 }, manual: { total: 1 } });
    near(skew.minScale, 10);
    near(skew.addTotal, 2);
  });
  it('never goes below the minimum, even if a smaller add is typed', () => {
    const r = planCorrection(shot, { original: 90, used: 15, manual: { id: 'chem', add: -3 } });
    assert.equal(r.adjusted, false);
    assert.equal(r.addTotal, 0);
  });
  it('uses the actual mixed amounts to work out what to add', () => {
    const r = planCorrection(formula, {
      original: 28,
      used: 0,
      actual: { chem: 16.8, pow: 5, tam: 3, lime: 3.2 },
    });
    near(r.minScale, 10);
    near(r.rows[1].add, 2);
    near(r.rows[0].add, 0);
    near(r.requiredTotal, 30);
  });
  it('dilutes with all the others when one ingredient is in excess', () => {
    const r = planCorrection(formula, {
      original: 33.2,
      used: 0,
      actual: { chem: 16.8, pow: 7, tam: 3, lime: 6.4 },
    });
    near(r.minScale, 20);
    near(r.rows[0].add, 16.8);
    near(r.rows[3].add, 0);
  });
  it('rejects empty input and a batch with nothing left', () => {
    assert.equal(planCorrection(shot, {}).ok, false);
    assert.equal(planCorrection(shot, { original: 10, used: 10 }).error, 'nothing-left');
    assert.equal(planCorrection(shot, { original: 10, used: 12 }).error, 'nothing-left');
  });
});
describe('saved calculations', () => {
  it('reads saved calculations from a formula and ignores junk', () => {
    assert.deepEqual(calcsOf({ savedCalcs: [{ id: 'a' }, null, {}] }), [{ id: 'a' }]);
    assert.deepEqual(calcsOf({}), []);
    assert.deepEqual(calcsOf(null), []);
  });
  it('adds a new record at the top', () => {
    const r = upsertCalc([{ id: 'a' }], { id: 'b' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.list.map((c) => c.id), ['b', 'a']);
  });
  it('updates an existing record in place and keeps its created time', () => {
    const r = upsertCalc([{ id: 'a', name: 'old', createdAt: 1 }, { id: 'b' }], { id: 'a', name: 'new', createdAt: 9, updatedAt: 9 });
    assert.deepEqual(r.list.map((c) => c.id), ['a', 'b']);
    assert.equal(r.list[0].name, 'new');
    assert.equal(r.list[0].createdAt, 1);
  });
  it('refuses a new record past the limit but still allows updating', () => {
    const full = Array.from({ length: MAX_SAVED_CALCS }, (_, i) => ({ id: 'c' + i }));
    const add = upsertCalc(full, { id: 'new' });
    assert.equal(add.ok, false);
    assert.equal(add.error, 'limit');
    assert.equal(add.list.length, MAX_SAVED_CALCS);
    assert.equal(upsertCalc(full, { id: 'c3', name: 'x' }).ok, true);
  });
  it('removes a record by id', () => {
    assert.deepEqual(removeCalc([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
    assert.deepEqual(removeCalc(null, 'a'), []);
  });
  it('names a record by kind, formula and day', () => {
    const t = Date.UTC(2026, 9, 17, 12);
    assert.equal(defaultCalcName({ name: 'Std' }, 'batch', t), 'Batch · Std · 2026-10-17');
    assert.equal(defaultCalcName({ name: 'Std' }, 'fix', t), 'Correction · Std · 2026-10-17');
  });
});
