import { findCalcLinkForReturn } from './link-guards.js';
import { hcCard, hcEmptyHtml } from './history-card.js';
import { sortInventoryItems, runExclusive, findReturnLogFor, getReturnStockDrop, newGroupId, stampGroup, DELETE_ORIGIN_FIELD, findPayableInTxs, planPayableAdjustment, weightedUnitPrice } from './link-graph.js';
import { actionRowHtml, beginEditMode, endEditMode, getEditCtx, registerEditHandler, stampEdit } from './edit-mode.js';
import { _creatorBadgeHtml, _mergedBadgeHtml, _safeErr, appMode, ensureArray, ensureRecordIntegrity, esc, fmtAmt, fmtNum, generateUUID, getTimestamp, localDateStr, lockedSaleValue, round2, safeNumber, sqliteStore, validateUUID, readNum, loadCollections } from './business.js';
import { emitSyncUpdate, unifiedDelete, unifiedSave } from './sync.js';
import { _refreshSupplierLinkViews, _recomputeSupplierPayables, notifyDataChange, triggerAutoSync, updatePaymentStatusVisibility } from './utilities-core.js';
import { _set_currentFactoryEntryStore, calculateCashTracker, calculateNetCash, currentFactoryEntryStore, deleteStockTransfer, getAppStores, getStorePool, getStoreLabel, refreshFactoryTab, refreshUI, updateFactorySummaryCard, updateFactoryUnitsAvailableStats } from './utilities-sales.js';
import { _filterFactoryHistoryByMode, formatCurrency, refreshPaymentTab, renderUnifiedTable, safeValue } from './utilities-payments.js';
import { showGlassConfirm, showToast } from './customers.js';
import { getFormulaNames, getSelectedFormula } from './formula-store.js';
import { computeUnitPools, usedUnitsByBatch } from './formula-pools.js';
import { confirmGuard } from './confirm-guard.js';
import { formatDayMonthYear } from './date-format.js';
import { rlRowHtml, rlEmptyHtml, rlJsArg } from './record-list.js';
import { buildCostIndex, costPerKgFromIndex } from './profit-cost.js';
import { getDefaultStoreKey } from './store-keys.js';
export let editingFactoryInventoryId;
window.editingFactoryInventoryId = editingFactoryInventoryId;
export function _set_editingFactoryInventoryId(v) { editingFactoryInventoryId = v; window.editingFactoryInventoryId = v; }
export let currentFactorySummaryMode = 'daily';
window.currentFactorySummaryMode = currentFactorySummaryMode;
export function _set_currentFactorySummaryMode(v) { currentFactorySummaryMode = v; window.currentFactorySummaryMode = v; }
export let currentStore = getDefaultStoreKey();
window.currentStore = currentStore;
export function _set_currentStore(v) { currentStore = v; window.currentStore = v; }

(window.__uiSyncers = window.__uiSyncers || []).push(() => {
  try { const v = window.currentStore; if (v !== undefined) currentStore = v; } catch (_) {}
  try { const v = window.currentFactorySummaryMode; if (v !== undefined) currentFactorySummaryMode = v; } catch (_) {}
});

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

export async function calculateFactoryInventoryValue() {
const inventory = ensureArray(await sqliteStore.get('inventory'));
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
let totalValue = 0;
if (inventory && inventory.length > 0) {
inventory.forEach(item => { totalValue += (item.quantity * item.cost) || 0; });
}
totalValue += await getFormulaUnitsValue(factoryUnitTracking);
return totalValue;
}

export async function updateFactoryInventoryDisplay() {
const inventory = ensureArray(await sqliteStore.get('inventory'));
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
let rawMaterialsValue = 0;
if (inventory && inventory.length > 0) {
inventory.forEach(item => { rawMaterialsValue += (item.quantity * item.cost) || 0; });
}
const formulaUnitsValue = await getFormulaUnitsValue(factoryUnitTracking);
const rawMaterialsEl = document.getElementById('formulaRawMaterials');
const unitsValueEl = document.getElementById('formulaUnitsValue');
if (rawMaterialsEl) rawMaterialsEl.textContent = `${fmtAmt(safeValue(rawMaterialsValue))}`;
if (unitsValueEl) unitsValueEl.textContent = `${fmtAmt(safeValue(formulaUnitsValue))}`;
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

export function openFactoryInventoryModal() {
const _facInvT1 = document.getElementById('factoryInventoryModalTitle');
if (_facInvT1) _facInvT1.innerText = 'Add Raw Material';
const _delBtnHide = document.getElementById('deleteFactoryInventoryBtn');
if (_delBtnHide) window.setDisplay(_delBtnHide, 'none');
clearFactoryInventoryForm();
editingFactoryInventoryId = null; window.editingFactoryInventoryId = editingFactoryInventoryId;
const qtyInput = document.getElementById('factoryMaterialQuantity');
const conversionInput = document.getElementById('factoryMaterialConversionFactor');
const costInput = document.getElementById('factoryMaterialCost');
if (qtyInput && conversionInput && costInput) {
qtyInput.removeEventListener('input', updateFactoryKgCalculation);
conversionInput.removeEventListener('input', updateFactoryKgCalculation);
costInput.removeEventListener('input', updateFactoryKgCalculation);
qtyInput.addEventListener('input', updateFactoryKgCalculation);
conversionInput.addEventListener('input', updateFactoryKgCalculation);
costInput.addEventListener('input', updateFactoryKgCalculation);
}
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('raw-material-screen');
}

export function closeFactoryInventoryModal() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('raw-material-screen');
}

export function clearFactoryInventoryForm() {
document.getElementById('factoryMaterialName').value = '';
document.getElementById('factoryMaterialQuantity').value = '';
document.getElementById('factoryMaterialConversionFactor').value = '1';
document.getElementById('factoryMaterialUnitName').value = '';
document.getElementById('factoryMaterialCost').value = '';
editingFactoryInventoryId = null; window.editingFactoryInventoryId = null;
['factoryExistingSupplier', 'factorySupplierName', 'factorySupplierPhone'].forEach((id) => {
const el = document.getElementById(id);
if (el) { el.value = ''; el.removeAttribute('data-supplier-id'); }
});
const _unlinkBtn = document.querySelector('#existingSupplierSection .unlink-supplier-btn');
if (_unlinkBtn) _unlinkBtn.remove();
setFactorySupplierType('none');
const _saveBtn = document.getElementById('factorySaveMaterialBtn');
if (_saveBtn) _saveBtn.textContent = 'Save Material';
updateFactoryKgCalculation();
}

export async function editFactoryInventoryItem(id) {
const { inventory, entities } = await loadCollections('inventory', 'entities');
const item = inventory.find(i => i.id === id);
if (!item) return;
openFactoryInventoryModal();
const _facInvT2 = document.getElementById('factoryInventoryModalTitle');
if (_facInvT2) _facInvT2.innerText = 'Edit Material';
const _saveBtnEdit = document.getElementById('factorySaveMaterialBtn');
if (_saveBtnEdit) _saveBtnEdit.textContent = 'Update Material';
const _delBtn = document.getElementById('deleteFactoryInventoryBtn');
if (_delBtn) window.setDisplay(_delBtn, '');
document.getElementById('factoryMaterialName').value = item.name;
if (item.purchaseQuantity && item.conversionFactor) {
document.getElementById('factoryMaterialQuantity').value = item.purchaseQuantity;
document.getElementById('factoryMaterialCost').value = item.purchaseCost;
document.getElementById('factoryMaterialConversionFactor').value = item.conversionFactor;
document.getElementById('factoryMaterialUnitName').value = item.purchaseUnitName || '';
} else {
document.getElementById('factoryMaterialQuantity').value = item.quantity;
document.getElementById('factoryMaterialCost').value = item.cost;
document.getElementById('factoryMaterialConversionFactor').value = 1;
document.getElementById('factoryMaterialUnitName').value = '';
}
updateFactoryKgCalculation();
const supplierTypeSelect = document.getElementById('factoryMaterialSupplierType');
const existingSupplierSection = document.getElementById('existingSupplierSection');
const newSupplierSection = document.getElementById('newSupplierSection');
if (item.supplierId) {
supplierTypeSelect.value = 'existing';
existingSupplierSection.classList.remove('hidden');
newSupplierSection.classList.add('hidden');
const supplierInput = document.getElementById('factoryExistingSupplier');
const supplier = entities.find(e => String(e.id) === String(item.supplierId));
if (supplier && supplierInput) {
supplierInput.value = supplier.name;
supplierInput.setAttribute('data-supplier-id', item.supplierId);
}
showSupplierUnlinkOption(item);
} else {
supplierTypeSelect.value = 'none';
existingSupplierSection.classList.add('hidden');
newSupplierSection.classList.add('hidden');
}
toggleSupplierFields();
editingFactoryInventoryId = id; window.editingFactoryInventoryId = editingFactoryInventoryId;
}

