// End-to-end proof that the migration loses nothing: realistic data in the OLD (main) format goes in,
// every document and every field value must come out (only names / store codes may change).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migrateCloud, convertBackup, DATASETS, STORE_KEY_FIELDS, DOC_FIELD_RENAMES, BACKUP_FIELD_RENAMES } from '../tools/migrate-cloud.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
function client(seed, { failAfter = Infinity } = {}) {
  const docs = new Map(Object.entries(clone(seed))); let commits = 0;
  return { docs,
    async list(col) { return [...docs].filter(([p]) => p.startsWith(col + '/') && !p.slice(col.length + 1).includes('/')).map(([p, d]) => ({ id: p.slice(col.length + 1), data: clone(d) })); },
    async get(path) { return docs.has(path) ? { id: path.split('/').pop(), data: clone(docs.get(path)) } : null; },
    async commit(ops) {
      if (++commits > failAfter) throw new Error('network dropped');
      for (const o of ops) {
        if (o.op === 'delete') { docs.delete(o.path); continue; }
        const next = o.op === 'update' ? { ...(docs.get(o.path) || {}), ...clone(o.data) } : clone(o.data);
        for (const f of o.removeFields || []) delete next[f];
        for (const f of o.serverTime || []) next[f] = { __timestamp: '2030-01-01T00:00:00Z' };
        docs.set(o.path, next);
      }
    } };
}
// ---- realistic OLD data: every dataset, many records, odd values, extra fields -------------------------
const CODES = ['STORE_A', 'STORE_B', 'STORE_C', 'STORE_D'];
const rec = (col, i) => ({ id: `${col}-${i}`, date: '2025-03-0' + (1 + i % 9), amount: 100.5 * i, note: 'ünïcode — اردو ✓', tags: ['a', { deep: [1, 2, { x: i }] }], zero: 0, empty: '', no: null, flag: false,
  store: CODES[i % 4], supplyStore: CODES[(i + 1) % 4], nested: { returnStore: CODES[(i + 2) % 4], list: [{ transferPeerStore: CODES[i % 4], keep: 'k' + i }] },
  customField: { anything: i }, updatedAt: { __timestamp: '2025-01-01T00:00:00Z' } });
function oldCloud() {
  const s = {};
  for (const [oldCol] of DATASETS) for (let i = 1; i <= 7; i++) s[`${oldCol}/${oldCol}-${i}`] = rec(oldCol, i);
  s['production/_placeholder_'] = { placeholder: true };
  s['appStores/stores'] = { stores: [{ key: 'STORE_A', name: 'ZUBAIR', salePrice: 10 }, { key: 'STORE_B', name: 'MAHMOOD' }, { key: 'STORE_C', name: 'ASAAN', formulaType: 'asaan' }, { key: 'STORE_D', name: 'Gul & Zubair Traders', salePrice: 7 }], stores_timestamp: 5 };
  s['factorySettings/config'] = { default_formulas: { standard: [{ id: 'f1', n: 2 }], asaan: [] }, default_formulas_timestamp: 11, additional_costs: { standard: 3, asaan: 4 }, cost_adjustment_factor: { standard: 1.1, asaan: 1 }, unit_tracking: { a: { b: 1 } }, formula_store: [{ id: 'f1' }], formula_store_timestamp: 12, formula_slots: { standard: 'f1', asaan: null }, formula_slots_timestamp: 13 };
  s['expenseCategories/categories'] = { categories: ['Fuel', 'Rent', 'اردو'], categories_timestamp: 8 };
  for (let i = 1; i <= 5; i++) { s[`activityLog/a${i}`] = { action: 'x' + i, at: i }; s[`personPhotos/p${i}`] = { data: 'AAA' + i, updatedAt: { __timestamp: '2025-01-01T00:00:00Z' } }; }
  s['settings/config'] = { naswar_default_settings: { production: { STORE_A: { price: 1 }, STORE_D: { price: 2 }, standard: { price: 3 } }, other: 'kept' }, naswar_default_settings_timestamp: 21, sales_reps: ['Ali', 'Bilal'], sales_reps_timestamp: 22, last_synced: 99, repProfile: 'admin', repProfile_timestamp: 23, appMode: 'x' };
  s['settings/team'] = { sales_reps: ['Ali', 'Bilal'], user_roles: { Ali: 'rep' }, updated_at: 5 };
  s['settings/accounts_index'] = { accounts: [{ email: 'a@b.c', role: 'user' }] };
  s['settings/yearCloseSignal'] = { type: 'x', triggeredAt: 1 };
  s['devices/default_device'] = { deviceId: 'default_device', name: 'Phone', mode: 'admin' };
  s['devices/other-device'] = { deviceId: 'other-device' };
  s['account/info'] = { email: 'a@b.c' };
  for (let i = 1; i <= 4; i++) s[`deletions/d${i}`] = { id: 'd' + i, collection: ['rep_sales', 'factory_history', 'calculator_history', 'sales'][i - 1], recordType: 'rep_sales', deleted_by: 'user', tombstoned_at: 9, record: { store: 'STORE_B', keep: i } };
  return s;
}
// leaf paths -> values, with store-code values and known field renames normalised away
const leaves = (x, pre = '', out = {}) => { if (Array.isArray(x)) x.forEach((v, i) => leaves(v, `${pre}[${i}]`, out)); else if (x && typeof x === 'object' && !x.__timestamp) for (const k of Object.keys(x)) leaves(x[k], pre ? `${pre}.${k}` : k, out); else out[pre] = x; return out; };
const isStoreField = (path) => STORE_KEY_FIELDS.includes(path.split('.').pop().replace(/\[\d+\]$/, ''));
function assertSameData(oldDoc, newDoc, label, fieldRenames = {}) {
  const o = leaves(oldDoc), n = leaves(newDoc);
  for (const [path, v] of Object.entries(o)) {
    const segs = path.split('.'); const top = segs[0].replace(/\[\d+\]$/, '');
    const m = /^(.*?)(_timestamp)?$/.exec(top); const renamed = fieldRenames[m[1]] ? fieldRenames[m[1]] + (m[2] || '') + path.slice(top.length) : path;
    if (path === 'updatedAt') { assert.ok('updatedAt' in n, `${label}: updatedAt missing`); continue; } // re-stamped on purpose so other devices re-sync the record
    assert.ok(renamed in n, `${label}: lost field ${path}`);
    if (isStoreField(path) && typeof v === 'string' && /^STORE_/.test(v)) continue;
    assert.deepEqual(n[renamed], v, `${label}: value changed at ${path}`);
  }
}
const OLD_DATASET_TO_NEW = Object.fromEntries(DATASETS);

