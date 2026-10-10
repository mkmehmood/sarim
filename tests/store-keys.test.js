import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyStoreName, makeStoreKey, planStoreCatalogMigration, buildLegacyKeyMap, legacyMapForCatalog,
  remapStoreKeysDeep, remapSettingsStoreKeys, remapUiStateStoreKeys, normaliseStoreCatalog,
  migrateStoreKeys, STORE_KEYS_MIGRATION_FLAG, setActiveLegacyStoreMap, setStoreCatalogCache,
  getDefaultStoreKey, storeLabelFor, formulaTypeFor, DEFAULT_STORES, DEFAULT_LEGACY_STORE_MAP,
} from '../modules/store-keys.js';
function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async set(k, v) { m.set(k, v); }, _m: m };
}
const LEGACY_CATALOG = () => [
  { key: 'STORE_A', name: 'ZUBAIR', formulaType: 'standard' },
  { key: 'STORE_B', name: 'MAHMOOD', formulaType: 'standard' },
  { key: 'STORE_C', name: 'ASAAN', formulaType: 'asaan' },
];
describe('store keys come from the store name', () => {
  it('slugifies names, keeping unicode letters', () => {
    assert.equal(slugifyStoreName('ZUBAIR'), 'zubair');
    assert.equal(slugifyStoreName('  Gul & Zubair  Traders '), 'gul_zubair_traders');
    assert.equal(slugifyStoreName('زبیر اسٹور'), 'زبیر_اسٹور');
    assert.equal(slugifyStoreName('***'), 'store');
  });
  it('is unique and never takes a formula slot name', () => {
    assert.equal(makeStoreKey('Zubair', ['zubair']), 'zubair_2');
    assert.equal(makeStoreKey('Zubair', ['zubair', 'zubair_2']), 'zubair_3');
    assert.equal(makeStoreKey('Standard', []), 'standard_store');
    assert.equal(makeStoreKey('Asaan', [], { allowReserved: true }), 'asaan');
  });
  it('the built-in stores are zubair / mahmood / asaan', () => {
    assert.deepEqual(DEFAULT_STORES.map(s => s.key), ['zubair', 'mahmood', 'asaan']);
    assert.deepEqual(DEFAULT_STORES.map(s => s.name), ['ZUBAIR', 'MAHMOOD', 'ASAAN']);
  });
});
describe('catalog migration', () => {
  it('derives keys from the real names and remembers the old code', () => {
    const plan = planStoreCatalogMigration(LEGACY_CATALOG());
    assert.deepEqual(plan.stores.map(s => s.key), ['zubair', 'mahmood', 'asaan']);
    assert.deepEqual(plan.stores.map(s => s.legacyKey), ['STORE_A', 'STORE_B', 'STORE_C']);
    assert.deepEqual(plan.map, DEFAULT_LEGACY_STORE_MAP);
  });
  it('follows renamed stores and extra stores', () => {
    const plan = planStoreCatalogMigration([
      { key: 'STORE_A', name: 'ZUBAIR TRADERS' }, { key: 'STORE_B', name: 'MAHMOOD' }, { key: 'STORE_D', name: 'MAHMOOD' },
    ]);
    assert.deepEqual(plan.map, { STORE_A: 'zubair_traders', STORE_B: 'mahmood', STORE_D: 'mahmood_2' });
  });
  it('is a no-op for an already migrated catalog and keeps the legacy map', () => {
    const migrated = planStoreCatalogMigration(LEGACY_CATALOG()).stores;
    const again = planStoreCatalogMigration(migrated);
    assert.equal(again.changed, false);
    assert.deepEqual(buildLegacyKeyMap(migrated), DEFAULT_LEGACY_STORE_MAP);
  });
  it('an empty/absent catalog still maps the default codes', () => {
    assert.deepEqual(legacyMapForCatalog(null), DEFAULT_LEGACY_STORE_MAP);
  });
});
describe('remapping', () => {
  const map = DEFAULT_LEGACY_STORE_MAP;
  it('rewrites only store-key fields, including nested ones', () => {
    const recs = [
      { id: 1, store: 'STORE_A', supplyStore: 'STORE_B', note: 'STORE_A' },
      { id: 2, returnStore: 'STORE_C', parts: [{ transferPeerStore: 'STORE_A' }] },
      { id: 3, store: 'standard' },
      { id: 4, store: 'zubair' },
    ];
    assert.equal(remapStoreKeysDeep(recs, map), 4);
    assert.equal(recs[0].store, 'zubair'); assert.equal(recs[0].supplyStore, 'mahmood'); assert.equal(recs[0].note, 'STORE_A');
    assert.equal(recs[1].returnStore, 'asaan'); assert.equal(recs[1].parts[0].transferPeerStore, 'zubair');
    assert.equal(recs[2].store, 'standard'); assert.equal(recs[3].store, 'zubair');
    assert.equal(remapStoreKeysDeep(recs, map), 0);
  });
  it('rewrites per-store price settings and remembered selections', () => {
    const st = { production: { STORE_A: { cost: 1, sale: 2 }, STORE_B: { cost: 3, sale: 4 } } };
    assert.equal(remapSettingsStoreKeys(st, map), 2);
    assert.deepEqual(st.production, { zubair: { cost: 1, sale: 2 }, mahmood: { cost: 3, sale: 4 } });
    const ui = { currentStore: 'STORE_B', currentFactoryEntryStore: 'STORE_C' };
    remapUiStateStoreKeys(ui, map);
    assert.deepEqual(ui, { currentStore: 'mahmood', currentFactoryEntryStore: 'asaan' });
  });
  it('writing a catalog from an old device converts it and refreshes the active map', () => {
    const out = normaliseStoreCatalog(LEGACY_CATALOG());
    assert.deepEqual(out.map(s => s.key), ['zubair', 'mahmood', 'asaan']);
  });
});
describe('catalog helpers', () => {
  it('default store, labels and formula types', () => {
    setStoreCatalogCache(null);
    assert.equal(getDefaultStoreKey(), 'zubair');
    assert.equal(storeLabelFor('mahmood'), 'MAHMOOD');
    assert.equal(storeLabelFor('STORE_C'), 'ASAAN');
    assert.equal(formulaTypeFor('asaan'), 'asaan');
    assert.equal(formulaTypeFor('zubair'), 'standard');
    setStoreCatalogCache([{ key: 'new_shop', name: 'NEW SHOP', formulaType: 'asaan' }]);
    assert.equal(getDefaultStoreKey(), 'new_shop');
    assert.equal(formulaTypeFor('new_shop'), 'asaan');
    setStoreCatalogCache(null);
  });
});
describe('one-time user migration', () => {
  const keys = ['production', 'sales', 'returns', 'rep_sales'];
  const seed = () => memStore({
    app_stores: LEGACY_CATALOG(),
    production: [{ id: 'p1', store: 'STORE_A' }, { id: 'p2', store: 'STORE_C' }],
    sales: [{ id: 's1', supplyStore: 'STORE_B' }],
    returns: [{ id: 'r1', returnStore: 'STORE_A' }],
    rep_sales: [],
    naswar_default_settings: { production: { STORE_A: { cost: 1, sale: 2 } } },
    ui_state: { currentStore: 'STORE_B' },
  });
  it('rewrites catalog, records, settings and ui state, then sets the flag', async () => {
    const st = seed();
    const r = await migrateStoreKeys(st, keys);
    assert.equal(r.alreadyDone, false);
    assert.deepEqual(st._m.get('app_stores').map(s => s.key), ['zubair', 'mahmood', 'asaan']);
    assert.deepEqual(st._m.get('production').map(x => x.store), ['zubair', 'asaan']);
    assert.equal(st._m.get('sales')[0].supplyStore, 'mahmood');
    assert.equal(st._m.get('returns')[0].returnStore, 'zubair');
    assert.deepEqual(Object.keys(st._m.get('naswar_default_settings').production), ['zubair']);
    assert.equal(st._m.get('ui_state').currentStore, 'mahmood');
    assert.ok(st._m.get(STORE_KEYS_MIGRATION_FLAG));
    assert.deepEqual(r.records, { production: 2, sales: 1, returns: 1 });
  });
  it('does not touch record timestamps and runs only once', async () => {
    const st = memStore({ production: [{ id: 'p', store: 'STORE_A', updatedAt: 111 }] });
    await migrateStoreKeys(st, keys);
    assert.equal(st._m.get('production')[0].updatedAt, 111);
    st._m.set('production', [{ id: 'late', store: 'STORE_A' }]);
    const again = await migrateStoreKeys(st, keys);
    assert.equal(again.alreadyDone, true);
    assert.equal(st._m.get('production')[0].store, 'STORE_A');
  });
  it('works on a device that never saved a catalog (defaults)', async () => {
    const st = memStore({ production: [{ id: 'p', store: 'STORE_B' }] });
    await migrateStoreKeys(st, keys);
    assert.equal(st._m.get('production')[0].store, 'mahmood');
    setActiveLegacyStoreMap(null);
  });
});
