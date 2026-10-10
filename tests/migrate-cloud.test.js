import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  planCatalog, makeResolver, fixStoreFields, fixSettingsStores, migrateCloud, convertBackup, decodeValue, encodeValue, decodeFields, encodeFields,
  encryptBackup, decryptBackup, createRestClient, signIn, DATASETS, DATA_KEY_VERSION, SUPPORT_DOCS, SUPPORT_COLLECTIONS,
} from '../tools/migrate-cloud.mjs';
import { RECORD_KEYS, DATA_KEY_VERSION as APP_VERSION, FIRESTORE_SUPPORT_PATHS, SUPPORT_STORES } from '../modules/data-keys.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
function memClient(seed) {
  const docs = new Map(Object.entries(seed).map(([p, d]) => [p, clone(d)]));
  const log = { commits: 0, ops: [] };
  return {
    docs, log,
    async list(col) { return [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) })); },
    async get(path) { return docs.has(path) ? { id: path.split('/').pop(), data: clone(docs.get(path)) } : null; },
    async commit(ops) {
      log.commits++;
      for (const o of ops) {
        log.ops.push(o);
        if (o.op === 'delete') { docs.delete(o.path); continue; }
        const next = o.op === 'update' ? { ...(docs.get(o.path) || {}), ...clone(o.data) } : clone(o.data);
        for (const f of o.removeFields || []) delete next[f];
        for (const f of o.serverTime || []) next[f] = { __timestamp: new Date(Date.now() + 5000).toISOString() };
        docs.set(o.path, next);
      }
    },
  };
}
const LEGACY_CAT = (extra = []) => ({ 'appStores/stores': { stores: [
  { key: 'STORE_A', name: 'ZUBAIR', formulaType: 'standard' }, { key: 'STORE_B', name: 'MAHMOOD', formulaType: 'standard' },
  { key: 'STORE_C', name: 'ASAAN', formulaType: 'standard' }, ...extra ], stores_timestamp: 1 } });

