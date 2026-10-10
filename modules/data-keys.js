// ONE name per dataset, used everywhere: the local database key, the Firestore collection, the
// backup/restore field and the delta-sync name.
//   production  production entries        sales      customer sales        calculator  calculator history
//   rep         rep sales                 clients    rep customers         customers   sales customers
//   transactions payments                 entities   payment entities      inventory   raw material / stock
//   factory     factory production        expenses   expenses              returns     stock returns
// Backups carry DATA_KEY_VERSION so a file written with older names is recognised and refused
// (convert it first with tools/migrate-cloud.mjs --convert-backup).
export const DATA_KEY_VERSION = 3;
const rec = (key) => ({ key, sqlite: key, collection: key, backup: key });
export const RECORD_STORES = Object.freeze([
  'production', 'sales', 'calculator', 'rep', 'clients', 'customers',
  'transactions', 'entities', 'inventory', 'factory', 'expenses', 'returns',
].map(rec));
export const RECORD_KEYS = Object.freeze(RECORD_STORES.map(s => s.key));
export const AUX_STATE = Object.freeze([
  {
    sqlite: 'expense_categories',
    tsKey: 'expense_categories_timestamp',
    backup: 'expense_categories',
    firestore: { doc: 'expenseCategories/categories', field: 'categories', tsField: 'categories_timestamp' },
    kind: 'list',
  },
  {
    sqlite: 'factory_formula_store',
    tsKey: 'factory_formula_store_timestamp',
    backup: 'factory_formula_store',
    firestore: { doc: 'factorySettings/config', field: 'formula_store', tsField: 'formula_store_timestamp' },
    kind: 'idList',
  },
  {
    sqlite: 'factory_formula_slots',
    tsKey: 'factory_formula_slots_timestamp',
    backup: 'factory_formula_slots',
    firestore: { doc: 'factorySettings/config', field: 'formula_slots', tsField: 'formula_slots_timestamp' },
    kind: 'slots',
  },
]);
// Settings-like backup fields: the backup field is the local key.
export const SETTINGS_BACKUP_FIELDS = Object.freeze([
  'settings', 'app_stores', 'factory_default_formulas', 'factory_additional_costs',
  'factory_cost_adjustment_factor', 'factory_unit_tracking',
]);
export const REP_PROFILE_KEYS = Object.freeze({ primary: 'repProfile', legacyMirror: 'current_rep_profile', tsKey: 'repProfile_timestamp' });
export const SQLITE_TO_FIRESTORE = Object.freeze(Object.fromEntries(RECORD_STORES.map(s => [s.sqlite, s.collection])));
export const FIRESTORE_TO_SQLITE = Object.freeze(Object.fromEntries(RECORD_STORES.map(s => [s.collection, s.sqlite])));
// True when a backup was written with the current names (older files must be converted first).
export function isCurrentBackup(data) {
  return !!data && typeof data === 'object'
    && Number(data.dataKeyVersion || (data._meta && data._meta.dataKeyVersion) || 0) >= DATA_KEY_VERSION;
}
export const OLD_BACKUP_MESSAGE = 'This backup was made with older key names. Convert it first: node tools/migrate-cloud.mjs --convert-backup <file>';
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
