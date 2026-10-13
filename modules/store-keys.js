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

// Units are pooled per formula. Slots/stores that point at the same formula
// must share one pool, otherwise one store can show plenty of units while
// another using the very same formula shows none.
export function unitPoolKey(type, formulaId, slots) {
  const t = type === 'asaan' ? 'asaan' : 'standard';
  const sl = slots || {};
  const fid = formulaId || sl[t];
  if (!fid) return t;
  for (const k of SLOT_KEYS) if (sl[k] && String(sl[k]) === String(fid)) return k;
  return t;
}

// The stores' selected formulas are the single source of truth. The saved
// slot assignment is only a hint that keeps unit tracking stable: it is kept
// where a store still uses that formula, dropped where none does, and any
// store formula without a slot takes a free one. Never read raw slots to
// decide which formula a store uses.
export function deriveSlots(stores, stored) {
  const st = { standard: (stored && stored.standard) || null, asaan: (stored && stored.asaan) || null };
  const ids = [];
  (stores || []).forEach(s => {
    const id = s && (s.formulaId || st[s.formulaType === 'asaan' ? 'asaan' : 'standard']);
    if (id && !ids.includes(String(id))) ids.push(String(id));
  });
  if (!ids.length) return st;
  const out = { standard: null, asaan: null };
  SLOT_KEYS.forEach(k => { if (st[k] && ids.includes(String(st[k]))) out[k] = st[k]; });
  ids.forEach(id => {
    if (SLOT_KEYS.some(k => out[k] && String(out[k]) === id)) return;
    const free = SLOT_KEYS.find(k => !out[k]);
    if (free) out[free] = id;
  });
  return out;
}

export function buildUnitPools(stores, slots) {
  const sl = { standard: (slots && slots.standard) || null, asaan: (slots && slots.asaan) || null };
  const storePool = {};
  (stores || []).forEach(s => { storePool[s.key] = unitPoolKey(s.formulaType, s.formulaId, sl); });
  const slotPool = { standard: unitPoolKey('standard', null, sl), asaan: unitPoolKey('asaan', null, sl) };
  // A real store always wins: the ASAAN store's key 'asaan' is also a slot name,
  // but its formula is the one selected on the store, not the 'asaan' slot.
  const poolOf = (v) => storePool[v] || ((v === 'standard' || v === 'asaan') ? slotPool[v] : unitPoolKey(formulaTypeFor(v), null, sl));
  return { slots: sl, storePool, slotPool, poolOf };
}

export const BUILTIN_BADGE_CLASSES = Object.freeze({ zubair: 'store-zubair', mahmood: 'store-mahmood', asaan: 'store-asaan' });
export const CUSTOM_BADGE_CLASSES = Object.freeze(['store-custom-1', 'store-custom-2']);

export function storeBadgeClass(key, list = _stores()) {
  if (BUILTIN_BADGE_CLASSES[key]) return BUILTIN_BADGE_CLASSES[key];
  const customs = list.filter(s => s && !BUILTIN_BADGE_CLASSES[s.key]);
  const i = customs.findIndex(s => s.key === key);
  return i >= 0 ? CUSTOM_BADGE_CLASSES[i % CUSTOM_BADGE_CLASSES.length] : BUILTIN_BADGE_CLASSES.asaan;
}
