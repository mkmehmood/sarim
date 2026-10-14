import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_STORES, getDefaultStoreKey, formulaIdOf } from '../modules/store-keys.js';
import { feedsFromFormulas } from '../modules/formula-pools.js';
const src = readFileSync(new URL('../modules/formula-store.js', import.meta.url), 'utf8');
const DEFAULTS = DEFAULT_STORES.map(x => ({ ...x }));
function load(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  const notes = [];
  const sqliteStore = {
    get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : null),
    set: async (k, v) => { writes.push(k); data.set(k, structuredClone(v)); },
    setBatch: async (pairs) => { for (const [k, v] of pairs) { writes.push(k); data.set(k, structuredClone(v)); } },
    getBatch: async (keys) => new Map(keys.map((k) => [k, data.has(k) ? structuredClone(data.get(k)) : undefined])),
  };
  const window = {};
  const document = { getElementById: () => null };
  const stubs = {
    ensureArray: (v) => (Array.isArray(v) ? v : []),
    esc: (v) => String(v), generateUUID: (p) => p + '_id', getTimestamp: () => 1000, sqliteStore,
    showGlassConfirm: async () => true, showToast: () => {},
    sendDeviceNotification: async (t, b) => { notes.push([t, b]); },
    notifyDataChange: () => {}, triggerAutoSync: () => {},
    _invalidateStoresCache: () => {}, _set_currentFactoryEntryStore: () => {},
    getAppStores: async () => { const s = data.get('stores'); return Array.isArray(s) && s.length ? structuredClone(s) : structuredClone(DEFAULTS); },
    window, document, getDefaultStoreKey, formulaIdOf, feedsFromFormulas,
  };
  const body = src.replace(/^import .*$/gm, '').replace(/^export (async )?function/gm, '$1function');
  const ctx = vm.createContext({ ...stubs, console, structuredClone, Promise, Number, String, Array, Math, Date, JSON });
  vm.runInContext(body + '\nthis.api = { commitStoresWithFormulas, getFormulaStore, getFormulaNames, getStoreFormulaNames };', ctx);
  return { api: ctx.api, data, writes, notes };
}
describe('commitStoresWithFormulas', () => {
  const base = () => ({
    formulas: [
      { id: 'f1', name: 'Std', additionalCost: 2, costAdjustmentFactor: 0.5, ingredients: [{ id: 'm1', name: 'a', quantity: 1, cost: 2 }] },
      { id: 'f2', name: 'Asn', ingredients: [] },
    ],
  });
  it('editing one store keeps the others on their own formulas and prices', async () => {
    const { api, data } = load(base());
    const stores = structuredClone(DEFAULTS);
    stores[0] = { ...stores[0], formulaId: 'f1', salePrice: 540 };
    stores[1] = { ...stores[1], formulaId: 'f1', salePrice: 515 };
    stores[2] = { ...stores[2], formulaId: 'f2', salePrice: 610 };
    const r = await api.commitStoresWithFormulas(stores);
    assert.equal(r.ok, true, r.error);
    const saved = data.get('stores');
    assert.deepEqual(saved.map((s) => s.salePrice), [540, 515, 610]);
    assert.deepEqual(saved.map((s) => s.formulaId), ['f1', 'f1', 'f2']);
    assert.ok(data.get('stores_timestamp') > 0);
  });
  it('writes cost feeds keyed by formula id for every formula, not only two', async () => {
    const t = load({ formulas: [...base().formulas, { id: 'f3', name: 'New', additionalCost: 9, ingredients: [] }] });
    const stores = structuredClone(DEFAULTS).map((s, i) => ({ ...s, formulaId: ['f1', 'f2', 'f3'][i] }));
    const r = await t.api.commitStoresWithFormulas(stores);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(Object.keys(t.data.get('defaults')).sort(), ['f1', 'f2', 'f3']);
    assert.equal(t.data.get('costs').f1, 2);
    assert.equal(t.data.get('costs').f3, 9);
    assert.equal(t.data.get('adjustment').f1, 0.5);
    assert.equal(t.data.get('defaults').f1[0].quantity, 1);
  });
  it('lets a store switch formula while units of the old one are still available', async () => {
    const t = load({ ...base(), tracking: { f1: { produced: 9, consumed: 0, available: 9, unitCostHistory: [] } } });
    const stores = structuredClone(DEFAULTS).map((s) => ({ ...s, formulaId: 'f2' }));
    const r = await t.api.commitStoresWithFormulas(stores);
    assert.equal(r.ok, true, r.error);
    assert.equal(t.data.get('tracking').f1.available, 9);
  });
  it('refuses a formula that no longer exists and writes nothing', async () => {
    const t = load(base());
    const stores = structuredClone(DEFAULTS);
    stores[0] = { ...stores[0], formulaId: 'gone' };
    const r = await t.api.commitStoresWithFormulas(stores);
    assert.equal(r.ok, false);
    assert.ok(!t.writes.includes('stores'));
  });
  it('names a store by its formula and lists formula names by id', async () => {
    const t = load({ ...base(), stores: DEFAULTS.map((s, i) => (i === 0 ? { ...s, formulaId: 'f2' } : s)) });
    assert.deepEqual(JSON.parse(JSON.stringify(await t.api.getStoreFormulaNames())), { zubair: 'Asn' });
    assert.deepEqual(JSON.parse(JSON.stringify(await t.api.getFormulaNames())), { f1: 'Std', f2: 'Asn' });
  });
});
