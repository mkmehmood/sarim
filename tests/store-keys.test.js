import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyStoreName, makeStoreKey, setStoreCatalogCache, getDefaultStoreKey, storeLabelFor, formulaTypeFor,
  storeBadgeClass, DEFAULT_STORES, DEFAULT_STORE_KEYS, defaultStores,
} from '../modules/store-keys.js';
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
    assert.equal(makeStoreKey('Asaan', []), 'asaan_store');
  });
  it('the three built-in stores are zubair / mahmood / asaan, ASAAN included', () => {
    assert.deepEqual(DEFAULT_STORE_KEYS, ['zubair', 'mahmood', 'asaan']);
    assert.deepEqual(DEFAULT_STORES.map(s => s.name), ['ZUBAIR', 'MAHMOOD', 'ASAAN']);
    assert.equal(defaultStores().length, 3);
  });
});
describe('catalog helpers', () => {
  it('default store, labels and formula types', () => {
    setStoreCatalogCache(null);
    assert.equal(getDefaultStoreKey(), 'zubair');
    assert.equal(storeLabelFor('mahmood'), 'MAHMOOD');
    assert.equal(storeLabelFor('unknown_key'), 'unknown_key');
    assert.equal(formulaTypeFor('asaan'), 'asaan');
    assert.equal(formulaTypeFor('zubair'), 'standard');
    setStoreCatalogCache([{ key: 'new_shop', name: 'NEW SHOP', formulaType: 'asaan' }]);
    assert.equal(getDefaultStoreKey(), 'new_shop');
    assert.equal(formulaTypeFor('new_shop'), 'asaan');
    setStoreCatalogCache(null);
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
