import { applyPaymentHistoryFilter, selectExpenseCategory, _resetExpenseForm, refreshPaymentTab, renderUnifiedTable, refreshEntityBalances, renderExpenseTable, formatDisplayDate } from './utilities-payments.js';
import { ensureArray, sqliteStore, loadAliveCollections, esc, loadCollections, fmtAmt, getTimestamp, ensureRecordIntegrity, generateUUID, validateUUID, appMode, allocatePaymentToMaterials, _safeErr, localDateStr } from './business.js';
import { confirmEditChanges, endEditMode, getEditCtx } from './edit-mode.js';
import { getAvailableCashInHand, calculateNetCash, calculateCashTracker } from './utilities-sales.js';
import { redactMoney } from './money-privacy.js';
import { unifiedSave, emitSyncUpdate } from './sync.js';
import { notifyDataChange, triggerAutoSync, _compressPhoto, loadScript, _pdfMergedPeriodLabel, _pdfMergedCountLabel, PDF_MERGED_ROW_COLOR, _pdfDrawMergedSectionHeader, PDF_MERGED_HDR_COLOR, _applyExpensePendingPhoto } from './utilities-core.js';
import { showToast } from './customers.js';
import { confirmGuard } from './confirm-guard.js';
import { runExclusive, getTxLinkIssue, planSupplierCreditConsumption, hasLiveSupplierInvoice } from './link-graph.js';
import { BRAND_LOGO_JPEG_BASE64 } from './constants.js';
import { formatDayMonthYear } from './date-format.js';

