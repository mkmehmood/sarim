export const REP_DATA_STORES = Object.freeze(['rep', 'sales', 'clients', 'transactions', 'expenses', 'returns']);
const REP_FIELDS = Object.freeze(['salesRep', 'seller']);

export function repKey(name) {
  return String(name || '').trim().toUpperCase();
}

export function repDataCount(name, stores) {
  const key = repKey(name);
  if (!key) return 0;
  let n = 0;
  for (const store of REP_DATA_STORES) {
    const rows = stores && Array.isArray(stores[store]) ? stores[store] : [];
    for (const r of rows) {
      if (r && REP_FIELDS.some(f => repKey(r[f]) === key)) n++;
    }
  }
  return n;
}

export function withoutRep(list, name) {
  const key = repKey(name);
  const src = Array.isArray(list) ? list : [];
  return src.filter(r => repKey(r) !== key);
}

export function repRemovalPlan(name, stores, list) {
  const count = repDataCount(name, stores);
  const listed = (Array.isArray(list) ? list : []).some(r => repKey(r) === repKey(name));
  return { blocked: count > 0, count, remove: count === 0 && listed };
}
