import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedsFromFormulas, computeUnitPools } from '../modules/formula-pools.js';

describe('feedsFromFormulas / computeUnitPools', () => {
  it('feeds default cost and factor when missing', () => {
    const f = feedsFromFormulas([{ id: 'x', ingredients: [{ id: 'i', name: 'n' }] }, null, {}]);
    assert.deepEqual(f.costs, { x: 0 });
    assert.deepEqual(f.adjustment, { x: 1 });
    assert.deepEqual(f.defaults.x, [{ id: 'i', name: 'n', cost: 0, quantity: 0 }]);
  });
  it('pools are dynamic: any number of formulas, floor at zero, returns ignored', () => {
    const t = computeUnitPools(
      [{ store: 's', formulaId: 'a', units: 2, totalCost: 10, date: 'D' }, { store: 's', formulaId: 'b', units: 1 }, { store: 's', units: 9 }],
      [{ formulaId: 'a', formulaUnits: 5 }, { formulaId: 'b', formulaUnits: 1, isReturn: true }]);
    assert.deepEqual(Object.keys(t).sort(), ['a', 'b']);
    assert.equal(t.a.available, 0);
    assert.equal(t.a.consumed, 5);
    assert.equal(t.b.available, 1);
    assert.deepEqual(t.a.unitCostHistory, [{ date: 'D', costPerUnit: 5, units: 2 }]);
  });
});
