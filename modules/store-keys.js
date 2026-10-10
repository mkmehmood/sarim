// Store keys: stable, name-derived identifiers for each store (ZUBAIR -> "zubair",
// MAHMOOD -> "mahmood", ASAAN -> "asaan"). They replaced the positional STORE_A /
// STORE_B / STORE_C codes. A key is generated once, when the store is created, and
// never changes afterwards (renaming a store only changes its display name), so
// every historical record keeps pointing at the right store.
//
// This module is pure (no DOM, no storage) so it can be unit tested and imported by
// the storage layer, the sync code and the backup/restore code alike.

export const SLOT_KEYS = Object.freeze(['standard', 'asaan']);
export const LEGACY_STORE_KEY_RE = /^STORE_[A-Z]$/;
// Record fields that hold a store key.
export const STORE_KEY_FIELDS = Object.freeze(['store', 'supplyStore', 'returnStore', 'transferPeerStore']);
// Where a legacy code maps when the saved catalog carries no information about it.
export const DEFAULT_LEGACY_STORE_MAP = Object.freeze({ STORE_A: 'zubair', STORE_B: 'mahmood', STORE_C: 'asaan' });
export const DEFAULT_STORES = Object.freeze([
  Object.freeze({ key: 'zubair',  name: 'ZUBAIR',  formulaType: 'standard', legacyKey: 'STORE_A' }),
  Object.freeze({ key: 'mahmood', name: 'MAHMOOD', formulaType: 'standard', legacyKey: 'STORE_B' }),
  Object.freeze({ key: 'asaan',   name: 'ASAAN',   formulaType: 'asaan',    legacyKey: 'STORE_C' }),
]);
export const DEFAULT_STORE_KEYS = Object.freeze(DEFAULT_STORES.map(s => s.key));
export function defaultStores() { return DEFAULT_STORES.map(s => ({ ...s })); }
export function isLegacyStoreKey(k) { return typeof k === 'string' && LEGACY_STORE_KEY_RE.test(k); }
// "Gul & Zubair Traders" -> "gul_zubair_traders". Unicode letters (Urdu names) are kept.
export function slugifyStoreName(name) {
  const s = String(name == null ? '' : name).normalize('NFKC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return s || 'store';
}
// Builds a key that is not in `taken` (a Set or array of existing keys). Slot names
// ("standard" / "asaan") are reserved for the formula slots, so a new store never takes
// them unless `allowReserved` is set (used only when the store's formula type is that slot).
export function makeStoreKey(name, taken = [], opts = {}) {
  const used = taken instanceof Set ? taken : new Set(taken);
  let base = slugifyStoreName(name);
  if (!opts.allowReserved && SLOT_KEYS.includes(base)) base += '_store';
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}
// Turns a saved catalog that still has STORE_x keys into one with name-derived keys.
// Returns { stores, map, changed } where map is { STORE_A: 'zubair', ... }.
export function planStoreCatalogMigration(stores) {
  const list = Array.isArray(stores) ? stores.filter(s => s && typeof s === 'object') : [];
  const taken = new Set(list.map(s => s.key).filter(k => k && !isLegacyStoreKey(k)));
  const map = {};
  let changed = false;
  const out = list.map(s => {
    if (!isLegacyStoreKey(s.key)) return { ...s };
    const allowReserved = (s.formulaType || 'standard') === slugifyStoreName(s.name);
    const key = makeStoreKey(s.name, taken, { allowReserved });
    taken.add(key);
    map[s.key] = key;
    changed = true;
    return { ...s, key, legacyKey: s.key };
  });
  return { stores: out, map, changed };
}
// { STORE_A: 'zubair', ... } for a catalog that is already migrated (carries legacyKey).
export function buildLegacyKeyMap(stores) {
  const list = Array.isArray(stores) ? stores : [];
  const map = {};
  const keys = new Set(list.map(s => s && s.key));
  for (const s of list) {
    if (s && s.key && isLegacyStoreKey(s.legacyKey)) map[s.legacyKey] = s.key;
  }
  for (const [legacy, key] of Object.entries(DEFAULT_LEGACY_STORE_MAP)) {
    if (map[legacy]) continue;
    if (!list.length || keys.has(key)) map[legacy] = key;
  }
  return map;
}
// Legacy map for any catalog, migrated or not (also used when restoring an old backup).
export function legacyMapForCatalog(stores) {
  const list = Array.isArray(stores) ? stores : [];
  const plan = planStoreCatalogMigration(list);
  return { ...buildLegacyKeyMap(list), ...plan.map };
}
// ---- the map used by the storage layer to normalise anything that is written ----
let _activeMap = { ...DEFAULT_LEGACY_STORE_MAP };
export function setActiveLegacyStoreMap(map) { _activeMap = { ...DEFAULT_LEGACY_STORE_MAP, ...(map || {}) }; }
export function getActiveLegacyStoreMap() { return _activeMap; }
export function resolveStoreKey(value, map = _activeMap) {
  return (typeof value === 'string' && isLegacyStoreKey(value) && map[value]) ? map[value] : value;
}
// Rewrites store-key fields in place (records may nest, e.g. merged records). Returns the number of fields changed.
export function remapStoreKeysDeep(node, map = _activeMap, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return 0;
  let n = 0;
  if (Array.isArray(node)) {
    for (const item of node) n += remapStoreKeysDeep(item, map, depth + 1);
    return n;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === 'string') {
      if (STORE_KEY_FIELDS.includes(k) && isLegacyStoreKey(v) && map[v]) { node[k] = map[v]; n++; }
    } else if (v && typeof v === 'object') {
      n += remapStoreKeysDeep(v, map, depth + 1);
    }
  }
  return n;
}
// settings.production is keyed by store: { STORE_A: { cost, sale } } -> { zubair: { cost, sale } }
export function remapSettingsStoreKeys(settings, map = _activeMap) {
  if (!settings || typeof settings !== 'object' || !settings.production || typeof settings.production !== 'object') return 0;
  let n = 0;
  for (const legacy of Object.keys(settings.production)) {
    const next = isLegacyStoreKey(legacy) ? map[legacy] : null;
    if (!next || next === legacy) continue;
    if (settings.production[next] === undefined) settings.production[next] = settings.production[legacy];
    delete settings.production[legacy];
    n++;
  }
  return n;
}
// ui_state remembers the last selected stores.
export function remapUiStateStoreKeys(ui, map = _activeMap) {
  if (!ui || typeof ui !== 'object') return 0;
  let n = 0;
  for (const f of ['currentStore', 'currentFactoryEntryStore']) {
    const next = resolveStoreKey(ui[f], map);
    if (next !== ui[f]) { ui[f] = next; n++; }
  }
  return n;
}
// Normalises a catalog being written: STORE_x keys become name-derived keys, legacyKey is kept.
// Also refreshes the active map. Returns the (possibly new) array; the input is not mutated.
export function normaliseStoreCatalog(stores) {
  if (!Array.isArray(stores)) return stores;
  const plan = planStoreCatalogMigration(stores);
  setActiveLegacyStoreMap({ ...buildLegacyKeyMap(plan.stores), ...plan.map });
  return plan.changed ? plan.stores : stores;
}
export const STORE_KEYS_MIGRATION_FLAG = 'migration_store_keys_v2';
// One-time, per-user migration of everything that stores a store key. `store` is any
// { get(key), set(key, value) }. Idempotent: it only rewrites what still has a legacy key,
// and it does not bump record timestamps (the sync layer normalises legacy keys on ingest,
// so cloud copies upgrade lazily the next time a record is edited).
export async function migrateStoreKeys(store, recordKeys) {
  const report = { alreadyDone: false, catalog: 0, records: {}, settings: 0, ui: 0, map: {} };
  const saved = await store.get('app_stores');
  const plan = planStoreCatalogMigration(saved);
  const map = { ...buildLegacyKeyMap(plan.stores), ...plan.map };
  // Always load the legacy map, so a legacy key arriving later (an un-updated device, an old
  // backup) is still resolved to the right store.
  setActiveLegacyStoreMap(map);
  report.map = map;
  if (await store.get(STORE_KEYS_MIGRATION_FLAG)) { report.alreadyDone = true; return report; }
  if (Array.isArray(saved) && plan.changed) {
    await store.set('app_stores', plan.stores);
    report.catalog = Object.keys(plan.map).length;
  }
  for (const key of recordKeys || []) {
    const arr = await store.get(key);
    if (!Array.isArray(arr) || !arr.length) continue;
    const n = remapStoreKeysDeep(arr, map);
    if (n > 0) { await store.set(key, arr); report.records[key] = n; }
  }
  const settings = await store.get('naswar_default_settings');
  if (settings && remapSettingsStoreKeys(settings, map) > 0) { await store.set('naswar_default_settings', settings); report.settings = 1; }
  const ui = await store.get('ui_state');
  if (ui && remapUiStateStoreKeys(ui, map) > 0) { await store.set('ui_state', ui); report.ui = 1; }
  await store.set(STORE_KEYS_MIGRATION_FLAG, Date.now());
  return report;
}
// ---- synchronous catalog helpers (the UI layer registers the loaded catalog here) ----
let _catalog = null;
export function setStoreCatalogCache(list) { _catalog = Array.isArray(list) && list.length ? list : null; }
function _stores() { return _catalog || DEFAULT_STORES; }
// The store pre-selected on a fresh form: the first store of the catalog.
export function getDefaultStoreKey() { return (_stores()[0] || DEFAULT_STORES[0]).key; }
// Display name for a store key; also understands a legacy STORE_x code.
export function storeLabelFor(key, list = _stores()) {
  if (!key) return '';
  const hit = list.find(s => s.key === key) || list.find(s => s.legacyKey === key)
    || DEFAULT_STORES.find(s => s.key === key || s.legacyKey === key);
  return hit ? hit.name : key;
}
// Formula type ("standard" | "asaan") of a store; a store whose key is a slot name is that slot.
export function formulaTypeFor(key, list = _stores()) {
  const hit = list.find(s => s.key === key) || list.find(s => s.legacyKey === key)
    || DEFAULT_STORES.find(s => s.key === key || s.legacyKey === key);
  if (hit && hit.formulaType) return hit.formulaType;
  return SLOT_KEYS.includes(key) ? key : 'standard';
}
