// The ONLY place in the app that knows older local key names and older collection names. sqliteStore.get()
// falls back to these when a renamed key has no value yet, then moves the value to the new name, so a device
// that is updated keeps everything it had stored locally (settings, theme, pending photo uploads, pending
// year-close/restore markers, stats, ...). The offline queue is upgraded the same way (see below).
// Pure data and pure functions: no DOM, no storage. Record datasets are NOT listed here: their rows hold old
// store codes and are replaced from the migrated cloud copy (tools/migrate-cloud.mjs) instead.
export const LEGACY_LOCAL_KEYS = Object.freeze({
  reps_timestamp: 'sales_reps_list_timestamp', team_timestamp: 'team_list_timestamp', renames: 'customer_rename_map',
  recovered: 'recovered_id_map', synced: 'last_synced', meta: 'sync_meta', deltastats: ['delta_sync_stats', 'deltaSyncStats'],
  dbstats: 'firestore_stats', dbready: 'firestore_initialized', dbinit: 'firestore_init_timestamp', ui: 'ui_state',
  user: 'user_state', audit: 'partial_audit_last',
  settings: 'naswar_default_settings', theme: 'app_theme',
  categories: 'expense_categories', stores: 'app_stores', defaults: 'factory_default_formulas', costs: 'factory_additional_costs',
  adjustment: 'factory_cost_adjustment_factor', tracking: 'factory_unit_tracking', formulas: 'factory_formula_store',
  slots: 'factory_formula_slots',
  // recycle-bin ids: "deleted_records" is what the released app stored; "deletion_ids" is an intermediate name
  deleted: ['deleted_records', 'deletion_ids'], erased: 'erased_deletion_ids',
  // recycle-bin entries (each holds a copy of the deleted record): converted by modernizeLegacyValue() on the way in
  deletions: 'deletion_records',
  // person photos: the released app used the person_photos* names; photos_* are intermediate names
  photos: 'person_photos', photos_timestamp: 'person_photos_timestamp',
  photostamps: ['person_photos_timestamps', 'photos_timestamps'], photodirty: ['person_photos_dirty_keys', 'photos_dirty_keys'],
  reps: 'sales_reps_list', roles: 'user_roles_list', profile: 'current_rep_profile',
  closing: ['pending_year_close', 'pendingFirestoreYearClose'], restoring: ['pending_restore', 'pendingFirestoreRestore'],
});

// Every older local name a key may still be stored under, newest first. A "<name>_timestamp" companion key
// follows its data key (settings_timestamp <- naswar_default_settings_timestamp), so a device that is updated
// keeps the freshness stamp of its data and does not lose a newer local edit to an older cloud copy.
export function legacyLocalNames(key) {
  const direct = LEGACY_LOCAL_KEYS[key];
  if (direct) return [].concat(direct);
  const m = /^(.+)_timestamp$/.exec(String(key));
  if (m && LEGACY_LOCAL_KEYS[m[1]]) return [].concat(LEGACY_LOCAL_KEYS[m[1]]).map(n => `${n}_timestamp`);
  return [];
}

// A value read through an old local name may itself hold old names (the recycle bin keeps whole records):
// bring it to the current names before it is stored under the new key. Other keys pass through unchanged.
export function modernizeLegacyValue(key, value) {
  if (key !== 'deletions' || !Array.isArray(value)) return value;
  return value.map(t => {
    if (!t || typeof t !== 'object') return t;
    const c = JSON.parse(JSON.stringify(t));
    fixStoreCodes(c);
    for (const f of ['collection', 'recordType']) if (typeof c[f] === 'string' && LEGACY_COLLECTIONS[c[f]]) c[f] = LEGACY_COLLECTIONS[c[f]];
    return c;
  });
}

// ---- offline queue: operations queued by an older app version name old collections and old store codes ----
// [old Firestore collection or document path part, new one]. Mirrors tools/migrate-cloud.mjs (the tool owns the
// cloud side; this table lets an update replay operations that were still waiting in the queue).
export const LEGACY_COLLECTIONS = Object.freeze({
  calculator_history: 'calculator', rep_sales: 'rep', rep_customers: 'clients', sales_customers: 'customers',
  factory_history: 'factory', personPhotos: 'photos', activityLog: 'activity', activity_log: 'activity',
});
// set-doc operations that wrote a single document: old "collection/docId" -> new "collection/docId"
export const LEGACY_DOCS = Object.freeze({
  'appStores/stores': 'stores/list', 'app_stores/stores': 'stores/list',
  'factorySettings/config': 'formulas/config', 'factory_settings/config': 'formulas/config',
  'expenseCategories/categories': 'categories/list', 'expense_categories/categories': 'categories/list',
});
export const LEGACY_STORE_CODES = Object.freeze({ STORE_A: 'zubair', STORE_B: 'mahmood', STORE_C: 'asaan' });
const STORE_FIELDS = ['store', 'supplyStore', 'returnStore', 'transferPeerStore'];

function fixStoreCodes(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 5) return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + fixStoreCodes(x, depth + 1), 0);
  let fixed = 0;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === 'string') { if (STORE_FIELDS.includes(k) && LEGACY_STORE_CODES[v]) { node[k] = LEGACY_STORE_CODES[v]; fixed++; } }
    else if (v && typeof v === 'object') fixed += fixStoreCodes(v, depth + 1);
  }
  return fixed;
}

// Returns a copy of one queued item (or bare operation) written under the old names, or the same object
// when there is nothing to change. Only names change; no value is dropped.
export function modernizeQueuedOperation(item) {
  if (!item || typeof item !== 'object') return item;
  const wrapped = item.operation && typeof item.operation === 'object';
  const op = wrapped ? item.operation : item;
  if (!op || typeof op.collection !== 'string') return item;
  const next = { ...op };
  let changed = false;
  const doc = op.docId ? LEGACY_DOCS[`${op.collection}/${op.docId}`] : null;
  if (doc) { [next.collection, next.docId] = doc.split('/'); changed = true; }
  else if (LEGACY_COLLECTIONS[op.collection]) { next.collection = LEGACY_COLLECTIONS[op.collection]; changed = true; }
  if (typeof next.recordType === 'string' && LEGACY_COLLECTIONS[next.recordType]) { next.recordType = LEGACY_COLLECTIONS[next.recordType]; changed = true; }
  if (next.data && typeof next.data === 'object') {
    const data = JSON.parse(JSON.stringify(next.data));
    if (fixStoreCodes(data) > 0) { next.data = data; changed = true; }
  }
  if (!changed) return item;
  return wrapped ? { ...item, operation: next } : next;
}
export function modernizeQueue(list) {
  if (!Array.isArray(list)) return { list: [], changed: false };
  let changed = false;
  const out = list.map(i => { const n = modernizeQueuedOperation(i); if (n !== i) changed = true; return n; });
  return { list: out, changed };
}
