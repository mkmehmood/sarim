import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedsFromFormulas, computeUnitPools } from '../modules/formula-pool-plan.js';


describe('feedsFromFormulas / computeUnitPools', () => {
  it('feeds default cost and factor when missing', () => {
    const f = feedsFromFormulas([{ id: 'x', ingredients: [{ id: 'i', name: 'n' }] }, null, {}]);
    assert.deepEqual(f.costs, { x: 0 });
    assert.deepEqual(f.adjustment, { x: 1 });
    assert.deepEqual(f.defaults.x, [{ id: 'i', name: 'n', cost: 0, quantity: 0 }]);
  });
  it('pools are dynamic: any number of formulas, floor at zero, returns ignored', () => {
    const t = computeUnitPools(
      [{ store: 's', formulaType: 'a', units: 2, totalCost: 10, date: 'D' }, { store: 's', formulaType: 'b', units: 1 }, { store: 's', units: 9 }],
      [{ formulaStore: 'a', formulaUnits: 5 }, { formulaStore: 'b', formulaUnits: 1, isReturn: true }]);
    assert.deepEqual(Object.keys(t).sort(), ['a', 'b']);
    assert.equal(t.a.available, 0);
    assert.equal(t.a.consumed, 5);
    assert.equal(t.b.available, 1);
    assert.deepEqual(t.a.unitCostHistory, [{ date: 'D', costPerUnit: 5, units: 2 }]);
  });
});
