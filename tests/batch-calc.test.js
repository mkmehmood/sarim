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
describe('planCorrection', () => {
  it('adds the missing ingredient when one is short', () => {
    const r = planCorrection(formula, [
      { id: 'chem', amount: 16.8 }, { id: 'pow', amount: 5 }, { id: 'tam', amount: 3 }, { id: 'lime', amount: 3.2 },
    ]);
    assert.equal(r.ok, true);
    near(r.scale, 10);
    near(r.rows[1].add, 2);
    near(r.rows[0].add, 0);
    near(r.finalWeight, 30);
    near(r.finalUnits, 10);
  });
  it('dilutes by adding all the others when one is in excess', () => {
    const r = planCorrection(formula, [
      { id: 'chem', amount: 16.8 }, { id: 'pow', amount: 7 }, { id: 'tam', amount: 3 }, { id: 'lime', amount: 6.4 },
    ]);
    near(r.scale, 20);
    assert.equal(r.driver, 'Lime');
    near(r.rows[0].add, 16.8);
    near(r.rows[1].add, 7);
    near(r.rows[2].add, 3);
    near(r.rows[3].add, 0);
  });
  it('scales what is present when only part of the mixture is left', () => {
    const r = planCorrection(formula, [
      { id: 'chem', amount: 16.8 }, { id: 'pow', amount: 5 }, { id: 'tam', amount: 3 }, { id: 'lime', amount: 3.2 },
    ], 14.5);
    near(r.currentWeight, 14.5);
    near(r.rows[0].present, 16.8 * 14.5 / 28);
    near(r.rows.reduce((s, x) => s + x.present + x.add, 0), r.finalWeight);
  });
  it('reports nothing to add when the mixture already matches', () => {
    const r = planCorrection(formula, [
      { id: 'chem', amount: 1.68 }, { id: 'pow', amount: 0.7 }, { id: 'tam', amount: 0.3 }, { id: 'lime', amount: 0.32 },
    ]);
    assert.equal(r.addTotal, 0);
  });
  it('rejects empty input and a remaining weight above the mixed total', () => {
    assert.equal(planCorrection(formula, []).ok, false);
    assert.equal(planCorrection(formula, [{ id: 'chem', amount: 1 }], 5).error, 'remaining-too-large');
  });
  it('flags a final weight above the vessel capacity', () => {
    const r = planCorrection(formula, [{ id: 'chem', amount: 16.8 }], 0, 20);
    assert.equal(r.exceedsCapacity, true);
  });
});