export function updateFactoryKgCalculation() {
const qty = readNum('factoryMaterialQuantity');
const conversionFactor = parseFloat(document.getElementById('factoryMaterialConversionFactor').value) || 1;
const cost = readNum('factoryMaterialCost');
const totalKg = qty * conversionFactor;
const totalAmount = qty * cost;
const kgDisplayElement = document.getElementById('factoryCalculatedKg');
const amountDisplayElement = document.getElementById('factoryCalculatedAmount');
if (kgDisplayElement) kgDisplayElement.textContent = fmtNum(safeNumber(totalKg, 0)) + ' kg';
if (amountDisplayElement) amountDisplayElement.textContent = fmtAmt(totalAmount);
const perKgElement = document.getElementById('factoryCalculatedPerKg');
if (perKgElement) perKgElement.textContent = fmtAmt(conversionFactor > 0 ? cost / conversionFactor : cost);
}

export function showSupplierUnlinkOption(material) {
const existingSupplierSection = document.getElementById('existingSupplierSection');
let unlinkButton = existingSupplierSection.querySelector('.unlink-supplier-btn');
if (!unlinkButton) {
unlinkButton = document.createElement('button');
unlinkButton.className = 'btn btn-danger unlink-supplier-btn';
unlinkButton.classList.add('u-16000cc', 'st-margin-top__d2c171', 'st-font-size__c95659');
unlinkButton.innerHTML = ' Unlink Supplier & Reverse Transactions';
unlinkButton.onclick = function(e) { e.preventDefault(); unlinkSupplierConfirmation(material); };
existingSupplierSection.appendChild(unlinkButton);
}
}

