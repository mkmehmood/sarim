function setSalesSummaryMode(mode) {
currentSalesSummaryMode = mode;
const labels = { day:'Daily', week:'Weekly', month:'Monthly', year:'Yearly', all:'All Time' };
const prefixes = ['day','week','month','year','all'];
prefixes.forEach(p => {
const btn = document.getElementById(`ss-${p}-btn`);
if (btn) btn.className = 'toggle-opt' + (p === mode ? ' active' : '');
});
const titleEl = document.getElementById('sales-summary-title');
const qtyEl = document.getElementById('cust-active-qty');
const valueEl = document.getElementById('cust-active-value');
const cashEl = document.getElementById('cust-active-cash');
const creditEl = document.getElementById('cust-active-credit');
const profitEl = document.getElementById('cust-active-profit');
if (titleEl) titleEl.textContent = `${labels[mode]} Sales`;
if (qtyEl) qtyEl.textContent = (document.getElementById(`cust-${mode}-qty`) ?.textContent || '0.00 kg');
if (valueEl) valueEl.textContent = (document.getElementById(`cust-${mode}-value`) ?.textContent || '0.00');
if (cashEl) cashEl.textContent = (document.getElementById(`cust-${mode}-cash`) ?.textContent || '0.00');
if (creditEl) creditEl.textContent = (document.getElementById(`cust-${mode}-credit`)?.textContent || '0.00');
if (profitEl) profitEl.textContent = (document.getElementById(`cust-${mode}-profit`)?.textContent || '0.00');
const card = document.getElementById('sales-summary-card');
if (card) {
if (mode === 'all') card.classList.add('all-times-summary');
else card.classList.remove('all-times-summary');
}
const refDate = (document.getElementById('cust-date') || {}).value || new Date().toISOString().split('T')[0];
_filterHistoryByPeriod('#custHistoryList', refDate, mode);
}
let currentPerfOverviewMode = 'day';
function setPerfOverviewMode(mode) {
currentPerfOverviewMode = mode;
const prefixes = ['day','week','month','year','all'];
prefixes.forEach(p => {
const btn = document.getElementById(`po-${p}-btn`);
if (btn) btn.className = 'toggle-opt' + (p === mode ? ' active' : '');
});
const ghostMap = { day:'dailyReport', week:'weeklyReport', month:'monthlyReport', year:'yearlyReport', all:'allTimeReport' };
const ghostEl = document.getElementById(ghostMap[mode]);
const activeEl = document.getElementById('activeReport');
if (activeEl && ghostEl) activeEl.innerHTML = ghostEl.innerHTML;
const refDate = (document.getElementById('sale-date') || {}).value || new Date().toISOString().split('T')[0];
_filterHistoryByPeriod('#historyList', refDate, mode);
}
function setOverviewMode(mode) {
currentOverviewMode = mode;
const buttons = ['day', 'week', 'month', 'year', 'all'];
buttons.forEach(btnMode => {
const btn = document.getElementById(`overview-${btnMode}-btn`);
if (btn) {
if (btnMode === mode) btn.classList.add('active');
else btn.classList.remove('active');
}
});
updateAllStoresOverview(mode);
refreshUI();
}
async function deleteSalesEntry(id) {
try {
let history; history = await idb.get('noman_history', []);
const entryToDelete = history.find(h => h.id === id);
if (entryToDelete && entryToDelete.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
if (entryToDelete) {
const linkedCount = entryToDelete.linkedSalesIds ? entryToDelete.linkedSalesIds.length : 0;
const linkedRepCount = entryToDelete.linkedRepSalesIds ? entryToDelete.linkedRepSalesIds.length : 0;
let confirmMsg = `Permanently delete this sales settlement record?`;
confirmMsg += `\n\nSeller: ${entryToDelete.seller}`;
confirmMsg += `\nDate: ${entryToDelete.date}`;
confirmMsg += `\nTotal Sold: ${entryToDelete.sold || 0} kg`;
confirmMsg += `\nCash Received: ${(entryToDelete.received||0)}`;
if (entryToDelete.credit) confirmMsg += `\nCredit Recovered: ${entryToDelete.credit}`;
const _dsHasImpact = linkedCount > 0 || linkedRepCount > 0 || (entryToDelete.returned > 0 && entryToDelete.returnStore);
if (_dsHasImpact) {
confirmMsg += `\n\n\u26a0 The following cascading changes will occur:`;
if (linkedCount > 0) confirmMsg += `\n \u2022 ${linkedCount} linked sale${linkedCount !== 1 ? 's' : ''} will REVERT to "Pending Credit" status.`;
if (linkedRepCount > 0) confirmMsg += `\n \u2022 ${linkedRepCount} rep sale${linkedRepCount !== 1 ? 's' : ''} will be RESTORED to calculator fields.`;
if (entryToDelete.returned > 0 && entryToDelete.returnStore) confirmMsg += `\n \u2022 ${entryToDelete.returned} kg will be REMOVED from ${getStoreLabel(entryToDelete.returnStore)} inventory (return reversal).`;
}
if (await showGlassConfirm(confirmMsg, { title: `Delete ${entryToDelete.seller || "Sales"} Record`, confirmText: "Delete", danger: true })) {
await registerDeletion(id, 'calculator_history');
let revertedSalesCount = 0;
let revertedRepSalesCount = 0;
let reversedReturnQty = 0;
if (entryToDelete.linkedSalesIds && entryToDelete.linkedSalesIds.length > 0) {
revertedSalesCount = await revertSpecificSalesEntries(entryToDelete.linkedSalesIds);
}
if (entryToDelete.linkedRepSalesIds && entryToDelete.linkedRepSalesIds.length > 0) {
revertedRepSalesCount = await revertRepSalesEntries(entryToDelete.linkedRepSalesIds);
}
if (entryToDelete.returned > 0 && entryToDelete.returnStore) {
reversedReturnQty = entryToDelete.returned;
await reverseReturnFromProduction(entryToDelete.returnStore, entryToDelete.returned, entryToDelete.date);
}
const newHistory = history.filter(h => h.id !== id);
await unifiedDelete('noman_history', newHistory, id);
if (Array.isArray(salesHistory)) {
const idx = salesHistory.findIndex(h => h.id === id);
if (idx !== -1) salesHistory.splice(idx, 1);
}
refreshAllCalculations();
await loadSalesData(currentCompMode);
await refreshCustomerSales();
if (typeof refreshUI === 'function') await refreshUI();
updateAllStoresOverview(currentOverviewMode);
notifyDataChange('calculator');
let successMsg = ' Record deleted successfully!';
if (revertedSalesCount > 0) {
successMsg += ` ${revertedSalesCount} sales reverted to pending credit.`;
}
if (revertedRepSalesCount > 0) {
successMsg += ` ${revertedRepSalesCount} rep sales restored to calculator fields.`;
}
if (reversedReturnQty > 0) {
successMsg += ` ${reversedReturnQty} kg return removed from inventory.`;
}
showToast(successMsg, 'success');
}
} else {
showToast("Error: Record not found.", "error");
}
} catch (error) {
showToast("Failed to delete entry. Please try again.", "error");
}
}
async function revertSpecificSalesEntries(saleIds) {
if (!saleIds || saleIds.length === 0) return 0;
let revertedCount = 0;
saleIds.forEach(saleId => {
const saleIndex = customerSales.findIndex(s => s.id === saleId);
if (saleIndex !== -1) {
const sale = customerSales[saleIndex];
sale.creditReceived = false;
sale.paymentType = 'CREDIT';
delete sale.creditReceivedDate;
delete sale.creditReceivedTime;
revertedCount++;
}
});
if (revertedCount > 0) {
await saveWithTracking('customer_sales', customerSales);
const revertedSales = customerSales.filter(s => saleIds.includes(s.id));
for (const sale of revertedSales) {
await saveRecordToFirestore('customer_sales', sale);
}
if (typeof refreshCustomerSales === 'function') {
refreshCustomerSales(1, true);
}
notifyDataChange('sales');
triggerAutoSync();
}
return revertedCount;
}
let entityViewMode = 'detailed';
function toggleEntityViewMode() {
const toggleBtn = document.getElementById('entityViewModeToggle');
const entityGrid = document.getElementById('entityCardsGrid');
if (entityViewMode === 'detailed') {
entityViewMode = 'compact';
entityGrid.classList.add('compact');
toggleBtn.title = "Switch to Detailed View";
toggleBtn.textContent = '';
} else {
entityViewMode = 'detailed';
entityGrid.classList.remove('compact');
toggleBtn.title = "Switch to Compact View";
toggleBtn.textContent = '';
}
renderEntityTable();
}
function calculateEntityBalances() {
const supplierIdSet = new Set();
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(m => {
if (m.supplierId) supplierIdSet.add(String(m.supplierId));
});
}
const balances = {};
paymentEntities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
balances[entity.id] = 0;
});
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0) {
const sid = String(material.supplierId);
for (const entityId in balances) {
if (String(entityId) === sid) {
balances[entityId] += parseFloat(material.totalPayable) || 0;
break;
}
}
}
});
}
if (typeof paymentTransactions !== 'undefined') {
paymentTransactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (supplierIdSet.has(String(transaction.entityId))) return;
if (balances[transaction.entityId] !== undefined) {
if (transaction.type === 'OUT') {
balances[transaction.entityId] -= parseFloat(transaction.amount) || 0;
} else if (transaction.type === 'IN') {
balances[transaction.entityId] += parseFloat(transaction.amount) || 0;
}
}
});
}
return balances;
}
function getDynamicRole(balance) {
if (balance > 0.01) {
return {
label: 'Payable',
icon: '',
colorClass: 'entity-balance-negative',
badgeColor: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
sign: '+'
};
} else if (balance < -0.01) {
return {
label: 'Receivable',
icon: '',
colorClass: 'entity-balance-positive',
badgeColor: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
sign: ''
};
} else {
return {
label: 'Settled',
icon: '',
colorClass: 'entity-balance-neutral',
badgeColor: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
sign: ''
};
}
}
function filterEntityCards() {
const searchTerm = document.getElementById('entity-list-search').value.toLowerCase().trim();
const entityCards = document.querySelectorAll('#entityCardsGrid .entity-card-compact');
if (!searchTerm) {
entityCards.forEach(card => card.style.display = '');
return;
}
entityCards.forEach(card => {
const entityName = card.querySelector('.entity-name').textContent.toLowerCase();
const entityType = card.querySelector('.entity-type-badge').textContent.toLowerCase();
const entityPhone = card.querySelector('.entity-contact')?.textContent?.toLowerCase() || '';
const cardText = (entityName + ' ' + entityType + ' ' + entityPhone).toLowerCase();
if (cardText.includes(searchTerm)) {
card.style.display = '';
} else {
card.style.display = 'none';
}
});
}
function openEntityManagement() {
editingEntityId = null;
document.getElementById('entityName').value = '';
document.getElementById('entityPhone').value = '';
document.getElementById('entityWallet').value = '';
const _entMT1 = document.getElementById('entityManagementModalTitle'); if (_entMT1) _entMT1.innerText = 'Add New Entity';
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('entityManagementOverlay').style.display = 'flex';
});
}
function closeEntityManagement() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
const _entMOClose = document.getElementById('entityManagementOverlay');
if (_entMOClose) { _entMOClose.style.display = 'none'; _entMOClose.style.zIndex = ''; }
const detailsOverlay = document.getElementById('entityDetailsOverlay');
if (detailsOverlay && detailsOverlay.style.display === 'flex' && currentEntityId) {
const entity = paymentEntities.find(e => String(e.id) === String(currentEntityId));
if (entity) renderEntityOverlayContent(entity);
}
});
}
async function saveEntity() {
const name = document.getElementById('entityName').value.trim();
const phone = document.getElementById('entityPhone').value.trim();
const wallet = document.getElementById('entityWallet').value.trim();
const existingEntity = editingEntityId ? paymentEntities.find(e => String(e.id) === String(editingEntityId)) : null;
const entityTxs = existingEntity
? paymentTransactions.filter(t => String(t.entityId) === String(existingEntity.id))
: [];
const hasIN = entityTxs.some(t => t.type === 'IN');
const hasOUT = entityTxs.some(t => t.type === 'OUT');
const type = (hasIN && !hasOUT) ? 'payor' : 'payee';
if (!name) {
showToast("Please enter an entity name", "warning");
return;
}
const exists = paymentEntities.some(e => e && e.name && e.name.toLowerCase() === name.toLowerCase() && e.id !== editingEntityId);
if(exists) {
showToast("An entity with this name already exists", "warning");
return;
}
try {
if (editingEntityId) {
const index = paymentEntities.findIndex(e => e.id === editingEntityId);
if (index !== -1) {
paymentEntities[index] = {
...paymentEntities[index],
name,
type,
phone,
wallet,
updatedAt: getTimestamp()
};
showToast("Entity updated successfully", "success");
}
} else {
let entityId = generateUUID('ent');
if (!validateUUID(entityId)) {
entityId = generateUUID('ent');
}
let newEntity = {
id: entityId,
name,
type,
phone,
wallet,
createdAt: getTimestamp(),
updatedAt: getTimestamp(),
syncedAt: new Date().toISOString()
};
newEntity = ensureRecordIntegrity(newEntity, false);
paymentEntities.push(newEntity);
showToast("New entity added", "success");
}
const savedEntity = editingEntityId
? paymentEntities.find(e => e.id === editingEntityId)
: paymentEntities[paymentEntities.length - 1];
await unifiedSave('payment_entities', paymentEntities, savedEntity);
emitSyncUpdate({ payment_entities: paymentEntities });
notifyDataChange('entities');
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
closeEntityManagement();
if (typeof renderEntityTable === 'function') await renderEntityTable(1);
if (typeof calculateNetCash === 'function') calculateNetCash();
} catch (error) {
showToast('Failed to save entity. Please try again.', 'error');
}
}
function editEntityBasicInfo(id) {
const entity = paymentEntities.find(e => String(e.id) === String(id));
if (entity) {
editingEntityId = id;
document.getElementById('entityName').value = entity.name;
document.getElementById('entityPhone').value = entity.phone || '';
document.getElementById('entityWallet').value = entity.wallet || '';
const _entMT2 = document.getElementById('entityManagementModalTitle'); if (_entMT2) _entMT2.innerText = 'Edit Entity Info';
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
const _entMO = document.getElementById('entityManagementOverlay'); if (_entMO) _entMO.style.display = 'flex';
});
}
}
async function refreshPaymentTab(force = false) {
try {
if (idb && idb.getBatch) {
const paymentKeys = ['expenses', 'payment_entities', 'payment_transactions'];
const paymentDataMap = await idb.getBatch(paymentKeys);
if (paymentDataMap.get('expenses')) {
let freshExpenses = paymentDataMap.get('expenses') || [];
let fixedCount = 0;
if (Array.isArray(freshExpenses) && freshExpenses.length > 0) {
freshExpenses = freshExpenses.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('expenses', freshExpenses);
}
}
expenses = freshExpenses;
}
if (paymentDataMap.get('payment_entities')) {
let freshEntities = paymentDataMap.get('payment_entities') || [];
let fixedCount = 0;
if (Array.isArray(freshEntities) && freshEntities.length > 0) {
freshEntities = freshEntities.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('payment_entities', freshEntities);
}
}
paymentEntities = freshEntities;
}
if (paymentDataMap.get('payment_transactions')) {
let freshTransactions = paymentDataMap.get('payment_transactions') || [];
let fixedCount = 0;
if (Array.isArray(freshTransactions) && freshTransactions.length > 0) {
freshTransactions = freshTransactions.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('payment_transactions', freshTransactions);
}
}
paymentTransactions = freshTransactions;
}
}
await syncSuppliersToEntities();
try { calculateNetCash(); } catch (e) {
showToast('Calculation failed.', 'error');
console.error('calculateNetCash error:', e);
}
try { calculatePaymentSummaries(); } catch (e) {
showToast('Calculation failed.', 'error');
console.error('calculatePaymentSummaries error:', e);
}
try { renderUnifiedTable(); } catch (e) {
showToast('Calculation failed.', 'error');
console.error('renderUnifiedTable error:', e);
}
try { updateExpenseBreakdown(); } catch (e) {
showToast('Calculation failed.', 'error');
console.error('updateExpenseBreakdown error:', e);
}
try { calculateCashTracker(); } catch (e) {
showToast('Calculation failed.', 'error');
console.error('calculateCashTracker error:', e);
}
const historyList = document.getElementById('paymentHistoryList');
if (!historyList) {
return;
}
historyList.innerHTML = '';
const sortedTransactions = [...paymentTransactions].sort((a, b) => b.timestamp - a.timestamp);
sortedTransactions.forEach(transaction => {
const entity = paymentEntities.find(e => String(e.id) === String(transaction.entityId));
const badgeClass = transaction.type === 'IN' ? 'transaction-in' : 'transaction-out';
const badgeText = transaction.type === 'IN' ? 'IN' : 'OUT';
const entityName = entity ? entity.name : (transaction.entityName || 'Unknown Entity');
const entityType = entity ? entity.type : (transaction.entityType || 'Unknown');
const isMerged = transaction.isMerged === true;
const mergedBadge = isMerged ? _mergedBadgeHtml(transaction, {inline:true}) : '';
const deleteButton = isMerged ? '' : `<button class="tbl-action-btn danger u-w-full u-mt-8" onclick="(async () => { await deletePaymentTransaction('${esc(transaction.id)}') })()">Delete</button>`;
const card = document.createElement('div');
card.className = 'card liquid-card';
if (transaction.date) card.setAttribute('data-date', transaction.date);
card.innerHTML = `
<span class="transaction-badge ${badgeClass}">${badgeText}</span>
<h4>${formatDisplayDate(transaction.date)} @ ${esc(transaction.time || 'N/A')}</h4>
<div class="customer-name">${esc(entityName)}${mergedBadge}</div>
<p><span>Type:</span> <span>${esc(entityType)}</span></p>
<p><span>Description:</span> <span>${esc(transaction.description || 'No description')}</span></p>
<hr>
<p><span>Amount:</span> <span class="${transaction.type === 'IN' ? 'profit-val' : 'cost-val'}">${safeValue(transaction.amount).toFixed(2)}</span></p>
${deleteButton}
`;
historyList.appendChild(card);
});
if (sortedTransactions.length === 0) {
historyList.innerHTML = '<p style="text-align:center; color:var(--text-muted); width:100%; font-size:0.85rem;">No payment transactions found.</p>';
}
_filterPaymentHistoryByPeriod();
} catch (error) {
console.error('Payment transaction failed.', error);
showToast('Payment transaction failed.', 'error');
}
}
function selectEntity(id) {
selectedEntityId = id;
const entity = paymentEntities.find(e => String(e.id) === String(id));
const entityInput = document.getElementById('paymentEntity');
if (entity && entityInput) {
entityInput.value = entity.name;
entityInput.setAttribute('data-entity-id', id);
}
document.querySelectorAll('#entityCardsGrid .entity-card-compact').forEach(card => {
card.classList.remove('active');
if (String(card.dataset.id) === String(id)) {
card.classList.add('active');
setTimeout(() => {
card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}, 100);
}
});
document.querySelectorAll('.entity-chip').forEach(chip => {
chip.classList.remove('active');
if (String(chip.dataset.id) === String(id)) {
chip.classList.add('active');
}
});
}
function refreshEntityBalances() {
renderEntityTable();
}
function getMetricValue(historyItem, metric) {
switch(metric) {
case 'weight':
return ((historyItem.totalSold || 0) - (historyItem.returned || 0)) || 0;
case 'value':
return historyItem.revenue || 0;
case 'cost':
return historyItem.totalCost || 0;
case 'profit':
return historyItem.profit || 0;
case 'cash':
return (historyItem.received || 0);
case 'credit':
return historyItem.creditValue || 0;
default:
return 0;
}
}
function getMetricLabel(metric) {
switch(metric) {
case 'weight': return 'Weight (kg)';
case 'value': return 'Revenue ()';
case 'cost': return 'Cost ()';
case 'profit': return 'Profit ()';
case 'cash': return 'Cash ()';
case 'credit': return 'Credit ()';
default: return 'Metric';
}
}
async function deleteFactoryInventoryItem() {
if (editingFactoryInventoryId) {
const _diMat = factoryInventoryData.find(i => i.id === editingFactoryInventoryId);
const _diName = _diMat?.name || 'this item';
const _diQty = (_diMat?.quantity || 0).toFixed(2);
const _diVal = (_diMat?.totalValue || 0).toFixed(2);
const _diSupplier = _diMat?.supplierName || null;
const _diLinkedTx = _diMat?.supplierId ? paymentTransactions.filter(t => String(t.materialId) === String(editingFactoryInventoryId) && t.isPayable === true) : [];
let _diMsg = `Permanently delete inventory item "${_diName}"?`;
_diMsg += `\nCurrent Stock: ${_diQty} kg`;
_diMsg += `\nTotal Value: ${_diVal}`;
if (_diSupplier) {
_diMsg += `\nLinked Supplier: ${_diSupplier}`;
_diMsg += `\n\n\u21a9 Supplier association will be removed.`;
if (_diLinkedTx.length > 0) {
const _diTxTotal = _diLinkedTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
_diMsg += ` ${_diLinkedTx.length} payment transaction${_diLinkedTx.length !== 1 ? 's' : ''} totaling ${_diTxTotal.toFixed(2)} will be reversed and the supplier\'s payable status reset.`;
}
}
_diMsg += `\n\n\u26a0 If this material is used in production formulas, those formulas will be affected.`;
_diMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_diMsg, { title: `Delete "${_diName}"`, confirmText: "Delete", danger: true })) {
try {
const material = factoryInventoryData.find(i => i.id === editingFactoryInventoryId);
if (material && material.supplierId) {
await unlinkSupplierFromMaterial(material);
}
await registerDeletion(editingFactoryInventoryId, 'inventory');
factoryInventoryData = factoryInventoryData.filter(item => item.id !== editingFactoryInventoryId);
hasChanges = true;
await unifiedDelete('factory_inventory_data', factoryInventoryData, editingFactoryInventoryId);
notifyDataChange('inventory');
triggerAutoSync();
closeFactoryInventoryModal();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof calculateNetCash === 'function') calculateNetCash();
showToast("Inventory item deleted!", 'success');
} catch (error) {
showToast('Failed to delete item. Please try again.', 'error');
}
}
}
}
async function initPaymentData() {
try {
paymentEntities = await idb.get('payment_entities', []);
paymentTransactions = await idb.get('payment_transactions', []);
if (!Array.isArray(paymentEntities)) paymentEntities = [];
if (!Array.isArray(paymentTransactions)) paymentTransactions = [];
paymentEntities = paymentEntities.map(entity => {
let updated = false;
if (!entity.id) {
entity.id = generateUUID('ent');
updated = true;
}
if (!entity.createdAt) {
entity.createdAt = entity.timestamp || getTimestamp();
updated = true;
}
if (!entity.updatedAt) {
entity.updatedAt = entity.timestamp || getTimestamp();
updated = true;
}
if (!entity.type) {
entity.type = 'payee';
updated = true;
}
if (entity.phone === undefined) {
entity.phone = '';
updated = true;
}
if (entity.wallet === undefined) {
entity.wallet = '';
updated = true;
}
return entity;
});
paymentTransactions = paymentTransactions.map(transaction => {
let updated = false;
if (!transaction.id) {
transaction.id = generateUUID('pay');
updated = true;
}
if (!transaction.timestamp && transaction.date) {
try {
const dateParts = transaction.date.split('-');
if (dateParts.length === 3) {
const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
if (!isNaN(date.getTime())) {
transaction.timestamp = date.getTime();
updated = true;
}
}
} catch (e) {
transaction.timestamp = Date.now();
updated = true;
}
}
if (!transaction.date && transaction.timestamp) {
const d = new Date(transaction.timestamp);
transaction.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
updated = true;
}
if (!transaction.time && transaction.timestamp) {
const d = new Date(transaction.timestamp);
transaction.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
updated = true;
}
if (transaction.description === undefined) {
transaction.description = '';
updated = true;
}
if (typeof transaction.amount !== 'number') {
const parsed = parseFloat(transaction.amount);
transaction.amount = isNaN(parsed) ? 0 : parsed;
updated = true;
}
if (transaction.type !== 'IN' && transaction.type !== 'OUT') {
transaction.type = transaction.amount >= 0 ? 'IN' : 'OUT';
transaction.amount = Math.abs(transaction.amount);
updated = true;
}
return transaction;
});
paymentTransactions = paymentTransactions.filter(t =>
t && t.id && t.entityId && (t.type === 'IN' || t.type === 'OUT') && typeof t.amount === 'number'
);
await idb.set('payment_entities', paymentEntities);
await idb.set('payment_transactions', paymentTransactions);
} catch (e) {
paymentEntities = [];
paymentTransactions = [];
}
}
initPaymentData();
(async function initExpenseManager() {
expenseRecords = await idb.get('expenses') || [];
let savedCategories = await idb.get('expense_categories') || [];
const categoriesFromRecords = [...new Set(
expenseRecords
.filter(e => e && e.name && typeof e.name === 'string')
.map(e => e.name)
)];
expenseCategories = [...new Set([...savedCategories, ...categoriesFromRecords])];
if (expenseCategories.length > 0 && expenseCategories.length !== savedCategories.length) {
await idb.set('expense_categories', expenseCategories);
}
const expenseDateInput = document.getElementById('expenseDate');
if (expenseDateInput) {
expenseDateInput.value = new Date().toISOString().split('T')[0];
}
renderRecentExpenses();
})();
function handleExpenseSearch() {
const input = document.getElementById('expenseName');
const resultsDiv = document.getElementById('expense-search-results');
const query = input.value.trim().toLowerCase();
if (!query || query.length < 1) {
resultsDiv.classList.add('hidden');
return;
}
expenseCategories = [...new Set(
expenseRecords
.filter(e => e && e.name && typeof e.name === 'string')
.map(e => e.name)
)];
const expenseMatches = expenseCategories.filter(name => {
if (!name || typeof name !== 'string') return false;
return name.toLowerCase().includes(query);
});
const entityMatches = paymentEntities.filter(entity => {
if (!entity || !entity.name || typeof entity.name !== 'string') return false;
return entity.name.toLowerCase().includes(query);
});
let html = '';
html += `<div style="padding: 8px 12px; font-size: 0.7rem; color: var(--text-muted); font-weight: 600; background: var(--input-bg); border-bottom: 1px solid var(--glass-border);">▤ EXPENSES</div>`;
if (expenseMatches.length > 0) {
expenseMatches.forEach(name => {
if (!name || typeof name !== 'string') return;
const safeName = name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
const count = expenseRecords.filter(e => e && e.name === name).length;
html += `
<div style="
padding: 12px;
cursor: pointer;
border-bottom: 1px solid var(--glass-border);
font-size: 0.85rem;
color: var(--text-main);
background: var(--input-bg);
transition: all 0.2s;
"
onmousedown="selectExpense('${safeName}', 'expense')"
onmouseover="this.style.background='var(--highlight-bg)'"
onmouseout="this.style.background='var(--input-bg)'">
<div class="u-row-between" >
<strong>${esc(name)}</strong>
<span class="u-fs-sm u-text-muted" >
${count} expense records
</span>
</div>
</div>`;
});
} else {
html += `<div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); font-style: italic;">No matching expenses</div>`;
}
html += `<div style="padding: 8px 12px; font-size: 0.7rem; color: var(--text-muted); font-weight: 600; background: var(--input-bg); border-bottom: 1px solid var(--glass-border);"> ENTITIES</div>`;
if (entityMatches.length > 0) {
entityMatches.forEach(entity => {
if (!entity || !entity.name || typeof entity.name !== 'string') return;
const safeName = entity.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
const transactions = paymentTransactions.filter(t => t && t.entityId === entity.id).length;
html += `
<div style="
padding: 12px;
cursor: pointer;
border-bottom: 1px solid var(--glass-border);
font-size: 0.85rem;
color: var(--text-main);
background: var(--input-bg);
transition: all 0.2s;
"
onmousedown="selectExpense('${safeName}', 'entity')"
onmouseover="this.style.background='var(--highlight-bg)'"
onmouseout="this.style.background='var(--input-bg)'">
<div class="u-row-between" >
<strong>${esc(entity.name)}</strong>
<span class="u-fs-sm u-text-muted" >
${transactions > 0 ? transactions + ' transactions' : ''}
</span>
</div>
</div>`;
});
} else {
html += `<div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); font-style: italic;">No matching entities</div>`;
}
if (expenseMatches.length === 0 && entityMatches.length === 0) {
html += `
<div style="
padding: 12px;
font-size: 0.85rem;
color: var(--accent);
background: var(--liquid-blue);
border-radius: 8px;
margin: 5px;
cursor: pointer;
"
onmousedown="hideExpenseSearch()">
<strong> New entry:</strong> "${input.value}"
<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">
Click to continue with this name
</div>
</div>`;
}
resultsDiv.innerHTML = html;
resultsDiv.classList.remove('hidden');
}
function selectExpense(name, type) {
document.getElementById('expenseName').value = name;
document.getElementById('expense-search-results').classList.add('hidden');
if (!name || typeof name !== 'string') {
document.getElementById('expenseAmount').focus();
return;
}
if (type === 'entity') {
document.getElementById('btn-category-operating').style.opacity = '0.4';
document.getElementById('btn-category-operating').style.pointerEvents = 'none';
document.getElementById('btn-category-in').style.opacity = '1';
document.getElementById('btn-category-in').style.pointerEvents = 'auto';
document.getElementById('btn-category-out').style.opacity = '1';
document.getElementById('btn-category-out').style.pointerEvents = 'auto';
if (!window._expenseCategory || window._expenseCategory === 'operating') {
selectExpenseCategory('OUT', document.getElementById('btn-category-out'));
}
} else if (type === 'expense') {
document.getElementById('btn-category-operating').style.opacity = '1';
document.getElementById('btn-category-operating').style.pointerEvents = 'auto';
document.getElementById('btn-category-in').style.opacity = '0.4';
document.getElementById('btn-category-in').style.pointerEvents = 'none';
document.getElementById('btn-category-out').style.opacity = '0.4';
document.getElementById('btn-category-out').style.pointerEvents = 'none';
if (window._expenseCategory === 'IN' || window._expenseCategory === 'OUT') {
selectExpenseCategory('operating', document.getElementById('btn-category-operating'));
}
} else {
['btn-category-operating','btn-category-in','btn-category-out'].forEach(id => {
const btn = document.getElementById(id);
if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
});
}
document.getElementById('expenseAmount').focus();
}
function hideExpenseSearch() {
document.getElementById('expense-search-results').classList.add('hidden');
document.getElementById('expenseAmount').focus();
}
document.addEventListener('DOMContentLoaded', function() {
const expenseNameInput = document.getElementById('expenseName');
if (expenseNameInput) {
expenseNameInput.addEventListener('blur', function() {
setTimeout(() => {
const resultsDiv = document.getElementById('expense-search-results');
if (resultsDiv) {
resultsDiv.classList.add('hidden');
}
}, 200);
});
}
});
window._expenseCategory = 'operating';
window._returnStore = null;
function selectExpenseCategory(value, clickedBtn) {
window._expenseCategory = value;
['btn-category-operating','btn-category-in','btn-category-out'].forEach(id => {
const btn = document.getElementById(id);
if (btn) btn.classList.remove('active');
});
if (clickedBtn) clickedBtn.classList.add('active');
}
function selectReturnStore(value, clickedBtn) {
window._returnStore = value;
['ret-store-a','ret-store-b'].forEach(id => {
const btn = document.getElementById(id);
if (btn) btn.classList.remove('active');
});
if (clickedBtn) clickedBtn.classList.add('active');
}
async function saveExpense() {
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('payments')) {
showToast('Access Denied — Payments not in your assigned tabs', 'warning', 3000); return;
}
const name = document.getElementById('expenseName').value.trim();
const amount = parseFloat(document.getElementById('expenseAmount').value);
const date = document.getElementById('expenseDate').value;
const description = document.getElementById('expenseDescription').value.trim();
const category = window._expenseCategory || 'operating';
if (!name) {
showToast("Please enter name/entity", "warning");
return;
}
if (!amount || amount <= 0) {
showToast("Please enter valid amount", "warning");
return;
}
if (!date) {
showToast("Please select date", "warning");
return;
}
let expensesSnapshot = [...expenseRecords];
let categoriesSnapshot = [...expenseCategories];
let entitiesSnapshot = [...paymentEntities];
let transactionsSnapshot = [...paymentTransactions];
try {
if (category === 'operating') {
let expenseId = generateUUID('expense');
if (!validateUUID(expenseId)) {
expenseId = generateUUID('expense');
}
let expense = {
id: expenseId,
name: name,
amount: amount,
date: date,
description: description,
category: 'operating',
createdAt: getTimestamp(),
updatedAt: getTimestamp(),
timestamp: getTimestamp(),
syncedAt: new Date().toISOString()
};
expense = ensureRecordIntegrity(expense, false);
expenseRecords.push(expense);
if (!expenseCategories.includes(name)) {
expenseCategories.push(name);
}
await unifiedSave('expenses', expenseRecords, expense);
await idb.set('expense_categories', expenseCategories);
notifyDataChange('expenses');
emitSyncUpdate({
expenses: expenseRecords,
expense_categories: expenseCategories
});
await createExpenseTransaction(expense);
showToast(`Operating expense recorded: ${name}`, "success");
} else {
const transactionType = category;
let payExpenseId = generateUUID('expense');
let payExpenseRecord = {
id: payExpenseId,
name: name,
amount: amount,
date: date,
description: description || `Payment ${transactionType}: ${name}`,
category: transactionType,
createdAt: getTimestamp(),
updatedAt: getTimestamp(),
timestamp: getTimestamp(),
syncedAt: new Date().toISOString()
};
payExpenseRecord = ensureRecordIntegrity(payExpenseRecord, false);
expenseRecords.push(payExpenseRecord);
await unifiedSave('expenses', expenseRecords, payExpenseRecord);
let entity = paymentEntities.find(e =>
e.name && e.name.toLowerCase() === name.toLowerCase() &&
!e.isExpenseEntity
);
if (!entity) {
let newEntity = {
id: generateUUID('entity'),
name: name,
type: transactionType === 'OUT' ? 'payee' : 'payor',
isSupplier: false,
isExpenseEntity: false,
phone: '',
address: '',
notes: 'Auto-created from Transaction Manager'
};
newEntity = ensureRecordIntegrity(newEntity, false);
paymentEntities.push(newEntity);
entity = newEntity;
}
let transaction = {
id: generateUUID('payment'),
entityId: entity.id,
entityName: entity.name,
amount: amount,
type: transactionType,
date: date,
description: description || `Payment ${transactionType}: ${name}`,
isPayable: false,
isExpense: false,
expenseId: payExpenseId
};
if (transactionType === 'OUT') {
const pendingMaterials = factoryInventoryData
.filter(m =>
String(m.supplierId) === String(entity.id) &&
m.paymentStatus === 'pending' &&
m.totalPayable > 0
)
.sort((a, b) => {
const da = new Date(a.purchaseDate || a.date || a.createdAt || 0).getTime();
const db = new Date(b.purchaseDate || b.date || b.createdAt || 0).getTime();
return da - db;
});
if (pendingMaterials.length > 0) {
let remaining = amount;
const materialsToSave = [];
for (const mat of pendingMaterials) {
if (remaining <= 0) break;
if (remaining >= mat.totalPayable) {
remaining -= mat.totalPayable;
mat.totalPayable = 0;
mat.paymentStatus = 'paid';
mat.paidDate = date;
mat.updatedAt = getTimestamp();
} else {
mat.totalPayable = parseFloat((mat.totalPayable - remaining).toFixed(2));
remaining = 0;
mat.updatedAt = getTimestamp();
}
materialsToSave.push(mat);
}
if (materialsToSave.length > 0) {
transaction.isPayable = true;
transaction.materialId = materialsToSave[0].id;
for (const mat of materialsToSave) {
await unifiedSave('factory_inventory_data', factoryInventoryData, mat);
}
}
}
}
transaction = ensureRecordIntegrity(transaction, false);
paymentTransactions.push(transaction);
await unifiedSave('payment_entities', paymentEntities, entity);
await unifiedSave('payment_transactions', paymentTransactions, transaction);
notifyDataChange('payments');
emitSyncUpdate({
payment_entities: paymentEntities,
payment_transactions: paymentTransactions
});
showToast(`Payment ${transactionType} recorded: ${name}`, "success");
}
clearExpenseForm();
if (typeof renderUnifiedTable === 'function') {
try {
renderUnifiedTable(1);
} catch (e) {
console.error('Failed to render data.', e);
showToast('Failed to render data.', 'error');
}
}
if (typeof refreshPaymentTab === 'function') {
try {
await refreshPaymentTab(true);
} catch (e) {
console.error('Payment tab refresh failed.', e);
showToast('Payment tab refresh failed.', 'error');
}
}
if (typeof renderExpenseTable === 'function') {
try {
renderExpenseTable(1);
} catch (e) {
console.error('Payment tab refresh failed.', e);
showToast('Payment tab refresh failed.', 'error');
}
}
if (typeof handleExpenseSearch === 'function') {
try {
handleExpenseSearch();
} catch (e) {
console.error('Payment tab refresh failed.', e);
showToast('Payment tab refresh failed.', 'error');
}
}
if (typeof calculateNetCash === 'function') {
try {
calculateNetCash();
} catch (e) {
console.error('Payment tab refresh failed.', e);
showToast('Payment tab refresh failed.', 'error');
}
}
if (typeof renderFactoryInventory === 'function') {
try {
renderFactoryInventory();
} catch (e) {
console.error('Payment tab refresh failed.', e);
showToast('Payment tab refresh failed.', 'error');
}
}
triggerAutoSync();
} catch (error) {
expenseRecords.length = 0;
expenseRecords.push(...expensesSnapshot);
expenseCategories.length = 0;
expenseCategories.push(...categoriesSnapshot);
paymentEntities.length = 0;
paymentEntities.push(...entitiesSnapshot);
paymentTransactions.length = 0;
paymentTransactions.push(...transactionsSnapshot);
try {
await idb.setBatch([
['expenses', expenseRecords],
['expense_categories', expenseCategories],
['payment_entities', paymentEntities],
['payment_transactions', paymentTransactions]
]);
} catch (rollbackError) {
console.error('Failed to render data.', rollbackError);
showToast('Failed to render data.', 'error');
}
showToast('Failed to save expense. Please try again.', 'error');
}
}
async function createExpenseTransaction(expense) {
let entity = paymentEntities.find(e =>
e.name && e.name.toLowerCase() === expense.name.toLowerCase() &&
e.isExpenseEntity === true
);
if (!entity) {
let newEntity = {
id: generateUUID('entity'),
name: expense.name,
type: 'payee',
isSupplier: false,
isExpenseEntity: true,
category: expense.category,
phone: '',
address: '',
notes: 'Auto-created by Expense Manager'
};
newEntity = ensureRecordIntegrity(newEntity, false);
paymentEntities.push(newEntity);
entity = newEntity;
await unifiedSave('payment_entities', paymentEntities, newEntity);
}
let transaction = {
id: generateUUID('payment'),
entityId: entity.id,
entityName: entity.name,
amount: expense.amount,
type: 'OUT',
date: expense.date,
description: expense.description || `Expense: ${esc(expense.name)}`,
category: expense.category,
isPayable: false,
isExpense: true,
expenseId: expense.id
};
transaction = ensureRecordIntegrity(transaction, false);
paymentTransactions.push(transaction);
await unifiedSave('payment_transactions', paymentTransactions, transaction);
if (typeof calculateNetCash === 'function') {
calculateNetCash();
}
if (typeof refreshEntityBalances === 'function') {
refreshEntityBalances();
}
}
function renderRecentExpenses() {
renderExpenseTable();
}
async function renderExpenseTable(page = 1) {
const tbody = document.getElementById('expense-table-body');
const totalEl = document.getElementById('expense-table-total');
const totalAllEl = document.getElementById('total-expenses-all');
if (!tbody) return;
try {
const freshExpenses = await idb.get('expenses', []);
if (freshExpenses && freshExpenses.length > 0) {
expenseRecords = freshExpenses;
}
} catch (error) {
console.error('Calculation failed.', error);
showToast('Calculation failed.', 'error');
}
const periodFilter = document.getElementById('expensePeriodFilter')?.value || 'month';
const categoryFilter = document.getElementById('expenseCategoryFilter')?.value || 'all';
let filteredExpenses = [...expenseRecords];
const now2 = new Date();
const today = now2.toISOString().split('T')[0];
if (periodFilter === 'today') {
filteredExpenses = filteredExpenses.filter(e => e.date === today);
} else if (periodFilter === 'week') {
const weekAgo = new Date(now2.getTime() - 7 * 24 * 60 * 60 * 1000);
filteredExpenses = filteredExpenses.filter(e => new Date(e.date) >= weekAgo);
} else if (periodFilter === 'month') {
const monthAgo = new Date(now2.getTime() - 30 * 24 * 60 * 60 * 1000);
filteredExpenses = filteredExpenses.filter(e => new Date(e.date) >= monthAgo);
}
if (categoryFilter !== 'all') {
filteredExpenses = filteredExpenses.filter(e => e.category === categoryFilter);
}
const periodTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
const allTimeTotal = expenseRecords.reduce((sum, e) => sum + e.amount, 0);
filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
const pageExpenses = filteredExpenses;
const validPage = 1;
const totalPages = 1;
const totalItems = filteredExpenses.length;
const startIndex = 0;
const endIndex = filteredExpenses.length;
const expensesData = {
pageExpenses,
periodTotal,
allTimeTotal,
totalItems,
totalPages,
validPage
};
if (expensesData && expensesData.pageExpenses) {
renderExpensesFromCache(expensesData, tbody, totalEl, totalAllEl);
} else {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Failed to load expense data</td></tr>`;
if (totalEl) totalEl.textContent = '0.00';
if (totalAllEl) totalAllEl.textContent = '0.00';
}
}
function renderExpensesFromCache(data, tbody, totalEl, totalAllEl) {
if (!data) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Error loading expenses</td></tr>`;
if (totalEl) totalEl.textContent = '0.00';
if (totalAllEl) totalAllEl.textContent = '0.00';
return;
}
const { pageExpenses, periodTotal, allTimeTotal, totalItems, totalPages, validPage } = data;
if (!pageExpenses || !Array.isArray(pageExpenses)) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Invalid expense data</td></tr>`;
if (totalEl) totalEl.textContent = '0.00';
if (totalAllEl) totalAllEl.textContent = '0.00';
return;
}
if (totalEl) totalEl.textContent = `${periodTotal.toFixed(2)}`;
if (totalAllEl) totalAllEl.textContent = `${allTimeTotal.toFixed(2)}`;
if (totalItems === 0) {
tbody.innerHTML = `
<tr>
<td class="u-empty-state-md" colspan="5" >
No expenses found for selected period
</td>
</tr>`;
return;
}
const fragment = document.createDocumentFragment();
pageExpenses.forEach(expense => {
const categoryColor = getCategoryColor(expense.category);
const categoryLabel = getCategoryLabel(expense.category);
const formattedDate = formatExpenseDate(expense.date);
const tr = document.createElement('tr');
tr.style.cssText = 'border-bottom: 1px solid var(--glass-border); transition: background 0.2s;';
tr.onmouseover = function() { this.style.background = 'var(--card-hover)'; };
tr.onmouseout = function() { this.style.background = 'transparent'; };
tr.innerHTML = `
<td style="padding: 10px 8px; font-size: 0.8rem; color: var(--text-muted);">
${formattedDate}
</td>
<td style="padding: 10px 8px; font-weight: 600; color: var(--text-main);">
${esc(expense.name)}${expense.isMerged ? _mergedBadgeHtml(expense, {inline:true}) : ''}
${expense.description ? `<br><span class="u-fs-sm2 u-text-muted u-fw-400" >${esc(expense.description)}</span>` : ''}
</td>
<td style="padding: 10px 8px;">
<span style="
background: ${categoryColor}15;
color: ${categoryColor};
padding: 4px 8px;
border-radius: 6px;
font-size: 0.7rem;
font-weight: 600;
white-space: nowrap;
">${esc(categoryLabel)}</span>
</td>
<td style="padding: 10px 8px; text-align: right; font-weight: 700; color: var(--danger); font-size: 0.9rem;">
${expense.amount.toFixed(2)}
</td>
<td style="padding: 10px 8px; text-align: center;">
<button
onclick="openExpenseEntityDetails('${esc(expense.id)}')"
style="
background: linear-gradient(135deg, var(--accent) 0%, var(--accent-emerald) 100%);
border: none;
color: white;
padding: 6px 12px;
border-radius: 6px;
font-size: 0.75rem;
cursor: pointer;
transition: all 0.2s;
font-weight: 600;
"
onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(0,122,255,0.3)'"
onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
>
Manage
</button>
</td>
`;
fragment.appendChild(tr);
});
tbody.innerHTML = '';
tbody.appendChild(fragment);
}
async function renderUnifiedTable(page = 1) {
try {
const freshEntities = await idb.get('payment_entities', []);
if (freshEntities && freshEntities.length > 0) {
paymentEntities = freshEntities;
}
const freshTransactions = await idb.get('payment_transactions', []);
if (freshTransactions && freshTransactions.length > 0) {
paymentTransactions = freshTransactions;
}
const freshExpenses = await idb.get('expenses', []);
if (freshExpenses && freshExpenses.length > 0) {
expenseRecords = freshExpenses;
}
} catch (error) {
console.error('Failed to render data.', error);
showToast('Failed to render data.', 'error');
}
const viewModeEl = document.getElementById('unifiedViewMode');
const periodFilterEl = document.getElementById('unifiedPeriodFilter');
const searchInputEl = document.getElementById('unified-search');
const tbody = document.getElementById('unified-table-body');
const totalSpan = document.getElementById('unified-table-total');
const footerLabel = document.getElementById('unified-table-footer-label');
const summaryDiv = document.getElementById('unified-summary');
if (!tbody) {
return;
}
const viewMode = viewModeEl ? viewModeEl.value : 'entities';
const periodFilter = periodFilterEl ? periodFilterEl.value : 'month';
const searchQuery = searchInputEl && searchInputEl.value ? String(searchInputEl.value).toLowerCase().trim() : '';
let rows = [];
let totalAmount = 0;
let totalReceivables = 0;
let totalPayables = 0;
let totalSupplierPayables = 0;
let totalEntityPayables = 0;
let totalExpenses = 0;
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let startDate = new Date(0);
if (periodFilter === 'today') {
startDate = today;
} else if (periodFilter === 'week') {
startDate = new Date(today);
startDate.setDate(today.getDate() - 7);
} else if (periodFilter === 'month') {
startDate = new Date(today);
startDate.setDate(today.getDate() - 30);
}
expenseRecords.forEach(exp => {
if (!exp || !exp.date) return;
const expDate = new Date(exp.date);
if (expDate < startDate) return;
if (exp.category === 'operating') {
const amount = parseFloat(exp.amount) || 0;
totalExpenses += amount;
}
});
const supplierIdSet = new Set();
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(m => { if (m.supplierId) supplierIdSet.add(String(m.supplierId)); });
}
const supplierBalances = {};
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0) {
const sid = String(material.supplierId);
supplierBalances[sid] = (supplierBalances[sid] || 0) + material.totalPayable;
}
});
}
const entityBalances = {};
paymentEntities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
if (supplierIdSet.has(String(entity.id))) return;
entityBalances[entity.id] = 0;
});
if (typeof paymentTransactions !== 'undefined') {
paymentTransactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (supplierIdSet.has(String(transaction.entityId))) return;
if (entityBalances[transaction.entityId] !== undefined) {
if (transaction.type === 'OUT') {
entityBalances[transaction.entityId] -= parseFloat(transaction.amount) || 0;
} else if (transaction.type === 'IN') {
entityBalances[transaction.entityId] += parseFloat(transaction.amount) || 0;
}
}
});
}
for (const sid in supplierBalances) {
if (supplierBalances[sid] > 0) {
totalSupplierPayables += supplierBalances[sid];
totalPayables += supplierBalances[sid];
}
}
for (const entityId in entityBalances) {
const balance = entityBalances[entityId];
if (balance > 0) { totalEntityPayables += balance; totalPayables += balance; }
if (balance < 0) totalReceivables += Math.abs(balance);
}
if (viewMode === 'transactions') {
const expenseGroups = {};
expenseRecords.forEach(exp => {
if (!exp || !exp.date) return;
if (exp.category !== 'operating') return;
const expDate = new Date(exp.date);
if (expDate < startDate) return;
const expName = exp.name ? String(exp.name) : '';
if (searchQuery && !expName.toLowerCase().includes(searchQuery)) return;
const groupKey = `${exp.category}||${expName}`;
if (!expenseGroups[groupKey]) {
expenseGroups[groupKey] = {
name: expName,
category: exp.category,
totalAmount: 0,
latestDate: expDate,
latestId: exp.id,
count: 0
};
}
const grp = expenseGroups[groupKey];
grp.totalAmount += parseFloat(exp.amount) || 0;
grp.count++;
if (expDate > grp.latestDate) {
grp.latestDate = expDate;
grp.latestId = exp.id;
}
});
Object.values(expenseGroups).forEach(grp => {
totalAmount -= grp.totalAmount;
const d = grp.latestDate;
const month = d.toLocaleDateString('en-US', { month: 'short' });
const day = String(d.getDate()).padStart(2, '0');
const year = String(d.getFullYear()).slice(-2);
rows.push({
type: 'transaction',
date: grp.latestDate,
dateStr: `${month} ${day} ${year}`,
name: grp.name,
contact: 'Operating',
typeLabel: 'EXPENSE',
amount: grp.totalAmount,
amountStr: `${grp.totalAmount.toFixed(2)}`,
color: 'var(--warning)',
id: grp.latestId,
description: grp.count > 1 ? `${grp.count} transactions` : ''
});
});
}
if (viewMode === 'entities') {
const supplierIds = new Set();
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(m => { if (m.supplierId) supplierIds.add(String(m.supplierId)); });
}
const supplierEntityBalances = {};
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0) {
const sid = String(material.supplierId);
supplierEntityBalances[sid] = (supplierEntityBalances[sid] || 0) + material.totalPayable;
}
});
}
const entityBalances = {};
paymentEntities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
if (supplierIds.has(String(entity.id))) return;
entityBalances[entity.id] = 0;
});
if (typeof paymentTransactions !== 'undefined') {
paymentTransactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (supplierIds.has(String(transaction.entityId))) return;
if (entityBalances[transaction.entityId] !== undefined) {
if (transaction.type === 'OUT') {
entityBalances[transaction.entityId] -= parseFloat(transaction.amount) || 0;
} else if (transaction.type === 'IN') {
entityBalances[transaction.entityId] += parseFloat(transaction.amount) || 0;
}
}
});
}
paymentEntities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
const entityName = entity && entity.name ? String(entity.name) : '';
const entityPhone = entity && entity.phone ? String(entity.phone) : '';
const entityWallet = entity && entity.wallet ? String(entity.wallet) : '';
if (searchQuery) {
const nameMatch = entityName.toLowerCase().includes(searchQuery);
const phoneMatch = entityPhone.includes(searchQuery);
const walletMatch = entityWallet.includes(searchQuery);
if (!nameMatch && !phoneMatch && !walletMatch) return;
}
let balance = supplierIds.has(String(entity.id))
? (supplierEntityBalances[String(entity.id)] || 0)
: (entityBalances[entity.id] || 0);
if (entity.balance !== undefined && entity.balance !== null && typeof paymentTransactions === 'undefined') {
balance = parseFloat(entity.balance) || 0;
}
const contactInfo = entityPhone || entityWallet || 'No contact';
const entityDate = entity.createdAt ? new Date(entity.createdAt) : new Date();
const dateStr = (() => {
const month = entityDate.toLocaleDateString('en-US', { month: 'short' });
const day = String(entityDate.getDate()).padStart(2, '0');
const year = String(entityDate.getFullYear()).slice(-2);
return `${month} ${day} ${year}`;
})();
let balanceLabel = '';
let balanceColor = 'var(--text-muted)';
if (balance > 0.01) {
balanceLabel = 'PAYABLE';
balanceColor = 'var(--danger)';
} else if (balance < -0.01) {
balanceLabel = 'RECEIVABLE';
balanceColor = 'var(--accent-emerald)';
} else {
balanceLabel = 'SETTLED';
}
let nameColor = 'var(--text-main)';
if (balance > 0.01) {
nameColor = 'var(--danger)';
} else if (balance < -0.01) {
nameColor = 'var(--accent-emerald)';
}
const amountStr = `${Math.abs(balance).toFixed(2)}`;
rows.push({
type: 'entity',
date: entityDate,
dateStr: dateStr,
name: entityName,
nameColor: nameColor,
contact: contactInfo,
typeLabel: 'ENTITY',
amount: balance,
amountStr: amountStr,
amountColor: balanceColor,
balanceLabel: balanceLabel,
id: entity.id,
entity: entity
});
});
}
rows.sort((a, b) => {
if (a.type === 'entity' && b.type === 'entity') {
return Math.abs(b.amount) - Math.abs(a.amount);
}
if (a.type === 'entity' && b.type !== 'entity') return 1;
if (a.type !== 'entity' && b.type === 'entity') return -1;
return b.date - a.date;
});
const pageRows = rows;
const validPage = 1;
const totalPages = 1;
const totalItems = rows.length;
const startIndex = 0;
const endIndex = rows.length;
const unifiedData = {
rows: pageRows,
totalAmount,
totalReceivables,
totalPayables,
totalSupplierPayables,
totalEntityPayables,
totalExpenses,
viewMode,
totalItems,
page,
totalPages
};
if (unifiedData && unifiedData.rows) {
renderUnifiedFromCache(unifiedData, tbody, totalSpan, footerLabel, summaryDiv);
} else {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Failed to load records</td></tr>`;
if (totalSpan) totalSpan.textContent = '0.00';
}
}
function renderUnifiedFromCache(data, tbody, totalSpan, footerLabel, summaryDiv) {
if (!data) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Error loading records</td></tr>`;
if (totalSpan) totalSpan.textContent = '0.00';
return;
}
const { rows, totalAmount, totalReceivables, totalPayables, totalSupplierPayables, totalEntityPayables, totalExpenses, viewMode, totalItems, page, totalPages } = data;
if (!rows || !Array.isArray(rows)) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Invalid data format</td></tr>`;
if (totalSpan) totalSpan.textContent = '0.00';
return;
}
if (rows.length === 0) {
tbody.innerHTML = `
<tr>
<td class="u-empty-state-md" colspan="5" >
No records found matching your filters
</td>
</tr>`;
if (totalSpan) totalSpan.textContent = '0.00';
return;
}
function buildUnifiedRow(row) {
const tr = document.createElement('tr');
tr.style.cssText = 'border-bottom: 1px solid var(--glass-border); transition: background 0.2s; cursor: pointer;';
tr.onmouseover = function() { this.style.background = 'var(--highlight-bg)'; };
tr.onmouseout = function() { this.style.background = row.type === 'entity' ? 'var(--input-bg)' : 'transparent'; };
if (row.type === 'transaction') {
tr.innerHTML = `
<td style="padding: 8px 4px; font-size: 0.7rem; white-space: nowrap;">${row.dateStr}</td>
<td style="padding: 8px 4px; font-weight: 600; font-size: 0.8rem;">
${esc(row.name)}
<div style="display: inline-block; margin-left: 6px;">
<span style="background: ${row.typeLabel === 'EXPENSE' ? 'var(--warning)' : 'var(--accent)'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.55rem; font-weight: 700;">
${row.typeLabel}
</span>
</div>
</td>
<td style="padding: 8px 4px; font-size: 0.7rem; color: var(--text-muted);">${phoneActionHTML(row.contact)}</td>
<td style="padding: 8px 4px; text-align: right; font-weight: 700; color: ${row.color}; white-space: nowrap; font-size: 0.75rem;">
${row.amountStr}
</td>
<td style="padding: 6px 4px; text-align: center;">
<button class="tbl-action-btn" onclick="openExpenseEntityDetails('${esc(row.id)}')">
Edit
</button>
</td>`;
} else {
tr.style.background = 'var(--input-bg)';
tr.innerHTML = `
<td style="padding: 8px 4px; font-size: 0.7rem; white-space: nowrap; color: var(--text-main);">
${row.dateStr}
</td>
<td style="padding: 8px 4px; font-weight: 700; font-size: 0.8rem; color: ${row.nameColor};">
${esc(row.name)}
<div style="font-size: 0.6rem; margin-top: 2px;">
<span style="background: ${row.amountColor}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 0.55rem; font-weight: 600;">
${row.balanceLabel}
</span>
</div>
</td>
<td style="padding: 8px 4px; font-size: 0.7rem; color: var(--text-muted);">${phoneActionHTML(row.contact)}</td>
<td style="padding: 8px 4px; text-align: right; font-weight: 700; color: ${row.amountColor}; white-space: nowrap; font-size: 0.75rem;">
${row.amountStr}
</td>
<td style="padding: 6px 4px; text-align: center;">
<button class="tbl-action-btn" onclick="openEntityDetailsOverlay('${esc(row.id)}')">
Edit
</button>
</td>`;
}
return tr;
}
GNDVirtualScroll.mount('unified-table-container', rows, buildUnifiedRow, tbody);
if (viewMode === 'entities') {
if (footerLabel) footerLabel.textContent = 'Net Balance:';
if (totalSpan) {
const netBalance = totalReceivables - totalPayables;
totalSpan.textContent = `${Math.abs(netBalance).toFixed(2)}`;
totalSpan.style.color = netBalance >= 0 ? 'var(--accent-emerald)' : 'var(--danger)';
}
} else {
if (footerLabel) footerLabel.textContent = 'Net Total:';
if (totalSpan) {
totalSpan.textContent = `${totalAmount.toFixed(2)}`;
totalSpan.style.color = totalAmount >= 0 ? 'var(--accent-emerald)' : 'var(--danger)';
}
}
if (summaryDiv) {
summaryDiv.style.display = 'block';
const receivablesEl = document.getElementById('unified-receivables');
const payablesEl = document.getElementById('unified-payables');
const supplierPayablesEl = document.getElementById('unified-supplier-payables');
const entityPayablesEl = document.getElementById('unified-entity-payables');
const expensesEl = document.getElementById('unified-expenses');
if (receivablesEl) receivablesEl.textContent = totalReceivables.toFixed(2);
if (payablesEl) payablesEl.textContent = totalPayables.toFixed(2);
if (supplierPayablesEl) supplierPayablesEl.textContent = totalSupplierPayables.toFixed(2);
if (entityPayablesEl) entityPayablesEl.textContent = totalEntityPayables.toFixed(2);
if (expensesEl) expensesEl.textContent = totalExpenses.toFixed(2);
}
_filterPaymentHistoryByPeriod();
}
function updateExpenseBreakdown() {
const container = document.getElementById('expense-breakdown-container');
if (!container) return;
const categoryTotals = {};
let totalExpenses = 0;
expenseRecords.forEach(exp => {
if (exp.category === 'operating') {
const name = exp.name;
const amount = parseFloat(exp.amount) || 0;
if (!categoryTotals[name]) {
categoryTotals[name] = 0;
}
categoryTotals[name] += amount;
totalExpenses += amount;
}
});
const sortedCategories = Object.entries(categoryTotals)
.sort((a, b) => b[1] - a[1])
.slice(0, 5);
if (sortedCategories.length === 0) {
container.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">No operating expenses</div>';
return;
}
let html = '';
sortedCategories.forEach(([name, amount]) => {
const percentage = totalExpenses > 0 ? (amount / totalExpenses * 100).toFixed(2) : 0;
html += `
<div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 4px 0;">
<span class="u-text-main" >${name}:</span>
<div style="text-align: right;">
<span style="color: var(--danger); font-weight: 600; margin-right: 8px;">${formatCurrency(amount)}</span>
<span style="color: var(--text-muted); font-size: 0.7rem;">(${percentage}%)</span>
</div>
</div>`;
});
if (Object.keys(categoryTotals).length > 5) {
const othersCount = Object.keys(categoryTotals).length - 5;
html += `<div style="color: var(--text-muted); font-size: 0.7rem; margin-top: 4px; font-style: italic;">${othersCount} more categories
</div>`;
}
container.innerHTML = html;
}
async function exportUnifiedData() {
const viewModeEl = document.getElementById('unifiedViewMode');
const periodFilterEl = document.getElementById('unifiedPeriodFilter');
if (!viewModeEl || !periodFilterEl) {
showToast('Export failed. Please try again.', 'error');
return;
}
const viewMode = viewModeEl.value || 'entities';
const periodFilter = periodFilterEl.value || 'all';
showToast("Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
}
if (!window.jspdf || !window.jspdf.jsPDF) {
throw new Error("Failed to load PDF library. Please refresh and try again.");
}
const { jsPDF } = window.jspdf;
const doc = new jsPDF('p', 'mm', 'a4');
const pageW = doc.internal.pageSize.getWidth();
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let startDate = new Date(0);
if (periodFilter === 'today') startDate = today;
else if (periodFilter === 'week') { startDate = new Date(today); startDate.setDate(today.getDate() - 7); }
else if (periodFilter === 'month') { startDate = new Date(today); startDate.setDate(today.getDate() - 30); }
const periodName = periodFilter === 'all' ? 'All Time' : periodFilter === 'today' ? 'Today' :
periodFilter === 'week' ? 'This Week' : 'This Month';
const isEntities = viewMode === 'entities';
const hdrColor = isEntities ? [0, 150, 136] : [255, 149, 0];
doc.setFillColor(...hdrColor);
doc.rect(0, 0, pageW, 22, 'F');
doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW/2, 10, { align:'center' });
doc.setFontSize(9); doc.setFont(undefined,'normal');
doc.text('Naswar Manufacturers & Dealers', pageW/2, 17, { align:'center' });
doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(50,50,50);
const titleText = isEntities ? 'Payment Entities — Balances & Ledger' : 'Expenses — Transaction Records';
doc.text(`${titleText} · ${periodName}`, pageW/2, 30, { align:'center' });
doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(120,120,120);
doc.text(`Generated: ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString('en-US')}`, pageW/2, 36, { align:'center' });
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, 39, pageW - 14, 39);
let yPos = 44;
if (isEntities) {
if (typeof paymentEntities !== 'undefined' && paymentEntities.length > 0) {
const supplierIdSet = new Set();
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(m => { if (m.supplierId) supplierIdSet.add(String(m.supplierId)); });
}
const supplierInventoryBalances = {};
if (typeof factoryInventoryData !== 'undefined') {
factoryInventoryData.forEach(mat => {
if (mat.supplierId && mat.paymentStatus === 'pending' && mat.totalPayable > 0) {
const sid = String(mat.supplierId);
supplierInventoryBalances[sid] = (supplierInventoryBalances[sid] || 0) + mat.totalPayable;
}
});
}
const entityNetBalances = {};

const entityMergedInfo = {};
paymentEntities.forEach(e => {
if (e.isExpenseEntity === true) return;
if (supplierIdSet.has(String(e.id))) return;
entityNetBalances[e.id] = 0;
});
if (typeof paymentTransactions !== 'undefined') {
paymentTransactions.forEach(t => {
if (t.isExpense === true) return;
if (supplierIdSet.has(String(t.entityId))) return;
if (entityNetBalances[t.entityId] !== undefined) {
const amt = parseFloat(t.amount) || 0;
if (t.type === 'OUT') entityNetBalances[t.entityId] -= amt;
else if (t.type === 'IN') entityNetBalances[t.entityId] += amt;

if (t.isMerged === true && t.mergedSummary) {
  entityMergedInfo[t.entityId] = entityMergedInfo[t.entityId] || [];
  entityMergedInfo[t.entityId].push({
    period: _pdfMergedPeriodLabel(t),
    count: _pdfMergedCountLabel(t),
    originalIn:  (t.mergedSummary.originalIn  || 0),
    originalOut: (t.mergedSummary.originalOut || 0)
  });
}
}
});
}
const entityRows = [];

const pdfEntityList = [];
let totPayable = 0, totReceivable = 0;
paymentEntities
.filter(e => !e.isExpenseEntity)
.forEach(entity => {
const sid = String(entity.id);
let balance = 0;
let source = 'Transactions';
if (supplierIdSet.has(sid)) {
balance = -(supplierInventoryBalances[sid] || 0);
source = 'Inventory';
} else {
balance = entityNetBalances[entity.id] || 0;
}
if (balance < -0.01) totPayable += Math.abs(balance);
if (balance > 0.01) totReceivable += balance;
let balDisplay, balNote;
if (Math.abs(balance) < 0.01) { balDisplay = 'SETTLED'; balNote = ''; }
else if (balance < 0) { balDisplay = 'Rs ' + safeToFixed(Math.abs(balance), 2); balNote = 'PAYABLE'; }
else { balDisplay = 'Rs ' + safeToFixed(balance, 2); balNote = 'RECEIVABLE'; }
const hasMergedTx = !!entityMergedInfo[entity.id];
const mergedNote = hasMergedTx
  ? entityMergedInfo[entity.id].map(m => `\u2605 ${m.period} (${m.count})`).join('\n')
  : '';
entityRows.push([
entity.name + (hasMergedTx ? '\n\u2605 Has year-end balance' : ''),
supplierIdSet.has(sid) ? 'SUPPLIER' : 'ENTITY',
entity.phone || 'N/A',
hasMergedTx ? 'Year-End\n' + source : source,
balDisplay,
balNote
]);
pdfEntityList.push(entity);
});
entityRows.push([
`TOTAL (${entityRows.length} entities)`, '', '', '',
'Payable: Rs ' + safeToFixed(totPayable, 2) + '\nReceivable: Rs ' + safeToFixed(totReceivable, 2),
'Net: Rs ' + safeToFixed(Math.abs(totReceivable - totPayable), 2)
]);
doc.autoTable({
startY: yPos,
head: [['Name', 'Type', 'Phone', 'Balance Source', 'Balance', 'Status']],
body: entityRows,
theme: 'grid',
headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 9, fontStyle:'bold', halign:'center' },
styles: { fontSize: 8.5, cellPadding: 3, lineWidth: 0.15, lineColor:[180,180,180], overflow:'linebreak' },
columnStyles: {
0: { cellWidth: 48 },
1: { cellWidth: 20, halign:'center' },
2: { cellWidth: 28, halign:'center' },
3: { cellWidth: 24, halign:'center', fontSize:7.5, textColor:[100,100,100] },
4: { cellWidth: 34, halign:'right', fontStyle:'bold' },
5: { cellWidth: 22, halign:'center', fontStyle:'bold' }
},
didParseCell: function(data) {
const isTotal = data.row.index === entityRows.length - 1;
if (isTotal) {
data.cell.styles.fontStyle = 'bold';
data.cell.styles.fillColor = [240, 248, 255];
data.cell.styles.fontSize = 9;
}

const rowEntity = (data.row.index < entityRows.length - 1) ? pdfEntityList[data.row.index] : null;
if (rowEntity && entityMergedInfo[rowEntity.id]) {
  data.cell.styles.fillColor = PDF_MERGED_ROW_COLOR;
}
if (data.column.index === 4 && !isTotal) {
const txt = (data.cell.text || []).join('');
data.cell.styles.textColor = txt === 'SETTLED' ? [100,100,100] : [220,53,69];
}
if (data.column.index === 5 && !isTotal) {
const txt = (data.cell.text || []).join('');
if (txt === 'SETTLED') data.cell.styles.textColor = [100,100,100];
else if (txt === 'RECEIVABLE') data.cell.styles.textColor = [40,167,69];
else if (txt === 'PAYABLE') data.cell.styles.textColor = [220,53,69];
}
},
margin: { left: 14, right: 14 }
});
const afterY = doc.lastAutoTable.finalY + 6;
if (afterY < 275) {
doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100);
doc.text(
`Total Payables: Rs ${safeToFixed(totPayable, 2)} | Total Receivables: Rs ${safeToFixed(totReceivable, 2)} | Net Position: Rs ${safeToFixed(Math.abs(totReceivable - totPayable), 2)} ${totReceivable > totPayable ? '(IN OUR FAVOR)' : '(NET PAYABLE)'}`,
14, afterY
);
const hasMergedEntries2 = Object.keys(entityMergedInfo).length > 0;
if (hasMergedEntries2 && afterY + 7 < 280) {
  doc.setFillColor(245, 235, 255);
  doc.roundedRect(14, afterY + 6, pageW - 28, 9, 1.5, 1.5, 'F');
  doc.setFontSize(7.5); doc.setFont(undefined,'bold'); doc.setTextColor(126, 34, 206);
  doc.text('\u2605 Highlighted rows contain year-end opening balances (MERGED) from Close Financial Year.', 18, afterY + 12.5);
  doc.setFont(undefined,'normal'); doc.setTextColor(80,80,80);
}
}
} else {
doc.setFont(undefined,'normal'); doc.setFontSize(10); doc.setTextColor(150);
doc.text('No entities found.', pageW/2, yPos + 10, { align:'center' });
}
}
if (!isEntities) {
let expenses = (typeof expenseRecords !== 'undefined' ? expenseRecords : [])
.filter(exp => exp && exp.category === 'operating');
if (periodFilter !== 'all') {
expenses = expenses.filter(exp => {
if (!exp.date) return false;
return new Date(exp.date) >= startDate;
});
}
expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
if (expenses.length > 0) {
const nameGroups = {};
expenses.forEach(exp => {
const key = exp.name || 'Unnamed';
if (!nameGroups[key]) nameGroups[key] = 0;
nameGroups[key] += parseFloat(exp.amount) || 0;
});

const mergedExpenses = expenses.filter(e => e.isMerged === true);
const normalExpenses = expenses.filter(e => !e.isMerged);

if (mergedExpenses.length > 0) {
  yPos = _pdfDrawMergedSectionHeader(doc, yPos, pageW, 'YEAR-END EXPENSE SUMMARIES (Carried Forward)');
  const mergedExpRows = mergedExpenses.map(exp => {
    const ms = exp.mergedSummary || {};
    const period = _pdfMergedPeriodLabel(exp);
    const count  = _pdfMergedCountLabel(exp);
    return [
      period,
      exp.name || '-',
      exp.category || 'operating',
      `${count} — ${(exp.description || '').substring(0, 35)}`,
      'Rs ' + safeToFixed(parseFloat(exp.amount)||0, 2)
    ];
  });
  const mExpTotal = mergedExpenses.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  mergedExpRows.push(['','','','SUBTOTAL ('+mergedExpenses.length+' groups)','Rs '+safeToFixed(mExpTotal,2)]);
  doc.autoTable({startY:yPos,head:[['Year Period','Name / Vendor','Category','Summary','Total Amount']],body:mergedExpRows,theme:'grid',
    headStyles:{fillColor:PDF_MERGED_HDR_COLOR,textColor:255,fontSize:9,fontStyle:'bold',halign:'center'},
    styles:{fontSize:8,cellPadding:2.5,lineWidth:0.15,lineColor:[200,180,230],overflow:'linebreak'},
    columnStyles:{0:{cellWidth:30,halign:'center'},1:{cellWidth:34},2:{cellWidth:22,halign:'center',fontSize:7.5},3:{cellWidth:58},4:{cellWidth:28,halign:'right',fontStyle:'bold'}},
    didParseCell:function(data){const isSub=data.row.index===mergedExpRows.length-1;if(isSub){data.cell.styles.fillColor=[230,210,255];data.cell.styles.fontStyle='bold';data.cell.styles.fontSize=9.5;}else{data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR;data.cell.styles.textColor=[80,40,120];}if(data.column.index===4)data.cell.styles.textColor=isSub?[126,34,206]:[140,60,180];},
    margin:{left:14,right:14}});
  yPos = doc.lastAutoTable.finalY + 6;
  if (yPos > 250) { doc.addPage(); yPos = 20; }
}

const expenseRows = normalExpenses.map(exp => [
formatDisplayDate(exp.date) || exp.date || '',
exp.name || '-',
exp.category || 'operating',
(exp.description || '-').substring(0, 45),
'Rs ' + safeToFixed(parseFloat(exp.amount) || 0, 2)
]);
const totalAmt = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
if (normalExpenses.length > 0) {
  doc.setFontSize(8.5); doc.setFont(undefined,'bold');
  doc.setTextColor(...hdrColor);
  doc.text('INDIVIDUAL EXPENSE RECORDS', 14, yPos);
  doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
  yPos += 5;
}
expenseRows.push(['', '', '', 'TOTAL (' + expenses.length + ' records)', 'Rs ' + safeToFixed(totalAmt, 2)]);
doc.autoTable({
startY: yPos,
head: [['Date', 'Name / Vendor', 'Category', 'Description', 'Amount']],
body: expenseRows,
theme: 'grid',
headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 9, fontStyle:'bold', halign:'center' },
styles: { fontSize: 8.5, cellPadding: 2.5, lineWidth: 0.15, lineColor:[180,180,180], overflow:'linebreak' },
columnStyles: {
0: { cellWidth: 24, halign:'center' },
1: { cellWidth: 38 },
2: { cellWidth: 22, halign:'center', fontSize:7.5, textColor:[100,100,100] },
3: { cellWidth: 60 },
4: { cellWidth: 28, halign:'right', textColor:[220,53,69], fontStyle:'bold' }
},
didParseCell: function(data) {
const isTotal = data.row.index === expenseRows.length - 1;
if (isTotal) {
data.cell.styles.fontStyle = 'bold';
data.cell.styles.fillColor = [255, 245, 235];
data.cell.styles.fontSize = 9.5;
if (data.column.index === 4) data.cell.styles.textColor = [220,53,69];
}
},
margin: { left: 14, right: 14 }
});
const afterY = doc.lastAutoTable.finalY + 8;
if (afterY < 265 && Object.keys(nameGroups).length > 1) {
doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(50,50,50);
doc.text('Breakdown by Expense Name:', 14, afterY);
let bkY = afterY + 5;
doc.setFont(undefined,'normal'); doc.setFontSize(8);
Object.entries(nameGroups)
.sort(([,a],[,b]) => b - a)
.forEach(([name, total]) => {
if (bkY > 275) return;
doc.setTextColor(80,80,80);
doc.text(name.substring(0, 30), 14, bkY);
doc.setTextColor(220,53,69); doc.setFont(undefined,'bold');
doc.text('Rs ' + safeToFixed(total, 2), 130, bkY, { align:'right' });
doc.setFont(undefined,'normal');
bkY += 5;
});
}
} else {
doc.setFont(undefined,'normal'); doc.setFontSize(10); doc.setTextColor(150);
doc.text('No expense records found for this period.', pageW/2, yPos + 10, { align:'center' });
}
}
const pageCount = doc.internal.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
doc.setPage(i);
doc.setFontSize(7); doc.setTextColor(160);
doc.text(
`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString('en-US')} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW/2, 291, { align:'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW/2, 287, { align:'center' });
}
const filename = `Unified_Statement_${viewMode}_${periodFilter}_${new Date().toISOString().split('T')[0]}.pdf`;
doc.save(filename);
showToast('PDF exported successfully!', 'success');
} catch (error) {
showToast('Error generating PDF: ' + error.message, 'error');
}
}
function formatExpenseDate(dateString) {
const date = new Date(dateString);
const month = date.toLocaleDateString('en-US', { month: 'short' });
const day = String(date.getDate()).padStart(2, '0');
const year = String(date.getFullYear()).slice(-2);
return `${month} ${day} ${year}`;
}
function toSafeDate(value) {
if (!value) return null;
if (typeof value === 'object' && value !== null && typeof value.seconds === 'number') {
return new Date(value.seconds * 1000);
}
if (value instanceof Date) return value;
const d = new Date(value);
return isNaN(d.getTime()) ? null : d;
}
function formatDisplayDate(dateInput) {
if (!dateInput) return '-';
const date = toSafeDate(dateInput);
if (!date || isNaN(date.getTime())) return '-';
const month = date.toLocaleDateString('en-US', { month: 'short' });
const day = String(date.getDate()).padStart(2, '0');
const year = String(date.getFullYear()).slice(-2);
return `${month} ${day} ${year}`;
}
async function openExpenseEntityDetails(expenseId) {
const expense = expenseRecords.find(e => e.id === expenseId);
if (!expense) {
showToast('Expense not found', 'error');
return;
}
if (expense.category === 'operating') {
await openOperatingExpenseOverlay(expense.name);
return;
}
const entity = paymentEntities.find(e =>
e.name.toLowerCase() === expense.name.toLowerCase()
);
if (entity) {
openEntityDetailsOverlay(entity.id);
} else {
showToast('Entity not found for this expense', 'warning');
}
}
async function openOperatingExpenseOverlay(expenseName) {
currentExpenseOverlayName = expenseName;
const labelEl = document.getElementById('quickExpenseNameLabel');
if (labelEl) labelEl.textContent = expenseName;
const qAmount = document.getElementById('quickExpenseAmount');
const qDesc = document.getElementById('quickExpenseDescription');
if (qAmount) qAmount.value = '';
if (qDesc) qDesc.value = '';
const rangeEl = document.getElementById('expenseOverlayRange');
if (rangeEl) rangeEl.value = 'all';
renderExpenseOverlayContent();
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
const overlayEl = document.getElementById('expenseDetailsOverlay');
if (overlayEl) overlayEl.style.display = 'flex';
});
}
function closeExpenseDetailsOverlay() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
const overlayEl = document.getElementById('expenseDetailsOverlay');
if (overlayEl) overlayEl.style.display = 'none';
});
currentExpenseOverlayName = null;
refreshPaymentTab();
}
function renderExpenseOverlayContent() {
const expenseName = currentExpenseOverlayName;
if (!expenseName) return;
const titleEl = document.getElementById('expenseOverlayTitle');
if (titleEl) titleEl.innerText = expenseName;
const rangeEl = document.getElementById('expenseOverlayRange');
const range = rangeEl ? rangeEl.value : 'all';
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let relatedExpenses = expenseRecords.filter(e =>
e.category === 'operating' &&
e.name.toLowerCase() === expenseName.toLowerCase()
);
if (range !== 'all') {
relatedExpenses = relatedExpenses.filter(e => {
if (!e.date) return false;
const d = new Date(e.date);
switch (range) {
case 'today': return d >= today;
case 'week': { const w = new Date(today); w.setDate(w.getDate() - 7); return d >= w; }
case 'month': { const m = new Date(today); m.setMonth(m.getMonth() - 1); return d >= m; }
case 'year': { const y = new Date(today); y.setFullYear(y.getFullYear() - 1); return d >= y; }
default: return true;
}
});
}
relatedExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
const allTimeTotal = expenseRecords
.filter(e => e.category === 'operating' && e.name.toLowerCase() === expenseName.toLowerCase())
.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const filteredTotal = relatedExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const count = relatedExpenses.length;
const statsEl = document.getElementById('expenseOverlayStats');
if (statsEl) {
statsEl.innerHTML = `
<span style="color:var(--warning); font-weight:800;">Total: ${safeToFixed(filteredTotal, 2)}</span>
<span style="display:inline-flex; gap:8px; margin-left:12px; flex-wrap:wrap;">
<span style="background:rgba(255,184,48,0.15); color:var(--warning); padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:700;">
${count} record${count !== 1 ? 's' : ''}
</span>
<span style="background:rgba(255,77,109,0.15); color:var(--danger); padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:700;">
All-Time: ${safeToFixed(allTimeTotal, 2)}
</span>
</span>`;
}
const list = document.getElementById('expenseManagementHistoryList');
if (!list) return;
list.innerHTML = '';
if (relatedExpenses.length === 0) {
list.innerHTML = `<div class="u-empty-state-sm" >No expense records found for selected period</div>`;
return;
}
relatedExpenses.forEach(exp => {
const item = document.createElement('div');
item.className = 'cust-history-item';
item.innerHTML = `
<div class="cust-history-info">
<div class="u-mono-bold" >${formatDisplayDate(exp.date)}${exp.isMerged ? _mergedBadgeHtml(exp, {inline:true}) : ''}</div>
<div class="u-fs-sm2 u-text-muted" >${esc(exp.description || 'No description')}</div>
</div>
<div style="text-align:right; margin-right:10px;">
<span style="background:rgba(255,184,48,0.15); color:var(--warning); padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700;">EXPENSE</span>
<div class="cost-val" style="font-size:0.9rem; margin-top:2px;">${safeToFixed(parseFloat(exp.amount) || 0, 2)}</div>
</div>
${exp.isMerged ? '' : `<button class="btn btn-sm btn-danger u-p-4-8" onclick="deleteExpenseFromOverlay('${esc(exp.id)}')">⌫</button>`}
`;
list.appendChild(item);
});
}
function filterExpenseManagementHistory() {
const term = document.getElementById('expense-history-search').value.toLowerCase();
const items = document.querySelectorAll('#expenseManagementHistoryList .cust-history-item');
items.forEach(item => {
item.style.display = item.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
});
}
async function deleteExpenseFromOverlay(expenseId) {
await deleteExpense(expenseId);
const overlayEl = document.getElementById('expenseDetailsOverlay');
if (overlayEl && overlayEl.style.display === 'flex' && currentExpenseOverlayName) {
renderExpenseOverlayContent();
}
}
async function saveQuickExpenseEntry() {
const amountEl = document.getElementById('quickExpenseAmount');
const descEl = document.getElementById('quickExpenseDescription');
if (!amountEl) return;
const amount = parseFloat(amountEl.value);
if (!amount || amount <= 0) {
showToast('Please enter a valid amount', 'warning');
return;
}
const expenseName = currentExpenseOverlayName;
if (!expenseName) return;
try {
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
let expenseId = generateUUID('exp');
if (!validateUUID(expenseId)) expenseId = generateUUID('exp');
let newExpense = {
id: expenseId,
name: expenseName,
amount: amount,
date: dateStr,
category: 'operating',
description: descEl ? descEl.value.trim() : '',
createdAt: now.getTime(),
updatedAt: now.getTime(),
syncedAt: now.toISOString()
};
newExpense = ensureRecordIntegrity(newExpense, false);
expenseRecords.push(newExpense);
await unifiedSave('expenses', expenseRecords, newExpense);
notifyDataChange('expenses');
showToast(` Expense added under "${expenseName}"`, 'success');
if (amountEl) amountEl.value = '';
if (descEl) descEl.value = '';
renderExpenseOverlayContent();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
} catch (error) {
showToast('Failed to save expense. Please try again.', 'error');
}
}
async function deleteAllExpensesByName() {
const expenseName = currentExpenseOverlayName;
if (!expenseName) return;
const toDelete = expenseRecords.filter(e =>
e.category === 'operating' &&
e.name.toLowerCase() === expenseName.toLowerCase()
);
if (toDelete.length === 0) {
closeExpenseDetailsOverlay();
return;
}
const _daeTotal = toDelete.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const _daeDateRange = toDelete.length > 1 ? ` (${toDelete[toDelete.length-1].date} – ${toDelete[0].date})` : (toDelete[0]?.date ? ` on ${toDelete[0].date}` : '');
const _daeTxCount = paymentTransactions.filter(t => toDelete.some(e => e.id === t.expenseId)).length;
let _daeMsg = `Permanently delete ALL ${toDelete.length} expense record${toDelete.length !== 1 ? 's' : ''} for "${expenseName}"?`;
_daeMsg += `\nTotal Amount: ${_daeTotal.toFixed(2)}`;
if (toDelete.length > 1) _daeMsg += `\nDate Range: ${toDelete[toDelete.length-1].date} – ${toDelete[0].date}`;
else if (toDelete[0]?.date) _daeMsg += `\nDate: ${toDelete[0].date}`;
if (_daeTxCount > 0) _daeMsg += `\n\n↩ ${_daeTxCount} linked payment transaction${_daeTxCount !== 1 ? 's' : ''} will also be reversed.`;
_daeMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(_daeMsg, { title: `Delete All "${expenseName}" Records`, confirmText: "Delete All", danger: true }))) return;
try {
for (const exp of toDelete) {
expenseRecords = expenseRecords.filter(e => e.id !== exp.id);
await unifiedDelete('expenses', expenseRecords, exp.id);
const linked = paymentTransactions.filter(t => t.expenseId === exp.id);
if (linked.length > 0) {
paymentTransactions = paymentTransactions.filter(t => t.expenseId !== exp.id);
for (const tx of linked) {
await unifiedDelete('payment_transactions', paymentTransactions, tx.id);
}
}
}
notifyDataChange('expenses');
showToast(` All "${expenseName}" expense records deleted`, 'success');
closeExpenseDetailsOverlay();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderRecentExpenses === 'function') renderRecentExpenses();
} catch (error) {
showToast('Failed to delete all expense records. Please try again.', 'error');
}
}
async function exportExpenseOverlayToPDF() {
const expenseName = currentExpenseOverlayName;
if (!expenseName) { showToast('No expense selected', 'warning'); return; }
const rangeEl = document.getElementById('expenseOverlayRange');
const range = rangeEl ? rangeEl.value : 'all';
showToast('Generating PDF...', 'info');
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Failed to load PDF library.');
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let records = expenseRecords.filter(e =>
e.category === 'operating' &&
e.name && e.name.toLowerCase() === expenseName.toLowerCase()
);
if (range !== 'all') {
records = records.filter(e => {
if (!e.date) return false;
const d = new Date(e.date);
switch (range) {
case 'today': return d >= today;
case 'week': { const w = new Date(today); w.setDate(w.getDate() - 7); return d >= w; }
case 'month': { const m = new Date(today); m.setMonth(m.getMonth() - 1); return d >= m; }
case 'year': { const y = new Date(today); y.setFullYear(y.getFullYear() - 1); return d >= y; }
default: return true;
}
});
}
records.sort((a, b) => new Date(a.date) - new Date(b.date));
const total = records.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const rangeName = range === 'all' ? 'All Time' : range.charAt(0).toUpperCase() + range.slice(1);
const { jsPDF } = window.jspdf;
const doc = new jsPDF('p', 'mm', 'a4');
const pageW = doc.internal.pageSize.getWidth();
const hdrColor = [255, 149, 0];
doc.setFillColor(...hdrColor);
doc.rect(0, 0, pageW, 22, 'F');
doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW/2, 10, { align:'center' });
doc.setFontSize(9); doc.setFont(undefined,'normal');
doc.text('Naswar Manufacturers & Dealers', pageW/2, 17, { align:'center' });
doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(50,50,50);
doc.text(`Expense History: ${expenseName}`, pageW/2, 30, { align:'center' });
doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(80,80,80);
doc.setFont(undefined,'bold'); doc.text('Period:', 14, 38);
doc.setFont(undefined,'normal'); doc.text(rangeName, 34, 38);
doc.setFont(undefined,'bold'); doc.text('Records:', 75, 38);
doc.setFont(undefined,'normal'); doc.text(String(records.length), 98, 38);
doc.setFont(undefined,'bold'); doc.text('Total:', 120, 38);
doc.setFont(undefined,'normal'); doc.setTextColor(...hdrColor); doc.setFont(undefined,'bold');
doc.text('Rs ' + safeToFixed(total, 2), 138, 38);
doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
doc.setFont(undefined,'bold'); doc.text('Generated:', 14, 44);
doc.setFont(undefined,'normal'); doc.text(now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) + ' at ' + now.toLocaleTimeString('en-US'), 42, 44);
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, 47, pageW - 14, 47);
if (records.length > 0) {

const mergedExpRecs = records.filter(e => e.isMerged === true);
const normalExpRecs = records.filter(e => !e.isMerged);
let tableStartY = 51;

if (mergedExpRecs.length > 0) {
  tableStartY = _pdfDrawMergedSectionHeader(doc, tableStartY, pageW, 'YEAR-END EXPENSE SUMMARIES (Carried Forward)');
  const mergedRows = mergedExpRecs.map(e => {
    const ms = e.mergedSummary || {};
    const period = _pdfMergedPeriodLabel(e);
    const count  = _pdfMergedCountLabel(e);
    return [
      period,
      `${count} — ${(e.description||'Year-end merged total').substring(0,45)}`,
      'Rs ' + safeToFixed(parseFloat(e.amount)||0, 2),
      '\u2605 MERGED'
    ];
  });
  const mTot = mergedExpRecs.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  mergedRows.push(['','SUBTOTAL ('+mergedExpRecs.length+' year periods)','Rs '+safeToFixed(mTot,2),'']);
  doc.autoTable({startY:tableStartY,head:[['Year Period','Summary','Amount','Note']],body:mergedRows,theme:'grid',
    headStyles:{fillColor:PDF_MERGED_HDR_COLOR,textColor:255,fontSize:9,fontStyle:'bold',halign:'center'},
    styles:{fontSize:8.5,cellPadding:3,lineWidth:0.15,lineColor:[200,180,230],overflow:'linebreak'},
    columnStyles:{0:{cellWidth:30,halign:'center'},1:{cellWidth:85},2:{cellWidth:30,halign:'right',fontStyle:'bold'},3:{cellWidth:31,halign:'center',fontStyle:'bold'}},
    didParseCell:function(data){const isSub=data.row.index===mergedRows.length-1;if(isSub){data.cell.styles.fillColor=[230,210,255];data.cell.styles.fontStyle='bold';data.cell.styles.fontSize=9.5;}else{data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR;data.cell.styles.textColor=[80,40,120];}if(data.column.index===2)data.cell.styles.textColor=isSub?[126,34,206]:[140,60,180];if(data.column.index===3&&!isSub)data.cell.styles.textColor=[126,34,206];},
    margin:{left:14,right:14}});
  tableStartY = doc.lastAutoTable.finalY + 8;
  if (tableStartY > 240) { doc.addPage(); tableStartY = 20; }
}

if (normalExpRecs.length > 0) {
  if (mergedExpRecs.length > 0) {
    doc.setFontSize(8.5); doc.setFont(undefined,'bold'); doc.setTextColor(...hdrColor);
    doc.text('INDIVIDUAL EXPENSE RECORDS', 14, tableStartY);
    doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
    tableStartY += 5;
  }
}
let runningTotal = 0;
const expenseRows = normalExpRecs.map(e => {
runningTotal += parseFloat(e.amount) || 0;
return [
formatDisplayDate(e.date) || e.date || '-',
(e.description || 'No description').substring(0, 55),
'Rs ' + safeToFixed(parseFloat(e.amount) || 0, 2),
'Rs ' + safeToFixed(runningTotal, 2)
];
});
expenseRows.push(['', 'TOTAL (' + records.length + ' entries)', 'Rs ' + safeToFixed(total, 2), '']);
doc.autoTable({
startY: tableStartY,
head: [['Date', 'Description', 'Amount', 'Cumulative Total']],
body: expenseRows,
theme: 'grid',
headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 9, fontStyle:'bold', halign:'center' },
styles: { fontSize: 8.5, cellPadding: 3, lineWidth: 0.15, lineColor:[180,180,180], overflow:'linebreak' },
columnStyles: {
0: { cellWidth: 24, halign:'center' },
1: { cellWidth: 90 },
2: { cellWidth: 30, halign:'right', textColor:[220,53,69], fontStyle:'bold' },
3: { cellWidth: 32, halign:'right', textColor:[255,149,0], fontStyle:'bold' }
},
didParseCell: function(data) {
const isTotal = data.row.index === expenseRows.length - 1;
if (isTotal) {
data.cell.styles.fontStyle = 'bold';
data.cell.styles.fillColor = [255, 245, 235];
data.cell.styles.fontSize = 9.5;
if (data.column.index === 2) data.cell.styles.textColor = [220, 53, 69];
}
},
margin: { left: 14, right: 14 }
});
if (range === 'all' && records.length > 5) {
const afterY = doc.lastAutoTable.finalY + 8;
if (afterY < 258) {
const monthTotals = {};
records.forEach(e => {
if (!e.date) return;
const d = new Date(e.date);
const key = d.toLocaleDateString('en-US',{year:'numeric',month:'short'});
monthTotals[key] = (monthTotals[key] || 0) + (parseFloat(e.amount) || 0);
});
doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(50,50,50);
doc.text('Monthly Breakdown:', 14, afterY);
let bkY = afterY + 5;
doc.setFont(undefined,'normal'); doc.setFontSize(8.5);
Object.entries(monthTotals).forEach(([month, amt]) => {
if (bkY > 278) return;
doc.setTextColor(80,80,80); doc.text(month, 14, bkY);
doc.setTextColor(220,53,69); doc.setFont(undefined,'bold');
doc.text('Rs ' + safeToFixed(amt, 2), 60, bkY);
doc.setFont(undefined,'normal');
bkY += 5;
});
}
}
} else {
doc.setFont(undefined,'normal'); doc.setFontSize(10); doc.setTextColor(150);
doc.text(`No expense records found for "${expenseName}" in the selected period.`, pageW/2, 70, { align:'center' });
}
const pageCount = doc.internal.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
doc.setPage(i);
doc.setFontSize(7); doc.setTextColor(160);
doc.text(
`Generated on ${now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} at ${now.toLocaleTimeString('en-US')} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW/2, 291, { align:'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW/2, 287, { align:'center' });
}
doc.save(`Expense_${expenseName.replace(/\s+/g,'_')}_${range}_${new Date().toISOString().split('T')[0]}.pdf`);
showToast('PDF exported successfully', 'success');
} catch (error) {
showToast('Failed to export PDF: ' + error.message, 'error');
}
}
async function deleteExpense(expenseId) {
const expense = expenseRecords.find(e => e.id === expenseId);
if (!expense) {
const orphans = paymentTransactions.filter(t => t.expenseId === expenseId);
if (orphans.length > 0) {
paymentTransactions = paymentTransactions.filter(t => t.expenseId !== expenseId);
for (const tx of orphans) {
await unifiedDelete('payment_transactions', paymentTransactions, tx.id);
}
}
renderRecentExpenses();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
return;
}
const linkedTransactions = paymentTransactions.filter(t => t.expenseId === expenseId);
const categoryLabel = expense.category === 'operating' ? 'Operating Expense'
: expense.category === 'IN' ? 'Payment IN'
: expense.category === 'OUT' ? 'Payment OUT'
: 'Expense';
const _dePayableOuts = linkedTransactions.filter(t => t.type === 'OUT' && t.isPayable === true);
const _deEntityIds = [...new Set(_dePayableOuts.map(t => t.entityId))];
const _deEntityNames = _deEntityIds.map(eid => { const e = paymentEntities.find(x => String(x.id) === String(eid)); return e?.name || 'Supplier'; });
let confirmMsg = `Permanently delete this ${categoryLabel}?`;
confirmMsg += `\n\nName: ${esc(expense.name || 'Unnamed')}`;
confirmMsg += `\nAmount: ${(parseFloat(expense.amount)||0).toFixed(2)}`;
confirmMsg += `\nDate: ${expense.date || 'Unknown'}`;
if (expense.description) confirmMsg += `\nNote: ${esc(expense.description)}`;
if (linkedTransactions.length > 0) {
const _deTxTotal = linkedTransactions.reduce((s, t) => s + (parseFloat(t.amount)||0), 0);
confirmMsg += `\n\n\u21a9 ${linkedTransactions.length} linked payment transaction${linkedTransactions.length !== 1 ? 's' : ''} (${_deTxTotal.toFixed(2)}) will be reversed.`;
if (_deEntityNames.length > 0) confirmMsg += `\n Suppliers affected: ${_deEntityNames.join(', ')} — payable status will be reset to pending.`;
}
confirmMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(confirmMsg, { title: `Delete ${categoryLabel}`, confirmText: "Delete", danger: true }))) return;
try {
const txToDelete = paymentTransactions.filter(t => t.expenseId === expenseId);
const payableOuts = txToDelete.filter(t => t.type === 'OUT' && t.isPayable === true);
const affectedSupplierIds = [...new Set(payableOuts.map(t => String(t.entityId)))];
const deletingIds = new Set(txToDelete.map(t => t.id));
for (const supplierId of affectedSupplierIds) {
const supplierMaterials = factoryInventoryData.filter(m =>
String(m.supplierId) === String(supplierId)
);
supplierMaterials.forEach(mat => {
const originalAmount = parseFloat((
mat.totalValue ||
(mat.purchaseCost && mat.purchaseQuantity ? mat.purchaseCost * mat.purchaseQuantity : mat.quantity * mat.cost) ||
0
).toFixed(2));
mat.totalPayable = originalAmount;
mat.paymentStatus = 'pending';
delete mat.paidDate;
mat.updatedAt = getTimestamp();
});
const remainingPayments = paymentTransactions
.filter(t =>
!deletingIds.has(t.id) &&
t.isPayable === true &&
t.type === 'OUT' &&
String(t.entityId) === String(supplierId)
)
.sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));
const sortedMaterials = supplierMaterials.slice().sort((a, b) =>
new Date(a.purchaseDate || a.date || a.createdAt || 0) -
new Date(b.purchaseDate || b.date || b.createdAt || 0)
);
remainingPayments.forEach(payment => {
let remaining = parseFloat(payment.amount) || 0;
for (const mat of sortedMaterials) {
if (remaining <= 0) break;
if (mat.totalPayable <= 0) continue;
if (remaining >= mat.totalPayable) {
remaining -= mat.totalPayable;
mat.totalPayable = 0;
mat.paymentStatus = 'paid';
mat.paidDate = payment.date;
} else {
mat.totalPayable = parseFloat((mat.totalPayable - remaining).toFixed(2));
remaining = 0;
}
}
});
for (const mat of supplierMaterials) {
await unifiedSave('factory_inventory_data', factoryInventoryData, mat);
}
}
if (txToDelete.length > 0) {
paymentTransactions = paymentTransactions.filter(t => t.expenseId !== expenseId);
for (const trans of txToDelete) {
await unifiedDelete('payment_transactions', paymentTransactions, trans.id);
}
}
expenseRecords = expenseRecords.filter(e => e.id !== expenseId);
await unifiedDelete('expenses', expenseRecords, expenseId);
notifyDataChange('expenses');
renderRecentExpenses();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
const label = expense.category === 'operating' ? 'Expense' : `Payment ${expense.category}`;
showToast(` ${label} deleted — all balances and views restored!`, 'success');
} catch (error) {
showToast('Failed to delete expense. Please try again.', 'error');
}
}
function clearExpenseForm() {
document.getElementById('expenseName').value = '';
document.getElementById('expenseAmount').value = '';
document.getElementById('expenseDescription').value = '';
document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
document.getElementById('expense-search-results').classList.add('hidden');
selectExpenseCategory('operating', document.getElementById('btn-category-operating'));
['btn-category-operating','btn-category-in','btn-category-out'].forEach(id => {
const btn = document.getElementById(id);
if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
});
const expIdEl = document.getElementById('expense-id-display');
if (expIdEl && typeof generateUUID === 'function') {
const previewId = generateUUID('exp');
expIdEl.textContent = 'ID: ' + previewId.split('-').slice(0,2).join('-') + '…';
expIdEl.title = previewId;
}
}
function getCategoryColor(category) {
switch(category) {
case 'operating': return 'var(--danger)';
case 'loan': return 'var(--warning)';
case 'misc': return 'var(--accent)';
default: return 'var(--text-muted)';
}
}
function getCategoryLabel(category) {
switch(category) {
case 'operating': return 'Operating';
case 'loan': return '▬ Loan/Debt';
case 'misc': return ' Miscellaneous';
default: return 'Other';
}
}
function selectCustomer(name) {
const input = document.getElementById('cust-name');
const resultsDiv = document.getElementById('customer-search-results');
if(input) {
input.value = name;
}
if(resultsDiv) {
resultsDiv.classList.add('hidden');
}
if(typeof calculateCustomerStatsForDisplay === 'function') {
calculateCustomerStatsForDisplay(name);
}
}
async function calculateCustomerStatsForDisplay(name) {
if (!name) return;
const sales = customerSales.filter(s =>
s && s.customerName && s.customerName.toLowerCase() === name.toLowerCase() &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE')
);
if (sales.length === 0) {
document.getElementById('customer-info-display').classList.add('hidden');
return;
}
let totalCredit = 0;
let totalQty = 0;
sales.forEach(s => {
totalQty += (s.quantity || 0);
if (s.paymentType === 'CREDIT' && !s.creditReceived) {
if (s.isMerged && typeof s.creditValue === 'number') {
totalCredit += s.creditValue;
} else {
const partialPaid = s.partialPaymentReceived || 0;
totalCredit += ((s.totalValue || 0) - partialPaid);
}
}
});
const _setCust = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setCust('customer-current-credit', await formatCurrency(totalCredit));
_setCust('customer-total-quantity', safeNumber(totalQty, 0).toFixed(2) + ' kg');
document.getElementById('customer-info-display').classList.remove('hidden');
}
async function renderCustomersTable(page = 1) {
const tbody = document.getElementById('customers-table-body');
if (!tbody) {
return;
}
try {
const freshSales = await idb.get('customer_sales', []);
if (Array.isArray(freshSales)) {
const recordMap = new Map(freshSales.map(s => [s.id, s]));
if (Array.isArray(customerSales)) {
customerSales.forEach(s => {
if (!recordMap.has(s.id)) {
recordMap.set(s.id, s);
}
});
}
customerSales = Array.from(recordMap.values());
}
} catch (error) {
console.error('UI refresh failed.', error);
showToast('UI refresh failed.', 'error');
}
const filterInput = document.getElementById('customer-filter');
const filterValue = filterInput ? filterInput.value.toLowerCase() : '';
const customerStats = {};
customerSales.forEach(sale => {
if (sale.isRepModeEntry === true) return;
const name = sale.salesRep && sale.salesRep !== 'NONE' && sale.salesRep !== 'ADMIN'
? sale.salesRep
: sale.customerName;
if (!name || name.trim() === '') return;
if (!customerStats[name]) {
customerStats[name] = { name: name, credit: 0, quantity: 0, lastSaleDate: 0 };
}
customerStats[name].quantity += (sale.quantity || 0);
if (sale.paymentType === 'CREDIT' && !sale.creditReceived) {
if (sale.isMerged && typeof sale.creditValue === 'number') {
customerStats[name].credit += sale.creditValue;
} else {
const partialPaid = sale.partialPaymentReceived || 0;
customerStats[name].credit += ((sale.totalValue || 0) - partialPaid);
}
}
const saleDate = sale.date;
if (saleDate) {
const timestamp = new Date(saleDate).getTime();
if (!isNaN(timestamp) && timestamp > customerStats[name].lastSaleDate) {
customerStats[name].lastSaleDate = timestamp;
}
}
});
let sortedCustomers = Object.values(customerStats)
.filter(c => c && c.name)
.sort((a, b) => {
if (b.credit !== a.credit) return b.credit - a.credit;
return b.lastSaleDate - a.lastSaleDate;
});
if (filterValue) {
sortedCustomers = sortedCustomers.filter(c => c && c.name && c.name.toLowerCase().includes(filterValue));
}
let totalOutstanding = 0;
let totalGlobalQty = 0;
sortedCustomers.forEach(c => {
totalOutstanding += c.credit;
totalGlobalQty += c.quantity;
});
const pageCustomers = sortedCustomers;
const validPage = 1;
const totalPages = 1;
const totalItems = sortedCustomers.length;
const startIndex = 0;
const endIndex = sortedCustomers.length;
const customerData = {
customers: pageCustomers,
totalOutstanding,
totalGlobalQty,
totalItems,
page,
totalPages
};
if (customerData && customerData.customers) {
renderCustomersFromCache(customerData, tbody);
} else {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Failed to load customer data</td></tr>`;
}
const _setCustH = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setCustH('customer-count', `${totalItems || 0} active`);
_setCustH('customers-total-credit', `${totalOutstanding.toFixed(2)}`);
_setCustH('customers-total-quantity', safeNumber(totalGlobalQty, 0).toFixed(2) + ' kg');
}
function renderCustomersFromCache(data, tbody) {
if (!data) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Error loading customers</td></tr>`;
return;
}
const { customers, totalItems, page, totalPages } = data;
if (!customers || !Array.isArray(customers)) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Invalid customer data</td></tr>`;
return;
}
if (customers.length === 0) {
tbody.innerHTML = `<tr><td class="u-empty-state-md" colspan="5" >No customers found</td></tr>`;
return;
}
function buildCustomerRow(c) {
if (!c || !c.name) return null;
try {
const displayDate = (c.lastSaleDate && !isNaN(c.lastSaleDate)) ? formatDisplayDate(new Date(c.lastSaleDate)) : '-';
let phone = '-';
try {
const contact = salesCustomers.find(ct => ct && ct.name && c && c.name && ct.name.toLowerCase() === c.name.toLowerCase());
const customerSaleData = customerSales.find(s =>
s && s.customerName && c && c.name &&
(s.customerName === c.name || s.salesRep === c.name) &&
s.isRepModeEntry !== true &&
s.customerPhone
);
phone = contact?.phone || customerSaleData?.customerPhone || '-';
} catch (phoneError) {
console.warn('Customer data operation failed.', phoneError);
}
const creditStyle = c.credit > 0 ? 'color:var(--warning); font-weight:700;' : 'color:var(--accent-emerald); font-weight:700;';
const row = document.createElement('tr');
row.style.borderBottom = '1px solid var(--glass-border)';
const safeName = esc(c.name || 'Unknown');
const safeNameForAttr = (c.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
row.innerHTML = `
<td class="u-table-td">${displayDate}</td>
<td style="padding: 8px 2px; font-size: 0.8rem; color: var(--text-main); font-weight: 600;">${safeName}</td>
<td class="u-table-td">${phoneActionHTML(phone)}</td>
<td style="padding: 8px 2px; text-align: right; font-size: 0.8rem; ${creditStyle}">${safeValue(c.credit).toFixed(2)}</td>
<td style="padding: 6px 2px; text-align: center;">
<button class="tbl-action-btn" onclick="event.stopPropagation(); openCustomerManagement('${safeNameForAttr}')">View</button>
</td>`;
return row;
} catch (rowError) {
console.warn('An unexpected error occurred.', rowError);
return null;
}
}
GNDVirtualScroll.mount('vs-scroller-customers', customers, buildCustomerRow, tbody);
}
let currentManagingCustomer = null;
let currentManagingRepCustomer = null;
async function openCustomerManagement(customerName) {
currentManagingCustomer = customerName;
const _setMCT = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setMCT('manageCustomerTitle', customerName);
document.getElementById('bulkPaymentAmount').value = '';
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('customerManagementOverlay').style.display = 'flex';
});
await renderCustomerTransactions(customerName);
}
function closeCustomerManagement() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('customerManagementOverlay').style.display = 'none';
});
currentManagingCustomer = null;
setTimeout(async () => {
try {
const freshSales = await idb.get('customer_sales', []);
if (Array.isArray(freshSales)) {
const m = new Map(freshSales.map(s => [s.id, s]));
if (Array.isArray(customerSales)) customerSales.forEach(s => { if (!m.has(s.id)) m.set(s.id, s); });
customerSales = Array.from(m.values());
}
const freshContacts = await idb.get('sales_customers', []);
if (Array.isArray(freshContacts)) {
const m = new Map(freshContacts.map(c => [c.id, c]));
if (Array.isArray(salesCustomers)) salesCustomers.forEach(c => { if (!m.has(c.id)) m.set(c.id, c); });
salesCustomers = Array.from(m.values());
}
} catch(e) {
showToast('Customer data operation failed.', 'error');
console.warn('closeCustomerManagement IDB error', e);
}
if (typeof renderCustomersTable === 'function') renderCustomersTable();
}, 100);
}
async function renderCustomerTransactions(name) {
const list = document.getElementById('customerManagementHistoryList');
if (!list) return;
list.innerHTML = '';
let transactions = [];
try {
const dbSales = await idb.get('customer_sales', []);
if (Array.isArray(dbSales)) {
const recordMap = new Map(dbSales.map(s => [s.id, s]));
if (Array.isArray(customerSales)) {
customerSales.forEach(s => {
if (!recordMap.has(s.id)) {
recordMap.set(s.id, s);
}
});
}
customerSales = Array.from(recordMap.values());
transactions = customerSales.filter(s =>
s && s.customerName === name &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE' || s.salesRep === 'ADMIN' || s.salesRep === name)
);
} else {
transactions = customerSales.filter(s =>
s && s.customerName === name &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE' || s.salesRep === 'ADMIN' || s.salesRep === name)
);
}
} catch (error) {
console.error('Customer data operation failed.', error);
showToast('Customer data operation failed.', 'error');
transactions = customerSales.filter(s =>
s && s.customerName === name &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE' || s.salesRep === 'ADMIN' || s.salesRep === name)
);
}
const rangeSelect = document.getElementById('customerPdfRange');
const range = rangeSelect ? rangeSelect.value : 'all';
if (range !== 'all') {
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
transactions = transactions.filter(t => {
if (!t.date) return false;
const transDate = new Date(t.date);
switch(range) {
case 'today':
return transDate >= today;
case 'week':
const weekAgo = new Date(today);
weekAgo.setDate(weekAgo.getDate() - 7);
return transDate >= weekAgo;
case 'month':
const monthAgo = new Date(today);
monthAgo.setMonth(monthAgo.getMonth() - 1);
return transDate >= monthAgo;
case 'year':
const yearAgo = new Date(today);
yearAgo.setFullYear(yearAgo.getFullYear() - 1);
return transDate >= yearAgo;
default:
return true;
}
});
}
const entity = paymentEntities.find(e => e && e.name && e.name.toLowerCase() === name.toLowerCase());
const phone = entity?.phone || transactions.find(t => t && t.customerPhone)?.customerPhone || '';
const address = entity?.address || '';
const headerTitle = document.getElementById('manageCustomerTitle');
headerTitle.innerHTML = `
<div style="display:flex; align-items:center; gap:8px;">
<span>${esc(name)}</span>
<button class="btn-theme" style="padding:2px 6px; font-size:0.8rem; border:1px solid var(--accent); color:var(--accent); border-radius:50%;"
onclick="openCustomerEditModal('${esc(name).split("'").join("\\\'")}')" title="Edit Contact Info"></button>
</div>
<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top:4px;">
${phone ? phoneActionHTML(phone) : 'No Phone'} ${address ? `| ◆ ${esc(address)}` : ''}
</div>
`;
let currentDebt = 0;
transactions.forEach(t => {
if(t.paymentType === 'CREDIT' && !t.creditReceived) {
if (t.isMerged && typeof t.creditValue === 'number') {
currentDebt += t.creditValue;
} else {
const partialPaid = t.partialPaymentReceived || 0;
currentDebt += (t.totalValue - partialPaid);
}
}
});
const _mcStats = document.getElementById('manageCustomerStats'); if (_mcStats) _mcStats.innerText = `Current Debt: ${await formatCurrency(currentDebt)}`;
transactions.sort((a,b) => {
const aPending = (a.paymentType === 'CREDIT' && !a.creditReceived) ? 1 : 0;
const bPending = (b.paymentType === 'CREDIT' && !b.creditReceived) ? 1 : 0;
if (bPending !== aPending) return bPending - aPending;
return b.timestamp - a.timestamp;
});
if(transactions.length === 0) {
list.innerHTML = '<div class="u-empty-state-sm" >No history found</div>';
return;
}
for (const t of transactions) {
const isCredit = t.paymentType === 'CREDIT';
const isPartialPayment = t.paymentType === 'PARTIAL_PAYMENT';
const isCollection = t.paymentType === 'COLLECTION';
const item = document.createElement('div');
item.className = 'cust-history-item';
let statusClass = t.creditReceived ? 'paid' : 'pending';
let btnText = t.creditReceived ? 'PAID' : 'PENDING';
let toggleBtnHtml = '';
const partialPaid = t.partialPaymentReceived || 0;

const effectiveDue = (t.isMerged && typeof t.creditValue === 'number') ? t.creditValue : ((t.totalValue || 0) - partialPaid);
const hasPartialPayment = isCredit && !t.creditReceived && partialPaid > 0 && !t.isMerged;
const isOldDebt = t.transactionType === 'OLD_DEBT';
if (t.isMerged) {

const mergedSettled = t.creditReceived || (t.isMerged && effectiveDue <= 0.01);
toggleBtnHtml = mergedSettled
? `<span class="status-toggle-btn paid" style="opacity:0.8;">SETTLED</span>`
: `<span class="status-toggle-btn pending" style="opacity:0.8;">PENDING</span>`;
} else if(isCredit) {
if (hasPartialPayment) {
const remaining = effectiveDue;
btnText = `PARTIAL (${await formatCurrency(remaining)} due)`;
statusClass = 'partial';
}
toggleBtnHtml = `<button class="status-toggle-btn ${statusClass}" onclick="toggleSingleTransactionStatus('${t.id}')">${btnText}</button>`;
} else if (isPartialPayment) {
toggleBtnHtml = `<span class="status-toggle-btn" style="background:rgba(255, 159, 10, 0.1); color:var(--warning);">PARTIAL PAYMENT</span>`;
} else if (isCollection) {
toggleBtnHtml = `<span class="status-toggle-btn" style="background:rgba(48, 209, 88, 0.1); color:var(--accent-emerald);">COLLECTION</span>`;
} else {
toggleBtnHtml = `<span class="status-toggle-btn" style="background:rgba(37, 99, 235, 0.1); color:var(--accent);">CASH SALE</span>`;
}
const deleteBtnHtml = t.isMerged ? '' : `<button class="btn btn-sm btn-danger u-p-4-8" onclick="deleteTransactionFromOverlay('${esc(t.id)}')">⌫</button>`;
let itemContent = '';
if (isPartialPayment || isCollection) {
itemContent = `
<div class="cust-history-info">
<div class="u-mono-bold" >${formatDisplayDate(t.date)}${_mergedBadgeHtml(t, {inline:true})}</div>
<div style="font-size:0.75rem; color:var(--accent-emerald);">
Payment: ${await formatCurrency(t.totalValue)}
</div>
<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
${isPartialPayment ? 'Partial Payment' : 'Bulk Payment'}
</div>
</div>
<div class="cust-history-actions">
${toggleBtnHtml}
${deleteBtnHtml}
</div>
`;
} else if (isOldDebt) {
itemContent = `
<div class="cust-history-info">
<div class="u-mono-bold" >
${formatDisplayDate(t.date)}
<span style="background:rgba(255, 159, 10, 0.15); color:var(--warning); padding:2px 6px; border-radius:4px; font-size:0.65rem; margin-left:6px; font-weight:600;">OLD DEBT</span>${_mergedBadgeHtml(t, {inline:true})}
</div>
<div style="font-size:0.75rem; color:var(--warning);">
Previous Balance: ${await formatCurrency(t.totalValue)}
</div>
<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
${esc(t.notes || 'Brought forward from previous records')}
</div>
</div>
<div class="cust-history-actions">
${toggleBtnHtml}
${deleteBtnHtml}
</div>
`;
} else {
// Canonical sale price: use stored unitPrice (set on merge) or the fixed
// getSalePriceForStore rate for the supply store — never divide totalValue/quantity
// which produces a weighted average and can differ after partial payments.
const _displayUnitPrice = (t.unitPrice && t.unitPrice > 0)
  ? t.unitPrice
  : getSalePriceForStore(t.supplyStore || 'STORE_A');
itemContent = `
<div class="cust-history-info">
<div class="u-mono-bold" >${formatDisplayDate(t.date)}${_mergedBadgeHtml(t, {inline:true})}</div>
<div class="u-fs-sm2 u-text-muted" >
${t.quantity.toFixed(2)} kg @ ${await formatCurrency(_displayUnitPrice)}
</div>
${hasPartialPayment ? `<div style="font-size:0.7rem; color:var(--accent-emerald); margin-top:2px;">Paid: ${await formatCurrency(partialPaid)}</div>` : ''}
<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
${getStoreLabel(t.supplyStore)}
</div>
</div>
<div class="cust-history-actions">
${toggleBtnHtml}
${deleteBtnHtml}
</div>
`;
}
item.innerHTML = itemContent;
list.appendChild(item);
}
}
async function toggleSingleTransactionStatus(id) {
const record = customerSales.find(s => s.id === id);
if (record?.isMerged) {
showToast('Opening balance records cannot be toggled. Use Bulk Payment to settle.', 'warning', 4000);
return;
}
const snapshot = [...customerSales];
try {
const idx = customerSales.findIndex(s => s.id === id);
if (idx !== -1) {
customerSales[idx].creditReceived = !customerSales[idx].creditReceived;
customerSales[idx].updatedAt = getTimestamp();
await unifiedSave('customer_sales', customerSales, customerSales[idx]);
notifyDataChange('sales');
triggerAutoSync();
renderCustomerTransactions(currentManagingCustomer);
refreshAllCalculations();
}
} catch (e) {
customerSales.length = 0; customerSales.push(...snapshot);
await idb.set('customer_sales', customerSales).catch(() => {});
showToast('Failed to update transaction status. Please try again.', 'error');
}
}
async function toggleRepTransactionStatus(id) {
const record = repSales.find(s => s.id === id);
if (record?.isMerged) {
showToast('Opening balance records cannot be toggled. Use Bulk Payment to settle.', 'warning', 4000);
return;
}
const snapshot = [...repSales];
try {
const idx = repSales.findIndex(s => s.id === id);
if (idx !== -1) {

repSales[idx].creditReceived = !repSales[idx].creditReceived;
repSales[idx].updatedAt = getTimestamp();
await unifiedSave('rep_sales', repSales, repSales[idx]);
notifyDataChange('rep');
triggerAutoSync();
renderRepCustomerTransactions(currentManagingRepCustomer);
}
} catch (e) {
repSales.length = 0; repSales.push(...snapshot);
await idb.set('rep_sales', repSales).catch(() => {});
showToast('Failed to update transaction status. Please try again.', 'error');
}
}
async function deleteTransactionFromOverlay(id) {
const _txItem = customerSales.find(s => s.id === id);
if (_txItem?.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const _isOldDebt = _txItem?.transactionType === 'OLD_DEBT';
const _txType = _isOldDebt ? 'Old Debt Record' : _txItem ? (_txItem.paymentType === 'CREDIT' ? 'Credit Sale' : _txItem.paymentType === 'PARTIAL_PAYMENT' ? 'Partial Payment' : _txItem.paymentType === 'COLLECTION' ? 'Collection' : 'Cash Sale') : 'Transaction';
const _txDate = _txItem ? (_txItem.date || 'Unknown date') : '';
const _txQty = _txItem ? ((_txItem.quantity || 0) > 0 ? `${_txItem.quantity} kg` : '') : '';
const _txAmt = _txItem ? ((_txItem.totalValue || 0) > 0 ? ` — ${(_txItem.totalValue||0).toFixed(2)}` : '') : '';
const _txCust = _txItem ? (_txItem.customerName || '') : '';
const _txStore = _txItem?.supplyStore ? getStoreLabel(_txItem.supplyStore) : '';
const _partialPaid = _txItem?.partialPaymentReceived || 0;
let _txMsg, _txTitle;
if (_isOldDebt) {
_txTitle = '\u26a0 Delete Old Debt Record';
_txMsg = `You are about to permanently delete an OLD DEBT record for ${_txCust || 'this customer'}.`;
_txMsg += `\nBalance: ${(_txItem.totalValue||0).toFixed(2)}`;
if (_txDate) _txMsg += `\nRecorded: ${_txDate}`;
if (_txItem?.notes) _txMsg += `\nNote: ${_txItem.notes}`;
_txMsg += `\n\n\u26a0 Warning: This will remove the carried-forward balance from the customer's history. If this debt is still owed, deleting it will make it disappear from all records and reports permanently.`;
_txMsg += `\n\nOnly delete if this was entered by mistake or has already been fully settled elsewhere.`;
} else if (_txItem?.paymentType === 'COLLECTION') {
_txTitle = 'Delete Bulk Collection';
_txMsg = `Delete this bulk collection payment from ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
_txMsg += `\nAmount Collected: ${(_txItem.totalValue||0).toFixed(2)}`;
_txMsg += `\n\n\u21a9 This collection will be reversed and the customer's outstanding balance restored accordingly.`;
} else if (_txItem?.paymentType === 'PARTIAL_PAYMENT') {
_txTitle = 'Delete Partial Payment';
_txMsg = `Delete this partial payment from ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
_txMsg += `\nPayment Amount: ${(_txItem.totalValue||0).toFixed(2)}`;
_txMsg += `\n\n\u21a9 This will reverse the partial payment and restore the full pending credit balance on the linked sale.`;
} else if (_txItem?.paymentType === 'CREDIT') {
_txTitle = 'Delete Credit Sale';
_txMsg = `Delete this credit sale for ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
if (_txQty) _txMsg += `\nQty: ${_txQty}${_txAmt}`;
if (_txStore) _txMsg += `\nStore: ${_txStore}`;
if (_partialPaid > 0) _txMsg += `\n\n\u26a0 ${_partialPaid.toFixed(2)} has been partially collected. Deleting will erase both the sale and the partial payment record.`;
else if (_txItem?.creditReceived) _txMsg += `\n\n\u26a0 This sale is already marked PAID. Deleting will remove the payment record.`;
else _txMsg += `\n\n\u26a0 This credit sale is UNPAID. Deleting will permanently remove the outstanding balance from this customer's account.`;
} else {
_txTitle = 'Delete Cash Sale';
_txMsg = `Delete this cash sale for ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
if (_txQty) _txMsg += `\nQty: ${_txQty}${_txAmt}`;
if (_txStore) _txMsg += `\nStore: ${_txStore}`;
_txMsg += `\n\n\u21a9 ${(_txItem?.quantity||0).toFixed(2)} kg will be restored to inventory.`;
}
_txMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(_txMsg, { title: _txTitle || `Delete ${_txType}`, confirmText: 'Delete', danger: true }))) return;
try {
const item = customerSales.find(s => s.id === id);
if (!item) { renderCustomerTransactions(currentManagingCustomer); return; }
const wasCredit = item.paymentType === 'CREDIT';
const wasPartialPayment = item.paymentType === 'PARTIAL_PAYMENT';
const wasCollection = item.paymentType === 'COLLECTION';
const paymentAmount = item.totalValue || 0;
if (wasPartialPayment && item.relatedSaleId) {
const rel = customerSales.find(s => s.id === item.relatedSaleId);
if (rel) {
rel.partialPaymentReceived = Math.max(0, (rel.partialPaymentReceived || 0) - paymentAmount);
if (rel.partialPaymentReceived === 0) { rel.creditReceived = false; delete rel.creditReceivedDate; }
rel.updatedAt = getTimestamp();
}
}
await registerDeletion(id, 'sales');
customerSales = customerSales.filter(s => s.id !== id);
await unifiedDelete('customer_sales', customerSales, id);
renderCustomerTransactions(currentManagingCustomer);
refreshAllCalculations();
if (typeof refreshCustomerSales === 'function') await refreshCustomerSales();
renderCustomersTable();
notifyDataChange('sales');
triggerAutoSync();
let msg = ` ${wasPartialPayment ? 'Payment' : wasCollection ? 'Collection' : 'Transaction'} deleted!`;
if ((item.quantity || 0) > 0) msg += ` ${item.quantity} kg restored.`;
if ((wasPartialPayment || wasCollection || (wasCredit && item.partialPaymentReceived > 0)) && paymentAmount > 0) {
const ref = wasCredit ? (item.partialPaymentReceived || 0) : paymentAmount;
if (ref > 0) msg += ` Payment of ${await formatCurrency(ref)} reversed.`;
}
showToast(msg, 'success');
} catch (e) {
showToast('Failed to delete transaction. Please try again.', 'error');
}
}
async function deleteRepTransactionFromOverlay(id) {
const _rItem = repSales.find(s => s.id === id);
if (_rItem?.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const _rIsOldDebt = _rItem?.transactionType === 'OLD_DEBT';
const _rType = _rIsOldDebt ? 'Old Debt Record' : _rItem ? (_rItem.paymentType === 'CREDIT' ? 'Credit Sale' : _rItem.paymentType === 'PARTIAL_PAYMENT' ? 'Partial Payment' : _rItem.paymentType === 'COLLECTION' ? 'Collection' : 'Cash Sale') : 'Transaction';
const _rDate = _rItem ? (_rItem.date || 'Unknown date') : '';
const _rQty = _rItem ? ((_rItem.quantity || 0) > 0 ? `${_rItem.quantity} kg` : '') : '';
const _rAmt = _rItem ? ((_rItem.totalValue || 0) > 0 ? ` — ${(_rItem.totalValue||0).toFixed(2)}` : '') : '';
const _rCust = _rItem ? (_rItem.customerName || '') : '';
const _rRep = _rItem?.salesRep || '';
const _rPartialPaid = _rItem?.partialPaymentReceived || 0;
let _rMsg, _rTitle;
if (_rIsOldDebt) {
_rTitle = '\u26a0 Delete Old Debt Record';
_rMsg = `Permanently delete an OLD DEBT record for ${_rCust || 'this customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}.`;
_rMsg += `\nBalance: ${(_rItem.totalValue||0).toFixed(2)}`;
if (_rDate) _rMsg += `\nRecorded: ${_rDate}`;
if (_rItem?.notes) _rMsg += `\nNote: ${_rItem.notes}`;
_rMsg += `\n\n\u26a0 Warning: This will remove the carried-forward balance from the rep customer's history permanently.`;
_rMsg += `\n\nOnly delete if this was entered by mistake or has already been fully settled elsewhere.`;
} else if (_rItem?.paymentType === 'COLLECTION') {
_rTitle = 'Delete Rep Collection';
_rMsg = `Delete this bulk collection from ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
_rMsg += `\nAmount Collected: ${(_rItem.totalValue||0).toFixed(2)}`;
_rMsg += `\n\n\u21a9 This collection will be reversed and the customer's outstanding rep balance restored.`;
} else if (_rItem?.paymentType === 'PARTIAL_PAYMENT') {
_rTitle = 'Delete Rep Partial Payment';
_rMsg = `Delete this partial payment from ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
_rMsg += `\nPayment Amount: ${(_rItem.totalValue||0).toFixed(2)}`;
_rMsg += `\n\n\u21a9 This will reverse the partial payment and restore the full pending credit balance on the linked rep sale.`;
} else if (_rItem?.paymentType === 'CREDIT') {
_rTitle = 'Delete Rep Credit Sale';
_rMsg = `Delete this credit sale for ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
if (_rQty) _rMsg += `\nQty: ${_rQty}${_rAmt}`;
if (_rPartialPaid > 0) _rMsg += `\n\n\u26a0 ${_rPartialPaid.toFixed(2)} has already been partially collected. Deleting will erase both the sale and the partial payment record.`;
else if (_rItem?.creditReceived) _rMsg += `\n\n\u26a0 This rep sale is already marked PAID. Deleting will remove the payment record.`;
else _rMsg += `\n\n\u26a0 This rep credit sale is UNPAID. Deleting will remove the outstanding balance from the rep customer's account.`;
} else {
_rTitle = 'Delete Rep Cash Sale';
_rMsg = `Delete this cash sale for ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
if (_rQty) _rMsg += `\nQty: ${_rQty}${_rAmt}`;
_rMsg += `\n\n\u21a9 ${(_rItem?.quantity||0).toFixed(2)} kg will be restored to inventory.`;
}
_rMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(_rMsg, { title: _rTitle || `Delete ${_rType}`, confirmText: 'Delete', danger: true }))) return;
try {
const item = repSales.find(s => s.id === id);
if (!item) { renderRepCustomerTransactions(currentManagingRepCustomer); return; }
const wasCredit = item.paymentType === 'CREDIT';
const wasPartialPayment = item.paymentType === 'PARTIAL_PAYMENT';
const wasCollection = item.paymentType === 'COLLECTION';
const paymentAmount = item.totalValue || 0;
if (wasPartialPayment && item.relatedSaleId) {
const rel = repSales.find(s => s.id === item.relatedSaleId);
if (rel) {
rel.partialPaymentReceived = Math.max(0, (rel.partialPaymentReceived || 0) - paymentAmount);
if (rel.partialPaymentReceived === 0) { rel.creditReceived = false; delete rel.creditReceivedDate; }
rel.updatedAt = getTimestamp();
}
}
await registerDeletion(id, 'rep_sales');
repSales = repSales.filter(s => s.id !== id);
await unifiedDelete('rep_sales', repSales, id);
renderRepCustomerTransactions(currentManagingRepCustomer);
renderRepCustomerTable();
notifyDataChange('rep');
triggerAutoSync();
let msg = ` ${wasPartialPayment ? 'Payment' : wasCollection ? 'Collection' : 'Transaction'} deleted!`;
if ((wasPartialPayment || wasCollection || (wasCredit && item.partialPaymentReceived > 0)) && paymentAmount > 0) {
const ref = wasCredit ? (item.partialPaymentReceived || 0) : paymentAmount;
if (ref > 0) msg += ` Payment of ${await formatCurrency(ref)} reversed.`;
}
showToast(msg, 'success');
} catch (e) {
showToast('Failed to delete transaction. Please try again.', 'error');
}
}
async function processBulkPayment() {
const amount = parseFloat(document.getElementById('bulkPaymentAmount').value);
if (!amount || amount <= 0) { showToast('Please enter a valid amount', 'warning', 3000); return; }
const snapshot = [...customerSales];
try {
let remaining = amount, updatedCount = 0, partialPaymentMade = false;
const pending = customerSales.filter(s =>
s.customerName === currentManagingCustomer &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE') &&
s.paymentType === 'CREDIT' && !s.creditReceived
).sort((a, b) => a.timestamp - b.timestamp);
if (pending.length === 0) { showToast('No pending credit transactions found for this customer.', 'info', 4000); return; }
const nowDate = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const nowTime = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const nowEpoch = getTimestamp();
for (const sale of pending) {
if (remaining <= 0) break;
const amountDue = sale.isMerged && typeof sale.creditValue === 'number'
? sale.creditValue
: (sale.totalValue || 0) - (sale.partialPaymentReceived || 0);
if (remaining >= amountDue) {
sale.creditReceived = true;
sale.creditReceivedDate = nowISODate;
if (!sale.isMerged) sale.partialPaymentReceived = sale.totalValue;
sale.updatedAt = nowEpoch;
remaining -= amountDue; updatedCount++;
} else {
if (!sale.isMerged) {
sale.partialPaymentReceived = (sale.partialPaymentReceived || 0) + remaining;
sale.creditReceived = false; sale.updatedAt = nowEpoch;
}
const partialId = generateUUID('pay-partial');
customerSales.push(ensureRecordIntegrity({
id: partialId, timestamp: nowEpoch, createdAt: nowEpoch, updatedAt: nowEpoch,
date: nowISODate, time: nowTime,
customerName: currentManagingCustomer, customerPhone: sale.customerPhone || '', quantity: 0,
supplyStore: sale.supplyStore || 'STORE_A', paymentType: 'PARTIAL_PAYMENT', salesRep: 'NONE',
totalCost: 0, totalValue: remaining, profit: 0, creditReceived: true,
relatedSaleId: sale.id, syncedAt: new Date().toISOString(), isRepModeEntry: false
}, false, false));
partialPaymentMade = true; remaining = 0; updatedCount++; break;
}
}
if (remaining > 0 && updatedCount > 0) {
const ls = pending[pending.length - 1];
const collId = generateUUID('pay-coll');
customerSales.push(ensureRecordIntegrity({
id: collId, timestamp: nowEpoch, createdAt: nowEpoch, updatedAt: nowEpoch,
date: nowISODate, time: nowTime,
customerName: currentManagingCustomer, customerPhone: ls?.customerPhone || '', quantity: 0,
supplyStore: ls?.supplyStore || 'STORE_A', paymentType: 'COLLECTION', salesRep: 'NONE',
totalCost: 0, totalValue: remaining, profit: 0, creditReceived: true,
syncedAt: new Date().toISOString(), isRepModeEntry: false
}, false, false));
}
if (updatedCount > 0 || partialPaymentMade) {
await saveWithTracking('customer_sales', customerSales);
const changedIds = new Set(pending.map(s => s.id));
for (const sale of customerSales) {
if (changedIds.has(sale.id) || sale.paymentType === 'PARTIAL_PAYMENT' || sale.paymentType === 'COLLECTION') {
await saveRecordToFirestore('customer_sales', sale);
}
}
notifyDataChange('sales'); triggerAutoSync();
let msg = `Payment of ${safeToFixed(amount, 2)} processed successfully. `;
msg += partialPaymentMade ? 'Partial payment applied.' : remaining === 0 ? `${updatedCount} transaction(s) fully cleared.` : `${updatedCount} cleared, ${safeToFixed(remaining, 2)} extra.`;
showToast(msg, 'info', 5000);
document.getElementById('bulkPaymentAmount').value = '';
renderCustomerTransactions(currentManagingCustomer);
refreshAllCalculations();
} else { showToast('No changes made.', 'info', 2500); }
} catch (e) {
customerSales.length = 0; customerSales.push(...snapshot);
await idb.set('customer_sales', customerSales).catch(() => {});
showToast('Failed to process bulk payment. Please try again.', 'error');
}
}
function filterCustomerManagementHistory() {
const term = document.getElementById('cust-trans-search').value.toLowerCase();
document.querySelectorAll('#customerManagementHistoryList .cust-history-item').forEach(item => {
item.style.display = item.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
});
}
async function processRepBulkPayment() {
const amount = parseFloat(document.getElementById('repBulkPaymentAmount').value);
if (!amount || amount <= 0) { showToast('Please enter a valid amount', 'warning', 3000); return; }
const snapshot = [...repSales];
try {
let remaining = amount, updatedCount = 0, partialPaymentMade = false;
const pending = repSales.filter(s =>
s.customerName === currentManagingRepCustomer &&
s.salesRep === currentRepProfile &&
s.paymentType === 'CREDIT' && !s.creditReceived
).sort((a, b) => a.timestamp - b.timestamp);
if (pending.length === 0) { showToast('No pending credit transactions found for this customer.', 'info', 4000); return; }
const nowDate = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const nowTime = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const nowEpoch = getTimestamp();
for (const sale of pending) {
if (remaining <= 0) break;
const amountDue = sale.isMerged && typeof sale.creditValue === 'number'
? sale.creditValue
: (sale.totalValue || 0) - (sale.partialPaymentReceived || 0);
if (remaining >= amountDue) {
sale.creditReceived = true;
sale.creditReceivedDate = nowISODate;
if (!sale.isMerged) sale.partialPaymentReceived = sale.totalValue;
sale.updatedAt = nowEpoch;
remaining -= amountDue; updatedCount++;
} else {
if (!sale.isMerged) {
sale.partialPaymentReceived = (sale.partialPaymentReceived || 0) + remaining;
sale.creditReceived = false; sale.updatedAt = nowEpoch;
}
const partialId = generateUUID('rep-partial');
repSales.push(ensureRecordIntegrity({
id: partialId, timestamp: nowEpoch, createdAt: nowEpoch, updatedAt: nowEpoch,
date: nowISODate, time: nowTime,
customerName: currentManagingRepCustomer, customerPhone: sale.customerPhone || '', quantity: 0,
supplyStore: sale.supplyStore || 'STORE_A', paymentType: 'PARTIAL_PAYMENT', salesRep: currentRepProfile,
totalCost: 0, totalValue: remaining, profit: 0, creditReceived: true,
relatedSaleId: sale.id, syncedAt: new Date().toISOString(), isRepModeEntry: true
}, false, false));
partialPaymentMade = true; remaining = 0; updatedCount++; break;
}
}
if (remaining > 0 && updatedCount > 0) {
const ls = pending[pending.length - 1];
const collId = generateUUID('rep-coll');
repSales.push(ensureRecordIntegrity({
id: collId, timestamp: nowEpoch, createdAt: nowEpoch, updatedAt: nowEpoch,
date: nowISODate, time: nowTime,
customerName: currentManagingRepCustomer, customerPhone: ls?.customerPhone || '', quantity: 0,
supplyStore: ls?.supplyStore || 'STORE_A', paymentType: 'COLLECTION', salesRep: currentRepProfile,
totalCost: 0, totalValue: remaining, profit: 0, creditReceived: true,
syncedAt: new Date().toISOString(), isRepModeEntry: true
}, false, false));
}
if (updatedCount > 0 || partialPaymentMade) {
await saveWithTracking('rep_sales', repSales);
const changedIds = new Set(pending.map(s => s.id));
for (const sale of repSales) {
if (changedIds.has(sale.id) || sale.paymentType === 'PARTIAL_PAYMENT' || sale.paymentType === 'COLLECTION') {
await saveRecordToFirestore('rep_sales', sale);
}
}
notifyDataChange('rep'); triggerAutoSync();
let msg = `Payment of ${safeToFixed(amount, 2)} processed successfully. `;
msg += partialPaymentMade ? 'Partial payment applied.' : remaining === 0 ? `${updatedCount} transaction(s) fully cleared.` : `${updatedCount} cleared, ${safeToFixed(remaining, 2)} extra.`;
showToast(msg, 'info', 5000);
document.getElementById('repBulkPaymentAmount').value = '';
renderRepCustomerTransactions(currentManagingRepCustomer);
renderRepCustomerTable();
} else { showToast('No changes made.', 'info', 2500); }
} catch (e) {
repSales.length = 0; repSales.push(...snapshot);
await idb.set('rep_sales', repSales).catch(() => {});
showToast('Failed to process bulk payment. Please try again.', 'error');
}
}
function filterRepCustomerManagementHistory() {
const term = document.getElementById('rep-cust-trans-search').value.toLowerCase();
document.querySelectorAll('#repCustomerManagementHistoryList .cust-history-item').forEach(item => {
item.style.display = item.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
});
}
function refreshAllCalculations() {
calculateCashTracker();
calculateNetCash();
calculatePaymentSummaries();
refreshEntityBalances();
updateUnitsAvailableIndicator();
}
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);
const _toastQueue = [];
let _toastActive = false;
function _playNextToast() {
if (_toastActive || _toastQueue.length === 0) return;
_toastActive = true;
const { message, type, duration } = _toastQueue.shift();
const icons = {
success: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
warning: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
error: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
info: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};
const toast = document.createElement('div');
toast.className = `liquid-toast toast-${type}`;
toast.innerHTML = `
<div class="toast-inner">
<div class="toast-icon-wrap">
<span class="toast-icon-glyph">${icons[type] || ''}</span>
</div>
<div class="toast-text">${esc(String(message))}</div>
<div class="toast-progress-bar"></div>
</div>
`;
toast.classList.add('pre-show');
toastContainer.appendChild(toast);
requestAnimationFrame(() => {
requestAnimationFrame(() => {
toast.classList.remove('pre-show');
toast.classList.add('show');
const bar = toast.querySelector('.toast-progress-bar');
if (bar) {
bar.style.animationDuration = duration + 'ms';
bar.classList.add('animating');
}
});
});
let removed = false;
const dismiss = () => {
if (removed) return;
removed = true;
toast.classList.add('hiding');
toast.style.pointerEvents = 'none';
setTimeout(() => {
if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
_toastActive = false;
_playNextToast();
}, 350);
};
setTimeout(dismiss, duration);
toast.addEventListener('click', dismiss, { once: true });
}
function showToast(message, type = 'info', duration = 3000) {
const typeMap = { danger: 'error', warn: 'warning', ok: 'success' };
type = typeMap[type] || (['success','warning','error','info'].includes(type) ? type : 'info');
_toastQueue.push({ message, type, duration });
_playNextToast();
}
window.showToast = showToast;
function showGlassConfirm(message, {
title = 'Confirm',
confirmText = 'Confirm',
cancelText = 'Cancel',
danger = false,
icon = null
} = {}) {
return new Promise(resolve => {
const autoIcon = icon !== null ? icon
: danger ? '' : '●';
const iconClass = danger ? 'icon-danger' : 'icon-primary';
const backdrop = document.createElement('div');
backdrop.className = 'glass-confirm-backdrop';
backdrop.innerHTML = `
<div class="glass-confirm-box${danger ? ' is-danger' : ''}">
<div class="glass-confirm-icon ${iconClass}">${autoIcon}</div>
<div class="glass-confirm-title">${esc(title)}</div>
<div class="glass-confirm-msg">${esc(String(message)).replace(/\n/g, '<br>')}</div>
<div class="glass-confirm-divider"></div>
<div class="glass-confirm-btns">
<button class="glass-confirm-btn gc-cancel">${esc(cancelText)}</button>
<button class="glass-confirm-btn ${danger ? 'danger' : 'primary'} gc-confirm">${esc(confirmText)}</button>
</div>
</div>
`;
document.body.appendChild(backdrop);
let settled = false;
const cleanup = (result) => {
if (settled) return;
settled = true;
const box = backdrop.querySelector('.glass-confirm-box');
backdrop.classList.add('closing');
if (box) box.classList.add('closing');
setTimeout(() => { backdrop.remove(); resolve(result); }, 200);
};
backdrop.querySelector('.gc-confirm').addEventListener('click', () => cleanup(true), { once: true });
backdrop.querySelector('.gc-cancel').addEventListener('click', () => cleanup(false), { once: true });
backdrop.addEventListener('click', e => { if (e.target === backdrop) cleanup(false); });
const onKey = (e) => {
if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
};
document.addEventListener('keydown', onKey);
backdrop.addEventListener('animationend', () => {
if (!backdrop.isConnected) document.removeEventListener('keydown', onKey);
});
setTimeout(() => {
const btn = backdrop.querySelector('.gc-confirm');
if (btn) btn.focus();
}, 60);
});
}
window.showGlassConfirm = showGlassConfirm;
function filterCustomers() {
// Re-render through the virtual scroller so it applies to
// the full dataset, not just currently-visible DOM rows.
renderCustomersTable();
}
async function openDataMenu() {
if (appMode === 'rep') {
return;
}
const adminSection = document.getElementById('admin-controls-section');
if (adminSection) {
adminSection.style.display = 'block';
}
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('dataMenuOverlay').style.display = 'flex';
});
const lastSync = await idb.get('last_synced');
const display = document.getElementById('lastSyncDisplay');
if (display) {
display.textContent = lastSync ?
`Last Cloud Sync: ${new Date(lastSync).toLocaleString()}` :
'Not synced yet';
}
}
function closeDataMenu() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('dataMenuOverlay').style.display = 'none';
});
}
async function triggerLocalBackup() {
closeDataMenu();
if (!currentUser) {
showToast('Please sign in to create a backup.', 'error');
showAuthOverlay();
return;
}
const data = {
mfg: db,
sales: await idb.get('noman_history', []),
customerSales: await idb.get('customer_sales', []),
repSales: await idb.get('rep_sales', []),
repCustomers: await idb.get('rep_customers', []),
salesCustomers: await idb.get('sales_customers', []),
factoryInventoryData: factoryInventoryData,
factoryProductionHistory: factoryProductionHistory,
factoryDefaultFormulas: factoryDefaultFormulas,
factoryAdditionalCosts: factoryAdditionalCosts,
factoryCostAdjustmentFactor: factoryCostAdjustmentFactor,
factorySalePrices: factorySalePrices,
factoryUnitTracking: factoryUnitTracking,
paymentEntities: paymentEntities,
paymentTransactions: paymentTransactions,
expenses: await idb.get('expenses', []),
stockReturns: stockReturns,
settings: await idb.get('naswar_default_settings', defaultSettings),
deleted_records: Array.from(deletedRecordIds),
_meta: { encryptedFor: currentUser.email, createdAt: Date.now(), version: 2 },
backupMetadata: {
version: '2.0',
timestamp: Date.now(),
date: new Date().toISOString(),
deviceInfo: navigator.userAgent.substring(0, 100)
}
};

const encPassword = await promptVerifiedBackupPassword({ inputId: 'enc_local_bkp_pwd' });
if (!encPassword) {
showToast('Backup cancelled.', 'info');
return;
}
try {
showToast('Encrypting backup with AES-256-GCM...', 'info', 3000);
const encryptedBlob = await CryptoEngine.encrypt(data, currentUser.email, encPassword);
const a = document.createElement('a');
a.href = URL.createObjectURL(encryptedBlob);
const timestamp = new Date().toISOString().split('T')[0];
a.download = `NaswarDealers_SecureBackup_${timestamp}.gznd`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
showToast('Encrypted backup saved! Only your account credentials can restore this file.', 'success', 5000);
} catch(encErr) {
console.error('Encryption failed:', encErr);
showToast('Encryption failed: ' + encErr.message, 'error');
}
}
async function uploadOldDataToCloud(event) {
const file = event.target.files[0];
event.target.value = '';
if (!file) return;
if (!firebaseDB || !currentUser) {
showToast('Please sign in first before uploading.', 'warning');
closeDataMenu();
showAuthOverlay();
return;
}
if (isSyncing) {
showToast('Another sync is running. Please wait.', 'info');
return;
}
closeDataMenu();
showToast('Reading backup file...', 'info');
const reader = new FileReader();
reader.onload = async (e) => {
try {
const data = JSON.parse(e.target.result);
if (!data.mfg && !data.mfg_pro_pkr && !data.customerSales && !data.repSales && !data.repCustomers) {
showToast('This file does not look like a valid backup.', 'error');
return;
}
const _utcMsg = `Upload this device's local data to the cloud database?\n\n• Existing cloud records will NOT be deleted\n• Where duplicates exist, the newer version wins\n• Deleted records (tombstones) are respected\n• Other devices will receive your changes on their next sync\n\nThis is a one-way push — cloud records newer than yours are preserved.`;
if (!(await showGlassConfirm(_utcMsg, { title: 'Upload Local Data to Cloud', confirmText: 'Upload', cancelText: 'Cancel' }))) return;
isSyncing = true;
showToast('Uploading to cloud...', 'info');
const normalized = {
mfg_pro_pkr: data.mfg || data.mfg_pro_pkr || [],
noman_history: data.sales || data.noman_history || [],
customer_sales: data.customerSales || data.customer_sales || [],
rep_sales: data.repSales || data.rep_sales || [],
rep_customers: data.repCustomers || data.rep_customers || [],
sales_customers: data.salesCustomers || data.sales_customers || [],
factory_inventory_data: data.factoryInventoryData || data.factory_inventory_data || [],
factory_production_history: data.factoryProductionHistory || data.factory_production_history|| [],
payment_entities: data.paymentEntities || data.payment_entities || [],
payment_transactions: data.paymentTransactions || data.payment_transactions || [],
stock_returns: data.stockReturns || data.stock_returns || [],
factory_default_formulas: data.factoryDefaultFormulas || data.factory_default_formulas || { standard: [], asaan: [] },
factory_additional_costs: data.factoryAdditionalCosts || data.factory_additional_costs || { standard: 0, asaan: 0 },
factory_cost_adjustment_factor: data.factoryCostAdjustmentFactor || data.factory_cost_adjustment_factor || { standard: 1, asaan: 1 },
factory_sale_prices: data.factorySalePrices || data.factory_sale_prices || { standard: 0, asaan: 0 },
factory_unit_tracking: data.factoryUnitTracking || data.factory_unit_tracking || {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
},
naswar_default_settings: data.settings || data.naswar_default_settings || {},
deleted_records: data.deleted_records || [],
appMode: data.appMode || 'admin',
repProfile: data.repProfile || salesRepsList[0] || 'NORAN SHAH'
};
const fileTombstones = new Set(normalized.deleted_records);
const filterAlive = (arr) => {
if (!Array.isArray(arr)) return [];
return arr.filter(item => {
if (!item || !item.id) return false;
if (fileTombstones.has(item.id)) return false;
return true;
});
};
normalized.mfg_pro_pkr = filterAlive(normalized.mfg_pro_pkr);
normalized.noman_history = filterAlive(normalized.noman_history);
normalized.customer_sales = filterAlive(normalized.customer_sales);
normalized.rep_sales = filterAlive(normalized.rep_sales);
normalized.rep_customers = filterAlive(normalized.rep_customers);
normalized.sales_customers = filterAlive(normalized.sales_customers);
normalized.factory_inventory_data = filterAlive(normalized.factory_inventory_data);
normalized.factory_production_history = filterAlive(normalized.factory_production_history);
normalized.payment_entities = filterAlive(normalized.payment_entities);
normalized.payment_transactions = filterAlive(normalized.payment_transactions);
normalized.stock_returns = filterAlive(normalized.stock_returns);
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const buildDeltaQuery = async (collection, collectionName) => {
const lastSync = await DeltaSync.getLastSyncFirestoreTimestamp(collectionName);
if (lastSync) {
return collection.where('updatedAt', '>', lastSync).get();
}
return collection.get();
};
const [
prodSnap, salesSnap, calcSnap, repSnap, transSnap, entSnap,
invSnap, factSnap, retSnap, settingsSnap, factorySettingsSnap,
expenseCategoriesSnap, deletionsSnap
] = await Promise.all([
buildDeltaQuery(userRef.collection('production'), 'production'),
buildDeltaQuery(userRef.collection('sales'), 'sales'),
buildDeltaQuery(userRef.collection('calculator_history'), 'calculator_history'),
buildDeltaQuery(userRef.collection('rep_sales'), 'rep_sales'),
buildDeltaQuery(userRef.collection('transactions'), 'transactions'),
buildDeltaQuery(userRef.collection('entities'), 'entities'),
buildDeltaQuery(userRef.collection('inventory'), 'inventory'),
buildDeltaQuery(userRef.collection('factory_history'), 'factory_history'),
buildDeltaQuery(userRef.collection('returns'), 'returns'),
userRef.collection('settings').doc('config').get(),
userRef.collection('factorySettings').doc('config').get(),
userRef.collection('expenseCategories').doc('categories').get(),
userRef.collection('deletions').get()
]);
for (const collection of ['production', 'sales', 'calculator_history', 'rep_sales', 'transactions',
'entities', 'inventory', 'factory_history', 'returns']) {
await DeltaSync.setLastSyncTimestamp(collection);
}
const cloudData = {
mfg_pro_pkr: prodSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
customer_sales: salesSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
noman_history: calcSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
rep_sales: repSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
payment_transactions: transSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
payment_entities: entSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
factory_inventory_data: invSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
factory_production_history: factSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() })),
stock_returns: retSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }))
};
if (factorySettingsSnap && factorySettingsSnap.exists) {
const factoryData = factorySettingsSnap.data();
cloudData.factory_default_formulas = factoryData.default_formulas || { standard: [], asaan: [] };
cloudData.factory_additional_costs = factoryData.additional_costs || { standard: 0, asaan: 0 };
cloudData.factory_cost_adjustment_factor = factoryData.cost_adjustment_factor || { standard: 1, asaan: 1 };
cloudData.factory_sale_prices = factoryData.sale_prices || { standard: 0, asaan: 0 };
cloudData.factory_unit_tracking = factoryData.unit_tracking || {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
} else {
cloudData.factory_default_formulas = { standard: [], asaan: [] };
cloudData.factory_additional_costs = { standard: 0, asaan: 0 };
cloudData.factory_cost_adjustment_factor = { standard: 1, asaan: 1 };
cloudData.factory_sale_prices = { standard: 0, asaan: 0 };
cloudData.factory_unit_tracking = {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
}
if (expenseCategoriesSnap && expenseCategoriesSnap.exists) {
const categoriesData = expenseCategoriesSnap.data();
cloudData.expense_categories = categoriesData.categories || [];
} else {
cloudData.expense_categories = [];
}
cloudData.deleted_records = deletionsSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => {
const data = doc.data();
return data.recordId || doc.id;
});
if (settingsSnap && settingsSnap.exists) {
const settings = settingsSnap.data();
cloudData.naswar_default_settings = settings.naswar_default_settings || {};
cloudData.appMode = settings.appMode || 'admin';
cloudData.repProfile = settings.repProfile || {};
} else {
cloudData.naswar_default_settings = {};
cloudData.appMode = 'admin';
cloudData.repProfile = {};
}
function mergeArrays(cloudArr, fileArr) {
if (!Array.isArray(cloudArr)) cloudArr = [];
if (!Array.isArray(fileArr)) fileArr = [];
const map = new Map();
cloudArr.forEach(item => {
if (item && item.id) map.set(item.id, item);
});
fileArr.forEach(item => {
if (!item || !item.id) return;
if (fileTombstones.has(item.id)) return;
const existing = map.get(item.id);
if (!existing) {
map.set(item.id, item);
} else {
const fileTime = item.timestamp || new Date(item.date || 0).getTime() || 0;
const cloudTime = existing.timestamp || new Date(existing.date || 0).getTime() || 0;
if (fileTime >= cloudTime) {
map.set(item.id, item);
}
}
});
return Array.from(map.values());
}
const merged = {
mfg_pro_pkr: mergeArrays(cloudData.mfg_pro_pkr, normalized.mfg_pro_pkr),
noman_history: mergeArrays(cloudData.noman_history, normalized.noman_history),
customer_sales: mergeArrays(cloudData.customer_sales, normalized.customer_sales),
rep_sales: mergeArrays(cloudData.rep_sales, normalized.rep_sales),
factory_inventory_data: mergeArrays(cloudData.factory_inventory_data, normalized.factory_inventory_data),
factory_production_history: mergeArrays(cloudData.factory_production_history, normalized.factory_production_history),
payment_entities: mergeArrays(cloudData.payment_entities, normalized.payment_entities),
payment_transactions: mergeArrays(cloudData.payment_transactions, normalized.payment_transactions),
stock_returns: mergeArrays(cloudData.stock_returns, normalized.stock_returns),
factory_default_formulas: (() => {
const cloudFormulas = cloudData.factory_default_formulas;
const fileFormulas = normalized.factory_default_formulas;
const fileHasData = fileFormulas &&
((Array.isArray(fileFormulas.standard) && fileFormulas.standard.length > 0) ||
(Array.isArray(fileFormulas.asaan) && fileFormulas.asaan.length > 0));
const cloudHasData = cloudFormulas &&
((Array.isArray(cloudFormulas.standard) && cloudFormulas.standard.length > 0) ||
(Array.isArray(cloudFormulas.asaan) && cloudFormulas.asaan.length > 0));
if (fileHasData) return fileFormulas;
if (cloudHasData) return cloudFormulas;
return { standard: [], asaan: [] };
})(),
factory_additional_costs: (() => {
const cloud = cloudData.factory_additional_costs;
const file = normalized.factory_additional_costs;
const fileHasData = file && (parseFloat(file.standard) > 0 || parseFloat(file.asaan) > 0);
const cloudHasData = cloud && (parseFloat(cloud.standard) > 0 || parseFloat(cloud.asaan) > 0);
if (fileHasData) return file;
if (cloudHasData) return cloud;
return { standard: 0, asaan: 0 };
})(),
factory_cost_adjustment_factor: (() => {
const cloud = cloudData.factory_cost_adjustment_factor;
const file = normalized.factory_cost_adjustment_factor;
const fileHasData = file && (parseFloat(file.standard) !== 1 || parseFloat(file.asaan) !== 1);
const cloudHasData = cloud && (parseFloat(cloud.standard) !== 1 || parseFloat(cloud.asaan) !== 1);
if (fileHasData) return file;
if (cloudHasData) return cloud;
return { standard: 1, asaan: 1 };
})(),
factory_sale_prices: (() => {
const cloud = cloudData.factory_sale_prices;
const file = normalized.factory_sale_prices;
const fileHasData = file && (parseFloat(file.standard) > 0 || parseFloat(file.asaan) > 0);
const cloudHasData = cloud && (parseFloat(cloud.standard) > 0 || parseFloat(cloud.asaan) > 0);
if (fileHasData) return file;
if (cloudHasData) return cloud;
return { standard: 0, asaan: 0 };
})(),
factory_unit_tracking: (() => {
const cloud = cloudData.factory_unit_tracking;
const file = normalized.factory_unit_tracking;
const hasTrackingData = (data) => {
if (!data || typeof data !== 'object') return false;
const std = data.standard || {};
const asn = data.asaan || {};
return (parseFloat(std.produced) > 0 || parseFloat(std.consumed) > 0 ||
parseFloat(asn.produced) > 0 || parseFloat(asn.consumed) > 0 ||
(Array.isArray(std.unitCostHistory) && std.unitCostHistory.length > 0) ||
(Array.isArray(asn.unitCostHistory) && asn.unitCostHistory.length > 0));
};
if (hasTrackingData(file)) return file;
if (hasTrackingData(cloud)) return cloud;
return {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
})(),
naswar_default_settings: cloudData.naswar_default_settings || normalized.naswar_default_settings,
expense_categories: cloudData.expense_categories || normalized.expense_categories,
deleted_records: [...new Set([
...(cloudData.deleted_records || []),
...normalized.deleted_records
])],
appMode: cloudData.appMode || normalized.appMode,
repProfile: cloudData.repProfile || normalized.repProfile
};
const now = new Date().toISOString();
const batches = [];
let currentBatch = firebaseDB.batch();
let operationCount = 0;
const getCurrentBatch = () => {
if (operationCount >= 450) {
batches.push(currentBatch);
currentBatch = firebaseDB.batch();
operationCount = 0;
}
return currentBatch;
};
const collections = {
'production': merged.mfg_pro_pkr,
'sales': merged.customer_sales,
'rep_sales': merged.rep_sales,
'calculator_history': merged.noman_history,
'inventory': merged.factory_inventory_data,
'factory_history': merged.factory_production_history,
'entities': merged.payment_entities,
'transactions': merged.payment_transactions,
'returns': merged.stock_returns
};
for (const [collectionName, dataArray] of Object.entries(collections)) {
if (Array.isArray(dataArray)) {
for (const item of dataArray) {
if (item && item.id) {
const batch = getCurrentBatch();
const docRef = userRef.collection(collectionName).doc(item.id);
const itemWithTimestamp = { ...item, updatedAt: getTimestamp() };
batch.set(docRef, itemWithTimestamp, { merge: true });
operationCount++;
}
}
}
}
const batch = getCurrentBatch();
const factorySettingsRef = userRef.collection('factorySettings').doc('config');
batch.set(factorySettingsRef, {
default_formulas: merged.factory_default_formulas,
default_formulas_timestamp: Date.now(),
additional_costs: merged.factory_additional_costs,
additional_costs_timestamp: Date.now(),
cost_adjustment_factor: merged.factory_cost_adjustment_factor,
cost_adjustment_factor_timestamp: Date.now(),
sale_prices: merged.factory_sale_prices,
sale_prices_timestamp: Date.now(),
unit_tracking: merged.factory_unit_tracking,
unit_tracking_timestamp: Date.now(),
last_synced: now
}, { merge: true });
operationCount++;
if (merged.expense_categories) {
const expenseCategoriesRef = userRef.collection('expenseCategories').doc('categories');
const currentBatch = getCurrentBatch();
currentBatch.set(expenseCategoriesRef, {
categories: merged.expense_categories,
last_synced: now
}, { merge: true });
operationCount++;
}
if (merged.deleted_records && Array.isArray(merged.deleted_records) && merged.deleted_records.length > 0) {
for (const recordId of merged.deleted_records) {
if (recordId) {
const deletionId = generateUUID('deletion');
const deletionRef = userRef.collection('deletions').doc(deletionId);
const currentBatch = getCurrentBatch();
currentBatch.set(deletionRef, {
id: deletionId,
recordId: String(recordId),
deletedAt: now,
source: 'backup_upload',
recordType: 'unknown'
}, { merge: true });
operationCount++;
}
}
}
const settingsRef = userRef.collection('settings').doc('config');
const settingsBatch = getCurrentBatch();
settingsBatch.set(settingsRef, {
naswar_default_settings: merged.naswar_default_settings || {},
naswar_default_settings_timestamp: Date.now(),
appMode: merged.appMode || 'admin',
appMode_timestamp: Date.now(),
repProfile: merged.repProfile || {},
repProfile_timestamp: Date.now(),
last_synced: now
}, { merge: true });
operationCount++;
if (operationCount > 0) {
batches.push(currentBatch);
}
await Promise.all(batches.map(b => b.commit()));
const uploadError = null;
if (uploadError) throw uploadError;
const counts = {
production: normalized.mfg_pro_pkr.length,
sales: normalized.noman_history.length,
customerSales: normalized.customer_sales.length,
repSales: normalized.rep_sales.length,
factory: normalized.factory_inventory_data.length + normalized.factory_production_history.length,
payments: normalized.payment_entities.length + normalized.payment_transactions.length,
returns: normalized.stock_returns.length
};
const total = Object.values(counts).reduce((a, b) => a + b, 0);
showToast('Upload Complete! ' + total + ' records merged to cloud.', 'success');
} catch (err) {
showToast('Upload failed: ' + err.message, 'error');
} finally {
isSyncing = false;
}
};
reader.onerror = () => {
showToast('Failed to read the file. Try again.', 'error');
isSyncing = false;
};
reader.readAsText(file);
}
const BiometricAuth = {
isAvailable: async () => {
if (!window.PublicKeyCredential) return false;
const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
return available;
},
_strToBin: (str) => {
return Uint8Array.from(str, c => c.charCodeAt(0));
},
_bufToBase64: (buffer) => {
const bytes = new Uint8Array(buffer);
let binary = '';
for (let i = 0; i < bytes.byteLength; i++) {
binary += String.fromCharCode(bytes[i]);
}
return window.btoa(binary);
},
_base64ToBuf: (base64) => {
const binary_string = window.atob(base64);
const len = binary_string.length;
const bytes = new Uint8Array(len);
for (let i = 0; i < len; i++) {
bytes[i] = binary_string.charCodeAt(i);
}
return bytes.buffer;
},
register: async (username = 'User') => {
try {
if (!await BiometricAuth.isAvailable()) {
throw new Error("Biometrics not available on this device.");
}
const challenge = new Uint8Array(32);
window.crypto.getRandomValues(challenge);
const userId = new Uint8Array(16);
window.crypto.getRandomValues(userId);
const publicKey = {
challenge: challenge,
rp: { name: "Naswar Dealers App" },
user: {
id: userId,
name: username,
displayName: username
},
pubKeyCredParams: [{ alg: -7, type: "public-key" }],
authenticatorSelection: {
authenticatorAttachment: "platform",
userVerification: "required"
},
timeout: 60000
};
const credential = await navigator.credentials.create({ publicKey });
const credId = BiometricAuth._bufToBase64(credential.rawId);
await idb.set('bio_cred_id', credId);
await idb.set('bio_enabled', 'true');
notifyDataChange('all');
triggerAutoSync();
return true;
} catch (err) {
console.error('Failed to save data locally.', err);
showToast('Failed to save data locally.', 'error');
throw err;
}
},
authenticate: async () => {
try {
const savedCredId = await idb.get('bio_cred_id');
if (!savedCredId) throw new Error("No biometric set up found.");
const challenge = new Uint8Array(32);
window.crypto.getRandomValues(challenge);
const publicKey = {
challenge: challenge,
allowCredentials: [{
id: BiometricAuth._base64ToBuf(savedCredId),
type: "public-key",
transports: ["internal"]
}],
userVerification: "required"
};
await navigator.credentials.get({ publicKey });
return true;
} catch (err) {
return false;
}
}
};
async function enableBiometricLock() {
try {
const success = await BiometricAuth.register("Manager");
if(success) {
showToast("Biometric Lock Enabled! ", "success");
const _bioBtn = document.getElementById('bio-toggle-btn');
if (_bioBtn) { _bioBtn.innerText = "Disable Biometric Lock"; _bioBtn.onclick = disableBiometricLock; }
}
} catch (e) {
showToast("Setup failed: " + e.message, "error");
}
}
async function disableBiometricLock() {
const _bioMsg = `Remove the biometric (fingerprint / Face ID) lock from this app?\n\nAfter removal:\n • Anyone with access to this device can open the app without biometric verification\n • To re-enable, go to Security Settings and set up biometrics again\n\nYour data will not be affected.`;
if (await showGlassConfirm(_bioMsg, { title: "Remove Biometric Lock", confirmText: "Remove Lock", danger: true })) {
await idb.remove('bio_enabled');
await idb.remove('bio_cred_id');
showToast("Biometric Lock Removed", "info");
const _bioBtnD = document.getElementById('bio-toggle-btn');
if (_bioBtnD) _bioBtnD.innerText = "Enable Biometric Lock ";
document.getElementById('bio-toggle-btn').onclick = enableBiometricLock;
}
}
async function checkBiometricLock() {
const isEnabled = await idb.get('bio_enabled');
if (isEnabled === 'true' || isEnabled === true) {
const lockScreen = document.createElement('div');
lockScreen.id = 'app-lock-screen';
lockScreen.style.cssText = `
position: fixed; inset: 0;
background: var(--bg-gradient); z-index: 100000;
display: flex; flex-direction: column; align-items: center; justify-content: center;
`;
lockScreen.innerHTML = `
<div style="font-size: 3rem; margin-bottom: 20px;">※</div>
<h2 style="color: var(--text-main); margin-bottom: 10px;">Security Locked</h2>
<p style="color: var(--text-muted); font-size: 0.9rem;">Biometric authentication required</p>
<button class="btn btn-main" style="margin-top: 25px; padding: 12px 30px;" onclick="triggerUnlock()">
Unlock App
</button>
`;
document.body.appendChild(lockScreen);
window.triggerUnlock = async () => {
try {
const success = await BiometricAuth.authenticate();
if (success) {
const screen = document.getElementById('app-lock-screen');
if(screen) screen.remove();
showToast("Unlocked Successfully", "success");
} else {
showToast("Authentication Failed. Try again.", "error");
}
} catch (e) {
showToast("Biometric Error: " + e.message, "error");
}
};
setTimeout(() => window.triggerUnlock(), 500);
}
}
let repTransactionMode = 'sale';
async function setRepMode(mode) {
repTransactionMode = mode;
const _setRep = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
const _btnSale = document.getElementById('btn-mode-sale'); if (_btnSale) _btnSale.className = `toggle-opt ${mode === 'sale' ? 'active' : ''}`;
const _btnColl = document.getElementById('btn-mode-coll'); if (_btnColl) _btnColl.className = `toggle-opt ${mode === 'collection' ? 'active' : ''}`;
if(mode === 'sale') {
const _saleIn = document.getElementById('rep-sale-inputs'); if (_saleIn) _saleIn.classList.remove('hidden');
const _collIn = document.getElementById('rep-coll-inputs'); if (_collIn) _collIn.classList.add('hidden');
_setRep('rep-result-label', "Total Sale Value:");
calculateRepSalePreview();
} else {
const _saleIn2 = document.getElementById('rep-sale-inputs'); if (_saleIn2) _saleIn2.classList.add('hidden');
const _collIn2 = document.getElementById('rep-coll-inputs'); if (_collIn2) _collIn2.classList.remove('hidden');
_setRep('rep-result-label', "New Balance After Collection:");
const _credEl = document.getElementById('rep-customer-current-credit');
const currentDebtText = _credEl ? _credEl.innerText.replace('₨','').replace(/,/g,'') : '0';
const currentDebt = parseFloat(currentDebtText) || 0;
const formattedDebt = await formatCurrency(currentDebt);
_setRep('rep-total-value', formattedDebt);
}
}
function selectRepCustomer(name) {
document.getElementById('rep-cust-name').value = name;
document.getElementById('rep-customer-search-results').classList.add('hidden');
calculateRepCustomerStats(name);
}
function calculateRepCustomerStatsForDisplay(name) {
calculateRepCustomerStats(name);
}
function calculateRepCustomerStats(name) {
if(salesRepsList.includes(name)) {
document.getElementById('rep-customer-info-display').classList.add('hidden');
showToast("Cannot create transaction with representative name", "warning");
return;
}
const history = repSales.filter(s =>
s && s.customerName && s.customerName.toLowerCase() === name.toLowerCase() &&
s.salesRep === currentRepProfile
);
let debt = 0;
history.forEach(h => {
if (h.paymentType === 'CREDIT' && !h.creditReceived) {
if (h.isMerged && typeof h.creditValue === 'number') {
debt += h.creditValue;
} else {
const partialPaid = h.partialPaymentReceived || 0;
debt += ((h.totalValue || 0) - partialPaid);
}
}
if (h.paymentType === 'COLLECTION') debt -= (h.totalValue || 0);
});
const _repCred = document.getElementById('rep-customer-current-credit');
if (_repCred) _repCred.innerText = "" + safeNumber(debt, 0).toFixed(2);
const _repInfo = document.getElementById('rep-customer-info-display');
if (_repInfo) _repInfo.classList.remove('hidden');
if(repTransactionMode === 'collection') {
const inputAmt = parseFloat(document.getElementById('rep-amount-collected')?.value) || 0;
const _repTV = document.getElementById('rep-total-value');
if (_repTV) _repTV.innerText = "" + safeNumber(debt - inputAmt, 0).toFixed(2);
}
}
function calculateRepSalePreview() {
if(repTransactionMode === 'sale') {
const qty = parseFloat(document.getElementById('rep-quantity').value) || 0;
const salePrice = getSalePriceForStore('STORE_A'); 
const _repTVS = document.getElementById('rep-total-value');
if (_repTVS) _repTVS.innerText = "" + safeNumber(qty * salePrice, 0).toFixed(2);
}
}
document.addEventListener('DOMContentLoaded', () => {
const repAmtCollected = document.getElementById('rep-amount-collected');
if (repAmtCollected) {
repAmtCollected.addEventListener('input', function() {
const _credEl2 = document.getElementById('rep-customer-current-credit');
const currentDebt = parseFloat(_credEl2 ? _credEl2.innerText.replace('','') : '0') || 0;
const inputAmt = parseFloat(this.value) || 0;
const _repTVL = document.getElementById('rep-total-value');
if (_repTVL) _repTVL.innerText = "" + safeNumber(currentDebt - inputAmt, 0).toFixed(2);
});
}
});
async function saveRepTransaction() {
const submitBtn = document.querySelector('#rep-new-transaction-card .btn-main');
if (submitBtn) {
if (submitBtn.disabled) return;
submitBtn.disabled = true;
}
function restoreBtn() {
if (submitBtn) submitBtn.disabled = false;
}
try {
const date = document.getElementById('rep-date').value;
const name = document.getElementById('rep-cust-name').value.trim();
const phoneInput = document.getElementById('rep-new-cust-phone');
const phoneNumber = (!document.getElementById('rep-new-customer-phone-container').classList.contains('hidden'))
? phoneInput.value.trim()
: '';
if(!date || !name) {
showToast("Date and Name required", "warning");
restoreBtn();
return;
}
let gpsCoords = null;
try {
gpsCoords = await Promise.race([
getPosition(),
new Promise(resolve => setTimeout(() => resolve(null), 3000))
]);
} catch (e) {
console.error('An unexpected error occurred.', e);
showToast('An unexpected error occurred.', 'error');
}
const now = new Date();
const timeString = now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', hour12: true});
const costPerKg = getCostPriceForStore('STORE_A'); 
const salePrice = getSalePriceForStore('STORE_A'); 
let transactionRecord = {};
if(repTransactionMode === 'sale') {
const qty = parseFloat(document.getElementById('rep-quantity').value) || 0;
const payType = document.getElementById('rep-payment-value').value;
if(qty <= 0) {
showToast("Enter Quantity", "warning");
restoreBtn();
return;
}
const totalValue = qty * salePrice;
let saleId = generateUUID('rep_sale');
if (!validateUUID(saleId)) {
saleId = generateUUID('rep_sale');
}
transactionRecord = {
id: saleId,
date: date,
time: timeString,
customerName: name,
customerPhone: phoneNumber,
quantity: qty,
supplyStore: 'STORE_A',
paymentType: payType,
salesRep: currentRepProfile,
gps: gpsCoords,
totalCost: qty * costPerKg,
totalValue: totalValue,
profit: totalValue - (qty * costPerKg),
// Store the canonical fixed sale price per kg at transaction time.
unitPrice: salePrice,
creditReceived: (payType === 'CASH'),
createdAt: getTimestamp(),
updatedAt: getTimestamp(),
timestamp: getTimestamp(),
isRepModeEntry: true,
affectsInventory: false,
syncedAt: new Date().toISOString()
};
transactionRecord = ensureRecordIntegrity(transactionRecord, false);
} else {
const amount = parseFloat(document.getElementById('rep-amount-collected').value) || 0;
if(amount <= 0) {
showToast("Enter Amount", "warning");
restoreBtn();
return;
}
let collId = generateUUID('rep_coll');
if (!validateUUID(collId)) {
collId = generateUUID('rep_coll');
}
transactionRecord = {
id: collId,
date: date,
time: timeString,
customerName: name,
customerPhone: phoneNumber,
quantity: 0,
supplyStore: 'STORE_A',
paymentType: 'COLLECTION',
salesRep: currentRepProfile,
gps: gpsCoords,
totalCost: 0,
totalValue: amount,
profit: amount,
creditReceived: true,
isCollection: true,
createdAt: getTimestamp(),
updatedAt: getTimestamp(),
timestamp: getTimestamp(),
isRepModeEntry: true,
affectsInventory: false,
syncedAt: new Date().toISOString()
};
transactionRecord = ensureRecordIntegrity(transactionRecord, false);
}
repSales.push(transactionRecord);
await saveWithTracking('rep_sales', repSales);
if (firebaseDB && currentUser) {
saveRecordToFirestore('rep_sales', transactionRecord).catch(e => {
});
}
notifyDataChange('rep');
if (navigator.onLine) {
emitSyncUpdate({ rep_sales: repSales }).catch(e => {
});
}
if (gpsCoords) {
autoUpdateCustomerLocation(name, gpsCoords).catch(e => {
});
}
document.getElementById('rep-quantity').value = '';
const savedCustomerName = name;
document.getElementById('rep-amount-collected').value = '';
if(repTransactionMode === 'sale') {
const _custName = document.getElementById('rep-cust-name'); if (_custName) _custName.value = '';
const _custInfo = document.getElementById('rep-customer-info-display'); if (_custInfo) _custInfo.classList.add('hidden');
const _repTV1 = document.getElementById('rep-total-value'); if (_repTV1) _repTV1.innerText = '0.00';
} else {
const _custName2 = document.getElementById('rep-cust-name'); if (_custName2) _custName2.value = savedCustomerName;
calculateRepCustomerStats(savedCustomerName);
const _repTV2 = document.getElementById('rep-total-value'); if (_repTV2) _repTV2.innerText = '0.00';
}
if(phoneInput) phoneInput.value = '';
document.getElementById('rep-new-customer-phone-container').classList.add('hidden');
renderRepCustomerTable();
renderRepHistory();
showToast("Transaction Saved Successfully", "success");
} catch (error) {
showToast('Failed to save transaction. Please try again.', 'error');
} finally {
restoreBtn();
}
}
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
const R = 6371e3;
const dLat = deg2rad(lat2 - lat1);
const dLon = deg2rad(lon2 - lon1);
const a =
Math.sin(dLat / 2) * Math.sin(dLat / 2) +
Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
Math.sin(dLon / 2) * Math.sin(dLon / 2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
return R * c;
}
function deg2rad(deg) {
return deg * (Math.PI / 180);
}
async function autoUpdateCustomerLocation(customerName, currentGps) {
if (!currentGps || !currentGps.lat || !currentGps.lng) return;
const contactIndex = repCustomers.findIndex(
c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase()
);
if (contactIndex === -1) return;
const contact = repCustomers[contactIndex];
const isManualAddress = contact.address && contact.address.length > 5 && !contact.address.startsWith('GPS:');
if (isManualAddress) return;
const matchFound = repSales.some(sale => {
if (sale.timestamp > Date.now() - 2000) return false;
if (sale && sale.customerName && sale.customerName.toLowerCase() === customerName.toLowerCase() && sale.gps) {
return getDistanceFromLatLonInMeters(
currentGps.lat, currentGps.lng,
sale.gps.lat, sale.gps.lng
) < 100;
}
return false;
});
if (matchFound) {
const coordsString = `GPS: ${safeNumber(currentGps.lat, 0).toFixed(2)}, ${safeNumber(currentGps.lng, 0).toFixed(2)}`;
const isNewLocation = contact.address !== coordsString;
repCustomers[contactIndex].address = coordsString;
repCustomers[contactIndex].updatedAt = getTimestamp();
await idb.set('rep_customers', repCustomers);
notifyDataChange('rep');
if (typeof showToast === 'function' && isNewLocation) {
showToast(`Location confirmed! Saved as default for ${customerName}.`, "success");
}
}
}
let repMap = null;
let repMapMarkers = [];
let repPolyline = null;
function getPosition() {
return new Promise((resolve, reject) => {
if (!navigator.geolocation) {
resolve(null);
return;
}
navigator.geolocation.getCurrentPosition(
(position) => resolve({
lat: position.coords.latitude,
lng: position.coords.longitude,
accuracy: position.coords.accuracy
}),
(error) => {
resolve(null);
},
{ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
);
});
}
function initRepMap() {
if (repMap) return;
const mapContainer = document.getElementById('rep-map-container');
if (!mapContainer) return;
repMap = L.map('rep-map-container').setView([32.9910, 70.6055], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
attribution: '© OpenStreetMap contributors'
}).addTo(repMap);
setTimeout(() => {
if (repMap) {
repMap.invalidateSize();
}
}, 100);
}
function updateRepLiveMap() {
if (typeof L === 'undefined') return;
const container = document.getElementById('rep-map-container');
if (!container || container.offsetParent === null) return;
if (!repMap) initRepMap();
if (repMap) {
repMap.invalidateSize();
}
repMapMarkers.forEach(layer => repMap.removeLayer(layer));
repMapMarkers = [];
if (repPolyline) {
repMap.removeLayer(repPolyline);
repPolyline = null;
}
const dateInput = document.getElementById('rep-date');
const selectedDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
const dailyRoute = repSales
.filter(s => s.salesRep === currentRepProfile && s.date === selectedDate && s.gps)
.sort((a, b) => a.timestamp - b.timestamp);
if (dailyRoute.length === 0) {
return;
}
const latLngs = [];
dailyRoute.forEach(txn => {
if (txn.gps && txn.gps.lat && txn.gps.lng) {
const lat = txn.gps.lat;
const lng = txn.gps.lng;
latLngs.push([lat, lng]);
let color = '#3b82f6';
let typeStr = 'Cash Sale';
let detailStr = `${txn.quantity.toFixed(2)} kg`;
if (txn.paymentType === 'COLLECTION') {
color = '#10b981';
typeStr = 'Collection';
detailStr = `${txn.totalValue.toFixed(2)}`;
} else if (txn.paymentType === 'CREDIT') {
color = '#f59e0b';
typeStr = 'Credit Sale';
detailStr = `${txn.quantity.toFixed(2)} kg (Credit)`;
}
const marker = L.circleMarker([lat, lng], {
radius: 8,
fillColor: color,
color: '#fff',
weight: 2,
opacity: 1,
fillOpacity: 0.8
})
.bindPopup(`
<strong>${txn.customerName}</strong><br>
<small>${txn.time}</small><br>
<span style="color:${color}; font-weight:bold;">${typeStr}</span>: ${detailStr}
`);
marker.addTo(repMap);
repMapMarkers.push(marker);
}
});
if (latLngs.length > 1) {
repPolyline = L.polyline(latLngs, {
color: '#2563eb',
weight: 3,
opacity: 0.6,
dashArray: '5, 10'
}).addTo(repMap);
}
if (repMapMarkers.length > 0) {
const group = new L.featureGroup(repMapMarkers);
repMap.fitBounds(group.getBounds().pad(0.1));
}
}
function adminSwitchRepProfile(newProfile) {
if (appMode !== 'admin') return;
currentRepProfile = newProfile;
refreshRepUI();
setTimeout(() => {
if (repMap) {
repMap.invalidateSize();
}
updateRepLiveMap();
}, 200);
calculateRepAnalytics();
if(typeof showToast === 'function') {
showToast(`Viewing dashboard for ${newProfile}`, 'info');
}
}
let currentRepAnalyticsMode = 'day';
function setRepAnalyticsMode(mode) {
currentRepAnalyticsMode = mode;
document.querySelectorAll('#admin-rep-analytics .toggle-group .toggle-opt').forEach(opt => {
opt.classList.remove('active');
});
document.getElementById(`rep-analytics-${mode}-btn`).classList.add('active');
calculateRepAnalytics();
}
function calculateRepAnalytics() {
if (appMode !== 'admin') return;
const adminDateInput = document.getElementById('admin-rep-date');
const selectedDate = (adminDateInput && adminDateInput.value) || new Date().toISOString().split('T')[0];
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
let startDate = new Date(selectedDate);
let endDate = new Date(selectedDate);
startDate.setHours(0,0,0,0);
endDate.setHours(23,59,59,999);
if (currentRepAnalyticsMode === 'week') {
startDate.setDate(selectedDateObj.getDate() - 6);
} else if (currentRepAnalyticsMode === 'month') {
startDate = new Date(selectedYear, selectedMonth, 1);
endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
} else if (currentRepAnalyticsMode === 'year') {
startDate = new Date(selectedYear, 0, 1);
endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
} else if (currentRepAnalyticsMode === 'all') {
startDate = new Date('2000-01-01');
endDate = new Date('2100-12-31');
}
let collections = 0;
let cashSales = 0;
let creditSales = 0;
repSales.forEach(sale => {
if (sale.salesRep !== currentRepProfile) return;
const saleDate = new Date(sale.date);
if (saleDate >= startDate && saleDate <= endDate) {
if (sale.isMerged && sale.mergedSummary) {

const ms = sale.mergedSummary;
cashSales   += (ms.cashSales           || 0);
creditSales += (ms.unpaidCredit        || 0);
collections += (ms.collectionsReceived || 0);
} else if (sale.paymentType === 'COLLECTION') {
collections += sale.totalValue || 0;
} else if (sale.paymentType === 'CASH') {
cashSales += sale.totalValue || 0;
} else if (sale.paymentType === 'CREDIT') {

if (sale.creditReceived) {
cashSales += sale.totalValue || 0; 
} else {
creditSales += (sale.totalValue || 0) - (sale.partialPaymentReceived || 0);
}
}
}
});
const collectionsEl = document.getElementById('rep-analytics-collections');
const cashSalesEl = document.getElementById('rep-analytics-cash-sales');
const creditSalesEl = document.getElementById('rep-analytics-credit-sales');
if (collectionsEl) collectionsEl.textContent = `${collections.toFixed(2)}`;
if (cashSalesEl) cashSalesEl.textContent = `${cashSales.toFixed(2)}`;
if (creditSalesEl) creditSalesEl.textContent = `${creditSales.toFixed(2)}`;
}
async function renderRepCustomerTable(page = 1) {
const tbody = document.getElementById('rep-customers-table-body');
if (!tbody) {
return;
}
try {
const freshRepSales = await idb.get('rep_sales', []);
if (Array.isArray(freshRepSales)) {
const recordMap = new Map(freshRepSales.map(s => [s.id, s]));
if (Array.isArray(repSales)) {
repSales.forEach(s => {
if (!recordMap.has(s.id)) {
recordMap.set(s.id, s);
}
});
}
repSales = Array.from(recordMap.values());
}
} catch (error) {
console.error('Rep sales operation failed.', error);
showToast('Rep sales operation failed.', 'error');
}
const filterInput = document.getElementById('rep-filter');
const filter = filterInput ? filterInput.value.toLowerCase() : '';
const myData = repSales.filter(s =>
s.salesRep === currentRepProfile
);
const custMap = {};
myData.forEach(s => {
if(!custMap[s.customerName]) custMap[s.customerName] = { debt: 0, count: 0 };
custMap[s.customerName].count++;
if(s.paymentType === 'CREDIT' && !s.creditReceived) {
if (s.isMerged && typeof s.creditValue === 'number') {
custMap[s.customerName].debt += s.creditValue;
} else {
const partialPaid = s.partialPaymentReceived || 0;
custMap[s.customerName].debt += ((s.totalValue || 0) - partialPaid);
}
}
if(s.paymentType === 'COLLECTION' || s.paymentType === 'PARTIAL_PAYMENT') {
custMap[s.customerName].debt -= (s.totalValue || 0);
}
});
const sortedCustomers = Object.keys(custMap).sort();
const filteredCustomers = sortedCustomers.filter(name => {
if (!filter) return true;
return name && typeof name === 'string' && name.toLowerCase().includes(filter);
});
const pageCustomers = filteredCustomers;
const validPage = 1;
const totalPages = 1;
const totalItems = filteredCustomers.length;
const startIndex = 0;
const endIndex = filteredCustomers.length;
const repCustomersData = {
pageCustomers,
custMap,
totalItems,
totalPages,
validPage
};
if (repCustomersData && repCustomersData.pageCustomers) {
renderRepCustomersFromCache(repCustomersData, tbody);
} else {
tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--danger);">Failed to load customer data</td></tr>`;
}
}
function renderRepCustomersFromCache(data, tbody) {
if (!data) {
tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--danger);">Error loading customers</td></tr>`;
return;
}
const { pageCustomers, custMap, totalItems, totalPages, validPage } = data;
if (!pageCustomers || !Array.isArray(pageCustomers) || !custMap) {
tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--danger);">Invalid customer data</td></tr>`;
return;
}
if (totalItems === 0) {
if (Object.keys(custMap).length === 0) {
tbody.innerHTML = `<tr><td class="u-empty-state-md" colspan="5" >No customers yet. Add your first sale to get started!</td></tr>`;
} else {
const filterInput = document.getElementById('rep-filter');
const filter = filterInput ? filterInput.value : '';
tbody.innerHTML = `<tr><td class="u-empty-state-md" colspan="5" >No customers match "${esc(filter)}"</td></tr>`;
}
return;
}
function buildRepCustomerRow(name) {
const customerData = custMap[name];
const customerTransactions = repSales.filter(s =>
s.customerName === name &&
s.salesRep === currentRepProfile
);
const latestTransaction = customerTransactions.sort((a, b) => b.timestamp - a.timestamp)[0];
const displayDate = latestTransaction?.date ? formatDisplayDate(latestTransaction.date) : '-';
const repContact = repCustomers.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
const phone = repContact?.phone || latestTransaction?.customerPhone || '-';
const tr = document.createElement('tr');
tr.style.borderBottom = '1px solid var(--glass-border)';
const safeNameForAttr = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
tr.innerHTML = `
<td class="u-table-td">${displayDate}</td>
<td style="padding: 8px 2px; font-size: 0.8rem; color: var(--text-main); font-weight: 600;">${esc(name)}</td>
<td class="u-table-td">${phoneActionHTML(phone)}</td>
<td style="padding: 8px 2px; text-align: right; font-size: 0.8rem; color: ${customerData.debt > 1 ? 'var(--warning)' : 'var(--accent-emerald)'}; font-weight: 700;">
${customerData.debt.toLocaleString()}
</td>
<td style="padding: 6px 2px; text-align: center;">
<button class="tbl-action-btn" onclick="event.stopPropagation(); openRepCustomerManagement('${safeNameForAttr}')">View</button>
</td>`;
return tr;
}
GNDVirtualScroll.mount('vs-scroller-rep-customers', pageCustomers, buildRepCustomerRow, tbody);
}
async function openRepCustomerManagement(customerName) {
currentManagingRepCustomer = customerName;
const _repMCT = document.getElementById('repManageCustomerTitle'); if (_repMCT) _repMCT.innerText = customerName;
const _repBulk = document.getElementById('repBulkPaymentAmount'); if (_repBulk) _repBulk.value = '';
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('repCustomerManagementOverlay').style.display = 'flex';
});
await renderRepCustomerTransactions(customerName);
}
function closeRepCustomerManagement() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('repCustomerManagementOverlay').style.display = 'none';
});
currentManagingRepCustomer = null;
setTimeout(async () => {
try {
const freshRepSales = await idb.get('rep_sales', []);
if (Array.isArray(freshRepSales)) {
const m = new Map(freshRepSales.map(s => [s.id, s]));
if (Array.isArray(repSales)) repSales.forEach(s => { if (!m.has(s.id)) m.set(s.id, s); });
repSales = Array.from(m.values());
}
} catch(e) {
showToast('Rep sales operation failed.', 'error');
console.warn('closeRepCustomerManagement IDB error', e);
}
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
}, 100);
}
async function renderRepCustomerTransactions(name) {
const list = document.getElementById('repCustomerManagementHistoryList');
if (!list) return;
list.innerHTML = '';
let transactions = [];
try {
const dbSales = await idb.get('rep_sales', []);
if (Array.isArray(dbSales)) {
const recordMap = new Map(dbSales.map(s => [s.id, s]));
if (Array.isArray(repSales)) repSales.forEach(s => { if (!recordMap.has(s.id)) recordMap.set(s.id, s); });
repSales = Array.from(recordMap.values());
transactions = repSales.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
} else {
transactions = repSales.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
}
} catch (e) {
console.error('Rep sales operation failed.', e);
showToast('Rep sales operation failed.', 'error');
transactions = repSales.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
}
const rangeSelect = document.getElementById('repCustomerPdfRange');
const range = rangeSelect ? rangeSelect.value : 'all';
if (range !== 'all') {
const today = new Date(); today.setHours(0,0,0,0);
transactions = transactions.filter(t => {
if (!t.date) return false;
const d = new Date(t.date);
if (range === 'today') return d >= today;
if (range === 'week') { const w = new Date(today); w.setDate(w.getDate() - 7); return d >= w; }
if (range === 'month') { const m = new Date(today); m.setMonth(m.getMonth() - 1); return d >= m; }
if (range === 'year') { const y = new Date(today); y.setFullYear(y.getFullYear() - 1); return d >= y; }
return true;
});
}
const repContacts = repCustomers;
const contact = repContacts.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
const phone = contact?.phone || transactions.find(t => t && t.customerPhone)?.customerPhone || '';
const address = contact?.address || '';
const headerTitle = document.getElementById('repManageCustomerTitle');
headerTitle.innerHTML = `
<div style="display:flex; align-items:center; gap:8px;">
<span>${esc(name)}</span>
<button class="btn-theme" style="padding:2px 6px; font-size:0.8rem; border:1px solid var(--accent); color:var(--accent); border-radius:50%;"
onclick="openRepCustomerEditModal('${esc(name).split("'").join("\\\'")}')" title="Edit Contact Info"></button>
</div>
<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top:4px;">
${phone ? phoneActionHTML(phone) : 'No Phone'} ${address ? `| ◆ ${esc(address)}` : ''}
</div>
`;
let currentDebt = 0;
transactions.forEach(t => {
if (t.paymentType === 'CREDIT' && !t.creditReceived) {
if (t.isMerged && typeof t.creditValue === 'number') {
currentDebt += t.creditValue;
} else {
currentDebt += ((t.totalValue || 0) - (t.partialPaymentReceived || 0));
}
}
if (t.paymentType === 'COLLECTION' || t.paymentType === 'PARTIAL_PAYMENT') {
currentDebt -= (t.totalValue || 0);
}
});
const _repMCS = document.getElementById('repManageCustomerStats'); if (_repMCS) _repMCS.innerText = `Current Debt: ${await formatCurrency(currentDebt)}`;
transactions.sort((a, b) => {
const ap = (a.paymentType === 'CREDIT' && !a.creditReceived) ? 1 : 0;
const bp = (b.paymentType === 'CREDIT' && !b.creditReceived) ? 1 : 0;
if (bp !== ap) return bp - ap;
return b.timestamp - a.timestamp;
});
if (transactions.length === 0) {
list.innerHTML = '<div class="u-empty-state-sm" >No history found</div>';
return;
}
for (const t of transactions) {
const isCredit = t.paymentType === 'CREDIT';
const isPartialPayment = t.paymentType === 'PARTIAL_PAYMENT';
const isCollection = t.paymentType === 'COLLECTION';
const isOldDebt = t.transactionType === 'OLD_DEBT';
const partialPaid = t.partialPaymentReceived || 0;
const effectiveDue = (t.isMerged && typeof t.creditValue === 'number') ? t.creditValue : ((t.totalValue || 0) - partialPaid);
const hasPartialPayment = isCredit && !t.creditReceived && partialPaid > 0 && !t.isMerged;
let statusClass = t.creditReceived ? 'paid' : 'pending';
let btnText = t.creditReceived ? 'PAID' : 'PENDING';
let toggleBtnHtml = '';
if (t.isMerged) {
const mergedSettled = t.creditReceived || effectiveDue <= 0.01;
toggleBtnHtml = mergedSettled
? `<span class="status-toggle-btn paid" style="opacity:0.8;">SETTLED</span>`
: `<span class="status-toggle-btn pending" style="opacity:0.8;">PENDING</span>`;
} else if (isCredit) {
if (hasPartialPayment) {
const remaining = effectiveDue;
btnText = `PARTIAL (${await formatCurrency(remaining)} due)`;
statusClass = 'partial';
}
toggleBtnHtml = `<button class="status-toggle-btn ${statusClass}" onclick="toggleRepTransactionStatus('${t.id}')">${btnText}</button>`;
} else if (isPartialPayment) {
toggleBtnHtml = `<span class="status-toggle-btn" style="background:rgba(255,159,10,0.1);color:var(--warning);">PARTIAL PAYMENT</span>`;
} else if (isCollection) {
toggleBtnHtml = `<span class="status-toggle-btn" style="background:rgba(48,209,88,0.1);color:var(--accent-emerald);">COLLECTION</span>`;
} else {
toggleBtnHtml = `<span class="status-toggle-btn" style="background:rgba(37,99,235,0.1);color:var(--accent);">CASH SALE</span>`;
}
const deleteBtnHtml = t.isMerged ? '' : `<button class="btn btn-sm btn-danger u-p-4-8" onclick="deleteRepTransactionFromOverlay('${esc(t.id)}')">⌫</button>`;
const item = document.createElement('div');
item.className = 'cust-history-item';
let itemContent = '';
if (isPartialPayment || isCollection) {
itemContent = `
<div class="cust-history-info">
<div style="font-weight:700;font-size:0.85rem;color:var(--text-main);">${formatDisplayDate(t.date)}${_mergedBadgeHtml(t, {inline:true})}</div>
<div style="font-size:0.75rem;color:var(--accent-emerald);">Payment: ${await formatCurrency(t.totalValue)}</div>
<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${isPartialPayment ? 'Partial Payment' : 'Bulk Payment'}</div>
</div>
<div class="cust-history-actions">
${toggleBtnHtml}
${deleteBtnHtml}
</div>`;
} else if (isOldDebt) {
itemContent = `
<div class="cust-history-info">
<div style="font-weight:700;font-size:0.85rem;color:var(--text-main);">
${formatDisplayDate(t.date)}
<span style="background:rgba(255,159,10,0.15);color:var(--warning);padding:2px 6px;border-radius:4px;font-size:0.65rem;margin-left:6px;font-weight:600;">OLD DEBT</span>${_mergedBadgeHtml(t, {inline:true})}
</div>
<div style="font-size:0.75rem;color:var(--warning);">Previous Balance: ${await formatCurrency(t.totalValue)}</div>
<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${esc(t.notes || 'Brought forward from previous records')}</div>
</div>
<div class="cust-history-actions">
${toggleBtnHtml}
${deleteBtnHtml}
</div>`;
} else {
// Canonical sale price: use stored unitPrice (set on merge) or fixed
// getSalePriceForStore rate — never divide totalValue/quantity (averaged).
const _repDisplayUnitPrice = (t.unitPrice && t.unitPrice > 0)
  ? t.unitPrice
  : getSalePriceForStore(t.supplyStore || 'STORE_A');
itemContent = `
<div class="cust-history-info">
<div style="font-weight:700;font-size:0.85rem;color:var(--text-main);">${formatDisplayDate(t.date)}${_mergedBadgeHtml(t, {inline:true})}</div>
<div style="font-size:0.75rem;color:var(--text-muted);">${t.quantity.toFixed(2)} kg @ ${await formatCurrency(_repDisplayUnitPrice)}</div>
${hasPartialPayment ? `<div style="font-size:0.7rem;color:var(--accent-emerald);margin-top:2px;">Paid: ${await formatCurrency(partialPaid)}</div>` : ''}
</div>
<div class="cust-history-actions">
${toggleBtnHtml}
${deleteBtnHtml}
</div>`;
}
item.innerHTML = itemContent;
list.appendChild(item);
}
}
function openCustomerEditModal(customerName) {
document.getElementById('edit-cust-name').value = customerName;
const contact = salesCustomers.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const saleRecord = customerSales.find(s =>
s && s.customerName === customerName &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE') &&
s.customerPhone
);
document.getElementById('edit-cust-phone').value = contact?.phone || saleRecord?.customerPhone || '';
document.getElementById('edit-cust-address').value = contact?.address || '';
document.getElementById('edit-cust-old-debit').value = contact?.oldDebit || 0;
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('customerEditOverlay').style.display = 'flex';
});
}
function closeCustomerEditModal() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('customerEditOverlay').style.display = 'none';
});
}
async function saveCustomerDetails() {
const name = document.getElementById('edit-cust-name').value.trim();
const phone = document.getElementById('edit-cust-phone').value.trim();
const address = document.getElementById('edit-cust-address').value.trim();
const oldDebit = parseFloat(document.getElementById('edit-cust-old-debit').value) || 0;
if (!name) { showToast('Customer name is required', 'error'); return; }
try {
let contact = salesCustomers.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
const previousOldDebit = contact?.oldDebit || 0;
if (contact) {
contact.phone = phone; contact.address = address; contact.oldDebit = oldDebit; contact.updatedAt = getTimestamp();
} else {
contact = { id: generateUUID(), name, phone, address, oldDebit,
createdAt: getTimestamp(), updatedAt: getTimestamp(), timestamp: getTimestamp() };
salesCustomers.push(contact);
}
await idb.set('sales_customers', salesCustomers);
notifyDataChange('sales');
triggerAutoSync();
let salesArray = await idb.get('customer_sales', []);
if (!Array.isArray(salesArray)) salesArray = [];
const oldDebtIdx = salesArray.findIndex(s =>
s && s.customerName === name &&
s.transactionType === 'OLD_DEBT' &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE' || s.salesRep === 'ADMIN')
);
if (oldDebtIdx !== -1) { }
let oldDebtModified = false, oldDebtRecord = null;
if (oldDebit > 0) {
if (oldDebtIdx !== -1) {
const tx = salesArray[oldDebtIdx];
tx.totalValue = oldDebit; tx.customerPhone = phone; tx.timestamp = getTimestamp();
tx.updatedAt = getTimestamp(); tx.date = new Date().toISOString().split('T')[0];
tx.creditReceived = false; tx.partialPaymentReceived = 0;
if (!tx.time) tx.time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
oldDebtModified = true; oldDebtRecord = tx;
} else {
const tx = { id: generateUUID(), date: new Date().toISOString().split('T')[0],
customerName: name, customerPhone: phone, salesRep: 'ADMIN', quantity: 0,
supplyStore: 'N/A', paymentType: 'CREDIT', transactionType: 'OLD_DEBT',
totalValue: oldDebit, creditReceived: false, partialPaymentReceived: 0,
time: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
timestamp: getTimestamp(), createdAt: getTimestamp(), updatedAt: getTimestamp(),
notes: 'Previous balance brought forward', isRepModeEntry: false };
salesArray.push(tx); oldDebtModified = true; oldDebtRecord = tx;
}
} else if (oldDebit === 0 && oldDebtIdx !== -1) {
salesArray.splice(oldDebtIdx, 1); oldDebtModified = true;
}
let phoneUpdated = false;
salesArray.forEach(s => { if (s && s.customerName === name && s.customerPhone !== phone) { s.customerPhone = phone; phoneUpdated = true; } });
customerSales.length = 0; customerSales.push(...salesArray);
if (oldDebtModified || phoneUpdated) {
await saveWithTracking('customer_sales', salesArray);
if (oldDebtRecord) await saveRecordToFirestore('customer_sales', oldDebtRecord);
}
const message = oldDebit > 0 ? `Customer updated with old debt of ₨${oldDebit.toLocaleString()}`
: (oldDebit === 0 && previousOldDebit > 0) ? 'Customer updated and old debt cleared'
: 'Customer details updated successfully';
showToast(message, 'success');
closeCustomerEditModal();
await new Promise(r => setTimeout(r, 350));
const overlay = document.getElementById('customerManagementOverlay');
if (overlay && overlay.style.display === 'flex') await renderCustomerTransactions(currentManagingCustomer || name);
if (typeof renderCustomersTable === 'function') renderCustomersTable();
notifyDataChange('entities');
triggerAutoSync();
} catch (error) {
showToast('Failed to save customer details. Please try again.', 'error');
}
}
async function fetchDeviceLocation() {
const statusDiv = document.getElementById('location-status');
const addressInput = document.getElementById('edit-cust-address');
const btn = document.querySelector('button[onclick="fetchDeviceLocation()"]');
if (!navigator.geolocation) {
statusDiv.textContent = "GPS not supported on this device.";
statusDiv.style.color = "var(--danger)";
return;
}
if(btn) btn.disabled = true;
statusDiv.innerHTML = '<span class="update-indicator"></span> Pinpointing satellite location...';
statusDiv.style.color = "var(--accent)";
addressInput.placeholder = "Fetching location...";
const gpsOptions = {
enableHighAccuracy: true,
timeout: 20000,
maximumAge: 0
};
navigator.geolocation.getCurrentPosition(async (position) => {
const lat = position.coords.latitude;
const lon = position.coords.longitude;
const accuracy = position.coords.accuracy;
const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
const coordsText = `${safeNumber(lat, 0).toFixed(2)}, ${safeNumber(lon, 0).toFixed(2)}`;
statusDiv.textContent = `GPS Accuracy: ±${Math.round(accuracy)}m. Decoding name...`;
try {
const controller = new AbortController();
const apiTimeout = setTimeout(() => controller.abort(), 10000);
const response = await fetch(
`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&extratags=1&namedetails=1`,
{ headers: { 'User-Agent': 'NaswarApp/1.0' }, signal: controller.signal }
);
clearTimeout(apiTimeout);
if (!response.ok) throw new Error("Map API Error");
const data = await response.json();
if (data && data.address) {
const addr = data.address;
const placeName = addr.amenity || addr.shop || addr.building || addr.tourism || addr.historic || addr.leisure || addr.office || '';
const localArea = addr.neighbourhood || addr.suburb || addr.hamlet || addr.village || addr.quarter || '';
const road = addr.road || addr.pedestrian || addr.street || '';
const city = addr.town || addr.city || addr.county || 'Bannu';
let finalAddress = "";
if (placeName) {
finalAddress += placeName + ", ";
}
if (road) {
finalAddress += road + ", ";
} else if (!placeName) {
finalAddress += "Near ";
}
if (localArea) {
finalAddress += localArea + ", ";
}
finalAddress += city;
if (finalAddress.trim() === "Bannu" || finalAddress.trim() === "Near Bannu") {
const parts = data.display_name.split(', ');
finalAddress = parts.slice(0, 3).join(', ');
}
addressInput.value = `${finalAddress} (${coordsText})`;
statusDiv.textContent = `◆ Location Found: ${localArea || placeName || city}`;
statusDiv.style.color = "var(--accent-emerald)";
if(typeof showToast === 'function') showToast("Address updated successfully", "success");
} else {
throw new Error("Address not found");
}
} catch (error) {
console.error('An unexpected error occurred.', error);
showToast('An unexpected error occurred.', 'error');
addressInput.value = `GPS: ${coordsText}`;
statusDiv.textContent = "Address lookup failed. Saved GPS Coordinates.";
statusDiv.style.color = "var(--warning)";
} finally {
if(btn) btn.disabled = false;
}
}, (error) => {
let msg = "Location error.";
switch(error.code) {
case error.PERMISSION_DENIED: msg = " Permission denied. Check Phone Settings."; break;
case error.POSITION_UNAVAILABLE: msg = " Weak GPS signal. Go outside."; break;
case error.TIMEOUT: msg = " GPS timeout. Try again."; break;
}
statusDiv.textContent = msg;
statusDiv.style.color = "var(--danger)";
if(btn) btn.disabled = false;
}, gpsOptions);
}
function openRepCustomerEditModal(customerName) {
document.getElementById('rep-edit-cust-name').value = customerName;
const contact = repCustomers.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const saleRecord = repSales.find(s => s && s.customerName === customerName && s.salesRep === currentRepProfile && s.customerPhone);
document.getElementById('rep-edit-cust-phone').value = contact?.phone || saleRecord?.customerPhone || '';
document.getElementById('rep-edit-cust-address').value = contact?.address || '';
document.getElementById('rep-edit-cust-old-debit').value = contact?.oldDebit || 0;
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('repCustomerEditOverlay').style.display = 'flex';
});
}
function closeRepCustomerEditModal() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('repCustomerEditOverlay').style.display = 'none';
});
}
async function saveRepCustomerDetails() {
const name = document.getElementById('rep-edit-cust-name').value.trim();
const phone = document.getElementById('rep-edit-cust-phone').value.trim();
const address = document.getElementById('rep-edit-cust-address').value.trim();
const oldDebit = parseFloat(document.getElementById('rep-edit-cust-old-debit').value) || 0;
if (!name) { showToast('Customer name is required', 'error'); return; }
try {
let contact = repCustomers.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
const previousOldDebit = contact?.oldDebit || 0;
if (contact) {
contact.phone = phone; contact.address = address; contact.oldDebit = oldDebit; contact.updatedAt = getTimestamp();
} else {
contact = { id: generateUUID(), name, phone, address, oldDebit,
createdAt: getTimestamp(), updatedAt: getTimestamp(), timestamp: getTimestamp() };
repCustomers.push(contact);
}
await idb.set('rep_customers', repCustomers);
let salesArray = await idb.get('rep_sales', []);
if (!Array.isArray(salesArray)) salesArray = [];
const oldDebtIdx = salesArray.findIndex(s => s && s.customerName === name &&
s.transactionType === 'OLD_DEBT' && s.salesRep === currentRepProfile);
let oldDebtModified = false, oldDebtRecord = null;
if (oldDebit > 0) {
if (oldDebtIdx !== -1) {
const tx = salesArray[oldDebtIdx];
tx.totalValue = oldDebit; tx.customerPhone = phone; tx.timestamp = getTimestamp();
tx.updatedAt = getTimestamp(); tx.date = new Date().toISOString().split('T')[0];
tx.creditReceived = false; tx.partialPaymentReceived = 0;
if (!tx.time) tx.time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
oldDebtModified = true; oldDebtRecord = tx;
} else {
const tx = { id: generateUUID(), date: new Date().toISOString().split('T')[0],
customerName: name, customerPhone: phone, salesRep: currentRepProfile, quantity: 0,
supplyStore: 'N/A', paymentType: 'CREDIT', transactionType: 'OLD_DEBT',
totalValue: oldDebit, creditReceived: false, partialPaymentReceived: 0,
time: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
timestamp: getTimestamp(), createdAt: getTimestamp(), updatedAt: getTimestamp(),
notes: 'Previous balance brought forward', isRepModeEntry: true };
salesArray.push(tx); oldDebtModified = true; oldDebtRecord = tx;
}
} else if (oldDebit === 0 && oldDebtIdx !== -1) {
salesArray.splice(oldDebtIdx, 1); oldDebtModified = true;
}
let phoneUpdated = false;
salesArray.forEach(s => { if (s && s.customerName === name && s.customerPhone !== phone) { s.customerPhone = phone; phoneUpdated = true; } });
repSales.length = 0; repSales.push(...salesArray);
if (oldDebtModified || phoneUpdated) {
await saveWithTracking('rep_sales', salesArray);
if (oldDebtRecord) await saveRecordToFirestore('rep_sales', oldDebtRecord);
}
const message = oldDebit > 0 ? `Rep customer updated with old debt of ₨${oldDebit.toLocaleString()}`
: (oldDebit === 0 && previousOldDebit > 0) ? 'Rep customer updated and old debt cleared'
: 'Rep customer details updated successfully';
showToast(message, 'success');
closeRepCustomerEditModal();
await new Promise(r => setTimeout(r, 350));
const overlay = document.getElementById('repCustomerManagementOverlay');
if (overlay && overlay.style.display === 'flex') await renderRepCustomerTransactions(currentManagingRepCustomer || name);
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
notifyDataChange('rep');
triggerAutoSync();
} catch (error) {
showToast('Failed to save rep customer details. Please try again.', 'error');
}
}
async function fetchRepDeviceLocation() {
const statusDiv = document.getElementById('rep-location-status');
const addressInput = document.getElementById('rep-edit-cust-address');
const btn = document.querySelector('button[onclick="fetchRepDeviceLocation()"]');
if (!navigator.geolocation) {
statusDiv.textContent = 'GPS not supported on this device.';
statusDiv.style.color = 'var(--danger)';
return;
}
if (btn) btn.disabled = true;
statusDiv.innerHTML = '<span class="update-indicator"></span> Pinpointing satellite location...';
statusDiv.style.color = 'var(--accent)';
addressInput.placeholder = 'Fetching location...';
const gpsOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
navigator.geolocation.getCurrentPosition(async (position) => {
const lat = position.coords.latitude;
const lon = position.coords.longitude;
const accuracy = position.coords.accuracy;
const coordsText = `${safeNumber(lat, 0).toFixed(2)}, ${safeNumber(lon, 0).toFixed(2)}`;
statusDiv.textContent = `GPS Accuracy: ±${Math.round(accuracy)}m. Decoding name...`;
try {
const controller = new AbortController();
const apiTimeout = setTimeout(() => controller.abort(), 10000);
const response = await fetch(
`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&extratags=1&namedetails=1`,
{ headers: { 'User-Agent': 'NaswarApp/1.0' }, signal: controller.signal }
);
clearTimeout(apiTimeout);
if (!response.ok) throw new Error('Map API Error');
const data = await response.json();
if (data && data.address) {
const addr = data.address;
const placeName = addr.amenity || addr.shop || addr.building || addr.tourism || addr.historic || addr.leisure || addr.office || '';
const localArea = addr.neighbourhood || addr.suburb || addr.hamlet || addr.village || addr.quarter || '';
const road = addr.road || addr.pedestrian || addr.street || '';
const city = addr.town || addr.city || addr.county || 'Bannu';
let finalAddress = '';
if (placeName) finalAddress += placeName + ', ';
if (road) finalAddress += road + ', ';
else if (!placeName) finalAddress += 'Near ';
if (localArea) finalAddress += localArea + ', ';
finalAddress += city;
if (finalAddress.trim() === 'Bannu' || finalAddress.trim() === 'Near Bannu') {
finalAddress = data.display_name.split(', ').slice(0, 3).join(', ');
}
addressInput.value = `${finalAddress} (${coordsText})`;
statusDiv.textContent = `◆ Location Found: ${localArea || placeName || city}`;
statusDiv.style.color = 'var(--accent-emerald)';
if (typeof showToast === 'function') showToast('Address updated successfully', 'success');
} else { throw new Error('Address not found'); }
} catch (error) {
console.error('An unexpected error occurred.', error);
showToast('An unexpected error occurred.', 'error');
addressInput.value = `GPS: ${coordsText}`;
statusDiv.textContent = 'Address lookup failed. Saved GPS Coordinates.';
statusDiv.style.color = 'var(--warning)';
} finally { if (btn) btn.disabled = false; }
}, (error) => {
let msg = 'Location error.';
if (error.code === error.PERMISSION_DENIED) msg = ' Permission denied. Check Phone Settings.';
else if (error.code === error.POSITION_UNAVAILABLE) msg = ' Weak GPS signal. Go outside.';
else if (error.code === error.TIMEOUT) msg = ' GPS timeout. Try again.';
statusDiv.textContent = msg;
statusDiv.style.color = 'var(--danger)';
if (btn) btn.disabled = false;
}, gpsOptions);
}
async function exportRepCustomerToPDF() {
const titleElement = document.getElementById('repManageCustomerTitle');
if (!titleElement) { showToast('No rep customer selected', 'warning'); return; }
const titleHTML = titleElement.innerHTML;
const nameMatch = titleHTML.match(/<span>([^<]+)<\/span>/) || titleHTML.match(/^([^<]+)/);
const customerName = nameMatch ? nameMatch[1].trim() : titleElement.innerText.split('\n')[0].trim();
if (!customerName) { showToast('No rep customer selected', 'warning'); return; }
const rangeSelect = document.getElementById('repCustomerPdfRange');
const range = rangeSelect ? rangeSelect.value : 'all';
showToast("Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
await new Promise(r => setTimeout(r, 200));
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Failed to load PDF library.");
let transactions = repSales.filter(s =>
s &&
s.customerName === customerName &&
s.salesRep === currentRepProfile
);
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
if (range !== 'all') {
transactions = transactions.filter(t => {
if (!t.date) return false;
const d = new Date(t.date);
switch(range) {
case 'today': return d >= today;
case 'week': { const w = new Date(today); w.setDate(w.getDate() - 7); return d >= w; }
case 'month': { const m = new Date(today); m.setMonth(m.getMonth() - 1); return d >= m; }
case 'year': { const y = new Date(today); y.setFullYear(y.getFullYear() - 1); return d >= y; }
default: return true;
}
});
}

transactions.sort((a, b) => {
if (a.isMerged && !b.isMerged) return -1;
if (!a.isMerged && b.isMerged) return 1;
const ap = (a.paymentType === 'CREDIT' && !a.creditReceived) ? 1 : 0;
const bp = (b.paymentType === 'CREDIT' && !b.creditReceived) ? 1 : 0;
if (bp !== ap) return bp - ap;
return new Date(a.date) - new Date(b.date);
});
const contact = repCustomers.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const phone = contact?.phone || transactions.find(t => t.customerPhone)?.customerPhone || 'N/A';
const address = contact?.address || transactions.find(t => t.customerAddress)?.customerAddress || 'N/A';
const { jsPDF } = window.jspdf;
const doc = new jsPDF('p', 'mm', 'a4');
const pageW = doc.internal.pageSize.getWidth();
const hdrColor = [40, 167, 69];
doc.setFillColor(...hdrColor);
doc.rect(0, 0, pageW, 22, 'F');
doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW / 2, 10, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal');
doc.text('Naswar Manufacturers & Dealers · Rep Sales Tab Statement', pageW / 2, 17, { align: 'center' });
const rangeName = range === 'all' ? 'All Time' : range === 'today' ? 'Today' :
range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'This Year';
doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
doc.text(`Rep Customer Account Statement · ${rangeName}`, pageW / 2, 30, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
let yPos = 38;
doc.setFont(undefined, 'bold'); doc.text('Customer:', 14, yPos);
doc.setFont(undefined, 'normal'); doc.text(customerName, 36, yPos);
doc.setFont(undefined, 'bold'); doc.text('Phone:', 14, yPos + 5);
doc.setFont(undefined, 'normal'); doc.text(phone, 36, yPos + 5);
doc.setFont(undefined, 'bold'); doc.text('Address:', 14, yPos + 10);
doc.setFont(undefined, 'normal'); doc.text(address.substring(0, 50), 36, yPos + 10);
doc.setFont(undefined, 'bold'); doc.text('Sales Rep:', pageW / 2, yPos);
doc.setFont(undefined, 'normal'); doc.text(currentRepProfile || 'N/A', pageW / 2 + 22, yPos);
doc.setFont(undefined, 'bold'); doc.text('Generated:', pageW / 2, yPos + 5);
doc.setFont(undefined, 'normal');
doc.text(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageW / 2 + 22, yPos + 5);
yPos += 18;
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, yPos, pageW - 14, yPos);
yPos += 5;
if (transactions.length > 0) {
// Use stored unitPrice (set at save/merge time) or fixed getSalePriceForStore —
// never divide totalValue/quantity which gives a weighted/partial-payment average.
const getSalePrice = (t) => {
  if (t.unitPrice && t.unitPrice > 0) return t.unitPrice;
  return getSalePriceForStore(t.supplyStore || 'STORE_A');
};

const buildRepRow = (t, runBal) => {
  const pt = t.paymentType || 'CASH';
  const isOldDebt = t.transactionType === 'OLD_DEBT';
  const sp = getSalePrice(t);
  let debit=0, credit=0, typeLabel='', detailLabel='', displayDate=formatDisplayDate(t.date);
  if (isOldDebt){debit=parseFloat(t.totalValue)||0;credit=parseFloat(t.partialPaymentReceived)||0;typeLabel='OLD DEBT';detailLabel=t.notes||'Brought forward';}
  else if(pt==='CASH'){const v=t.totalValue||(t.quantity||0)*sp;debit=credit=v;typeLabel='CASH';detailLabel=`${safeToFixed(t.quantity||0,2)} kg \xd7 Rs ${safeToFixed(sp,0)}`;}
  else if(pt==='CREDIT'&&!t.creditReceived){const v=t.totalValue||(t.quantity||0)*sp;const p=parseFloat(t.partialPaymentReceived)||0;debit=v;credit=p;typeLabel=p>0?'CREDIT\n(PARTIAL)':'CREDIT';detailLabel=`${safeToFixed(t.quantity||0,2)} kg \xd7 Rs ${safeToFixed(sp,0)}`;if(p>0)detailLabel+=`\nPaid:Rs ${safeToFixed(p,2)} Due:Rs ${safeToFixed(v-p,2)}`;}
  else if(pt==='CREDIT'&&t.creditReceived){const v=t.totalValue||(t.quantity||0)*sp;debit=credit=v;typeLabel='CREDIT\n(PAID)';detailLabel=`${safeToFixed(t.quantity||0,2)} kg \xd7 Rs ${safeToFixed(sp,0)}`;displayDate=formatDisplayDate(t.creditReceivedDate||t.date);}
  else if(pt==='COLLECTION'){credit=parseFloat(t.totalValue)||0;typeLabel='COLLECTION';detailLabel='Cash payment received';displayDate=formatDisplayDate(t.creditReceivedDate||t.date);}
  else if(pt==='PARTIAL_PAYMENT'){credit=parseFloat(t.totalValue)||0;typeLabel='PARTIAL\nPAYMENT';detailLabel='Partial payment received';displayDate=formatDisplayDate(t.creditReceivedDate||t.date);}
  runBal.val += (debit - credit);
  const bal = Math.abs(runBal.val)<0.01?'SETTLED':runBal.val>0?'Rs '+safeToFixed(runBal.val,2):'OVERPAID\nRs '+safeToFixed(Math.abs(runBal.val),2);
  return {row:[displayDate,typeLabel,detailLabel.substring(0,55),debit>0?'Rs '+safeToFixed(debit,2):'-',credit>0?'Rs '+safeToFixed(credit,2):'-',bal],debit,credit,qty:t.quantity||0};
};
const mergedRepTxns = transactions.filter(t => t.isMerged === true);
const normalRepTxns = transactions.filter(t => !t.isMerged);

if (mergedRepTxns.length > 0) {
  yPos = _pdfDrawMergedSectionHeader(doc, yPos, pageW, 'YEAR-END OPENING BALANCES (Carried Forward)');
  const mRunBal = {val:0};
  const mergedRows = mergedRepTxns.map(t => {
    const ms = t.mergedSummary||{};
    const isSettled = ms.isSettled || t.creditReceived;
    const netOut = ms.netOutstanding!=null?ms.netOutstanding:(t.totalValue||0);
    const details = [_pdfMergedPeriodLabel(t), _pdfMergedCountLabel(t),
      !isSettled?`Net due: Rs ${safeToFixed(netOut,2)}`:'Settled'].filter(Boolean).join('\n');
    mRunBal.val += netOut;
    const pt = t.paymentType||'CASH';
    return [formatDisplayDate(t.date), isSettled?'SETTLED\n(MERGED)':(pt==='CREDIT'?'CREDIT\n(MERGED)':'CASH\n(MERGED)'),
      details.substring(0,70), netOut>0?'Rs '+safeToFixed(netOut,2):'-',
      isSettled?'Rs '+safeToFixed(ms.cashSales||0,2):'-',
      isSettled?'SETTLED':'Rs '+safeToFixed(netOut,2)];
  });
  const mNet = mergedRepTxns.reduce((s,t)=>s+((t.mergedSummary||{}).netOutstanding||t.totalValue||0),0);
  mergedRows.push(['','SUBTOTAL',`${mergedRepTxns.length} year-end record${mergedRepTxns.length!==1?'s':''}`,
    mNet>0?'Rs '+safeToFixed(mNet,2):'-','',mNet<=0.01?'SETTLED':'Rs '+safeToFixed(mNet,2)]);
  doc.autoTable({startY:yPos,head:[['Date','Type','Year Period / Summary','Outstanding','Settled','Balance']],body:mergedRows,theme:'grid',
    headStyles:{fillColor:PDF_MERGED_HDR_COLOR,textColor:255,fontSize:8.5,fontStyle:'bold',halign:'center'},
    styles:{fontSize:7.5,cellPadding:2.5,lineWidth:0.15,lineColor:[200,180,230],overflow:'linebreak'},
    columnStyles:{0:{cellWidth:22,halign:'center'},1:{cellWidth:22,halign:'center',fontStyle:'bold'},2:{cellWidth:52},3:{cellWidth:27,halign:'right',fontStyle:'bold'},4:{cellWidth:27,halign:'right',fontStyle:'bold'},5:{cellWidth:26,halign:'center',fontStyle:'bold'}},
    didParseCell:function(data){const isSub=data.row.index===mergedRows.length-1;if(isSub){data.cell.styles.fillColor=[230,210,255];data.cell.styles.fontStyle='bold';}else{data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR;data.cell.styles.textColor=[80,40,120];}
    if(data.column.index===3&&!isSub)data.cell.styles.textColor=[180,40,40];if(data.column.index===4&&!isSub)data.cell.styles.textColor=[40,130,60];if(data.column.index===5&&!isSub){const txt=(data.cell.text||[]).join('');data.cell.styles.textColor=txt==='SETTLED'?[100,100,100]:[126,34,206];}},
    margin:{left:14,right:14}});
  yPos = doc.lastAutoTable.finalY + 6;
  if (yPos > 255) { doc.addPage(); yPos = 20; }
}

const rows = [];
const txRunBal = {val:0};
let totDebit=0,totCredit=0,totQty=0;
for (const t of normalRepTxns) {
  const r = buildRepRow(t, txRunBal);
  rows.push(r.row); totDebit+=r.debit; totCredit+=r.credit; totQty+=r.qty;
}
const finalBal = totDebit - totCredit;
if (normalRepTxns.length > 0) {
  doc.setFontSize(8.5);doc.setFont(undefined,'bold');doc.setTextColor(...hdrColor);
  doc.text('INDIVIDUAL TRANSACTIONS',14,yPos);doc.setTextColor(80,80,80);doc.setFont(undefined,'normal');yPos+=5;
  rows.push(['TOTALS','',`${safeToFixed(totQty,2)} kg total`,'Rs '+safeToFixed(totDebit,2),'Rs '+safeToFixed(totCredit,2),
    Math.abs(finalBal)<0.01?'SETTLED':finalBal>0?'DUE\nRs '+safeToFixed(finalBal,2):'OVERPAID\nRs '+safeToFixed(Math.abs(finalBal),2)]);
  doc.autoTable({startY:yPos,head:[['Date','Type','Details','Debit (Sale)','Credit (Rcvd)','Balance']],body:rows,theme:'grid',
    headStyles:{fillColor:hdrColor,textColor:255,fontSize:8.5,fontStyle:'bold',halign:'center'},
    styles:{fontSize:7.5,cellPadding:2.5,lineWidth:0.15,lineColor:[180,180,180],overflow:'linebreak'},
    columnStyles:{0:{cellWidth:22,halign:'center'},1:{cellWidth:22,halign:'center',fontStyle:'bold'},2:{cellWidth:52},3:{cellWidth:27,halign:'right',textColor:[220,53,69],fontStyle:'bold'},4:{cellWidth:27,halign:'right',textColor:[40,167,69],fontStyle:'bold'},5:{cellWidth:26,halign:'center',fontStyle:'bold'}},
    didParseCell:function(data){const isTotal=data.row.index===rows.length-1;if(isTotal){data.cell.styles.fontStyle='bold';data.cell.styles.fillColor=[235,255,235];data.cell.styles.fontSize=9;}
    if(data.column.index===1&&!isTotal){const txt=(data.cell.text||[]).join('');if(txt.includes('CASH'))data.cell.styles.textColor=[40,167,69];if(txt.includes('CREDIT'))data.cell.styles.textColor=[200,100,0];if(txt.includes('COLLECTION'))data.cell.styles.textColor=[40,167,69];if(txt.includes('PARTIAL'))data.cell.styles.textColor=[200,100,0];if(txt.includes('OLD DEBT'))data.cell.styles.textColor=[220,53,69];}
    if(data.column.index===5&&!isTotal){const txt=(data.cell.text||[]).join('');if(txt==='SETTLED')data.cell.styles.textColor=[100,100,100];else if(txt.includes('OVERPAID'))data.cell.styles.textColor=[40,167,69];else data.cell.styles.textColor=[220,53,69];}},
    margin:{left:14,right:14}});
}
const afterY = (normalRepTxns.length > 0 ? doc.lastAutoTable.finalY : yPos - 5) + 5;
if (afterY < 268) {
doc.setFillColor(245, 255, 245);
doc.roundedRect(14, afterY, pageW - 28, 20, 2, 2, 'F');
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.3);
doc.roundedRect(14, afterY, pageW - 28, 20, 2, 2, 'S');
doc.setFontSize(8); doc.setFont(undefined, 'normal');
doc.setTextColor(220, 53, 69);
doc.text(`Total Debit (Sales): Rs ${safeToFixed(totDebit, 2)}`, 20, afterY + 7);
doc.setTextColor(40, 167, 69);
doc.text(`Total Credit (Rcvd): Rs ${safeToFixed(totCredit, 2)}`, 20, afterY + 14);
doc.setTextColor(Math.abs(finalBal) < 0.01 ? 100 : finalBal > 0 ? 220 : 40,
Math.abs(finalBal) < 0.01 ? 100 : finalBal > 0 ? 53 : 167,
Math.abs(finalBal) < 0.01 ? 100 : finalBal > 0 ? 69 : 69);
doc.setFont(undefined, 'bold');
const balStr = Math.abs(finalBal) < 0.01 ? 'SETTLED'
: finalBal > 0 ? `Outstanding Due: Rs ${safeToFixed(finalBal, 2)}`
: `Overpaid by: Rs ${safeToFixed(Math.abs(finalBal), 2)}`;
doc.text(balStr, 110, afterY + 10.5);
}
} else {
doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(150);
doc.text('No sales recorded for this period.', pageW / 2, yPos + 15, { align: 'center' });
}
const pageCount = doc.internal.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
doc.setPage(i);
doc.setFontSize(7); doc.setTextColor(160);
doc.text(
`Generated on ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString('en-US')} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW / 2, 291, { align: 'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 287, { align: 'center' });
}
await new Promise(r => setTimeout(r, 100));
const filename = `Rep_Customer_Statement_${customerName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
doc.save(filename);
showToast("PDF exported successfully", "success");
} catch (error) {
showToast("Error generating PDF: " + error.message, "error");
}
}
const refreshEntityList = renderEntityTable;
function renderRepHistory() {
const list = document.getElementById('repHistoryList');
if (!list) return;
list.innerHTML = '';
const dateInput = document.getElementById('rep-date');
const selectedDate = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split('T')[0];
const isToday = selectedDate === new Date().toISOString().split('T')[0];
const headerText = isToday ? "Today's Activity" : `Activity for ${selectedDate}`;
const activityData = repSales
.filter(s =>
s.salesRep === currentRepProfile &&
s.date === selectedDate &&
s.paymentType !== 'PARTIAL_PAYMENT'
)
.sort((a,b) => b.timestamp - a.timestamp);
if(activityData.length === 0) {
list.innerHTML = `<div class="u-empty-state-sm" >No activity found for ${esc(selectedDate)}</div>`;
return;
}
let tableHTML = `
<div class="section liquid-card" style="padding: 15px;">
<h4 style="margin: 0 0 15px 0; color: var(--accent); font-size: 0.9rem;">${esc(headerText)}</h4>
<div style="max-height: 400px; overflow-y: auto;">
`;
activityData.forEach(item => {
let typeIcon = '';
let typeColor = '';
let qtyAmount = '';
if (item.paymentType === 'COLLECTION') {
typeIcon = '';
typeColor = 'var(--accent-emerald)';
qtyAmount = `Collection: ${item.totalValue.toFixed(2)}`;
} else if (item.paymentType === 'CREDIT') {
typeIcon = '';
typeColor = 'var(--warning)';
qtyAmount = item.transactionType === 'OLD_DEBT'
? `Previous Balance: ${item.totalValue.toFixed(2)}`
: `${item.quantity.toFixed(2)} kg - ${item.totalValue.toFixed(2)}`;
} else {
typeIcon = '';
typeColor = 'var(--accent)';
qtyAmount = `${item.quantity.toFixed(2)} kg - ${item.totalValue.toFixed(2)}`;
}
tableHTML += `
<div style="
display: flex;
justify-content: space-between;
align-items: center;
padding: 12px;
margin-bottom: 8px;
background: var(--input-bg);
border-radius: 10px;
border: 1px solid var(--glass-border);
transition: all 0.2s;
">
<div class="u-flex-1" >
<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
<span style="font-size: 1.2rem;">${typeIcon}</span>
<strong style="color: var(--text-main); font-size: 0.9rem;">${esc(item.customerName)}</strong>
${item.isMerged ? _mergedBadgeHtml(item, {inline:true}) : ''}
</div>
<div style="font-size: 0.75rem; color: ${typeColor}; font-weight: 600;">
${qtyAmount}
</div>
</div>
<div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
<div class="u-fs-sm u-text-muted" >
${esc(item.time || '')}
</div>
${item.isMerged ? '' : `<button class="tbl-action-btn danger" onclick="(async () => { await deleteRepTransaction('${esc(item.id)}') })()">Delete</button>`}
</div>
</div>
`;
});
tableHTML += `
</div>
</div>
`;
list.innerHTML = tableHTML;
}
async function refreshRepUI(force = false) {
if (idb && idb.getBatch) {
try {
const repKeys = ['rep_sales', 'rep_customers'];
const repDataMap = await idb.getBatch(repKeys);
if (repDataMap.get('rep_sales') !== undefined && repDataMap.get('rep_sales') !== null) {
let freshRepSales = repDataMap.get('rep_sales') || [];
let fixedCount = 0;
if (Array.isArray(freshRepSales) && freshRepSales.length > 0) {
freshRepSales = freshRepSales.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('rep_sales', freshRepSales);
}
freshRepSales.sort((a, b) => compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a)));
}
repSales = freshRepSales;
}
if (repDataMap.get('rep_customers') !== undefined && repDataMap.get('rep_customers') !== null) {
let freshRepCustomers = repDataMap.get('rep_customers') || [];
let fixedCount = 0;
if (Array.isArray(freshRepCustomers) && freshRepCustomers.length > 0) {
freshRepCustomers = freshRepCustomers.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('rep_customers', freshRepCustomers);
}
}
repCustomers = freshRepCustomers;
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
const adminRepSel = document.getElementById('admin-rep-selector');
if (adminRepSel && adminRepSel.value !== currentRepProfile) {
adminRepSel.value = currentRepProfile;
}
renderRepCustomerTable();
renderRepHistory();
if (appMode === 'admin') {
if (typeof updateRepLiveMap === 'function') {
setTimeout(updateRepLiveMap, 200);
}
}
}
async function forceAppModeFromCloud(targetMode, repName = null) {
if (!firebaseDB || !currentUser) {
showToast('Not logged in', 'error', 3000);
return false;
}
if (targetMode !== 'admin' && targetMode !== 'rep') {
showToast('Invalid mode - use "admin" or "rep"', 'error', 3000);
return false;
}
try {
const timestamp = Date.now();
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const settingsRef = userRef.collection('settings').doc('config');
const updatePayload = {
appMode: targetMode,
appMode_timestamp: timestamp
};
if (repName) {
updatePayload.repProfile = repName;
updatePayload.repProfile_timestamp = timestamp;
}
await settingsRef.set(updatePayload, { merge: true });
showToast(`Remote command sent: ${targetMode} mode`, 'success', 3000);
return true;
} catch (error) {
showToast('Failed to send remote command', 'error', 3000);
return false;
}
}
window.forceAppModeFromCloud = forceAppModeFromCloud;
function lockToRepMode() {
const nav = document.querySelector('.nav-tabs');
if (nav) nav.style.display = 'none';
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if (cloudMenuBtn) cloudMenuBtn.style.display = 'none';
const repHeader = document.getElementById('rep-header');
if (repHeader) {
const nameEl = document.getElementById('current-rep-name-display');
if (nameEl) nameEl.textContent = (currentRepProfile || 'Sales Rep').toUpperCase();
repHeader.style.display = 'flex';
}
['prod', 'sales', 'calc', 'factory', 'payments'].forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
});
const repTab = document.getElementById('tab-rep');
if (repTab) { repTab.classList.remove('hidden'); repTab.style.removeProperty('display'); }
const adminControls = document.getElementById('admin-rep-controls');
if (adminControls) { adminControls.classList.add('hidden'); adminControls.style.display = 'none'; }
const manageRepsBtn = document.getElementById('btn-manage-reps');
if (manageRepsBtn) manageRepsBtn.style.display = 'none';
const adminAnalytics = document.getElementById('admin-rep-analytics');
if (adminAnalytics) { adminAnalytics.classList.add('hidden'); adminAnalytics.style.display = 'none'; }
const newTransCard = document.getElementById('rep-new-transaction-card');
if (newTransCard) newTransCard.style.display = 'block';
if (typeof refreshRepUI === 'function') refreshRepUI();
}
function lockToProductionMode() {
const nav = document.querySelector('.nav-tabs');
if (nav) nav.style.display = 'none';
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if (cloudMenuBtn) cloudMenuBtn.style.display = 'none';
const manageRepsBtn = document.getElementById('btn-manage-reps');
if (manageRepsBtn) manageRepsBtn.style.display = 'none';
const prodHeader = document.getElementById('prod-locked-header');
if (prodHeader) {
const nameEl = document.getElementById('prod-locked-name-display');
if (nameEl) nameEl.textContent = (window._assignedManagerName || 'Production Manager').toUpperCase();
prodHeader.style.display = 'flex';
}
['sales', 'calc', 'factory', 'payments', 'rep'].forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
});
const prodTab = document.getElementById('tab-prod');
if (prodTab) { prodTab.classList.remove('hidden'); prodTab.style.removeProperty('display'); }
const prodToggle = document.querySelector('.production-toggle-container');
if (prodToggle) prodToggle.style.display = 'none';
['combinedOverview', 'combinedChart', 'prod-analytics-section',
'prod-history-header', 'prodHistoryList'].forEach(id => {
const el = document.getElementById(id);
if (el) el.style.display = 'none';
});
const fBlock = document.getElementById('prod-formula-cost-block');
if (fBlock) fBlock.style.display = 'none';
const pBlock = document.getElementById('prod-profit-block');
if (pBlock) pBlock.style.display = 'none';
const spField = document.getElementById('prod-sale-price-field');
if (spField) spField.style.display = 'none';
}
function lockToFactoryMode() {
const nav = document.querySelector('.nav-tabs');
if (nav) nav.style.display = 'none';
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if (cloudMenuBtn) cloudMenuBtn.style.display = 'none';
const manageRepsBtn = document.getElementById('btn-manage-reps');
if (manageRepsBtn) manageRepsBtn.style.display = 'none';
const factoryHeader = document.getElementById('factory-locked-header');
if (factoryHeader) {
const nameEl = document.getElementById('factory-locked-name-display');
if (nameEl) nameEl.textContent = (window._assignedManagerName || 'Factory Manager').toUpperCase();
factoryHeader.style.display = 'flex';
}
['prod', 'sales', 'calc', 'payments', 'rep'].forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
});
const factoryTab = document.getElementById('tab-factory');
if (factoryTab) { factoryTab.classList.remove('hidden'); factoryTab.style.removeProperty('display'); }
const factorySettingsBtn = document.getElementById('factory-settings-btn');
if (factorySettingsBtn) factorySettingsBtn.style.display = 'none';
document.querySelectorAll('#tab-factory .section.liquid-card').forEach(sec => {
sec.style.display = 'none';
});
const entrySection = document.getElementById('factory-entry-section');
if (entrySection) {
entrySection.style.removeProperty('display');
entrySection.classList.add('liquid-card');
const costDisplay = document.getElementById('factoryTotalProductionCostDisplay');
if (costDisplay) {
const fieldDiv = costDisplay.closest('.field');
if (fieldDiv) fieldDiv.style.display = 'none';
}
const formulaDisplay = document.getElementById('factoryFormulaDisplay');
if (formulaDisplay) formulaDisplay.style.display = 'none';
}
}
function _showModeBanner(tabLabel, personName, modeClass, icon) {
}
function lockToUserRoleMode() {
const assignedTabs = window._assignedUserTabs || [];
const userName = window._assignedManagerName || 'User';
const allTabs = ['prod','sales','calc','factory','payments','rep'];
['cloudMenuBtn','btn-manage-reps'].forEach(id => {
const el = document.getElementById(id); if (el) el.style.display = 'none';
});
const bannerMap = {
prod: { headerId:'prod-locked-header', nameId:'prod-locked-name-display' },
factory: { headerId:'factory-locked-header', nameId:'factory-locked-name-display' },
sales: { headerId:'sales-locked-header', nameId:'sales-locked-name-display' },
payments: { headerId:'payments-locked-header', nameId:'payments-locked-name-display' },
};
assignedTabs.forEach(t => {
const b = bannerMap[t]; if (!b) return;
const hdr = document.getElementById(b.headerId);
if (hdr) {
const nm = document.getElementById(b.nameId);
if (nm) nm.textContent = userName.toUpperCase();
hdr.style.display = 'flex';
}
});
allTabs.forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); el.style.removeProperty('display'); }
});
if (assignedTabs.includes('prod')) {
const prodToggle = document.querySelector('.production-toggle-container');
if (prodToggle) prodToggle.style.display = 'none';
['combinedOverview','combinedChart','prod-analytics-section',
'prod-history-header','prodHistoryList'].forEach(id => {
const el = document.getElementById(id); if (el) el.style.display = 'none';
});
['prod-formula-cost-block','prod-profit-block','prod-sale-price-field'].forEach(id => {
const el = document.getElementById(id); if (el) el.style.display = 'none';
});
document.querySelectorAll('#tab-prod .section.liquid-card').forEach(sec => {
if (sec.id !== 'production-entry-section') sec.style.display = 'none';
});
const ui = document.getElementById('unitsAvailableIndicator');
if (ui) ui.style.removeProperty('display');
const iuw = document.getElementById('insufficientUnitsWarning');
if (iuw) iuw.style.removeProperty('display');
}
if (assignedTabs.includes('factory')) {
const fsBtn = document.getElementById('factory-settings-btn');
if (fsBtn) fsBtn.style.display = 'none';
document.querySelectorAll('#tab-factory .section.liquid-card').forEach(sec => sec.style.display = 'none');
const entry = document.getElementById('factory-entry-section');
if (entry) {
entry.style.removeProperty('display');
entry.classList.add('liquid-card');
const cd = document.getElementById('factoryTotalProductionCostDisplay');
if (cd) { const f = cd.closest('.field'); if (f) f.style.display = 'none'; }
const fd = document.getElementById('factoryFormulaDisplay');
if (fd) fd.style.display = 'none';
}
}
if (assignedTabs.includes('sales')) {
const sh = document.querySelector('#tab-sales header');
if (sh) sh.querySelectorAll('button, .btn-theme').forEach(b => b.style.display = 'none');
let si = 0;
document.querySelectorAll('#tab-sales .section.liquid-card').forEach(sec => {
if (si === 0) { si++; return; }
sec.style.display = 'none'; si++;
});
['sale-result-cost','sale-result-value','sale-result-profit'].forEach(id => {
const el = document.getElementById(id); if (el) el.style.display = 'none';
});
const st = document.getElementById('sales-summary-toggle');
if (st) { const sh2 = st.closest('.section-header'); if (sh2) sh2.style.display = 'none'; }
const sc = document.getElementById('sales-summary-card');
if (sc) sc.style.display = 'none';
const cl = document.getElementById('custHistoryList');
if (cl) { const prev = cl.previousElementSibling; if (prev) prev.style.display = 'none'; cl.style.display = 'none'; }
}
if (assignedTabs.includes('payments')) {
const eb = document.querySelector('#tab-payments header .btn-theme');
if (eb) eb.style.display = 'none';
let pi = 0;
document.querySelectorAll('#tab-payments .section.liquid-card').forEach(sec => {
if (pi === 0) { pi++; return; }
sec.style.display = 'none'; pi++;
});
const us = document.getElementById('payments-unified-section');
if (us) us.style.display = 'none';
const ph = document.getElementById('payment-history-section');
if (ph) ph.style.display = 'none';
const pl = document.getElementById('paymentHistoryList');
if (pl) pl.style.display = 'none';
}
if (assignedTabs.length > 0 && typeof showTab === 'function') {
showTab(assignedTabs[0]);
}
}
async function enforceRepModeLock() {
const storedMode = await idb.get('appMode');
if (storedMode === 'rep') {
appMode = 'rep';
currentRepProfile = await idb.get('repProfile') || (salesRepsList[0] || 'NORAN SHAH');
lockToRepMode();
} else if (storedMode === 'userrole') {
appMode = 'userrole';
window._assignedManagerName = await idb.get('assignedManager') || null;
window._assignedUserTabs = await idb.get('assignedUserTabs') || [];
lockToUserRoleMode();
} else if (storedMode === 'production') {
appMode = 'production';
window._assignedManagerName = await idb.get('assignedManager') || null;
lockToProductionMode();
} else if (storedMode === 'factory') {
appMode = 'factory';
window._assignedManagerName = await idb.get('assignedManager') || null;
lockToFactoryMode();
}
}
function preventAdminAccess() {
if (appMode === 'rep') {
const originalShowTab = window.showTab;
window.showTab = function(tab) {
const adminTabs = ['prod', 'sales', 'calc', 'factory', 'payments'];
if (adminTabs.includes(tab)) {
showToast("Access Denied - Device in Rep Mode", "warning", 3000);
return;
}
if (tab === 'rep' || !adminTabs.includes(tab)) {
if (typeof originalShowTab === 'function') originalShowTab(tab);
}
};
document.querySelectorAll('.tab-btn').forEach(btn => {
btn.style.display = 'none';
});
} else if (appMode === 'userrole') {
const allowedTabs = window._assignedUserTabs || [];
const originalShowTabUR = window.showTab;
window.showTab = function(tab) {
if (!allowedTabs.includes(tab)) {
showToast('Access Denied — not in your assigned sections', 'warning', 3000);
return;
}
if (typeof originalShowTabUR === 'function') originalShowTabUR(tab);
if (tab === 'payments') {
const _ph = document.getElementById('payment-history-section');
if (_ph) { _ph.style.display = 'none'; _ph.style.visibility = 'hidden'; }
const _pl = document.getElementById('paymentHistoryList');
if (_pl) _pl.style.display = 'none';
const _us = document.getElementById('payments-unified-section');
if (_us) _us.style.display = 'none';
}
};
const btnMap = { PRODUCTION:'prod', SALES:'sales', CALCULATOR:'calc',
FACTORY:'factory', PAYMENTS:'payments', 'REP SALES':'rep' };
if (allowedTabs.length <= 1) {
const nav = document.querySelector('.nav-tabs');
if (nav) nav.style.display = 'none';
} else {
document.querySelectorAll('.tab-btn').forEach(btn => {
const tid = btnMap[btn.textContent.trim()];
btn.style.display = (tid && allowedTabs.includes(tid)) ? '' : 'none';
});
}
window._userRoleAllowedTabs = allowedTabs;
} else if (appMode === 'production') {
const originalShowTabProd = window.showTab;
window.showTab = function(tab) {
if (tab !== 'prod') {
showToast("Access Denied - Device in Production Manager Mode", "warning", 3000);
return;
}
if (typeof originalShowTabProd === 'function') originalShowTabProd(tab);
};
document.querySelectorAll('.tab-btn').forEach(btn => {
btn.style.display = 'none';
});
} else if (appMode === 'factory') {
const originalShowTabFactory = window.showTab;
window.showTab = function(tab) {
if (tab !== 'factory') {
showToast("Access Denied - Device in Factory Manager Mode", "warning", 3000);
return;
}
if (typeof originalShowTabFactory === 'function') originalShowTabFactory(tab);
};
document.querySelectorAll('.tab-btn').forEach(btn => {
btn.style.display = 'none';
});
}
}
async function unlockAdminMode() {
appMode = 'admin';
window._assignedManagerName = null;
const timestamp = Date.now();
await idb.set('appMode', 'admin');
await idb.set('appMode_timestamp', timestamp);
await idb.set('assignedManager', null);
notifyDataChange('all');
triggerAutoSync();
showToast('Switching to Admin Mode...', 'info', 1500);
setTimeout(() => {
location.reload();
}, 1000);
}
function unlockToAdminMode() {
unlockAdminMode();
}
document.addEventListener('DOMContentLoaded', async function() {
await enforceRepModeLock();
preventAdminAccess();
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if(cloudMenuBtn) {
cloudMenuBtn.style.display = (appMode === 'admin') ? '' : 'none';
}
});
async function deleteRepTransaction(id) {
if (!id || !validateUUID(id)) {
showToast('Invalid transaction ID', 'error');
return;
}
const transaction = repSales.find(t => t.id === id);
if (!transaction) {
await refreshRepUI(true);
return;
}
if (transaction.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const _rtIsOldDebt = transaction.transactionType === 'OLD_DEBT';
const _rtPayType = transaction.paymentType;
const _rtCust = transaction.customerName || 'Unknown';
const _rtRep = transaction.salesRep || 'Unknown';
const _rtDate = transaction.date || 'Unknown';
const _rtQty = transaction.quantity || 0;
const _rtAmt = transaction.totalValue || 0;
const _rtPartialPaid = transaction.partialPaymentReceived || 0;
let confirmMsg, confirmTitle;
if (_rtIsOldDebt) {
confirmTitle = '\u26a0 Delete Old Debt Record';
confirmMsg = `Permanently delete an OLD DEBT record for ${_rtCust} (Rep: ${_rtRep}).`;
confirmMsg += `\nBalance: ${_rtAmt.toFixed(2)}`;
confirmMsg += `\nRecorded: ${_rtDate}`;
if (transaction.notes) confirmMsg += `\nNote: ${transaction.notes}`;
confirmMsg += `\n\n\u26a0 Warning: This will erase the carried-forward balance from this rep customer's history. If the debt is still owed, it will vanish from all records permanently.`;
confirmMsg += `\n\nOnly delete if this was entered by mistake or has already been fully settled elsewhere.`;
} else if (_rtPayType === 'COLLECTION') {
confirmTitle = 'Delete Rep Bulk Collection';
confirmMsg = `Delete this bulk collection payment?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nAmount Collected: ${_rtAmt.toFixed(2)}`;
confirmMsg += `\n\n\u21a9 This will reverse the collection and restore the customer's outstanding balance with this rep.`;
} else if (_rtPayType === 'PARTIAL_PAYMENT') {
confirmTitle = 'Delete Rep Partial Payment';
confirmMsg = `Delete this partial payment?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nPayment: ${_rtAmt.toFixed(2)}`;
confirmMsg += `\n\n\u21a9 This will reverse the partial payment and restore the pending credit balance on the linked rep sale.`;
} else if (_rtPayType === 'CREDIT') {
confirmTitle = 'Delete Rep Credit Sale';
confirmMsg = `Delete this credit sale permanently?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nQty: ${_rtQty} kg — ${_rtAmt.toFixed(2)}`;
if (_rtPartialPaid > 0) confirmMsg += `\n\n\u26a0 ${_rtPartialPaid.toFixed(2)} has already been partially collected. Deleting will erase both the sale and the partial payment record.`;
else if (transaction.creditReceived) confirmMsg += `\n\n\u26a0 This sale is already marked PAID. Deleting it will remove the payment record from this rep\'s account.`;
else confirmMsg += `\n\n\u26a0 This credit sale is UNPAID. Deleting will remove the outstanding balance from the rep customer's account and affect the rep's sales totals.`;
} else {
confirmTitle = 'Delete Rep Cash Sale';
confirmMsg = `Delete this cash sale permanently?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nQty: ${_rtQty} kg — ${_rtAmt.toFixed(2)}`;
confirmMsg += `\n\n\u21a9 ${_rtQty} kg will be restored to inventory.`;
}
confirmMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: confirmTitle || 'Delete Rep Transaction', confirmText: "Delete", danger: true })) {
try {
const deletedQuantity = transaction.quantity || 0;
const wasCredit = transaction.paymentType === 'CREDIT';
const wasPartialPayment = transaction.paymentType === 'PARTIAL_PAYMENT';
const wasCollection = transaction.paymentType === 'COLLECTION';
const paymentAmount = transaction.totalValue || 0;
const relatedSaleId = transaction.relatedSaleId;
if (wasPartialPayment && relatedSaleId) {
const relatedSale = repSales.find(s => s.id === relatedSaleId);
if (relatedSale) {
relatedSale.partialPaymentReceived = (relatedSale.partialPaymentReceived || 0) - paymentAmount;
if (relatedSale.partialPaymentReceived < 0) relatedSale.partialPaymentReceived = 0;
if (relatedSale.partialPaymentReceived === 0) {
relatedSale.creditReceived = false;
delete relatedSale.creditReceivedDate;
}
relatedSale.updatedAt = getTimestamp();
}
}
transaction.deletedAt = getTimestamp();
transaction.updatedAt = getTimestamp();
repSales = repSales.filter(t => t.id !== id);
await unifiedDelete('rep_sales', repSales, id);
if (wasPartialPayment && relatedSaleId) {
const relatedSale = repSales.find(s => s.id === relatedSaleId);
if (relatedSale) {
await saveRecordToFirestore('rep_sales', relatedSale);
}
}
await refreshRepUI(true);
if (currentManagingRepCustomer && typeof renderRepCustomerTransactions === 'function') {
await renderRepCustomerTransactions(currentManagingRepCustomer);
}
notifyDataChange('rep');
triggerAutoSync();
let message = ` ${wasPartialPayment ? 'Payment' : wasCollection ? 'Collection' : 'Transaction'} deleted!`;
if ((wasPartialPayment || wasCollection || (wasCredit && transaction.partialPaymentReceived > 0)) && (paymentAmount > 0 || transaction.partialPaymentReceived > 0)) {
const refundAmount = wasCredit ? transaction.partialPaymentReceived : paymentAmount;
message += ` Payment of ${await formatCurrency(refundAmount)} reversed.`;
}
showToast(message, "success");
} catch (error) {
showToast('Failed to delete transaction. Please try again.', 'error');
}
}
}
function handleCustomerInput(query, mode) {
if (!query) query = '';
if (typeof query !== 'string') query = String(query);
const isRep = mode === 'rep';
const phoneContainerId = isRep ? 'rep-new-customer-phone-container' : 'new-customer-phone-container';
const phoneContainer = document.getElementById(phoneContainerId);
if (!phoneContainer) return;
const allSales = isRep ?
(Array.isArray(repSales) ? repSales : []).filter(s => s && s.salesRep === currentRepProfile) :
(Array.isArray(customerSales) ? customerSales : []).filter(s => s && s.isRepModeEntry !== true);
const existingNames = [...new Set(
allSales
.map(s => s && s.customerName ? s.customerName : null)
.filter(n => n !== null && n !== undefined && n !== '' && typeof n === 'string')
.map(n => {
try {
return String(n).trim().toLowerCase();
} catch (e) {
return null;
}
})
.filter(n => n !== null && n !== '')
)];
let safeQuery = '';
try {
safeQuery = query ? String(query).trim().toLowerCase() : '';
} catch (e) {
safeQuery = '';
}
if (safeQuery.length > 2 && !existingNames.includes(safeQuery)) {
phoneContainer.classList.remove('hidden');
} else {
phoneContainer.classList.add('hidden');
}
}
function handleUniversalSearch(inputId, resultsId, dataSource) {
const input = document.getElementById(inputId);
const resultsDiv = document.getElementById(resultsId);
if (!input || !resultsDiv) return;
const query = input.value || '';
if (!query || query.length < 1) {
resultsDiv.classList.add('hidden');
return;
}
let matches = [];
let html = '';
switch(dataSource) {
case 'customers':
const uniqueCustomers = [...new Set(customerSales
.filter(s => s && s.isRepModeEntry !== true)
.map(s => s.customerName)
.filter(n => n && typeof n === 'string'))];
matches = uniqueCustomers.filter(name =>
name && typeof name === 'string' && name.toLowerCase().includes(query.toLowerCase())
);
if (matches.length > 0) {
matches.forEach(name => {
const safeName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
html += `
<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem; color: var(--text-main); background: var(--input-bg);"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'name')"
onmouseover="this.style.background='var(--highlight-bg)'"
onmouseout="this.style.background='var(--input-bg)'">
<strong>${esc(name)}</strong>
</div>`;
});
} else {
html = `<div class="u-search-empty" >
No match found. "${query}" will be created as new customer.
</div>`;
}
break;
case 'entities':
if (Array.isArray(paymentEntities)) {
matches = paymentEntities.filter(entity =>
entity && entity.name && typeof entity.name === 'string' &&
entity.name.toLowerCase().includes(query.toLowerCase())
);
}
if (matches.length > 0) {
matches.forEach(entity => {
const safeName = String(entity.name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
const safeId = String(entity.id).replace(/'/g, "\\'");
const entityBal = calculateEntityBalances()[entity.id] || 0;
const typeColor = entityBal >= 0 ? 'var(--danger)' : 'var(--accent-emerald)';
html += `
<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem; color: var(--text-main); background: var(--input-bg);"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'entity', '${safeId}')"
onmouseover="this.style.background='var(--highlight-bg)'"
onmouseout="this.style.background='var(--input-bg)'">
<strong>${esc(entity.name)}</strong>
</div>`;
});
} else {
html = `<div class="u-search-empty" >
No matching entities found
</div>`;
}
break;
case 'suppliers':
if (Array.isArray(paymentEntities)) {
matches = paymentEntities.filter(entity =>
entity && entity.name && typeof entity.name === 'string' &&
entity.type === 'payee' &&
entity.name.toLowerCase().includes(query.toLowerCase())
);
}
if (matches.length > 0) {
matches.forEach(supplier => {
const safeName = String(supplier.name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
const safeId = String(supplier.id).replace(/'/g, "\\'");
html += `
<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem; color: var(--text-main); background: var(--input-bg);"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'supplier', '${safeId}')"
onmouseover="this.style.background='var(--highlight-bg)'"
onmouseout="this.style.background='var(--input-bg)'">
<strong>${esc(supplier.name)}</strong>
${supplier.phone ? `<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 8px;">${phoneActionHTML(supplier.phone)}</span>` : ''}
</div>`;
});
} else {
html = `<div class="u-search-empty" >
No matching suppliers found
</div>`;
}
break;
case 'repCustomers':
const repUniqueCustomers = [...new Set(repSales
.filter(s => s && s.salesRep === currentRepProfile)
.map(s => s.customerName)
.filter(n => n && typeof n === 'string'))];
matches = repUniqueCustomers.filter(name =>
name && typeof name === 'string' && name.toLowerCase().includes(query.toLowerCase())
);
if (matches.length > 0) {
matches.forEach(name => {
const safeName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
html += `
<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--glass-border); font-size: 0.85rem; color: var(--text-main); background: var(--input-bg);"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'repName')"
onmouseover="this.style.background='var(--highlight-bg)'"
onmouseout="this.style.background='var(--input-bg)'">
<strong>${esc(name)}</strong>
</div>`;
});
} else {
html = `<div class="u-search-empty" >
No match found. "${query}" will be created.
</div>`;
}
break;
}
resultsDiv.innerHTML = html;
resultsDiv.classList.remove('hidden');
}
function selectFromUniversalSearch(inputId, resultsId, value, type, id) {
const input = document.getElementById(inputId);
const resultsDiv = document.getElementById(resultsId);
if (input) {
input.value = value;
if (id) {
input.setAttribute('data-entity-id', id);
input.setAttribute('data-supplier-id', id);
}
}
if (resultsDiv) {
resultsDiv.classList.add('hidden');
}
if (type === 'name' && inputId === 'cust-name') {
if (typeof calculateCustomerStatsForDisplay === 'function') {
calculateCustomerStatsForDisplay(value);
}
} else if (type === 'repName' && inputId === 'rep-cust-name') {
if (typeof calculateRepCustomerStatsForDisplay === 'function') {
calculateRepCustomerStatsForDisplay(value);
}
}
}
document.addEventListener('click', function(e) {
const searchables = [
{ input: 'cust-name', results: 'customer-search-results' },
{ input: 'rep-cust-name', results: 'rep-customer-search-results' },
{ input: 'paymentEntity', results: 'payment-entity-search-results' },
{ input: 'factoryExistingSupplier', results: 'factory-supplier-search-results' }
];
searchables.forEach(item => {
const input = document.getElementById(item.input);
const resultsDiv = document.getElementById(item.results);
if (input && resultsDiv) {
const container = input.parentElement;
if (container && !container.contains(e.target)) {
resultsDiv.classList.add('hidden');
}
}
});
});
const originalSelectCustomer = window.selectCustomer || selectCustomer;
window.selectCustomer = function(name) {
originalSelectCustomer(name);
document.getElementById('new-customer-phone-container').classList.add('hidden');
document.getElementById('new-cust-phone').value = '';
};
const originalSelectRepCustomer = window.selectRepCustomer || selectRepCustomer;
window.selectRepCustomer = function(name) {
originalSelectRepCustomer(name);
document.getElementById('rep-new-customer-phone-container').classList.add('hidden');
document.getElementById('rep-new-cust-phone').value = '';
};
async function initTheme() {
const savedTheme = await idb.get('theme') || 'dark';
const html = document.documentElement;
html.setAttribute('data-theme', savedTheme);
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
themeToggle.innerHTML = savedTheme === 'dark' ? '' : '';
themeToggle.title = savedTheme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode";
}
const metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
metaThemeColor.setAttribute('content', savedTheme === 'light' ? '#ffffff' : '#000000');
}
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', initTheme);
} else {
initTheme();
}
const FIRESTORE_ENHANCED_SCHEMA = {
production: {
localKey: 'mfg_pro_pkr',
firestoreCollection: 'production',
localVariable: 'db',
type: 'array',
description: 'Manufacturing / production records',
fields: ['date', 'netWeight', 'costPrice', 'salePrice', 'profit', 'id', 'timestamp']
},
calculator_history: {
localKey: 'noman_history',
firestoreCollection: 'calculator_history',
localVariable: 'salesHistory',
type: 'array',
description: 'Calculator history – totals, revenue, returns, cash/credit splits',
fields: ['totalSold', 'revenue', 'returns', 'cash', 'credit', 'seller', 'date', 'id', 'timestamp']
},
sales: {
localKey: 'customer_sales',
firestoreCollection: 'sales',
localVariable: 'customerSales',
type: 'array',
description: 'Individual customer sales transactions',
fields: ['customerName', 'quantity', 'paymentType', 'supplyStore', 'date', 'phone', 'id', 'timestamp']
},
rep_sales: {
localKey: 'rep_sales',
firestoreCollection: 'rep_sales',
localVariable: 'repSales',
type: 'array',
description: 'Rep-mode sales with GPS coordinates',
fields: ['customerName', 'quantity', 'paymentType', 'salesRep', 'latitude', 'longitude', 'date', 'phone', 'id', 'timestamp']
},
inventory: {
localKey: 'factory_inventory_data',
firestoreCollection: 'inventory',
localVariable: 'factoryInventoryData',
type: 'array',
description: 'Raw-material inventory (name, qty, cost, value)',
fields: ['materialName', 'quantityOnHand', 'unitCost', 'totalValue', 'id', 'timestamp']
},
factory_history: {
localKey: 'factory_production_history',
firestoreCollection: 'factory_history',
localVariable: 'factoryProductionHistory',
type: 'array',
description: 'Factory formula production-batch history',
fields: ['unitsProduced', 'materialCosts', 'productType', 'date', 'id', 'timestamp']
},
returns: {
localKey: 'stock_returns',
firestoreCollection: 'returns',
localVariable: 'stockReturns',
type: 'array',
description: 'Stock-return logs from sellers',
fields: ['seller', 'quantity', 'reason', 'date', 'id', 'timestamp']
},
entities: {
localKey: 'payment_entities',
firestoreCollection: 'entities',
localVariable: 'paymentEntities',
type: 'array',
description: 'Registry of payment entities',
fields: ['name', 'phone', 'entityType', 'id', 'timestamp']
},
transactions: {
localKey: 'payment_transactions',
firestoreCollection: 'transactions',
localVariable: 'paymentTransactions',
type: 'array',
description: 'Cash-in / cash-out ledger linked to entities',
fields: ['entityId', 'amount', 'type', 'description', 'date', 'id', 'timestamp']
},
expenses: {
localKey: 'expenses',
firestoreCollection: 'expenses',
localVariable: 'expenseRecords',
type: 'array',
description: 'Unified expense manager records (operating expenses, payments IN/OUT)',
fields: ['name', 'amount', 'category', 'description', 'date', 'time', 'id', 'timestamp', 'syncedAt']
}
};
const FIRESTORE_SETTINGS_SCHEMA = {
factory_default_formulas: {
localKey: 'factory_default_formulas',
localVariable: 'factoryDefaultFormulas',
type: 'object',
defaultValue: { standard: [], asaan: [] },
description: 'Recipe / formula definitions (Standard vs Asaan)'
},
factory_additional_costs: {
localKey: 'factory_additional_costs',
localVariable: 'factoryAdditionalCosts',
type: 'object',
defaultValue: { standard: 0, asaan: 0 },
description: 'Overhead / extra costs per unit'
},
factory_sale_prices: {
localKey: 'factory_sale_prices',
localVariable: 'factorySalePrices',
type: 'object',
defaultValue: { standard: 0, asaan: 0 },
description: 'Standard selling price per kg/unit per store type'
},
factory_cost_adjustment_factor: {
localKey: 'factory_cost_adjustment_factor',
localVariable: 'factoryCostAdjustmentFactor',
type: 'object',
defaultValue: { standard: 1, asaan: 1 },
description: 'Cost-price multiplier for reporting'
},
factory_unit_tracking: {
localKey: 'factory_unit_tracking',
localVariable: 'factoryUnitTracking',
type: 'object',
defaultValue: {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
},
description: 'Unit lifecycle: produced → consumed → available'
},
naswar_default_settings: {
localKey: 'naswar_default_settings',
localVariable: 'defaultSettings',
type: 'object',
defaultValue: {},
description: 'General app default-settings object'
},
appMode: {
localKey: 'appMode',
localVariable: 'appMode',
type: 'string',
defaultValue: 'admin',
description: 'Current operating mode: admin | rep'
},
repProfile: {
localKey: 'repProfile',
localVariable: 'currentRepProfile',
type: 'string',
defaultValue: salesRepsList[0] || 'NORAN SHAH',
description: 'Active sales-representative profile name'
},
deleted_records: {
localKey: 'deleted_records',
localVariable: 'deletedRecordIds',
type: 'set_as_array',
defaultValue: [],
description: 'Tombstone IDs – prevents deleted records from re-appearing on sync'
},
last_synced: {
localKey: 'last_synced',
localVariable: null,
type: 'string_iso_date',
defaultValue: null,
description: 'ISO timestamp of the last successful cloud sync'
}
};
const FIRESTORE_LOCAL_ONLY_KEYS = {
theme: {
localKey: 'theme',
localVariable: null,
type: 'string',
defaultValue: 'dark',
description: 'UI theme preference: light | dark'
},
bio_enabled: {
localKey: 'bio_enabled',
localVariable: null,
type: 'boolean_string',
defaultValue: 'false',
description: 'Biometric security-lock flag'
},
bio_cred_id: {
localKey: 'bio_cred_id',
localVariable: null,
type: 'string',
defaultValue: '',
description: 'WebAuthn biometric credential ID'
}
};