export async function handleExpenseSearch() {
const expenses = ensureArray(await sqliteStore.get('expenses'));
const expenseCategories = ensureArray(await sqliteStore.get('categories'));
const { entities, transactions } = await loadAliveCollections('entities', 'transactions');
const input = document.getElementById('expenseName');
const resultsDiv = document.getElementById('expense-search-results');
const query = input.value.trim().toLowerCase();
if (!query || query.length < 1) {
window.Dropdown.hide(resultsDiv);
return;
}
const expenseMatches = expenseCategories.filter(name => {
if (!name || typeof name !== 'string') return false;
return name.toLowerCase().includes(query);
});
const entityMatches = entities.filter(entity => {
if (!entity || !entity.name || typeof entity.name !== 'string') return false;
if (entity.isExpenseEntity === true) return false;
return entity.name.toLowerCase().includes(query);
});
let html = '';
html += `<div class="u-423ed18 st-background__356c02"> EXPENSES</div>`;
if (expenseMatches.length > 0) {
expenseMatches.forEach(name => {
if (!name || typeof name !== 'string') return;
const safeName = name.replace(/'/g, "\'").replace(/"/g, '&quot;');
const count = expenses.filter(e => e && e.name === name).length;
html += `
<div class="u-0f04ee6 st-background__356c02 hv-highlight"
onmousedown="selectExpense('${safeName}', 'expense')">
<div class="u-row-between" >
<strong>${esc(name)}</strong>
<span class="u-fs-sm u-text-muted" >
${count} expense records
</span>
</div>
</div>`;
});
} else {
html += `<div class="u-02d7412">No matching expenses — will create new</div>`;
}
html += `<div class="u-423ed18 st-background__356c02"> ENTITIES</div>`;
if (entityMatches.length > 0) {
entityMatches.forEach(entity => {
if (!entity || !entity.name || typeof entity.name !== 'string') return;
const safeName = entity.name.replace(/'/g, "\'").replace(/"/g, '&quot;');
const txnCount = transactions.filter(t => t && t.entityId === entity.id).length;
html += `
<div class="u-0f04ee6 st-background__356c02 hv-highlight"
onmousedown="selectExpense('${safeName}', 'entity')">
<div class="u-row-between" >
<strong>${esc(entity.name)}</strong>
<span class="u-fs-sm u-text-muted" >
${txnCount > 0 ? txnCount + ' transactions' : ''}
</span>
</div>
</div>`;
});
} else {
html += `<div class="u-02d7412">No matching entities — will create new</div>`;
}
resultsDiv.innerHTML = html;
window.Dropdown.show(resultsDiv, input);
}

export function selectExpense(name, type) {
const _nameInput = document.getElementById('expenseName');
_nameInput.value = name;
_nameInput.dataset.histCustomer = String(name || '').trim().toLowerCase();
applyPaymentHistoryFilter();
window.Dropdown.hide(document.getElementById('expense-search-results'));
if (!name || typeof name !== 'string') {
document.getElementById('expenseAmount').focus();
return;
}
if (type === 'entity') {
window.setStyle(document.getElementById('btn-category-operating'), 'opacity', 'st-opacity__c4c3c1');
window.setStyle(document.getElementById('btn-category-operating'), 'pointer-events', 'st-pointer-events__8b1364');
window.setStyle(document.getElementById('btn-category-in'), 'opacity', 'st-opacity__c6e797');
window.setStyle(document.getElementById('btn-category-in'), 'pointer-events', 'st-pointer-events__0b4908');
window.setStyle(document.getElementById('btn-category-out'), 'opacity', 'st-opacity__c6e797');
window.setStyle(document.getElementById('btn-category-out'), 'pointer-events', 'st-pointer-events__0b4908');
if (window._expenseCategory !== 'IN' && window._expenseCategory !== 'OUT') {
selectExpenseCategory('OUT', document.getElementById('btn-category-out'));
}
} else if (type === 'expense') {
window.setStyle(document.getElementById('btn-category-operating'), 'opacity', 'st-opacity__c6e797');
window.setStyle(document.getElementById('btn-category-operating'), 'pointer-events', 'st-pointer-events__0b4908');
window.setStyle(document.getElementById('btn-category-in'), 'opacity', 'st-opacity__c4c3c1');
window.setStyle(document.getElementById('btn-category-in'), 'pointer-events', 'st-pointer-events__8b1364');
window.setStyle(document.getElementById('btn-category-out'), 'opacity', 'st-opacity__c4c3c1');
window.setStyle(document.getElementById('btn-category-out'), 'pointer-events', 'st-pointer-events__8b1364');
if (window._expenseCategory === 'IN' || window._expenseCategory === 'OUT') {
selectExpenseCategory('operating', document.getElementById('btn-category-operating'));
}
} else {
['btn-category-operating','btn-category-in','btn-category-out'].forEach(id => {
const btn = document.getElementById(id);
if (btn) { window.setStyle(btn, 'opacity', 'st-opacity__c6e797'); window.setStyle(btn, 'pointer-events', 'st-pointer-events__0b4908'); }
});
}
document.getElementById('expenseAmount').focus();
}

export function hideExpenseSearch() {
window.Dropdown.hide(document.getElementById('expense-search-results'));
document.getElementById('expenseAmount').focus();
}

async function applyPaymentEdit(ed, v) {
const o = ed.original;
const { expenses, transactions, entities } = await loadCollections('expenses', 'transactions', 'entities');
const expenseCategories = ensureArray(await sqliteStore.get('categories'));
const origCategory = o.isExpense ? 'operating' : o.type;
if (v.category !== origCategory) {
window.notifyBlocking('The type cannot be changed while editing. Delete and re-enter it instead.', 'warning', 'Warning');
return;
}
const oldSigned = o.type === 'IN' ? (o.amount || 0) : -(o.amount || 0);
const newSigned = o.type === 'IN' ? v.amount : -v.amount;
const delta = newSigned - oldSigned;
if (delta < 0) {
const avail = await getAvailableCashInHand();
if (avail + delta < 0) {
window.notifyBlocking(redactMoney(`Insufficient cash in hand. Available: ${fmtAmt(Math.max(0, avail))} — Extra required: ${fmtAmt(-delta)}`, 'Insufficient cash in hand.'), 'error', 'Low cash in hand');
return;
}
}
const t = transactions.find(x => x && x.id === o.id);
if (!t) { window.notifyBlocking('Original transaction not found.', 'error', 'Something went wrong'); return; }
const _proceed = await confirmEditChanges([
{ label: 'Name', from: o.entityName || '', to: v.name },
{ label: 'Amount', from: fmtAmt(o.amount || 0), to: fmtAmt(v.amount) },
{ label: 'Date', from: o.date || '', to: v.date },
{ label: 'Note', from: (o.description || '').slice(0, 40), to: (v.description || (o.isExpense ? `Expense: ${v.name}` : `Payment ${o.type}: ${v.name}`)).slice(0, 40) }
], o.isExpense ? 'Update Expense?' : 'Update Payment?');
if (!_proceed) return;
const tBefore = { ...t };
const e = o.expenseId ? expenses.find(x => x && x.id === o.expenseId) : null;
const eBefore = e ? { ...e } : null;
try {
let entity = entities.find(x => String(x.id) === String(o.entityId));
let createdEntity = null;
if (!entity || String(entity.name || '').toLowerCase() !== v.name.toLowerCase()) {
entity = entities.find(x => x.name && x.name.toLowerCase() === v.name.toLowerCase() && !!x.isExpenseEntity === !!o.isExpense);
if (!entity) {
let entId = generateUUID('ent');
if (!validateUUID(entId)) entId = generateUUID('ent');
createdEntity = ensureRecordIntegrity(o.isExpense
? { id: entId, name: v.name, type: 'payee', isSupplier: false, isExpenseEntity: true, category: 'operating', phone: '', address: '', notes: 'Auto-created by Expense Manager' }
: { id: entId, name: v.name, type: o.type === 'OUT' ? 'payee' : 'payor', isSupplier: false, isExpenseEntity: false, phone: '', address: '', notes: 'Auto-created from Transaction Manager' }, false);
entities.push(createdEntity);
entity = createdEntity;
}
}
const ts = getTimestamp();
const editedAt = new Date().toISOString();
const desc = v.description || (o.isExpense ? `Expense: ${v.name}` : `Payment ${o.type}: ${v.name}`);
Object.assign(t, { entityId: entity.id, entityName: entity.name, amount: v.amount, date: v.date, description: desc, updatedAt: ts, isEdited: true, editedAt });
ensureRecordIntegrity(t, true);
if (e) {
Object.assign(e, { name: v.name, amount: v.amount, date: v.date, description: v.description || (o.isExpense ? '' : desc), updatedAt: ts, isEdited: true, editedAt });
ensureRecordIntegrity(e, true);
}
if (createdEntity) await unifiedSave('entities', entities, createdEntity);
if (e) await unifiedSave('expenses', expenses, e);
await unifiedSave('transactions', transactions, t);
if (o.isExpense && !expenseCategories.includes(v.name)) {
expenseCategories.push(v.name);
await sqliteStore.set('categories', expenseCategories);
await sqliteStore.set('categories_timestamp', Date.now());
}
notifyDataChange('payments');
notifyDataChange('expenses');
emitSyncUpdate({ transactions: null, expenses: null, entities: createdEntity ? null : undefined });
endEditMode();
_resetExpenseForm();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderUnifiedTable === 'function') await renderUnifiedTable(1);
if (typeof refreshEntityBalances === 'function') refreshEntityBalances();
if (typeof renderExpenseTable === 'function') renderExpenseTable();
showToast('Transaction updated', 'success');
} catch (err) {
Object.assign(t, tBefore);
if (e && eBefore) Object.assign(e, eBefore);
try {
if (e && eBefore) await unifiedSave('expenses', expenses, e);
await unifiedSave('transactions', transactions, t);
} catch (_) { }
console.warn('[edit payment] failed', err);
window.notifyBlocking('Failed to update transaction. Please try again.', 'error', 'Something went wrong');
}
}

export function saveExpense(...a) { return confirmGuard('saveExpense', () => runExclusive('saveExpense', () => _saveExpenseImpl(...a)), { label: 'Expense', late: true, fields: [['expenseName', 'Expense'], ['expenseAmount', 'Amount'], ['expenseDate', 'Date'], ['expenseDescription', 'Note']], skipKinds: ['payment'], share: { kind: 'ent', when: () => window._expenseCategory === 'IN' || window._expenseCategory === 'OUT' } }); }

async function _saveExpenseImpl() {
const { inventory, expenses } = await loadCollections('inventory', 'expenses');
const expenseCategories = ensureArray(await sqliteStore.get('categories'));
const { entities, transactions } = await loadCollections('entities', 'transactions');
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('payments')) {
window.notifyBlocking('Access Denied — Payments not in your assigned tabs', 'warning', 'Payment warning'); return;
}
const name = document.getElementById('expenseName').value.trim();
const amount = parseFloat(document.getElementById('expenseAmount').value);
const date = document.getElementById('expenseDate').value;
const description = document.getElementById('expenseDescription').value.trim();
const category = window._expenseCategory || 'operating';
if (!name) {
window.notifyBlocking("Please enter name/entity", 'warning', 'Warning');
return;
}
if (!amount || amount <= 0) {
window.notifyBlocking("Please enter valid amount", 'warning', 'Warning');
return;
}
if (!date) {
window.notifyBlocking("Please select date", 'warning', 'Warning');
return;
}
const _edPay = getEditCtx('payment');
if (_edPay) {
await applyPaymentEdit(_edPay, { name, amount, date, description, category });
return;
}
if (category === 'OUT' || category === 'operating') {
let _seMaterialOffset = 0;
if (category === 'OUT') {
const _seEntity = entities.find(e => e.name && e.name.toLowerCase() === name.toLowerCase() && !e.isExpenseEntity);
if (_seEntity) {
let _seRem = amount;
const _seMats = inventory
.filter(m => String(m.supplierId) === String(_seEntity.id) && (m.paymentStatus === 'pending' || !m.paymentStatus) && parseFloat(m.totalPayable || 0) > 0)
.sort((a, b) => new Date(a.purchaseDate || a.createdAt || 0) - new Date(b.purchaseDate || b.createdAt || 0));
for (const m of _seMats) {
if (_seRem <= 0) break;
_seMaterialOffset += Math.min(_seRem, m.totalPayable);
_seRem -= m.totalPayable;
}
}
}
const _seNetOutflow = amount - _seMaterialOffset;
const _seAvailCash = await getAvailableCashInHand();
if (_seAvailCash < _seNetOutflow) {
window.notifyBlocking(redactMoney(`Insufficient cash in hand. Available: ${fmtAmt(Math.max(0, _seAvailCash))} — Required: ${fmtAmt(_seNetOutflow)}`, 'Insufficient cash in hand.'), 'error', 'Low cash in hand');
return;
}
}
if (category !== 'operating') {
const _seKnownEnt = entities.find(e => e.name && e.name.toLowerCase() === name.toLowerCase() && !e.isExpenseEntity);
if (!_seKnownEnt && expenseCategories.some(cat => typeof cat === 'string' && cat.toLowerCase() === name.toLowerCase())) {
window.notifyBlocking(`"${name}" is an operating expense category, not an entity. Switch to Operating Expense mode or use a different name.`, 'error', 'Something went wrong');
return;
}
}
if (!(await window.gcCommit({}))) return;
const _seDeep = (a) => JSON.parse(JSON.stringify(a));
let expensesSnapshot = _seDeep(expenses);
let categoriesSnapshot = [...expenseCategories];
let entitiesSnapshot = _seDeep(entities);
let transactionsSnapshot = _seDeep(transactions);
let inventorySnapshot = _seDeep(inventory);
try {
if (category === 'operating') {
let expenseId = generateUUID('exp');
if (!validateUUID(expenseId)) {
expenseId = generateUUID('exp');
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
expenses.push(expense);
if (!expenseCategories.includes(name)) {
expenseCategories.push(name);
}
await unifiedSave('expenses', expenses, expense);
await sqliteStore.set('categories', expenseCategories);
await sqliteStore.set('categories_timestamp', Date.now());
notifyDataChange('expenses');
emitSyncUpdate({
expenses: null,
categories: null
});
if (window._expensePendingPhoto) {
  try {
    const _photoKey = 'expense:' + expense.id;
    const _storedPh = (await sqliteStore.get('photos')) || {};
    _storedPh[_photoKey] = await _compressPhoto(window._expensePendingPhoto, 1280, 0.75);
    await sqliteStore.set('photos', _storedPh);
    const _expPhTs = (await sqliteStore.get('photostamps')) || {};
    _expPhTs[_photoKey] = Date.now();
    await sqliteStore.set('photostamps', _expPhTs);
    const _dk = (await sqliteStore.get('photodirty')) || [];
    if (!_dk.includes(_photoKey)) _dk.push(_photoKey);
    await sqliteStore.set('photodirty', _dk);
    await sqliteStore.set('photos_timestamp', Date.now());
    if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
  } catch(_pe) { console.warn('Expense photo save failed', _pe); }
}
await createExpenseTransaction(expense);
showToast(`Operating expense recorded: ${name}`, "success");
} else {
const transactionType = category;
let payExpenseId = generateUUID('exp');
if (!validateUUID(payExpenseId)) payExpenseId = generateUUID('exp');
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
expenses.push(payExpenseRecord);
await unifiedSave('expenses', expenses, payExpenseRecord);
if (window._expensePendingPhoto) {
  try {
    const _payPhotoKey = 'expense:' + payExpenseRecord.id;
    const _payStoredPh = (await sqliteStore.get('photos')) || {};
    _payStoredPh[_payPhotoKey] = await _compressPhoto(window._expensePendingPhoto, 1280, 0.75);
    await sqliteStore.set('photos', _payStoredPh);
    const _payPhTs = (await sqliteStore.get('photostamps')) || {};
    _payPhTs[_payPhotoKey] = Date.now();
    await sqliteStore.set('photostamps', _payPhTs);
    const _payDk = (await sqliteStore.get('photodirty')) || [];
    if (!_payDk.includes(_payPhotoKey)) _payDk.push(_payPhotoKey);
    await sqliteStore.set('photodirty', _payDk);
    await sqliteStore.set('photos_timestamp', Date.now());
    if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
  } catch(_ppe) { console.warn('Expense photo save failed', _ppe); }
}
let entity = entities.find(e =>
e.name && e.name.toLowerCase() === name.toLowerCase() &&
!e.isExpenseEntity
);
if (!entity) {
const isKnownExpenseCategory = expenseCategories.some(
cat => typeof cat === 'string' && cat.toLowerCase() === name.toLowerCase()
);
if (isKnownExpenseCategory) {
window.notifyBlocking(`"${name}" is an operating expense category, not an entity. Switch to Operating Expense mode or use a different name.`, 'error', 'Something went wrong');
return;
}
let _seEntityId = generateUUID('ent');
if (!validateUUID(_seEntityId)) _seEntityId = generateUUID('ent');
let newEntity = {
id: _seEntityId,
name: name,
type: transactionType === 'OUT' ? 'payee' : 'payor',
isSupplier: false,
isExpenseEntity: false,
phone: '',
address: '',
notes: 'Auto-created from Transaction Manager'
};
newEntity = ensureRecordIntegrity(newEntity, false);
entities.push(newEntity);
entity = newEntity;
}
let _seTxId = generateUUID('pay');
if (!validateUUID(_seTxId)) _seTxId = generateUUID('pay');
let transaction = {
id: _seTxId,
entityId: entity.id,
entityName: entity.name,
amount: amount,
type: transactionType,
date: date,
description: description || `Payment ${transactionType}: ${name}`,
isPayable: false,
isExpense: false,
expenseId: payExpenseId,
createdBy: (appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null
};
if (transactionType === 'OUT') {
const pendingMaterials = inventory
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
let remaining = amount;
if (pendingMaterials.length > 0) {
const _alloc = allocatePaymentToMaterials(pendingMaterials, remaining, date);
remaining = _alloc.remaining;
const materialsToSave = _alloc.touched;
if (materialsToSave.length > 0) {
transaction.isPayable = true;
transaction.materialId = materialsToSave[0].id;
transaction.materialIds = materialsToSave.map(m => m.id);
for (const mat of materialsToSave) {
await unifiedSave('inventory', inventory, mat);
}
}
}
if (remaining > 0) {
const _creditPlan = planSupplierCreditConsumption(transactions, entity.id, remaining);
if (_creditPlan.consumptions.length) {
remaining = _creditPlan.remaining;
const _consumedById = new Map(_creditPlan.consumptions.map(c => [String(c.id), c.amount]));
const _consumedIds = [];
for (const ct of transactions) {
if (!ct || !_consumedById.has(String(ct.id))) continue;
ct.supplierCreditAmount = parseFloat(Math.max(0, (parseFloat(ct.supplierCreditAmount) || 0) - _consumedById.get(String(ct.id))).toFixed(2));
ct.updatedAt = getTimestamp();
ensureRecordIntegrity(ct, true);
_consumedIds.push(ct.id);
}
transaction.consumedCredits = _creditPlan.consumptions;
if (!transaction.isPayable) transaction.isPayable = true;
await unifiedSave('transactions', transactions, null, _consumedIds);
}
}
}
if (transactionType === 'IN') {
const hasMaterials = inventory.some(m => String(m.supplierId) === String(entity.id));
const isSupplierEntity = entity.isSupplier || hasMaterials;
if (isSupplierEntity) {
transaction.isPayable = true;
transaction.supplierCreditAmount = amount;
}
}
const _seLinkIssue = getTxLinkIssue(transaction, { entities, expenses, inventory });
if (_seLinkIssue) throw new Error(_seLinkIssue);
transaction = ensureRecordIntegrity(transaction, false);
transactions.push(transaction);
await unifiedSave('entities', entities, entity);
await unifiedSave('transactions', transactions, transaction);
notifyDataChange('payments');
emitSyncUpdate({
entities: null,
transactions: null
});
showToast(`Payment ${transactionType} recorded: ${name}`, "success");
if (typeof window.shareInvoiceAfterSave === 'function') window.shareInvoiceAfterSave('ent', { name, date, render: () => window.renderEntityOverlayContent(entity) });
}
clearExpenseForm();
if (typeof renderUnifiedTable === 'function') {
try {
renderUnifiedTable(1);
} catch (e) {
console.error('Failed to render data.', _safeErr(e));
window.notifyBlocking('Transaction table failed to render: ' + (_safeErr(e).message || 'please reload the app'), 'error', 'Something went wrong');
}
}
if (typeof refreshPaymentTab === 'function') {
try {
await refreshPaymentTab(true);
} catch (e) {
console.error('Payment tab refresh failed.', _safeErr(e));
window.notifyBlocking('Payments tab failed to refresh: ' + (_safeErr(e).message || 'please reload the app'), 'error', 'Payment error');
}
}
if (typeof renderExpenseTable === 'function') {
try {
renderExpenseTable(1);
} catch (e) {
console.error('Payment tab refresh failed.', _safeErr(e));
window.notifyBlocking('Expense table failed to render: ' + (_safeErr(e).message || 'please reload the app'), 'error', 'Something went wrong');
}
}
if (typeof handleExpenseSearch === 'function') {
try {
handleExpenseSearch();
} catch (e) {
console.error('Payment tab refresh failed.', _safeErr(e));
window.notifyBlocking('Expense search failed to run: ' + (_safeErr(e).message || 'please reload the app'), 'error', 'Something went wrong');
}
}
if (typeof calculateNetCash === 'function') {
try {
calculateNetCash();
} catch (e) {
console.error('Payment tab refresh failed.', _safeErr(e));
window.notifyBlocking('Economic health calculation failed: ' + (_safeErr(e).message || 'please reload the app'), 'error', 'Something went wrong');
}
}
if (typeof window.renderFactoryInventory === 'function') {
try {
window.renderFactoryInventory?.();
} catch (e) {
console.error('Payment tab refresh failed.', _safeErr(e));
window.notifyBlocking('Factory inventory failed to render: ' + (_safeErr(e).message || 'please reload the app'), 'error', 'Something went wrong');
}
}
triggerAutoSync();
} catch (error) {
expenses.length = 0;
expenses.push(...expensesSnapshot);
expenseCategories.length = 0;
expenseCategories.push(...categoriesSnapshot);
entities.length = 0;
entities.push(...entitiesSnapshot);
transactions.length = 0;
transactions.push(...transactionsSnapshot);
inventory.length = 0;
inventory.push(...inventorySnapshot);
try {
await sqliteStore.setBatch([
['expenses', expenses],
['categories', expenseCategories],
['entities', entities],
['transactions', transactions],
['inventory', inventory]
]);
} catch (rollbackError) {
console.error('Failed to render data.', _safeErr(rollbackError));
window.notifyBlocking('Expense rollback failed: ' + (_safeErr(rollbackError).message || 'data may be inconsistent, please reload'), 'error', 'Something went wrong');
}
window.notifyBlocking('Failed to save expense. Please try again.', 'error', 'Something went wrong');
}
}

export async function createExpenseTransaction(expense) {
const { transactions, entities } = await loadCollections('transactions', 'entities');
let entity = entities.find(e =>
e.name && e.name.toLowerCase() === expense.name.toLowerCase() &&
e.isExpenseEntity === true
);
if (!entity) {
let _etEntityId = generateUUID('ent');
if (!validateUUID(_etEntityId)) _etEntityId = generateUUID('ent');
let newEntity = {
id: _etEntityId,
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
entities.push(newEntity);
entity = newEntity;
await unifiedSave('entities', entities, newEntity);
}
let _etTxId = generateUUID('pay');
if (!validateUUID(_etTxId)) _etTxId = generateUUID('pay');
let transaction = {
id: _etTxId,
entityId: entity.id,
entityName: entity.name,
amount: expense.amount,
type: 'OUT',
date: expense.date,
description: expense.description || `Expense: ${esc(expense.name)}`,
category: expense.category,
isPayable: false,
isExpense: true,
expenseId: expense.id,
createdBy: (appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null
};
transaction = ensureRecordIntegrity(transaction, false);
transactions.push(transaction);
await unifiedSave('transactions', transactions, transaction);
if (typeof calculateNetCash === 'function') {
calculateNetCash();
}
if (typeof refreshEntityBalances === 'function') {
refreshEntityBalances();
}
}

export async function exportUnifiedData() {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const _notDeleted = (item) => item && item.id && !deletedRecordIds.has(String(item.id));
const inventory = ensureArray(await sqliteStore.get('inventory')).filter(_notDeleted);
const entities = ensureArray(await sqliteStore.get('entities')).filter(_notDeleted);
const transactions = ensureArray(await sqliteStore.get('transactions')).filter(_notDeleted);
const expenses = ensureArray(await sqliteStore.get('expenses')).filter(_notDeleted);
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
const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
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
if (typeof BRAND_LOGO_JPEG_BASE64 !== 'undefined') {
  try { doc.addImage(BRAND_LOGO_JPEG_BASE64, 'JPEG', 6, 2.5, 23.72, 17, undefined, 'NONE'); } catch(e) {}
}
doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW/2, 10, { align:'center' });
doc.setFontSize(9); doc.setFont(undefined,'normal');
doc.text('Naswar Manufacturers & Dealers', pageW/2, 17, { align:'center' });
doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(50,50,50);
const titleText = isEntities ? 'Payment Entities — Balances & Ledger' : 'Expenses — Transaction Records';
doc.text(`${titleText} · ${periodName}`, pageW/2, 30, { align:'center' });
doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(120,120,120);
doc.text(`Generated: ${formatDayMonthYear(now)} at ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})}`, pageW/2, 36, { align:'center' });
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, 39, pageW - 14, 39);
let yPos = 44;
if (isEntities) {
const supplierIdSet = new Set();
inventory.forEach(m => { if (m.supplierId) supplierIdSet.add(String(m.supplierId)); });
const supplierBalances = {};
inventory.forEach(mat => {
if (mat.supplierId && mat.paymentStatus === 'pending' && mat.totalPayable > 0 && hasLiveSupplierInvoice(mat, transactions)) {
const sid = String(mat.supplierId);
supplierBalances[sid] = (supplierBalances[sid] || 0) + mat.totalPayable;
}
});
const entityNetBalances = {};
const entityMergedInfo = {};
entities.forEach(e => {
if (e.isExpenseEntity === true) return;
if (supplierIdSet.has(String(e.id))) return;
entityNetBalances[e.id] = 0;
});
transactions.forEach(t => {
if (t.isExpense === true) return;
if (t.isPayable === true) return;
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
originalIn: (t.mergedSummary.originalIn || 0),
originalOut: (t.mergedSummary.originalOut || 0)
});
}
}
});
const entityRows = [];
const pdfEntityMeta = [];
let totPayable = 0, totReceivable = 0;
const allEntities = entities
.filter(e => !e.isExpenseEntity)
.map(entity => {
const sid = String(entity.id);
const isSupplier = supplierIdSet.has(sid);
const balance = isSupplier
? (supplierBalances[sid] || 0)
: (entityNetBalances[entity.id] || 0);
return { entity, sid, isSupplier, balance };
})
.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
allEntities.forEach(({ entity, sid, isSupplier, balance }) => {
if (balance > 0.01) totPayable += balance;
else if (balance < -0.01) totReceivable += Math.abs(balance);
let balDisplay, balNote;
if (Math.abs(balance) < 0.01) { balDisplay = 'SETTLED'; balNote = 'SETTLED'; }
else if (balance > 0.01) { balDisplay = fmtAmt(balance); balNote = 'PAYABLE'; }
else { balDisplay = fmtAmt(Math.abs(balance)); balNote = 'RECEIVABLE'; }
const source = isSupplier ? 'Inventory' : 'Transactions';
const hasMergedTx = !!entityMergedInfo[entity.id];
entityRows.push([
entity.name + (hasMergedTx ? '\n\u2605 Has year-end balance' : ''),
isSupplier ? 'SUPPLIER' : (entity.type === 'payee' ? 'PAYEE' : 'PAYOR'),
entity.phone || 'N/A',
hasMergedTx ? 'Year-End\n' + source : source,
balDisplay,
balNote
]);
pdfEntityMeta.push({ entity, balNote, hasMergedTx });
});
if (entityRows.length > 0) {
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
const meta = pdfEntityMeta[data.row.index];
if (meta && meta.hasMergedTx) data.cell.styles.fillColor = PDF_MERGED_ROW_COLOR;
if (data.column.index === 4 && meta) {
if (meta.balNote === 'PAYABLE') data.cell.styles.textColor = [220,53,69];
else if (meta.balNote === 'RECEIVABLE') data.cell.styles.textColor = [40,167,69];
else data.cell.styles.textColor = [100,100,100];
}
if (data.column.index === 5 && meta) {
if (meta.balNote === 'SETTLED') data.cell.styles.textColor = [100,100,100];
else if (meta.balNote === 'RECEIVABLE') data.cell.styles.textColor = [40,167,69];
else if (meta.balNote === 'PAYABLE') data.cell.styles.textColor = [220,53,69];
}
if (data.column.index === 1) {
const txt = (data.cell.text || []).join('');
if (txt === 'SUPPLIER') data.cell.styles.textColor = [200,100,0];
else if (txt === 'PAYEE') data.cell.styles.textColor = [220,53,69];
else if (txt === 'PAYOR') data.cell.styles.textColor = [40,167,69];
}
},
margin: { left: 14, right: 14 }
});
const afterY = doc.lastAutoTable.finalY + 6;
if (afterY < 265) {
doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100);
doc.text(
`Total Payables: ${fmtAmt(totPayable)} | Total Receivables: ${fmtAmt(totReceivable)} | Net Position: ${fmtAmt(Math.abs(totReceivable - totPayable))} ${totReceivable > totPayable ? '(IN OUR FAVOR)' : '(NET PAYABLE)'}`,
14, afterY
);
const hasMergedEntries = Object.keys(entityMergedInfo).length > 0;
if (hasMergedEntries && afterY + 7 < 272) {
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
let operatingExpenses = expenses.filter(exp => exp && exp.category === 'operating');
if (periodFilter !== 'all') {
operatingExpenses = operatingExpenses.filter(exp => exp.date && new Date(exp.date) >= startDate);
}
operatingExpenses.sort((a, b) => new Date(a.date) - new Date(b.date));
if (operatingExpenses.length > 0) {
const nameGroups = {};
operatingExpenses.forEach(exp => {
const key = exp.name || 'Unnamed';
nameGroups[key] = (nameGroups[key] || 0) + (parseFloat(exp.amount) || 0);
});
const mergedExpenses = operatingExpenses.filter(e => e.isMerged === true);
const normalExpenses = operatingExpenses.filter(e => !e.isMerged);
if (mergedExpenses.length > 0) {
yPos = _pdfDrawMergedSectionHeader(doc, yPos, pageW, 'YEAR-END EXPENSE SUMMARIES (Carried Forward)');
const mergedExpRows = mergedExpenses.map(exp => {
const period = _pdfMergedPeriodLabel(exp);
const count = _pdfMergedCountLabel(exp);
return [
period,
exp.name || '-',
exp.category || 'operating',
`${count} — ${(exp.description || '').substring(0, 35)}`,
fmtAmt(parseFloat(exp.amount)||0)
];
});
doc.autoTable({startY:yPos,head:[['Year Period','Name / Vendor','Category','Summary','Total Amount']],body:mergedExpRows,theme:'grid',
headStyles:{fillColor:PDF_MERGED_HDR_COLOR,textColor:255,fontSize:9,fontStyle:'bold',halign:'center'},
styles:{fontSize:8,cellPadding:2.5,lineWidth:0.15,lineColor:[200,180,230],overflow:'linebreak'},
columnStyles:{0:{cellWidth:30,halign:'center'},1:{cellWidth:34},2:{cellWidth:22,halign:'center',fontSize:7.5},3:{cellWidth:58},4:{cellWidth:28,halign:'right',fontStyle:'bold'}},
didParseCell:function(data){data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR;data.cell.styles.textColor=[80,40,120];if(data.column.index===4)data.cell.styles.textColor=[140,60,180];},
margin:{left:14,right:14}});
yPos = doc.lastAutoTable.finalY + 6;
if (yPos > 250) { doc.addPage(); yPos = 20; }
}
const expenseRows = normalExpenses.map(exp => [
formatDisplayDate(exp.date) || exp.date || '',
exp.name || '-',
exp.category || 'operating',
(exp.description || '-').substring(0, 45),
fmtAmt(parseFloat(exp.amount) || 0)
]);
const totalAmt = operatingExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
if (normalExpenses.length > 0) {
doc.setFontSize(8.5); doc.setFont(undefined,'bold');
doc.setTextColor(...hdrColor);
doc.text('INDIVIDUAL EXPENSE RECORDS', 14, yPos);
doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
yPos += 5;
}
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
didParseCell: function(data) {},
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
doc.text(fmtAmt(total), 130, bkY, { align:'right' });
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
`Generated on ${formatDayMonthYear(now)} at ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW/2, 291, { align:'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW/2, 287, { align:'center' });
}
const filename = `Unified_Statement_${viewMode}_${periodFilter}_${localDateStr(now)}.pdf`;
doc.save(filename);
showToast('PDF exported successfully!', 'success');
} catch (error) {
showToast('Error generating PDF: ' + error.message, 'error');
}
}

export function clearExpenseForm() {
const _nameInput = document.getElementById('expenseName');
_nameInput.value = '';
_nameInput.dataset.histCustomer = '';
applyPaymentHistoryFilter();
document.getElementById('expenseAmount').value = '';
document.getElementById('expenseDescription').value = '';
document.getElementById('expenseDate').value = localDateStr();
window.Dropdown.hide(document.getElementById('expense-search-results'));
selectExpenseCategory('OUT', document.getElementById('btn-category-out'));
['btn-category-operating','btn-category-in','btn-category-out'].forEach(id => {
const btn = document.getElementById(id);
if (btn) { window.setStyle(btn, 'opacity', 'st-opacity__c6e797'); window.setStyle(btn, 'pointer-events', 'st-pointer-events__0b4908'); }
});
const expIdEl = document.getElementById('expense-id-display');
if (expIdEl && typeof generateUUID === 'function') {
const previewId = generateUUID('exp');
expIdEl.textContent = 'ID: ' + previewId.split('-').slice(0,2).join('-') + '…';
expIdEl.title = previewId;
}
window._expensePendingPhoto = null;
_applyExpensePendingPhoto(null);
}

Object.assign(window, { handleExpenseSearch, selectExpense, hideExpenseSearch, saveExpense, createExpenseTransaction, exportUnifiedData, clearExpenseForm });
