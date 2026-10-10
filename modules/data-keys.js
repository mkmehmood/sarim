// ONE canonical name per dataset. The same string is the local database key, the Firestore
// collection, the backup/restore field and the delta-sync name. Older builds used a different
// name in each place (mfg_pro_pkr / production / mfg, noman_history / calculator_history / sales,
// ...). Those names survive only as `legacySqlite` / `legacyBackup` so a one-time migration and
// the restore of old backups can still recognise them.
import { legacyMapForCatalog, planStoreCatalogMigration, remapStoreKeysDeep, remapSettingsStoreKeys } from './store-keys.js';
export const DATA_KEY_VERSION = 2;
const rec = (key, legacySqlite, legacyBackup = []) => ({
  key, sqlite: key, collection: key, backup: key,
  legacySqlite: legacySqlite || null,
  legacyBackup,
  aliases: [...new Set([legacySqlite, ...legacyBackup].filter(Boolean))],
});
export const RECORD_STORES = Object.freeze([
  rec('production',         'mfg_pro_pkr',                ['mfg', 'db']),
  rec('sales',              'customer_sales',             ['customerSales']),
  rec('calculator_history', 'noman_history',              ['salesHistory']),
  rec('rep_sales',          null,                         ['repSales']),
  rec('rep_customers',      null,                         ['repCustomers']),
  rec('sales_customers',    null,                         ['salesCustomers']),
  rec('transactions',       'payment_transactions',       ['paymentTransactions']),
  rec('entities',           'payment_entities',           ['paymentEntities']),
  rec('inventory',          'factory_inventory_data',     ['factoryInventoryData']),
  rec('factory_history',    'factory_production_history', ['factoryProductionHistory']),
  rec('expenses',           null,                         ['expenseRecords', 'expense_records']),
  rec('returns',            'stock_returns',              ['stockReturns']),
]);
// Local database keys that were renamed (the one-time migration moves these rows).
export const LEGACY_SQLITE_KEYS = Object.freeze(Object.fromEntries(
  RECORD_STORES.filter(s => s.legacySqlite && s.legacySqlite !== s.key).map(s => [s.legacySqlite, s.key])
));
export const RECORD_KEYS = Object.freeze(RECORD_STORES.map(s => s.key));
export const AUX_STATE = Object.freeze([
  {
    sqlite: 'expense_categories',
    tsKey: 'expense_categories_timestamp',
    backup: 'expense_categories',
    legacyBackup: ['expenseCategories'],
    aliases: ['expenseCategories'],
    firestore: { doc: 'expenseCategories/categories', field: 'categories', tsField: 'categories_timestamp' },
    kind: 'list',
  },
  {
    sqlite: 'factory_formula_store',
    tsKey: 'factory_formula_store_timestamp',
    backup: 'factory_formula_store',
    legacyBackup: ['factoryFormulaStore', 'formula_store'],
    aliases: ['factoryFormulaStore', 'formula_store'],
    firestore: { doc: 'factorySettings/config', field: 'formula_store', tsField: 'formula_store_timestamp' },
    kind: 'idList',
  },
  {
    sqlite: 'factory_formula_slots',
    tsKey: 'factory_formula_slots_timestamp',
    backup: 'factory_formula_slots',
    legacyBackup: ['factoryFormulaSlots', 'formula_slots'],
    aliases: ['factoryFormulaSlots', 'formula_slots'],
    firestore: { doc: 'factorySettings/config', field: 'formula_slots', tsField: 'formula_slots_timestamp' },
    kind: 'slots',
  },
]);
// Settings-like backup fields: the backup field is the local key (snake_case), as everywhere else.
export const SETTINGS_BACKUP_FIELDS = Object.freeze([
  { key: 'app_stores',                      legacy: ['appStores'] },
  { key: 'factory_default_formulas',        legacy: ['factoryDefaultFormulas'] },
  { key: 'factory_additional_costs',        legacy: ['factoryAdditionalCosts'] },
  { key: 'factory_cost_adjustment_factor',  legacy: ['factoryCostAdjustmentFactor'] },
  { key: 'factory_unit_tracking',           legacy: ['factoryUnitTracking'] },
]);
export const REP_PROFILE_KEYS = Object.freeze({ primary: 'repProfile', legacyMirror: 'current_rep_profile', tsKey: 'repProfile_timestamp' });
export const SQLITE_TO_FIRESTORE = Object.freeze(
  Object.fromEntries(RECORD_STORES.map(s => [s.sqlite, s.collection]))
);
export const FIRESTORE_TO_SQLITE = Object.freeze(
  Object.fromEntries(RECORD_STORES.map(s => [s.collection, s.sqlite]))
);
// Brings ANY backup (current, or from older builds) to the canonical field names, in place.
// Backups written before DATA_KEY_VERSION 2 used "sales" for the calculator history, so the
// field is only treated that way when the backup carries no version stamp.
export function normaliseBackupFields(data) {
  if (!data || typeof data !== 'object') return data;
  const stamped = Number(data.dataKeyVersion || (data._meta && data._meta.dataKeyVersion) || 0) >= DATA_KEY_VERSION;
  if (!stamped && data.sales !== undefined) {
    if (data.calculator_history === undefined && data.noman_history === undefined && data.salesHistory === undefined) {
      data.calculator_history = data.sales;
    }
    delete data.sales;
  }
  const move = (canonical, legacyNames) => {
    for (const name of legacyNames) {
      if (name === canonical || !(name in data)) continue;
      if (data[canonical] === undefined || data[canonical] === null) {
        if (data[name] !== undefined && data[name] !== null) data[canonical] = data[name];
      }
      delete data[name];
    }
  };
  for (const s of RECORD_STORES) move(s.key, [s.legacySqlite, ...s.legacyBackup].filter(Boolean));
  for (const s of AUX_STATE) move(s.backup, s.legacyBackup);
  for (const s of SETTINGS_BACKUP_FIELDS) move(s.key, s.legacy);
  const catalog = Array.isArray(data.app_stores) ? data.app_stores : [];
  const map = legacyMapForCatalog(catalog);
  if (catalog.length) data.app_stores = planStoreCatalogMigration(catalog).stores;
  for (const key of RECORD_KEYS) if (Array.isArray(data[key])) remapStoreKeysDeep(data[key], map);
  remapSettingsStoreKeys(data.settings, map);
  data.dataKeyVersion = DATA_KEY_VERSION;
  return data;
}
export function mergeStringLists(local, incoming) {
  const out = [];
  const seen = new Set();
  for (const v of [...(Array.isArray(local) ? local : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
export function mergeById(local, incoming) {
  const out = Array.isArray(local) ? local.filter(r => r && r.id) : [];
  const ids = new Set(out.map(r => String(r.id)));
  for (const r of Array.isArray(incoming) ? incoming : []) {
    if (r && r.id && !ids.has(String(r.id))) { ids.add(String(r.id)); out.push(r); }
  }
  return out;
}
export function mergeSlots(local, incoming) {
  const l = local && typeof local === 'object' ? local : {};
  const i = incoming && typeof incoming === 'object' ? incoming : {};
  return { standard: l.standard || i.standard || null, asaan: l.asaan || i.asaan || null };
}
export function resolveExpenseCategories(local, cloud, localTs = 0, cloudTs = 0) {
  const l = Array.isArray(local) ? local : [];
  const c = Array.isArray(cloud) ? cloud : [];
  if (cloudTs && cloudTs > (localTs || 0)) return { value: mergeStringLists(c, []), ts: cloudTs, changed: true };
  if (!cloudTs) {
    const union = mergeStringLists(l, c);
    return { value: union, ts: localTs || 0, changed: union.length !== l.length };
  }
  return { value: l, ts: localTs, changed: false };
}
export async function collectAuxBackupFields(store) {
  const out = {};
  for (const s of AUX_STATE) {
    const v = await store.get(s.sqlite);
    if (s.kind === 'list')   out[s.backup] = Array.isArray(v) ? v : [];
    if (s.kind === 'idList') out[s.backup] = Array.isArray(v) ? v : [];
    if (s.kind === 'slots')  out[s.backup] = v && typeof v === 'object' ? v : { standard: null, asaan: null };
  }
  out.person_photos = (await store.get('person_photos')) || {};
  out.person_photos_timestamps = (await store.get('person_photos_timestamps')) || {};
  return out;
}
export async function applyAuxBackupFields(data, store, ts = Date.now(), mode = 'merge') {
  const written = [];
  if (!data || typeof data !== 'object') return written;
  normaliseBackupFields(data);
  for (const s of AUX_STATE) {
    const incoming = data[s.backup];
    if (incoming === undefined || incoming === null) continue;
    const local = await store.get(s.sqlite);
    let next;
    if (s.kind === 'list') {
      if (!Array.isArray(incoming)) continue;
      next = mode === 'replace' ? mergeStringLists(incoming, []) : mergeStringLists(local, incoming);
      if (JSON.stringify(next) === JSON.stringify(Array.isArray(local) ? local : [])) continue;
    } else if (s.kind === 'idList') {
      if (!Array.isArray(incoming)) continue;
      next = mode === 'replace' ? incoming.filter(r => r && r.id) : mergeById(local, incoming);
      if (JSON.stringify(next) === JSON.stringify(Array.isArray(local) ? local : [])) continue;
    } else {
      if (typeof incoming !== 'object' || !(incoming.standard || incoming.asaan)) continue;
      next = mode === 'replace'
        ? { standard: incoming.standard || null, asaan: incoming.asaan || null }
        : mergeSlots(local, incoming);
      if (JSON.stringify(next) === JSON.stringify(local || null)) continue;
    }
    await store.set(s.sqlite, next);
    await store.set(s.tsKey, ts);
    written.push(s.sqlite);
  }
  return written;
}
