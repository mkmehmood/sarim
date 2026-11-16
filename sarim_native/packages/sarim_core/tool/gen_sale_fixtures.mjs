// Differential fixtures for sale validation/pricing. Stock loops, price lookup and ordering of checks are the
// body of saveCustomerSale / getEffectiveSalePriceForCustomer (web); cost comes from the web's profit-cost.js.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCostIndex, costPerKgFromIndex } from '../../../../modules/profit-cost.js';
import { resolveSelectedFormula } from '../../../../modules/link-graph.js';
import { feedsFromFormulas } from '../../../../modules/formula-pools.js';
import { buildUnitPools } from '../../../../modules/store-keys.js';

// resolveLiveCost, verbatim from modules/factory-core.js
function resolveLiveCost(item, inventory) {
  const list = Array.isArray(inventory) ? inventory : [];
  let live = list.find(i => String(i.id) === String(item.id));
  if (!live && item.name) live = list.find(i => i.name && i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
  const c = live ? Number(live.cost) : NaN;
  return Number.isFinite(c) && c > 0 ? c : (Number(item.cost) || 0);
}
// calculateSalesCostPerKg, verbatim apart from reading its inputs from arguments instead of storage
function calcFormulaCost(store, stores, formulas, inventory) {
  const formulaId = buildUnitPools(stores).poolOf(store);
  const adjustmentMap = feedsFromFormulas(formulas).adjustment;
  const sel = resolveSelectedFormula({ list: formulas, stores, inventory }, formulaId);
  const formula = sel && Array.isArray(sel.ingredients) ? sel.ingredients : [];
  if (formula.length === 0) return 0;
  let rawMaterialCost = 0;
  formula.forEach(item => { rawMaterialCost += (resolveLiveCost(item, inventory) * item.quantity); });
  const additionalCost = Number(sel.additionalCost) || 0;
  const adjustmentFactor = adjustmentMap[formulaId] || 1;
  return adjustmentFactor > 0 ? (rawMaterialCost + additionalCost) / adjustmentFactor : rawMaterialCost + additionalCost;
}

const here = dirname(fileURLToPath(import.meta.url));
let seed = 13579;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const _rng = mulberry32(seed);
const rnd = (n) => Math.floor(_rng() * n);
const day = (n) => `2026-10-${String(1 + (n % 5)).padStart(2, '0')}`;
const STORES = ['zubair', 'mahmood', 'asaan'];

function evaluate({ date, name, quantity, store, production, returns, sales, customers, stores, formulas, inventory }) {
  if (!date) return { issue: 'noDate' };
  if (!name) return { issue: 'noName' };
  if (quantity <= 0) return { issue: 'badQuantity' };
  let storeSpecificProduction = 0;
  production.forEach((p) => { if (p.isReturn) return; if (p.date === date && p.store === store) storeSpecificProduction += p.net || 0; });
  let storeSpecificSales = 0;
  sales.forEach((s) => { const eff = s.supplyDate || s.date; if (eff === date && s.supplyStore === store) storeSpecificSales += s.quantity || 0; });
  let storeReturns = 0;
  returns.forEach((r) => { if (r.date === date && r.store === store) storeReturns += r.quantity || 0; });
  const total = storeSpecificProduction + storeReturns;
  const avail = total - storeSpecificSales;
  if (total === 0) return { issue: 'noProduction' };
  const remaining = avail - quantity;
  if (remaining < -1e-6) return { issue: 'insufficientStock', available: avail };
  const perKg = costPerKgFromIndex(buildCostIndex(production), store, date) || calcFormulaCost(store, stores, formulas, inventory) || 0;
  let price = 0;
  const reg = customers.find((c) => c && c.name && c.name.toLowerCase() === String(name).toLowerCase());
  if (reg && reg.customSalePrice > 0) price = reg.customSalePrice;
  else { const e = stores.find((s) => s.key === store); price = e && e.salePrice > 0 ? e.salePrice : 0; }
  if (!price || price <= 0) return { issue: 'noPrice' };
  const totalValue = quantity * price, totalCost = quantity * perKg;
  return { issue: null, unitPrice: price, totalValue, totalCost, profit: totalValue - totalCost, available: avail };
}

const cases = [];
for (let i = 0; i < 600; i++) {
  const production = [], returns = [], sales = [];
  for (let k = 0; k < rnd(6); k++) {
    const net = 50 + rnd(500);
    const rec = { id: 'p' + k, date: day(rnd(5)), store: STORES[rnd(3)], net, totalCost: rnd(8) === 0 ? 0 : net * (20 + rnd(60)) };
    if (rnd(10) === 0) rec.isReturn = true;
    if (rnd(12) === 0) rec.deletedAt = 5;
    if (rnd(12) === 0) rec.isMerged = true;
    production.push(rec);
  }
  for (let k = 0; k < rnd(3); k++) returns.push({ id: 'r' + k, date: day(rnd(5)), store: STORES[rnd(3)], quantity: 5 + rnd(40) });
  for (let k = 0; k < rnd(5); k++) {
    const d = day(rnd(5));
    const s = { id: 's' + k, date: day(rnd(5)), supplyStore: STORES[rnd(3)], quantity: 1 + rnd(60) };
    if (rnd(2)) s.supplyDate = d;
    sales.push(s);
  }
  const FIDS = ['f1', 'f2', 'f3'];
  const stores = STORES.map((key, ix) => ({ key, name: key.toUpperCase(), salePrice: rnd(6) === 0 ? 0 : 60 + rnd(80), ...(rnd(5) === 0 ? {} : { formulaId: rnd(4) === 0 ? key : FIDS[ix] }) }));
  const inventory = [];
  for (let k = 0; k < 5; k++) inventory.push({ id: 'i' + k, name: ['Corn', 'Soya', ' Wheat ', 'Rice', 'Oil'][k], cost: rnd(6) === 0 ? 0 : 10 + rnd(50), quantity: 100, ...(rnd(8) === 0 ? { deletedAt: 3 } : {}) });
  const formulas = [];
  for (let k = 0; k < 3; k++) {
    if (rnd(8) === 0) continue;
    const ings = [];
    for (let j = 0; j < 1 + rnd(4); j++) {
      const pick = inventory[rnd(5)];
      ings.push({ id: rnd(4) === 0 ? 'gone' + j : pick.id, name: rnd(3) === 0 ? pick.name.toUpperCase() : pick.name, quantity: rnd(6) === 0 ? '0.5' : 0.1 + rnd(9) / 10, cost: rnd(3) === 0 ? 0 : 5 + rnd(40) });
    }
    formulas.push({ id: FIDS[k], name: 'F' + k, ingredients: ings, additionalCost: rnd(3) === 0 ? 0 : rnd(20), ...(rnd(2) ? { costAdjustmentFactor: [0.5, 0.8, 1, 1.2, 0, 2][rnd(6)] } : {}) });
  }
  const names = ['Ali', 'ali', 'Bilal', 'Cara', 'Ali', 'Bilal', 'Cara', ''];
  const name = names[rnd(8)];
  const customers = [{ name: 'Ali', customSalePrice: rnd(3) === 0 ? 55 + rnd(30) : 0 }, { name: 'Bilal' }];
  const date = day(rnd(5)), store = STORES[rnd(3)];
  if (rnd(100) < 88) { const net = 200 + rnd(400); production.push({ id: 'pm', date, store, net, totalCost: rnd(3) === 0 ? 0 : net * (30 + rnd(50)) }); }
  if (rnd(100) < 25) returns.push({ id: 'rm', date, store, quantity: 10 + rnd(40) });
  const input = { date: rnd(40) === 0 ? '' : date, name, quantity: rnd(40) === 0 ? 0 : 1 + rnd(rnd(4) === 0 ? 700 : 150) + (rnd(2) ? 0.5 : 0), store, production, returns, sales, customers, stores, formulas, inventory };
  cases.push({ input, expected: evaluate(input) });
}
const counts = {};
cases.forEach((c) => { const k = c.expected.issue || 'ok'; counts[k] = (counts[k] || 0) + 1; });
writeFileSync(join(here, '..', 'test', 'fixtures', 'sale_cases.json'), JSON.stringify({ cases }));
console.log('wrote', cases.length, 'sale scenarios', JSON.stringify(counts));