export async function unlinkSupplierConfirmation(material) {
const { transactions } = await loadCollections('transactions');
const linkedTransactions = transactions.filter(t => t.materialId === material.id && t.entityId === material.supplierId && t.isPayable === true);
let confirmMsg = `Unlink ${material.supplierName} from "${material.name}"?`;
confirmMsg += `\nCurrent Stock: ${fmtNum(material.quantity || 0)} kg`;
if (material.totalPayable) confirmMsg += `\nOutstanding Payable: ${fmtAmt(material.totalPayable || 0)}`;
if (linkedTransactions.length > 0) {
const totalReversed = linkedTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
confirmMsg += `\n\n\u21A9 ${linkedTransactions.length} payment transaction${linkedTransactions.length !== 1 ? 's' : ''} totaling ${fmtAmt(safeNumber(totalReversed, 0))} will be reversed and the payable reset to pending.`;
} else confirmMsg += `\n\n\u21A9 The payable status will be reset to pending.`;
confirmMsg += `\n\nThe material will be available to link with a different supplier.\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: `Unlink ${material.supplierName}`, confirmText: 'Unlink', danger: true })) {
await unlinkSupplierFromMaterial(material, true);
closeFactoryInventoryModal();
setTimeout(() => editFactoryInventoryItem(material.id), 100);
refreshPaymentTab();
calculateNetCash();
renderFactoryInventory();
}
}

export function saveFactoryInventoryItem(...a) { return confirmGuard('saveFactoryInventoryItem', () => runExclusive('saveFactoryInventoryItem', () => _saveFactoryInventoryItemImpl(...a)), { label: 'Inventory Item', late: true, fields: [['factoryMaterialName', 'Material'], ['factoryMaterialQuantity', 'Quantity'], ['factoryMaterialUnitName', 'Unit'], ['factoryMaterialCost', 'Cost']], isUpdate: () => !!editingFactoryInventoryId }); }

async function _saveFactoryInventoryItemImpl() {
const { inventory } = await loadCollections('inventory');
const name = document.getElementById('factoryMaterialName').value;
const qty = readNum('factoryMaterialQuantity');
const cost = readNum('factoryMaterialCost');
const conversionFactor = parseFloat(document.getElementById('factoryMaterialConversionFactor').value) || 1;
const unitName = document.getElementById('factoryMaterialUnitName').value.trim() || '';
const supplierType = document.getElementById('factoryMaterialSupplierType').value;
if (!name) return window.notifyBlocking('Name required', 'warning', 'Warning');
if (qty < 0) return window.notifyBlocking('Quantity cannot be negative', 'warning', 'Warning');
if (cost <= 0) return window.notifyBlocking('Please enter a valid cost greater than 0', 'warning', 'Warning');
if (conversionFactor <= 0) return window.notifyBlocking('Conversion factor must be greater than 0', 'warning', 'Warning');
if (!(await window.gcCommit({}))) return;
try {
const quantityInKg = qty * conversionFactor;
const costPerKg = conversionFactor > 0 ? cost / conversionFactor : cost;
const totalValue = qty * cost;
let materialId;
let _supplierUnchanged = false;
let _oldStockValue = 0;
if (editingFactoryInventoryId) {
materialId = editingFactoryInventoryId;
const idx = inventory.findIndex(i => i.id === editingFactoryInventoryId);
if (idx !== -1) {
const existingMaterial = inventory[idx];
_oldStockValue = Number(existingMaterial.totalValue) || 0;
const oldSupplierId = existingMaterial.supplierId;
const supplierInput = document.getElementById('factoryExistingSupplier');
const newSupplierId = (supplierInput && supplierInput.getAttribute('data-supplier-id')) || '';
const isSupplierSame = supplierType === 'existing' && oldSupplierId && newSupplierId && String(oldSupplierId) === String(newSupplierId);
const isSupplierChanging = !isSupplierSame && (
(supplierType === 'none' && oldSupplierId) ||
(supplierType === 'existing' && oldSupplierId && newSupplierId && String(oldSupplierId) !== String(newSupplierId))
);
if (isSupplierChanging) await unlinkSupplierFromMaterial(existingMaterial, false, true);
_supplierUnchanged = isSupplierSame;
inventory[idx] = ensureRecordIntegrity({ ...inventory[idx], name, quantity: quantityInKg, cost: costPerKg, unit: 'kg', totalValue, purchaseQuantity: qty, purchaseCost: cost, conversionFactor, purchaseUnitName: unitName, updatedAt: getTimestamp() }, true);
}
} else {
materialId = generateUUID('mat');
if (!validateUUID(materialId)) materialId = generateUUID('mat');
const _matNow = getTimestamp();
let _newMaterial = { id: materialId, name, quantity: quantityInKg, cost: costPerKg, unit: 'kg', totalValue, paymentStatus: 'pending', syncedAt: new Date().toISOString(), purchaseQuantity: qty, purchaseCost: cost, conversionFactor, purchaseUnitName: unitName, createdAt: _matNow, updatedAt: _matNow, timestamp: _matNow };
_newMaterial = ensureRecordIntegrity(_newMaterial, false);
inventory.push(_newMaterial);
}
if (supplierType === 'none') {
const material = inventory.find(m => m.id === materialId);
if (material) {
delete material.supplierId;
delete material.supplierName;
delete material.supplierContact;
delete material.supplierType;
material.paymentStatus = 'pending';
material.totalPayable = totalValue;
}
} else if (supplierType === 'existing') {
if (!_supplierUnchanged) {
const supplierInput = document.getElementById('factoryExistingSupplier');
const existingSupplierId = supplierInput.getAttribute('data-supplier-id') || supplierInput.value;
if (existingSupplierId) await linkMaterialToSupplier(materialId, existingSupplierId, totalValue, true, inventory);
}
} else if (supplierType === 'new') {
const supplierName = document.getElementById('factorySupplierName').value.trim();
const supplierPhone = document.getElementById('factorySupplierPhone').value.trim();
if (supplierName) {
const newSupplier = await createSupplierFromMaterial({ name: supplierName, phone: supplierPhone, materialId, materialName: name, materialTotal: totalValue });
if (newSupplier && newSupplier.id) await linkMaterialToSupplier(materialId, newSupplier.id, totalValue, true, inventory);
}
}
const savedMaterial = inventory.find(m => m.id === materialId);
await unifiedSave('inventory', inventory, savedMaterial);
if (editingFactoryInventoryId && _supplierUnchanged && savedMaterial && savedMaterial.supplierId) {
const _delta = (Number(savedMaterial.totalValue) || 0) - _oldStockValue;
if (Math.abs(_delta) > 0.01) {
const _allTx = ensureArray(await sqliteStore.get('transactions'));
const _inv = findPayableInTxs(_allTx, savedMaterial.id, savedMaterial.supplierId).filter(t => t.materialId === savedMaterial.id && !(t.materialIds && t.materialIds.length > 1));
if (_inv.length > 0) {
const _tx = _inv[_inv.length - 1];
const _plan = planPayableAdjustment(_tx.amount, _delta);
if (_plan.change !== 0) {
const _go = await showGlassConfirm(`The stock value changed. Update what you owe the supplier?\nMaterial: ${savedMaterial.name}\nSupplier: ${savedMaterial.supplierName || 'Not set'}\nStock Value Change: ${fmtAmt(_delta)}\nCurrently Owed: ${fmtAmt(_tx.amount)}\nNew Amount Owed: ${fmtAmt(_plan.next)}`, { title: 'Update Supplier Payable?', confirmText: 'Update Payable', cancelText: 'Keep As Is' });
if (_go) {
_tx.amount = _plan.next; _tx.updatedAt = getTimestamp();
ensureRecordIntegrity(_tx, true);
await unifiedSave('transactions', _allTx, _tx);
await _recomputeSupplierPayables([String(savedMaterial.supplierId)], ensureArray(await sqliteStore.get('inventory')), _allTx, new Set(), new Set([String(savedMaterial.id)]));
await _refreshSupplierLinkViews();
}
}
}
}
}
notifyDataChange('inventory');
emitSyncUpdate({ inventory: null});
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
closeFactoryInventoryModal();
if (typeof calculateNetCash === 'function') calculateNetCash();
} catch (error) {
window.notifyBlocking('Failed to save material. Please try again.', 'error', 'Something went wrong');
}
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
await unifiedSave('inventory', inventory, material);
triggerAutoSync();
await _refreshSupplierLinkViews();
showToast(`Unlinked from ${esc(material.name)}`, 'success');
}
}

export async function createSupplierFromMaterial(supplierData) {
const { entities } = await loadCollections('entities');
const existingSupplier = entities.find(e => e && e.name && supplierData && supplierData.name && e.name.toLowerCase() === supplierData.name.toLowerCase() && e.type === 'payee');
if (existingSupplier) return existingSupplier;
let suppId = generateUUID('supp');
if (!validateUUID(suppId)) suppId = generateUUID('supp');
const suppCreatedAt = getTimestamp();
let supplierEntity = ensureRecordIntegrity({ id: suppId, name: supplierData.name, type: 'payee', phone: supplierData.phone || '', wallet: '', createdAt: suppCreatedAt, updatedAt: suppCreatedAt, timestamp: suppCreatedAt, isSupplier: true, supplierCategory: 'raw_materials' }, false);
entities.push(supplierEntity);
await unifiedSave('entities', entities, supplierEntity);
notifyDataChange('entities');
triggerAutoSync();
return supplierEntity;
}

let _invSort = { key: 'name', dir: 'asc' };
try { const _sv = JSON.parse(localStorage.getItem('factoryInvSort') || 'null'); if (_sv && (_sv.key === 'name' || _sv.key === 'amount') && (_sv.dir === 'asc' || _sv.dir === 'desc')) _invSort = _sv; } catch (_) {}

export function sortFactoryInventory(key) {
_invSort = { key, dir: _invSort.key === key && _invSort.dir === 'asc' ? 'desc' : 'asc' };
try { localStorage.setItem('factoryInvSort', JSON.stringify(_invSort)); } catch (_) {}
return renderFactoryInventory();
}

window.sortFactoryInventory = sortFactoryInventory;

function _updateInvSortHeaders() {
['name', 'amount'].forEach(k => {
const el = document.getElementById(k === 'name' ? 'factoryInvSortName' : 'factoryInvSortAmount');
if (!el) return;
const base = k === 'name' ? 'Material' : 'Total Value';
el.textContent = base + (_invSort.key === k ? (_invSort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅');
});
}

let _invRenderSeq = 0;

export async function renderFactoryInventory() {
const _mySeq = ++_invRenderSeq;
const inventory = sortInventoryItems(ensureArray(await sqliteStore.get('inventory')), _invSort);
_updateInvSortHeaders();
const tbody = document.getElementById('factoryInventoryTableBody');
let totalVal = 0;
const _invEmpty = (t, h) => rlEmptyHtml(t, h);
if (inventory.length === 0) {
tbody.innerHTML = _invEmpty('No raw materials yet', 'Add a material from the menu to start tracking stock.');
const _invEl = document.getElementById('factoryTotalInventoryValue');
if (_invEl) _invEl.innerText = await formatCurrency(0);
return;
}
const prebuiltRows = [];
for (const item of inventory) {
const qty = Number(item.quantity) || 0;
const itemTotalValue = (item.quantity * item.cost) || 0;
totalVal += itemTotalValue;
const converted = item.conversionFactor && item.conversionFactor !== 1;
let stockText;
if (item.purchaseQuantity && item.purchaseUnitName && converted) stockText = `${fmtNum(item.purchaseQuantity || 0)} ${esc(item.purchaseUnitName)} (${fmtNum(qty)} kg)`;
else if (item.purchaseQuantity && converted) stockText = `${fmtNum(item.purchaseQuantity || 0)} units (${fmtNum(qty)} kg)`;
else stockText = `${fmtNum(qty)} kg`;
let rateText;
if (item.purchaseCost && item.purchaseUnitName && converted) rateText = `${await formatCurrency(item.purchaseCost)} per ${esc(item.purchaseUnitName)}`;
else if (item.purchaseCost && converted) rateText = `${await formatCurrency(item.purchaseCost)} per unit`;
else rateText = `${await formatCurrency(item.cost)} per kg`;
let supplierLine;
if (item.supplierName) {
const remainingPayable = item.totalPayable || 0;
const isFullyPaid = item.paymentStatus === 'paid' || remainingPayable <= 0;
supplierLine = `<span class="supplier-name-badge">${esc(item.supplierName)}</span>` + (isFullyPaid ? '<span class="rl-muted">Paid</span>' : `<span class="rl-owed">Owed ${fmtNum(safeNumber(remainingPayable, 0))}</span>`);
} else {
supplierLine = '<span class="rl-muted">No supplier linked</span>';
}
const out = !(qty > 0);
prebuiltRows.push(rlRowHtml({
name: item.name,
avatar: 'none',
tone: out ? 'debt' : 'plain',
badges: [out ? '<span class="rl-flag">Out of stock</span>' : ''],
details: [`<span class="rl-strong">${stockText}</span>`, `<span class="rl-muted">${rateText}</span>`, supplierLine],
amount: await formatCurrency(itemTotalValue),
tag: 'Stock value',
onOpen: `editFactoryInventoryItem('${rlJsArg(item.id)}')`
}));
}
if (_mySeq !== _invRenderSeq) return;
tbody.innerHTML = prebuiltRows.join('');
const _invEl = document.getElementById('factoryTotalInventoryValue');
if (_invEl) _invEl.innerText = await formatCurrency(totalVal);
}

export async function unlinkSupplierFromMaterialById(materialId) {
const { inventory, transactions } = await loadCollections('inventory', 'transactions');
let material = inventory.find(m => m.id === materialId);
if (!material) {
const reloadedData = await sqliteStore.get('inventory');
if (Array.isArray(reloadedData)) {
material = inventory.find(m => m.id === materialId);
}
}
if (!material) { window.notifyBlocking('Material not found', 'error', 'Something went wrong'); return; }
if (!material.supplierId) { window.notifyBlocking('No supplier linked', 'warning', 'Warning'); return; }
const linkedTransactions = transactions.filter(t => t.materialId === materialId && t.entityId === material.supplierId && t.isPayable === true);
const _us2Total = linkedTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
let confirmMsg = `Unlink ${material.supplierName} from "${material.name}"?`;
confirmMsg += `\nCurrent Stock: ${fmtNum(material.quantity || 0)} kg`;
if (material.totalPayable) confirmMsg += `\nOutstanding Payable: ${fmtAmt(material.totalPayable || 0)}`;
if (linkedTransactions.length > 0) confirmMsg += `\n\n↩ ${linkedTransactions.length} payment transaction${linkedTransactions.length !== 1 ? 's' : ''} totaling ${fmtAmt(_us2Total)} will be reversed and the material reverted to "Pending Payable" status.`;
confirmMsg += `\n\nThe material will be available to link with a different supplier.\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: `Unlink ${material.supplierName}`, confirmText: 'Unlink', danger: true })) {
await unlinkSupplierFromMaterial(material, true);
}
}

