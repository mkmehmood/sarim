export const RECORD_STORES = Object.freeze([
  { sqlite: 'mfg_pro_pkr',                 collection: 'production',         backup: 'mfg',                      aliases: ['mfg_pro_pkr', 'db'] },
  { sqlite: 'customer_sales',              collection: 'sales',              backup: 'customerSales',            aliases: ['customer_sales'] },
  { sqlite: 'noman_history',               collection: 'calculator_history', backup: 'sales',                    aliases: ['noman_history', 'salesHistory'] },
  { sqlite: 'rep_sales',                   collection: 'rep_sales',          backup: 'repSales',                 aliases: ['rep_sales'] },
  { sqlite: 'rep_customers',               collection: 'rep_customers',      backup: 'repCustomers',             aliases: ['rep_customers'] },
  { sqlite: 'sales_customers',             collection: 'sales_customers',    backup: 'salesCustomers',           aliases: ['sales_customers'] },
  { sqlite: 'payment_transactions',        collection: 'transactions',       backup: 'paymentTransactions',      aliases: ['payment_transactions'] },
  { sqlite: 'payment_entities',            collection: 'entities',           backup: 'paymentEntities',          aliases: ['payment_entities'] },
  { sqlite: 'factory_inventory_data',      collection: 'inventory',          backup: 'factoryInventoryData',     aliases: ['factory_inventory_data'] },
  { sqlite: 'factory_production_history',  collection: 'factory_history',    backup: 'factoryProductionHistory', aliases: ['factory_production_history'] },
  { sqlite: 'expenses',                    collection: 'expenses',           backup: 'expenses',                 aliases: ['expenseRecords', 'expense_records'] },
  { sqlite: 'stock_returns',               collection: 'returns',            backup: 'stockReturns',             aliases: ['stock_returns'] },
]);
export const AUX_STATE = Object.freeze([
  {
    sqlite: 'expense_categories',
    tsKey: 'expense_categories_timestamp',
    backup: 'expenseCategories',
    aliases: ['expense_categories'],
    firestore: { doc: 'expenseCategories/categories', field: 'categories', tsField: 'categories_timestamp' },
    kind: 'list',
  },
  {
    sqlite: 'factory_formula_store',
    tsKey: 'factory_formula_store_timestamp',
    backup: 'factoryFormulaStore',
    aliases: ['factory_formula_store', 'formula_store'],
    firestore: { doc: 'factorySettings/config', field: 'formula_store', tsField: 'formula_store_timestamp' },
    kind: 'idList',
  },
  {
    sqlite: 'factory_formula_slots',
    tsKey: 'factory_formula_slots_timestamp',
    backup: 'factoryFormulaSlots',
    aliases: ['factory_formula_slots', 'formula_slots'],
    firestore: { doc: 'factorySettings/config', field: 'formula_slots', tsField: 'formula_slots_timestamp' },
    kind: 'slots',
  },
]);
export const REP_PROFILE_KEYS = Object.freeze({ primary: 'repProfile', legacyMirror: 'current_rep_profile', tsKey: 'repProfile_timestamp' });
export const SQLITE_TO_FIRESTORE = Object.freeze(
  Object.fromEntries(RECORD_STORES.map(s => [s.sqlite, s.collection]))
);
export const FIRESTORE_TO_SQLITE = Object.freeze(
  Object.fromEntries(RECORD_STORES.map(s => [s.collection, s.sqlite]))
);
export function normaliseBackupFields(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.mfg && !data.mfg_pro_pkr)     data.mfg_pro_pkr   = data.mfg;
  if (data.mfg_pro_pkr && !data.mfg)     data.mfg           = data.mfg_pro_pkr;
  if (data.sales && !data.noman_history) data.noman_history = data.sales;
  if (data.noman_history && !data.sales) data.sales         = data.noman_history;
  if (data.app_stores && !data.appStores) data.appStores    = data.app_stores;
  if (data.appStores && !data.app_stores) data.app_stores   = data.appStores;
  for (const s of [...RECORD_STORES, ...AUX_STATE]) {
    if (data[s.backup] !== undefined && data[s.backup] !== null) continue;
    for (const alias of s.aliases || []) {
      if (alias === s.backup) continue;
      if (data[alias] !== undefined && data[alias] !== null) { data[s.backup] = data[alias]; break; }
    }
  }
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
