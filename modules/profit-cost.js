const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _arr = (v) => (Array.isArray(v) ? v : []);
const _r2 = (v) => Math.round((_n(v) + Number.EPSILON) * 100) / 100;
export function buildCostIndex(production) {
  const byStoreDate = new Map();
  const byStore = new Map();
  const add = (map, key, net, cost) => {
    const cur = map.get(key) || { net: 0, cost: 0 };
    cur.net += net;
    cur.cost += cost;
    map.set(key, cur);
  };
  _arr(production).forEach((p) => {
    if (!p || p.deletedAt || p.isReturn) return;
    const net = _n(p.net);
    const cost = _n(p.totalCost) > 0 ? _n(p.totalCost) : _n(p.cp) * net;
    if (!(net > 0) || !(cost > 0) || !p.store) return;
    add(byStore, p.store, net, cost);
    if (p.date && !p.isMerged) add(byStoreDate, `${p.store}|${p.date}`, net, cost);
  });
  return { byStoreDate, byStore };
}
export function costPerKgFromIndex(index, store, date) {
  if (!index || !store) return 0;
  const perKg = (e) => (e && e.net > 0 ? e.cost / e.net : 0);
  const dated = date ? perKg(index.byStoreDate.get(`${store}|${date}`)) : 0;
  if (dated > 0) return dated;
  return perKg(index.byStore.get(store));
}
export function saleCostDate(rec) { return (rec && (rec.supplyDate || rec.date)) || ''; }
export function costSourceFromIndex(index, store, date) {
  if (!index || !store) return { perKg: 0, source: 'none' };
  const perKg = (e) => (e && e.net > 0 ? e.cost / e.net : 0);
  const dated = date ? perKg(index.byStoreDate.get(`${store}|${date}`)) : 0;
  if (dated > 0) return { perKg: dated, source: 'production-day' };
  const avg = perKg(index.byStore.get(store));
  return avg > 0 ? { perKg: avg, source: 'store-average' } : { perKg: 0, source: 'none' };
}
export function repriceSale(rec, costPerKg) {
  const qty = _n(rec.quantity);
  const totalCost = _r2(qty * costPerKg);
  const totalValue = _n(rec.totalValue);
  return { totalCost, profit: _r2(totalValue - totalCost) };
}
export function repriceCalc(rec, costPerKg) {
  const net = Math.max(0, _n(rec.totalSold) - _n(rec.returned) - _n(rec.expired) - _n(rec.shared));
  const totalCost = _r2(net * costPerKg);
  return { costPrice: _r2(costPerKg), totalCost, profit: _r2(_n(rec.revenue) - totalCost) };
}
export function isCostedSale(rec) {
  if (!rec || rec.deletedAt || rec.isMerged || rec.isCollection || rec.isRepTransfer) return false;
  if (rec.paymentType === 'COLLECTION' || rec.paymentType === 'PARTIAL_PAYMENT') return false;
  if (rec.transactionType === 'OLD_DEBT') return false;
  return _n(rec.quantity) > 0;
}

export function kgPerUnitFromProduction(production, store, formulaId) {
  let net = 0;
  let units = 0;
  _arr(production).forEach((p) => {
    if (!p || p.deletedAt || p.isReturn || p.isMerged) return;
    if (!(_n(p.net) > 0) || !(_n(p.formulaUnits) > 0)) return;
    const same = (formulaId && p.formulaId === formulaId) || (store && p.store === store);
    if (!same) return;
    net += _n(p.net);
    units += _n(p.formulaUnits);
  });
  return units > 0 ? net / units : 0;
}
export function formulaCostPerKg(costPerUnit, kgPerUnit) {
  return _n(costPerUnit) > 0 && _n(kgPerUnit) > 0 ? _n(costPerUnit) / _n(kgPerUnit) : 0;
}
export function planProductionDayReprice(records, production, store, date) {
  const index = buildCostIndex(production);
  const realized = costSourceFromIndex(index, store, date);
  const fixed = [];
  if (realized.source !== 'production-day' || !store || !date) return { fixed, perKg: 0 };
  _arr(records).forEach((rec) => {
    if (!isCostedSale(rec) || rec.supplyStore !== store || saleCostDate(rec) !== date) return;
    const next = repriceSale(rec, realized.perKg);
    if (Math.abs(next.totalCost - _n(rec.totalCost)) < 0.01 && Math.abs(next.profit - _n(rec.profit)) < 0.01 && rec.costSource === 'production-day') return;
    fixed.push({ id: rec.id, totalCost: next.totalCost, profit: next.profit, costPerKg: _r2(realized.perKg), costSource: 'production-day' });
  });
  return { fixed, perKg: realized.perKg };
}