export function toggleSupplierFields() {
const supplierType = document.getElementById('factoryMaterialSupplierType').value;
const existingSection = document.getElementById('existingSupplierSection');
const newSection = document.getElementById('newSupplierSection');
if (existingSection) existingSection.classList.add('hidden');
if (newSection) newSection.classList.add('hidden');
if (supplierType === 'existing') { if (existingSection) existingSection.classList.remove('hidden'); }
else if (supplierType === 'new') { if (newSection) newSection.classList.remove('hidden'); }
document.querySelectorAll('#factorySupplierSeg .pf-seg-opt').forEach((btn) => {
const on = btn.getAttribute('data-supp') === supplierType;
btn.classList.toggle('is-active', on);
btn.setAttribute('aria-pressed', on ? 'true' : 'false');
});
}

export function setFactorySupplierType(type) {
const sel = document.getElementById('factoryMaterialSupplierType');
if (sel) sel.value = type;
toggleSupplierFields();
}

export async function loadExistingSuppliers() {
const entities = ensureArray(await sqliteStore.get('entities'));
const selectElement = document.getElementById('factoryExistingSupplier');
if (!selectElement) return;
selectElement.innerHTML = '<option value="">Choose Supplier</option>';
const suppliers = entities.filter(entity => entity.type === 'payee');
suppliers.forEach(supplier => {
const option = document.createElement('option');
option.value = supplier.id;
option.textContent = `${supplier.name || 'Unknown'} ${supplier.phone ? `(${supplier.phone})` : ''}`;
selectElement.appendChild(option);
});
if (suppliers.length === 0) {
const option = document.createElement('option');
option.value = '';
option.textContent = 'No suppliers found. Create a new one.';
option.disabled = true;
selectElement.appendChild(option);
}
}

export async function linkMaterialToSupplier(materialId, supplierId, totalCost, skipSideEffects = false, sharedInventory = null) {
const inventory = sharedInventory || ensureArray(await sqliteStore.get('inventory'));
const { entities, transactions } = await loadCollections('entities', 'transactions');
let material = inventory.find(m => m.id === materialId);
if (!material) {
const reloadedData = await sqliteStore.get('inventory');
if (Array.isArray(reloadedData)) {
material = reloadedData.find(m => m.id === materialId);
}
}
if (!material) { showToast('Material not found. Try refreshing.', 'error'); return; }
let supplier = entities.find(e => e.id === supplierId || String(e.id) === String(supplierId));
if (!supplier) {
const supplierTransaction = transactions.find(t => t.entityId === supplierId || String(t.entityId) === String(supplierId));
if (supplierTransaction) {
supplier = { id: supplierId, name: supplierTransaction.entityName || 'Supplier', type: 'payee', phone: '' };
} else {
showToast('Supplier not found. Please refresh and try again.', 'error');
return;
}
}
if (material.supplierId && String(material.supplierId) !== String(supplierId)) {
await unlinkSupplierFromMaterial(material, false, true);
}
if (findPayableInTxs(transactions, material.id, supplier.id).length > 0) {
if (!skipSideEffects) showToast(`${esc(material.name)} is already linked to ${esc(supplier.name)}.`, 'info');
return;
}
material.supplierId = supplier.id;
material.supplierName = supplier.name;
material.supplierContact = supplier.phone || '';
material.supplierType = 'payee';
material.paymentStatus = 'pending';
material.totalPayable = totalCost;
material.updatedAt = getTimestamp();
ensureRecordIntegrity(material, true);
const payableTransactions = ensureArray(await sqliteStore.get('transactions'));
const now = new Date();
const dateStr = localDateStr(now);
const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
let payableTxId = generateUUID('pay');
if (!validateUUID(payableTxId)) payableTxId = generateUUID('pay');
const payableTxCreatedAt = getTimestamp();
let payableTx = {
id: payableTxId,
entityId: supplier.id,
entityName: supplier.name,
entityType: 'payee',
date: dateStr,
time: timeStr,
amount: totalCost,
description: `Material purchase: ${material.name}`,
type: 'IN',
isPayable: true,
materialId: material.id,
createdAt: payableTxCreatedAt,
updatedAt: payableTxCreatedAt,
timestamp: payableTxCreatedAt,
syncedAt: now.toISOString()
};
payableTx = ensureRecordIntegrity(payableTx, false);
payableTransactions.push(payableTx);
if (!skipSideEffects) {
await unifiedSave('inventory', inventory, material);
await unifiedSave('transactions', payableTransactions, payableTx);
notifyDataChange('all');
triggerAutoSync();
await renderFactoryInventory();
await refreshPaymentTab();
calculateNetCash();
showToast(`Linked to ${esc(supplier.name)}`, 'success');
} else {
await sqliteStore.set('transactions', payableTransactions);
}
}

