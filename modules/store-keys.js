export const STORE_KEY_FIELDS = Object.freeze(['store', 'supplyStore', 'returnStore', 'transferPeerStore']);

export const DEFAULT_STORES = Object.freeze([
  Object.freeze({ key: 'zubair',  name: 'ZUBAIR' }),
  Object.freeze({ key: 'mahmood', name: 'MAHMOOD' }),
  Object.freeze({ key: 'asaan',   name: 'ASAAN' }),
]);

export const DEFAULT_STORE_KEYS = Object.freeze(DEFAULT_STORES.map(s => s.key));
export function defaultStores() { return DEFAULT_STORES.map(s => ({ ...s })); }

export function slugifyStoreName(name) {
  const s = String(name == null ? '' : name).normalize('NFKC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return s || 'store';
}

export function makeStoreKey(name, taken = []) {
  const used = taken instanceof Set ? taken : new Set(taken);
  const base = slugifyStoreName(name);
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

let _catalog = null;
export function setStoreCatalogCache(list) { _catalog = Array.isArray(list) && list.length ? list : null; }
function _stores() { return _catalog || DEFAULT_STORES; }
export function getDefaultStoreKey() { return (_stores()[0] || DEFAULT_STORES[0]).key; }

export function storeLabelFor(key, list = _stores()) {
  if (!key) return '';
  const hit = list.find(s => s.key === key);
  return hit ? hit.name : key;
}

// A store's formula is the one it selected (store.formulaId). Units are pooled
// per formula: every store using the same formula shares one pool, keyed by the
// formula id, so one store can never show units another store using the very
// same formula cannot see.
export function formulaIdOf(store) {
  return store && store.formulaId ? String(store.formulaId) : '';
}

export function buildUnitPools(stores) {
  const storePool = {};
  (stores || []).forEach(s => { if (s && s.key && formulaIdOf(s)) storePool[s.key] = formulaIdOf(s); });
  // A store key resolves to its formula's pool; anything else is taken as a pool
  // key already (a stored record that carries its formula id).
  const poolOf = (v) => (v == null || v === '') ? '' : (storePool[v] || String(v));
  return { storePool, poolOf };
}

export const BUILTIN_BADGE_CLASSES = Object.freeze({ zubair: 'store-zubair', mahmood: 'store-mahmood', asaan: 'store-asaan' });
export const CUSTOM_BADGE_CLASSES = Object.freeze(['store-custom-1', 'store-custom-2']);

export function storeBadgeClass(key, list = _stores()) {
  if (BUILTIN_BADGE_CLASSES[key]) return BUILTIN_BADGE_CLASSES[key];
  const customs = list.filter(s => s && !BUILTIN_BADGE_CLASSES[s.key]);
  const i = customs.findIndex(s => s.key === key);
  return i >= 0 ? CUSTOM_BADGE_CLASSES[i % CUSTOM_BADGE_CLASSES.length] : BUILTIN_BADGE_CLASSES.asaan;
}
