import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RECORD_STORES, AUX_STATE, SQLITE_TO_FIRESTORE, FIRESTORE_TO_SQLITE,
  collectAuxBackupFields, applyAuxBackupFields, isCurrentBackup, RECORD_KEYS,
  mergeStringLists, mergeById, mergeSlots, resolveExpenseCategories, DATA_KEY_VERSION,
} from '../modules/data-keys.js';
const read = f => readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');
const sync = read('sync.js');
const sales = read('utilities-sales.js');
const payments = read('utilities-payments.js');
const admin = read('admin-data.js');
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
function objectLiteral(src, name) {
  const start = src.indexOf(`export const ${name} = {`);
  assert.ok(start >= 0, `${name} not found`);
  const end = src.indexOf('\n};', start);
  return src.slice(start, end);
}
function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { async get(k) { return m.has(k) ? m.get(k) : undefined; }, async set(k, v) { m.set(k, v); }, _m: m };
}
describe('registry matches the maps the cloud sync really uses', () => {
  it('registry has no duplicate keys', () => {
    for (const field of ['sqlite', 'collection', 'backup']) {
      const vals = RECORD_STORES.map(s => s[field]);
      assert.equal(new Set(vals).size, vals.length, `duplicate ${field}`);
    }
  });
});
describe('every backup writer carries every record store and every aux key', () => {
  const writers = {
    unifiedBackup: fnBody(sales, 'unifiedBackup'),
    triggerLocalBackup: fnBody(payments, 'triggerLocalBackup'),
    closeYearBackup: admin.slice(admin.indexOf('const backupData = {'), admin.indexOf('const backupData = {') + 2500),
  };
  for (const [name, body] of Object.entries(writers)) {
    it(`${name} writes all record stores`, () => {
      for (const s of RECORD_STORES) {
        assert.ok(new RegExp(`\\b${s.backup}\\s*:`).test(body), `${name} is missing backup field "${s.backup}" (${s.sqlite})`);
      }
    });
    it(`${name} writes expense categories, formula store/slots and photos via the shared collector`, () => {
      assert.ok(body.includes('collectAuxBackupFields(sqliteStore)'), `${name} must spread collectAuxBackupFields`);
    });
  }
  it('both restore paths apply the aux fields', () => {
    const merge = fnBody(sales, '_doRestoreMerge');
    const yc = fnBody(sales, '_doYearCloseRestore');
    assert.ok(merge.includes("applyAuxBackupFields(data, sqliteStore, settingsTimestamp, 'merge')"));
    assert.ok(yc.includes("applyAuxBackupFields(data, sqliteStore, settingsTimestamp, 'replace')"));
  });
});
describe('cloud sync uses the same keys the app reads', () => {
  it('every write of profile also writes repProfile', () => {
    const lines = sync.split('\n');
    lines.forEach((l, i) => {
      if (!l.includes("'profile'") || l.includes('sqlite:')) return;
      const around = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
      assert.ok(around.includes("'repProfile'"), `sync.js line ${i + 1} writes profile without repProfile`);
    });
  });
  it('settings/config upload carries its timestamp (listeners compare it)', () => {
    assert.ok(/settings:\s*_ds \|\| \{\},\s*settings_timestamp:\s*localSettingsTs/.test(sync));
  });
  it('expense category upload carries categories_timestamp (listeners compare it)', () => {
    assert.ok(/categories:\s*_ec \|\| \[\],\s*categories_timestamp:\s*localExpCatTs/.test(sync));
  });
  it('local expense category edits stamp categories_timestamp', () => {
    const sets = (payments.match(/set\('categories',/g) || []).length;
    const stamps = (payments.match(/set\('categories_timestamp'/g) || []).length;
    assert.ok(stamps >= 3, `expected stamps next to category writes, found ${stamps} (writes: ${sets})`);
  });
});
describe('one single-word name per dataset', () => {
  it('the datasets are named exactly like this', () => {
    assert.deepEqual(RECORD_KEYS, ['production', 'sales', 'calculator', 'rep', 'clients', 'customers', 'transactions', 'entities', 'inventory', 'factory', 'expenses', 'returns']);
  });
  it('local key, Firestore collection and backup field are the same string', () => {
    for (const s of RECORD_STORES) assert.ok(s.sqlite === s.collection && s.collection === s.backup && s.backup === s.key, s.key);
  });
  it('no dataset name has two words', () => {
    for (const k of RECORD_KEYS) assert.ok(!/[_\-\s]/.test(k), k);
  });
  it('the app code carries no old dataset name and no migration code', () => {
    const files = ['sync.js', 'utilities-sales.js', 'utilities-payments.js', 'admin-data.js', 'utilities-core.js', 'factory.js', 'customers.js', 'rep-sales.js', 'link-graph.js', 'link-guards.js', 'business.js', 'formula-store.js', 'prod-photos.js', 'data-keys.js', 'store-keys.js'];
    const old = ['mfg_pro_pkr', 'noman_history', 'customer_sales', 'payment_transactions', 'payment_entities', 'factory_inventory_data',
      'factory_production_history', 'stock_returns', 'calculator_history', 'rep_sales', 'rep_customers', 'sales_customers', 'factory_history', 'naswar_default_settings', 'STORE_A', 'STORE_B', 'STORE_C',
      'deletion_records', 'deleted_records', 'person_photos', 'app_theme', 'pendingFirestoreYearClose\'', 'pendingFirestoreRestore\'', 'deltaSyncStats\'',
      "'appStores'", "'appStores/", "'factorySettings'", "'factorySettings/", "'expenseCategories'", "'expenseCategories/", "'activityLog'", "'personPhotos'"];
    for (const f of files) {
      const code = read(f).split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      for (const k of old) assert.ok(!code.includes(k), `${f} still mentions ${k}`);
      assert.ok(!/migrateStoreKeys|migrateLegacy|normaliseBackupFields|upgradeSettingsDoc/.test(code), `${f} still has migration code`);
    }
  });
  it('every backup writer stamps dataKeyVersion', () => {
    assert.ok(fnBody(sales, 'unifiedBackup').includes('dataKeyVersion: DATA_KEY_VERSION'));
    assert.ok(fnBody(payments, 'triggerLocalBackup').includes('dataKeyVersion: DATA_KEY_VERSION'));
    assert.ok(admin.slice(admin.indexOf('const backupData = {')).slice(0, 400).includes('dataKeyVersion: DATA_KEY_VERSION'));
  });
  it('a backup written with older key names is recognised and refused', () => {
    assert.equal(isCurrentBackup({ mfg: [], sales: [] }), false);
    assert.equal(isCurrentBackup({ dataKeyVersion: 2, production: [] }), false);
    assert.equal(isCurrentBackup({ dataKeyVersion: DATA_KEY_VERSION, production: [] }), true);
    assert.equal(isCurrentBackup({ _meta: { dataKeyVersion: DATA_KEY_VERSION } }), true);
    for (const src of [sales, payments, admin]) assert.ok(src.includes('isCurrentBackup('), 'restore paths must check the version');
  });
});
describe('aux state round trip: backup -> restore into a fresh device', () => {
  const source = () => memStore({
    categories: ['Fuel', 'Tea'],
    formulas: [{ id: 'f1', name: 'Std' }, { id: 'f2', name: 'Asaan' }],
    slots: { standard: 'f1', asaan: 'f2' },
    photos: { a: 'data:x' },
    photostamps: { a: 5 },
  });
  it('collect captures every aux key', async () => {
    const out = await collectAuxBackupFields(source());
    for (const s of AUX_STATE) assert.ok(s.backup in out, s.backup);
    assert.deepEqual(out.photos, { a: 'data:x' });
  });
  it('merge restore fills an empty device and stamps timestamps', async () => {
    const data = await collectAuxBackupFields(source());
    const fresh = memStore();
    const written = await applyAuxBackupFields(data, fresh, 123, 'merge');
    assert.deepEqual(written.sort(), ['categories', 'formulas', 'slots']);
    assert.deepEqual(fresh._m.get('categories'), ['Fuel', 'Tea']);
    assert.equal(fresh._m.get('categories_timestamp'), 123);
    assert.equal(fresh._m.get('formulas').length, 2);
    assert.deepEqual(fresh._m.get('slots'), { standard: 'f1', asaan: 'f2' });
  });
  it('merge restore never drops local data', async () => {
    const data = await collectAuxBackupFields(source());
    const dev = memStore({ categories: ['Rent'], formulas: [{ id: 'f9' }], slots: { standard: 'f9', asaan: null } });
    await applyAuxBackupFields(data, dev, 1, 'merge');
    assert.deepEqual(dev._m.get('categories'), ['Rent', 'Fuel', 'Tea']);
    assert.deepEqual(dev._m.get('formulas').map(f => f.id), ['f9', 'f1', 'f2']);
    assert.deepEqual(dev._m.get('slots'), { standard: 'f9', asaan: 'f2' });
  });
  it('replace restore (year-close reversal) makes the backup win', async () => {
    const data = await collectAuxBackupFields(source());
    const dev = memStore({ categories: ['Rent'], formulas: [{ id: 'f9' }], slots: { standard: 'f9', asaan: null } });
    await applyAuxBackupFields(data, dev, 1, 'replace');
    assert.deepEqual(dev._m.get('categories'), ['Fuel', 'Tea']);
    assert.deepEqual(dev._m.get('formulas').map(f => f.id), ['f1', 'f2']);
    assert.deepEqual(dev._m.get('slots'), { standard: 'f1', asaan: 'f2' });
  });
  it('old backups without these fields restore without touching local data', async () => {
    const dev = memStore({ categories: ['Rent'] });
    const written = await applyAuxBackupFields({ mfg: [] }, dev, 1, 'merge');
    assert.deepEqual(written, []);
    assert.deepEqual(dev._m.get('categories'), ['Rent']);
  });
});
describe('merge helpers and cloud category resolution', () => {
  it('mergeStringLists trims, drops blanks and duplicates, keeps order', () => {
    assert.deepEqual(mergeStringLists(['a', ' b '], ['b', '', 'c', 7]), ['a', 'b', 'c']);
  });
  it('mergeById keeps local, adds new, skips id-less', () => {
    assert.deepEqual(mergeById([{ id: 1, v: 'L' }], [{ id: 1, v: 'B' }, { id: 2 }, { v: 'x' }]), [{ id: 1, v: 'L' }, { id: 2 }]);
  });
  it('mergeSlots fills only the missing side', () => {
    assert.deepEqual(mergeSlots({ standard: 'a' }, { standard: 'z', asaan: 'b' }), { standard: 'a', asaan: 'b' });
  });
  it('newer cloud stamp replaces local', () => {
    const r = resolveExpenseCategories(['A', 'B'], ['A'], 10, 20);
    assert.deepEqual(r, { value: ['A'], ts: 20, changed: true });
  });
  it('legacy cloud doc (no stamp) never deletes local-only categories', () => {
    const r = resolveExpenseCategories(['A', 'B'], ['A', 'C'], 5, 0);
    assert.deepEqual(r.value, ['A', 'B', 'C']);
    assert.equal(r.ts, 5);
  });
  it('older cloud stamp leaves local untouched', () => {
    const r = resolveExpenseCategories(['A', 'B'], ['Z'], 30, 20);
    assert.deepEqual(r, { value: ['A', 'B'], ts: 30, changed: false });
  });
});
describe('one registry for names, variables, tabs and buttons', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const core = read('utilities-core.js');
  it('every dataset has a unique JS variable, a label and a known tab', async () => {
    const { TABS } = await import('../modules/data-keys.js');
    const tabs = new Set(TABS.map(t => t.name));
    assert.equal(new Set(RECORD_STORES.map(s => s.jsVar)).size, RECORD_STORES.length);
    for (const s of RECORD_STORES) assert.ok(s.jsVar && s.label && s.desc && tabs.has(s.tab), s.key);
  });
  it('sync maps are derived from the registry', () => {
    for (const s of RECORD_STORES) { assert.equal(SQLITE_TO_FIRESTORE[s.sqlite], s.collection); assert.equal(FIRESTORE_TO_SQLITE[s.collection], s.sqlite); }
    assert.ok(/SQLiteToFirestoreMap = Object\.fromEntries\(RECORD_STORES/.test(sync));
    assert.ok(/FirestoreToSQLiteMap = Object\.fromEntries\(RECORD_STORES/.test(sync));
  });
  it('every tab has a nav button and an exported sync function', async () => {
    const { TABS } = await import('../modules/data-keys.js');
    for (const t of TABS) {
      assert.ok(html.includes(`id="snav-${t.id}"`), `nav button for ${t.name}`);
      assert.ok(core.includes(`export async function ${t.syncFn}(`), t.syncFn);
    }
  });
  it('buttons use one wording: Save / Update / Delete / Restore', () => {
    for (const bad of ['Submit Transaction', 'Update Details', 'Permanently</button>', 'Save Production Entry', '>Delete material<'])
      assert.ok(!html.includes(bad), `index.html still has "${bad}"`);
    assert.ok(!/<\/svg> Recover<\/button>/.test(read('utilities-payments.js')), 'recycle bin still says Recover');
  });
});
describe('support data follows the same naming rule', () => {
  it('names are snake_case and identical locally, in Firestore and in backups', async () => {
    const { SUPPORT_STORES, FIRESTORE_SUPPORT_PATHS } = await import('../modules/data-keys.js');
    assert.equal(SUPPORT_STORES.tombstones.sqlite, SUPPORT_STORES.tombstones.collection);
    assert.equal(SUPPORT_STORES.photos.sqlite, SUPPORT_STORES.photos.collection);
    for (const v of Object.values(FIRESTORE_SUPPORT_PATHS)) assert.ok(/^[a-z_]+(\/[a-z_]+)?$/.test(v), v);
  });
  it('the app really uses those names', () => {
    for (const k of ['deletions', 'deleted', 'photos', 'photostamps', 'photodirty']) assert.ok(sync.includes(`'${k}'`) || sales.includes(`'${k}'`) || payments.includes(`'${k}'`), k);
    for (const c of ['stores', 'formulas', 'categories', 'activity']) assert.ok(sync.includes(`collection('${c}')`), c);
    assert.ok(sync.includes("collection('photos')"));
    assert.ok(!/sqliteStore\.\w+\(\s*'app_theme'/.test(payments + read('utilities-core.js')), 'one theme key');
  });
});