export async function selectFactoryFormula(pool) {
const _sffStores = typeof getAppStores === 'function' ? await getAppStores() : [];
const _sffRep = _sffStores.find(s => s.formulaId && String(s.formulaId) === String(pool));
if (!_sffRep) {
showToast('No store is using this formula.', 'warning', 3000);
return;
}
_set_currentFactoryEntryStore(_sffRep.key);
if (typeof window.syncFactoryFormulaPicker === 'function') window.syncFactoryFormulaPicker(pool);
calculateFactoryProduction();
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
if (pt === 'COLLECTION' || pt === 'PARTIAL_PAYMENT') return parseFloat(t.totalValue) || 0;
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

export async function getStorePricing(store) {
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
const factoryCostAdjustmentFactor = (await sqliteStore.get('adjustment')) || {};
return { salePrice: await getSalePriceForStore(store), costPrice: await getCostPriceForStore(store) };
}

let _cfpToken = 0;

export async function calculateFactoryProduction() {
const token = ++_cfpToken;
const units = parseInt(document.getElementById('factoryProductionUnits').value) || 1;
const sel = await getSelectedFormula(currentFactoryEntryStore);
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

function _resetFactoryForm() {
const u = document.getElementById('factoryProductionUnits'); if (u) u.value = '1';
if (typeof calculateFactoryProduction === 'function') calculateFactoryProduction();
}

async function _usedUnitsOfBatch(rec) {
const [factory, production] = await Promise.all([sqliteStore.get('factory'), sqliteStore.get('production')]);
return usedUnitsByBatch(ensureArray(factory), ensureArray(production), rec.formulaId).get(rec.id) || 0;
}

function _usedBatchMessage(used, rec, action) {
return `Cannot ${action}: ${fmtNum(used)} of this batch's ${fmtNum(rec.units || 0)} units are already used in production entries. Delete or reduce those production entries first.`;
}

export async function startEditFactoryEntry(id) {
const hist = ensureArray(await sqliteStore.get('factory'));
const rec = hist.find(h => h && String(h.id) === String(id));
if (!rec || rec.isMerged) { showToast('This batch cannot be edited.', 'warning'); return; }
const _usedEdit = await _usedUnitsOfBatch(rec);
if (_usedEdit > 0) { window.notifyBlocking(_usedBatchMessage(_usedEdit, rec, 'edit'), 'warning', 'Action not allowed'); return; }
if (typeof showTab === 'function') showTab('factory');
const _ft = rec.formulaId;
_set_currentFactoryEntryStore(rec.store);
if (typeof window.syncFactoryFormulaPicker === 'function') window.syncFactoryFormulaPicker(_ft);
const u = document.getElementById('factoryProductionUnits'); if (u) u.value = rec.units;
if (typeof calculateFactoryProduction === 'function') await calculateFactoryProduction();
beginEditMode('factory', rec, { buttonId: 'btn-save-factory-production', watchIds: ['factoryProductionUnits'], label: 'Update Batch', anchorId: 'factoryProductionUnits', cancelFn: _resetFactoryForm });
}

registerEditHandler('factory', startEditFactoryEntry);
export function saveFactoryProductionEntry(...a) { return confirmGuard('saveFactoryProductionEntry', () => runExclusive('saveFactoryProductionEntry', () => _saveFactoryProductionEntryImpl(...a)), { label: 'Production', late: true, fields: [], editKinds: ['factory'] }); }

async function _saveFactoryProductionEntryImpl() {
const _ed = getEditCtx('factory');
if (!currentFactoryEntryStore) {
window.notifyBlocking('Please select a formula before saving.', 'warning', 'Warning');
return;
}
const _sfpeBatch = await sqliteStore.getBatch([
'defaults','costs',
'inventory','factory',
]);
const factoryDefaultFormulas = _sfpeBatch.get('defaults') || {};
const factoryAdditionalCosts = _sfpeBatch.get('costs') || {};
const inventory = ensureArray(_sfpeBatch.get('inventory'));
const factory = ensureArray(_sfpeBatch.get('factory'));
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('factory')) {
window.notifyBlocking('Access Denied — Factory not in your assigned tabs', 'warning', 'Warning');
return;
}
const units = parseInt(document.getElementById('factoryProductionUnits').value) || 0;
if (units <= 0) return window.notifyBlocking('Invalid units', 'warning', 'Warning');
const inventorySnapshot = JSON.parse(JSON.stringify(inventory));
const historySnapshot = [...factory];
let _histSavedRec = null;
try {
const _sfpeType = await getStorePool(currentFactoryEntryStore);
const _freshFormula = await getSelectedFormula(currentFactoryEntryStore);
const settings = _freshFormula.ingredients.filter(i => i.quantity > 0);
if (!settings || settings.length === 0) {
window.notifyBlocking('No formula configured for this store. Assign a formula to it in Store Manager first.', 'warning', 'Warning');
return;
}
let _edHistIdx = -1;
if (_ed) {
const o = _ed.original;
const _usedSave = await _usedUnitsOfBatch(o);
if (_usedSave > 0) throw new Error(_usedBatchMessage(_usedSave, o, 'update'));
const oType = o.formulaId || (await getStorePool(o.store));
const tr = await updateFormulaInventory();
const avail = tr?.[oType]?.available || 0;
const delta = (oType === _sfpeType) ? (units - (o.units || 0)) : -(o.units || 0);
if (avail + delta < -1e-9) {
throw new Error(`Cannot change this batch: its units are already used in manufacturing entries. Delete or reduce those first.`);
}
const restore = (Array.isArray(o.materialsUsed) && o.materialsUsed.length > 0)
? o.materialsUsed
: (factoryDefaultFormulas[oType] || []).map(m => ({ id: m.id, name: m.name, quantity: m.quantity * (o.units || 0) }));
for (const m of restore) {
let inv = inventory.find(i => String(i.id) === String(m.id));
if (!inv && m.name) inv = inventory.find(i => i.name && i.name.trim().toLowerCase() === m.name.trim().toLowerCase());
if (inv) {
inv.quantity = parseFloat(((inv.quantity || 0) + m.quantity).toFixed(6));
inv.totalValue = inv.quantity * inv.cost;
if (inv.conversionFactor && inv.conversionFactor !== 1) inv.purchaseQuantity = inv.quantity / inv.conversionFactor;
inv.updatedAt = getTimestamp();
}
}
_edHistIdx = factory.findIndex(h => h && h.id === o.id);
if (_edHistIdx >= 0) factory.splice(_edHistIdx, 1);
}
const additionalCost = _freshFormula.additionalCost;
let baseCost = 0;
let rawMat = 0;
if (settings) {
baseCost = settings.reduce((acc, cur) => {
let liveItem = inventory.find(i => String(i.id) === String(cur.id));
if (!liveItem && cur.name) liveItem = inventory.find(i => i.name && i.name.trim().toLowerCase() === cur.name.trim().toLowerCase());
const liveCost = liveItem ? liveItem.cost : cur.cost;
return acc + (liveCost * cur.quantity);
}, 0) * units;
rawMat = settings.reduce((acc, cur) => acc + cur.quantity, 0) * units;
}
const totalCost = baseCost + (additionalCost * units);
let inventoryUpdated = false;
const materialsUsed = [];
if (settings && settings.length > 0) {
const _notInInventory = settings.filter(it => !inventory.find(i => String(i.id) === String(it.id)) && !(it.name && inventory.find(i => i.name && i.name.trim().toLowerCase() === it.name.trim().toLowerCase())));
if (_notInInventory.length) {
throw new Error(`Cannot produce: ${_notInInventory.map(m => '"' + m.name + '"').join(', ')} ${_notInInventory.length === 1 ? 'is' : 'are'} not in Raw Material Inventory. Add ${_notInInventory.length === 1 ? 'it' : 'them'} with the Add Raw Material button first.`);
}
const _shortages = [];
for (const it of settings) {
const inv0 = inventory.find(i => String(i.id) === String(it.id)) || (it.name && inventory.find(i => i.name && i.name.trim().toLowerCase() === it.name.trim().toLowerCase()));
const need = it.quantity * units;
if (inv0 && inv0.quantity + 1e-6 < need) _shortages.push({ name: inv0.name, have: inv0.quantity, need });
}
if (_shortages.length === 1) throw new Error(`Insufficient "${_shortages[0].name}" in inventory! Available: ${fmtNum(_shortages[0].have)} kg, Required: ${fmtNum(_shortages[0].need)} kg. Shortage: ${fmtNum(_shortages[0].need - _shortages[0].have)} kg`);
if (_shortages.length > 1) throw new Error(`Insufficient inventory for ${_shortages.length} materials:\n${_shortages.map(s => ` \u2022 ${s.name}: ${fmtNum(s.have)} kg available, ${fmtNum(s.need)} kg required (short ${fmtNum(s.need - s.have)} kg)`).join('\n')}`);
for (const item of settings) {
const materialUsed = item.quantity * units;
let inventoryItem = inventory.find(i => String(i.id) === String(item.id));
if (!inventoryItem && item.name) {
inventoryItem = inventory.find(i => i.name && i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
}
if (!inventoryItem) {
throw new Error(`Material "${item.name}" not found in inventory. Please re-save the formula in the Formula Store to relink all materials.`);
}
if (inventoryItem.quantity + 1e-6 >= materialUsed) {
inventoryItem.quantity -= materialUsed;
inventoryItem.quantity = Math.max(0, parseFloat(inventoryItem.quantity.toFixed(6)));
inventoryItem.totalValue = inventoryItem.quantity * inventoryItem.cost;
if (inventoryItem.conversionFactor && inventoryItem.conversionFactor !== 1) {
inventoryItem.purchaseQuantity = inventoryItem.quantity / inventoryItem.conversionFactor;
}
inventoryItem.updatedAt = getTimestamp();
inventoryUpdated = true;
materialsUsed.push({ id: inventoryItem.id, name: inventoryItem.name, quantity: materialUsed, cost: inventoryItem.cost });
} else {
throw new Error(`Insufficient "${inventoryItem.name}" in inventory! Available: ${fmtNum(inventoryItem.quantity)} kg, Required: ${fmtNum(materialUsed)} kg`);
}
}
}
const _gcFormula = (await getFormulaNames())[_sfpeType] || 'Formula';
const _gcLow = materialsUsed.map(m => { const inv = inventory.find(i => String(i.id) === String(m.id)); return inv && inv.quantity + 1e-6 < m.quantity ? `${m.name} (${fmtNum(inv.quantity)} kg left)` : null; }).filter(Boolean);
const _gcExtra = {
lead: _ed ? 'Update this factory production batch?' : 'Save this factory production batch?',
lines: [`Formula: ${_gcFormula}`, `Date: ${localDateStr()}`, `Units Produced: ${fmtNum(units)}`, `Total Cost: ${fmtAmt(totalCost)}`, `Cost Per Unit: ${fmtAmt(units > 0 ? totalCost / units : 0)}`],
notes: [`\u21A9 Raw materials deducted from inventory:`].concat(materialsUsed.map(m => ` \u2022 ${m.name}: ${fmtNum(m.quantity)} kg used`)),
confirmText: _ed ? 'Update Production' : 'Save Production'
};
if (_gcLow.length) _gcExtra.warning = `Low stock after this batch: ${_gcLow.join(', ')}. You cannot repeat a batch of this size.`;
if (!(await window.gcCommit(_gcExtra))) throw new Error('__GC_CANCEL__');
let factProdId = _ed ? _ed.id : generateUUID('fprod');
if (!validateUUID(factProdId)) factProdId = generateUUID('fprod');
const factProdCreatedAt = getTimestamp();
const _savedFormulaType = await getStorePool(currentFactoryEntryStore);
const productionRecord = {
id: factProdId,
date: localDateStr(),
time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
store: currentFactoryEntryStore,
formulaId: _savedFormulaType,
formulaName: (await getFormulaNames())[_savedFormulaType] || 'Formula',
units,
totalCost,
materialsCost: baseCost,
additionalCost: additionalCost * units,
rawMaterialsUsed: rawMat,
materialsUsed,
createdAt: factProdCreatedAt,
updatedAt: factProdCreatedAt,
timestamp: factProdCreatedAt,
syncedAt: new Date().toISOString(),
managedBy: (appMode === 'factory' && window._assignedManagerName) ? window._assignedManagerName : null,
createdBy: (appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null
};
if (_ed) {
const o = _ed.original;
stampEdit(productionRecord, o);
productionRecord.date = o.date;
productionRecord.time = o.time;
if (o.managedBy) productionRecord.managedBy = o.managedBy;
}
const validatedRecord = ensureRecordIntegrity(productionRecord, !!_ed);
if (_ed && _edHistIdx >= 0) factory.splice(_edHistIdx, 0, validatedRecord); else factory.unshift(validatedRecord);
await unifiedSave('factory', factory, validatedRecord);
_histSavedRec = validatedRecord;
if (inventoryUpdated) {
const inventoryIds = inventory.filter(i => i && i.id).map(i => i.id);
await unifiedSave('inventory', inventory, null, inventoryIds);
} else {
await unifiedSave('inventory', inventory);
}
notifyDataChange('factory');
emitSyncUpdate({ inventory: null, factory: null});
await syncFactoryProductionStats();
await refreshFactoryTab();
calculateNetCash();
calculateCashTracker();
if (_ed) endEditMode();
document.getElementById('factoryProductionUnits').value = '1';
showToast(_ed ? 'Production batch updated!' : 'Production saved successfully!', 'success');
} catch (error) {
inventory.length = 0;
inventory.push(...inventorySnapshot);
factory.length = 0;
factory.push(...historySnapshot);
try {
await sqliteStore.setBatch([
['inventory', inventory],
['factory', factory]
]);
} catch (rollbackError) {
console.error('Failed to save data locally.', _safeErr(rollbackError));
window.notifyBlocking('Production rollback failed: ' + (_safeErr(rollbackError).message || 'data may be inconsistent, please reload'), 'error', 'Something went wrong');
}
if (_histSavedRec) {
try {
if (_ed) await unifiedSave('factory', factory, _ed.original);
else await unifiedDelete('factory', factory, _histSavedRec.id, { strict: false }, _histSavedRec);
} catch (_undoErr) { console.error('Could not undo the saved batch record.', _safeErr(_undoErr)); }
}
if (error && error.message === '__GC_CANCEL__') return;
window.notifyBlocking(error.message || 'Failed to save production data. Please try again.', 'error', 'Something went wrong');
}
}

export function setFactorySummaryMode(mode, el) {
currentFactorySummaryMode = mode; window.currentFactorySummaryMode = currentFactorySummaryMode;
document.querySelectorAll('#tab-factory .toggle-group .toggle-opt').forEach(opt => opt.classList.remove('active'));
if (el) el.classList.add('active');
updateFactorySummaryCard();
_filterFactoryHistoryByMode(mode);
}

export async function setFactoryAvailableStore(pool) {
if (typeof window.syncFactoryAvailPicker === 'function') window.syncFactoryAvailPicker(pool);
await updateFactoryUnitsAvailableStats();
}

export async function renderFactoryHistory() {
const _fhBatch = await sqliteStore.getBatch(['factory','costs','defaults','inventory']);
const factory = ensureArray(_fhBatch.get('factory'));
const factoryAdditionalCosts = (_fhBatch.get('costs')) || {};
const factoryDefaultFormulas = (_fhBatch.get('defaults')) || {};
const inventory = ensureArray(_fhBatch.get('inventory'));
const _fhLabels = await getFormulaNames();
const list = document.getElementById('factoryHistoryList');
if (!list) return;
if (factory.length === 0) {
list.innerHTML = hcEmptyHtml('No recent activity');
return;
}
const _fhFrag = document.createDocumentFragment();
const recent = [...factory].sort((a, b) => {
const timeA = a.timestamp || new Date(a.date + ' ' + a.time).getTime();
const timeB = b.timestamp || new Date(b.date + ' ' + b.time).getTime();
return timeB - timeA;
});
for (const entry of recent) {
const dateObj = new Date(entry.date);
const dateStr = `${formatDayMonthYear(dateObj)} ${esc(entry.time || '')}`;
const _histFtype = entry.formulaId || '';
const badgeClass = 'factory-badge-formula';
const formulaLabel = esc(entry.formulaName || _fhLabels[_histFtype] || 'Formula');
const perUnitCost = entry.units > 0 ? entry.totalCost / entry.units : 0;
const additionalCostPerUnit = factoryAdditionalCosts[_histFtype] || 0;
const totalAdditionalCost = entry.additionalCost != null ? (parseFloat(entry.additionalCost) || 0) : additionalCostPerUnit * entry.units;
const _hasUsed = Array.isArray(entry.materialsUsed) && entry.materialsUsed.length > 0;
const formula = _hasUsed ? entry.materialsUsed : (factoryDefaultFormulas[_histFtype] || []);
let matsBreakdownHtml = '';
if (formula.length > 0) {
const matRows = formula.map(f => {
let inv = inventory.find(i => String(i.id) === String(f.id));
if (!inv && f.name) inv = inventory.find(i => i.name && i.name.trim().toLowerCase() === f.name.trim().toLowerCase());
const matName = esc(f.name || inv?.name || 'Material');
const qtyUsed = fmtNum(_hasUsed ? f.quantity : f.quantity * entry.units);
const unitCost = _hasUsed ? (f.cost != null ? f.cost : (inv ? inv.cost : 0)) : (inv ? inv.cost : (f.cost || 0));
const matCost = _hasUsed ? (unitCost * f.quantity) : (unitCost * f.quantity * entry.units);
return `<div class="hc-mat"><span class="hc-mat-name">${matName}</span><span class="hc-mat-val"><span>${qtyUsed} kg</span><span class="cost-val">${fmtAmt(matCost)}</span></span></div>`;
}).join('');
matsBreakdownHtml = `<details class="hc-more"><summary>Materials breakdown</summary><div class="hc-mats">${matRows}</div></details>`;
}
const factorySub = `${dateStr}${entry.managedBy ? `<span class="managed-by-badge">${esc(entry.managedBy)}</span>` : ''}${entry.createdBy && typeof _creatorBadgeHtml === 'function' ? _creatorBadgeHtml(entry) : ''}${_mergedBadgeHtml(entry)}`;
const div = hcCard({
tone: 'info', icon: 'factory', title: formulaLabel, titleHtml: formulaLabel,
sub: factorySub,
amount: await formatCurrency(entry.totalCost), tag: `${fmtNum(safeNumber(entry.units, 0))} units`, tagTone: 'good',
metrics: [
{ label: 'Material cost', value: await formatCurrency(entry.materialsCost || 0), cls: 'cost-val' },
{ label: 'Additional cost', value: totalAdditionalCost > 0 ? await formatCurrency(totalAdditionalCost) : '', cls: 'cost-val' },
{ label: 'Per unit cost', value: await formatCurrency(perUnitCost), cls: 'cost-val' },
{ label: 'Raw materials used', value: `${fmtNum(safeNumber(entry.rawMaterialsUsed, 0))} kg`, cls: 'qty-val' }
],
body: matsBreakdownHtml,
actions: entry.isMerged ? '' : actionRowHtml('factory', entry.id, `<button class="tbl-action-btn danger u-w-full u-mt-8" onclick="deleteFactoryEntry('${entry.id}')">Delete & Restore</button>`)
}, { attrs: { 'data-date': entry.date } });
_fhFrag.appendChild(div);
}
list.replaceChildren(_fhFrag);
_filterFactoryHistoryByMode(currentFactorySummaryMode || 'all');
}

export async function deleteFactoryEntry(id) {
const { factory, inventory } = await loadCollections('factory', 'inventory');
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
if (!id || !validateUUID(id)) { window.notifyBlocking('Invalid factory entry ID', 'error', 'Something went wrong'); return; }
const entryIndex = factory.findIndex(e => e.id === id);
if (entryIndex === -1) { await refreshFactoryTab(); return; }
const entry = factory[entryIndex];
if (entry.isMerged) { window.notifyBlocking('Merged opening balance records cannot be deleted', 'warning', 'Action not allowed'); return; }
const _feFormulaKey = entry.formulaId || (await getStorePool(entry.store));
const _feRestore = (Array.isArray(entry.materialsUsed) && entry.materialsUsed.length > 0)
? entry.materialsUsed.map(m => ({ id: m.id, name: m.name, quantity: m.quantity }))
: (factoryDefaultFormulas[_feFormulaKey] || []).map(f => ({ id: f.id, name: f.name, quantity: f.quantity * entry.units }));
const _feMatsDetail = _feRestore.length > 0
? _feRestore.map(f => {
let inv = inventory.find(i => String(i.id) === String(f.id));
if (!inv && f.name) inv = inventory.find(i => i.name && i.name.trim().toLowerCase() === f.name.trim().toLowerCase());
return ` • ${inv?.name || f.name || 'Material'}: ${fmtNum(f.quantity)} kg restored`;
}).join('\n')
: '';
{
const _feUsed = await _usedUnitsOfBatch(entry);
if (_feUsed > 0) { window.notifyBlocking(_usedBatchMessage(_feUsed, entry, 'delete'), 'warning', 'Action not allowed'); return; }
const _feTracking = await updateFormulaInventory();
const _feAvail = _feTracking?.[_feFormulaKey]?.available || 0;
if (_feAvail + 1e-9 < (entry.units || 0)) {
window.notifyBlocking(`Cannot delete: ${fmtNum((entry.units || 0) - _feAvail)} unit${((entry.units || 0) - _feAvail) === 1 ? '' : 's'} of this batch already used in manufacturing entries. Delete those first.`, 'warning', 'Action not allowed');
return;
}
}
let _feMsg = `Delete this factory production batch permanently?`;
_feMsg += `\nFormula: ${entry.formulaName || _feFormulaKey}\nDate: ${entry.date}\nUnits Produced: ${entry.units}`;
if (entry.totalCost) _feMsg += `\nTotal Cost: ${fmtAmt(entry.totalCost || 0)}`;
_feMsg += _feMatsDetail ? `\n\n↩ Raw materials restored to inventory:\n${_feMatsDetail}` : `\n\n↩ Raw materials used in this batch will be restored to inventory.`;
_feMsg += `\n\n Sales already made from this batch will NOT be reversed — but available stock will change.\n\nThis cannot be undone.`;
if (await showGlassConfirm(_feMsg, { title: 'Delete Factory Production', confirmText: 'Delete', danger: true })) {
try {
entry.deletedAt = getTimestamp();
entry.updatedAt = getTimestamp();
ensureRecordIntegrity(entry, true);
let restoredMaterials = [];
for (const formulaItem of _feRestore) {
const materialToRestore = formulaItem.quantity;
let inventoryItem = inventory.find(i => String(i.id) === String(formulaItem.id));
if (!inventoryItem && formulaItem.name) {
inventoryItem = inventory.find(i => i.name && i.name.trim().toLowerCase() === formulaItem.name.trim().toLowerCase());
}
if (inventoryItem) {
inventoryItem.quantity = parseFloat(((inventoryItem.quantity || 0) + materialToRestore).toFixed(6));
inventoryItem.totalValue = inventoryItem.quantity * inventoryItem.cost;
if (inventoryItem.conversionFactor && inventoryItem.conversionFactor !== 1) {
inventoryItem.purchaseQuantity = inventoryItem.quantity / inventoryItem.conversionFactor;
}
inventoryItem.updatedAt = getTimestamp();
ensureRecordIntegrity(inventoryItem, true);
restoredMaterials.push({ name: inventoryItem.name || 'Unknown', quantity: materialToRestore });
}
}
factory.splice(entryIndex, 1);
const inventoryIds = inventory.filter(i => i && i.id).map(i => i.id);
await Promise.all([
unifiedDelete('factory', factory, id, { strict: true }, entry),
unifiedSave('inventory', inventory, null, inventoryIds)
]);
await refreshFactoryTab();
calculateNetCash();
calculateCashTracker();
notifyDataChange('factory');
} catch (error) {
window.notifyBlocking(' Failed to delete entry. Please try again.', 'error', 'Something went wrong');
}
}
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
if (indicator) { indicator.className = `units-available-indicator ${indicatorClass}`; indicator.textContent = `${fmtNum(available || 0)} units available${_uaiLabel ? ' · ' + _uaiLabel : ''}`; }
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
currentStore = store; window.currentStore = currentStore;
const salePrice = await getSalePriceForStore(store);
const _setStore = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setStore('production-sale-price-display', `${fmtNum(safeValue(salePrice))}/kg`);
_setStore('profit-sale-price', `${fmtNum(safeValue(salePrice))}/kg`);
calculateDynamicProductionCost();
updatePaymentStatusVisibility();
if (typeof refreshUI === 'function') refreshUI();
}

export function calcNet() {
const g = readNum('gross-wt');
const c = readNum('cont-wt');
document.getElementById('net-wt').value = safeNumber(Math.max(0, g - c), 0).toFixed(2);
calculateDynamicProductionCost();
}

export async function deleteProdEntry(id) {
const { sales, production } = await loadCollections('sales', 'production');
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
if (!id || !validateUUID(id)) { window.notifyBlocking('Invalid production record ID', 'error', 'Something went wrong'); return; }
const entryToDelete = production.find(item => item.id === id);
if (!entryToDelete) return;
if (entryToDelete.isMerged) { window.notifyBlocking('Merged opening balance records cannot be deleted', 'warning', 'Action not allowed'); return; }
if (entryToDelete.isTransfer === true) {
if (typeof deleteStockTransfer === 'function') await deleteStockTransfer(entryToDelete.transferPairId);
return;
}
const isReturn = entryToDelete.isReturn === true;
if (isReturn) {
const _lk = await findCalcLinkForReturn(entryToDelete);
if (_lk) { window.notifyBlocking(`This return belongs to ${_lk.entry.seller}'s calculator record of ${_lk.entry.date}. Delete that calculator record to remove it.`, 'warning', 'Warning'); return; }
}
const _dpStoreLabel = getStoreLabel(entryToDelete.store) || entryToDelete.store;
const _retLog = isReturn ? findReturnLogFor(entryToDelete, ensureArray(await sqliteStore.get('returns'))) : null;
const _stockDrop = isReturn ? getReturnStockDrop(entryToDelete, _retLog) : (entryToDelete.net || 0);
if (_stockDrop > 0 && typeof window.computeStoreStockSnapshot === 'function') {
const _snap = await window.computeStoreStockSnapshot(entryToDelete.store, entryToDelete.date);
if (_snap.available - _stockDrop < -0.0001) {
window.notifyBlocking(`Cannot delete: ${fmtNum(_stockDrop)} kg of ${_dpStoreLabel} stock on ${entryToDelete.date} was already sold. Delete those sales first.`, 'warning', 'Action not allowed');
return;
}
}
const _dpSalesOnDate = (typeof sales !== 'undefined' ? sales : []).filter(s => s.date === entryToDelete.date && s.store === entryToDelete.store).length;
let confirmMsg;
if (isReturn) {
confirmMsg = `Remove this stock return record?`;
confirmMsg += `\nStore: ${_dpStoreLabel}\nDate: ${entryToDelete.date}\nQty Returned: ${entryToDelete.net} kg`;
confirmMsg += _retLog
? `\n\n↩ This will DECREASE available stock by ${_stockDrop} kg on ${entryToDelete.date} (its return log is removed with it).`
: `\n\nNo return log is attached to this record, so available stock will not change.`;
if (_dpSalesOnDate > 0) confirmMsg += ` ${_dpSalesOnDate} sale${_dpSalesOnDate !== 1 ? 's' : ''} exist on this date — those records may be affected.`;
} else {
confirmMsg = `Permanently delete this production record?`;
confirmMsg += `\nStore: ${_dpStoreLabel}\nDate: ${entryToDelete.date}\nNet Qty: ${entryToDelete.net} kg`;
if (entryToDelete.gross) confirmMsg += `\nGross / Tare: ${entryToDelete.gross} / ${fmtNum((entryToDelete.gross || 0) - (entryToDelete.net || 0))} kg`;
confirmMsg += `\n\n↩ ${entryToDelete.net} kg will be removed from ${entryToDelete.date} inventory.`;
if (_dpSalesOnDate > 0) confirmMsg += `\n\n ${_dpSalesOnDate} sale${_dpSalesOnDate !== 1 ? 's' : ''} on this date for ${_dpStoreLabel} will remain on record, but available stock will drop.`;
}
confirmMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: isReturn ? 'Remove Return' : 'Delete Production', confirmText: isReturn ? 'Remove' : 'Delete', danger: true })) {
try {
const record = production.find(item => item.id === id);
if (record) { record.deletedAt = getTimestamp(); record.updatedAt = getTimestamp(); ensureRecordIntegrity(record, true); }
const dbWithoutDeleted = production.filter(item => item.id !== id);
let _snapRec = record || null;
if (isReturn && record) {
const _grp = newGroupId('ret');
_snapRec = stampGroup({ ...record, [DELETE_ORIGIN_FIELD]: 'prod-tab' }, _grp);
if (_retLog) {
const _logs = ensureArray(await sqliteStore.get('returns'));
await unifiedDelete('returns', _logs.filter(l => l.id !== _retLog.id), _retLog.id, { strict: true }, stampGroup({ ..._retLog, [DELETE_ORIGIN_FIELD]: 'prod-tab' }, _grp));
}
}
await unifiedDelete('production', dbWithoutDeleted, id, { strict: true }, _snapRec);
notifyDataChange('production');
void syncFactoryProductionStats().catch(() => {});
await refreshUI();
calculateNetCash();
calculateCashTracker();
const deletedQuantity = entryToDelete.net || 0;
} catch (error) {
window.notifyBlocking(' Failed to delete entry. Please try again.', 'error', 'Something went wrong');
}
}
}

