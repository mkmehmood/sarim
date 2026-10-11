export const SLOT_KEYS = Object.freeze(['standard', 'asaan']);
export const STORE_KEY_FIELDS = Object.freeze(['store', 'supplyStore', 'returnStore', 'transferPeerStore']);
export const DEFAULT_STORES = Object.freeze([
  Object.freeze({ key: 'zubair',  name: 'ZUBAIR',  formulaType: 'standard' }),
  Object.freeze({ key: 'mahmood', name: 'MAHMOOD', formulaType: 'standard' }),
  Object.freeze({ key: 'asaan',   name: 'ASAAN',   formulaType: 'asaan' }),
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
  let base = slugifyStoreName(name);
  if (SLOT_KEYS.includes(base)) base += '_store';
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
export function formulaTypeFor(key, list = _stores()) {
  const hit = list.find(s => s.key === key);
  if (hit && hit.formulaType) return hit.formulaType;
  return SLOT_KEYS.includes(key) ? key : 'standard';
}
export const BUILTIN_BADGE_CLASSES = Object.freeze({ zubair: 'store-zubair', mahmood: 'store-mahmood', asaan: 'store-asaan' });
export const CUSTOM_BADGE_CLASSES = Object.freeze(['store-custom-1', 'store-custom-2']);
export function storeBadgeClass(key, list = _stores()) {
  if (BUILTIN_BADGE_CLASSES[key]) return BUILTIN_BADGE_CLASSES[key];
  const customs = list.filter(s => s && !BUILTIN_BADGE_CLASSES[s.key]);
  const i = customs.findIndex(s => s.key === key);
  return i >= 0 ? CUSTOM_BADGE_CLASSES[i % CUSTOM_BADGE_CLASSES.length] : BUILTIN_BADGE_CLASSES.asaan;
}
