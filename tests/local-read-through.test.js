import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legacyLocalNames, modernizeLegacyValue } from '../modules/local-aliases.js';

const src = readFileSync(new URL('../modules/business.js', import.meta.url), 'utf8');
function method(name) {
  const start = src.indexOf(`    async ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

function device(rows) {
  const table = new Map(Object.entries(rows).map(([k, v]) => [k, { value: JSON.stringify(v), encrypted: false }]));
  const make = new Function('_rawGet', '_fullKey', '_decrypt', '_PLAINTEXT_KEYS', '_safeErr', 'SQLiteCrypto', 'legacyLocalNames', 'modernizeLegacyValue', 'table', `
    const store = {
      DECRYPT_FAILED: Symbol('x'),
      async init() {},
      async set(k, v) { table.set(k, { value: JSON.stringify(v), encrypted: false }); },
      async remove(k) { table.delete(k); },
      ${method('get')},
      ${method('getBatch')},
    };
    return store;`);
  const store = make((k) => table.get(k) || null, (k) => k, async () => null, new Set(), (e) => String(e), { restoreSessionKeyFromStorage: async () => {} }, legacyLocalNames, modernizeLegacyValue, table);
  return { store, table };
}

const RELEASED = {
  factory_default_formulas: { standard: [{ id: 'a', quantity: 10, cost: 100 }], asaan: [] },
  factory_default_formulas_timestamp: 111,
  factory_additional_costs: { standard: 30, asaan: 0 },
  factory_cost_adjustment_factor: { standard: 1.1, asaan: 1 },
  factory_unit_tracking: { standard: { produced: 20, consumed: 1, available: 19, unitCostHistory: [] }, asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] } },
  factory_formula_store: [{ id: 'f1' }], factory_formula_slots: { standard: 'f1', asaan: null },
  app_stores: [{ key: 'STORE_A', name: 'ZUBAIR' }], naswar_default_settings: { production: { standard: { price: 1 } } },
  naswar_default_settings_timestamp: 222, expense_categories: ['Fuel'], sales_reps_list: ['Ali'],
  deleted_records: ['d1'], person_photos: { a: 'AAA' }, person_photos_dirty_keys: ['a'],
};

describe('a device updated from the released app keeps what it stored locally (getBatch and get)', () => {
  it('getBatch returns the formulas, costs, adjustment, settings and lists stored under the old names', async () => {
    const { store } = device(RELEASED);
    const b = await store.getBatch(['defaults', 'costs', 'adjustment', 'tracking', 'formulas', 'slots', 'stores', 'settings', 'categories', 'reps', 'deleted', 'photos', 'photodirty']);
    assert.deepEqual(b.get('defaults').standard, [{ id: 'a', quantity: 10, cost: 100 }]);
    assert.deepEqual(b.get('costs'), { standard: 30, asaan: 0 });
    assert.deepEqual(b.get('adjustment'), { standard: 1.1, asaan: 1 });
    assert.equal(b.get('tracking').standard.available, 19);
    assert.deepEqual(b.get('formulas'), [{ id: 'f1' }]);
    assert.deepEqual(b.get('slots'), { standard: 'f1', asaan: null });
    assert.deepEqual(b.get('settings'), RELEASED.naswar_default_settings);
    assert.deepEqual([b.get('categories'), b.get('reps'), b.get('deleted'), b.get('photos'), b.get('photodirty')], [['Fuel'], ['Ali'], ['d1'], { a: 'AAA' }, ['a']]);
  });
  it('the old store codes are converted when the store list moves to its new name', async () => {
    const { store } = device({ ...RELEASED, deletion_records: [{ id: 'x', collection: 'rep_sales', record: { store: 'STORE_B' } }] });
    const b = await store.getBatch(['deletions']);
    assert.deepEqual([b.get('deletions')[0].collection, b.get('deletions')[0].record.store], ['rep', 'mahmood']);
  });
  it('the freshness stamp comes along, so an older cloud copy cannot overwrite a newer local edit', async () => {
    const { store } = device(RELEASED);
    assert.equal(await store.get('defaults_timestamp'), 111);
    assert.equal(await store.get('settings_timestamp'), 222);
  });
  it('values are moved to the new name once and the old name is removed (nothing duplicated or reset)', async () => {
    const { store, table } = device(RELEASED);
    await store.getBatch(['costs']);
    assert.ok(table.has('costs') && !table.has('factory_additional_costs'));
    assert.deepEqual((await store.getBatch(['costs'])).get('costs'), { standard: 30, asaan: 0 });
  });
  it('a value already under the new name wins over a stale old one, and absent keys stay null', async () => {
    const { store } = device({ ...RELEASED, costs: { standard: 99, asaan: 0 } });
    const b = await store.getBatch(['costs', 'tracking', 'nothing_here']);
    assert.deepEqual(b.get('costs'), { standard: 99, asaan: 0 });
    assert.equal(b.get('nothing_here'), null);
    assert.equal((await device({}).store.getBatch(['defaults'])).get('defaults'), null);
  });
  it('getBatch itself carries the fallback in the source (guards against the direct read coming back)', () => {
    assert.ok(method('getBatch').includes('legacyLocalNames(key)'));
  });
});

import { mergeSupportFields } from '../tools/migrate-cloud.mjs';

describe('migration fills formulas the new app left empty', () => {
  it('replaces an empty default-formulas shell with the old formulas and keeps real data', () => {
    const old = { defaults: { standard: [{ id: 'a' }], asaan: [] }, defaults_timestamp: 5, costs: { standard: 30, asaan: 0 } };
    const cur = { defaults: { standard: [], asaan: [] }, defaults_timestamp: 9, costs: { standard: 40, asaan: 0 } };
    const p = mergeSupportFields(old, cur);
    assert.deepEqual(p.defaults, old.defaults);
    assert.equal(p.costs, undefined);
  });
});
