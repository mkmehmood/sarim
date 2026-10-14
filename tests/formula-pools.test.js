import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedsFromFormulas, computeUnitPools, usedUnitsByBatch } from '../modules/formula-pools.js';

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

describe('usedUnitsByBatch', () => {
  const b = (id, date, units, extra = {}) => ({ id, date, time: '10:00 AM', formulaId: 'f', units, ...extra });
  const used = (fac, prod) => Object.fromEntries(usedUnitsByBatch(fac, prod, 'f'));
  it('takes used units from the oldest batches first', () => {
    const fac = [b('new', '2026-03-01', 5), b('old', '2026-01-01', 11), b('mid', '2026-02-01', 4)];
    assert.deepEqual(used(fac, [{ formulaId: 'f', formulaUnits: 13 }]), { old: 11, mid: 2, new: 0 });
  });
  it('nothing is used before any production entry', () => {
    assert.deepEqual(used([b('a', '2026-01-01', 3)], []), { a: 0 });
  });
  it('ignores returns, deleted records, other formulas and empty batches', () => {
    const fac = [b('a', '2026-01-01', 3), b('x', '2026-01-02', 9, { deletedAt: 1 }), b('o', '2026-01-03', 9, { formulaId: 'g' }), b('z', '2026-01-04', 0)];
    const prod = [{ formulaId: 'f', formulaUnits: 2 }, { formulaId: 'f', formulaUnits: 7, isReturn: true }, { formulaId: 'g', formulaUnits: 5 }, { formulaId: 'f', formulaUnits: 4, deletedAt: 1 }];
    assert.deepEqual(used(fac, prod), { a: 2 });
  });
  it('more used than produced never over-allocates', () => {
    assert.deepEqual(used([b('a', '2026-01-01', 3)], [{ formulaId: 'f', formulaUnits: 50 }]), { a: 3 });
  });
});
