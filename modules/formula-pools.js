import './store-keys.js';

const _num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const _arr = (v) => (Array.isArray(v) ? v : []);

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

export function computeUnitPools(factory, production) {
  const pools = {};
  const pool = (k) => (pools[k] = pools[k] || { produced: 0, consumed: 0, available: 0, unitCostHistory: [] });
  _arr(factory).forEach((e) => {
    if (!e || !e.store || !(e.units > 0) || !e.formulaId) return;
    const t = pool(e.formulaId);
    t.produced += e.units;
    if (e.totalCost) t.unitCostHistory.push({ date: e.date, costPerUnit: e.totalCost / e.units, units: e.units });
  });
  _arr(production).forEach((e) => {
    if (!e || e.isReturn || !e.formulaId || !e.formulaUnits) return;
    pool(e.formulaId).consumed += e.formulaUnits;
  });
  Object.values(pools).forEach((t) => { t.available = Math.max(0, t.produced - t.consumed); });
  return pools;
}
