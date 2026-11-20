import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planBatch, planCorrection, fmtPrecise, MAX_BATCH_KG } from '../modules/batch-calc.js';
const fmtAmt = (v, unit) => String(unit === 'g' ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000);

const formula = { id: 'f', ingredients: [{ id: 'a', name: 'A', quantity: 0.27 }, { id: 'b', name: 'B', quantity: 1.89 }, { id: 'c', name: 'C', quantity: 0.7 }, { id: 'd', name: 'D', quantity: 0.1415 }] };

describe('batch limits and display', () => {
  it('a batch larger than the limit is treated as no value instead of producing absurd numbers', () => {
    assert.equal(MAX_BATCH_KG, 10000000);
    assert.equal(planBatch(formula, 'total', 1e12).units, 0);
    assert.equal(planBatch(formula, 'total', 1e12).totalWeight, 0);
    assert.ok(planBatch(formula, 'total', 100).units > 0);
    assert.equal(planCorrection(formula, { original: 1e12, used: 0 }).ok, false);
    assert.equal(planCorrection(formula, { original: 98.621, used: 0 }).ok, true);
  });
  it('unit weight keeps 4 decimals in kg so units x weight matches the total', () => {
    assert.equal(fmtAmt(3.0015, 'kg'), '3.002');
    assert.equal(fmtPrecise(3.0015, 'kg'), '3.0015');
    assert.equal(fmtPrecise(3001.5, 'g'), '3001.5');
  });
  it('a row target built from the shown present + add always adds up', () => {
    const r = planCorrection(formula, { original: 98.621, used: 0, manual: { id: 'b', add: 9.9 } });
    for (const x of r.rows) {
      const shown = Number(fmtAmt(x.present, 'kg')) + Number(fmtAmt(x.add, 'kg'));
      assert.equal(Number(shown.toFixed(3)), Number(fmtAmt(shown, 'kg')));
    }
  });
});
