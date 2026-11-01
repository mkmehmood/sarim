import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyStoreName, makeStoreKey, setStoreCatalogCache, getDefaultStoreKey, storeLabelFor, buildUnitPools, formulaIdOf,
  storeBadgeClass, DEFAULT_STORES, DEFAULT_STORE_KEYS, defaultStores,
} from '../modules/store-keys.js';
describe('store keys come from the store name', () => {
  it('slugifies names, keeping unicode letters', () => {
    assert.equal(slugifyStoreName('ZUBAIR'), 'zubair');
    assert.equal(slugifyStoreName('  Gul & Zubair  Traders '), 'gul_zubair_traders');
    assert.equal(slugifyStoreName('زبیر اسٹور'), 'زبیر_اسٹور');
    assert.equal(slugifyStoreName('***'), 'store');
  });
  it('is unique and gives a store named like a default store a numbered key', () => {
    assert.equal(makeStoreKey('Zubair', ['zubair']), 'zubair_2');
    assert.equal(makeStoreKey('Zubair', ['zubair', 'zubair_2']), 'zubair_3');
    assert.equal(makeStoreKey('Standard', []), 'standard');
    assert.equal(makeStoreKey('Asaan', DEFAULT_STORE_KEYS), 'asaan_2');
  });
  it('the three built-in stores are zubair / mahmood / asaan, ASAAN included', () => {
    assert.deepEqual(DEFAULT_STORE_KEYS, ['zubair', 'mahmood', 'asaan']);
    assert.deepEqual(DEFAULT_STORES.map(s => s.name), ['ZUBAIR', 'MAHMOOD', 'ASAAN']);
    assert.equal(defaultStores().length, 3);
  });
});
describe('catalog helpers', () => {
  it('default store and labels', () => {
    setStoreCatalogCache(null);
    assert.equal(getDefaultStoreKey(), 'zubair');
    assert.equal(storeLabelFor('mahmood'), 'MAHMOOD');
    assert.equal(storeLabelFor('unknown_key'), 'unknown_key');
    setStoreCatalogCache([{ key: 'new_shop', name: 'NEW SHOP' }]);
    assert.equal(getDefaultStoreKey(), 'new_shop');
    setStoreCatalogCache(null);
  });
});
describe('unit pools are keyed by formula id', () => {
  const stores = [{ key: 'zubair', formulaId: 'f1' }, { key: 'asaan', formulaId: 'f1' }, { key: 'gul', formulaId: 'f2' }, { key: 'bare' }];
  const { storePool, poolOf } = buildUnitPools(stores);
  it('stores on the same formula share one pool', () => {
    assert.equal(poolOf('zubair'), 'f1');
    assert.equal(poolOf('asaan'), poolOf('zubair'));
    assert.equal(poolOf('gul'), 'f2');
  });
  it('a store without a formula has no formula pool', () => {
    assert.equal(storePool.bare, undefined);
    assert.equal(formulaIdOf({ key: 'bare' }), '');
  });
  it('a pool key already on a record resolves to itself, empty to empty', () => {
    assert.equal(poolOf('f2'), 'f2');
    assert.equal(poolOf(''), '');
    assert.equal(poolOf(null), '');
  });
  it('there is no limit on how many formulas are in use', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ key: 's' + i, formulaId: 'f' + i }));
    assert.equal(new Set(many.map((s) => buildUnitPools(many).poolOf(s.key))).size, 5);
  });
});
describe('css badge classes are linked to the store name', () => {
  it('built-in stores have their own class, others cycle through custom ones', () => {
    const list = [...defaultStores(), { key: 'gul', name: 'GUL' }, { key: 'noor', name: 'NOOR' }, { key: 'sher', name: 'SHER' }];
    assert.equal(storeBadgeClass('zubair', list), 'store-zubair');
    assert.equal(storeBadgeClass('mahmood', list), 'store-mahmood');
    assert.equal(storeBadgeClass('asaan', list), 'store-asaan');
    assert.equal(storeBadgeClass('gul', list), 'store-custom-1');
    assert.equal(storeBadgeClass('noor', list), 'store-custom-2');
    assert.equal(storeBadgeClass('sher', list), 'store-custom-1');
    assert.equal(storeBadgeClass('missing', list), 'store-asaan');
  });
});
