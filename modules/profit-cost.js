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
    const cost = _n(p.totalCost);
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
