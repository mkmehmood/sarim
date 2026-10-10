// ONE name per dataset, used everywhere: the local database key, the Firestore collection, the
// backup/restore field and the delta-sync name.
//   production  production entries        sales      customer sales        calculator  calculator history
//   rep         rep sales                 clients    rep customers         customers   sales customers
//   transactions payments                 entities   payment entities      inventory   raw material / stock
//   factory     factory production        expenses   expenses              returns     stock returns
// Support data uses the same rule (one single word, same string locally, in the cloud and in backups):
//   deletions (recycle-bin records)  deleted (their ids)  photos (+ photostamps)  theme
//   Firestore docs: stores/list  formulas/config  categories/list  activity
// Backups carry DATA_KEY_VERSION so a file written with older names is recognised and refused
// (convert it first with tools/migrate-cloud.mjs --convert-backup).
export const DATA_KEY_VERSION = 5;
// One row per dataset. Everything that names a dataset reads it from here, so the names cannot drift:
//   key      local SQLite key = Firestore collection = backup field = delta-sync name
//   jsVar    the in-memory JS variable the app holds the records in
//   label    the name shown to the person (sync tab, data viewer, dialogs)
//   tab      the app tab the dataset belongs to (a TABS key)
//   desc     one-line description for the data viewer
const rec = (key, jsVar, label, tab, desc) => ({ key, sqlite: key, collection: key, backup: key, jsVar, label, tab, desc });
export const RECORD_STORES = Object.freeze([
  rec('production',   'db',                        'Production',           'production', 'Factory production batches'),
  rec('sales',        'customerSales',             'Customer Sales',       'sales',      'Direct customer sales'),
  rec('calculator',   'salesHistory',              'Calculator History',   'calculator', 'Daily calculator / ledger entries'),
  rec('rep',          'repSales',                  'Rep Sales',            'rep',        'Rep sales to customers'),
  rec('clients',      'repCustomers',              'Rep Customers',        'rep',        'Rep customer contact registry'),
  rec('customers',    'salesCustomers',            'Sales Customers',      'sales',      'Sales tab customer contacts'),
  rec('transactions', 'paymentTransactions',       'Payment Transactions', 'payments',   'Cash & entity payment transactions'),
  rec('entities',     'paymentEntities',           'Payment Entities',     'payments',   'Payment entity accounts'),
  rec('inventory',    'factoryInventoryData',      'Factory Inventory',    'factory',    'Raw material inventory'),
  rec('factory',      'factoryProductionHistory',  'Factory History',      'factory',    'Factory batch production history'),
  rec('expenses',     'expenseRecords',            'Expenses',             'payments',   'Expense entries'),
  rec('returns',      'stockReturns',              'Stock Returns',        'production', 'Stock return records'),
].map(Object.freeze));
// App tabs. `id` is the tab key used by showTab()/sidebarNav() and the nav button (snav-<id>);
// `syncFn` is the refresh function the sync tab calls; `inProgressKey` is the re-entrancy guard name.
export const TABS = Object.freeze([
  { name: 'production', id: 'prod',     syncFn: 'syncProductionTab' },
  { name: 'sales',      id: 'sales',    syncFn: 'syncSalesTab' },
  { name: 'calculator', id: 'calc',     syncFn: 'syncCalculatorTab' },
  { name: 'factory',    id: 'factory',  syncFn: 'syncFactoryTab' },
  { name: 'payments',   id: 'payments', syncFn: 'syncPaymentsTab' },
  { name: 'rep',        id: 'rep',      syncFn: 'syncRepTab' },
].map(Object.freeze));
export const TAB_BY_NAME = Object.freeze(Object.fromEntries(TABS.map(t => [t.name, t])));
export const DATASET_BY_KEY = Object.freeze(Object.fromEntries(RECORD_STORES.map(s => [s.key, s])));
// Standard button wording: Save <Noun> (create), Update <Noun> (edit), Delete <Noun> (soft delete to the
// recycle bin), Restore <Noun> (bring back from the recycle bin), Delete Forever (purge).
export const ACTION_LABELS = Object.freeze({ save: 'Save', update: 'Update', delete: 'Delete', restore: 'Restore', purge: 'Delete Forever' });
export const actionLabel = (action, noun = '') => `${ACTION_LABELS[action]}${noun ? ' ' + noun : ''}`;
export const RECORD_KEYS = Object.freeze(RECORD_STORES.map(s => s.key));
export const AUX_STATE = Object.freeze([
  {
    sqlite: 'categories',
    tsKey: 'categories_timestamp',
    backup: 'categories',
    firestore: { doc: 'categories/list', field: 'categories', tsField: 'categories_timestamp' },
    kind: 'list',
  },
  {
    sqlite: 'formulas',
    tsKey: 'formulas_timestamp',
    backup: 'formulas',
    firestore: { doc: 'formulas/config', field: 'formulas', tsField: 'formulas_timestamp' },
    kind: 'idList',
  },
  {
    sqlite: 'slots',
    tsKey: 'slots_timestamp',
    backup: 'slots',
    firestore: { doc: 'formulas/config', field: 'slots', tsField: 'slots_timestamp' },
    kind: 'slots',
  },
]);
// Settings-like backup fields: the backup field is the local key.
export const SETTINGS_BACKUP_FIELDS = Object.freeze([
  'settings', 'stores', 'defaults', 'costs',
  'adjustment', 'tracking',
]);
// Support stores that are not record lists. Same name locally (SQLite), in Firestore and in backups.
export const SUPPORT_STORES = Object.freeze({
  tombstones:   Object.freeze({ sqlite: 'deletions', collection: 'deletions' }),
  tombstoneIds: Object.freeze({ sqlite: 'deleted' }),
  photos:       Object.freeze({ sqlite: 'photos', collection: 'photos', timestamps: 'photostamps', dirtyKeys: 'photodirty' }),
  theme:        Object.freeze({ sqlite: 'theme' }),
});
// Firestore documents/collections that are not record lists.
export const FIRESTORE_SUPPORT_PATHS = Object.freeze({
  appStores: 'stores/list', factorySettings: 'formulas/config',
  expenseCategories: 'categories/list', activityLog: 'activity',
  accounts: 'settings/accounts', device: 'devices/device',
});
export const REP_PROFILE_KEYS = Object.freeze({ primary: 'repProfile', legacyMirror: 'profile', tsKey: 'repProfile_timestamp' });
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
  out.photos = (await store.get('photos')) || {};
  out.photostamps = (await store.get('photostamps')) || {};
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
