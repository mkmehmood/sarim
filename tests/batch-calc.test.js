import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planBatch, planCorrection, unitWeight } from '../modules/batch-calc.js';
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
