import { stampGroup, weightedUnitPrice } from './link-graph.js';
import { ensureArray, ensureRecordIntegrity, esc, fmtAmt, fmtNum, getTimestamp, localDateStr, lockedSaleValue, round2, sqliteStore, readNum, loadCollections } from './business.js';
import { unifiedDelete, unifiedSave } from './sync.js';
import { _refreshSupplierLinkViews, triggerAutoSync, updatePaymentStatusVisibility } from './utilities-core.js';
import { getAppStores, getStorePool, refreshUI, updateFactorySummaryCard, updateFactoryUnitsAvailableStats } from './utilities-sales.js';
import { formatCurrency, safeValue } from './utilities-payments.js';
import { showToast } from './customers.js';
import { getFormulaNames, getSelectedFormula } from './formula-store.js';
import { computeUnitPools } from './formula-pools.js';
import { buildCostIndex, costPerKgFromIndex } from './profit-cost.js';
import { getDefaultStoreKey } from './store-keys.js';
import { registerEditHandler } from './edit-mode.js';

export function resolveLiveCost(item, inventory) {
const list = Array.isArray(inventory) ? inventory : [];
let live = list.find(i => String(i.id) === String(item.id));
if (!live && item.name) live = list.find(i => i.name && i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
const c = live ? Number(live.cost) : NaN;
return Number.isFinite(c) && c > 0 ? c : (Number(item.cost) || 0);
}
export async function getCostPerUnit(storeType) {
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
const inventory = ensureArray(await sqliteStore.get('inventory'));
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const formula = factoryDefaultFormulas[storeType];
const additionalCost = factoryAdditionalCosts[storeType] || 0;
if (formula && formula.length > 0) {
let totalMaterialCost = 0;
formula.forEach(item => {
const liveItem = Array.isArray(inventory) ? inventory.find(i => String(i.id) === String(item.id)) : null;
const unitCost = liveItem ? (liveItem.cost || item.cost || 0) : (item.cost || 0);
totalMaterialCost += unitCost * (item.quantity || 0);
});
return totalMaterialCost + additionalCost;
}
const tracking = factoryUnitTracking?.[storeType];
if (tracking && Array.isArray(tracking.unitCostHistory) && tracking.unitCostHistory.length > 0) {
let totalWeightedCost = 0, totalUnits = 0;
tracking.unitCostHistory.forEach(entry => {
totalWeightedCost += (entry.costPerUnit || 0) * (entry.units || 0);
totalUnits += (entry.units || 0);
});
return totalUnits > 0 ? totalWeightedCost / totalUnits : 0;
}
return 0;
}
export async function getFormulaUnitsValue(tracking) {
const list = ensureArray(await sqliteStore.get('formulas')).filter(f => f && f.id);
let value = 0;
for (const f of list) {
const available = Number(tracking?.[f.id]?.available) || 0;
if (available > 0) value += available * (await getCostPerUnit(String(f.id)));
}
return value;
}
export async function calculatePaymentSummaries() {
const transactions = ensureArray(await sqliteStore.get('transactions'));
const today = localDateStr();
const todayObj = new Date();
const year = todayObj.getFullYear();
const month = todayObj.getMonth();
const day = todayObj.getDate();
const weekStart = new Date(todayObj);
weekStart.setDate(day - 6);
const summaries = {
day: { in: 0, out: 0, count: 0 },
week: { in: 0, out: 0, count: 0 },
month: { in: 0, out: 0, count: 0 },
year: { in: 0, out: 0, count: 0 }
};
transactions.forEach(transaction => {
const transDate = new Date(transaction.date);
const transYear = transDate.getFullYear();
const transMonth = transDate.getMonth();
if (transaction.date === today) {
if (transaction.type === 'IN') summaries.day.in += transaction.amount;
else summaries.day.out += transaction.amount;
summaries.day.count++;
}
if (transDate >= weekStart && transDate <= todayObj) {
if (transaction.type === 'IN') summaries.week.in += transaction.amount;
else summaries.week.out += transaction.amount;
summaries.week.count++;
}
if (transYear === year && transMonth === month) {
if (transaction.type === 'IN') summaries.month.in += transaction.amount;
else summaries.month.out += transaction.amount;
summaries.month.count++;
}
if (transYear === year) {
if (transaction.type === 'IN') summaries.year.in += transaction.amount;
else summaries.year.out += transaction.amount;
summaries.year.count++;
}
});
const updateSummary = (prefix, data) => {
const inEl = document.getElementById(`${prefix}-in`);
const outEl = document.getElementById(`${prefix}-out`);
const netEl = document.getElementById(`${prefix}-net`);
const countEl = document.getElementById(`${prefix}-count`);
if (inEl) inEl.textContent = `${fmtAmt(safeValue(data.in))}`;
if (outEl) outEl.textContent = `${fmtAmt(safeValue(data.out))}`;
if (netEl) netEl.textContent = `${fmtAmt(safeValue(data.in - data.out))}`;
if (countEl) countEl.textContent = data.count;
};
updateSummary('payments-day', summaries.day);
updateSummary('payments-week', summaries.week);
updateSummary('payments-month', summaries.month);
updateSummary('payments-year', summaries.year);
}
export async function unlinkSupplierFromMaterial(material, showToastOnNoSupplier = false, skipSideEffects = false, groupId = null) {
const { transactions, inventory } = await loadCollections('transactions', 'inventory');
if (!material) { showToast('Invalid material data', 'error'); return; }
if (!material.supplierId) {
if (showToastOnNoSupplier) showToast('No supplier to unlink', 'info');
return;
}
const materialId = material.id;
const linkedTransactions = transactions.filter(t => t.materialId === materialId && t.entityId === material.supplierId && t.isPayable === true);
if (linkedTransactions.length > 0) {
const removedTransactions = linkedTransactions.slice();
let filteredTx = transactions.slice();
for (const tx of removedTransactions) {
filteredTx = filteredTx.filter(t => t.id !== tx.id);
await unifiedDelete('transactions', filteredTx, tx.id, { strict: true }, groupId ? stampGroup(tx, groupId) : tx);
}
}
delete material.supplierId;
delete material.supplierName;
delete material.supplierContact;
delete material.supplierType;
material.paymentStatus = 'pending';
delete material.totalPayable;
delete material.paidDate;
material.updatedAt = getTimestamp();
ensureRecordIntegrity(material, true);
if (!skipSideEffects) {
const _liveIdx = inventory.findIndex(i => i && i.id === material.id);
if (_liveIdx !== -1) inventory[_liveIdx] = material;
await unifiedSave('inventory', inventory, material);
triggerAutoSync();
await _refreshSupplierLinkViews();
showToast(`Unlinked from ${esc(material.name)}`, 'success');
}
}
export async function getSalePriceForStore(store) {
if (!store) return 0;
const stores = typeof getAppStores === 'function' ? await getAppStores() : [];
const storeEntry = stores.find(s => s.key === store);
return (storeEntry && storeEntry.salePrice > 0) ? storeEntry.salePrice : 0;
}
export async function getEffectiveSalePriceForCustomer(customerName, store) {
const customers = ensureArray(await sqliteStore.get('customers'));
if (customerName) {
const _reg = Array.isArray(customers) ? customers.find(c => c && c.name && c.name.toLowerCase() === String(customerName).toLowerCase()) : null;
if (_reg && _reg.customSalePrice > 0) return _reg.customSalePrice;
}
return await getSalePriceForStore(store);
}
export async function getSaleTransactionValue(t) {
if (!t) return 0;
if (t.isMerged) return parseFloat(t.totalValue) || 0;
const pt = t.paymentType || 'CASH';
if (pt === 'COLLECTION' || pt === 'PARTIAL_PAYMENT' || pt === 'MONEY_OUT') return parseFloat(t.totalValue) || 0;
if (t.transactionType === 'OLD_DEBT') return parseFloat(t.totalValue) || 0;
const qty = parseFloat(t.quantity) || 0;
const locked = lockedSaleValue(t);
if (locked !== null) return locked;
return round2(qty * (await getEffectiveSalePriceForCustomer(t.customerName, t.supplyStore || getDefaultStoreKey())));
}
export async function getReconciledRepReturnIds() {
const ids = new Set();
ensureArray(await sqliteStore.get('calculator')).forEach(h => {
if (h && Array.isArray(h.linkedRepReturnIds)) h.linkedRepReturnIds.forEach(i => ids.add(i));
});
return ids;
}
export async function getGoodsCreditUnitPrice(name, excludeId) {
const lname = String(name || '').trim().toLowerCase();
if (!lname) return 0;
const sales = ensureArray(await sqliteStore.get('sales')).filter(s =>
s && !s.deletedAt && !s.isMerged && s.currentRepProfile === 'admin' && s.id !== excludeId &&
s.customerName && String(s.customerName).trim().toLowerCase() === lname &&
s.paymentType === 'CREDIT' && s.transactionType !== 'OLD_DEBT' && !s.isRepTransfer && Number(s.quantity) > 0);
const toItem = async (x) => ({ quantity: x.quantity, value: await getSaleTransactionValue(x) });
let price = weightedUnitPrice(await Promise.all(sales.filter(x => !x.creditReceived).map(toItem)));
if (price > 0) return price;
const last = sales.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))[0];
if (last) { price = weightedUnitPrice([await toItem(last)]); if (price > 0) return price; }
return (await getEffectiveSalePriceForCustomer(name, getDefaultStoreKey())) || 0;
}
export async function getRepGoodsCreditUnitPrice(repName, name, excludeId) {
const key = String(name || '').trim().toLowerCase();
if (!key) return 0;
const rows = ensureArray(await sqliteStore.get('rep')).filter(r => r && !r.deletedAt && !r.isMerged && r.salesRep === repName && r.id !== excludeId
  && String(r.customerName || '').trim().toLowerCase() === key && r.paymentType === 'CREDIT' && r.transactionType !== 'OLD_DEBT' && Number(r.quantity) > 0);
const priceOf = (list) => weightedUnitPrice(list.map(r => ({ quantity: r.quantity, value: Number(r.totalValue) || 0 })));
const unpaid = priceOf(rows.filter(r => !r.creditReceived));
if (unpaid > 0) return unpaid;
const newest = rows.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))[0];
const lastPrice = newest ? priceOf([newest]) : 0;
return lastPrice > 0 ? lastPrice : ((await getSalePriceForStore(getDefaultStoreKey())) || 0);
}
export async function getCostPriceForStore(store, date) {
if (!store) return 0;
const realized = costPerKgFromIndex(buildCostIndex(ensureArray(await sqliteStore.get('production'))), store, date);
if (realized > 0) return realized;
const formulaId = await getStorePool(store);
return await calculateSalesCostPerKg(formulaId);
}
let _cfpToken = 0;
export async function calculateFactoryProduction() {
const token = ++_cfpToken;
const units = parseInt(document.getElementById('factoryProductionUnits').value) || 1;
const sel = await getSelectedFormula(window.currentFactoryEntryStore);
const lines = [];
let baseCost = 0;
for (const i of sel.ingredients) {
const qty = i.quantity * units;
const lineTotal = i.cost * qty;
baseCost += lineTotal;
let note = '';
if (i.missing) note = ' <span class="u-9cb6f55">(not in inventory)</span>';
else if (i.stock + 1e-6 < qty) note = ` <span class="u-9cb6f55">(short ${fmtNum(qty - i.stock)} kg)</span>`;
lines.push(`<div class="u-22ff3d7 d-flex"><span>${esc(i.name)} (${fmtNum(qty)} kg)${note}</span><span>${await formatCurrency(lineTotal)}</span></div>`);
}
let html = `<h4 class="u-fcc405c">${esc(sel.name)} Formula (${units} Units)</h4>`;
if (lines.length > 0) {
html += lines.join('');
const totalAdditionalCost = sel.additionalCost * units;
if (totalAdditionalCost > 0) {
html += `<div class="u-2bb3ddf d-flex"><span>Additional Cost (${sel.additionalCost} per unit)</span><span>${await formatCurrency(totalAdditionalCost)}</span></div>`;
baseCost += totalAdditionalCost;
}
} else {
html += `<div class="u-text-muted">No formula set.</div>`;
}
const totalText = await formatCurrency(baseCost);
if (token !== _cfpToken) return;
const _fd = document.getElementById('factoryFormulaDisplay');
if (_fd) _fd.innerHTML = html;
const _prodCostEl = document.getElementById('factoryTotalProductionCostDisplay');
if (_prodCostEl) _prodCostEl.innerText = totalText;
}
export async function calculateDynamicCost(storeType, formulaUnits, netWeight) {
const _dcInv = ensureArray(await sqliteStore.get('inventory'));
const formulaId = await getStorePool(storeType);
const sel = await getSelectedFormula(storeType);
const formula = sel && Array.isArray(sel.ingredients) ? sel.ingredients : [];
if (formula.length === 0) {
return { costPerUnit: 0, totalFormulaCost: 0, dynamicCostPerKg: 0, formulaId, formulaName: '', formulaMaterials: [], rawMaterialCost: 0 };
}
const additionalCost = Number(sel.additionalCost) || 0;
let totalMaterialCost = 0;
let totalWeight = 0;
formula.forEach(item => { totalMaterialCost += (resolveLiveCost(item, _dcInv) * item.quantity); totalWeight += item.quantity; });
const costPerUnit = totalMaterialCost + additionalCost;
return {
costPerUnit,
totalMaterialCost,
additionalCost,
totalFormulaCost: costPerUnit * formulaUnits,
dynamicCostPerKg: (formulaUnits > 0 && netWeight > 0) ? (costPerUnit * formulaUnits) / netWeight : 0,
formulaId,
formulaName: sel.name || (await getFormulaNames())[formulaId] || 'Formula',
formulaMaterials: formula.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, cost: resolveLiveCost(item, _dcInv) })),
rawMaterialCost: totalMaterialCost,
unitWeight: totalWeight
};
}
export async function calculateSalesCostPerKg(formulaId) {
const factoryCostAdjustmentFactor = (await sqliteStore.get('adjustment')) || {};
const _scInv = ensureArray(await sqliteStore.get('inventory'));
const sel = await getSelectedFormula(formulaId);
const formula = sel && Array.isArray(sel.ingredients) ? sel.ingredients : [];
if (formula.length === 0) return 0;
let rawMaterialCost = 0;
formula.forEach(item => { rawMaterialCost += (resolveLiveCost(item, _scInv) * item.quantity); });
const additionalCost = Number(sel.additionalCost) || 0;
const adjustmentFactor = factoryCostAdjustmentFactor[formulaId] || 1;
return adjustmentFactor > 0 ? (rawMaterialCost + additionalCost) / adjustmentFactor : rawMaterialCost + additionalCost;
}
export async function updateFormulaInventory() {
const { factory, production } = await loadCollections('factory', 'production');
const tracking = computeUnitPools(factory, production);
const timestamp = Date.now();
await sqliteStore.set('tracking', tracking);
await sqliteStore.set('tracking_timestamp', timestamp);
return tracking;
}
export async function syncFactoryProductionStats() {
const tracking = await updateFormulaInventory();
await updateUnitsAvailableIndicator(tracking);
updateFactoryUnitsAvailableStats();
updateFactorySummaryCard();
return tracking;
}
export async function validateFormulaAvailability(storeType, requestedUnits) {
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const formulaId = await getStorePool(storeType);
const available = factoryUnitTracking[formulaId]?.available || 0;
return { available, sufficient: available >= requestedUnits, deficit: Math.max(0, requestedUnits - available) };
}
export async function updateUnitsAvailableIndicator(preloadedTracking) {
const factoryUnitTracking = preloadedTracking || (await sqliteStore.get('tracking')) || {};
const store = document.getElementById('storeSelector').value;
if (!store) return;
const formulaId = await getStorePool(store);
const available = factoryUnitTracking[formulaId]?.available || 0;
const indicator = document.getElementById('currentUnitsAvailable');
const warning = document.getElementById('insufficientUnitsWarning');
let indicatorClass = 'units-available-good';
if (available < 10) indicatorClass = 'units-available-warning';
if (available <= 0) indicatorClass = 'units-available-danger';
const _uaiLabel = (await getFormulaNames())[formulaId] || '';
if (indicator) { indicator.className = `badge units-available-indicator ${indicatorClass}`; indicator.textContent = `${fmtNum(available || 0)} units available${_uaiLabel ? ' · ' + _uaiLabel : ''}`; }
const requestedUnits = parseFloat(document.getElementById('formula-units')?.value) || 0;
if (warning) {
if (requestedUnits > available) warning.classList.remove('hidden');
else warning.classList.add('hidden');
}
}
export async function calculateDynamicProductionCost() {
const net = readNum('net-wt');
const store = document.getElementById('storeSelector').value;
if (!store) return;
const formulaUnits = readNum('formula-units');
const costData = await calculateDynamicCost(store, formulaUnits, net);
const salePrice = await getSalePriceForStore(store);
const _setProd = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setProd('formula-unit-cost-display', `${fmtAmt(safeValue(costData.costPerUnit))}/unit`);
_setProd('total-formula-cost-display', `${fmtAmt(safeValue(costData.totalFormulaCost))}`);
_setProd('dynamic-cost-per-kg', `${fmtNum(safeValue(costData.dynamicCostPerKg))}/kg`);
_setProd('factory-cost-price', `${fmtNum(safeValue(costData.dynamicCostPerKg))}/kg`);
_setProd('production-sale-price-display', `${fmtNum(safeValue(salePrice))}/kg`);
_setProd('profit-sale-price', `${fmtNum(safeValue(salePrice))}/kg`);
_setProd('display-cost-value', `${fmtAmt(safeValue(net * costData.dynamicCostPerKg))}`);
_setProd('profit-per-kg', `${fmtAmt(safeValue(net > 0 ? salePrice - costData.dynamicCostPerKg : 0))}`);
updateUnitsAvailableIndicator();
}
export async function updateProductionCostOnStoreChange() {
const store = document.getElementById('storeSelector').value;
if (!store) return;
window.currentStore = store;
const salePrice = await getSalePriceForStore(store);
const _setStore = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setStore('production-sale-price-display', `${fmtNum(safeValue(salePrice))}/kg`);
_setStore('profit-sale-price', `${fmtNum(safeValue(salePrice))}/kg`);
calculateDynamicProductionCost();
updatePaymentStatusVisibility();
if (typeof refreshUI === 'function') refreshUI();
}
window.getCostPerUnit = getCostPerUnit;
window.calculatePaymentSummaries = calculatePaymentSummaries;
window.unlinkSupplierFromMaterial = unlinkSupplierFromMaterial;
window.getSalePriceForStore = getSalePriceForStore;
window.getEffectiveSalePriceForCustomer = getEffectiveSalePriceForCustomer;
window.getReconciledRepReturnIds = getReconciledRepReturnIds;
window.getSaleTransactionValue = getSaleTransactionValue;
window.getCostPriceForStore = getCostPriceForStore;
window.calculateFactoryProduction = calculateFactoryProduction;
window.calculateDynamicCost = calculateDynamicCost;
window.calculateSalesCostPerKg = calculateSalesCostPerKg;
window.updateFormulaInventory = updateFormulaInventory;
window.syncFactoryProductionStats = syncFactoryProductionStats;
window.validateFormulaAvailability = validateFormulaAvailability;
window.updateUnitsAvailableIndicator = updateUnitsAvailableIndicator;
window.calculateDynamicProductionCost = calculateDynamicProductionCost;
window.updateProductionCostOnStoreChange = updateProductionCostOnStoreChange;

registerEditHandler('factory', async (...args) => (await import('./factory.js')).startEditFactoryEntry(...args));