window.getCostPerUnit = getCostPerUnit;
window.calculateFactoryInventoryValue = calculateFactoryInventoryValue;
window.updateFactoryInventoryDisplay = updateFactoryInventoryDisplay;
window.calculatePaymentSummaries = calculatePaymentSummaries;
window.openFactoryInventoryModal = openFactoryInventoryModal;
window.closeFactoryInventoryModal = closeFactoryInventoryModal;
window.clearFactoryInventoryForm = clearFactoryInventoryForm;
window.editFactoryInventoryItem = editFactoryInventoryItem;
window.updateFactoryKgCalculation = updateFactoryKgCalculation;
window.showSupplierUnlinkOption = showSupplierUnlinkOption;
window.unlinkSupplierConfirmation = unlinkSupplierConfirmation;
window.saveFactoryInventoryItem = saveFactoryInventoryItem;
window.unlinkSupplierFromMaterial = unlinkSupplierFromMaterial;
window.createSupplierFromMaterial = createSupplierFromMaterial;
window.renderFactoryInventory = renderFactoryInventory;
window.unlinkSupplierFromMaterialById = unlinkSupplierFromMaterialById;
window.toggleSupplierFields = toggleSupplierFields;
window.setFactorySupplierType = setFactorySupplierType;
window.loadExistingSuppliers = loadExistingSuppliers;
window.linkMaterialToSupplier = linkMaterialToSupplier;
window.selectFactoryFormula = selectFactoryFormula;
window.getSalePriceForStore = getSalePriceForStore;
window.getEffectiveSalePriceForCustomer = getEffectiveSalePriceForCustomer;
window.getReconciledRepReturnIds = getReconciledRepReturnIds;
window.getSaleTransactionValue = getSaleTransactionValue;
window.getCostPriceForStore = getCostPriceForStore;
window.getStorePricing = getStorePricing;
window.calculateFactoryProduction = calculateFactoryProduction;
window.saveFactoryProductionEntry = saveFactoryProductionEntry;
window.setFactorySummaryMode = setFactorySummaryMode;
window.setFactoryAvailableStore = setFactoryAvailableStore;
window.renderFactoryHistory = renderFactoryHistory;
window.deleteFactoryEntry = deleteFactoryEntry;
window.calculateDynamicCost = calculateDynamicCost;
window.calculateSalesCostPerKg = calculateSalesCostPerKg;
window.updateFormulaInventory = updateFormulaInventory;
window.syncFactoryProductionStats = syncFactoryProductionStats;
window.validateFormulaAvailability = validateFormulaAvailability;
window.updateUnitsAvailableIndicator = updateUnitsAvailableIndicator;
window.calculateDynamicProductionCost = calculateDynamicProductionCost;
window.updateProductionCostOnStoreChange = updateProductionCostOnStoreChange;
window.calcNet = calcNet;
window.deleteProdEntry = deleteProdEntry;
