import { getSaleBlockReason, getSettleToggleBlockReason, detachChildPayment, recordCustomerRename, getOldDebtChangeIssue } from './link-guards.js';
import { txEffectiveDate, txChronoCompare } from './tx-date.js';
import { newGroupId, stampGroup, planCreditToggle, applySettlement, collectionCollected } from './link-graph.js';
import { _creatorBadgeHtml, _mergedBadgeHtml, _safeErr, balanceAfterHtml, currentRepProfile, debtDelta, debtNeedsGross, ensureArray, ensureRecordIntegrity, esc, fmtAmt, fmtNum, generateUUID, getTimestamp, localDateStr, lockedUnitPrice, round2, safeNumber, safeToFixed, sqliteStore, validateUUID } from './business.js';
import { unifiedDelete, unifiedSave } from './sync.js';
import { getPersonPhoto, loadPersonPhotoIntoEditor, notifyDataChange, renderPersonAvatarHTML, savePersonPhoto, triggerAutoSync } from './utilities-core.js';
import { calculateCashTracker, calculateNetCash, custTransactionMode, getStoreLabel, refreshCustomerSales, updateCollectionPreview } from './utilities-sales.js';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, handleUniversalSearch, phoneActionHTML, refreshEntityBalances, refreshPaymentTab, safeValue } from './utilities-payments.js';
import { calculatePaymentSummaries, getEffectiveSalePriceForCustomer, getSaleTransactionValue, updateUnitsAvailableIndicator } from './factory.js';
import { renderRepCustomerTable, renderRepCustomerTransactions } from './rep-sales.js';
import { confirmGuard } from './confirm-guard.js';
import { showGlassConfirm, showGlassAlert, showChoiceDialog, notifyBlocking } from './dialog.js';
import { getDefaultStoreKey } from './store-keys.js';
export { showGlassConfirm, showGlassAlert, showChoiceDialog, notifyBlocking };
export function selectCustomer(name) {
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
window._selectCustomerBase = selectCustomer;
export async function calculateCustomerStatsForDisplay(name) {
const customerSales = ensureArray(await sqliteStore.get('sales'));
const repSales = ensureArray(await sqliteStore.get('rep'));
const salesCustomers = ensureArray(await sqliteStore.get('customers'));
const repCustomers = ensureArray(await sqliteStore.get('clients'));
if (!name) return;
const sales = customerSales.filter(s =>
s && s.currentRepProfile === 'admin' && s.customerName && s.customerName.toLowerCase() === name.toLowerCase()
);
if (sales.length === 0) {
document.getElementById('customer-info-display').classList.add('hidden');
return;
}
let totalCredit = 0;
let totalQty = 0;
for (const s of sales) {
totalQty += (s.quantity || 0);
totalCredit = round2(totalCredit + debtDelta(s, debtNeedsGross(s) ? await getSaleTransactionValue(s) : 0));
}
totalCredit = Math.max(0, totalCredit);
const _setCust = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setCust('customer-current-credit', await formatCurrency(totalCredit));
_setCust('customer-total-quantity', fmtNum(safeNumber(totalQty, 0)) + ' kg');
document.getElementById('customer-info-display').classList.remove('hidden');
if (typeof custTransactionMode !== 'undefined' && custTransactionMode === 'collection' && typeof updateCollectionPreview === 'function') {
updateCollectionPreview();
}
}
export async function renderCustomersTable(page = 1) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted_records')));
const _rctAlive = (item) => item && item.id && !deletedRecordIds.has(String(item.id));
const customerSales = ensureArray(await sqliteStore.get('sales')).filter(_rctAlive);
const salesCustomers = ensureArray(await sqliteStore.get('customers')).filter(_rctAlive);
const tbody = document.getElementById('customers-table-body');
if (!tbody) {
return;
}
try {
const freshSales = await sqliteStore.get('sales', []);
if (Array.isArray(freshSales) && freshSales.length > 0) {
customerSales.length = 0;
freshSales.forEach(s => customerSales.push(s));
}
} catch (error) {
console.error('UI refresh failed.', _safeErr(error));
showToast('Failed to reload sales data: ' + (_safeErr(error).message || 'please reload the app'), 'error');
}
try {
const freshSalesCustomers = await sqliteStore.get('customers', []);
if (Array.isArray(freshSalesCustomers) && freshSalesCustomers.length > 0) {
const regMap = new Map(freshSalesCustomers.map(c => [c.id, c]));
if (Array.isArray(salesCustomers)) {
salesCustomers.forEach(c => { if (c && c.id && !regMap.has(c.id)) regMap.set(c.id, c); });
}
const mergedSC = Array.from(regMap.values());
await sqliteStore.set('customers', mergedSC);
}
} catch (regError) {
console.warn('Registry refresh failed, using in-memory:', _safeErr(regError));
}
const filterInput = document.getElementById('customer-filter');
const filterValue = filterInput ? filterInput.value.toLowerCase() : '';
const customerStats = {};
for (const sale of customerSales) {
const name = sale.customerName;
if (!name || name.trim() === '') continue;
if (sale.currentRepProfile !== 'admin') continue;
const isRepLinked = sale.salesRep && sale.salesRep !== 'NONE';
if (!customerStats[name]) {
customerStats[name] = { name: name, credit: 0, quantity: 0, lastSaleDate: 0 };
}
customerStats[name].quantity += (sale.quantity || 0);
customerStats[name].credit = round2(customerStats[name].credit + debtDelta(sale, debtNeedsGross(sale) ? await getSaleTransactionValue(sale) : 0));
const saleDate = sale.date;
if (saleDate) {
const timestamp = new Date(saleDate).getTime();
if (!isNaN(timestamp) && timestamp > customerStats[name].lastSaleDate) {
customerStats[name].lastSaleDate = timestamp;
}
}
}
let sortedCustomers = Object.values(customerStats)
.filter(c => c && c.name)
.sort((a, b) => {
if (b.credit !== a.credit) return b.credit - a.credit;
return b.lastSaleDate - a.lastSaleDate;
});
if (Array.isArray(salesCustomers)) {
const statsNames = new Set(sortedCustomers.map(c => c.name.toLowerCase()));
salesCustomers.forEach(sc => {
if (!sc || !sc.name || !sc.name.trim()) return;
const lcName = sc.name.toLowerCase();
if (statsNames.has(lcName)) return;
sortedCustomers.push({ name: sc.name, credit: 0, quantity: 0, lastSaleDate: 0 });
statsNames.add(lcName);
});
}
if (filterValue) {
sortedCustomers = sortedCustomers.filter(c => c && c.name && c.name.toLowerCase().includes(filterValue));
}
let totalOutstanding = 0;
let totalGlobalQty = 0;
sortedCustomers.forEach(c => {
totalOutstanding += c.credit;
totalGlobalQty += c.quantity;
});
const customers = sortedCustomers;
const totalItems = sortedCustomers.length;
if (!customers || !Array.isArray(customers)) {
tbody.innerHTML = `<tr><td class="u-empty-state-danger" colspan="5" >Invalid customer data</td></tr>`;
} else if (customers.length === 0) {
tbody.innerHTML = `<tr><td class="u-empty-state-md" colspan="5" >No customers found</td></tr>`;
} else {
function buildCustomerRow(c) {
if (!c || !c.name) return null;
try {
const displayDate = (c.lastSaleDate && !isNaN(c.lastSaleDate)) ? formatDisplayDate(new Date(c.lastSaleDate)) : '-';
let phone = '-';
try {
const contact = salesCustomers.find(ct => ct && ct.name && c && c.name && ct.name.toLowerCase() === c.name.toLowerCase());
const customerSaleData = customerSales.find(s =>
s && s.customerName && c && c.name &&
s.customerName === c.name &&
s.customerPhone
);
phone = contact?.phone || customerSaleData?.customerPhone || '-';
} catch (phoneError) {
console.warn('Customer data operation failed.', _safeErr(phoneError));
}
const creditStyle = c.credit > 0 ? 'color:var(--warning); font-weight:700;' : 'color:var(--accent-emerald); font-weight:700;';
const row = document.createElement('tr');
row.style.borderBottom = '1px solid var(--glass-border)';
const safeName = esc(c.name || 'Unknown');
const safeNameForAttr = (c.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
row.innerHTML = `
<td class="u-table-td">${displayDate}</td>
<td style="padding: 8px 2px; font-size: 0.8rem; color: var(--accent); font-weight: 600; cursor:pointer;" onclick="event.stopPropagation(); openCustomerManagement('${safeNameForAttr}')">${safeName}</td>
<td class="u-table-td">${phoneActionHTML(phone)}</td>
<td style="padding: 8px 2px; text-align: right; font-size: 0.8rem; ${creditStyle}">${fmtAmt(safeValue(c.credit))}</td>`;
return row;
} catch (rowError) {
console.warn('An unexpected error occurred.', _safeErr(rowError));
return null;
}
}
tbody.innerHTML = '';
const _fragC = document.createDocumentFragment();
customers.forEach((c, i) => { const el = buildCustomerRow(c); if (el) _fragC.appendChild(el); });
tbody.appendChild(_fragC);
}
const _setCustH = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setCustH('customer-count', `${totalItems || 0} active`);
_setCustH('customers-total-credit', `${fmtAmt(totalOutstanding)}`);
_setCustH('customers-total-quantity', fmtNum(safeNumber(totalGlobalQty, 0)) + ' kg');
}
export let currentManagingCustomer = null;
export let currentManagingRepCustomer = null;
export async function openCustomerManagement(customerName) {
currentManagingCustomer = customerName;
const _setMCT = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setMCT('manageCustomerTitle', customerName);
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('customer-management-screen');
await renderCustomerTransactions(customerName);
}
export function closeCustomerManagement() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('customer-management-screen');
currentManagingCustomer = null;
setTimeout(async () => {
try {
await sqliteStore.get('sales', []);
await sqliteStore.get('customers', []);
} catch(e) {
showToast('Customer data operation failed.', 'error');
console.warn('closeCustomerManagement SQLite error', _safeErr(e));
}
if (typeof renderCustomersTable === 'function') renderCustomersTable();
}, 100);
}
export async function deleteCurrentCustomer() {
const customerSales = ensureArray(await sqliteStore.get('sales'));
const salesCustomers = ensureArray(await sqliteStore.get('customers'));
if (!currentManagingCustomer) return;
const name = currentManagingCustomer;
const txs = customerSales.filter(s =>
s && s.customerName === name
);
for (const _t of txs) {
const _blk = await getSaleBlockReason(_t.id, 'customer', { ignoreChildren: true });
if (_blk) { window.notifyBlocking(`Cannot delete "${name}": ${_blk}`, 'warning'); return; }
}
let totalDebt = 0;
for (const s of txs.filter(x => x.currentRepProfile === 'admin')) totalDebt = round2(totalDebt + debtDelta(s, debtNeedsGross(s) ? await getSaleTransactionValue(s) : 0));
totalDebt = Math.max(0, totalDebt);
let msg = `Permanently delete customer "${name}"?`;
if (txs.length > 0) {
msg += `\n\n This customer has ${txs.length} transaction record${txs.length !== 1 ? 's' : ''} on file.`;
if (totalDebt > 0) msg += `\n Outstanding debt: ${fmtAmt(totalDebt)}`;
msg += `\n\nAll sales history for this customer will be permanently deleted.`;
}
msg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(msg, { title: 'Delete Customer', confirmText: 'Delete Permanently', danger: true }))) return;
try {
const _custGroup = newGroupId('cust');
const contactIdx = salesCustomers.findIndex(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
if (contactIdx !== -1) {
const contactRecord = stampGroup(salesCustomers[contactIdx], _custGroup);
const contactId = contactRecord.id;
const filteredContacts = salesCustomers.filter((_, i) => i !== contactIdx);
await unifiedDelete('customers', filteredContacts, contactId, { strict: true }, contactRecord);
salesCustomers.splice(contactIdx, 1);
}
const txsToDelete = txs.slice();
const idsToDelete = new Set(txsToDelete.map(t => t.id));
let prunedSales = customerSales.filter(s => !idsToDelete.has(s.id));
for (const tx of txsToDelete) {
prunedSales = prunedSales.filter(s => s.id !== tx.id);
await unifiedDelete('sales', prunedSales, tx.id, { strict: true }, stampGroup(tx, _custGroup));
}
notifyDataChange('sales');
triggerAutoSync();
closeCustomerManagement();
showToast(`Customer "${name}" and all records deleted.`, 'success');
} catch (e) {
window.notifyBlocking('Failed to delete customer. Please try again.', 'error');
}
}
export async function renderCustomerTransactions(name) {
const salesCustomers = ensureArray(await sqliteStore.get('customers'));
const customerSales = ensureArray(await sqliteStore.get('sales'));
const repSales = ensureArray(await sqliteStore.get('rep'));
const paymentTransactions = ensureArray(await sqliteStore.get('transactions'));
const list = document.getElementById('customerManagementHistoryList');
if (!list) return;
let transactions = [];
try {
const dbSales = await sqliteStore.get('sales', []);
if (Array.isArray(dbSales)) {
const recordMap = new Map(dbSales.map(s => [s.id, s]));
if (Array.isArray(customerSales)) {
customerSales.forEach(s => {
if (!recordMap.has(s.id)) {
recordMap.set(s.id, s);
}
});
}
const normalizedSales = Array.from(recordMap.values()).map(s => {
if (s && !s.currentRepProfile && (!s.salesRep || s.salesRep === 'NONE' || s.salesRep === 'ADMIN')) {
return { ...s, currentRepProfile: 'admin' };
}
return s;
});
transactions = normalizedSales.filter(s =>
s && s.currentRepProfile === 'admin' && s.customerName === name
);
} else {
transactions = customerSales.filter(s =>
s && s.currentRepProfile === 'admin' && s.customerName === name
);
}
} catch (error) {
console.error('Customer data operation failed.', _safeErr(error));
showToast('Customer data operation failed.', 'error');
transactions = customerSales.filter(s =>
s && s.currentRepProfile === 'admin' && s.customerName === name
);
}
const _custDelta = async (t) => debtDelta(t, debtNeedsGross(t) ? await getSaleTransactionValue(t) : 0);
const _runBal = new Map();
let _runTotal = 0;
const _ascTx = transactions.map((t, i) => ({ t, i })).sort((a, b) => txChronoCompare(a.t, b.t) || (a.i - b.i));
for (const { t } of _ascTx) {
_runTotal = round2(_runTotal + await _custDelta(t));
_runBal.set(t, _runTotal);
}
const rangeSelect = document.getElementById('customerPdfRange');
const range = rangeSelect ? rangeSelect.value : 'all';
if (range !== 'all') {
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
transactions = transactions.filter(t => {
const _txEff = txEffectiveDate(t);
if (!_txEff) return false;
const transDate = new Date(_txEff + 'T00:00:00');
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
const entity = (Array.isArray(salesCustomers) ? salesCustomers : []).find(e => e && e.name && e.name.toLowerCase() === name.toLowerCase());
const phone = entity?.phone || transactions.find(t => t && t.customerPhone)?.customerPhone || '';
const address = entity?.address || '';
const headerTitle = document.getElementById('manageCustomerTitle');
const _custHeaderPhoto = await getPersonPhoto('cust:' + name.toLowerCase());
const _custAvatarHTML = renderPersonAvatarHTML(_custHeaderPhoto, 42);
const _custSafeName = esc(name).split("'").join("\\'");
headerTitle.innerHTML = `
<div style="display:flex;align-items:center;gap:10px;">
${_custAvatarHTML}
<div style="min-width:0;flex:1;">
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
<span>${esc(name)}</span>
<button class="sidebar-settings-btn" style="width:auto;padding:5px 10px;font-size:0.75rem;color:var(--accent);background:rgba(29,233,182,0.07);border-radius:8px;border:1px solid rgba(29,233,182,0.25);display:inline-flex;align-items:center;gap:5px;" onclick="openCustomerEditModal('${_custSafeName}')" title="Edit Contact Info"><svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 24.5L24 7L29 12L11.5 29.5L5 31Z" fill="var(--accent)" fill-opacity="0.14" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M20.5 10.5L25.5 15.5" stroke="var(--accent-gold)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M6.5 24.5L11.5 29.5" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path class="ic-sp" d="M31 3Q31 6 34 6Q31 6 31 9Q31 6 28 6Q31 6 31 3Z" fill="var(--accent-gold)"/></svg>Edit</button>
</div>
<div style="font-size:0.75rem;color:var(--text-muted);font-weight:normal;margin-top:2px;">
${phone ? phoneActionHTML(phone) : 'No Phone'} ${address ? `|  ${esc(address)}` : ''}
</div>
</div>
</div>
`;
let currentDebt = _runTotal;
currentDebt = Math.max(0, currentDebt);
const _mcStats = document.getElementById('manageCustomerStats'); if (_mcStats) _mcStats.innerText = `Current Debt: ${await formatCurrency(currentDebt)}`;
transactions.sort((a, b) => txChronoCompare(b, a));
if (transactions.length === 0) {
list.replaceChildren(Object.assign(document.createElement('div'), {className:'u-empty-state-sm',textContent:'No history found'}));
return;
}
const _custFrag = document.createDocumentFragment();
for (const t of transactions) {
const isCredit = t.paymentType === 'CREDIT';
const isPartialPayment = t.paymentType === 'PARTIAL_PAYMENT';
const isCollection = t.paymentType === 'COLLECTION';
const item = document.createElement('div');
item.className = `cust-history-item${t.isSettled ? ' is-settled-record' : ''}`;
let statusClass = t.creditReceived ? 'paid' : 'pending';
let btnText = t.creditReceived ? 'PAID' : 'PENDING';
let toggleBtnHtml = '';
const partialPaid = t.partialPaymentReceived || 0;
const _txValue = await getSaleTransactionValue(t);
const effectiveDue = (t.isMerged && typeof t.creditValue === 'number') ? t.creditValue : (_txValue - partialPaid);
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
toggleBtnHtml = `<span class="status-toggle-btn ${statusClass}" style="pointer-events:none;cursor:default;">${btnText}</span>`;
} else if (isPartialPayment) {
toggleBtnHtml = `<span class="status-toggle-btn txn-warning">PARTIAL PAYMENT</span>`;
} else if (isCollection) {
toggleBtnHtml = `<span class="status-toggle-btn txn-collect">COLLECTION</span>`;
} else {
toggleBtnHtml = `<span class="status-toggle-btn txn-cash">CASH SALE</span>`;
}
const editBtnHtml = (t.isMerged || t.transactionType === 'OLD_DEBT') ? '' : `<button class="btn btn-sm u-p-4-8" style="color:var(--accent);border:1px solid var(--accent);background:transparent;" onclick="startEdit('sale','${esc(t.id)}')">✎</button>`;
const deleteBtnHtml = t.isMerged ? '' : `${editBtnHtml}<button class="btn btn-sm btn-danger u-p-4-8" onclick="deleteTransactionFromOverlay('${esc(t.id)}')">⌫</button>`;
const safeId = String(t.id).replace(/'/g, "\\'");
const panelId = `cp-${t.id}`;
const kebabBtn = t.isMerged
  ? `<button class="txn-kebab-btn" title="View pre-close details" onclick="_togglePreclosePanel(this,'${panelId}','${safeId}','sales','sale')">⋮</button>`
  : '';
const panelPlaceholder = t.isMerged ? `<div class="txn-preclose-panel" id="${panelId}"></div>` : '';
let itemContent = '';
if (isPartialPayment || isCollection) {
itemContent = `
<div class="txn-card-row">
  <div class="cust-history-info">
    <div class="u-fs-sm2 u-text-muted">${formatDisplayDateTime(t.date || txEffectiveDate(t), t.time || null)}${_mergedBadgeHtml(t, {inline:true})}${(typeof _creatorBadgeHtml === 'function') ? _creatorBadgeHtml(t) : ''}</div>
    ${(t.supplyDate && t.supplyDate !== t.date) ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;font-style:italic;">Supply Date: ${formatDisplayDate(t.supplyDate)}</div>` : ''}
    <div style="font-size:0.75rem;color:var(--accent-emerald);">Payment: ${await formatCurrency(collectionCollected(t))}</div>
    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${isPartialPayment ? 'Partial Payment' : 'Bulk Payment'}${(t.allocations && t.allocations.length) ? ` · applied to ${t.allocations.length} sale${t.allocations.length === 1 ? '' : 's'}` : ''}</div>
  </div>
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
    ${toggleBtnHtml}${deleteBtnHtml}${kebabBtn}
  </div>
</div>${panelPlaceholder}`;
} else if (isOldDebt) {
itemContent = `
<div class="txn-card-row">
  <div class="cust-history-info">
    <div class="u-fs-sm2 u-text-muted">
      ${formatDisplayDateTime(t.date || txEffectiveDate(t), t.time || null)}
      <span class="old-debt-badge">OLD DEBT</span>${_mergedBadgeHtml(t, {inline:true})}${(typeof _creatorBadgeHtml === 'function') ? _creatorBadgeHtml(t) : ''}
    </div>
    ${(t.supplyDate && t.supplyDate !== t.date) ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;font-style:italic;">Supply Date: ${formatDisplayDate(t.supplyDate)}</div>` : ''}
    <div style="font-size:0.75rem;color:var(--warning);">Previous Balance: ${await formatCurrency(t.totalValue)}</div>
    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${esc(t.notes || 'Brought forward from previous records')}</div>
  </div>
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
    ${toggleBtnHtml}${deleteBtnHtml}${kebabBtn}
  </div>
</div>${panelPlaceholder}`;
} else {
const _displayUnitPrice = lockedUnitPrice(t) > 0
  ? lockedUnitPrice(t)
  : await getEffectiveSalePriceForCustomer(t.customerName, t.supplyStore || getDefaultStoreKey());
itemContent = `
<div class="txn-card-row">
  <div class="cust-history-info">
    <div class="u-fs-sm2 u-text-muted">${formatDisplayDateTime(t.date || txEffectiveDate(t), t.time || null)}${_mergedBadgeHtml(t, {inline:true})}${(typeof _creatorBadgeHtml === 'function') ? _creatorBadgeHtml(t) : ''}</div>
    ${(t.supplyDate && t.supplyDate !== t.date) ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;font-style:italic;">Supply Date: ${formatDisplayDate(t.supplyDate)}</div>` : ''}
    <div class="u-fs-sm2 u-text-muted">${fmtNum(t.quantity)} kg @ ${await formatCurrency(_displayUnitPrice)} = ${await formatCurrency(_txValue)}</div>
    ${hasPartialPayment ? `<div style="font-size:0.7rem;color:var(--accent-emerald);margin-top:2px;">Paid: ${await formatCurrency(partialPaid)} | Due: ${await formatCurrency(Math.max(0, _txValue - partialPaid))}</div>` : ''}
    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${(t.isRepTransfer || (t.isTransfer && t.transferFrom)) ? `⇄ Stock transfer from ${esc(t.repTransferFrom || t.transferFrom || '')}` : 'Supply: ' + esc(getStoreLabel(t.supplyStore) || 'Unknown store')}</div>
  </div>
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
    ${toggleBtnHtml}${deleteBtnHtml}${kebabBtn}
  </div>
</div>${panelPlaceholder}`;
}
const _bal = _runBal.get(t) || 0;
const _balText = _bal < -0.005 ? `${await formatCurrency(-_bal)} CR` : await formatCurrency(Math.max(0, _bal));
item.innerHTML = itemContent + balanceAfterHtml(_balText, _bal > 0.005 ? 'debt' : 'clear');
item.style.flexDirection = 'column';
item.style.alignItems = 'stretch';
_custFrag.appendChild(item);
}
list.replaceChildren(_custFrag);
}
export async function toggleSingleTransactionStatus(id) {
const customerSales = ensureArray(await sqliteStore.get('sales'));
const record = customerSales.find(s => s.id === id);
if (record?.isMerged) {
window.notifyBlocking('Opening balance records cannot be toggled. Use Bulk Payment to settle.', 'warning');
return;
}
const _tgBlock = await getSettleToggleBlockReason(id, 'customer');
if (_tgBlock) { window.notifyBlocking(_tgBlock, 'warning'); return; }
const snapshot = [...customerSales];
try {
const idx = customerSales.findIndex(s => s.id === id);
if (idx !== -1) {
applySettlement(customerSales[idx], planCreditToggle(customerSales[idx], localDateStr(), new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })));
customerSales[idx].updatedAt = getTimestamp();
customerSales[idx] = ensureRecordIntegrity(customerSales[idx], true);
await unifiedSave('sales', customerSales, customerSales[idx]);
notifyDataChange('sales');
triggerAutoSync();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
renderCustomerTransactions(currentManagingCustomer);
refreshAllCalculations();
}
} catch (e) {
customerSales.length = 0; customerSales.push(...snapshot);
await sqliteStore.set('sales', customerSales).catch(() => {});
showToast('Failed to update transaction status. Please try again.', 'error');
}
}
export async function toggleRepTransactionStatus(id) {
const repSales = ensureArray(await sqliteStore.get('rep'));
const record = repSales.find(s => s.id === id);
if (record?.isMerged) {
window.notifyBlocking('Opening balance records cannot be toggled. Use Bulk Payment to settle.', 'warning');
return;
}
const _tgBlock = await getSettleToggleBlockReason(id, 'rep');
if (_tgBlock) { window.notifyBlocking(_tgBlock, 'warning'); return; }
const snapshot = [...repSales];
try {
const idx = repSales.findIndex(s => s.id === id);
if (idx !== -1) {
applySettlement(repSales[idx], planCreditToggle(repSales[idx], localDateStr(), new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })));
repSales[idx].updatedAt = getTimestamp();
repSales[idx] = ensureRecordIntegrity(repSales[idx], true);
await unifiedSave('rep', repSales, repSales[idx]);
notifyDataChange('rep');
triggerAutoSync();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
renderRepCustomerTransactions(currentManagingRepCustomer);
refreshAllCalculations();
}
} catch (e) {
repSales.length = 0; repSales.push(...snapshot);
await sqliteStore.set('rep', repSales).catch(() => {});
showToast('Failed to update transaction status. Please try again.', 'error');
}
}
export async function deleteTransactionFromOverlay(id) {
const customerSales = ensureArray(await sqliteStore.get('sales'));
const paymentTransactions = ensureArray(await sqliteStore.get('transactions'));
if (!id || !validateUUID(id)) {
window.notifyBlocking('Invalid transaction ID', 'error');
return;
}
const _txItem = customerSales.find(s => s.id === id);
if (_txItem?.isMerged) {
window.notifyBlocking('Merged opening balance records cannot be deleted', 'warning');
return;
}
{
const _blk = await getSaleBlockReason(id, 'customer');
if (_blk) { window.notifyBlocking(_blk, 'warning'); return; }
}
const _isOldDebt = _txItem?.transactionType === 'OLD_DEBT';
const _txType = _isOldDebt ? 'Old Debt Record' : _txItem ? (_txItem.paymentType === 'CREDIT' ? 'Credit Sale' : _txItem.paymentType === 'PARTIAL_PAYMENT' ? 'Partial Payment' : _txItem.paymentType === 'COLLECTION' ? 'Collection' : 'Cash Sale') : 'Transaction';
const _txDate = _txItem ? (_txItem.date || 'Unknown date') : '';
const _txQty = _txItem ? ((_txItem.quantity || 0) > 0 ? `${_txItem.quantity} kg` : '') : '';
const _txAmt = _txItem ? ((_txItem.totalValue || 0) > 0 ? ` — ${fmtAmt(_txItem.totalValue||0)}` : '') : '';
const _txCust = _txItem ? (_txItem.customerName || '') : '';
const _txStore = _txItem?.supplyStore && !_txItem.isRepTransfer ? getStoreLabel(_txItem.supplyStore) : '';
const _partialPaid = _txItem?.partialPaymentReceived || 0;
let _txMsg, _txTitle;
if (_isOldDebt) {
_txTitle = '\u26a0 Delete Old Debt Record';
_txMsg = `Permanently delete an OLD DEBT record for ${_txCust || 'this customer'}.`;
_txMsg += `\nBalance: ${fmtAmt(_txItem.totalValue||0)}`;
if (_txDate) _txMsg += `\nRecorded: ${_txDate}`;
if (_txItem?.notes) _txMsg += `\nNote: ${_txItem.notes}`;
_txMsg += `\n\n\u26a0 Warning: This will remove the carried-forward balance from the customer's history permanently.`;
} else if (_txItem?.paymentType === 'COLLECTION') {
_txTitle = 'Delete Bulk Collection';
_txMsg = `Delete this bulk collection payment from ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
_txMsg += `\nAmount Collected: ${fmtAmt(collectionCollected(_txItem))}`;
_txMsg += `\n\n\u21a9 This collection will be reversed and the customer's outstanding balance restored${(_txItem.allocations||[]).length ? '; the sales it paid become unpaid again' : ''}.`;
} else if (_txItem?.paymentType === 'PARTIAL_PAYMENT') {
_txTitle = 'Delete Partial Payment';
_txMsg = `Delete this partial payment from ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
_txMsg += `\nPayment Amount: ${fmtAmt(_txItem.totalValue||0)}`;
_txMsg += `\n\n\u21a9 This will reverse the partial payment and restore the full pending credit balance.`;
} else if (_txItem?.paymentType === 'CREDIT') {
_txTitle = 'Delete Credit Sale';
_txMsg = `Delete this credit sale for ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
if (_txQty) _txMsg += `\nQty: ${_txQty}${_txAmt}`;
if (_txStore) _txMsg += `\nStore: ${_txStore}`;
if (_partialPaid > 0) _txMsg += `\n\n\u26a0 ${fmtAmt(_partialPaid)} partially collected. Deleting will erase both the sale and partial payment.`;
else if (_txItem?.creditReceived) _txMsg += `\n\n\u26a0 This sale is already marked PAID. Deleting will remove the payment record.`;
else _txMsg += `\n\n\u26a0 This credit sale is UNPAID. Deleting removes the outstanding balance.`;
} else {
_txTitle = 'Delete Cash Sale';
_txMsg = `Delete this cash sale for ${_txCust || 'customer'}?`;
if (_txDate) _txMsg += `\nDate: ${_txDate}`;
if (_txQty) _txMsg += `\nQty: ${_txQty}${_txAmt}`;
if (_txStore) _txMsg += `\nStore: ${_txStore}`;
_txMsg += `\n\n\u21a9 ${fmtNum(_txItem?.quantity||0)} kg will be restored to inventory.`;
}
_txMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(_txMsg, { title: _txTitle || `Delete ${_txType}`, confirmText: 'Delete', danger: true }))) return;
try {
const item = customerSales.find(s => s.id === id);
if (!item) { renderCustomerTransactions(currentManagingCustomer); return; }
await detachChildPayment('customer', item, customerSales);
const customerSalesFiltered = customerSales.filter(s => s.id !== id);
await unifiedDelete('sales', customerSalesFiltered, id, { strict: true }, item);
refreshAllCalculations();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof refreshCustomerSales === 'function') await refreshCustomerSales();
renderCustomersTable();
if (currentManagingCustomer) renderCustomerTransactions(currentManagingCustomer);
notifyDataChange('sales');
triggerAutoSync();
showToast(` Transaction deleted successfully.`, 'success');
} catch (e) {
window.notifyBlocking('Failed to delete transaction. Please try again.', 'error');
}
}
export async function deleteRepTransactionFromOverlay(id) {
const repSales = ensureArray(await sqliteStore.get('rep'));
if (!id || !validateUUID(id)) {
window.notifyBlocking('Invalid transaction ID', 'error');
return;
}
const _rItem = repSales.find(s => s.id === id);
if (_rItem?.isMerged) {
window.notifyBlocking('Merged opening balance records cannot be deleted', 'warning');
return;
}
{
const _blk = await getSaleBlockReason(id, 'rep');
if (_blk) { window.notifyBlocking(_blk, 'warning'); return; }
}
const _rIsOldDebt = _rItem?.transactionType === 'OLD_DEBT';
const _rType = _rIsOldDebt ? 'Old Debt Record' : _rItem ? (_rItem.paymentType === 'CREDIT' ? 'Credit Sale' : _rItem.paymentType === 'PARTIAL_PAYMENT' ? 'Partial Payment' : _rItem.paymentType === 'COLLECTION' ? 'Collection' : 'Cash Sale') : 'Transaction';
const _rDate = _rItem ? (_rItem.date || 'Unknown date') : '';
const _rQty = _rItem ? ((_rItem.quantity || 0) > 0 ? `${_rItem.quantity} kg` : '') : '';
const _rAmt = _rItem ? ((_rItem.totalValue || 0) > 0 ? ` — ${fmtAmt(_rItem.totalValue||0)}` : '') : '';
const _rCust = _rItem ? (_rItem.customerName || '') : '';
const _rRep = _rItem?.salesRep || '';
const _rPartialPaid = _rItem?.partialPaymentReceived || 0;
let _rMsg, _rTitle;
if (_rIsOldDebt) {
_rTitle = '\u26a0 Delete Old Debt Record';
_rMsg = `Permanently delete an OLD DEBT record for ${_rCust || 'this customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}.`;
_rMsg += `\nBalance: ${fmtAmt(_rItem.totalValue||0)}`;
if (_rDate) _rMsg += `\nRecorded: ${_rDate}`;
if (_rItem?.notes) _rMsg += `\nNote: ${_rItem.notes}`;
_rMsg += `\n\n\u26a0 Warning: This will remove the carried-forward balance permanently.`;
} else if (_rItem?.paymentType === 'COLLECTION') {
_rTitle = 'Delete Rep Collection';
_rMsg = `Delete this bulk collection from ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
_rMsg += `\nAmount Collected: ${fmtAmt(collectionCollected(_rItem))}`;
_rMsg += `\n\n\u21a9 This collection will be reversed and the customer's outstanding rep balance restored${(_rItem.allocations||[]).length ? '; the sales it paid become unpaid again' : ''}.`;
} else if (_rItem?.paymentType === 'PARTIAL_PAYMENT') {
_rTitle = 'Delete Rep Partial Payment';
_rMsg = `Delete this partial payment from ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
_rMsg += `\nPayment Amount: ${fmtAmt(_rItem.totalValue||0)}`;
_rMsg += `\n\n\u21a9 This will reverse the partial payment and restore the full pending credit balance.`;
} else if (_rItem?.paymentType === 'CREDIT') {
_rTitle = 'Delete Rep Credit Sale';
_rMsg = `Delete this credit sale for ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
if (_rQty) _rMsg += `\nQty: ${_rQty}${_rAmt}`;
if (_rPartialPaid > 0) _rMsg += `\n\n\u26a0 ${fmtAmt(_rPartialPaid)} partially collected. Deleting will erase both the sale and partial payment.`;
else if (_rItem?.creditReceived) _rMsg += `\n\n\u26a0 This rep sale is already marked PAID. Deleting removes the payment record.`;
else _rMsg += `\n\n\u26a0 This rep credit sale is UNPAID. Deleting removes the outstanding balance.`;
} else {
_rTitle = 'Delete Rep Cash Sale';
_rMsg = `Delete this cash sale for ${_rCust || 'customer'}${_rRep ? ` (Rep: ${_rRep})` : ''}?`;
if (_rDate) _rMsg += `\nDate: ${_rDate}`;
if (_rQty) _rMsg += `\nQty: ${_rQty}${_rAmt}`;
_rMsg += `\n\n\u21a9 ${fmtNum(_rItem?.quantity||0)} kg will be restored to inventory.`;
}
_rMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(_rMsg, { title: _rTitle || `Delete ${_rType}`, confirmText: 'Delete', danger: true }))) return;
try {
const item = repSales.find(s => s.id === id);
if (!item) { renderRepCustomerTransactions(currentManagingRepCustomer); return; }
await detachChildPayment('rep', item, repSales);
const repSalesFiltered = repSales.filter(s => s.id !== id);
await unifiedDelete('rep', repSalesFiltered, id, { strict: true }, item);
renderRepCustomerTransactions(currentManagingRepCustomer);
renderRepCustomerTable();
notifyDataChange('rep');
triggerAutoSync();
showToast(` Transaction deleted successfully.`, 'success');
} catch (e) {
window.notifyBlocking('Failed to delete transaction. Please try again.', 'error');
}
}
export function filterCustomerManagementHistory() {
const term = document.getElementById('cust-trans-search').value.toLowerCase();
document.querySelectorAll('#customerManagementHistoryList .cust-history-item').forEach(item => {
item.style.display = item.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
});
}
export function filterRepCustomerManagementHistory() {
const term = document.getElementById('rep-cust-trans-search').value.toLowerCase();
document.querySelectorAll('#repCustomerManagementHistoryList .cust-history-item').forEach(item => {
item.style.display = item.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
});
}
export function refreshAllCalculations() {
calculateCashTracker();
calculateNetCash();
calculatePaymentSummaries();
refreshEntityBalances();
updateUnitsAvailableIndicator();
}
export const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);
export function _ensureToastOnTop() {
  if (document.body.lastElementChild !== toastContainer) {
    document.body.appendChild(toastContainer);
  }
}
export const _toastQueue = [];
export let _toastActive = false;
export function _playNextToast() {
if (_toastActive || _toastQueue.length === 0) return;
_toastActive = true;
const { message, type, duration } = _toastQueue.shift();
const icons = {
success: `<svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="ic-ck-ring" pathLength="100" cx="18" cy="18" r="13.5" fill="var(--success)" fill-opacity="0.15" stroke="var(--success)" stroke-width="1.7"/><path class="ic-ck-tick" pathLength="100" d="M11 18.5L16 23.5 25.3 12.8" stroke="var(--accent-gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path class="ic-sp" d="M30.5 2.9Q30.5 5.5 33.1 5.5Q30.5 5.5 30.5 8.1Q30.5 5.5 27.9 5.5Q30.5 5.5 30.5 2.9Z" fill="var(--accent-gold)"/></svg>`,
warning: `<svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.3 5.6L2.8 29A2 2 0 0 0 4.5 32H31.5A2 2 0 0 0 33.2 29L19.7 5.6A2 2 0 0 0 16.3 5.6Z" fill="var(--warning)" fill-opacity="0.16" stroke="var(--warning)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 13.5V21.2" stroke="var(--warning)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="18" cy="26.2" r="1.6" fill="var(--warning)"/></svg>`,
error: `<svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="13.5" fill="var(--danger)" fill-opacity="0.15" stroke="var(--danger)" stroke-width="1.7"/><path d="M12.7 12.7L23.3 23.3M23.3 12.7L12.7 23.3" stroke="var(--danger)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
info: `<svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="13.5" fill="var(--accent)" fill-opacity="0.15" stroke="var(--accent)" stroke-width="1.7"/><circle cx="18" cy="11.7" r="1.7" fill="var(--accent-gold)"/><path d="M18 16.5V25" stroke="var(--accent-gold)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
};
const msgStr = String(message);
const isLong = msgStr.length > 48;
const toast = document.createElement('div');
toast.className = `liquid-toast toast-${type}`;
toast.innerHTML = `
<div class="toast-inner" style="${isLong ? 'white-space:normal;' : ''}">
<div class="toast-icon-wrap">
<span class="toast-icon-glyph">${icons[type] || ''}</span>
</div>
<div class="toast-text" style="${isLong ? 'white-space:normal;max-width:260px;' : ''}">${esc(msgStr)}</div>
<div class="toast-progress-bar"></div>
</div>
`;
toast.classList.add('pre-show');
_ensureToastOnTop();
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
export function showToast(message, type = 'info', duration = 3000) {
const typeMap = { danger: 'error', warn: 'warning', ok: 'success' };
type = typeMap[type] || (['success','warning','error','info'].includes(type) ? type : 'info');
_toastQueue.push({ message, type, duration });
_playNextToast();
if (typeof window.notifyFromToast === 'function') window.notifyFromToast(message, type);
}
window.showToast = showToast;
if (typeof window._onShowGlassConfirmReady === 'function') {
window._onShowGlassConfirmReady();
}
export async function filterCustomers() {
const customerSales = ensureArray(await sqliteStore.get('sales'));
const salesCustomers = ensureArray(await sqliteStore.get('customers'));
renderCustomersTable();
}
export async function openCustomerEditModal(customerName) {
customerName = customerName || '';
const isAddMode = !customerName;
const titleEl = document.getElementById('cust-edit-screen-title');
const saveBtn = document.getElementById('cust-edit-save-btn');
const nameInput = document.getElementById('edit-cust-name');
const nameHint = document.getElementById('cust-name-hint');
const nameLabel = document.getElementById('cust-name-label');
if (titleEl) titleEl.textContent = isAddMode ? 'Add Customer' : 'Edit Customer';
if (saveBtn) saveBtn.textContent = isAddMode ? 'Add Customer' : 'Update Details';
if (isAddMode) {
nameInput.placeholder = 'Type name to search or add...';
nameInput.oninput = function() {
handleUniversalSearch('edit-cust-name', 'cust-add-search-results', 'customers');
};
if (nameLabel) nameLabel.textContent = 'Customer Name';
if (nameHint) nameHint.textContent = 'Search existing customers or type a new name to add.';
const searchResults = document.getElementById('cust-add-search-results');
if (searchResults) searchResults.classList.add('hidden');
} else {
nameInput.placeholder = 'Customer name';
nameInput.oninput = null;
if (nameLabel) nameLabel.textContent = 'Customer Name';
if (nameHint) nameHint.textContent = 'Editing the name will update all records for this customer';
}
const customerSales = ensureArray(await sqliteStore.get('sales'));
const salesCustomers = ensureArray(await sqliteStore.get('customers'));
nameInput.value = customerName;
nameInput.dataset.originalName = customerName;
if (!customerName) {
document.getElementById('edit-cust-phone').value = '';
document.getElementById('edit-cust-address').value = '';
document.getElementById('edit-cust-old-debit').value = '';
const editPriceInput = document.getElementById('edit-cust-custom-price');
if (editPriceInput) editPriceInput.value = '';
await loadPersonPhotoIntoEditor('cust', '');
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('customer-edit-screen');
return;
}
const contact = salesCustomers.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const saleRecord = customerSales.find(s =>
s && s.customerName === customerName &&
s.customerPhone
);
const existingOldDebtTx = customerSales.find(s =>
s && s.customerName && s.customerName.toLowerCase() === customerName.toLowerCase() &&
s.transactionType === 'OLD_DEBT'
);
const oldDebitValue = existingOldDebtTx ? (existingOldDebtTx.totalValue || 0) : (contact?.oldDebit || 0);
document.getElementById('edit-cust-phone').value = contact?.phone || saleRecord?.customerPhone || '';
document.getElementById('edit-cust-address').value = contact?.address || '';
document.getElementById('edit-cust-old-debit').value = oldDebitValue;
const editPriceInput = document.getElementById('edit-cust-custom-price');
if (editPriceInput) {
editPriceInput.value = (contact?.customSalePrice > 0) ? contact.customSalePrice : '';
}
await loadPersonPhotoIntoEditor('cust', 'cust:' + customerName.toLowerCase());
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('customer-edit-screen');
}
export function closeCustomerEditModal() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('customer-edit-screen');
}
export function saveCustomerDetails(...a) { return confirmGuard('saveCustomerDetails', () => _saveCustomerDetailsRaw(...a), { label: 'Customer', late: true, fields: [['edit-cust-name', 'Name'], ['edit-cust-phone', 'Phone'], ['edit-cust-address', 'Address'], ['edit-cust-old-debit', 'Old Debit'], ['edit-cust-custom-price', 'Custom Price']], isUpdate: () => !!(document.getElementById('edit-cust-name') || {}).dataset.originalName }); }
async function _saveCustomerDetailsRaw() {
const customerSales = ensureArray(await sqliteStore.get('sales'));
const salesCustomers = ensureArray(await sqliteStore.get('customers'));
const nameInput = document.getElementById('edit-cust-name');
const name = nameInput.value.trim();
const originalName = nameInput.dataset.originalName || name;
const phone = document.getElementById('edit-cust-phone').value.trim();
const address = document.getElementById('edit-cust-address').value.trim();
const oldDebit = parseFloat(document.getElementById('edit-cust-old-debit').value) || 0;
const customSalePrice = parseFloat(document.getElementById('edit-cust-custom-price').value) || 0;
if (!name) { window.notifyBlocking('Customer name is required', 'error'); return; }
if (oldDebit < 0) { window.notifyBlocking('Old debt balance cannot be negative. Enter 0 to clear the balance.', 'warning'); return; }
if (customSalePrice < 0) { window.notifyBlocking('Custom sale price cannot be negative.', 'warning'); return; }
if (oldDebit > 0) {
const _pcSales = ensureArray(await sqliteStore.get('sales'));
const _pcTx = _pcSales.find(s => s && s.transactionType === 'OLD_DEBT' && s.customerName && (s.customerName === name || s.customerName.toLowerCase() === originalName.toLowerCase()));
if (_pcTx && _pcTx.totalValue !== oldDebit) {
const _pcChk = await getOldDebtChangeIssue(_pcTx, oldDebit);
if (_pcChk.issue) { window.notifyBlocking(_pcChk.issue, 'warning'); return; }
}
}
if (!(await window.gcCommit({}))) return;
try {
const nameChanged = name.toLowerCase() !== originalName.toLowerCase();
const freshContacts = await sqliteStore.get('customers', []);
if (Array.isArray(freshContacts)) {
const m = new Map(freshContacts.map(c => [c.id, c]));
if (Array.isArray(salesCustomers)) salesCustomers.forEach(c => { if (!m.has(c.id)) m.set(c.id, c); });
const refreshedSC = Array.from(m.values());
await sqliteStore.set('customers', refreshedSC);
}
let contact = salesCustomers.find(c => c && c.name && c.name.toLowerCase() === originalName.toLowerCase());
if (!contact) contact = salesCustomers.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
const previousOldDebit = contact?.oldDebit || 0;
if (contact) {
if (!validateUUID(String(contact.id || ''))) { contact.id = generateUUID('cust'); }
contact.name = name; contact.phone = phone; contact.address = address; contact.oldDebit = oldDebit; contact.customSalePrice = customSalePrice; contact.updatedAt = getTimestamp();
ensureRecordIntegrity(contact, true);
} else {
contact = { id: generateUUID('cust'), name, phone, address, oldDebit, customSalePrice,
createdAt: getTimestamp(), updatedAt: getTimestamp(), timestamp: getTimestamp() };
salesCustomers.push(contact);
}
await unifiedSave('customers', salesCustomers, contact);
notifyDataChange('sales');
let salesArray = await sqliteStore.get('sales', []);
if (!Array.isArray(salesArray)) salesArray = [];
if (Array.isArray(customerSales) && customerSales.length > 0) {
const mSales = new Map(salesArray.map(s => [s.id, s]));
customerSales.forEach(s => { if (s && s.id && !mSales.has(s.id)) mSales.set(s.id, s); });
salesArray = Array.from(mSales.values());
}
const renamedRecords = [];
if (nameChanged) {
await recordCustomerRename('sales', originalName, name);
salesArray.forEach(s => {
if (s && s.customerName && s.customerName.toLowerCase() === originalName.toLowerCase()) {
s.customerName = name;
renamedRecords.push(s);
}
});
}
const oldDebtIdx = salesArray.findIndex(s =>
s && s.customerName === name &&
s.transactionType === 'OLD_DEBT'
);
let oldDebtModified = false, oldDebtRecord = null, deletedOldDebtId = null;
if (oldDebit > 0) {
if (oldDebtIdx !== -1) {
const tx = salesArray[oldDebtIdx];
if (!validateUUID(String(tx.id || ''))) { tx.id = generateUUID('old_debt'); }
const amountChanged = tx.totalValue !== oldDebit;
let _odCollected = 0;
if (amountChanged) {
const _odChk = await getOldDebtChangeIssue(tx, oldDebit);
if (_odChk.issue) { window.notifyBlocking(_odChk.issue, 'warning'); return; }
_odCollected = _odChk.collected;
}
tx.totalValue = oldDebit; tx.customerPhone = phone; tx.timestamp = getTimestamp();
tx.updatedAt = getTimestamp();
tx.currentRepProfile = 'admin';
if (amountChanged) { tx.partialPaymentReceived = _odCollected; tx.creditReceived = _odCollected >= oldDebit && oldDebit > 0; }
if (!tx.time) tx.time = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
ensureRecordIntegrity(tx, true);
oldDebtModified = true; oldDebtRecord = tx;
} else {
const tx = { id: generateUUID('old_debt'), date: localDateStr(),
customerName: name, customerPhone: phone, salesRep: 'ADMIN', quantity: 0,
supplyStore: 'N/A', paymentType: 'CREDIT', transactionType: 'OLD_DEBT',
currentRepProfile: 'admin',
totalValue: oldDebit, creditReceived: false, partialPaymentReceived: 0,
time: new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}),
timestamp: getTimestamp(), createdAt: getTimestamp(), updatedAt: getTimestamp(),
notes: 'Previous balance brought forward' };
salesArray.push(tx); oldDebtModified = true; oldDebtRecord = tx;
}
} else if (oldDebit === 0 && oldDebtIdx !== -1) {
const _oldDebtRecordForDeletion = salesArray[oldDebtIdx];
deletedOldDebtId = _oldDebtRecordForDeletion.id;
salesArray.splice(oldDebtIdx, 1); oldDebtModified = true;
if (deletedOldDebtId) { window._oldDebtRecordForDeletion = _oldDebtRecordForDeletion; }
}
let phoneUpdated = false;
salesArray.forEach(s => { if (s && s.customerName === name && s.customerPhone !== phone) { s.customerPhone = phone; phoneUpdated = true; } });
customerSales.length = 0; customerSales.push(...salesArray);
if (nameChanged || oldDebtModified || phoneUpdated) {
if (deletedOldDebtId) {
const _deletedRecord = window._oldDebtRecordForDeletion || null;
window._oldDebtRecordForDeletion = null;
await unifiedDelete('sales', salesArray, deletedOldDebtId, { strict: true }, _deletedRecord);
} else {
await unifiedSave('sales', salesArray, oldDebtModified && !phoneUpdated && !nameChanged ? oldDebtRecord : null);
}
if (nameChanged && renamedRecords.length > 0) {
await unifiedSave('sales', salesArray, null, renamedRecords.map(r => r.id));
}
}
const message = nameChanged ? `Customer renamed to "${name}" and details updated`
: oldDebit > 0 ? `Customer updated with old debt of ₨${fmtNum(oldDebit)}`
: (oldDebit === 0 && previousOldDebit > 0) ? 'Customer updated and old debt cleared'
: 'Customer details updated successfully';
if (nameChanged) {
const _oldPhoto = await getPersonPhoto('cust:' + originalName.toLowerCase());
if (_oldPhoto) {
const _photos = await sqliteStore.get('person_photos') || {};
_photos['cust:' + name.toLowerCase()] = _oldPhoto;
delete _photos['cust:' + originalName.toLowerCase()];
await sqliteStore.set('person_photos', _photos);
const _dk = (await sqliteStore.get('person_photos_dirty_keys')) || [];
const _newKey = 'cust:' + name.toLowerCase();
const _oldKey = 'cust:' + originalName.toLowerCase();
if (!_dk.includes(_newKey)) _dk.push(_newKey);
if (!_dk.includes(_oldKey)) _dk.push(_oldKey);
await sqliteStore.set('person_photos_dirty_keys', _dk);
await sqliteStore.set('person_photos_timestamp', Date.now());
const _preview = document.getElementById('cust-photo-preview');
if (_preview) _preview.dataset.pendingPhoto = undefined;
} else {
await savePersonPhoto('cust', 'cust:' + name.toLowerCase());
}
} else {
await savePersonPhoto('cust', 'cust:' + name.toLowerCase());
}
showToast(message, 'success');
closeCustomerEditModal();
await new Promise(r => setTimeout(r, 350));
if (nameChanged && currentManagingCustomer && currentManagingCustomer.toLowerCase() === originalName.toLowerCase()) {
currentManagingCustomer = name;
}
const overlay = document.getElementById('customer-management-screen');
if (overlay && overlay.style.display !== 'none') await renderCustomerTransactions(currentManagingCustomer || name);
if (typeof renderCustomersTable === 'function') renderCustomersTable();
notifyDataChange('entities');
triggerAutoSync();
} catch (error) {
window.notifyBlocking('Failed to save customer details. Please try again.', 'error');
}
}
export async function fetchDeviceLocation() {
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
const gpsOptions = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 };
const GPS_ACCURACY_THRESHOLD = 50;
const GPS_MAX_WAIT_MS = 25000;
await new Promise((resolve) => {
let watchId = null;
let best = null;
let settled = false;
const finish = async (position) => {
if (settled) return;
settled = true;
if (watchId !== null) navigator.geolocation.clearWatch(watchId);
const lat = position.coords.latitude;
const lon = position.coords.longitude;
const accuracy = position.coords.accuracy;
const coordsText = `${safeNumber(lat, 0).toFixed(6)}, ${safeNumber(lon, 0).toFixed(6)}`;
statusDiv.textContent = `GPS Accuracy: ±${Math.round(accuracy)}m. Decoding name...`;
try {
const controller = new AbortController();
const apiTimeout = setTimeout(() => controller.abort(), 10000);
const response = await fetch(
`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&extratags=1&namedetails=1`,
{ signal: controller.signal }
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
statusDiv.textContent = ` Location Found: ${localArea || placeName || city}`;
statusDiv.style.color = "var(--accent-emerald)";
if(typeof showToast === 'function') showToast("Address updated successfully", "success");
} else {
throw new Error("Address not found");
}
} catch (error) {
console.error('An unexpected error occurred.', _safeErr(error));
showToast('Address lookup failed: ' + (_safeErr(error).message || 'GPS coordinates saved instead'), 'error');
addressInput.value = `GPS: ${coordsText}`;
statusDiv.textContent = "Address lookup failed. Saved GPS Coordinates.";
statusDiv.style.color = "var(--warning)";
} finally {
if(btn) btn.disabled = false;
resolve();
}
};
watchId = navigator.geolocation.watchPosition(
(position) => {
if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
if (position.coords.accuracy <= GPS_ACCURACY_THRESHOLD) finish(position);
},
(error) => {
if (settled) return;
settled = true;
if (watchId !== null) navigator.geolocation.clearWatch(watchId);
let msg = "Location error.";
switch(error.code) {
case error.PERMISSION_DENIED: msg = " Permission denied. Check Phone Settings."; break;
case error.POSITION_UNAVAILABLE: msg = " Weak GPS signal. Go outside."; break;
case error.TIMEOUT: msg = " GPS timeout. Try again."; break;
}
statusDiv.textContent = msg;
statusDiv.style.color = "var(--danger)";
if(btn) btn.disabled = false;
resolve();
},
gpsOptions
);
setTimeout(() => { if (!settled && best) finish(best); }, GPS_MAX_WAIT_MS);
});
}
window.selectCustomer = selectCustomer;
window.calculateCustomerStatsForDisplay = calculateCustomerStatsForDisplay;
window.renderCustomersTable = renderCustomersTable;
window.currentManagingCustomer = currentManagingCustomer;
window.currentManagingRepCustomer = currentManagingRepCustomer;
window.openCustomerManagement = openCustomerManagement;
window.closeCustomerManagement = closeCustomerManagement;
window.deleteCurrentCustomer = deleteCurrentCustomer;
window.renderCustomerTransactions = renderCustomerTransactions;
window.toggleSingleTransactionStatus = toggleSingleTransactionStatus;
window.toggleRepTransactionStatus = toggleRepTransactionStatus;
window.deleteTransactionFromOverlay = deleteTransactionFromOverlay;
window.deleteRepTransactionFromOverlay = deleteRepTransactionFromOverlay;
window.filterCustomerManagementHistory = filterCustomerManagementHistory;
window.filterRepCustomerManagementHistory = filterRepCustomerManagementHistory;
window.refreshAllCalculations = refreshAllCalculations;
window.toastContainer = toastContainer;
window._ensureToastOnTop = _ensureToastOnTop;
window._toastQueue = _toastQueue;
window._toastActive = _toastActive;
window._playNextToast = _playNextToast;
window.showToast = showToast;
window.showGlassConfirm = showGlassConfirm;
window.filterCustomers = filterCustomers;
window.openCustomerEditModal = openCustomerEditModal;
window.closeCustomerEditModal = closeCustomerEditModal;
window.saveCustomerDetails = saveCustomerDetails;
window.fetchDeviceLocation = fetchDeviceLocation;
export function _set_currentManagingRepCustomer(v) { currentManagingRepCustomer = v; }