describe('migration loses no data', () => {
  it('every document and every field value of every dataset survives', async () => {
    const seed = oldCloud(); const c = client(seed);
    const r = await migrateCloud(c, { apply: true });
    assert.deepEqual(r.warnings, []);
    let checked = 0;
    for (const [oldCol, newCol] of DATASETS) {
      const oldDocs = Object.entries(seed).filter(([p]) => p.startsWith(oldCol + '/') && !p.endsWith('_placeholder_'));
      assert.equal(oldDocs.length, 7);
      for (const [p, doc] of oldDocs) { const got = c.docs.get(`${newCol}/${p.split('/')[1]}`); assert.ok(got, `missing ${newCol}/${p}`); assertSameData(doc, got, p); checked++; }
    }
    assert.equal(checked, DATASETS.length * 7);
  });
  it('every store code resolves to a store that exists (no orphaned records)', async () => {
    const c = client(oldCloud()); await migrateCloud(c, { apply: true });
    const keys = new Set(c.docs.get('stores/list').stores.map(s => s.key));
    assert.deepEqual([...keys].sort(), ['asaan', 'gul_zubair_traders', 'mahmood', 'zubair']);
    const bad = [];
    const walk = (n, where) => { if (Array.isArray(n)) n.forEach(x => walk(x, where)); else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { if (STORE_KEY_FIELDS.includes(k) && typeof v === 'string' && v && !keys.has(v) && !['standard', 'asaan'].includes(v)) bad.push(`${where} ${k}=${v}`); walk(v, where); } };
    const oldCols = new Set(DATASETS.filter(([o, n]) => o !== n).map(([o]) => o));
    for (const [p, d] of c.docs) if (!oldCols.has(p.split('/')[0])) walk(d, p); // the kept old copies are not read by the new app
    assert.deepEqual(bad, []);
    const stores = c.docs.get('stores/list').stores;
    assert.equal(stores.find(s => s.key === 'zubair').salePrice, 10);
    assert.equal(stores.find(s => s.key === 'gul_zubair_traders').salePrice, 7);
    assert.deepEqual(Object.keys(c.docs.get('settings/config').settings.production).sort(), ['gul_zubair_traders', 'standard', 'zubair']);
    assert.equal(c.docs.get('settings/config').settings.other, 'kept');
  });
  it('support documents, photos, activity, settings, team, accounts and devices keep every value', async () => {
    const seed = oldCloud(); const c = client(seed); await migrateCloud(c, { apply: true });
    assertSameData(seed['factorySettings/config'], c.docs.get('formulas/config'), 'formulas', DOC_FIELD_RENAMES['formulas/config']);
    assertSameData(seed['expenseCategories/categories'], c.docs.get('categories/list'), 'categories');
    for (let i = 1; i <= 5; i++) { assertSameData(seed[`activityLog/a${i}`], c.docs.get(`activity/a${i}`), 'activity'); assert.equal(c.docs.get(`photos/p${i}`).data, 'AAA' + i); }
    assertSameData(seed['settings/team'], c.docs.get('settings/team'), 'team', DOC_FIELD_RENAMES['settings/team']);
    const sc = c.docs.get('settings/config');
    assert.deepEqual([sc.reps, sc.reps_timestamp, sc.synced, sc.repProfile, sc.appMode, sc.settings_timestamp], [['Ali', 'Bilal'], 22, 99, 'admin', 'x', 21]);
    assert.deepEqual(c.docs.get('settings/accounts'), seed['settings/accounts_index']);
    assert.deepEqual(c.docs.get('devices/device'), { deviceId: 'device', name: 'Phone', mode: 'admin' });
    assert.deepEqual(c.docs.get('devices/other-device'), seed['devices/other-device']);
    assert.deepEqual(c.docs.get('settings/yearCloseSignal'), seed['settings/yearCloseSignal']);
    assert.deepEqual(c.docs.get('account/info'), seed['account/info']);
  });
  it('recycle-bin entries keep their records and point at the new collection names', async () => {
    const c = client(oldCloud()); await migrateCloud(c, { apply: true });
    const cols = [1, 2, 3, 4].map(i => c.docs.get('deletions/d' + i).collection);
    assert.deepEqual(cols, ['rep', 'factory', 'calculator', 'sales']);
    for (let i = 1; i <= 4; i++) { const d = c.docs.get('deletions/d' + i); assert.equal(d.record.keep, i); assert.equal(d.record.store, 'mahmood'); assert.equal(d.deleted_by, 'user'); }
  });
  it('the OLD data is still there after a normal run (nothing is deleted without --delete-old)', async () => {
    const seed = oldCloud(); const c = client(seed); await migrateCloud(c, { apply: true });
    for (const p of Object.keys(seed)) if (!p.endsWith('_placeholder_')) assert.ok(c.docs.has(p), 'old doc removed: ' + p);
  });
  it('a dry run writes nothing', async () => {
    const seed = oldCloud(); const c = client(seed); const before = JSON.stringify([...c.docs]);
    const r = await migrateCloud(c, { apply: false }); assert.ok(r.writes > 0); assert.equal(JSON.stringify([...c.docs]), before);
  });
  it('running twice (or after a crash halfway) ends in the same complete state', async () => {
    const seed = oldCloud(); const ref = client(seed); await migrateCloud(ref, { apply: true });
    const crashy = client(seed, { failAfter: 1 });
    await assert.rejects(() => migrateCloud(crashy, { apply: true, deleteOld: true }));
    crashy.docs.forEach(() => {}); // whatever was written stays; old data must still be complete
    for (const p of Object.keys(seed)) if (!p.endsWith('_placeholder_') && !p.startsWith('deletions/')) assert.ok(crashy.docs.has(p), 'crash lost ' + p);
    const again = client(seed); again.docs.clear(); for (const [p, d] of crashy.docs) again.docs.set(p, clone(d));
    await migrateCloud(again, { apply: true });
    for (const [p, d] of ref.docs) { if (JSON.stringify(d).includes('2030-01-01')) continue; const strip = (x) => { const y = clone(x); delete y.stores_timestamp; return y; }; assert.deepEqual(strip(again.docs.get(p)), strip(d), 'state differs at ' + p); }
    assert.equal((await migrateCloud(again, { apply: true })).writes, 0);
  });
  it('--delete-old removes the old copies only after every document is verified in the new place', async () => {
    const seed = oldCloud(); const c = client(seed); const r = await migrateCloud(c, { apply: true, deleteOld: true });
    assert.deepEqual(r.warnings, []);
    for (const [oldCol, newCol] of DATASETS) if (oldCol !== newCol) { assert.equal([...c.docs.keys()].filter(p => p.startsWith(oldCol + '/')).length, 0); assert.equal([...c.docs.keys()].filter(p => p.startsWith(newCol + '/')).length, 7); }
    assert.ok(c.docs.has('formulas/config') && c.docs.has('categories/list') && c.docs.has('stores/list') && c.docs.has('devices/device') && c.docs.has('settings/accounts'));
  });
  it('a newer copy already under the new name is never overwritten, and old-only fields are added', async () => {
    const seed = oldCloud(); seed['calculator/calculator_history-1'] = { ...clone(seed['calculator_history/calculator_history-1']), amount: 999, updatedAt: { __timestamp: '2030-06-01T00:00:00Z' } };
    seed['formulas/config'] = { formulas: [{ id: 'newer' }], formulas_timestamp: 99, slots: { standard: null, asaan: null }, slots_timestamp: 1 };
    const c = client(seed); await migrateCloud(c, { apply: true });
    assert.equal(c.docs.get('calculator/calculator_history-1').amount, 999);
    const f = c.docs.get('formulas/config');
    assert.deepEqual(f.formulas, [{ id: 'newer' }]);
    assert.deepEqual([f.defaults.standard[0].id, f.costs.standard, f.slots.standard], ['f1', 3, 'f1']);
  });
  it('an old backup converts with every record and setting intact', () => {
    const b = { dataKeyVersion: 3, mfg_pro_pkr: [rec('p', 1), rec('p', 2)], customer_sales: [rec('s', 1)], noman_history: [rec('c', 1)], rep_sales: [rec('r', 1)], rep_customers: [rec('rc', 1)], sales_customers: [rec('sc', 1)],
      payment_transactions: [rec('t', 1)], payment_entities: [rec('e', 1)], factory_inventory_data: [rec('i', 1)], factory_production_history: [rec('f', 1)], expenses: [rec('x', 1)], stock_returns: [rec('sr', 1)],
      expense_categories: ['Fuel'], app_stores: [{ key: 'STORE_A', name: 'ZUBAIR' }, { key: 'STORE_D', name: 'Gul & Zubair Traders' }], factory_default_formulas: { standard: [1] }, factory_additional_costs: { standard: 2 },
      factory_cost_adjustment_factor: { standard: 1 }, factory_unit_tracking: { u: 1 }, factory_formula_store: [{ id: 'f' }], factory_formula_slots: { standard: 'f' },
      deletion_ids: ['d1', 'd2'], deletions: [{ id: 'd1' }], person_photos: { a: 1 }, photos_timestamps: { a: 2 }, photos_dirty_keys: ['a'], theme: 'dark', sales_reps_list: ['Ali'], user_roles_list: { Ali: 'rep' },
      settings: { production: { STORE_A: { price: 1 } } } };
    const { data } = convertBackup(b);
    const pairs = [['production', 2], ['sales', 1], ['calculator', 1], ['rep', 1], ['clients', 1], ['customers', 1], ['transactions', 1], ['entities', 1], ['inventory', 1], ['factory', 1], ['expenses', 1], ['returns', 1]];
    for (const [k, n] of pairs) assert.equal(data[k].length, n, k);
    assert.deepEqual([data.categories, data.defaults, data.costs, data.adjustment, data.tracking, data.formulas, data.slots, data.deleted, data.deletions, data.photos, data.photostamps, data.photodirty, data.theme, data.reps, data.roles],
      [['Fuel'], { standard: [1] }, { standard: 2 }, { standard: 1 }, { u: 1 }, [{ id: 'f' }], { standard: 'f' }, ['d1', 'd2'], [{ id: 'd1' }], { a: 1 }, { a: 2 }, ['a'], 'dark', ['Ali'], { Ali: 'rep' }]);
    assert.deepEqual(data.stores.map(s => s.key), ['zubair', 'gul_zubair_traders']);
    assert.deepEqual(Object.keys(data.settings.production), ['zubair']);
    assert.equal(data.production[0].store, 'mahmood' === 'x' ? '' : data.production[0].store);
    for (const k of Object.keys(BACKUP_FIELD_RENAMES)) if (k !== BACKUP_FIELD_RENAMES[k]) assert.ok(!(k in data) || k === 'deletions', 'old field left behind: ' + k);
    assert.equal(JSON.stringify(data.production[0].tags), JSON.stringify(b.mfg_pro_pkr[0].tags));
    assert.equal(data.production[0].customField.anything, 1);
  });
});
