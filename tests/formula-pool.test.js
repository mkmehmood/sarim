import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planFormulaPoolMigration, legacyPoolFormulas, feedsFromFormulas, computeUnitPools } from '../modules/formula-pool-plan.js';

const ing = (id, q, c = 1) => ({ id, name: id, quantity: q, cost: c });
const mk = () => 'new-id';

describe('legacyPoolFormulas (what the old pool names meant)', () => {
  it('drops a stale assignment and puts a store formula in a free pool', () => {
    const stores = [{ key: 'zubair', formulaId: 'f1' }, { key: 'asaan', formulaType: 'asaan', formulaId: 'f1' }];
    assert.deepEqual(legacyPoolFormulas(stores, { standard: 'f1', asaan: 'f-orphan' }), { standard: 'f1', asaan: null });
  });
  it('keeps existing assignments and assigns a formula missing from them', () => {
    const stores = [{ key: 'zubair', formulaId: 'f1' }, { key: 'asaan', formulaId: 'f2' }];
    assert.deepEqual(legacyPoolFormulas(stores, { standard: 'f1', asaan: null }), { standard: 'f1', asaan: 'f2' });
    assert.deepEqual(legacyPoolFormulas(stores, { standard: 'f2', asaan: 'f1' }), { standard: 'f2', asaan: 'f1' });
  });
  it('a store without a formula inherits the saved assignment of its old type', () => {
    assert.deepEqual(legacyPoolFormulas([{ key: 'asaan', formulaType: 'asaan' }], { standard: 'f1', asaan: 'f2' }), { standard: null, asaan: 'f2' });
  });
});