describe('the three built-in stores, ASAAN included, are the default keys', () => {
  it('maps STORE_A/B/C to zubair/mahmood/asaan whatever the saved formula type says', () => {
    const p = planCatalog(LEGACY_CAT()['appStores/stores'].stores);
    assert.deepEqual(p.stores.map(s => s.key), ['zubair', 'mahmood', 'asaan']);
    assert.deepEqual(p.map, { STORE_A: 'zubair', STORE_B: 'mahmood', STORE_C: 'asaan' });
  });
  it('a catalog holding both the old and the new copy of each store ends with three stores, not six', () => {
    const p = planCatalog([
      { key: 'STORE_A', name: 'ZUBAIR', salePrice: 120, formulaId: 'f1' }, { key: 'STORE_B', name: 'MAHMOOD' }, { key: 'STORE_C', name: 'ASAAN', salePrice: 90 },
      { key: 'zubair', name: 'ZUBAIR' }, { key: 'mahmood', name: 'MAHMOOD' }, { key: 'asaan', name: 'ASAAN', formulaType: 'asaan' },
    ]);
    assert.deepEqual(p.stores.map(s => s.key).sort(), ['asaan', 'mahmood', 'zubair']);
    assert.equal(p.merged, 3);
    const z = p.stores.find(s => s.key === 'zubair');
    assert.equal(z.salePrice, 120); assert.equal(z.formulaId, 'f1');
    assert.equal(p.stores.find(s => s.key === 'asaan').salePrice, 90);
  });
  it('keeps the built-in keys even if a store was renamed; extra stores get a key from their name', () => {
    const p = planCatalog([{ key: 'STORE_A', name: 'ZUBAIR TRADERS' }, { key: 'STORE_D', name: 'Gul Traders' }, { key: 'STORE_E', name: 'Gul Traders' }]);
    assert.deepEqual(p.map, { STORE_A: 'zubair', STORE_D: 'gul_traders', STORE_E: 'gul_traders_2' });
  });
  it('is a no-op on a catalog that is already current', () => {
    const p = planCatalog([{ key: 'zubair', name: 'ZUBAIR' }, { key: 'asaan', name: 'ASAAN' }]);
    assert.equal(p.changed, false);
  });
});
describe('fixing store mismatches', () => {
  const resolve = makeResolver([{ key: 'zubair', name: 'ZUBAIR' }, { key: 'mahmood', name: 'MAHMOOD' }, { key: 'asaan', name: 'ASAAN' }], {});
  it('understands old codes, names and spellings, leaves slot values and unknowns alone', () => {
    const recs = [
      { store: 'STORE_A' }, { supplyStore: 'Mahmood' }, { returnStore: 'store-c' }, { store: 'ZUBAIR' }, { store: 'standard' }, { store: 'asaan' },
      { transferPeerStore: 'STORE_Q' }, { parts: [{ store: 'STORE_B' }] }, { note: 'STORE_A' },
    ];
    const r = fixStoreFields(recs, resolve);
    assert.deepEqual(recs.map(x => x.store || x.supplyStore || x.returnStore || x.transferPeerStore || (x.parts && x.parts[0].store) || x.note),
      ['zubair', 'mahmood', 'asaan', 'zubair', 'standard', 'asaan', 'STORE_Q', 'mahmood', 'STORE_A']);
    assert.deepEqual(r.unknown, ['STORE_Q']); assert.equal(r.fixed, 5);
  });
  it('re-keys per-store prices', () => {
    const s = { production: { STORE_A: { cost: 1 }, mahmood: { cost: 2 } } };
    assert.equal(fixSettingsStores(s, resolve), 1);
    assert.deepEqual(s.production, { mahmood: { cost: 2 }, zubair: { cost: 1 } });
  });
});
describe('cloud migration', () => {
  const seed = () => ({
    ...LEGACY_CAT(),
    'production/p1': { id: 'p1', store: 'STORE_A', qty: 5 },
    'production/p2': { id: 'p2', store: 'zubair', qty: 1 },
    'sales/s1': { id: 's1', supplyStore: 'STORE_B' },
    'calculator_history/c1': { id: 'c1', total: 9 },
    'rep_sales/r1': { id: 'r1', supplyStore: 'STORE_C', isMerged: true },
    'rep_customers/rc1': { id: 'rc1', name: 'A' },
    'sales_customers/sc1': { id: 'sc1', name: 'B' },
    'factory_history/f1': { id: 'f1', store: 'asaan', qty: 3 },
    'returns/x1': { id: 'x1', returnStore: 'STORE_A' },
    'settings/config': { naswar_default_settings: { production: { STORE_A: { cost: 1, sale: 2 } }, fyCloseCount: 1 }, naswar_default_settings_timestamp: 77, repProfile: 'admin' },
    'deletions/d1': { id: 'd1', collection: 'calculator_history', snapshot: { store: 'STORE_B' } },
    'deletions/d2': { id: 'd2', collection: 'sales', snapshot: { supplyStore: 'zubair' } },
  });
  it('a dry run reads everything and writes nothing', async () => {
    const c = memClient(seed());
    const r = await migrateCloud(c, { apply: false });
    assert.equal(c.log.commits, 0);
    assert.ok(r.writes > 0);
    assert.deepEqual([...c.docs.keys()].sort(), Object.keys(seed()).sort());
  });
  it('moves collections to their single-word names and re-keys stores', async () => {
    const c = memClient(seed());
    const r = await migrateCloud(c, { apply: true });
    assert.equal(c.docs.get('calculator/c1').total, 9);
    assert.equal(c.docs.get('rep/r1').supplyStore, 'asaan');
    assert.ok(c.docs.has('clients/rc1') && c.docs.has('customers/sc1') && c.docs.has('factory/f1'));
    assert.equal(c.docs.get('production/p1').store, 'zubair');
    assert.equal(c.docs.get('sales/s1').supplyStore, 'mahmood');
    assert.equal(c.docs.get('returns/x1').returnStore, 'zubair');
    assert.equal(c.docs.get('factory/f1').store, 'asaan');
    assert.deepEqual(c.docs.get('app_stores/stores').stores.map(s => s.key), ['zubair', 'mahmood', 'asaan']);
    assert.equal(r.datasets.production.upToDate, 1);
  });
  it('stamps rewritten records with a server updatedAt (but not merged ones) so delta sync sees them', async () => {
    const c = memClient(seed());
    await migrateCloud(c, { apply: true });
    assert.ok(c.docs.get('production/p1').updatedAt.__timestamp);
    assert.equal(c.docs.get('production/p2').updatedAt, undefined);
    assert.equal(c.docs.get('rep/r1').updatedAt, undefined);
  });
  it('renames the settings fields and recycle-bin entries', async () => {
    const c = memClient(seed());
    await migrateCloud(c, { apply: true });
    const s = c.docs.get('settings/config');
    assert.deepEqual(s.settings.production, { zubair: { cost: 1, sale: 2 } });
    assert.equal(s.settings_timestamp, 77); assert.equal(s.repProfile, 'admin');
    assert.ok(!('naswar_default_settings' in s) && !('naswar_default_settings_timestamp' in s));
    assert.equal(c.docs.get('deletions/d1').collection, 'calculator');
    assert.equal(c.docs.get('deletions/d1').snapshot.store, 'mahmood');
  });
  it('is idempotent: a second run writes nothing', async () => {
    const c = memClient(seed());
    await migrateCloud(c, { apply: true });
    const again = await migrateCloud(c, { apply: true });
    assert.equal(again.writes, 0);
  });
  it('keeps the old collections unless --delete-old, and only deletes after verifying the copy', async () => {
    const keep = memClient(seed());
    await migrateCloud(keep, { apply: true });
    assert.ok(keep.docs.has('calculator_history/c1'));
    const del = memClient(seed());
    const r = await migrateCloud(del, { apply: true, deleteOld: true });
    assert.ok(!del.docs.has('calculator_history/c1') && !del.docs.has('rep_sales/r1'));
    assert.ok(del.docs.has('calculator/c1') && del.docs.has('rep/r1'));
    assert.equal(r.deleted, 5);
    // a copy that is somehow missing blocks the delete
    const bad = memClient(seed());
    const realCommit = bad.commit.bind(bad);
    bad.commit = async (ops) => realCommit(ops.filter(o => !(o.path || '').startsWith('calculator/')));
    const rb = await migrateCloud(bad, { apply: true, deleteOld: true });
    assert.ok(bad.docs.has('calculator_history/c1'));
    assert.ok(rb.warnings.some(w => w.includes('calculator_history')));
  });
  it('never overwrites a newer document already present under the new name', async () => {
    const s = seed();
    s['calculator/c1'] = { id: 'c1', total: 100, updatedAt: { __timestamp: '2099-01-01T00:00:00.000Z' } };
    s['calculator_history/c1'] = { id: 'c1', total: 9, updatedAt: { __timestamp: '2020-01-01T00:00:00.000Z' } };
    const c = memClient(s);
    const r = await migrateCloud(c, { apply: true });
    assert.equal(c.docs.get('calculator/c1').total, 100);
    assert.equal(r.datasets.calculator.skippedNewer, 1);
  });
  it('reports records that point at a store that does not exist', async () => {
    const s = seed(); s['production/p9'] = { id: 'p9', store: 'STORE_Q' };
    const r = await migrateCloud(memClient(s), { apply: false });
    assert.equal(r.unknown['production: STORE_Q'], 1);
  });
  it('works for an account that never saved a store list', async () => {
    const s = seed(); delete s['appStores/stores'];
    const c = memClient(s);
    await migrateCloud(c, { apply: true });
    assert.equal(c.docs.get('production/p1').store, 'zubair');
    assert.ok(!c.docs.has('app_stores/stores'));
  });
  it('covers every dataset the app knows, under the names the app uses', () => {
    assert.deepEqual(DATASETS.map(([, n]) => n), RECORD_KEYS);
    assert.equal(DATA_KEY_VERSION, APP_VERSION);
  });
});
describe('version 4: support collections and documents', () => {
  const seed4 = () => ({
    'appStores/stores': { stores: [{ key: 'STORE_A', name: 'ZUBAIR' }], stores_timestamp: 5 },
    'factorySettings/config': { formula_store: [{ id: 'f' }], formula_store_timestamp: 9 },
    'expenseCategories/categories': { categories: ['Fuel'], categories_timestamp: 3 },
    'activityLog/a1': { action: 'x' }, 'personPhotos/k1': { data: 'AAA' },
    'deletions/d1': { id: 'd1', collection: 'personPhotos' },
  });
  it('moves every support document and collection to its snake_case name', async () => {
    const c = memClient(seed4());
    const r = await migrateCloud(c, { apply: true });
    assert.deepEqual(c.docs.get('app_stores/stores').stores.map(s => s.key), ['zubair']);
    assert.equal(c.docs.get('app_stores/stores').stores_timestamp > 5, true);
    assert.deepEqual(c.docs.get('factory_settings/config').formula_store, [{ id: 'f' }]);
    assert.deepEqual(c.docs.get('expense_categories/categories').categories, ['Fuel']);
    assert.equal(c.docs.get('activity_log/a1').action, 'x');
    assert.equal(c.docs.get('photos/k1').data, 'AAA');
    assert.ok(c.docs.get('photos/k1').updatedAt, 'photos get a server updatedAt for delta sync');
    assert.equal(c.docs.get('deletions/d1').collection, 'photos');
    assert.ok(r.support.some(x => x.from === 'personPhotos' && x.written === 1));
  });
  it('keeps the old copies by default, removes them only with deleteOld after verifying', async () => {
    const keep = memClient(seed4()); await migrateCloud(keep, { apply: true });
    assert.ok(keep.docs.has('appStores/stores') && keep.docs.has('personPhotos/k1'));
    const del = memClient(seed4()); const r = await migrateCloud(del, { apply: true, deleteOld: true });
    for (const k of ['appStores/stores', 'factorySettings/config', 'expenseCategories/categories', 'activityLog/a1', 'personPhotos/k1']) assert.ok(!del.docs.has(k), k);
    assert.equal(r.supportDeleted, 5);
  });
  it('is idempotent and never overwrites a copy that already exists', async () => {
    const s = seed4(); s['factory_settings/config'] = { formula_store: [{ id: 'newer' }], formula_store_timestamp: 99 };
    const c = memClient(s);
    await migrateCloud(c, { apply: true });
    assert.deepEqual(c.docs.get('factory_settings/config').formula_store, [{ id: 'newer' }]);
    assert.equal((await migrateCloud(c, { apply: true })).writes, 0);
  });
  it('the paths the tool writes are exactly the ones the app uses', () => {
    assert.deepEqual(SUPPORT_DOCS.map(([, n]) => n), [FIRESTORE_SUPPORT_PATHS.appStores, FIRESTORE_SUPPORT_PATHS.factorySettings, FIRESTORE_SUPPORT_PATHS.expenseCategories]);
    assert.deepEqual(SUPPORT_COLLECTIONS.map(([, n]) => n), [FIRESTORE_SUPPORT_PATHS.activityLog, SUPPORT_STORES.photos.collection]);
  });
  it('converts a version-3 backup: renames the support fields and re-stamps it as version 4', () => {
    const { data, changed } = convertBackup({ dataKeyVersion: 3, production: [], person_photos: { a: 1 }, person_photos_timestamps: { a: 2 }, deleted_records: ['x'], deletion_records: [{ id: 'x' }] });
    assert.ok(changed);
    assert.deepEqual([data.photos, data.photos_timestamps, data.deletion_ids, data.deletions], [{ a: 1 }, { a: 2 }, ['x'], [{ id: 'x' }]]);
    for (const k of ['person_photos', 'person_photos_timestamps', 'deleted_records', 'deletion_records']) assert.ok(!(k in data), k);
    assert.equal(data.dataKeyVersion, 4);
  });
});
describe('backup conversion', () => {
  it('turns a pre-rename backup into the current format ("sales" was the calculator history)', () => {
    const { data, changed } = convertBackup({
      mfg: [{ id: 1, store: 'STORE_A' }], sales: [{ id: 2 }], customerSales: [{ id: 3, supplyStore: 'STORE_B' }], repSales: [{ id: 4 }], repCustomers: [5], salesCustomers: [6],
      paymentTransactions: [7], paymentEntities: [8], factoryInventoryData: [9], factoryProductionHistory: [{ id: 10, store: 'standard' }], stockReturns: [11], expenses: [12],
      appStores: [{ key: 'STORE_A', name: 'ZUBAIR' }, { key: 'STORE_B', name: 'MAHMOOD' }, { key: 'STORE_C', name: 'ASAAN' }], expenseCategories: ['Fuel'], settings: { production: { STORE_A: { cost: 1 } } },
    });
    assert.equal(changed, true);
    assert.deepEqual(RECORD_KEYS.map(k => Array.isArray(data[k]) ? data[k].map(x => x.id ?? x) : data[k]), [[1], [3], [2], [4], [5], [6], [7], [8], [9], [10], [12], [11]]);
    assert.equal(data.production[0].store, 'zubair'); assert.equal(data.sales[0].supplyStore, 'mahmood'); assert.equal(data.factory[0].store, 'standard');
    assert.equal(data.app_stores[0].key, 'zubair'); assert.deepEqual(data.expense_categories, ['Fuel']);
    assert.deepEqual(Object.keys(data.settings.production), ['zubair']);
    assert.equal(data.dataKeyVersion, DATA_KEY_VERSION);
    for (const old of ['mfg', 'customerSales', 'repSales', 'appStores', 'expenseCategories']) assert.ok(!(old in data), old);
  });
  it('a backup stamped by an earlier dev build keeps "sales" as customer sales', () => {
    const { data } = convertBackup({ dataKeyVersion: 2, production: [1], sales: [2], calculator_history: [3], rep_sales: [4], factory_history: [5] });
    assert.deepEqual([data.production, data.sales, data.calculator, data.rep, data.factory], [[1], [2], [3], [4], [5]]);
  });
  it('leaves a current backup alone', () => {
    assert.equal(convertBackup({ dataKeyVersion: DATA_KEY_VERSION, sales: [1] }).changed, false);
  });
  it('the converted file passes the app\'s own version check', async () => {
    const { isCurrentBackup } = await import('../modules/data-keys.js');
    assert.equal(isCurrentBackup(convertBackup({ mfg: [] }).data), true);
  });
});
describe('encrypted backups use the same container as the app', () => {
  it('round-trips, rejects a wrong password and a different account', async () => {
    const blob = await encryptBackup({ a: 1 }, 'U@x.com', 'pw', 'uid1');
    assert.deepEqual(await decryptBackup(blob, 'U@x.com', 'pw', 'uid1'), { a: 1 });
    await assert.rejects(decryptBackup(blob, 'U@x.com', 'nope', 'uid1'), /Wrong email or password/);
    await assert.rejects(decryptBackup(blob, 'U@x.com', 'pw', 'uid2'), /different account/);
  });
  it('is byte-compatible with the app\'s CryptoEngine in both directions', async () => {
    const src = readFileSync(new URL('../modules/business.js', import.meta.url), 'utf8');
    const a = src.indexOf('export const CryptoEngine = (() => {'); const b = src.indexOf('})();', a) + 5;
    const ctx = { crypto, TextEncoder, TextDecoder, Blob, Uint8Array, JSON, Array, Promise, Error, Math, currentUser: null };
    vm.createContext(ctx);
    vm.runInContext(src.slice(a, b).replace('export const CryptoEngine =', 'var CryptoEngine ='), ctx);
    const appBlob = await ctx.CryptoEngine.encrypt({ hello: 'world' }, 'U@x.com', 'pw', 'uid1');
    assert.deepEqual(await decryptBackup(await appBlob.arrayBuffer(), 'U@x.com', 'pw', 'uid1'), { hello: 'world' });
    const toolBytes = await encryptBackup({ back: 'again' }, 'U@x.com', 'pw', 'uid1');
    assert.deepEqual(await ctx.CryptoEngine.decrypt(toolBytes.buffer.slice(toolBytes.byteOffset, toolBytes.byteOffset + toolBytes.byteLength), 'U@x.com', 'pw', 'uid1'), { back: 'again' });
  });
});
describe('Firestore REST codec and client', () => {
  it('round-trips every value type', () => {
    const o = { s: 'x', i: 5, f: 1.5, b: true, n: null, a: [1, 'two', { k: 3 }], m: { deep: { v: 1 } }, t: { __timestamp: '2024-01-02T03:04:05.000Z' } };
    assert.deepEqual(decodeFields(encodeFields(o)), o);
    assert.deepEqual(decodeValue({ integerValue: '42' }), 42);
    assert.deepEqual(encodeValue(2), { integerValue: '2' });
  });
  it('lists with paging, and commits with masks, server times and deletes', async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init });
      const mk = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
      if (url.includes('pageSize') && !url.includes('pageToken')) return mk({ documents: [{ name: 'projects/p/databases/(default)/documents/users/U/sales/a', fields: { n: { integerValue: '1' } } }], nextPageToken: 'T' });
      if (url.includes('pageToken=T')) return mk({ documents: [{ name: 'projects/p/databases/(default)/documents/users/U/sales/b', fields: {} }] });
      return mk({});
    };
    const c = createRestClient({ idToken: 'tok', uid: 'U', projectId: 'p', fetchImpl });
    assert.deepEqual((await c.list('sales')).map(d => d.id), ['a', 'b']);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
    await c.commit([
      { op: 'set', path: 'production/p1', data: { x: 1 }, serverTime: ['updatedAt'] },
      { op: 'update', path: 'settings/config', data: { settings: {} }, removeFields: ['naswar_default_settings'] },
      { op: 'delete', path: 'old/z' },
    ]);
    const body = JSON.parse(calls.at(-1).init.body);
    assert.ok(calls.at(-1).url.endsWith('/documents:commit'));
    assert.deepEqual(body.writes[0].updateTransforms, [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]);
    assert.equal(body.writes[0].updateMask, undefined);
    assert.deepEqual(body.writes[1].updateMask.fieldPaths, ['settings', 'naswar_default_settings']);
    assert.equal(body.writes[2].delete, 'projects/p/databases/(default)/documents/users/U/old/z');
  });
  it('explains a failed sign-in', async () => {
    const fetchImpl = async () => ({ ok: false, json: async () => ({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }) });
    await assert.rejects(signIn({ email: 'a@b.c', password: 'x', fetchImpl }), /Sign-in failed.*Google/);
  });
});
describe('tools/migrate.html is a self-contained copy of the migration code', () => {
  it('has no external script/module imports and matches tools/migrate-cloud.mjs', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../tools/migrate.html', import.meta.url), 'utf8');
    const mjs = readFileSync(new URL('../tools/migrate-cloud.mjs', import.meta.url), 'utf8');
    assert.ok(!/from\s+'\.\/migrate-cloud\.mjs'/.test(html), 'must not import a sibling file (breaks on file:// and phones)');
    assert.ok(!/<script[^>]+src=/.test(html), 'no external scripts');
    const lib = mjs.slice(0, mjs.indexOf('// ---------------------------------------------------------------- command line')).replace(/^#!.*\n/, '');
    assert.ok(html.includes(lib.trim().slice(200, 1200)) && html.includes('export async function migrateCloud'), 'run: npm run migrate:html');
    assert.ok(!/node:(fs|readline|url)/.test(html), 'no Node-only imports');
  });
});
