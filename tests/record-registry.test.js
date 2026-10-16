import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RECORD_STORES, AUX_STATE,
  collectAuxBackupFields, applyAuxBackupFields, isSupportedBackup, RECORD_KEYS,
  mergeStringLists, mergeById,
} from '../modules/link-graph.js';
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
    for (const field of ['sqlite', 'collection']) {
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
        assert.ok(new RegExp(`\\b${s.key}\\s*:`).test(body), `${name} is missing backup field "${s.key}"`);
      }
    });
    it(`${name} writes expense categories, formula store and photos via the shared collector`, () => {
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
  it('local key, Firestore collection and backup field are all the one key', () => {
    for (const s of RECORD_STORES) assert.ok(s.sqlite === s.collection && s.collection === s.key && !('backup' in s), s.key);
  });
  it('no dataset name has two words', () => {
    for (const k of RECORD_KEYS) assert.ok(!/[_\-\s]/.test(k), k);
  });
  it('plain JSON backup support is gone: only encrypted .gznd files restore', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(/id="restoreInput"[^>]*accept="\.gznd"/.test(html), 'file picker must accept .gznd only');
    for (const [name, src] of [['utilities-sales.js', sales], ['utilities-payments.js', payments], ['business.js', read('business.js')]]) {
      assert.ok(!/analyzeBackupFile|uploadOldDataToCloud|_readFileAsText|backupMetadata|backup_upload/.test(src), `${name} still has JSON backup code`);
      assert.ok(!/JSON\.parse\(text\)/.test(src), `${name} still parses a plain JSON file`);
    }
    assert.ok(!/\.backup\b/.test(read('link-graph.js')), 'link-graph.js still has a separate backup key');
  });
  it('the entity range select calls a real function instead of a dataset global that does not exist', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const tag = html.slice(html.indexOf('id="entityPdfRange"'), html.indexOf('id="entityPdfRange"') + 200);
    assert.ok(tag.includes('onchange="refreshEntityOverlay()"'), 'select must call refreshEntityOverlay');
    assert.ok(read('utilities-core.js').includes('window.refreshEntityOverlay = refreshEntityOverlay;'), 'handler must be on window');
  });
  it('a backup with unknown or old key names is refused with a plain unsupported-file error', () => {
    assert.equal(isSupportedBackup({ mfg: [], customer_sales: [] }), false);
    assert.equal(isSupportedBackup({ production: 'x' }), false);
    assert.equal(isSupportedBackup(null), false);
    assert.equal(isSupportedBackup([]), false);
    assert.equal(isSupportedBackup({ production: [] }), true);
    assert.equal(isSupportedBackup({ sales: [], production: [{ id: 1 }] }), true);
    for (const src of [sales, admin]) {
      assert.ok(src.includes('isSupportedBackup('), 'restore paths must check the file');
      assert.ok(src.includes('Unsupported file'), 'restore paths must show the unsupported-file error');
    }
  });
});
describe('aux state round trip: backup -> restore into a fresh device', () => {
  const source = () => memStore({
    categories: ['Fuel', 'Tea'],
    formulas: [{ id: 'f1', name: 'Std' }, { id: 'f2', name: 'Asaan' }],
    photos: { a: 'data:x' },
    photostamps: { a: 5 },
  });
  it('collect captures every aux key', async () => {
    const out = await collectAuxBackupFields(source());
    for (const s of AUX_STATE) assert.ok(s.sqlite in out, s.sqlite);
    assert.deepEqual(out.photos, { a: 'data:x' });
  });
  it('merge restore fills an empty device and stamps timestamps', async () => {
    const data = await collectAuxBackupFields(source());
    const fresh = memStore();
    const written = await applyAuxBackupFields(data, fresh, 123, 'merge');
    assert.deepEqual(written.sort(), ['categories', 'formulas']);
    assert.deepEqual(fresh._m.get('categories'), ['Fuel', 'Tea']);
    assert.equal(fresh._m.get('categories_timestamp'), 123);
    assert.equal(fresh._m.get('formulas').length, 2);
    assert.equal(fresh._m.has('slots'), false);
  });
  it('merge restore never drops local data', async () => {
    const data = await collectAuxBackupFields(source());
    const dev = memStore({ categories: ['Rent'], formulas: [{ id: 'f9' }] });
    await applyAuxBackupFields(data, dev, 1, 'merge');
    assert.deepEqual(dev._m.get('categories'), ['Rent', 'Fuel', 'Tea']);
    assert.deepEqual(dev._m.get('formulas').map(f => f.id), ['f9', 'f1', 'f2']);
  });
  it('replace restore (year-close reversal) makes the backup win', async () => {
    const data = await collectAuxBackupFields(source());
    const dev = memStore({ categories: ['Rent'], formulas: [{ id: 'f9' }] });
    await applyAuxBackupFields(data, dev, 1, 'replace');
    assert.deepEqual(dev._m.get('categories'), ['Fuel', 'Tea']);
    assert.deepEqual(dev._m.get('formulas').map(f => f.id), ['f1', 'f2']);
  });
});
describe('merge helpers and cloud category resolution', () => {
  it('mergeStringLists trims, drops blanks and duplicates, keeps order', () => {
    assert.deepEqual(mergeStringLists(['a', ' b '], ['b', '', 'c', 7]), ['a', 'b', 'c']);
  });
  it('mergeById keeps local, adds new, skips id-less', () => {
    assert.deepEqual(mergeById([{ id: 1, v: 'L' }], [{ id: 1, v: 'B' }, { id: 2 }, { v: 'x' }]), [{ id: 1, v: 'L' }, { id: 2 }]);
  });
});
describe('one registry for names, variables, tabs and buttons', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const core = read('utilities-core.js');
  it('every dataset has a unique JS variable and a label', () => {
    assert.equal(new Set(RECORD_STORES.map(s => s.jsVar)).size, RECORD_STORES.length);
    for (const s of RECORD_STORES) assert.ok(s.jsVar && s.label && s.desc && s.tab, s.key);
  });
  it('sync maps are derived from the registry', () => {
    assert.ok(/SQLiteToFirestoreMap = Object\.fromEntries\(RECORD_STORES/.test(sync));
    assert.ok(/FirestoreToSQLiteMap = Object\.fromEntries\(RECORD_STORES/.test(sync));
  });
  it('buttons use one wording: Save / Update / Delete / Restore', () => {
    for (const bad of ['Submit Transaction', 'Update Details', 'Permanently</button>', 'Save Production Entry', '>Delete material<'])
      assert.ok(!html.includes(bad), `index.html still has "${bad}"`);
    assert.ok(!/<\/svg> Recover<\/button>/.test(read('utilities-payments.js')), 'recycle bin still says Recover');
  });
});
describe('support data follows the same naming rule', () => {
  it('the app uses the current names', () => {
    for (const k of ['deletions', 'deleted', 'photos', 'photostamps', 'photodirty']) assert.ok(sync.includes(`'${k}'`) || sales.includes(`'${k}'`) || payments.includes(`'${k}'`), k);
    for (const c of ['stores', 'formulas', 'categories', 'activity']) assert.ok(sync.includes(`collection('${c}')`), c);
    assert.ok(sync.includes("collection('photos')"));
    assert.ok(!/sqliteStore\.\w+\(\s*'app_theme'/.test(payments + read('utilities-core.js')), 'one theme key');
  });
});
