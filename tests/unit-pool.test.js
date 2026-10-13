import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unitPoolKey } from '../modules/store-keys.js';

describe('unitPoolKey', () => {
  it('slots on the same formula share one pool', () => {
    const slots = { standard: 'f1', asaan: 'f1' };
    assert.equal(unitPoolKey('asaan', null, slots), 'standard');
    assert.equal(unitPoolKey('standard', null, slots), 'standard');
  });
  it('a store whose own formula equals the standard slot uses the standard pool', () => {
    assert.equal(unitPoolKey('asaan', 'f1', { standard: 'f1', asaan: 'f2' }), 'standard');
  });
  it('stale asaan formulaType with the Standard formula selected resolves to the standard pool (New Entry picker)', () => {
    const slots = { standard: 'f1', asaan: 'f-orphan' };
    const asaanStore = { key: 'asaan', formulaType: 'asaan', formulaId: 'f1' };
    assert.equal(unitPoolKey(asaanStore.formulaType, asaanStore.formulaId, slots), 'standard');
  });
  it('different formulas keep separate pools', () => {
    const slots = { standard: 'f1', asaan: 'f2' };
    assert.equal(unitPoolKey('asaan', null, slots), 'asaan');
    assert.equal(unitPoolKey('standard', null, slots), 'standard');
  });
  it('falls back to the slot when nothing is assigned', () => {
    assert.equal(unitPoolKey('asaan', null, {}), 'asaan');
    assert.equal(unitPoolKey('whatever', null, null), 'standard');
  });
});

import { planUnitPoolMigration, buildUnitPools } from '../modules/unit-pool-plan.js';

describe('planUnitPoolMigration', () => {
  const stores = [
    { key: 'zubair', formulaType: 'standard' },
    { key: 'asaan', formulaType: 'asaan' },
  ];
  const pools = buildUnitPools(stores, { standard: 'f1', asaan: 'f1' });
  it('stamps production and factory records with the shared pool key', () => {
    const production = [
      { id: 'p1', store: 'asaan', formulaStore: 'asaan', formulaUnits: 3 },
      { id: 'p2', store: 'zubair', formulaUnits: 1 },
      { id: 'p3', store: 'zubair', formulaStore: 'standard' },
    ];
    const factory = [{ id: 'f1', store: 'asaan', units: 5 }, { id: 'f2', store: 'zubair', formulaType: 'standard' }];
    const plan = planUnitPoolMigration(production, factory, pools.poolOf, 123);
    assert.deepEqual(plan.production.map(r => [r.id, r.formulaStore]), [['p1', 'standard'], ['p2', 'standard']]);
    assert.deepEqual(plan.factory.map(r => [r.id, r.formulaType]), [['f1', 'standard']]);
    assert.equal(plan.production[0].updatedAt, 123);
  });
  it('keeps separate pools when formulas differ and is idempotent', () => {
    const p = buildUnitPools(stores, { standard: 'f1', asaan: 'f2' });
    const rows = [{ id: 'p1', store: 'asaan', formulaStore: 'asaan' }];
    assert.equal(planUnitPoolMigration(rows, [], p.poolOf, 1).production.length, 0);
  });
  it('skips records with no store or stamp and tolerates non-arrays', () => {
    const plan = planUnitPoolMigration([{ id: 'x' }, null], undefined, pools.poolOf, 1);
    assert.equal(plan.production.length, 0);
    assert.equal(plan.factory.length, 0);
  });
});

import { deriveSlots } from '../modules/store-keys.js';

describe('deriveSlots (stores are the single source of truth)', () => {
  it('drops a stale slot and puts the store formula in a free slot', () => {
    const stores = [{ key: 'zubair', formulaId: 'f1' }, { key: 'asaan', formulaType: 'asaan', formulaId: 'f1' }];
    assert.deepEqual(deriveSlots(stores, { standard: 'f1', asaan: 'f-orphan' }), { standard: 'f1', asaan: null });
  });
  it('keeps existing assignments and assigns a formula missing from the slots', () => {
    const stores = [{ key: 'zubair', formulaId: 'f1' }, { key: 'asaan', formulaId: 'f2' }];
    assert.deepEqual(deriveSlots(stores, { standard: 'f1', asaan: null }), { standard: 'f1', asaan: 'f2' });
    assert.deepEqual(deriveSlots(stores, { standard: 'f2', asaan: 'f1' }), { standard: 'f2', asaan: 'f1' });
  });
  it('a store without formulaId inherits the saved slot of its type', () => {
    const stores = [{ key: 'asaan', formulaType: 'asaan' }];
    assert.deepEqual(deriveSlots(stores, { standard: 'f1', asaan: 'f2' }), { standard: null, asaan: 'f2' });
  });
  it('New Entry pool matches the Store Manager formula', () => {
    const stores = [{ key: 'zubair', formulaType: 'standard', formulaId: 'f1' }, { key: 'asaan', formulaType: 'asaan', formulaId: 'f1' }];
    const pools = buildUnitPools(stores, deriveSlots(stores, { standard: 'fx', asaan: null }));
    assert.equal(pools.poolOf('asaan'), pools.poolOf('zubair'));
  });
});