describe('planFormulaPoolMigration', () => {
  const base = () => ({
    stores: [
      { key: 'zubair', name: 'Z', formulaType: 'standard', formulaId: 'f1' },
      { key: 'mahmood', name: 'M', formulaType: 'standard' },
      { key: 'asaan', name: 'A', formulaType: 'asaan', formulaId: 'f2' },
    ],
    formulas: [
      { id: 'f1', name: 'Std', additionalCost: 3, costAdjustmentFactor: 2, ingredients: [ing('a', 1, 5)] },
      { id: 'f2', name: 'Asn', ingredients: [ing('b', 2)] },
    ],
    slots: { standard: 'f1', asaan: 'f2' },
    defaults: { standard: [ing('a', 1)], asaan: [ing('b', 2)] }, costs: { standard: 3, asaan: 0 }, adjustment: { standard: 2, asaan: 1 },
    production: [
      { id: 'p1', store: 'zubair', formulaStore: 'standard', formulaUnits: 3 },
      { id: 'p2', store: 'asaan', formulaStore: 'asaan', formulaUnits: 1 },
      { id: 'p3', store: 'mahmood', formulaUnits: 2 },
    ],
    factory: [
      { id: 'k1', store: 'zubair', formulaType: 'standard', units: 5 },
      { id: 'k2', store: 'asaan', formulaType: 'asaan', units: 4 },
      { id: 'k3', store: 'mahmood', units: 1 },
    ],
  });
  it('gives every store its formula id, drops formulaType, and keeps prices', () => {
    const d = base(); d.stores[0].salePrice = 540;
    const plan = planFormulaPoolMigration(d, 7, mk);
    assert.deepEqual(plan.stores.map(s => s.formulaId), ['f1', 'f1', 'f2']);
    assert.ok(plan.stores.every(s => !('formulaType' in s)));
    assert.equal(plan.stores[0].salePrice, 540);
    assert.equal(plan.storesChanged, true);
  });
  it('rewrites record pool keys to formula ids, leaving each unit with its own formula', () => {
    const plan = planFormulaPoolMigration(base(), 7, mk);
    assert.deepEqual(plan.production.map(r => [r.id, r.formulaStore]), [['p1', 'f1'], ['p2', 'f2'], ['p3', 'f1']]);
    assert.deepEqual(plan.factory.map(r => [r.id, r.formulaType]), [['k1', 'f1'], ['k2', 'f2'], ['k3', 'f1']]);
    assert.equal(plan.production[0].updatedAt, 7);
  });
  it('unit totals add up the same before and after', () => {
    const d = base();
    const after = (plan) => {
      const prod = d.production.map(r => plan.production.find(x => x.id === r.id) || r);
      const fac = d.factory.map(r => plan.factory.find(x => x.id === r.id) || r);
      return computeUnitPools(fac, prod);
    };
    const t = after(planFormulaPoolMigration(d, 1, mk));
    assert.deepEqual([t.f1.produced, t.f1.consumed, t.f1.available], [6, 5, 1]);
    assert.deepEqual([t.f2.produced, t.f2.consumed, t.f2.available], [4, 1, 3]);
  });
  it('rebuilds cost feeds keyed by formula id from the formula store', () => {
    const { feeds } = planFormulaPoolMigration(base(), 1, mk);
    assert.deepEqual(Object.keys(feeds.defaults).sort(), ['f1', 'f2']);
    assert.equal(feeds.costs.f1, 3);
    assert.equal(feeds.adjustment.f1, 2);
    assert.equal(feeds.defaults.f1[0].cost, 5);
  });
  it('is idempotent: running it again on its own output changes nothing', () => {
    const d = base();
    const p1 = planFormulaPoolMigration(d, 1, mk);
    const d2 = { ...d, stores: p1.stores, formulas: p1.formulas, slots: null, legacy: p1.legacy,
      production: d.production.map(r => p1.production.find(x => x.id === r.id) || r),
      factory: d.factory.map(r => p1.factory.find(x => x.id === r.id) || r) };
    const p2 = planFormulaPoolMigration(d2, 2, mk);
    assert.equal(p2.storesChanged, false);
    assert.equal(p2.production.length + p2.factory.length, 0);
    assert.equal(p2.formulasChanged, false);
  });
  it('a pool that only lived in the old cost feed becomes a real formula', () => {
    const d = { ...base(), formulas: [], slots: null,
      stores: [{ key: 'zubair', formulaType: 'standard' }, { key: 'asaan', formulaType: 'asaan' }],
      defaults: { standard: [ing('a', 1, 4)], asaan: [] }, costs: { standard: 6, asaan: 0 }, adjustment: { standard: 1.5, asaan: 1 } };
    const plan = planFormulaPoolMigration(d, 9, mk);
    assert.equal(plan.formulas.length, 1);
    assert.deepEqual([plan.formulas[0].id, plan.formulas[0].name, plan.formulas[0].additionalCost, plan.formulas[0].costAdjustmentFactor], ['new-id', 'Standard', 6, 1.5]);
    assert.equal(plan.formulasChanged, true);
    assert.equal(plan.stores[0].formulaId, 'new-id');
    assert.equal(plan.stores[1].formulaId, undefined);
    assert.equal(plan.production.find(r => r.id === 'p1').formulaStore, 'new-id');
  });
  it('a stale feed with no store using it creates nothing', () => {
    const d = { ...base(), formulas: [], slots: null, stores: [{ key: 'zubair', formulaType: 'asaan' }], defaults: { standard: [ing('a', 1)], asaan: [] } };
    assert.equal(planFormulaPoolMigration(d, 1, mk).formulas.length, 0);
  });
  it('the ASAAN store key is not mistaken for the old asaan pool when its formula differs', () => {
    const d = base();
    d.stores[2] = { key: 'asaan', formulaType: 'standard', formulaId: 'f2' };
    d.production = [{ id: 'x', store: 'zubair', formulaStore: 'asaan', formulaUnits: 1 }];
    assert.equal(planFormulaPoolMigration(d, 1, mk).production[0].formulaStore, 'f2');
  });
  it('tolerates empty and malformed data', () => {
    const plan = planFormulaPoolMigration({ production: [null, { id: 'x' }], stores: undefined }, 1, mk);
    assert.equal(plan.production.length, 0);
    assert.equal(plan.factory.length, 0);
    assert.deepEqual(plan.feeds, { defaults: {}, costs: {}, adjustment: {} });
  });
});

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
