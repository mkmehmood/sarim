import { buildUnitPools } from './store-keys.js';

const _num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const _arr = (v) => (Array.isArray(v) ? v : []);

// Cost feeds are a cache of the Formula Store, keyed by formula id.
export function feedsFromFormulas(list) {
  const defaults = {};
  const costs = {};
  const adjustment = {};
  _arr(list).forEach((f) => {
    if (!f || !f.id) return;
    const id = String(f.id);
    defaults[id] = _arr(f.ingredients).map((i) => ({ id: i.id, name: i.name, cost: _num(i.cost, 0), quantity: _num(i.quantity, 0) }));
    costs[id] = _num(f.additionalCost, 0);
    adjustment[id] = _num(f.costAdjustmentFactor, 1) || 1;
  });
  return { defaults, costs, adjustment };
}

// Units of a formula, one pool per formula id.
export function computeUnitPools(factory, production) {
  const pools = {};
  const pool = (k) => (pools[k] = pools[k] || { produced: 0, consumed: 0, available: 0, unitCostHistory: [] });
  _arr(factory).forEach((e) => {
    if (!e || !e.store || !(e.units > 0) || !e.formulaType) return;
    const t = pool(e.formulaType);
    t.produced += e.units;
    if (e.totalCost) t.unitCostHistory.push({ date: e.date, costPerUnit: e.totalCost / e.units, units: e.units });
  });
  _arr(production).forEach((e) => {
    if (!e || e.isReturn || !e.formulaStore || !e.formulaUnits) return;
    pool(e.formulaStore).consumed += e.formulaUnits;
  });
  Object.values(pools).forEach((t) => { t.available = Math.max(0, t.produced - t.consumed); });
  return pools;
}

// ---------------------------------------------------------------------------
// One-time migration of data saved before formulas became the only thing that
// pools units. Before, a store pointed at one of two fixed named pools and unit
// totals, cost feeds and records were keyed by those names. Now they are keyed
// by formula id. Pure: returns what to write, writes nothing.
// ---------------------------------------------------------------------------
const OLD_POOLS = ['standard', 'asaan'];
const OLD_LABEL = { standard: 'Standard', asaan: 'Asaan' };
const oldPoolOfStore = (s) => (s && s.formulaType === 'asaan' ? 'asaan' : 'standard');

// Which formula each old pool name meant. The stores' selected formulas win;
// a saved assignment is kept only where a store still uses that formula.
export function legacyPoolFormulas(stores, saved) {
  const st = { standard: (saved && saved.standard) || null, asaan: (saved && saved.asaan) || null };
  const ids = [];
  _arr(stores).forEach((s) => {
    const id = s && (s.formulaId || st[oldPoolOfStore(s)]);
    if (id && !ids.includes(String(id))) ids.push(String(id));
  });
  if (!ids.length) return st;
  const out = { standard: null, asaan: null };
  OLD_POOLS.forEach((k) => { if (st[k] && ids.includes(String(st[k]))) out[k] = st[k]; });
  ids.forEach((id) => {
    if (OLD_POOLS.some((k) => out[k] && String(out[k]) === id)) return;
    const free = OLD_POOLS.find((k) => !out[k]);
    if (free) out[free] = id;
  });
  return out;
}

export function planFormulaPoolMigration(data, now, makeId) {
  const stores0 = _arr(data.stores);
  const formulas = _arr(data.formulas).filter((f) => f && f.id);
  const legacy = legacyPoolFormulas(stores0, data.legacy || data.slots);
  const created = [];
  // A pool that only ever lived in the old cost feed becomes a real formula.
  OLD_POOLS.forEach((k) => {
    if (legacy[k]) return;
    const ing = _arr(data.defaults && data.defaults[k]);
    const needed = stores0.some((s) => !s.formulaId && oldPoolOfStore(s) === k);
    if (!ing.length || !needed) return;
    const f = {
      id: makeId(), name: OLD_LABEL[k],
      ingredients: ing.map((i) => ({ id: i.id, name: i.name, cost: _num(i.cost, 0), quantity: _num(i.quantity, 0) })),
      additionalCost: _num(data.costs && data.costs[k], 0),
      costAdjustmentFactor: _num(data.adjustment && data.adjustment[k], 1) || 1,
      createdAt: now, updatedAt: now,
    };
    created.push(f);
    legacy[k] = f.id;
  });
  const allFormulas = [...formulas, ...created];

  const stores = stores0.map((s) => {
    if (!s) return s;
    const { formulaType, ...rest } = s;
    const id = s.formulaId || legacy[oldPoolOfStore(s)] || null;
    return id ? { ...rest, formulaId: id } : rest;
  });
  const storesChanged = JSON.stringify(stores) !== JSON.stringify(stores0);

  const { storePool } = buildUnitPools(stores);
  // A real store always wins over an old pool name: the ASAAN store's key is also
  // the old pool's name.
  const poolOf = (v) => (v == null || v === '') ? '' : (storePool[v] || ((legacy[v] && OLD_POOLS.includes(v)) ? String(legacy[v]) : String(v)));
  const fix = (rec, field) => {
    if (!rec) return null;
    const source = rec[field] || rec.store;
    if (!source) return null;
    const next = poolOf(source);
    return !next || rec[field] === next ? null : { ...rec, [field]: next, updatedAt: now };
  };
  const pick = (list, field) => _arr(list).map((r) => fix(r, field)).filter(Boolean);

  return {
    legacy,
    stores, storesChanged,
    formulas: allFormulas, formulasChanged: created.length > 0,
    production: pick(data.production, 'formulaStore'),
    factory: pick(data.factory, 'formulaType'),
    feeds: feedsFromFormulas(allFormulas),
  };
}
