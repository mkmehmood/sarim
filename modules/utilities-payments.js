import { dataUid } from './data-owner.js';
import { txDeviceDate } from './tx-date.js';
import { themeColor, themeVar } from './theme-tokens.js';
import { normalizePref, resolveTheme, prefLabel, readStoredPref, writeStoredPref } from './theme-pref.js';
import { isMoneyRestricted, isRecycleRecordAllowed, recycleAmountText, recycleFilters, redactMoney } from './money-privacy.js';
import { sxSplit, sxMargin, sxTile, sxGrid, sxHero } from './summary-kit.js';
import { getSaleBlockReason, getTransferDeleteBlockReason, getExpiredDeleteBlockReason, getRecoverBlockReason, getPendingAllocationCount, detachChildPayment, getRecoverLinkBlockReason, getSettleToggleBlockReason, getLiveRecoveryRefs, cascadeEntityRename, applyRecoveryLinks, resolveSnapshotLinks, applyRenameOnRecovery, findLiveSameNameRecord, getExpenseLinkedTxBlockReason } from './link-guards.js';
import { smCalcHtml, smBarHtml, smExpensesHtml } from './summary-card.js';
import { expenseItemsOfRecord, commissionItemsOfRecord, mergeExpenseItems, sortedExpenseEntries } from './field-expense-items.js';
import { hcCard, hcCardHtml, hcChip, hcEmptyHtml, hcExpensesHtml } from './history-card.js';
import { editDateValue } from './edit-date.js';
import { deleteProdPhotos } from './prod-photos.js';
import { runExclusive, planSkipReattach, hasLiveSupplierInvoice, expandRecoveryMembers, planGroupRecovery, planCreditToggle, applySettlement, newGroupId, stampGroup, findGroupMembers, isOrphanSupplierTx, orderForRestore, expandGroups, GROUP_FIELD, DELETE_ORIGIN_FIELD, planSupplierCreditConsumption, getTxLinkIssue } from './link-graph.js';
import { BRAND_LOGO_JPEG_BASE64 } from './constants.js';
import { rlRowHtml, rlEmptyHtml, rlJsArg, rlPhoto } from './record-list.js';
import { actionRowHtml, beginEditMode, confirmEditChanges, endEditMode, getEditCtx, registerEditHandler, replaceRecord, stampEdit } from './edit-mode.js';
import { allocatePaymentToMaterials, round2, _checkFirebaseSessionExists, _creatorBadgeHtml, _extractDeviceFirstLoginTime, _mergedBadgeHtml, _safeErr, _set_appMode, _set_currentRepProfile, _set_isSyncing, _set_salesRepsList, _set_userRolesList, _triggerFileDownload, appMode, CryptoEngine, currentRepProfile, currentUser, deriveDeviceShard, ensureArray, ensureRecordIntegrity, esc, firebaseDB, fmtAmt, fmtNum, generateUUID, getDeviceId, getDeviceName, getTimestamp, initializeDeviceListeners, loadAllData, localDateStr, registerDevice, safeNumber, salesRepsList, scheduleAutomaticCleanup, SQLiteCrypto, sqliteStore, userRolesList, validateUUID, customerHistoryMatcher, formatTime12, repairStoredRecords, loadCollections } from './business.js';
import { createAuthOverlay, emitSyncUpdate, getSQLiteKey, initFirebase, initializeCompleteFirestoreDatabase, initializeFirebaseSystem, isCompleteDatabaseInitialized, isConnectionStale, isReconnecting, listenerReconnectTimer, loadAccountsList, performOneClickSync, safeInitializeCompleteDatabase, sanitizeForFirestore, scheduleListenerReconnect, showAuthOverlay, signOut, unifiedDelete, unifiedSave, updateSyncButton } from './sync.js';
import { OfflineQueue, _reconcileSupplierLinkAfterRecovery, _reconcileSupplierLinksForDeletedTransactions, _refreshSupplierLinkViews, PDF_MERGED_HDR_COLOR, PDF_MERGED_ROW_COLOR, SarimChart, _applyExpensePendingPhoto, _captureRecordSnapshot, _compressPhoto, _pdfDrawMergedSectionHeader, _pdfMergedCountLabel, _pdfMergedPeriodLabel, _setCloudConnectionState, _set_salesCompChart, _set_salesPerfChart, clearPersonPhoto, currentEntityId, defaultSettings, initSplashScreen, invalidateAllCaches, loadPersonPhotoIntoEditor, loadScript, notifyDataChange, openEntityDetailsOverlay, openPhotoCapture, registerDeletion, renderEntityOverlayContent, salesCompChart, salesPerfChart, savePersonPhoto, triggerAutoSync, updateOfflineBanner, rangeCutoffDate } from './utilities-core.js';
import { handleReturnQtyInput, handleExpiredQtyInput, _set_currentFactoryDate, _set_currentOverviewMode, calculateCashTracker, calculateNetCash, calculateSales, closeEntityTransactions, currentOverviewMode, getAvailableCashInHand, getStorePool, getStoreLabel, initFactoryTab, loadFirestoreStats, promptVerifiedBackupPassword, refreshCustomerSales, refreshUI, renderEntityTable, revertRepSalesEntries, markAllPendingCreditSalesAsCash, processRepTransfer, setProductionView, showTab, syncSuppliersToEntities, trackFirestoreWrite, updateAllStoresOverview, updateAllTabsWithFactoryCosts, updateCustomerCharts, updateIndChart } from './utilities-sales.js';
import { calculatePaymentSummaries, closeFactoryInventoryModal, editingFactoryInventoryId, getCostPriceForStore, getSalePriceForStore, renderFactoryInventory, syncFactoryProductionStats, unlinkSupplierFromMaterial, updateFactoryInventoryDisplay } from './factory.js';
import { calculateCustomerStatsForDisplay, currentManagingRepCustomer, openCustomerEditModal, refreshAllCalculations, renderCustomersTable, showGlassConfirm, showToast } from './customers.js';
import { calculateRepCustomerStatsForDisplay, checkBiometricLock, openRepCustomerEditModal, syncBiometricButton, refreshRepUI, renderRepCustomerTable, renderRepCustomerTransactions, renderRepHistory } from './rep-sales.js';
import { collectAuxBackupFields } from './link-graph.js';
import { isBinStore, recoverStoreRecord } from './store-recycle.js';
import { confirmGuard } from './confirm-guard.js';
import { toInternationalDigits } from './phone-format.js';
import { formatDayMonthYear, formatDateTime, formatMonthYear } from './date-format.js';
const _cap = (s) => { s = String(s ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); };
export let currentCompMode = 'all';
window.currentCompMode = currentCompMode;
async function pushTeamSettings(label) {
if (!(firebaseDB && currentUser)) return;
try {
const nowMs = Date.now();
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
await userRef.collection('settings').doc('team').set({
reps: salesRepsList,
roles: userRolesList,
updated: nowMs
}, { merge: true });
await sqliteStore.set('team_timestamp', nowMs);
} catch(e) {
console.warn(`Could not sync ${label} to Firestore`, _safeErr(e));
showToast('Saved locally — cloud sync will retry when online.', 'warning', 3500);
}
}

export function _set_currentCompMode(v) { currentCompMode = v; window.currentCompMode = v; }
export let currentSalesSummaryMode = 'day';
window.currentSalesSummaryMode = currentSalesSummaryMode;
export function _set_currentSalesSummaryMode(v) { currentSalesSummaryMode = v; window.currentSalesSummaryMode = v; }
export let currentPerfOverviewMode = 'day';
window.currentPerfOverviewMode = currentPerfOverviewMode;
export function _set_currentPerfOverviewMode(v) { currentPerfOverviewMode = v; window.currentPerfOverviewMode = v; }
export let entityViewMode = 'detailed';
window.entityViewMode = entityViewMode;
export function _set_entityViewMode(v) { entityViewMode = v; window.entityViewMode = v; }
export let editingEntityId;
window.editingEntityId = editingEntityId;
export function _set_editingEntityId(v) { editingEntityId = v; window.editingEntityId = v; }
export let selectedEntityId;
window.selectedEntityId = selectedEntityId;
export function _set_selectedEntityId(v) { selectedEntityId = v; window.selectedEntityId = v; }
export let currentExpenseOverlayName;
window.currentExpenseOverlayName = currentExpenseOverlayName;
export function _set_currentExpenseOverlayName(v) { currentExpenseOverlayName = v; window.currentExpenseOverlayName = v; }

(window.__uiSyncers = window.__uiSyncers || []).push(() => {
  try { const v = window.currentCompMode; if (v !== undefined) currentCompMode = v; } catch (_) {}
  try { const v = window.currentSalesSummaryMode; if (v !== undefined) currentSalesSummaryMode = v; } catch (_) {}
  try { const v = window.currentPerfOverviewMode; if (v !== undefined) currentPerfOverviewMode = v; } catch (_) {}
  try { const v = window.entityViewMode; if (v !== undefined) entityViewMode = v; } catch (_) {}
});

export async function toggleCustomerCreditReceived(id, event) {
const sales = ensureArray(await sqliteStore.get('sales'));
if (event) {
event.preventDefault();
event.stopPropagation();
}
const saleIndex = sales.findIndex(item => item.id === id);
if (saleIndex !== -1) {
const _tgBlock = await getSettleToggleBlockReason(id, 'customer');
if (_tgBlock) { window.notifyBlocking(_tgBlock, 'warning', 'Warning'); return; }
applySettlement(sales[saleIndex], planCreditToggle(sales[saleIndex], localDateStr(), new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })));
if (!sales[saleIndex].currentRepProfile) {
sales[saleIndex].currentRepProfile = 'admin';
}
sales[saleIndex].updatedAt = getTimestamp();
sales[saleIndex] = ensureRecordIntegrity(sales[saleIndex], true);
await unifiedSave('sales', sales, sales[saleIndex]);
refreshCustomerSales();
updateCustomerCharts();
}
}

export async function calculateComparisonData() {
const compMode = currentCompMode;
const _sdEl = document.getElementById('sale-date');
const selectedDate = _sdEl ? _sdEl.value : localDateStr();
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const selectedDay = selectedDateObj.getDate();
let history; history = await sqliteStore.get('calculator', []);
const comp = {};
salesRepsList.forEach(rep => { comp[rep] = {prof:0, rev:0, sold:0, ret:0, exp:0, shared:0, cred:0, cash:0, coll:0, giv:0, cost:0, fieldExp:0, commissionPaid:0}; });
history.forEach(h => {
const hDate = new Date(h.date);
const hYear = hDate.getFullYear();
const hMonth = hDate.getMonth();
const hDay = hDate.getDate();
let includeInComp = false;
if (compMode === 'all') includeInComp = true;
else if (compMode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDay - 6);
if(hDate >= weekStart && hDate <= selectedDateObj) includeInComp = true;
}
else if (compMode === 'month' && hYear === selectedYear && hMonth === selectedMonth) includeInComp = true;
else if (compMode === 'year' && hYear === selectedYear) includeInComp = true;
if(includeInComp && comp[h.seller]) {
comp[h.seller].prof += h.profit;
comp[h.seller].rev += h.revenue;
comp[h.seller].cost += (h.totalCost || 0);
comp[h.seller].sold += h.totalSold;
comp[h.seller].ret += h.returned;
comp[h.seller].exp += (h.expired || 0);
comp[h.seller].shared += (h.shared || 0);
comp[h.seller].cred += h.creditQty;
comp[h.seller].cash += h.cashQty;
comp[h.seller].coll += h.prevColl;
comp[h.seller].giv += h.creditValue;
comp[h.seller].fieldExp += (h.fieldExpenses || 0);
comp[h.seller].commissionPaid += (h.commissionPaid || 0);
}
});
return comp;
}

export function createReportHTML(title, data, isHistory = false, id = null, sellerName = null, isHighlight = false, isMerged = false) {
const creditVal = safeValue(data.creditVal);
const collected = safeValue(data.collected);
const balance = creditVal - collected;
const received = safeValue(data.received);
const expected = safeValue(data.expected);
const discrepancy = received - expected;
const balClass = balance > 0 ? 'balance-pos' : 'balance-neg';
let discClass = 'qty-val';
let discText = `${fmtAmt(Math.abs(discrepancy))}`;
if (Math.abs(discrepancy) < 0.01) {
discClass = 'units-available-good';
discText = "Perfect Match";
} else if (discrepancy < 0) {
discClass = 'cost-val';
discText = `SHORT: ${fmtAmt(Math.abs(discrepancy))}`;
} else {
discClass = 'profit-val';
discText = `OVER: ${fmtAmt(discrepancy)}`;
}
const displayStatusText = data.statusText || discText;
const displayStatusClass = data.statusClass || (Math.abs(discrepancy) < 0.01 ? 'result-box callout discrepancy-ok' : 'result-box callout discrepancy-alert');
const badge = sellerName ? `<span class="badge seller-badge ${salesRepsList.indexOf(sellerName) === 0 ? 'noran-badge' : 'noman-badge'}">${sellerName.split(' ')[0]}</span>` : '';
const mergedBadge = isMerged ? _mergedBadgeHtml({ isMerged: true, mergedRecordCount: data.mergedRecordCount, mergedSummary: data.mergedSummary }, {inline:true}) : '';
const highlightClass = isHighlight ? 'highlight-card' : '';
const dateAttr = (isHistory && data._rawDate) ? ` data-date="${data._rawDate}"` : '';
if (!isHistory) {
const _m = sxMargin(data.profit, data.revenue);
const _discTone = Math.abs(discrepancy) < 0.01 ? 'good' : (discrepancy < 0 ? 'bad' : 'warn');
const _discLabel = Math.abs(discrepancy) < 0.01 ? 'Perfect match' : (discrepancy < 0 ? `Short ${fmtAmt(Math.abs(discrepancy))}` : `Over ${fmtAmt(discrepancy)}`);
return `<div class="card sx-card ${isHighlight ? 'sx-card--accent' : ''}"${dateAttr}>
<div class="sx-card-head"><h4 class="sx-card-title">${esc(title)}${mergedBadge}</h4>${badge}</div>
${sxHero('Revenue', fmtAmt(safeValue(data.revenue)), { chip: _m == null ? '' : `${_m}% margin`, chipTone: (_m || 0) >= 0 ? 'good' : 'bad', sub: `Profit ${fmtAmt(safeValue(data.profit))}` })}
${sxSplit([{ label: 'Cash', value: safeValue(data.cash), tone: 'good' }, { label: 'Credit', value: safeValue(data.cred), tone: 'warn' }], (v) => `${fmtNum(v)} kg`)}
${sxGrid(
  sxTile('Total sold', `${fmtNum(safeValue(data.sold))} kg`, 'info') +
  sxTile('Returned', `${fmtNum(safeValue(data.ret))} kg`, 'warn', { sub: data.returnRep && safeValue(data.ret) > 0 ? `to ${data.returnRep}` : '' }) +
  (safeValue(data.expired) > 0 ? sxTile('Expired (to CHORA)', fmtNum(safeValue(data.expired)), 'bad') : '') +
  (safeValue(data.shared) > 0 ? sxTile('Shared (deduction)', fmtNum(safeValue(data.shared)), 'bad') : '')
)}
<hr class="sx-divider">
<section class="sx-section"><header class="sx-section-head"><h4>Credit</h4></header>
${sxSplit([{ label: 'Out', value: creditVal, tone: 'bad' }, { label: 'Recovered', value: collected, tone: 'good' }], (v) => fmtAmt(v))}
${sxGrid(sxTile('Net debt', fmtAmt(balance), balance > 0 ? 'bad' : 'good', { wide: true }))}
</section>
<hr class="sx-divider">
<section class="sx-section"><header class="sx-section-head"><h4>Cash handover</h4><span class="badge badge-tint sx-chip sx-tone-${_discTone}">${_discLabel}</span></header>
${sxGrid(
  sxTile('Expected', fmtAmt(expected), 'info') +
  sxTile('Received', fmtNum(safeNumber(received, 0)), 'good') +
  (safeValue(data.fieldExp) > 0 ? sxTile('Field expenses', fmtAmt(safeValue(data.fieldExp)), 'bad') : '') +
  (safeValue(data.commissionPaid) > 0 ? sxTile('Commission paid', fmtAmt(safeValue(data.commissionPaid)), 'good') : '')
)}
</section>
${smExpensesHtml(sortedExpenseEntries(data.fieldExpItems), { amt: fmtAmt, safe: safeValue })}
${smExpensesHtml(sortedExpenseEntries(data.commissionItems), { amt: fmtAmt, safe: safeValue }, 'Commission breakdown')}
</div>`;
}
let html = `<div class="card card-rows ${highlightClass}"${dateAttr}>${badge}<h4>${esc(title)}${mergedBadge}</h4>
<p><span>Total Sold:</span> <span class="qty-val">${fmtNum(safeValue(data.sold))}</span></p>
<p><span>Returned:</span> <span class="qty-val">${fmtNum(safeValue(data.ret))}</span></p>
${data.returnRep && safeValue(data.ret) > 0 ? `<p><span>Transferred to:</span> <span class="qty-val">${esc(data.returnRep)}</span></p>` : ''}
${safeValue(data.expired) > 0 ? `<p><span>Expired (→ CHORA):</span> <span class="cost-val">${fmtNum(safeValue(data.expired))}</span></p>` : ''}
${safeValue(data.shared) > 0 ? `<p><span>Shared (Deduction):</span> <span class="cost-val">${fmtNum(safeValue(data.shared))}</span></p>` : ''}
<p><span>Cash Qty:</span> <span class="qty-val">${fmtNum(safeValue(data.cash))}</span></p>
<p><span>Credit Qty:</span> <span class="qty-val">${fmtNum(safeValue(data.cred))}</span></p>
<hr>
<p><span>Revenue:</span> <span class="rev-val">${fmtAmt(safeValue(data.revenue))}</span></p>
<p><span>Profit:</span> <span class="profit-val">${fmtAmt(safeValue(data.profit))}</span></p>
<p><span>Credit Out:</span> <span class="cost-val">${fmtAmt(creditVal)}</span></p>
<p><span>Credit In:</span> <span class="profit-val">${fmtAmt(collected)}</span></p>
<p><span>Net Debt:</span> <span class="${balClass}">${fmtAmt(balance)}</span></p>
<hr>
${safeValue(data.fieldExp) > 0 ? `<p><span>Field Expenses:</span> <span class="cost-val">${fmtAmt(safeValue(data.fieldExp))}</span></p>` : ''}
<p><span>Expected Cash:</span> <span class="qty-val u-786051d">${fmtAmt(expected)}</span></p>
<p><span>Received Cash:</span> <span class="qty-val u-198c640">${fmtNum(safeNumber(received, 0))}</span></p>
<p><span>Discrepancy:</span> <span class="${discClass}">${discText}</span></p>
${safeValue(data.commissionPaid) > 0 ? `<hr>
<p><span>Commission Paid:</span> <span class="profit-val">${fmtAmt(safeValue(data.commissionPaid))}</span></p>` : ''}
`;
if (isHistory) {
html += `
<div class="${displayStatusClass} u-0948237">${displayStatusText}</div>`;
if (!isMerged) {
html += actionRowHtml('calc', id, `<button class="btn btn-danger btn-sm u-w-full u-mt-8" onclick="deleteSalesEntry('${id}')">Delete</button>`);
}
}
html += `</div>`;
return html;
}

export function createHistoryCardHTML(title, data, id = null, sellerName = null, isHighlight = false, isMerged = false) {
const creditVal = safeValue(data.creditVal);
const collected = safeValue(data.collected);
const balance = creditVal - collected;
const received = safeValue(data.received);
const expected = safeValue(data.expected);
const discrepancy = received - expected;
let discText, discCls, tone;
if (Math.abs(discrepancy) < 0.01) { discText = 'Perfect match'; discCls = 'qty-val'; tone = 'good'; }
else if (discrepancy < 0) { discText = `Short ${fmtAmt(Math.abs(discrepancy))}`; discCls = 'cost-val'; tone = 'bad'; }
else { discText = `Over ${fmtAmt(discrepancy)}`; discCls = 'profit-val'; tone = 'good'; }
const statusText = data.statusText || discText;
const mergedBadge = isMerged ? _mergedBadgeHtml({ isMerged: true, mergedRecordCount: data.mergedRecordCount, mergedSummary: data.mergedSummary }, {inline:true}) : '';
const sellerHtml = sellerName ? `<span class="hc-seller">${esc(sellerName)}</span>` : '';
return hcCardHtml({
tone, icon: 'calc', title,
sub: `${sellerHtml}${mergedBadge}`,
amount: fmtAmt(safeValue(data.revenue)), tag: statusText, tagTone: tone,
metrics: [
{ label: 'Total sold', value: fmtNum(safeValue(data.sold)), cls: 'qty-val' },
{ label: 'Profit', value: fmtAmt(safeValue(data.profit)), cls: 'profit-val' },
{ label: 'Expected cash', value: fmtAmt(expected), cls: 'qty-val' },
{ label: 'Received cash', value: fmtNum(safeNumber(received, 0)), cls: 'qty-val' },
{ label: 'Discrepancy', value: discText, cls: discCls, wide: true }
],
sections: [
{ title: 'Quantities', metrics: [
{ label: 'Returned', value: fmtNum(safeValue(data.ret)), cls: 'qty-val' },
{ label: 'Transferred to', value: (data.returnRep && safeValue(data.ret) > 0) ? esc(data.returnRep) : '', cls: 'qty-val' },
{ label: 'Expired (to CHORA)', value: safeValue(data.expired) > 0 ? fmtNum(safeValue(data.expired)) : '', cls: 'cost-val' },
{ label: 'Shared (deduction)', value: safeValue(data.shared) > 0 ? fmtNum(safeValue(data.shared)) : '', cls: 'cost-val' },
{ label: 'Cash qty', value: fmtNum(safeValue(data.cash)), cls: 'qty-val' },
{ label: 'Credit qty', value: fmtNum(safeValue(data.cred)), cls: 'qty-val' }
] },
{ title: 'Credit and cash', metrics: [
{ label: 'Credit out', value: fmtAmt(creditVal), cls: 'cost-val' },
{ label: 'Credit in', value: fmtAmt(collected), cls: 'profit-val' },
{ label: 'Net debt', value: fmtAmt(balance), cls: balance > 0 ? 'balance-pos' : 'balance-neg' },
{ label: 'Field expenses', value: safeValue(data.fieldExp) > 0 ? fmtAmt(safeValue(data.fieldExp)) : '', cls: 'cost-val' },
{ label: 'Commission paid', value: safeValue(data.commissionPaid) > 0 ? fmtAmt(safeValue(data.commissionPaid)) : '', cls: 'profit-val' }
] }
],
body: hcExpensesHtml(sortedExpenseEntries(data.fieldExpItems), fmtAmt) + hcExpensesHtml(sortedExpenseEntries(data.commissionItems), fmtAmt, 'Commission breakdown'),
actions: isMerged ? '' : actionRowHtml('calc', id, `<button class="btn btn-danger btn-sm u-w-full u-mt-8" onclick="deleteSalesEntry('${esc(id)}')">Delete</button>`)
}, { className: isHighlight ? 'highlight-card' : '', attrs: { 'data-date': data._rawDate } });
}

export function _calcSaleDay(sale) {
return txDeviceDate(sale);
}

export async function getPendingRepDeliveries(seller) {
const { calculator, sales } = await loadCollections('calculator', 'sales');
if (!seller || seller === 'COMBINED') return [];
const reconciledSalesIds = new Set();
calculator.forEach(entry => {
  if (Array.isArray(entry.linkedSalesIds)) entry.linkedSalesIds.forEach(id => reconciledSalesIds.add(id));
});
return sales.filter(sale =>
  sale.currentRepProfile === 'admin' &&
  sale.customerName === seller &&
  sale.paymentType === 'CREDIT' &&
  !sale.creditReceived &&
  !reconciledSalesIds.has(sale.id) &&
  sale.transactionType !== 'OLD_DEBT'
);
}

export async function getPendingRepReturns(seller, toDate) {
if (!seller || seller === 'COMBINED') return [];
const { calculator, sales } = await loadCollections('calculator', 'sales');
const used = new Set();
calculator.forEach(entry => {
  if (entry && Array.isArray(entry.linkedRepReturnIds)) entry.linkedRepReturnIds.forEach(id => used.add(id));
});
return sales.filter(r =>
  r && r.isRepReturn === true && !r.deletedAt &&
  r.currentRepProfile === 'admin' &&
  r.customerName === seller &&
  !used.has(r.id) &&
  (!toDate || !txDeviceDate(r) || txDeviceDate(r) <= toDate)
);
}

export async function applyRepReturnsToCalculator(seller, toDate) {
if (getEditCtx('calc')) return;
const retEl = document.getElementById('returnedQuantity');
const expEl = document.getElementById('expiredQuantity');
const hint = document.getElementById('repReturnAutoHint');
if (!retEl || !expEl || !seller || seller === 'COMBINED') return;
const pending = await getPendingRepReturns(seller, toDate);
const totalExp = round2(pending.reduce((t, r) => t + (Number(r.expiredQty) || 0), 0));
const totalRet = round2(pending.reduce((t, r) => t + (Number(r.returnedQty) || 0), 0));
const wasAuto = retEl.dataset.repReturnAuto === '1' || expEl.dataset.repReturnAuto === '1';
if (pending.length === 0) {
  if (wasAuto) {
    retEl.value = ''; expEl.value = '';
    delete retEl.dataset.repReturnAuto; delete expEl.dataset.repReturnAuto;
    clearAutoFilledField(retEl); clearAutoFilledField(expEl);
    window._returnStore = null;
    if (typeof handleReturnQtyInput === 'function') handleReturnQtyInput();
    if (typeof handleExpiredQtyInput === 'function') handleExpiredQtyInput();
  }
  if (hint) { hint.classList.add('hidden'); hint.textContent = ''; }
  return;
}
retEl.value = totalRet > 0 ? totalRet.toFixed(2) : '';
expEl.value = totalExp > 0 ? totalExp.toFixed(2) : '';
retEl.dataset.repReturnAuto = '1';
expEl.dataset.repReturnAuto = '1';
styleAutoFilledField(retEl);
styleAutoFilledField(expEl);
if (typeof handleReturnQtyInput === 'function') handleReturnQtyInput();
if (typeof handleExpiredQtyInput === 'function') handleExpiredQtyInput();
}

export function getCalcDateRange(pending) {
const toEl = document.getElementById('sale-date');
const fromEl = document.getElementById('sale-date-from');
const to = (toEl && toEl.value) || localDateStr();
let from = (fromEl && fromEl.value) || '';
if (!window._calcFromManual || !from) {
  const days = (pending || []).map(_calcSaleDay).filter(d => d && d <= to).sort();
  from = days.length ? days[0] : to;
}
if (from > to) from = to;
return { from, to };
}

export async function getCalcCycleSelection(seller) {
const pending = await getPendingRepDeliveries(seller);
const { from, to } = getCalcDateRange(pending);
const selected = pending.filter(s => { const d = _calcSaleDay(s); return d >= from && d <= to; });
return {
  selected,
  selectedIds: new Set(selected.map(s => s.id)),
  qty: selected.reduce((t, s) => t + (s.quantity || 0), 0),
  from, to
};
}

export async function calculateTotalSoldForRepresentative(seller) {
const sel = await getCalcCycleSelection(seller);
return sel.qty;
}

export const _CALC_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function _calcFmtDay(iso, withYear) {
const p = (iso || '').split('-');
if (p.length !== 3) return '';
return parseInt(p[2], 10) + ' ' + _CALC_MONTHS[parseInt(p[1], 10) - 1] + (withYear ? ' ' + p[0] : '');
}

export function updateCalcRangeLabel() {
const fromEl = document.getElementById('sale-date-from');
const toEl = document.getElementById('sale-date');
const lbl = document.getElementById('calcRangeLabel');
if (!fromEl || !toEl || !lbl) return;
const from = fromEl.value, to = toEl.value;
if (from) toEl.setAttribute('min', from); else toEl.removeAttribute('min');
const seller = (document.getElementById('sellerSelect') || {}).value;
if (!to) { lbl.textContent = 'Select dates'; return; }
if (seller === 'COMBINED' || !from || from === to) { lbl.textContent = _calcFmtDay(to, true); return; }
const sameYear = from.slice(0, 4) === to.slice(0, 4);
lbl.textContent = _calcFmtDay(from, !sameYear) + ' to ' + _calcFmtDay(to, true);
}

export function openCalcRangePicker() {
const seller = (document.getElementById('sellerSelect') || {}).value;
const btn = document.getElementById(seller === 'COMBINED' ? 'sale-date__cdpBtn' : 'sale-date-from__cdpBtn');
if (btn) btn.click();
}

export async function onCalcDateChange(which) {
const fromEl = document.getElementById('sale-date-from');
const toEl = document.getElementById('sale-date');
if (which === 'from') window._calcFromManual = true;
if (fromEl && toEl && fromEl.value && toEl.value && fromEl.value > toEl.value) {
  if (which === 'from') toEl.value = fromEl.value; else fromEl.value = toEl.value;
}
updateCalcRangeLabel();
const seller = (document.getElementById('sellerSelect') || {}).value;
if (which === 'from' && seller !== 'COMBINED') {
  setTimeout(() => {
    const toBtn = document.getElementById('sale-date__cdpBtn');
    if (toBtn) toBtn.click();
  }, 0);
}
await loadSalesData();
setPerfOverviewMode(currentPerfOverviewMode || 'day');
}

export async function autoFillTotalSoldQuantity() {
if (getEditCtx('calc')) return;
const { calculator, rep } = await loadCollections('calculator', 'rep');
if (window._editCtx && window._editCtx.kind === 'calc') return;
const seller = document.getElementById('sellerSelect').value;
const totalSoldField = document.getElementById('totalSold');
const creditSalesField = document.getElementById('creditSales');
const recoveredField = document.getElementById('prevCreditReceived');
const fromEl = document.getElementById('sale-date-from');
if (!totalSoldField) return;
if (window._calcSeller !== seller) {
  window._calcSeller = seller;
  window._calcFromManual = false;
}
if (seller === 'COMBINED') {
totalSoldField.value = '';
totalSoldField.readOnly = true;
updateCalcRangeLabel();
return;
}
const sel = await getCalcCycleSelection(seller);
if (fromEl && fromEl.value !== sel.from) fromEl.value = sel.from;
updateCalcRangeLabel();
totalSoldField.value = safeNumber(sel.qty, 0).toFixed(2);
totalSoldField.readOnly = true;
window.setStyle(totalSoldField, 'background', 'st-background__44812c');
window.setStyle(totalSoldField, 'color', 'st-color__a80552');
window.setStyle(totalSoldField, 'font-weight', 'st-font-weight__bff3d1');
window.setStyle(totalSoldField, 'border', 'st-border__89f1f8');
const usedRepSaleIds = new Set();
if (Array.isArray(calculator)) {
  calculator.forEach(calcEntry => {
    if (calcEntry.linkedRepSalesIds && Array.isArray(calcEntry.linkedRepSalesIds)) {
      calcEntry.linkedRepSalesIds.forEach(id => usedRepSaleIds.add(id));
    }
  });
}
(Array.isArray(rep) ? rep : []).forEach(sale => {
  if (sale.usedInCalcId) usedRepSaleIds.add(sale.id);
});
let creditSalesKg = 0;
let recoveredCash = 0;
(Array.isArray(rep) ? rep : []).forEach(sale => {
  if (sale.salesRep === seller && sale.date >= sel.from && sale.date <= sel.to && !usedRepSaleIds.has(sale.id)) {
    if (sale.paymentType === 'CREDIT') {
      creditSalesKg += (sale.quantity || 0);
    }
    if (sale.paymentType === 'COLLECTION') {
      recoveredCash += (sale.totalValue || 0);
    }
  }
});
if(creditSalesField) {
creditSalesField.value = safeNumber(creditSalesKg, 0).toFixed(2);
styleAutoFilledField(creditSalesField);
}
if(recoveredField) {
recoveredField.value = safeNumber(recoveredCash, 0).toFixed(2);
styleAutoFilledField(recoveredField);
}
await applyRepReturnsToCalculator(seller, sel.to);
calculateSales();
if (typeof renderReturnTargets === 'function') renderReturnTargets();
}

export function clearAutoFilledField(field) {
['background', 'color', 'font-weight', 'border'].forEach((prop) => window.setStyle(field, prop, null));
}
export function styleAutoFilledField(field) {
window.setStyle(field, 'background', 'st-background__ca4057');
window.setStyle(field, 'color', 'st-color__a4c6ac');
window.setStyle(field, 'font-weight', 'st-font-weight__bff3d1');
window.setStyle(field, 'border', 'st-border__43d086');
}

export async function loadSalesData(compMode = 'all') {
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
currentCompMode = compMode; window.currentCompMode = currentCompMode;
['week', 'month', 'year', 'all'].forEach(m => {
const btn = document.getElementById(`comp-${m}-btn`);
if(btn) btn.className = `toggle-opt ${m === compMode ? 'active' : ''}`;
});
const _sellerEl = document.getElementById('sellerSelect');
const _saleDateEl = document.getElementById('sale-date');
if (!_sellerEl || !_saleDateEl) return;
const seller = _sellerEl.value;
const searchDate = _saleDateEl.value;
autoFillTotalSoldQuantity();
const isCombined = seller === "COMBINED";
const label = isCombined ? "Combined" : seller;
const _setSel = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setSel('reportSellerName', label);
_setSel('debtSellerName', label);
_setSel('selectedSellerName', label);
const entrySection = document.getElementById('entrySection'); if (entrySection) entrySection.className = isCombined ? "hidden" : "";
const combinedSection = document.getElementById('combinedSection'); if (combinedSection) combinedSection.className = isCombined ? "" : "hidden";
const indChart = document.getElementById('individualChartSection'); if (indChart) indChart.className = isCombined ? "hidden" : "";
let history = await sqliteStore.get('calculator', []);
if (!Array.isArray(history)) history = [];
let displayList = isCombined ? history : history.filter(h => h.seller === seller);
displayList.sort((a,b) => {
if (a.date === searchDate && b.date !== searchDate) return -1;
if (a.date !== searchDate && b.date === searchDate) return 1;
return b.timestamp - a.timestamp;
});
const ranges = {
d: { sold:0, ret:0, expired:0, shared:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0, fieldExp:0, commissionPaid:0 },
w: { sold:0, ret:0, expired:0, shared:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0, fieldExp:0, commissionPaid:0 },
m: { sold:0, ret:0, expired:0, shared:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0, fieldExp:0, commissionPaid:0 },
y: { sold:0, ret:0, expired:0, shared:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0, fieldExp:0, commissionPaid:0 },
a: { sold:0, ret:0, expired:0, shared:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0, fieldExp:0, commissionPaid:0 }
};
const list = document.getElementById('historyList');
const _hlParts = [];
displayList.forEach(h => {
const isHighlight = h.date === searchDate;
const dateTitle = isHighlight ? `${formatDisplayDateTime(h.date, h.time || null)} (Selected)` : formatDisplayDateTime(h.date, h.time || null);
_hlParts.push(createHistoryCardHTML(
dateTitle,
{
sold: h.totalSold,
ret: h.returned,
returnRep: h.returnRep,
returnStore: h.returnStore,
expired: h.expired,
shared: h.shared,
cash: h.cashQty,
cred: h.creditQty,
revenue: h.revenue,
profit: h.profit,
creditVal: h.creditValue,
collected: h.prevColl,
expected: h.totalExpected,
received: h.received,
fieldExp: h.fieldExpenses,
fieldExpItems: expenseItemsOfRecord(h),
commissionPaid: h.commissionPaid,
commissionItems: commissionItemsOfRecord(h),
statusClass: h.statusClass,
statusText: h.statusText,
_rawDate: h.date
},
h.id, (h.seller && h.seller !== 'COMBINED') ? h.seller : null, isHighlight, h.isMerged
));
});
if (list) list.innerHTML = _hlParts.length ? _hlParts.join('') : hcEmptyHtml('No calculator entries found.');
const validSearchDate = searchDate || localDateStr();
const now = new Date(validSearchDate);
if (isNaN(now.getTime())) {
now.setTime(Date.now());
}
const weekStart = new Date(now);
weekStart.setDate(now.getDate() - 6);
let ltCr = 0, ltCl = 0;
const debtFilterList = isCombined ? history : history.filter(h => h.seller === seller);
debtFilterList.forEach(h => {
if (!h.date) return;
const hDate = new Date(h.date);
if (isNaN(hDate.getTime())) {
return;
}
ltCr += (h.creditValue || 0);
ltCl += (h.prevColl || 0);
if(h.date === searchDate) addToRange(ranges.d, h);
if(hDate >= weekStart && hDate <= now) addToRange(ranges.w, h);
if(hDate.getMonth() === now.getMonth() && hDate.getFullYear() === now.getFullYear()) addToRange(ranges.m, h);
if(hDate.getFullYear() === now.getFullYear()) addToRange(ranges.y, h);
addToRange(ranges.a, h);
});
const _dr = document.getElementById('dailyReport'); if (_dr) _dr.innerHTML = createReportHTML("Daily View", ranges.d);
const _wr = document.getElementById('weeklyReport'); if (_wr) _wr.innerHTML = createReportHTML("Weekly View", ranges.w);
const _mr = document.getElementById('monthlyReport'); if (_mr) _mr.innerHTML = createReportHTML("Monthly View", ranges.m);
const _yr = document.getElementById('yearlyReport'); if (_yr) _yr.innerHTML = createReportHTML("Yearly View", ranges.y);
const _ar = document.getElementById('allTimeReport'); if (_ar) _ar.innerHTML = createReportHTML("All Time Summary", ranges.a);
if (typeof setPerfOverviewMode === 'function') setPerfOverviewMode(currentPerfOverviewMode || 'day');
const _saleDate = (document.getElementById('sale-date') || {}).value || localDateStr();
_filterHistoryByPeriod('#historyList', _saleDate, currentPerfOverviewMode || 'day');
const _setLt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setLt('ltCredit', "" + fmtNum(safeValue(ltCr)));
_setLt('ltCollected', "" + fmtNum(safeValue(ltCl)));
_setLt('ltBalance', "" + fmtNum(safeValue(ltCr - ltCl)));
const _rb = document.getElementById('ltRecovery');
if (_rb) _rb.innerHTML = sxSplit([{ label: 'Recovered', value: ltCl, tone: 'good' }, { label: 'Outstanding', value: Math.max(0, ltCr - ltCl), tone: 'bad' }], (v) => fmtNum(safeValue(v)));
if(isCombined) {
const comp = await calculateComparisonData();
updateSalesCharts(comp);
const repNames = salesRepsList;
const bestProfit = Math.max(...repNames.map(r => (comp[r]||{prof:0}).prof));
const compHead = document.getElementById('comparisonHead');
if (compHead) {
compHead.innerHTML = '<tr><th>Metric</th>' +
repNames.map(r => {
const isWinner = (comp[r]||{prof:0}).prof >= bestProfit && bestProfit > 0;
const firstName = r.split(' ')[0].charAt(0) + r.split(' ')[0].slice(1).toLowerCase();
return `<th id="th-rep-${r.replace(/\s+/g,'-')}">${firstName}</th>`;
}).join('') +
'</tr>';
}
const metrics = [
{ label: 'Qty Sold', key: 'sold', cls: null },
{ label: 'Returns', key: 'ret', cls: null },
{ label: 'Expired (→ CHORA)', key: 'exp', cls: 'cost-val' },
{ label: 'Shared (Deduction)', key: 'shared', cls: 'cost-val' },
{ label: 'Total Cost', key: 'cost', cls: 'cost-val' },
{ label: 'Gross Revenue', key: 'rev', cls: 'rev-val' },
{ label: 'Net Profit', key: 'prof', cls: 'profit-val', winner: true },
{ label: 'Credit Issued', key: 'giv', cls: null },
{ label: 'Credit Recovered', key: 'coll', cls: null },
{ label: 'Field Expenses', key: 'fieldExp', cls: 'cost-val' },
{ label: 'Commission Paid', key: 'commissionPaid', cls: 'profit-val' },
];
document.getElementById('comparisonBody').innerHTML = metrics.map(m => {
const cells = repNames.map(r => {
const val = fmtAmt(safeValue((comp[r]||{})[m.key]));
const colorCls = m.key === 'cost' ? 'st-color__497726' : m.key === 'coll' ? 'st-color__a80552' : '';
const cls = (m.cls || colorCls) ? ` class="${[m.cls, colorCls].filter(Boolean).join(' ')}"` : '';
return `<td${cls}>${val}</td>`;
}).join('');
const rowCls = m.winner ? ' class="winner-cell"' : '';
return `<tr${rowCls}><td>${m.label}</td>${cells}</tr>`;
}).join('');
} else {
await updateIndChart();
}
}

export function addToRange(range, h) {
range.sold += h.totalSold;
range.ret += h.returned;
range.expired = (range.expired || 0) + (h.expired || 0);
range.shared = (range.shared || 0) + (h.shared || 0);
range.cash += h.cashQty;
range.cred += h.creditQty;
range.creditVal += h.creditValue;
range.collected += h.prevColl;
range.profit += h.profit;
range.revenue += h.revenue;
range.expected += (h.totalExpected || 0);
range.received += (h.received || 0);
range.fieldExp = (range.fieldExp || 0) + (h.fieldExpenses || 0);
range.fieldExpItems = mergeExpenseItems(range.fieldExpItems, expenseItemsOfRecord(h));
range.commissionPaid = (range.commissionPaid || 0) + (h.commissionPaid || 0);
range.commissionItems = mergeExpenseItems(range.commissionItems, commissionItemsOfRecord(h));
}

export function updateSalesCharts(comp) {
if (isMoneyRestricted()) return;
if(!comp) return;
const selectedMetric = document.getElementById('metricSelector').value;
const metricLabel = document.getElementById('metricSelector').options[document.getElementById('metricSelector').selectedIndex].text;
const colors = {
text: themeColor('--text-muted'),
grid: themeColor('--text-main', 10)
};
const perfChartElement = document.getElementById('performanceChart');
if (!perfChartElement) { return; }
const repChartColors = ['--accent-blue', '--success', '--warning', '--accent-purple', '--danger', '--accent-cyan'].map((t) => themeColor(t));
const repNames = salesRepsList;
const chartLabels = repNames.map(r => r.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '));
const chartData = repNames.map(r => (comp[r] || {})[selectedMetric] || 0);
const chartColors = repNames.map((_, i) => repChartColors[i % repChartColors.length]);
if(salesPerfChart) salesPerfChart.destroy();
_set_salesPerfChart(new SarimChart(perfChartElement, {
type: 'bar',
data: {
labels: chartLabels,
datasets: [{
label: metricLabel,
data: chartData,
backgroundColor: chartColors,
borderRadius: 6
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: { legend: { display: false } },
scales: {
y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
x: { ticks: { color: colors.text } }
}
}
}));
const totalCashValue = repNames.reduce((s, r) => s + ((comp[r]||{}).rev||0) - ((comp[r]||{}).giv||0), 0);
const totalCreditValue = repNames.reduce((s, r) => s + ((comp[r]||{}).giv||0), 0);
const totalSold = repNames.reduce((s, r) => s + ((comp[r]||{}).sold||0), 0);
const totalReturned = repNames.reduce((s, r) => s + ((comp[r]||{}).ret||0), 0);
const totalRevenue = repNames.reduce((s, r) => s + ((comp[r]||{}).rev||0), 0);
const avgPrice = totalSold > 0 ? totalRevenue / totalSold : 0;
const totalReturnValue = totalReturned * avgPrice;
const pieData = [totalCashValue, totalCreditValue, totalReturnValue];
const pieLabels = ['Cash Sale Value', 'Credit Value', 'Return Value'];
const compChartElement = document.getElementById('compositionChart');
if (!compChartElement) { return; }
if(salesCompChart) salesCompChart.destroy();
_set_salesCompChart(new SarimChart(compChartElement, {
type: 'pie',
data: {
labels: pieLabels,
datasets: [{
data: pieData,
backgroundColor: [themeColor('--success'), themeColor('--warning'), themeColor('--danger')],
borderWidth: 0,
hoverOffset: 8
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
plugins: {
legend: { position: 'bottom', labels: { color: colors.text, boxWidth: 12, font: { size: 10 } } },
title: {
display: true,
text: 'Market Composition',
color: colors.text,
font: { size: 13, weight: 'bold' }
}
}
}
}));
}

export async function processReturnToProduction(storeKey, quantity, date, seller, note) {
const { production, returns } = await loadCollections('production', 'returns');
const now = new Date();
const timeString = formatTime12(now);
const formulaId = await getStorePool(storeKey);
const salePrice = await getSalePriceForStore(storeKey);
const costPerKg = await getCostPriceForStore(storeKey, date);
const totalCost = quantity * costPerKg;
const totalSale = quantity * salePrice;
const profit = totalSale - totalCost;
const retCreatedAt = Date.now();
let _retId = generateUUID('ret');
if (!validateUUID(_retId)) _retId = generateUUID('ret');
let returnEntry = {
id: _retId,
date: date,
time: timeString,
store: storeKey,
net: quantity,
cp: costPerKg,
sp: salePrice,
totalCost: totalCost,
totalSale: totalSale,
profit: profit,
formulaUnits: 0,
formulaId: formulaId,
formulaCost: 0,
paymentStatus: 'CASH',
createdAt: retCreatedAt,
updatedAt: retCreatedAt,
timestamp: retCreatedAt,
isReturn: true,
returnedBy: seller,
returnNote: note || `Returned by ${seller}`,
syncedAt: new Date().toISOString()
};
returnEntry = ensureRecordIntegrity(returnEntry, false);
production.push(returnEntry);
await unifiedSave('production', production, returnEntry);
let _retLogId = generateUUID('retlog');
if (!validateUUID(_retLogId)) _retLogId = generateUUID('retlog');
let returnLogEntry = {
id: _retLogId,
date: date,
time: timeString,
store: storeKey,
quantity: quantity,
seller: seller,
createdAt: retCreatedAt,
updatedAt: retCreatedAt,
timestamp: retCreatedAt,
syncedAt: new Date().toISOString()
};
returnLogEntry = ensureRecordIntegrity(returnLogEntry, false);
returns.push(returnLogEntry);
try {
await unifiedSave('returns', returns, returnLogEntry);
} catch (_logErr) {
try { await unifiedDelete('production', production, returnEntry.id, { strict: true }, returnEntry); } catch (_) {}
throw _logErr;
}
return { returnEntryId: returnEntry.id, returnLogId: returnLogEntry.id };
}

export async function reverseReturnFromProduction(storeKey, quantity, date, seller, ids) {
const { production, returns } = await loadCollections('production', 'returns');
const _retMatch = item => item.store === storeKey && item.net === quantity && item.date === date && item.isReturn === true;
const returnEntry = (ids && ids.returnEntryId && production.find(item => item.id === ids.returnEntryId))
|| (seller && production.find(item => _retMatch(item) && item.returnedBy === seller))
|| production.find(_retMatch);
if (returnEntry) {
await unifiedDelete('production', production, returnEntry.id, { strict: true }, returnEntry);
}
const _logMatch = r => r.store === storeKey && r.quantity === quantity && r.date === date;
const returnLogEntry = (ids && ids.returnLogId && returns.find(r => r.id === ids.returnLogId))
|| (seller && returns.find(r => _logMatch(r) && r.seller === seller))
|| returns.find(_logMatch);
if (returnLogEntry) {
await unifiedDelete('returns', returns, returnLogEntry.id, { strict: true }, returnLogEntry);
}
}

export const CHORA_MATERIAL_NAME = 'CHORA';

export async function processExpiredToChora(quantity, date, seller) {
const { inventory } = await loadCollections('inventory');
if (!quantity || quantity <= 0) return;
let choraMaterial = inventory.find(m => m.name && m.name.toUpperCase() === CHORA_MATERIAL_NAME);
if (!choraMaterial) {
const reloadedData = await sqliteStore.get('inventory', []);
if (Array.isArray(reloadedData)) {
choraMaterial = inventory.find(m => m.name && m.name.toUpperCase() === CHORA_MATERIAL_NAME);
}
}
if (!choraMaterial) {
showToast(` CHORA material not found in factory inventory. Expired qty (${quantity}) was recorded but not added to raw materials.`, 'warning', 5000);
return false;
}
choraMaterial.quantity = (choraMaterial.quantity || 0) + quantity;
choraMaterial.totalValue = choraMaterial.quantity * (choraMaterial.cost || 0);
choraMaterial.updatedAt = getTimestamp();
choraMaterial.lastExpiredAddedAt = date;
choraMaterial.lastExpiredAddedBy = seller;
ensureRecordIntegrity(choraMaterial, true);
await unifiedSave('inventory', inventory, choraMaterial);
emitSyncUpdate({ inventory: null});
notifyDataChange('factory');
return true;
}

export async function reverseExpiredFromChora(quantity, date) {
const { inventory } = await loadCollections('inventory');
if (!quantity || quantity <= 0) return;
let choraMaterial = inventory.find(m => m.name && m.name.toUpperCase() === CHORA_MATERIAL_NAME);
if (!choraMaterial) {
const reloadedData = await sqliteStore.get('inventory', []);
if (Array.isArray(reloadedData)) {
choraMaterial = inventory.find(m => m.name && m.name.toUpperCase() === CHORA_MATERIAL_NAME);
}
}
if (!choraMaterial) {
window.notifyBlocking(` CHORA material not found. Could not reverse expired qty (${quantity}).`, 'warning', 'Warning');
return;
}
choraMaterial.quantity = Math.max(0, (choraMaterial.quantity || 0) - quantity);
choraMaterial.totalValue = choraMaterial.quantity * (choraMaterial.cost || 0);
choraMaterial.updatedAt = getTimestamp();
ensureRecordIntegrity(choraMaterial, true);
await unifiedSave('inventory', inventory, choraMaterial);
emitSyncUpdate({ inventory: null});
notifyDataChange('factory');
}

export function formatCurrency(num) {
return fmtNum(num, 2);
}

export function safeValue(value) {
return isNaN(value) || !isFinite(value) ? 0 : value;
}

export async function refreshAllDisplays() {
const _radBatch = await sqliteStore.getBatch([
'production','sales','rep','calculator',
'transactions','entities','expenses','returns',
'inventory','factory',
'defaults','costs',
'adjustment',
'tracking','deleted',
]);
const production = ensureArray(_radBatch.get('production'));
const sales = ensureArray(_radBatch.get('sales'));
const rep = ensureArray(_radBatch.get('rep'));
const calculator = ensureArray(_radBatch.get('calculator'));
const transactions = ensureArray(_radBatch.get('transactions'));
const entities = ensureArray(_radBatch.get('entities'));
const expenses = ensureArray(_radBatch.get('expenses'));
const returns = ensureArray(_radBatch.get('returns'));
const inventory = ensureArray(_radBatch.get('inventory'));
const factory = ensureArray(_radBatch.get('factory'));
const factoryDefaultFormulas = _radBatch.get('defaults') || {};
const factoryAdditionalCosts = _radBatch.get('costs') || {};
const factoryCostAdjustmentFactor = _radBatch.get('adjustment') || {};
const factoryUnitTracking = _radBatch.get('tracking') || {};
const deletedRecordIds = new Set(ensureArray(_radBatch.get('deleted')));
await Promise.all([
  (async () => {
    try { await syncFactoryProductionStats(); } catch (e) { console.error('syncFactoryProductionStats failed.', _safeErr(e)); }
    try { if (typeof refreshUI === 'function') await refreshUI(1, true); } catch (e) { console.error('refreshUI failed.', _safeErr(e)); }
  })(),
  (async () => {
    try {
      if (typeof refreshCustomerSales === 'function') await refreshCustomerSales(1, true);
      else if (typeof renderCustomersTable === 'function') renderCustomersTable();
    } catch (e) { console.error('refreshCustomerSales failed.', _safeErr(e)); }
  })(),
  (async () => {
    try { if (typeof loadSalesData === 'function') await loadSalesData(currentCompMode); } catch (e) { console.error('loadSalesData failed.', _safeErr(e)); }
  })(),
  (() => {
    try { if (typeof initFactoryTab === 'function') initFactoryTab(); } catch (e) { console.error('initFactoryTab failed.', _safeErr(e)); }
  })(),
  (async () => {
    try {
      if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
      if (typeof calculateNetCash === 'function') calculateNetCash();
    } catch (e) { console.error('refreshPaymentTab failed.', _safeErr(e)); }
  })(),
  (() => {
    try {
      if (appMode === 'rep') {
        if (typeof renderRepHistory === 'function') renderRepHistory();
        if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
      }
    } catch (e) { console.error('Rep tab refresh failed.', _safeErr(e)); }
  })(),
]);
}

window.addEventListener('unhandledrejection', function(event) {
  const err = event.reason;
  if (!err) { event.preventDefault(); return; }
  if (err instanceof DOMException) { event.preventDefault(); return; }
  if (err instanceof Error) {
    const msg = err.message || '';
    if (msg.indexOf('[DOMException]') === 0 || msg.indexOf('DOMException') !== -1) {
      event.preventDefault(); return;
    }
  }
  if (typeof err === 'string' && err.indexOf('DOMException') !== -1) {
    event.preventDefault(); return;
  }
});

async function _awaitVisualReady() {
  const cap = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  try {
    if (document.fonts && document.fonts.load) {
      await cap(Promise.all([
        document.fonts.load('400 14px "Manrope"'),
        document.fonts.load('700 14px "Manrope"'),
        document.fonts.load('500 14px "JetBrains Mono"'),
        document.fonts.load('500 14px "Plus Jakarta Sans"'),
        document.fonts.load('600 14px "Playfair Display"'),
        document.fonts.load('italic 500 14px "Playfair Display"'),
        document.fonts.load('600 14px "Cinzel"'),
        ...(/[\u0600-\u06FF]/.test(document.body.innerText || '') ? [
          document.fonts.load('400 14px "Noto Nastaliq Urdu"', '\u0627'),
          document.fonts.load('700 14px "Noto Nastaliq Urdu"', '\u0627'),
        ] : []),
      ]).then(() => document.fonts.ready), 1500);
    const warmUrdu = () => {
      try {
        document.fonts.load('400 14px "Noto Nastaliq Urdu"', '\u0627').catch(() => {});
        document.fonts.load('700 14px "Noto Nastaliq Urdu"', '\u0627').catch(() => {});
      } catch (_) {}
    };
    setTimeout(warmUrdu, 1500);
    }
  } catch (_) {}
  try {
    const pending = Array.from(document.images).filter(img =>
      !img.complete && img.offsetParent !== null && img.decode);
    if (pending.length) await cap(Promise.all(pending.map(img => img.decode().catch(() => {}))), 800);
  } catch (_) {}
  await frame();
  await frame();
}

document.addEventListener('DOMContentLoaded', async function _appBootstrap() {
  initSplashScreen();
  const urlParams = new URLSearchParams(window.location.search);
  const _action = urlParams.get('action');
  if (_action) {
    const _tabMap = { sales: 'sales', production: 'prod', calc: 'calc' };
    const _targetTab = _tabMap[_action];
    if (_targetTab) {
      let _attempts = 0;
      const _tryShowTab = () => {
        if (typeof showTab === 'function') { showTab(_targetTab); }
        else if (_attempts++ < 40) setTimeout(_tryShowTab, 100);
      };
      setTimeout(_tryShowTab, 200);
    }
  }
  updateOfflineBanner();
  updateConnectionStatus();
  const expenseNameInput = document.getElementById('expenseName');
  if (expenseNameInput) {
    expenseNameInput.addEventListener('blur', function() {
      setTimeout(() => {
        const rd = document.getElementById('expense-search-results');
        if (rd) rd.classList.add('hidden');
      }, 200);
    });
  }
  if (typeof ThemeManager !== 'undefined' && ThemeManager.init) ThemeManager.init();
  await initTheme();
  const hasFirebaseSession = await _checkFirebaseSessionExists();
  if (!hasFirebaseSession) {
    createAuthOverlay();
    showAuthOverlay();
  } else {
    try {
      let loginData = await SQLiteCrypto.sessionGet('login');
      if (!loginData || !loginData.uid) {
        const lsLogin = localStorage.getItem('persistentLogin');
        if (lsLogin) { try { loginData = JSON.parse(lsLogin); } catch(e) {} }
      }
      if (loginData && loginData.uid) {
        sqliteStore.setUserPrefix(loginData.uid);
        await SQLiteCrypto.initialize();
        const keyRestored = await SQLiteCrypto.restoreSessionKeyFromStorage();
        if (!keyRestored) {
          console.warn('Session: could not restore encryption key from storage, waiting for Firebase auth');
        }
      }
    } catch(e) {
      console.warn('Session pre-warm failed:', _safeErr(e));
    }
  }
  try {
    await loadAllData();
    await initializeDeviceListeners();
    if (typeof OfflineQueue !== 'undefined') await OfflineQueue.init();
    loadFirestoreStats();
    try { sessionStorage.setItem('_gznd_bootstrap_ran', '1'); } catch(_) {}
  } catch (e) {
    console.error('[Startup] Initialization error:', _safeErr(e));
    if (e && e.code === 'DECRYPT_FAILED') {
      console.warn('[Startup] DECRYPT_FAILED with key ready — showing auth overlay');
      if (typeof createAuthOverlay === 'function') createAuthOverlay();
      if (typeof showAuthOverlay === 'function') showAuthOverlay();
      window.notifyBlocking('Data could not be decrypted. Please log in again.', 'error', 'Something went wrong');
      return;
    }
    showToast('Startup error — some data may not be available. Tap to retry.', 'warning', 8000);
  }
  await enforceRepModeLock();
  preventAdminAccess();
  if (typeof checkBiometricLock === 'function') await checkBiometricLock();
  const cloudMenuBtn = document.getElementById('cloudMenuBtn');
  if (cloudMenuBtn) window.setDisplay(cloudMenuBtn, (appMode === 'admin') ? '' : 'none');
  updateSyncButton();
  setTimeout(() => {
    if (typeof initializeFirebaseSystem === 'function') initializeFirebaseSystem();
    else if (typeof initFirebase === 'function') initFirebase();
  }, 100);
  const today = localDateStr();
  ['sys-date','sale-date','sale-date-from','cust-date','factory-date','expenseDate','rep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  updateCalcRangeLabel();
  _set_currentFactoryDate(today);
  syncBiometricButton();
  const factoryDateEl = document.getElementById('factory-date');
  if (factoryDateEl) {
    factoryDateEl.addEventListener('change', function() {
      _set_currentFactoryDate(this.value);
    });
  }
  const sellerSelect = document.getElementById('sellerSelect');
  const saleDate2 = document.getElementById('sale-date');
  if (sellerSelect) sellerSelect.addEventListener('change', autoFillTotalSoldQuantity);
  if (saleDate2) saleDate2.addEventListener('change', autoFillTotalSoldQuantity);
  setProductionView('store');
  const _firstRender = new Promise(_resolveFirst => requestAnimationFrame(async () => {
   try {
    await syncFactoryProductionStats().catch(e => console.warn('[refreshFactoryTab] stats failed:', _safeErr(e)));
    updateAllTabsWithFactoryCosts();
    await refreshAllDisplays();
  if (appMode === 'rep') {
    if (typeof renderRepHistory === 'function') renderRepHistory();
    if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
  }
  loadSalesRepsList();
  setTimeout(() => {
    if (typeof generateUUID === 'function') {
      const saleIdEl = document.getElementById('new-sale-id-display');
      if (saleIdEl) { const id = generateUUID('sale'); saleIdEl.textContent = 'ID: ' + id.split('-').slice(0,2).join('-') + '\u2026'; saleIdEl.title = id; }
      const expIdEl = document.getElementById('expense-id-display');
      if (expIdEl) { const id2 = generateUUID('exp'); expIdEl.textContent = 'ID: ' + id2.split('-').slice(0,2).join('-') + '\u2026'; expIdEl.title = id2; }
    }
  }, 400);
   } catch (e) { console.warn('[Startup] first render failed:', _safeErr(e)); }
   finally { _resolveFirst(); }
  }));
  scheduleAutomaticCleanup();
  if (window._connectionCheckInterval) clearInterval(window._connectionCheckInterval);
  window._connectionCheckInterval = setInterval(() => {
    if (isConnectionStale()) {
      if (firebaseDB && currentUser && !isReconnecting) scheduleListenerReconnect();
    }
  }, 120000);
  if (window._perfMonitorInterval) clearInterval(window._perfMonitorInterval);
  window._perfMonitorInterval = setInterval(() => {
    if (typeof PerformanceMonitor !== 'undefined') PerformanceMonitor.report();
  }, 60000);
  await _firstRender;
  await _awaitVisualReady();
  window.__splashBooted = true;
  if (typeof window.__splashTryHide === 'function') window.__splashTryHide();
});

export function _filterFactoryHistoryByMode(mode) {
const selectedDateVal = (document.getElementById('factory-date') || {}).value || localDateStr();
const selectedDate = new Date(selectedDateVal);
if (isNaN(selectedDate.getTime())) return;
const weekStart = new Date(selectedDate);
weekStart.setDate(selectedDate.getDate() - 6);
document.querySelectorAll('#factoryHistoryList .hc-card').forEach(item => {
const ds = item.getAttribute('data-date');
if (!ds) { window.setDisplay(item, ''); return; }
const cd = new Date(ds);
if (isNaN(cd.getTime())) { window.setDisplay(item, ''); return; }
let show = false;
if (mode === 'daily') show = (ds === selectedDateVal);
else if (mode === 'weekly') show = (cd >= weekStart && cd <= selectedDate);
else if (mode === 'monthly') show = (cd.getMonth() === selectedDate.getMonth() && cd.getFullYear() === selectedDate.getFullYear());
else if (mode === 'yearly') show = (cd.getFullYear() === selectedDate.getFullYear());
else show = true;
window.setDisplay(item, show ? '' : 'none');
});
}

export function _filterPaymentHistoryByPeriod() {
const periodFilterEl = document.getElementById('unifiedPeriodFilter');
const period = periodFilterEl ? periodFilterEl.value : 'all';
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let startDate = new Date(0);
if (period === 'today') startDate = today;
else if (period === 'week') { startDate = new Date(today); startDate.setDate(today.getDate() - 7); }
else if (period === 'month') { startDate = new Date(today); startDate.setDate(today.getDate() - 30); }
document.querySelectorAll('#paymentHistoryList .card').forEach(card => {
const ds = card.getAttribute('data-date');
if (!ds) { window.setDisplay(card, ''); return; }
const cd = new Date(ds);
if (isNaN(cd.getTime())) { window.setDisplay(card, ''); return; }
window.setDisplay(card, (cd >= startDate) ? '' : 'none');
});
}

export function _filterHistoryByPeriod(listSelector, refDateStr, mode) {
const refDate = new Date(refDateStr);
if (isNaN(refDate.getTime())) return;
const weekStart = new Date(refDate);
weekStart.setDate(refDate.getDate() - 6);
const isCustList = listSelector === '#custHistoryList';
const matchName = isCustList ? customerHistoryMatcher('cust-name') : null;
const cards = document.querySelectorAll(listSelector + ' .card:not(.hc-metric)');
let total = 0, shown = 0;
cards.forEach(card => {
total++;
const show = _cardInPeriod(card, refDate, refDateStr, weekStart, mode) &&
(!matchName || matchName(String(card.getAttribute('data-customer') || '')));
if (show) shown++;
window.setDisplay(card, show ? '' : 'none');
});
if (isCustList) _showHistoryFilterEmpty(listSelector, total, shown, mode, !!matchName);
}

function _cardInPeriod(card, refDate, refDateStr, weekStart, mode) {
const ds = card.getAttribute('data-date');
if (!ds) return true;
const cd = new Date(ds);
if (isNaN(cd.getTime())) return true;
if (mode === 'day') return ds === refDateStr;
if (mode === 'week') return cd >= weekStart && cd <= refDate;
if (mode === 'month') return cd.getMonth() === refDate.getMonth() && cd.getFullYear() === refDate.getFullYear();
if (mode === 'year') return cd.getFullYear() === refDate.getFullYear();
return true;
}

function _showHistoryFilterEmpty(listSelector, total, shown, mode, byName) {
const list = document.querySelector(listSelector);
if (!list || !list.querySelectorAll) return;
list.querySelectorAll('.hist-filter-empty').forEach(n => n.remove());
if (total === 0 || shown > 0) return;
const labels = { day: 'this day', week: 'this week', month: 'this month', year: 'this year', all: 'all time' };
const msg = byName ? `No matching sales for ${labels[mode] || 'this period'}. Try another period or clear the name.` : `No sales for ${labels[mode] || 'this period'}.`;
const holder = document.createElement('div');
holder.className = 'hist-filter-empty';
holder.innerHTML = hcEmptyHtml(msg);
list.appendChild(holder);
}

export function applyCustomerHistoryFilter(mode) {
if (mode === 'rep') { if (typeof renderRepHistory === 'function') renderRepHistory(); return; }
if (typeof window.recomputeCustomerSummary === 'function' && window.recomputeCustomerSummary()) return;
const refDate = (document.getElementById('cust-date') || {}).value || localDateStr();
_filterHistoryByPeriod('#custHistoryList', refDate, currentSalesSummaryMode || 'day');
}

export function setSalesSummaryMode(mode) {
currentSalesSummaryMode = mode; window.currentSalesSummaryMode = currentSalesSummaryMode;
if (isMoneyRestricted()) return;
const labels = { day:'Daily', week:'Weekly', month:'Monthly', year:'Yearly', all:'All Time' };
const prefixes = ['day','week','month','year','all'];
prefixes.forEach(p => {
const btn = document.getElementById(`ss-${p}-btn`);
if (btn) btn.className = 'toggle-opt' + (p === mode ? ' active' : '');
});
const s = (window._custStats && window._custStats[mode]) || {};
const titleEl = document.getElementById('sales-summary-title');
const qtyEl = document.getElementById('cust-active-qty');
const valueEl = document.getElementById('cust-active-value');
const cashEl = document.getElementById('cust-active-cash');
const creditEl = document.getElementById('cust-active-credit');
const profitEl = document.getElementById('cust-active-profit');
if (titleEl) titleEl.textContent = `${labels[mode]} Sales`;
if (qtyEl) qtyEl.textContent = `${fmtNum(s.q || 0)} kg`;
if (valueEl) valueEl.textContent = fmtAmt(s.v !== undefined ? s.v : 0);
if (cashEl) cashEl.textContent = fmtAmt(s.cash !== undefined ? s.cash : 0);
if (creditEl) creditEl.textContent = fmtAmt(s.credit !== undefined ? s.credit : 0);
if (profitEl) profitEl.textContent = fmtAmt(s.profit !== undefined ? s.profit : 0);
const _splitEl = document.getElementById('sales-split');
if (_splitEl) _splitEl.innerHTML = sxSplit([{ label: 'Cash', value: s.cash || 0, tone: 'good' }, { label: 'Credit', value: s.credit || 0, tone: 'warn' }], (v) => fmtAmt(v));
const _mEl = document.getElementById('cust-active-margin');
if (_mEl) { const m = sxMargin(s.profit, s.v); _mEl.textContent = m == null ? '' : `${m}% margin`; _mEl.classList.toggle('d-none', m == null); }
const card = document.getElementById('sales-summary-card');
if (card) {
if (mode === 'all') card.classList.add('is-highlight');
else card.classList.remove('is-highlight');
}
const refDate = (document.getElementById('cust-date') || {}).value || localDateStr();
_filterHistoryByPeriod('#custHistoryList', refDate, mode);
}

export function setPerfOverviewMode(mode) {
currentPerfOverviewMode = mode; window.currentPerfOverviewMode = currentPerfOverviewMode;
const prefixes = ['day','week','month','year','all'];
prefixes.forEach(p => {
const btn = document.getElementById(`po-${p}-btn`);
if (btn) btn.className = 'toggle-opt' + (p === mode ? ' active' : '');
});
const ghostMap = { day:'dailyReport', week:'weeklyReport', month:'monthlyReport', year:'yearlyReport', all:'allTimeReport' };
const ghostEl = document.getElementById(ghostMap[mode]);
const activeEl = document.getElementById('activeReport');
if (activeEl && ghostEl) activeEl.innerHTML = ghostEl.innerHTML;
const refDate = (document.getElementById('sale-date') || {}).value || localDateStr();
_filterHistoryByPeriod('#historyList', refDate, mode);
}

export function setOverviewMode(mode) {
_set_currentOverviewMode(mode);
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

export async function deleteSalesEntry(id) {
const { calculator } = await loadCollections('calculator');
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
if (!id || !validateUUID(id)) {
window.notifyBlocking('Invalid sales entry ID', 'error', 'Something went wrong');
return;
}
try {
let history; history = await sqliteStore.get('calculator', []);
const _foundEntry = history.find(h => h.id === id);
const entryToDelete = _foundEntry ? JSON.parse(JSON.stringify(_foundEntry)) : _foundEntry;
if (entryToDelete && entryToDelete.isMerged) {
window.notifyBlocking('Merged opening balance records cannot be deleted', 'warning', 'Action not allowed');
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
{
let _blk = (await getTransferDeleteBlockReason(entryToDelete)) || (await getExpiredDeleteBlockReason(entryToDelete));
if (!_blk && entryToDelete.returned > 0 && entryToDelete.returnStore && typeof window.computeStoreStockSnapshot === 'function') {
const _snap = await window.computeStoreStockSnapshot(entryToDelete.returnStore, entryToDelete.date);
if (_snap.available - entryToDelete.returned < -0.0001) _blk = `${getStoreLabel(entryToDelete.returnStore)} stock on ${entryToDelete.date} was already sold. Removing the ${entryToDelete.returned} kg return would make stock negative.`;
}
if (_blk) { window.notifyBlocking(`Cannot delete: ${_blk}`, 'warning', 'Action not allowed'); return; }
}
const _dsHasImpact = linkedCount > 0 || linkedRepCount > 0 || (entryToDelete.returned > 0 && entryToDelete.returnStore) || (entryToDelete.transferSaleId) || entryToDelete.expired > 0;
if (_dsHasImpact) {
confirmMsg += `\n\n The following cascading changes will occur:`;
if (linkedCount > 0) confirmMsg += `\n • ${linkedCount} linked sale${linkedCount !== 1 ? 's' : ''} will REVERT to "Pending Credit" status.`;
if (linkedRepCount > 0) confirmMsg += `\n • ${linkedRepCount} rep sale${linkedRepCount !== 1 ? 's' : ''} will be RESTORED to calculator fields.`;
if (entryToDelete.returned > 0 && entryToDelete.returnStore) confirmMsg += `\n • ${entryToDelete.returned} kg will be REMOVED from ${getStoreLabel(entryToDelete.returnStore)} inventory (return reversal).`;
if (entryToDelete.transferSaleId) confirmMsg += `\n • ${entryToDelete.returned} kg transferred to ${entryToDelete.returnRep} will be REMOVED from their sales allocation (store stock is not affected).`;
if (entryToDelete.expired > 0) confirmMsg += `\n • ${entryToDelete.expired} kg will be REMOVED from CHORA raw material (expired reversal).`;
}
if (await showGlassConfirm(confirmMsg, { title: `Delete ${entryToDelete.seller || "Sales"} Record`, confirmText: "Delete", danger: true })) {
let revertedSalesCount = 0;
let revertedRepSalesCount = 0;
let reversedReturnQty = 0;
const _doneSteps = [];
const _liveEntry = history.find(h => h.id === id);
try {
if (entryToDelete.linkedSalesIds && entryToDelete.linkedSalesIds.length > 0) {
revertedSalesCount = await revertSpecificSalesEntries(entryToDelete.linkedSalesIds);
_doneSteps.push('sales');
}
if (entryToDelete.linkedRepSalesIds && entryToDelete.linkedRepSalesIds.length > 0) {
revertedRepSalesCount = await revertRepSalesEntries(entryToDelete.linkedRepSalesIds);
_doneSteps.push('rep');
}
if (entryToDelete.returned > 0 && entryToDelete.returnStore) {
reversedReturnQty = entryToDelete.returned;
await reverseReturnFromProduction(entryToDelete.returnStore, entryToDelete.returned, entryToDelete.date, entryToDelete.seller, { returnEntryId: entryToDelete.returnEntryId, returnLogId: entryToDelete.returnLogId });
_doneSteps.push('return');
}
if (entryToDelete.transferSaleId) {
const _csAll = ensureArray(await sqliteStore.get('sales'));
const _trRec = _csAll.find(x => x.id === entryToDelete.transferSaleId);
if (_trRec) {
await unifiedDelete('sales', _csAll.filter(x => x.id !== _trRec.id), _trRec.id, { strict: true }, _trRec);
_doneSteps.push('transfer');
if (_trRec.supplyStore && _trRec.supplyStore !== 'N/A') {
await reverseReturnFromProduction(_trRec.supplyStore, entryToDelete.returned, entryToDelete.date, entryToDelete.seller);
}
}
}
if (entryToDelete.expired > 0 && entryToDelete.expiredApplied !== false) {
await reverseExpiredFromChora(entryToDelete.expired, entryToDelete.date);
_doneSteps.push('expired');
if (_liveEntry) { _liveEntry.expiredApplied = false; _liveEntry.updatedAt = getTimestamp(); try { await unifiedSave('calculator', history, _liveEntry); } catch (_) { } }
}
const newHistory = history.filter(h => h.id !== id);
await unifiedDelete('calculator', newHistory, id, { strict: true }, entryToDelete);
} catch (_stepErr) {
await _reapplyCalcEffects(entryToDelete, _doneSteps, _liveEntry);
window.notifyBlocking('Could not delete the record: ' + ((_stepErr && _stepErr.message) || 'a step failed') + ' Everything was put back as it was.', 'error', 'Something went wrong');
return;
}
if (Array.isArray(calculator)) {
const idx = calculator.findIndex(h => h.id === id);
if (idx !== -1) calculator.splice(idx, 1);
}
refreshAllCalculations();
await loadSalesData(currentCompMode);
await refreshCustomerSales();
if (typeof refreshUI === 'function') await refreshUI();
if (entryToDelete.expired > 0) {
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
}
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
if (entryToDelete.expired > 0) {
successMsg += ` ${entryToDelete.expired} kg expired removed from CHORA.`;
}
}
} else {
window.notifyBlocking("Error: Record not found.", 'error', 'Something went wrong');
}
} catch (error) {
window.notifyBlocking("Failed to delete entry. Please try again.", 'error', 'Something went wrong');
}
}

export async function getCalcEditBlockReason(entry) {
if (!entry) return 'Record not found.';
if (entry.isMerged) return 'Merged opening balance records cannot be edited.';
let blk = (await getTransferDeleteBlockReason(entry)) || (await getExpiredDeleteBlockReason(entry));
if (!blk && entry.returned > 0 && entry.returnStore && typeof window.computeStoreStockSnapshot === 'function') {
const snap = await window.computeStoreStockSnapshot(entry.returnStore, entry.date);
if (snap.available - entry.returned < -0.0001) blk = `${getStoreLabel(entry.returnStore)} stock on ${entry.date} was already sold. Changing the ${entry.returned} kg return would make stock negative.`;
}
return blk || '';
}

export async function reverseCalcEntryForEdit(id) {
const history = ensureArray(await sqliteStore.get('calculator', []));
const live = history.find(h => h && h.id === id);
const blk = await getCalcEditBlockReason(live);
if (blk) return { error: blk };
const snap = JSON.parse(JSON.stringify(live));
const done = [];
try {
if (snap.linkedSalesIds && snap.linkedSalesIds.length > 0) { await revertSpecificSalesEntries(snap.linkedSalesIds); done.push('sales'); }
if (snap.linkedRepSalesIds && snap.linkedRepSalesIds.length > 0) { await revertRepSalesEntries(snap.linkedRepSalesIds); done.push('rep'); }
if (snap.returned > 0 && snap.returnStore) {
await reverseReturnFromProduction(snap.returnStore, snap.returned, snap.date, snap.seller, { returnEntryId: snap.returnEntryId, returnLogId: snap.returnLogId });
done.push('return');
}
if (snap.transferSaleId) {
const all = ensureArray(await sqliteStore.get('sales'));
const tr = all.find(x => x.id === snap.transferSaleId);
if (tr) {
await unifiedDelete('sales', all.filter(x => x.id !== tr.id), tr.id, { strict: true }, tr);
done.push('transfer');
if (tr.supplyStore && tr.supplyStore !== 'N/A') await reverseReturnFromProduction(tr.supplyStore, snap.returned, snap.date, snap.seller);
}
}
if (snap.expired > 0 && snap.expiredApplied !== false) {
await reverseExpiredFromChora(snap.expired, snap.date);
done.push('expired');
}
live.linkedSalesIds = []; live.linkedRepSalesIds = []; live.linkedRepReturnIds = [];
live.updatedAt = getTimestamp();
await unifiedSave('calculator', history, live);
} catch (e) {
await _reapplyCalcEffects(snap, done, live);
try { Object.assign(live, { linkedSalesIds: snap.linkedSalesIds || [], linkedRepSalesIds: snap.linkedRepSalesIds || [], linkedRepReturnIds: snap.linkedRepReturnIds || [] }); await unifiedSave('calculator', history, live); } catch (_) { }
return { error: 'Could not prepare the entry for editing: ' + ((e && e.message) || 'a step failed') + ' Everything was put back as it was.' };
}
return { snap, done };
}

export async function restoreCalcAfterFailedEdit(rev) {
if (!rev || !rev.snap) return;
const history = ensureArray(await sqliteStore.get('calculator', []));
const live = history.find(h => h && h.id === rev.snap.id);
await _reapplyCalcEffects(rev.snap, rev.done, live);
if (live) {
Object.assign(live, { ...JSON.parse(JSON.stringify(rev.snap)), returnEntryId: live.returnEntryId, returnLogId: live.returnLogId, transferSaleId: live.transferSaleId, expiredApplied: rev.snap.expired > 0 ? true : live.expiredApplied, updatedAt: getTimestamp() });
try { await unifiedSave('calculator', history, live); } catch (_) { }
}
}

export async function revertSpecificSalesEntries(saleIds) {
const { sales } = await loadCollections('sales');
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
if (!saleIds || saleIds.length === 0) return 0;
let revertedCount = 0;
saleIds.forEach(saleId => {
const saleIndex = sales.findIndex(s => s.id === saleId);
if (saleIndex !== -1) {
const sale = sales[saleIndex];
sale.creditReceived = false;
sale.paymentType = 'CREDIT';
if (!sale.currentRepProfile) sale.currentRepProfile = 'admin';
delete sale.creditReceivedDate;
delete sale.creditReceivedTime;
delete sale.creditReceivedManually;
sale.updatedAt = getTimestamp();
ensureRecordIntegrity(sale, true);
revertedCount++;
}
});
if (revertedCount > 0) {
await unifiedSave('sales', sales, null, saleIds);
if (typeof refreshCustomerSales === 'function') {
refreshCustomerSales(1, true);
}
notifyDataChange('sales');
triggerAutoSync();
}
return revertedCount;
}

export function toggleEntityViewMode() {
const toggleBtn = document.getElementById('entityViewModeToggle');
const entityGrid = document.getElementById('entityCardsGrid');
if (entityViewMode === 'detailed') {
entityViewMode = 'compact'; window.entityViewMode = entityViewMode;
entityGrid.classList.add('compact');
toggleBtn.title = "Switch to Detailed View";
toggleBtn.textContent = '';
} else {
entityViewMode = 'detailed'; window.entityViewMode = entityViewMode;
entityGrid.classList.remove('compact');
toggleBtn.title = "Switch to Compact View";
toggleBtn.textContent = '';
}
renderEntityTable();
}

export async function calculateEntityBalances() {
const { inventory, entities, transactions } = await loadCollections('inventory', 'entities', 'transactions');
const supplierIdSet = new Set();
if (typeof inventory !== 'undefined') {
inventory.forEach(m => {
if (m.supplierId) supplierIdSet.add(String(m.supplierId));
});
}
if (typeof transactions !== 'undefined') {
transactions.forEach(t => {
if (t.isPayable && t.type === 'IN' && t.supplierCreditAmount) {
supplierIdSet.add(String(t.entityId));
}
});
}
const balances = {};
entities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
balances[entity.id] = 0;
});
if (typeof inventory !== 'undefined') {
inventory.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0 && hasLiveSupplierInvoice(material, transactions)) {
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
if (typeof transactions !== 'undefined') {
transactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (supplierIdSet.has(String(transaction.entityId))) return;
if (isOrphanSupplierTx(transaction, inventory)) return;
if (balances[transaction.entityId] !== undefined) {
if (transaction.type === 'OUT') {
balances[transaction.entityId] -= parseFloat(transaction.amount) || 0;
} else if (transaction.type === 'IN') {
balances[transaction.entityId] += parseFloat(transaction.amount) || 0;
}
}
});
}
if (typeof transactions !== 'undefined') {
transactions.forEach(transaction => {
if (!transaction.isPayable || transaction.type !== 'IN') return;
if (!transaction.supplierCreditAmount) return;
const creditAmt = parseFloat(transaction.supplierCreditAmount) || 0;
if (creditAmt > 0 && balances[transaction.entityId] !== undefined) {
balances[transaction.entityId] += creditAmt;
supplierIdSet.add(String(transaction.entityId));
}
});
}
return balances;
}

export function getDynamicRole(balance) {
if (balance > 0.01) {
return {
label: 'Payable',
icon: '',
colorClass: 'entity-balance-negative',
badgeColor: 'linear-gradient(135deg, var(--danger) 0%, color-mix(in srgb, var(--danger) 75%, var(--black)) 100%)',
sign: '+'
};
} else if (balance < -0.01) {
return {
label: 'Receivable',
icon: '',
colorClass: 'entity-balance-positive',
badgeColor: 'linear-gradient(135deg, var(--success) 0%, color-mix(in srgb, var(--success) 75%, var(--black)) 100%)',
sign: ''
};
} else {
return {
label: 'Settled',
icon: '',
colorClass: 'entity-balance-neutral',
badgeColor: 'linear-gradient(135deg, var(--accent-blue) 0%, color-mix(in srgb, var(--accent-blue) 75%, var(--black)) 100%)',
sign: ''
};
}
}

export function filterEntityCards() {
const searchTerm = document.getElementById('entity-list-search').value.toLowerCase().trim();
const entityCards = document.querySelectorAll('#entityCardsGrid .entity-card-compact');
if (!searchTerm) {
entityCards.forEach(card => window.setDisplay(card, ''));
return;
}
entityCards.forEach(card => {
const entityName = card.querySelector('.entity-name').textContent.toLowerCase();
const entityType = card.querySelector('.entity-type-badge').textContent.toLowerCase();
const entityPhone = card.querySelector('.entity-contact')?.textContent?.toLowerCase() || '';
const cardText = (entityName + ' ' + entityType + ' ' + entityPhone).toLowerCase();
if (cardText.includes(searchTerm)) {
window.setDisplay(card, '');
} else {
window.setDisplay(card, 'none');
}
});
}

export function openEntityManagement() {
editingEntityId = null; window.editingEntityId = editingEntityId;
const _en = document.getElementById('entityName'); if (_en) _en.value = '';
const _ep = document.getElementById('entityPhone'); if (_ep) _ep.value = '';
const _ew = document.getElementById('entityWallet'); if (_ew) _ew.value = '';
const _entMT1 = document.getElementById('entityManagementModalTitle'); if (_entMT1) _entMT1.innerText = 'Add New Entity';
const _delBtn = document.getElementById('deleteEntityBtn'); if (_delBtn) { _delBtn.classList.add('u-hidden'); window.setDisplay(_delBtn, 'none'); }
clearPersonPhoto('entity');
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('add-entity-screen');
}

export async function closeEntityManagement() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('add-entity-screen');
const entities = ensureArray(await sqliteStore.get('entities'));
const detailsScreen = document.getElementById('entity-details-screen');
if (detailsScreen && window.getDisplay(detailsScreen) !== 'none' && currentEntityId) {
const entity = entities.find(e => String(e.id) === String(currentEntityId));
if (entity) renderEntityOverlayContent(entity);
}
}

export function saveEntity(...a) { return confirmGuard('saveEntity', () => runExclusive('saveEntity', () => _saveEntityImpl(...a)), { label: 'Entity', late: true, fields: [['entityName', 'Name'], ['entityPhone', 'Phone'], ['entityWallet', 'Wallet']], isUpdate: () => !!editingEntityId }); }

async function _saveEntityImpl() {
const { entities, transactions } = await loadCollections('entities', 'transactions');
const name = document.getElementById('entityName').value.trim();
const phone = document.getElementById('entityPhone').value.trim();
const wallet = document.getElementById('entityWallet').value.trim();
const existingEntity = editingEntityId ? entities.find(e => String(e.id) === String(editingEntityId)) : null;
const entityTxs = existingEntity
? transactions.filter(t => String(t.entityId) === String(existingEntity.id))
: [];
const hasIN = entityTxs.some(t => t.type === 'IN');
const hasOUT = entityTxs.some(t => t.type === 'OUT');
const type = (hasIN && !hasOUT) ? 'payor' : 'payee';
if (!name) {
window.notifyBlocking("Please enter an entity name", 'warning', 'Warning');
return;
}
const exists = entities.some(e => e && e.name && e.name.toLowerCase() === name.toLowerCase() && e.id !== editingEntityId);
if(exists) {
window.notifyBlocking("An entity with this name already exists", 'warning', 'Warning');
return;
}
if (!(await window.gcCommit({}))) return;
try {
let _renameFrom = null;
if (editingEntityId) {
const index = entities.findIndex(e => e.id === editingEntityId);
if (index !== -1) {
if (entities[index].name !== name) _renameFrom = entities[index].name;
entities[index] = ensureRecordIntegrity({
...entities[index],
name,
type,
phone,
wallet,
updatedAt: getTimestamp()
}, true);
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
entities.push(newEntity);
showToast("New entity added", "success");
}
const savedEntity = editingEntityId
? entities.find(e => e.id === editingEntityId)
: entities[entities.length - 1];
await unifiedSave('entities', entities, savedEntity);
if (_renameFrom && savedEntity) await cascadeEntityRename(savedEntity.id, _renameFrom, name);
if (savedEntity) await savePersonPhoto('entity', 'entity:' + String(savedEntity.id));
emitSyncUpdate({ entities: null});
notifyDataChange('entities');
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
closeEntityManagement();
if (typeof renderEntityTable === 'function') await renderEntityTable(1);
if (typeof calculateNetCash === 'function') calculateNetCash();
} catch (error) {
window.notifyBlocking('Failed to save entity. Please try again.', 'error', 'Something went wrong');
}
}

export async function editEntityBasicInfo(id) {
const entities = ensureArray(await sqliteStore.get('entities'));
const entity = entities.find(e => String(e.id) === String(id));
if (entity) {
editingEntityId = id; window.editingEntityId = editingEntityId;
document.getElementById('entityName').value = entity.name;
document.getElementById('entityPhone').value = entity.phone || '';
document.getElementById('entityWallet').value = entity.wallet || '';
const _entMT2 = document.getElementById('entityManagementModalTitle'); if (_entMT2) _entMT2.innerText = 'Edit Entity Info';
const _entDelBtn = document.getElementById('deleteEntityBtn'); if (_entDelBtn) { _entDelBtn.classList.remove('u-hidden'); window.setDisplay(_entDelBtn, ''); }
await loadPersonPhotoIntoEditor('entity', 'entity:' + String(id));
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('add-entity-screen');
}
}

export async function refreshPaymentTab(force = false) {
const _rptBatch = await sqliteStore.getBatch([
'production','sales','calculator',
'inventory','factory','tracking',
'entities','transactions','expenses',
'deleted','deletions',
]);
const production = ensureArray(_rptBatch.get('production'));
const sales = ensureArray(_rptBatch.get('sales'));
const calculator = ensureArray(_rptBatch.get('calculator'));
const inventory = ensureArray(_rptBatch.get('inventory'));
const factory = ensureArray(_rptBatch.get('factory'));
const factoryUnitTracking = _rptBatch.get('tracking') || {};
const entities = ensureArray(_rptBatch.get('entities'));
const transactions = ensureArray(_rptBatch.get('transactions'));
const expenses = ensureArray(_rptBatch.get('expenses'));
const deletedRecordIds = new Set(ensureArray(_rptBatch.get('deleted')));
const deletionRecords = ensureArray(_rptBatch.get('deletions'));
try {
if (sqliteStore && sqliteStore.getBatch) {
const allKeys = [
'expenses', 'entities', 'transactions',
'production', 'sales', 'calculator',
'inventory', 'factory',
'tracking',
'defaults', 'costs',
'adjustment'
];
const paymentDataMap = await sqliteStore.getBatch(allKeys);
if (paymentDataMap.get('expenses')) {
await repairStoredRecords('expenses', paymentDataMap.get('expenses') || []);
}
if (paymentDataMap.get('entities')) {
await repairStoredRecords('entities', paymentDataMap.get('entities') || []);
}
if (paymentDataMap.get('transactions')) {
await repairStoredRecords('transactions', paymentDataMap.get('transactions') || []);
}
}
await syncSuppliersToEntities();
try { calculateNetCash(); } catch (e) {
showToast('Economic health calculation failed: ' + (_safeErr(e).message || 'please reload the app'), 'error');
console.error('calculateNetCash error:', _safeErr(e));
}
try {
if (typeof updateFactoryInventoryDisplay === 'function') {
updateFactoryInventoryDisplay();
}
} catch (e) {
console.error('updateFactoryInventoryDisplay error:', _safeErr(e));
}
try { calculatePaymentSummaries(); } catch (e) {
showToast('Payment summaries failed to calculate: ' + (_safeErr(e).message || 'please reload the app'), 'error');
console.error('calculatePaymentSummaries error:', _safeErr(e));
}
try { await renderUnifiedTable(); } catch (e) {
showToast('Transaction table failed to render: ' + (_safeErr(e).message || 'please reload the app'), 'error');
console.error('renderUnifiedTable error:', _safeErr(e));
}
try { updateExpenseBreakdown(); } catch (e) {
showToast('Expense breakdown failed to update: ' + (_safeErr(e).message || 'please reload the app'), 'error');
console.error('updateExpenseBreakdown error:', _safeErr(e));
}
try { calculateCashTracker(); } catch (e) {
showToast('Cash tracker failed to calculate: ' + (_safeErr(e).message || 'please reload the app'), 'error');
console.error('calculateCashTracker error:', _safeErr(e));
}
const historyList = document.getElementById('paymentHistoryList');
if (!historyList) {
return;
}
const _phFrag = document.createDocumentFragment();
const sortedTransactions = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
for (const transaction of sortedTransactions) {
const entity = entities.find(e => String(e.id) === String(transaction.entityId));
const badgeClass = transaction.type === 'IN' ? 'transaction-in' : 'transaction-out';
const badgeText = transaction.type === 'IN' ? 'IN' : 'OUT';
const entityName = entity ? entity.name : (transaction.entityName || 'Unknown Entity');
const entityType = entity ? entity.type : (transaction.entityType || 'Unknown');
const isMerged = transaction.isMerged === true;
const isSettled = transaction.isSettled === true;
const mergedBadge = isMerged ? _mergedBadgeHtml(transaction, {inline:true}) : '';
const settledBadge = isSettled ? `<span class="badge settled-badge"> Settled</span>` : '';
const creatorBadge = (typeof _creatorBadgeHtml === 'function') ? _creatorBadgeHtml(transaction) : '';
const deleteButton = isMerged ? '' : actionRowHtml('payment', transaction.id, `<button class="btn btn-danger btn-sm u-w-full u-mt-8" onclick="(async () => { await deletePaymentTransaction('${esc(transaction.id)}') })()">Delete</button>`);
const isIn = transaction.type === 'IN';
const card = hcCard({
tone: isIn ? 'good' : 'bad', avatar: entityName, title: entityName, titleClass: 'customer-name',
sub: `${esc(formatDisplayDateTime(transaction.date, transaction.time || null))}${creatorBadge}${mergedBadge}`,
chips: [entityType && entityType !== 'Unknown' ? hcChip(String(entityType)) : '', isSettled ? hcChip('Settled', 'good') : ''],
amount: fmtAmt(safeValue(transaction.amount)), tag: isIn ? 'In' : 'Out', tagTone: isIn ? 'good' : 'bad',
metrics: [{ label: 'Description', value: esc(transaction.description || 'No description'), wide: true }],
actions: deleteButton
}, { className: isSettled ? 'is-settled-record' : '', attrs: { 'data-date': transaction.date } });
_phFrag.appendChild(card);
}
if (sortedTransactions.length === 0) {
historyList.innerHTML = hcEmptyHtml('No payment transactions found.');
} else {
historyList.replaceChildren(_phFrag);
}
_filterPaymentHistoryByPeriod();
} catch (error) {
console.error('Payment transaction failed.', _safeErr(error));
showToast('Payment transaction failed.', 'error');
}
}

export async function selectEntity(id) {
const entities = ensureArray(await sqliteStore.get('entities'));
selectedEntityId = id; window.selectedEntityId = selectedEntityId;
const entity = entities.find(e => String(e.id) === String(id));
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
}

export async function refreshEntityBalances() {
renderEntityTable();
}

export function getMetricValue(historyItem, metric) {
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

export function getMetricLabel(metric) {
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

export async function deleteFactoryInventoryItem() {
const { inventory, transactions } = await loadCollections('inventory', 'transactions');
if (editingFactoryInventoryId) {
if (!validateUUID(String(editingFactoryInventoryId))) {
window.notifyBlocking('Invalid inventory item ID', 'error', 'Something went wrong');
return;
}
const _diMat = inventory.find(i => i.id === editingFactoryInventoryId);
const _diName = _diMat?.name || 'this item';
const _diQty = (_diMat?.quantity || 0).toFixed(2);
const _diVal = fmtAmt(_diMat?.totalValue || 0);
const _diSupplier = _diMat?.supplierName || null;
const _diPaidTx = _diMat?.supplierId ? transactions.filter(t => t && t.isPayable === true && t.type === 'OUT' && (String(t.materialId) === String(editingFactoryInventoryId) || (Array.isArray(t.materialIds) && t.materialIds.map(String).includes(String(editingFactoryInventoryId))))) : [];
const _diLinkedTx = _diMat?.supplierId ? transactions.filter(t => String(t.materialId) === String(editingFactoryInventoryId) && t.isPayable === true) : [];
let _diMsg = `Permanently delete inventory item "${_diName}" and all its purchase history?`;
_diMsg += `\nCurrent Stock: ${_diQty} kg`;
_diMsg += `\nTotal Value: ${_diVal}`;
if (_diSupplier) {
_diMsg += `\nLinked Supplier: ${_diSupplier}`;
_diMsg += `\n\n\u21a9 Supplier association will be removed.`;
if (_diLinkedTx.length > 0) {
const _diTxTotal = _diLinkedTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
_diMsg += ` ${_diLinkedTx.length} payment transaction${_diLinkedTx.length !== 1 ? 's' : ''} totaling ${fmtAmt(_diTxTotal)} will be reversed and the supplier\'s payable status reset.`;
}
}
if (_diPaidTx.length > 0) {
const _diPaidTotal = _diPaidTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
_diMsg += `\n\n${_diPaidTx.length} payment${_diPaidTx.length !== 1 ? 's' : ''} already made (${fmtAmt(_diPaidTotal)}) will stay on the supplier ledger.`;
}
_diMsg += `\n\n\u26a0 If this material is used in production formulas, those formulas will be affected.`;
_diMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_diMsg, { title: `Delete "${_diName}"`, confirmText: "Delete", danger: true })) {
try {
const material = inventory.find(i => i.id === editingFactoryInventoryId);
const _materialToDelete = material ? { ...material } : null;
const _purchaseLots = inventory.filter(i => i && i.isPurchaseLot === true && String(i.materialRefId) === String(editingFactoryInventoryId));
const _matGroup = ((material && material.supplierId) || _purchaseLots.some(l => l.supplierId)) ? newGroupId('mat') : null;
if (material && material.supplierId) {
await unlinkSupplierFromMaterial(material, false, true, _matGroup);
}
for (const _lot of _purchaseLots) {
if (_lot.supplierId) await unlinkSupplierFromMaterial(_lot, false, true, _matGroup);
const _rest = inventory.filter(i => i.id !== _lot.id);
await unifiedDelete('inventory', _rest, _lot.id, { strict: true }, _matGroup ? stampGroup(_lot, _matGroup) : _lot);
}
const filteredForDelete = inventory.filter(i => i.id !== editingFactoryInventoryId && !_purchaseLots.some(l => l.id === i.id));
await unifiedDelete('inventory', filteredForDelete, editingFactoryInventoryId, { strict: true }, _matGroup ? stampGroup(_materialToDelete, _matGroup) : _materialToDelete);
notifyDataChange('inventory');
triggerAutoSync();
closeFactoryInventoryModal();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof calculateNetCash === 'function') calculateNetCash();
} catch (error) {
window.notifyBlocking('Failed to delete item. Please try again.', 'error', 'Something went wrong');
}
}
}
}

export async function initPaymentData() {
const store = (typeof sqliteStore !== 'undefined' && sqliteStore) || (typeof window !== 'undefined' && window.sqliteStore);
if (!store || typeof store.get !== 'function') {
  setTimeout(initPaymentData, 200);
  return;
}
const expenseCategories = ensureArray(await store.get('categories'));
const entities = ensureArray(await store.get('entities'));
const transactions = ensureArray(await store.get('transactions'));
const expenses = ensureArray(await store.get('expenses'));
const deletedRecordIds = new Set(ensureArray(await store.get('deleted')));
try {
let localEntities = [...entities];
let localTransactions = [...transactions];
let updated = false;
localEntities = localEntities.map(entity => {
updated = false;
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
localTransactions = localTransactions.map(transaction => {
updated = false;
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
transaction.time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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
localTransactions = localTransactions.filter(t =>
t && t.id && (t.type === 'IN' || t.type === 'OUT') && typeof t.amount === 'number'
);
await sqliteStore.set('entities', localEntities);
await sqliteStore.set('transactions', localTransactions);
} catch (e) {
}
}

setTimeout(() => { initPaymentData(); }, 300);

setTimeout(async function initExpenseManager() {
const store = (typeof sqliteStore !== 'undefined' && sqliteStore) || (typeof window !== 'undefined' && window.sqliteStore);
if (!store || typeof store.get !== 'function') {
  setTimeout(initExpenseManager, 200);
  return;
}
const expenses = await store.get('expenses') || [];
let savedCategories = await store.get('categories') || [];
const categoriesFromRecords = [...new Set(
expenses
.filter(e => e && e.name && typeof e.name === 'string')
.map(e => e.name)
)];
const expCatMerged = [...new Set([...savedCategories, ...categoriesFromRecords])];
await store.set('categories', expCatMerged);
if (expCatMerged.length !== (Array.isArray(savedCategories) ? savedCategories.length : 0)) await store.set('categories_timestamp', Date.now());
const expenseDateInput = document.getElementById('expenseDate');
if (expenseDateInput) {
expenseDateInput.value = localDateStr();
}
renderRecentExpenses();
}, 300);

export async function handleExpenseSearch() {
const expenses = ensureArray(await sqliteStore.get('expenses'));
const expenseCategories = ensureArray(await sqliteStore.get('categories'));
const { entities, transactions } = await loadCollections('entities', 'transactions');
const input = document.getElementById('expenseName');
const resultsDiv = document.getElementById('expense-search-results');
const query = input.value.trim().toLowerCase();
if (!query || query.length < 1) {
resultsDiv.classList.add('hidden');
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
resultsDiv.classList.remove('hidden');
}

export function selectExpense(name, type) {
document.getElementById('expenseName').value = name;
document.getElementById('expense-search-results').classList.add('hidden');
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
document.getElementById('expense-search-results').classList.add('hidden');
document.getElementById('expenseAmount').focus();
}

window._expenseCategory = 'OUT';
window._returnStore = null;
window._returnRep = null;

export function selectExpenseCategory(value, clickedBtn) {
window._expenseCategory = value;
['btn-category-operating','btn-category-in','btn-category-out'].forEach(id => {
const btn = document.getElementById(id);
if (btn) btn.classList.remove('active');
});
if (clickedBtn) clickedBtn.classList.add('active');
}

export function selectReturnStore(value, clickedBtn) {
window._returnStore = value;
window._returnRep = null;
_markReturnTargetActive(clickedBtn);
}

export function selectReturnRep(repName, clickedBtn) {
window._returnRep = repName;
window._returnStore = null;
_markReturnTargetActive(clickedBtn);
}

function _markReturnTargetActive(clickedBtn) {
const grp = document.querySelector('#returnStoreSection .toggle-group');
if (grp) grp.querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
if (clickedBtn) clickedBtn.classList.add('active');
}

export async function renderReturnTargets() {
const sec = document.getElementById('returnStoreSection');
const grp = sec && sec.querySelector('.toggle-group');
if (!grp) return;
grp.querySelectorAll('.ret-rep-btn').forEach(b => b.remove());
const seller = (document.getElementById('sellerSelect') || {}).value;
const reps = (Array.isArray(window.salesRepsList) ? window.salesRepsList : []).filter(r => r && r !== seller && r !== 'NONE' && r !== 'ADMIN');
if (window._returnRep && !reps.includes(window._returnRep)) window._returnRep = null;
window.setStyle(grp, 'flex-wrap', 'st-flex-wrap__62da06');
reps.forEach(r => {
const b = document.createElement('button');
b.type = 'button';
b.className = 'toggle-opt ret-rep-btn' + (window._returnRep === r ? ' active' : '');
b.textContent = r;
b.onclick = () => selectReturnRep(r, b);
grp.appendChild(b);
});
}

function _resetExpenseForm() {
['expenseName', 'expenseAmount', 'expenseDescription'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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

export async function startEditPayment(id) {
const txs = ensureArray(await sqliteStore.get('transactions'));
const t = txs.find(x => x && String(x.id) === String(id));
if (!t || t.isMerged) { showToast('This transaction cannot be edited.', 'warning'); return; }
if (t.isTransfer) { showToast('Transfers are edited from the Transfer card.', 'warning'); return; }
if (t.isSettled) { showToast('Settled records cannot be edited.', 'warning'); return; }
if (t.isPayable || t.materialId || parseFloat(t.supplierCreditAmount || 0) > 0) {
showToast('This payment settled a supplier payable or credit. Delete and re-enter it to change it.', 'warning', 5000);
return;
}
if (typeof showTab === 'function') showTab('payments');
const cat = t.isExpense ? 'operating' : t.type;
selectExpenseCategory(cat, document.getElementById('btn-category-' + (cat === 'operating' ? 'operating' : cat.toLowerCase())));
const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val; };
set('expenseName', t.entityName || '');
set('expenseAmount', t.amount);
set('expenseDate', editDateValue(t));
set('expenseDescription', t.description || '');
beginEditMode('payment', t, { buttonId: 'btn-save-expense', watchIds: ['expenseName','expenseAmount','expenseDate','expenseDescription'], label: 'Update Transaction', anchorId: 'expenseName', cancelFn: _resetExpenseForm });
}

export async function startEditExpenseRecord(expenseId) {
const txs = ensureArray(await sqliteStore.get('transactions'));
const t = txs.find(x => x && String(x.expenseId) === String(expenseId));
if (!t) { showToast('No linked transaction found for this expense.', 'warning'); return; }
await startEditPayment(t.id);
}

registerEditHandler('payment', startEditPayment);
registerEditHandler('expense', startEditExpenseRecord);
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
if (typeof renderFactoryInventory === 'function') {
try {
renderFactoryInventory();
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

export function renderRecentExpenses() {
renderExpenseTable();
}

export async function renderExpenseTable(page = 1) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const expenses = ensureArray(await sqliteStore.get('expenses'))
  .filter(item => item && item.id && !deletedRecordIds.has(String(item.id)));
const tbody = document.getElementById('expense-table-body');
const totalEl = document.getElementById('expense-table-total');
const totalAllEl = document.getElementById('total-expenses-all');
if (!tbody) return;
try {
const freshExpenses = await sqliteStore.get('expenses', []);
if (freshExpenses && freshExpenses.length > 0) {
}
} catch (error) {
console.error('Calculation failed.', _safeErr(error));
showToast('Failed to load expense records: ' + (_safeErr(error).message || 'please reload the app'), 'error');
}
const periodFilter = document.getElementById('expensePeriodFilter')?.value || 'month';
const categoryFilter = document.getElementById('expenseCategoryFilter')?.value || 'all';
let filteredExpenses = [...expenses];
const now2 = new Date();
const today = localDateStr(now2);
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
const allTimeTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
const totalItems = filteredExpenses.length;
if (!filteredExpenses || !Array.isArray(filteredExpenses)) {
tbody.innerHTML = `<tr><td class="empty is-danger" colspan="4" >Invalid expense data</td></tr>`;
if (totalEl) totalEl.textContent = '0';
if (totalAllEl) totalAllEl.textContent = '0';
return;
}
if (totalEl) totalEl.textContent = `${fmtAmt(periodTotal)}`;
if (totalAllEl) totalAllEl.textContent = `${fmtAmt(allTimeTotal)}`;
if (totalItems === 0) {
tbody.innerHTML = `
<tr>
<td class="empty" colspan="4" >
No expenses found for selected period
</td>
</tr>`;
return;
}
const fragment = document.createDocumentFragment();
filteredExpenses.forEach(expense => {
const categoryColor = getCategoryColor(expense.category);
const categoryLabel = getCategoryLabel(expense.category);
const formattedDate = formatExpenseDate(expense.date);
const tr = document.createElement('tr');
tr.classList.add('st-border-bottom__78f854', 'st-transition__901d69');
tr.onmouseover = function() { window.setStyle(this, 'background', 'st-background__ebfb68'); };
tr.onmouseout = function() { window.setStyle(this, 'background', 'st-background__a8869d'); };
tr.innerHTML = `
<td class="u-2bc4a44">
${formattedDate}
</td>
<td class="u-bbe1428">
${esc(expense.name)}${expense.isMerged ? _mergedBadgeHtml(expense, {inline:true}) : ''}
${expense.description ? `<br><span class="u-fs-sm2 u-text-muted u-fw-400" >${esc(expense.description)}</span>` : ''}
</td>
<td class="u-74366ec">
<span class="dc-background dc-color st-padding__f26165 st-border-radius__0dc840 st-font-size__8e87b7 st-font-weight__eed0f8 u-1cd2eeb" style="--d-background: ${categoryColor}15; --d-color: ${categoryColor}">${esc(categoryLabel)}</span>
</td>
<td class="u-bd37878 text-right">
${fmtAmt(expense.amount)}
</td>
<td class="u-1d3001e">
<button
onclick="openExpenseEntityDetails('${esc(expense.id)}')" class="btn btn-theme btn-sm hv-lift"
>
Manage
</button>
</td>
`;
fragment.appendChild(tr);
});
tbody.replaceChildren(fragment);
}

export async function renderUnifiedTable(page = 1) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const _notDeleted = (item) => item && item.id && !deletedRecordIds.has(String(item.id));
const inventory = ensureArray(await sqliteStore.get('inventory')).filter(_notDeleted);
const entities = ensureArray(await sqliteStore.get('entities')).filter(_notDeleted);
const transactions = ensureArray(await sqliteStore.get('transactions')).filter(_notDeleted);
const expenses = ensureArray(await sqliteStore.get('expenses')).filter(_notDeleted);
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
expenses.forEach(exp => {
if (!exp || !exp.date) return;
const expDate = new Date(exp.date);
if (expDate < startDate) return;
if (exp.category === 'operating') {
const amount = parseFloat(exp.amount) || 0;
totalExpenses += amount;
}
});
const supplierIdSet = new Set();
if (typeof inventory !== 'undefined') {
inventory.forEach(m => { if (m.supplierId) supplierIdSet.add(String(m.supplierId)); });
}
if (typeof transactions !== 'undefined') {
transactions.forEach(t => {
if (t.isPayable && t.type === 'IN' && t.supplierCreditAmount) {
supplierIdSet.add(String(t.entityId));
}
});
}
const supplierBalances = {};
if (typeof inventory !== 'undefined') {
inventory.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0 && hasLiveSupplierInvoice(material, transactions)) {
const sid = String(material.supplierId);
supplierBalances[sid] = (supplierBalances[sid] || 0) + material.totalPayable;
}
});
}
const entityBalances = {};
entities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
if (supplierIdSet.has(String(entity.id))) return;
entityBalances[entity.id] = 0;
});
if (typeof transactions !== 'undefined') {
transactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (supplierIdSet.has(String(transaction.entityId))) return;
if (isOrphanSupplierTx(transaction, inventory)) return;
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
if (typeof transactions !== 'undefined') {
transactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (!transaction.isPayable || transaction.type !== 'IN') return;
if (!transaction.supplierCreditAmount) return;
const creditAmt = parseFloat(transaction.supplierCreditAmount) || 0;
if (creditAmt > 0) {
totalSupplierPayables += creditAmt;
totalPayables += creditAmt;
supplierIdSet.add(String(transaction.entityId));
}
});
}
for (const entityId in entityBalances) {
const balance = entityBalances[entityId];
if (balance > 0) { totalEntityPayables += balance; totalPayables += balance; }
if (balance < 0) totalReceivables += Math.abs(balance);
}
if (viewMode === 'transactions') {
const expenseGroups = {};
expenses.forEach(exp => {
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
const dateLabel = formatDayMonthYear(d);
rows.push({
type: 'transaction',
date: grp.latestDate,
dateStr: dateLabel,
name: grp.name,
contact: 'Operating',
typeLabel: 'EXPENSE',
amount: grp.totalAmount,
amountStr: `${fmtAmt(grp.totalAmount)}`,
color: 'var(--warning)',
id: grp.latestId,
description: grp.count > 1 ? `${grp.count} transactions` : ''
});
});
}
if (viewMode === 'entities') {
const supplierIds = new Set();
if (typeof inventory !== 'undefined') {
inventory.forEach(m => { if (m.supplierId) supplierIds.add(String(m.supplierId)); });
}
if (typeof transactions !== 'undefined') {
transactions.forEach(t => {
if (t.isPayable && t.type === 'IN' && t.supplierCreditAmount) {
supplierIds.add(String(t.entityId));
}
});
}
const supplierEntityBalances = {};
if (typeof inventory !== 'undefined') {
inventory.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0 && hasLiveSupplierInvoice(material, transactions)) {
const sid = String(material.supplierId);
supplierEntityBalances[sid] = (supplierEntityBalances[sid] || 0) + material.totalPayable;
}
});
}
if (typeof transactions !== 'undefined') {
transactions.forEach(t => {
if (!t.isPayable || t.type !== 'IN' || !t.supplierCreditAmount) return;
const creditAmt = parseFloat(t.supplierCreditAmount) || 0;
if (creditAmt > 0) {
const sid = String(t.entityId);
supplierEntityBalances[sid] = (supplierEntityBalances[sid] || 0) + creditAmt;
}
});
}
const entityBalances = {};
entities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
if (supplierIds.has(String(entity.id))) return;
entityBalances[entity.id] = 0;
});
if (typeof transactions !== 'undefined') {
transactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (supplierIds.has(String(transaction.entityId))) return;
if (isOrphanSupplierTx(transaction, inventory)) return;
if (entityBalances[transaction.entityId] !== undefined) {
if (transaction.type === 'OUT') {
entityBalances[transaction.entityId] -= parseFloat(transaction.amount) || 0;
} else if (transaction.type === 'IN') {
entityBalances[transaction.entityId] += parseFloat(transaction.amount) || 0;
}
}
});
}
entities.forEach(entity => {
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
if (entity.balance !== undefined && entity.balance !== null && typeof transactions === 'undefined') {
balance = parseFloat(entity.balance) || 0;
}
const contactInfo = entityPhone || entityWallet || 'No contact';
const entityDate = entity.createdAt ? new Date(entity.createdAt) : new Date();
const dateStr = (() => {
return formatDayMonthYear(entityDate);
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
const amountStr = `${fmtAmt(Math.abs(balance))}`;
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
const totalItems = rows.length;
if (!rows || !Array.isArray(rows)) {
tbody.innerHTML = rlEmptyHtml('Records could not be read', 'Reload the app and try again.');
if (totalSpan) totalSpan.textContent = '0';
return;
}
if (rows.length === 0) {
tbody.innerHTML = rlEmptyHtml('No records match your filters', 'Change the period or search to see more.');
if (totalSpan) totalSpan.textContent = '0';
return;
}
const _rlPhotos = (await sqliteStore.get('photos')) || {};
const buildUnifiedRow = (row) => {
if (row.type === 'transaction') {
return rlRowHtml({
name: row.name,
tone: 'warn',
details: [phoneActionHTML(row.contact), row.description ? `<span class="rl-muted">${esc(row.description)}</span>` : ''],
amount: row.amountStr,
onOpen: `openExpenseEntityDetails('${rlJsArg(row.id)}')`
});
}
const tone = row.balanceLabel === 'PAYABLE' ? 'debt' : row.balanceLabel === 'RECEIVABLE' ? 'credit' : 'clear';
return rlRowHtml({
name: row.name,
photo: rlPhoto(_rlPhotos, 'entity:' + String(row.id)),
tone,
details: [phoneActionHTML(row.contact)],
amount: row.amountStr,
onOpen: `openEntityDetailsOverlay('${rlJsArg(row.id)}')`
});
};
tbody.innerHTML = rows.map(buildUnifiedRow).join('');
if (viewMode === 'entities') {
if (footerLabel) footerLabel.textContent = 'Net Balance:';
if (totalSpan) {
const netBalance = totalReceivables - totalPayables;
totalSpan.textContent = `${fmtAmt(Math.abs(netBalance))}`;
window.setStyle(totalSpan, 'color', netBalance >= 0 ? 'st-color__a4c6ac' : 'st-color__497726');
}
} else {
if (footerLabel) footerLabel.textContent = 'Net Total:';
if (totalSpan) {
totalSpan.textContent = `${fmtAmt(totalAmount)}`;
window.setStyle(totalSpan, 'color', totalAmount >= 0 ? 'st-color__a4c6ac' : 'st-color__497726');
}
}
if (summaryDiv) {
window.setDisplay(summaryDiv, 'block');
const receivablesEl = document.getElementById('unified-receivables');
const payablesEl = document.getElementById('unified-payables');
const supplierPayablesEl = document.getElementById('unified-supplier-payables');
const entityPayablesEl = document.getElementById('unified-entity-payables');
const expensesEl = document.getElementById('unified-expenses');
if (receivablesEl) receivablesEl.textContent = fmtAmt(totalReceivables);
if (payablesEl) payablesEl.textContent = fmtAmt(totalPayables);
if (supplierPayablesEl) supplierPayablesEl.textContent = fmtAmt(totalSupplierPayables);
if (entityPayablesEl) entityPayablesEl.textContent = fmtAmt(totalEntityPayables);
if (expensesEl) expensesEl.textContent = fmtAmt(totalExpenses);
}
_filterPaymentHistoryByPeriod();
}

export async function updateExpenseBreakdown() {
const expenses = ensureArray(await sqliteStore.get('expenses'));
const container = document.getElementById('expense-breakdown-container');
if (!container) return;
const categoryTotals = {};
let totalExpenses = 0;
expenses.forEach(exp => {
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
container.innerHTML = '<div class="u-76336ea">No operating expenses</div>';
return;
}
let html = '';
sortedCategories.forEach(([name, amount]) => {
const percentage = totalExpenses > 0 ? (amount / totalExpenses * 100).toFixed(2) : 0;
html += `
<div class="u-5bb520e d-flex">
<span class="u-text-main" >${name}:</span>
<div class="text-right">
<span class="u-d2c10bd">${formatCurrency(amount)}</span>
<span class="u-b51a44d">(${percentage}%)</span>
</div>
</div>`;
});
if (Object.keys(categoryTotals).length > 5) {
const othersCount = Object.keys(categoryTotals).length - 5;
html += `<div class="u-976e6b7">${othersCount} more categories
</div>`;
}
container.innerHTML = html;
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

export function formatExpenseDate(dateString) {
const date = new Date(dateString);
return formatDayMonthYear(date);
}

export function toSafeDate(value) {
if (!value) return null;
if (typeof value === 'object' && value !== null && typeof value.seconds === 'number') {
return new Date(value.seconds * 1000);
}
if (value instanceof Date) return value;
const d = new Date(value);
return isNaN(d.getTime()) ? null : d;
}

export function formatDisplayDate(dateInput) {
if (!dateInput) return '-';
const date = toSafeDate(dateInput);
if (!date || isNaN(date.getTime())) return '-';
return formatDayMonthYear(date);
}

export function formatDisplayDateTime(dateInput, timeStr) {
const datePart = formatDisplayDate(dateInput);
if (!timeStr) return datePart;
return `${datePart} @ ${timeStr}`;
}

export async function openExpenseEntityDetails(expenseId) {
const { entities, expenses } = await loadCollections('entities', 'expenses');
const expense = expenses.find(e => e.id === expenseId);
if (!expense) {
showToast('Expense not found', 'error');
return;
}
if (expense.category === 'operating') {
await openOperatingExpenseOverlay(expense.name);
return;
}
const entity = entities.find(e =>
e.name.toLowerCase() === expense.name.toLowerCase()
);
if (entity) {
openEntityDetailsOverlay(entity.id);
} else {
showToast('Entity not found for this expense', 'warning');
}
}

export async function openOperatingExpenseOverlay(expenseName) {
currentExpenseOverlayName = expenseName; window.currentExpenseOverlayName = currentExpenseOverlayName;
const labelEl = document.getElementById('quickExpenseNameLabel');
if (labelEl) labelEl.textContent = expenseName;
const qAmount = document.getElementById('quickExpenseAmount');
const qDesc = document.getElementById('quickExpenseDescription');
if (qAmount) qAmount.value = '';
if (qDesc) qDesc.value = '';
const rangeEl = document.getElementById('expenseOverlayRange');
if (rangeEl) rangeEl.value = 'all';
requestAnimationFrame(() => {
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('expense-details-screen');
});
renderExpenseOverlayContent();
}

export function closeExpenseDetailsOverlay() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('expense-details-screen');
currentExpenseOverlayName = null; window.currentExpenseOverlayName = currentExpenseOverlayName;
refreshPaymentTab();
}

export async function renderExpenseOverlayContent() {
const { expenses } = await loadCollections('expenses');
const expenseName = currentExpenseOverlayName;
if (!expenseName) return;
const titleEl = document.getElementById('expenseOverlayTitle');
if (titleEl) titleEl.innerText = expenseName;
const rangeEl = document.getElementById('expenseOverlayRange');
const range = rangeEl ? rangeEl.value : 'all';
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let relatedExpenses = expenses.filter(e =>
e.category === 'operating' &&
e.name.toLowerCase() === expenseName.toLowerCase()
);
if (range !== 'all') {
relatedExpenses = relatedExpenses.filter(e => {
if (!e.date) return false;
const d = new Date(e.date);
const _cutoff = rangeCutoffDate(range, today);
return !_cutoff || d >= _cutoff;
});
}
relatedExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
const allTimeTotal = expenses
.filter(e => e.category === 'operating' && e.name.toLowerCase() === expenseName.toLowerCase())
.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const filteredTotal = relatedExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const count = relatedExpenses.length;
const statsEl = document.getElementById('expenseOverlayStats');
if (statsEl) {
statsEl.innerHTML = `
<span class="u-a5b525a">Total: ${fmtAmt(filteredTotal)}</span>
<span class="u-d2c7c73 d-inline-flex">
<span class="badge txn-stat-badge txn-warning">${count} record${count !== 1 ? 's' : ''}</span>
<span class="badge txn-stat-badge txn-out">All-Time: ${fmtAmt(allTimeTotal)}</span>
</span>`;
}
const list = document.getElementById('expenseManagementHistoryList');
if (!list) return;
if (relatedExpenses.length === 0) {
list.replaceChildren(Object.assign(document.createElement('div'), {className:'empty',textContent:'No expense records found for selected period'}));
return;
}
const _expFrag = document.createDocumentFragment();
relatedExpenses.forEach(exp => {
const item = document.createElement('div');
item.className = 'card cust-history-item';
const _expPhotoBadgeId = 'ph-badge-exp-' + String(exp.id).replace(/[^a-z0-9]/gi, '');
item.innerHTML = `
<div class="cust-history-info">
<div class="u-fs-sm2 u-text-muted" >${formatDisplayDateTime(exp.date, exp.time || null)}${exp.isMerged ? _mergedBadgeHtml(exp, {inline:true}) : ''}</div>
<div class="u-fs-sm2 u-text-muted" >${esc(exp.description || 'No description')}</div>
</div>
<div class="u-d94b2d8 d-flex">
<div class="u-1d673f2 text-right">
<span class="badge txn-label-badge txn-warning">EXPENSE</span>
<div class="cost-val u-bb4c6c9">${fmtAmt(parseFloat(exp.amount) || 0)}</div>
</div>
<button class="d-none st-align-items__7c6197 st-padding__dd269a st-border__2eda1d st-border-radius__0dc840 st-cursor__3b6a3a st-font-size__8303b5 st-font-weight__e3ec02 st-background__c6ed62 st-color__2a7210 u-45da04f" id="${_expPhotoBadgeId}" title="View photo" onclick="(async()=>{const ph=(await sqliteStore.get('photos'))||{};const d=ph['expense:${esc(exp.id)}'];if(d)openPhotoLightbox(d);else showToast('No photo','warning',1500);})()"
 >
  <svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-b62856e"><path d="M4 13A3.2 3.2 0 0 1 7.2 9.8H10.4L12.6 6.5H23.4L25.6 9.8H28.8A3.2 3.2 0 0 1 32 13V27A3.2 3.2 0 0 1 28.8 30.2H7.2A3.2 3.2 0 0 1 4 27Z" fill="currentColor" fill-opacity="0.13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="18" cy="19.5" r="5.8" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="19.5" r="2" fill="currentColor"/><circle cx="27.5" cy="14" r="1.3" fill="currentColor"/></svg>
  Photo
</button>
${exp.isMerged ? '' : `<button class="btn btn-sm btn-danger u-p-4-8" onclick="deleteExpenseFromOverlay('${esc(exp.id)}')">⌫</button><button class="btn btn-sm u-p-4-8 st-color__a80552 st-border-bottom__89f1f8 st-background__a8869d" onclick="startEdit('expense','${esc(exp.id)}')">✎</button>`}
</div>
`;
_expFrag.appendChild(item);
const _expPhKey = 'expense:' + exp.id;
sqliteStore.get('photos').then(ph => {
  if (ph && ph[_expPhKey]) {
    const badge = document.getElementById(_expPhotoBadgeId);
    if (badge) window.setDisplay(badge, 'inline-flex');
  }
}).catch(() => {});
});
list.replaceChildren(_expFrag);
}

export function filterExpenseManagementHistory() {
const term = document.getElementById('expense-history-search').value.toLowerCase();
const items = document.querySelectorAll('#expenseManagementHistoryList .cust-history-item');
items.forEach(item => {
window.setDisplay(item, item.innerText.toLowerCase().includes(term) ? 'flex' : 'none');
});
}

export async function deleteExpenseFromOverlay(expenseId) {
await deleteExpense(expenseId);
const overlayEl = document.getElementById('expense-details-screen');
if (overlayEl && window.getDisplay(overlayEl) !== 'none' && currentExpenseOverlayName) {
renderExpenseOverlayContent();
}
}

export function saveQuickExpenseEntry(...a) { return confirmGuard('saveQuickExpenseEntry', () => _saveQuickExpenseEntryRaw(...a), { label: 'Expense', late: true, fields: [['quickExpenseAmount', 'Amount'], ['quickExpenseDescription', 'Note']] }); }

async function _saveQuickExpenseEntryRaw() {
const { expenses } = await loadCollections('expenses');
const amountEl = document.getElementById('quickExpenseAmount');
const descEl = document.getElementById('quickExpenseDescription');
if (!amountEl) return;
const amount = parseFloat(amountEl.value);
if (!amount || amount <= 0) {
window.notifyBlocking('Please enter a valid amount', 'warning', 'Warning');
return;
}
const expenseName = currentExpenseOverlayName;
if (!expenseName) {
window.notifyBlocking('No expense category selected. Please close and reopen the expense panel.', 'warning', 'Warning');
return;
}
const _sqeeAvail = await getAvailableCashInHand();
if (_sqeeAvail < amount) {
window.notifyBlocking(redactMoney(`Insufficient cash in hand. Available: ${fmtAmt(Math.max(0, _sqeeAvail))} — Required: ${fmtAmt(amount)}`, 'Insufficient cash in hand.'), 'error', 'Low cash in hand');
return;
}
if (!(await window.gcCommit({}))) return;
try {
const now = new Date();
const dateStr = localDateStr(now);
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
expenses.push(newExpense);
await unifiedSave('expenses', expenses, newExpense);
notifyDataChange('expenses');
showToast(` Expense added under "${expenseName}"`, 'success');
if (amountEl) amountEl.value = '';
if (descEl) descEl.value = '';
renderExpenseOverlayContent();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
} catch (error) {
window.notifyBlocking('Failed to save expense. Please try again.', 'error', 'Something went wrong');
}
}

export async function deleteAllExpensesByName() {
const { expenses, transactions } = await loadCollections('expenses', 'transactions');
const expenseName = currentExpenseOverlayName;
if (!expenseName) return;
const toDelete = expenses.filter(e =>
e.category === 'operating' &&
e.name.toLowerCase() === expenseName.toLowerCase()
);
if (toDelete.length === 0) {
closeExpenseDetailsOverlay();
return;
}
for (const exp of toDelete) {
const _daeBlk = await getExpenseLinkedTxBlockReason(exp.id, { allTxs: transactions });
if (_daeBlk) { window.notifyBlocking(_daeBlk, 'warning', 'Warning'); return; }
}
const _daeTotal = toDelete.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const _daeDateRange = toDelete.length > 1 ? ` (${toDelete[toDelete.length-1].date} – ${toDelete[0].date})` : (toDelete[0]?.date ? ` on ${toDelete[0].date}` : '');
const _daeTxCount = transactions.filter(t => toDelete.some(e => e.id === t.expenseId)).length;
let _daeMsg = `Permanently delete ALL ${toDelete.length} expense record${toDelete.length !== 1 ? 's' : ''} for "${expenseName}"?`;
_daeMsg += `\nTotal Amount: ${fmtAmt(_daeTotal)}`;
if (toDelete.length > 1) _daeMsg += `\nDate Range: ${toDelete[toDelete.length-1].date} – ${toDelete[0].date}`;
else if (toDelete[0]?.date) _daeMsg += `\nDate: ${toDelete[0].date}`;
if (_daeTxCount > 0) _daeMsg += `\n\n↩ ${_daeTxCount} linked payment transaction${_daeTxCount !== 1 ? 's' : ''} will also be reversed.`;
_daeMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(_daeMsg, { title: `Delete All "${expenseName}" Records`, confirmText: "Delete All", danger: true }))) return;
try {
const _bulkPhotoKeysToDelete = [];
for (const exp of toDelete) {
const linked = ensureArray(await sqliteStore.get('transactions')).filter(t => t && t.expenseId === exp.id);
const _bulkGroup = linked.length ? newGroupId('exp') : null;
for (const tx of linked) {
const _ptFilteredExp = ensureArray(await sqliteStore.get('transactions')).filter(t => t.id !== tx.id);
await unifiedDelete('transactions', _ptFilteredExp, tx.id, { strict: true }, stampGroup(tx, _bulkGroup));
}
const _expFiltered = ensureArray(await sqliteStore.get('expenses')).filter(e => e.id !== exp.id);
await unifiedDelete('expenses', _expFiltered, exp.id, { strict: true }, _bulkGroup ? stampGroup(exp, _bulkGroup) : exp);
_bulkPhotoKeysToDelete.push('expense:' + exp.id);
}
try {
  const _bulkPh = (await sqliteStore.get('photos')) || {};
  const _bulkPhTs = (await sqliteStore.get('photostamps')) || {};
  const _bulkDk = (await sqliteStore.get('photodirty')) || [];
  let _bulkPhChanged = false;
  for (const _bKey of _bulkPhotoKeysToDelete) {
    if (_bulkPh[_bKey] !== undefined) {
      delete _bulkPh[_bKey];
      delete _bulkPhTs[_bKey];
      if (!_bulkDk.includes(_bKey)) _bulkDk.push(_bKey);
      _bulkPhChanged = true;
    }
  }
  if (_bulkPhChanged) {
    await sqliteStore.set('photos', _bulkPh);
    await sqliteStore.set('photostamps', _bulkPhTs);
    await sqliteStore.set('photodirty', _bulkDk);
    if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
  }
} catch(_bulkPhErr) { console.warn('[deleteAllExpenses] photo batch cleanup failed', _bulkPhErr); }
notifyDataChange('expenses');
closeExpenseDetailsOverlay();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderRecentExpenses === 'function') renderRecentExpenses();
} catch (error) {
window.notifyBlocking('Failed to delete all expense records. Please try again.', 'error', 'Something went wrong');
}
}

export async function exportExpenseOverlayToPDF() {
const expenses = ensureArray(await sqliteStore.get('expenses'));
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
let records = expenses.filter(e =>
e.category === 'operating' &&
e.name && e.name.toLowerCase() === expenseName.toLowerCase()
);
if (range !== 'all') {
records = records.filter(e => {
if (!e.date) return false;
const d = new Date(e.date);
const _cutoff = rangeCutoffDate(range, today);
return !_cutoff || d >= _cutoff;
});
}
records.sort((a, b) => new Date(a.date) - new Date(b.date));
const total = records.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
const rangeName = range === 'all' ? 'All Time' : _cap(range);
const { jsPDF } = window.jspdf;
const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
const pageW = doc.internal.pageSize.getWidth();
const hdrColor = [255, 149, 0];
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
doc.text(`Expense History: ${expenseName}`, pageW/2, 30, { align:'center' });
doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(80,80,80);
doc.setFont(undefined,'bold'); doc.text('Period:', 14, 38);
doc.setFont(undefined,'normal'); doc.text(rangeName, 34, 38);
doc.setFont(undefined,'bold'); doc.text('Records:', 75, 38);
doc.setFont(undefined,'normal'); doc.text(String(records.length), 98, 38);
doc.setFont(undefined,'bold'); doc.text('Total:', 120, 38);
doc.setFont(undefined,'normal'); doc.setTextColor(...hdrColor); doc.setFont(undefined,'bold');
doc.text(fmtAmt(total), 138, 38);
doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
doc.setFont(undefined,'bold'); doc.text('Generated:', 14, 44);
doc.setFont(undefined,'normal'); doc.text(formatDayMonthYear(now) + ' at ' + now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}), 42, 44);
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
      fmtAmt(parseFloat(e.amount)||0),
      '\u2605 MERGED'
    ];
  });
  doc.autoTable({startY:tableStartY,head:[['Year Period','Summary','Amount','Note']],body:mergedRows,theme:'grid',
    headStyles:{fillColor:PDF_MERGED_HDR_COLOR,textColor:255,fontSize:9,fontStyle:'bold',halign:'center'},
    styles:{fontSize:8.5,cellPadding:3,lineWidth:0.15,lineColor:[200,180,230],overflow:'linebreak'},
    columnStyles:{0:{cellWidth:30,halign:'center'},1:{cellWidth:85},2:{cellWidth:30,halign:'right',fontStyle:'bold'},3:{cellWidth:31,halign:'center',fontStyle:'bold'}},
    didParseCell:function(data){data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR;data.cell.styles.textColor=[80,40,120];if(data.column.index===2)data.cell.styles.textColor=[140,60,180];if(data.column.index===3)data.cell.styles.textColor=[126,34,206];},
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
fmtAmt(parseFloat(e.amount) || 0),
fmtAmt(runningTotal)
];
});
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
didParseCell: function(data) {},
margin: { left: 14, right: 14 }
});
if (range === 'all' && records.length > 5) {
const afterY = doc.lastAutoTable.finalY + 8;
if (afterY < 258) {
const monthTotals = {};
records.forEach(e => {
if (!e.date) return;
const d = new Date(e.date);
const key = formatMonthYear(d);
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
doc.text(fmtAmt(amt), 60, bkY);
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
`Generated on ${formatDayMonthYear(now)} at ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW/2, 291, { align:'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW/2, 287, { align:'center' });
}
doc.save(`Expense_${expenseName.replace(/\s+/g,'_')}_${range}_${localDateStr()}.pdf`);
showToast('PDF exported successfully', 'success');
} catch (error) {
showToast('Failed to export PDF: ' + error.message, 'error');
}
}

export async function deleteExpense(expenseId) {
const { inventory, expenses, transactions, entities } = await loadCollections('inventory', 'expenses', 'transactions', 'entities');
if (!expenseId || !validateUUID(expenseId)) {
window.notifyBlocking('Invalid expense ID', 'error', 'Something went wrong');
return;
}
const expense = expenses.find(e => e.id === expenseId);
if (!expense) {
const orphans = transactions.filter(t => t.expenseId === expenseId);
if (orphans.length > 0) {
const _orphBlock = await getExpenseLinkedTxBlockReason(expenseId, { allTxs: transactions });
if (_orphBlock) { window.notifyBlocking(_orphBlock, 'warning', 'Warning'); return; }
const _orphGroup = newGroupId('exp');
await _reconcileSupplierLinksForDeletedTransactions(orphans.filter(t => t.isPayable === true), transactions, inventory, { groupId: _orphGroup });
const orphansCopy = orphans.filter(tx => transactions.some(t => t.id === tx.id));
for (const tx of orphansCopy) {
const _ptFilteredDelExp = transactions.filter(t => t.id !== tx.id);
await unifiedDelete('transactions', _ptFilteredDelExp, tx.id, { strict: true }, stampGroup(tx, _orphGroup));
}
}
renderRecentExpenses();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
return;
}
const linkedTransactions = transactions.filter(t => t.expenseId === expenseId);
const _expLinkBlock = await getExpenseLinkedTxBlockReason(expenseId, { allTxs: transactions });
if (_expLinkBlock) { window.notifyBlocking(_expLinkBlock, 'warning', 'Warning'); return; }
const categoryLabel = expense.category === 'operating' ? 'Operating Expense'
: expense.category === 'IN' ? 'Payment IN'
: expense.category === 'OUT' ? 'Payment OUT'
: 'Expense';
const _dePayableOuts = linkedTransactions.filter(t => t.type === 'OUT' && t.isPayable === true);
const _deEntityIds = [...new Set(_dePayableOuts.map(t => t.entityId))];
const _deEntityNames = _deEntityIds.map(eid => { const e = entities.find(x => String(x.id) === String(eid)); return e?.name || 'Supplier'; });
let confirmMsg = `Permanently delete this ${categoryLabel}?`;
confirmMsg += `\n\nName: ${expense.name || 'Unnamed'}`;
confirmMsg += `\nAmount: ${(parseFloat(expense.amount)||0).toFixed(2)}`;
confirmMsg += `\nDate: ${expense.date || 'Unknown'}`;
if (expense.description) confirmMsg += `\nNote: ${expense.description}`;
if (linkedTransactions.length > 0) {
const _deTxTotal = linkedTransactions.reduce((s, t) => s + (parseFloat(t.amount)||0), 0);
confirmMsg += `\n\n\u21a9 ${linkedTransactions.length} linked payment transaction${linkedTransactions.length !== 1 ? 's' : ''} (${fmtAmt(_deTxTotal)}) will be reversed.`;
if (_deEntityNames.length > 0) confirmMsg += `\n Suppliers affected: ${_deEntityNames.join(', ')} — payable status will be reset to pending.`;
}
confirmMsg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(confirmMsg, { title: `Delete ${categoryLabel}`, confirmText: "Delete", danger: true }))) return;
try {
const txToDelete = transactions.filter(t => t.expenseId === expenseId);
const _expGroup = newGroupId('exp');
await _reconcileSupplierLinksForDeletedTransactions(txToDelete.filter(t => t.isPayable === true), transactions, inventory, { groupId: _expGroup });
if (txToDelete.length > 0) {
let _expRemaining = transactions.slice();
for (const trans of txToDelete) {
_expRemaining = _expRemaining.filter(t => t.id !== trans.id);
await unifiedDelete('transactions', _expRemaining, trans.id, { strict: true }, stampGroup(trans, _expGroup));
}
}
const _expRecFiltered = expenses.filter(e => e.id !== expenseId);
await unifiedDelete('expenses', _expRecFiltered, expenseId, { strict: true }, txToDelete.length ? stampGroup(expense, _expGroup) : expense);
try {
  const _delPhotoKey = 'expense:' + expenseId;
  const _delPhotos = (await sqliteStore.get('photos')) || {};
  if (_delPhotos[_delPhotoKey] !== undefined) {
    delete _delPhotos[_delPhotoKey];
    await sqliteStore.set('photos', _delPhotos);
    const _delPhTs = (await sqliteStore.get('photostamps')) || {};
    delete _delPhTs[_delPhotoKey];
    await sqliteStore.set('photostamps', _delPhTs);
    const _delDk = (await sqliteStore.get('photodirty')) || [];
    if (!_delDk.includes(_delPhotoKey)) _delDk.push(_delPhotoKey);
    await sqliteStore.set('photodirty', _delDk);
    if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
  }
} catch(_delPhErr) { console.warn('[deleteExpense] photo cleanup failed', _delPhErr); }
notifyDataChange('expenses');
renderRecentExpenses();
await _refreshSupplierLinkViews();
const label = expense.category === 'operating' ? 'Expense' : `Payment ${expense.category}`;
} catch (error) {
window.notifyBlocking('Failed to delete expense. Please try again.', 'error', 'Something went wrong');
}
}

export function clearExpenseForm() {
document.getElementById('expenseName').value = '';
document.getElementById('expenseAmount').value = '';
document.getElementById('expenseDescription').value = '';
document.getElementById('expenseDate').value = localDateStr();
document.getElementById('expense-search-results').classList.add('hidden');
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

export function getCategoryColor(category) {
switch(category) {
case 'operating': return 'var(--danger)';
case 'loan': return 'var(--warning)';
case 'misc': return 'var(--accent)';
default: return 'var(--text-muted)';
}
}

export function getCategoryLabel(category) {
switch(category) {
case 'operating': return 'Operating';
case 'loan': return ' Loan/Debt';
case 'misc': return ' Miscellaneous';
default: return 'Other';
}
}

export function openDataMenu() {
if (appMode === 'rep') {
return;
}
if (typeof updateSyncButton === 'function') updateSyncButton();
if (typeof performOneClickSync === 'function') {
performOneClickSync().catch(function(e){console.error('[openDataMenu] sync error:', _safeErr(e))});
}
}

export function closeDataMenu() {
}

export const _recoveredThisSession = new Set();

export async function purgeRecoveredId(id, collectionName, cleanRecord, newId) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
  const sid    = String(id);
  const newSid = newId ? String(newId) : sid;
  _recoveredThisSession.add(sid);
  deletedRecordIds.delete(sid);
  if (typeof deletionRecords !== 'undefined' && Array.isArray(deletionRecords)) {
  }
  try {
    const freshDeletionRecords = await sqliteStore.get('deletions', []);
    const prunedDeletionRecords = Array.isArray(freshDeletionRecords)
      ? freshDeletionRecords.filter(r => r.id !== sid && r.recordId !== sid)
      : [];
    await sqliteStore.set('deletions', prunedDeletionRecords);
  } catch(e) { console.warn('[RecycleBin] purge SQLite deletions failed:', _safeErr(e)); }
  try {
    await sqliteStore.set('deleted', Array.from(deletedRecordIds));
  } catch(e) { console.warn('[RecycleBin] purge SQLite deleted failed:', _safeErr(e)); }
  if (typeof OfflineQueue !== 'undefined') {
    const _isStaleDeleteOp = (item) => {
      const op = item.operation || {};
      return (
        (op.action === 'delete' && op.docId === sid) ||
        (op.action === 'set'    && op.docId === sid && (op.data === null || op.data === undefined))
      );
    };
    const qBefore = OfflineQueue.queue.length;
    OfflineQueue.queue = OfflineQueue.queue.filter(item => !_isStaleDeleteOp(item));
    if (OfflineQueue.queue.length !== qBefore) {
      try { await OfflineQueue.saveQueue(); } catch(e) {}
    }
    const dlBefore = (OfflineQueue.deadLetterQueue || []).length;
    if (Array.isArray(OfflineQueue.deadLetterQueue)) {
      OfflineQueue.deadLetterQueue = OfflineQueue.deadLetterQueue.filter(item => !_isStaleDeleteOp(item));
      if (OfflineQueue.deadLetterQueue.length !== dlBefore) {
        try { await OfflineQueue.saveDeadLetterQueue(); } catch(e) {}
      }
    }
  }
  if (firebaseDB && currentUser) {
    (async () => {
      try {
        const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
        const batch = firebaseDB.batch();
        batch.delete(userRef.collection('deletions').doc(sid));
        if (cleanRecord && collectionName) {
          const sanitized = typeof sanitizeForFirestore === 'function'
            ? sanitizeForFirestore({ ...cleanRecord, syncedAt: new Date().toISOString() })
            : { ...cleanRecord, syncedAt: new Date().toISOString() };
          sanitized.id = newSid;
          delete sanitized.originalId;
          sanitized.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
          batch.set(
            userRef.collection(collectionName).doc(newSid),
            sanitized,
            { merge: true }
          );
        }
        await batch.commit();
        trackFirestoreWrite(cleanRecord ? 2 : 1);
      } catch(e) {
        console.warn('[RecycleBin] Cloud purge failed — queuing for retry:', _safeErr(e));
        if (typeof OfflineQueue !== 'undefined') {
          await OfflineQueue.add({
            action: 'delete',
            collection: 'deletions',
            docId: sid,
            data: null
          });
          if (cleanRecord && collectionName) {
            const queuedRecord = typeof sanitizeForFirestore === 'function'
              ? sanitizeForFirestore({ ...cleanRecord, syncedAt: new Date().toISOString() })
              : { ...cleanRecord, syncedAt: new Date().toISOString() };
            queuedRecord.id = newSid;
            delete queuedRecord.originalId;
            await OfflineQueue.add({
              action: 'set',
              collection: collectionName,
              docId: newSid,
              data: queuedRecord
            });
          }
        }
      }
    })();
  }
}

window.purgeRecoveredId = purgeRecoveredId;

export async function _findPairedTransferTombstone(currentId, transferPairId) {
  if (!transferPairId) return null;
  const allDeletions = ensureArray(await sqliteStore.get('deletions'));
  return allDeletions.find(r =>
    String(r.id) !== String(currentId) &&
    String(r.recordId || r.id) !== String(currentId) &&
    r.snapshot && r.snapshot.transferPairId === transferPairId
  ) || null;
}

let _recycleBusy = false;

async function _withRecycleLock(fn) {
  if (_recycleBusy) { showToast('Please wait, another recycle bin action is still running.', 'info', 2500); return; }
  _recycleBusy = true;
  try { return await fn(); } finally { _recycleBusy = false; }
}

async function _getGroupBlockedMap(members) {
  const ids = new Set(members.map(m => String(m.recordId || m.id)));
  const ctx = { stockUsed: new Map(), unitsUsed: new Map(), inv: null,
    entityInSet: (id) => !!id && members.some(m => (m.collection || m.recordType) === 'entities' && String(m.recordId || m.id) === String(id)) ,
    pairInSet: (pairId, selfId) => !!pairId && members.some(m => (m.collection || m.recordType) === 'transactions' && m.snapshot && String(m.snapshot.transferPairId || '') === String(pairId) && String(m.recordId || m.id) !== String(selfId)) };
  const blocked = new Map();
  for (const m of orderForRestore(members)) {
    const snap = m && m.snapshot;
    if (!snap) continue;
    const col = m.collection || m.recordType || 'unknown';
    const mid = String(m.recordId || m.id);
    const hard = getRecoverBlockReason(col, snap);
    if (hard) { blocked.set(mid, hard); continue; }
    if (snap.relatedSaleId && ids.has(String(snap.relatedSaleId))) continue;
    if (col === 'inventory' && snap.supplierId && ids.has(String(snap.supplierId))) continue;
    const link = await getRecoverLinkBlockReason(col, snap, ctx);
    if (link) blocked.set(mid, link);
  }
  return blocked;
}

async function _collectRecoveryMembers(tomb, deletionRecords) {
  if (!tomb) return [];
  const live = await getLiveRecoveryRefs();
  return expandRecoveryMembers(tomb, deletionRecords, live);
}

async function _planRecovery(tomb, deletionRecords) {
  const members = await _collectRecoveryMembers(tomb, deletionRecords);
  const blocked = await _getGroupBlockedMap(members);
  const plan = planGroupRecovery(members, blocked, String(tomb.recordId || tomb.id));
  return { members, blocked, plan };
}

function _skippedSummary(plan) {
  return plan.skipped.map(x => {
    const s = x.tomb.snapshot || {};
    return `\u2022 ${s.customerName || s.name || s.description || x.tomb.collection || 'Record'}: ${x.reason}`;
  }).join('\n');
}

const _FACTORY_RECOVER_COLLECTIONS = new Set(['production', 'returns', 'factory', 'inventory']);

async function _refreshFactoryAfterRecover(collections) {
  if (!collections.some(c => _FACTORY_RECOVER_COLLECTIONS.has(c))) return;
  try { await syncFactoryProductionStats(); } catch (e) { console.warn('[RecycleBin] factory stats refresh failed', _safeErr(e)); }
}

async function _clearErasedIds(ids) {
  try {
    const gone = new Set(ids.map(String));
    const left = ensureArray(await sqliteStore.get('erased')).map(String).filter(i => !gone.has(i));
    await sqliteStore.set('erased', left);
  } catch (e) { console.warn('[RecycleBin] clear erased ids failed', _safeErr(e)); }
}

export async function flushErasedTombstones() {
  try {
    const pending = ensureArray(await sqliteStore.get('erased')).map(String);
    if (!pending.length || !firebaseDB || !currentUser) return;
    if (window._firestoreNetworkDisabled || navigator.onLine === false) return;
    const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
    for (let i = 0; i < pending.length; i += 400) {
      const chunk = pending.slice(i, i + 400);
      try {
        const batch = firebaseDB.batch();
        chunk.forEach(id => batch.delete(userRef.collection('deletions').doc(id)));
        await batch.commit();
        await _clearErasedIds(chunk);
      } catch (e) { console.warn('[RecycleBin] cloud erase retry failed', _safeErr(e)); }
    }
  } catch (e) { console.warn('[RecycleBin] flushErasedTombstones failed', _safeErr(e)); }
}

window.flushErasedTombstones = flushErasedTombstones;

async function _recreateCalcTransferSale(snap) {
  const tombs = ensureArray(await sqliteStore.get('deletions'));
  const t = tombs.find(x => x && String(x.recordId || x.id) === String(snap.transferSaleId) && (x.collection || x.recordType) === 'sales');
  if (t && t.snapshot) {
    const all = ensureArray(await sqliteStore.get('sales'));
    const rec = { ...t.snapshot };
    ['deletedAt', 'tombstoned_at', 'deleted_by', 'deletion_version', 'recoveredAt', '_placeholder', 'isDeleted', 'softDeleted', GROUP_FIELD, DELETE_ORIGIN_FIELD].forEach(k => delete rec[k]);
    let id = generateUUID('sale');
    if (!validateUUID(id)) id = generateUUID('sale');
    rec.id = id;
    rec.updatedAt = getTimestamp();
    all.push(rec);
    await unifiedSave('sales', all, rec);
    notifyDataChange('sales');
    return { saleId: id, oldId: String(snap.transferSaleId) };
  }
  const r = await processRepTransfer(snap.returnRep, snap.returned, snap.date, snap.seller);
  return { saleId: r.saleId, oldId: null };
}

function _calcOriginalMoment(snap) {
  const d = new Date(snap && (snap.syncedAt || snap.createdAt));
  return isNaN(d.getTime()) ? undefined : d;
}

async function _reapplyCalcEffects(snap, done, liveEntry) {
  let entryChanged = false;
  for (const step of done.slice().reverse()) {
    try {
      if (step === 'expired') {
        await processExpiredToChora(snap.expired, snap.date, snap.seller);
        if (liveEntry) { liveEntry.expiredApplied = true; entryChanged = true; }
      } else if (step === 'transfer') {
        const t = await _recreateCalcTransferSale(snap);
        if (liveEntry) { liveEntry.transferSaleId = t.saleId; entryChanged = true; }
        try { await purgeRecoveredId(String(snap.transferSaleId), 'sales', null, t.saleId); } catch (_) { }
      } else if (step === 'return') {
        const r = await processReturnToProduction(snap.returnStore, snap.returned, snap.date, snap.seller);
        if (liveEntry) { liveEntry.returnEntryId = r.returnEntryId; liveEntry.returnLogId = r.returnLogId; entryChanged = true; }
        try { if (snap.returnEntryId) await purgeRecoveredId(String(snap.returnEntryId), 'production', null, r.returnEntryId); } catch (_) { }
        try { if (snap.returnLogId) await purgeRecoveredId(String(snap.returnLogId), 'returns', null, r.returnLogId); } catch (_) { }
      } else if (step === 'rep') {
        await _claimRepSalesForCalc(snap.linkedRepSalesIds || [], snap.id);
      } else if (step === 'sales') {
        await markAllPendingCreditSalesAsCash(snap.seller, new Set(), new Set(snap.linkedSalesIds || []), _calcOriginalMoment(snap));
      }
    } catch (e) { console.error('[deleteSalesEntry] could not put back step', step, _safeErr(e)); }
  }
  if (entryChanged && liveEntry) {
    liveEntry.updatedAt = getTimestamp();
    try { const h = ensureArray(await sqliteStore.get('calculator')); await unifiedSave('calculator', h, liveEntry); } catch (_) { }
  }
}

async function _claimRepSalesForCalc(repIds, calcId) {
  const rep = ensureArray(await sqliteStore.get('rep'));
  const claimed = [];
  repIds.forEach(id => {
    const s = rep.find(x => x && x.id === id && !x.deletedAt);
    if (s && !s.usedInCalcId) {
      s.usedInCalcId = calcId;
      s.updatedAt = getTimestamp();
      ensureRecordIntegrity(s, true);
      claimed.push(id);
    }
  });
  if (claimed.length) await unifiedSave('rep', rep, null, claimed);
  return claimed;
}

async function recoverCalcEntry(deletedId, snap) {
  const oldId = String(deletedId);
  const ids = Array.isArray(snap.linkedSalesIds) ? snap.linkedSalesIds : [];
  const repIds = Array.isArray(snap.linkedRepSalesIds) ? snap.linkedRepSalesIds : [];
  let calcId = generateUUID('calc');
  if (!validateUUID(calcId)) calcId = generateUUID('calc');
  let retIds = null, transfer = null, expApplied = null, linked = [], linkedRep = [];
  const undo = async () => {
    try {
      if (retIds && snap.returnStore) await reverseReturnFromProduction(snap.returnStore, snap.returned, snap.date, snap.seller, retIds);
      if (transfer) {
        const all = ensureArray(await sqliteStore.get('sales'));
        const r = all.find(x => x.id === transfer.saleId);
        if (r) await unifiedDelete('sales', all.filter(x => x.id !== r.id), r.id, { strict: true }, r);
      }
      if (expApplied) await reverseExpiredFromChora(snap.expired, snap.date);
      if (linked.length) await revertSpecificSalesEntries(linked);
      if (linkedRep.length) await revertRepSalesEntries(linkedRep);
    } catch (e) { console.error('[recoverCalcEntry] undo failed', _safeErr(e)); }
  };
  try {
    if (snap.returned > 0 && snap.returnStore) retIds = await processReturnToProduction(snap.returnStore, snap.returned, snap.date, snap.seller);
    else if (snap.transferSaleId) transfer = await _recreateCalcTransferSale(snap);
    if (snap.expired > 0 && snap.expiredApplied !== false) expApplied = await processExpiredToChora(snap.expired, snap.date, snap.seller);
    if (ids.length) {
      linked = await markAllPendingCreditSalesAsCash(snap.seller, new Set(), new Set(ids), _calcOriginalMoment(snap));
      if (linked.length !== ids.length) throw new Error('Some of the credit sales changed while recovering.');
    }
    if (repIds.length) {
      linkedRep = await _claimRepSalesForCalc(repIds, calcId);
      if (linkedRep.length !== repIds.length) throw new Error('Some of the rep sales changed while recovering.');
    }
    const rec = { ...snap };
    ['deletedAt', 'tombstoned_at', 'deleted_by', 'deletion_version', '_placeholder', 'isDeleted', 'softDeleted', 'originalId', GROUP_FIELD, DELETE_ORIGIN_FIELD].forEach(k => delete rec[k]);
    rec.id = calcId;
    rec.returnEntryId = retIds ? retIds.returnEntryId : null;
    rec.returnLogId = retIds ? retIds.returnLogId : null;
    rec.transferSaleId = transfer ? transfer.saleId : null;
    rec.expiredApplied = snap.expired > 0 ? (snap.expiredApplied === false ? false : !!expApplied) : null;
    rec.linkedSalesIds = linked;
    rec.linkedRepSalesIds = linkedRep;
    {
      const _all = ensureArray(await sqliteStore.get('calculator')), _sales = ensureArray(await sqliteStore.get('sales'));
      const _taken = new Set();
      _all.forEach(h => { if (h && !h.deletedAt && Array.isArray(h.linkedRepReturnIds)) h.linkedRepReturnIds.forEach(i => _taken.add(i)); });
      const _live = new Set(_sales.filter(r => r && r.isRepReturn === true && !r.deletedAt).map(r => r.id));
      rec.linkedRepReturnIds = (Array.isArray(snap.linkedRepReturnIds) ? snap.linkedRepReturnIds : []).filter(i => _live.has(i) && !_taken.has(i));
    }
    rec.recoveredAt = Date.now();
    rec.updatedAt = getTimestamp();
    rec.syncedAt = new Date().toISOString();
    const history = ensureArray(await sqliteStore.get('calculator'));
    history.push(rec);
    await unifiedSave('calculator', history, rec);
    await purgeRecoveredId(oldId, 'calculator', null, calcId);
    const stale = [[snap.returnEntryId, 'production', retIds && retIds.returnEntryId], [snap.returnLogId, 'returns', retIds && retIds.returnLogId], [snap.transferSaleId, 'sales', transfer && transfer.saleId]];
    for (const [sid, col, nid] of stale) {
      if (sid) { try { await purgeRecoveredId(String(sid), col, null, nid || null); } catch (_) { } }
    }
    if (typeof invalidateAllCaches === 'function') await invalidateAllCaches();
    notifyDataChange('calculator');
    triggerAutoSync();
    return true;
  } catch (e) {
    await undo();
    window.notifyBlocking('Could not recover the calculator record: ' + ((e && e.message) || 'unknown error') + ' Nothing was changed.', 'error', 'Something went wrong');
    return false;
  }
}

export async function recoverRecord(deletedId, collectionName, _isPairRecovery = false, _opts = {}) {
  if (isMoneyRestricted() && !isRecycleRecordAllowed({ collection: collectionName })) return false;
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
  if (!deletedId || !collectionName) return false;
  if (isBinStore(collectionName)) return await recoverStoreRecord(deletedId, collectionName);
  try {
    if (!_isPairRecovery) {
      const _grpTomb = deletionRecords.find(r => String(r.id) === String(deletedId) || String(r.recordId || r.id) === String(deletedId));
      const _members = _grpTomb ? await _collectRecoveryMembers(_grpTomb, deletionRecords) : [];
      if (_members.length > 1) {
        const _blocked = await _getGroupBlockedMap(_members);
        const _plan = planGroupRecovery(_members, _blocked, String(_grpTomb.recordId || _grpTomb.id));
        if (_plan.requestedSkipped) { showToast(_plan.requestedSkipped, 'warning', 7000); return false; }
        const _grp = _plan.restore;
        if (_plan.skipped.length) showToast(`${_plan.skipped.length} linked record${_plan.skipped.length !== 1 ? 's' : ''} stay in the recycle bin:\n${_skippedSummary(_plan)}`, 'warning', 9000);
        let _selfOk = false;
        let _groupFailed = false;
        let _doneCount = 0;
        let _failedLabel = '';
        const _skipRe = planSkipReattach(_members);
        for (const m of _grp) {
          const mid = m.recordId || m.id;
          const ok = await recoverRecord(mid, m.collection || m.recordType || collectionName, true, { skipReattach: _skipRe.has(String(mid)) });
          if (String(mid) === String(deletedId)) _selfOk = ok;
          if (!ok) {
            _groupFailed = true;
            const fs = m.snapshot || {};
            _failedLabel = fs.customerName || fs.name || fs.description || m.collection || 'a record';
            break;
          }
          _doneCount++;
        }
        await _refreshFactoryAfterRecover(_grp.map(m => m.collection || m.recordType || collectionName));
        if (_groupFailed) {
          showToast(_doneCount === 0
            ? `Nothing was recovered: "${_failedLabel}" could not be recovered.`
            : `Recovered ${_doneCount} of ${_grp.length}. "${_failedLabel}" could not be recovered, so the other ${_grp.length - _doneCount} stay in the recycle bin. What was recovered is complete and linked correctly; recover again to continue.`, 'warning', 9000);
          return false;
        }
        return _selfOk;
      }
    }
    const sqliteKey = getSQLiteKey(collectionName);
    let recoveredData = null;
    const localDeletionRecords = await sqliteStore.get('deletions', []);
    const tombstoneLocal = Array.isArray(localDeletionRecords)
      ? localDeletionRecords.find(r => r.id === deletedId || r.recordId === deletedId)
      : null;
    if (tombstoneLocal && tombstoneLocal.snapshot) {
      recoveredData = tombstoneLocal.snapshot;
    }
    if (getRecoverBlockReason(collectionName, recoveredData)) return false;
    if (recoveredData && await getRecoverLinkBlockReason(collectionName, recoveredData)) return false;
    if (collectionName === 'calculator' && recoveredData) return await recoverCalcEntry(deletedId, recoveredData);
    if (!recoveredData && firebaseDB && currentUser) {
      try {
        const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
        const tombDoc = await userRef.collection('deletions').doc(String(deletedId)).get();
        if (tombDoc.exists) {
          const td = tombDoc.data();
          if (td && td.snapshot) recoveredData = td.snapshot;
        }
        if (!recoveredData) {
          const origDoc = await userRef.collection(collectionName).doc(String(deletedId)).get();
          if (origDoc.exists) recoveredData = origDoc.data();
        }
      } catch(e) { console.warn('[RecycleBin] snapshot fetch failed:', _safeErr(e)); }
    }
    let cleanRecord = null;
    if (recoveredData) {
      cleanRecord = { ...recoveredData };
      delete cleanRecord.deletedAt;
      delete cleanRecord.tombstoned_at;
      delete cleanRecord.deleted_by;
      delete cleanRecord.deletion_version;
      delete cleanRecord.recoveredAt;
      delete cleanRecord._placeholder;
      delete cleanRecord[GROUP_FIELD];
      delete cleanRecord[DELETE_ORIGIN_FIELD];
      delete cleanRecord.isDeleted;
      delete cleanRecord.softDeleted;
      cleanRecord.updatedAt   = Date.now();
      cleanRecord.recoveredAt = Date.now();
      cleanRecord.syncedAt    = new Date().toISOString();
    }
    const newId = (typeof generateUUID === 'function')
      ? generateUUID('recovered')
      : String(deletedId);
    const oldId = String(deletedId);
    if (cleanRecord) {
      cleanRecord.id = newId;
      delete cleanRecord.originalId;
      await applyRenameOnRecovery(collectionName, cleanRecord);
      const _dupe = await findLiveSameNameRecord(collectionName, cleanRecord);
      if (_dupe) {
        await purgeRecoveredId(oldId, collectionName, null, _dupe.id);
        await applyRecoveryLinks(collectionName, oldId, _dupe.id, null);
        if (typeof invalidateAllCaches === 'function') await invalidateAllCaches();
        triggerAutoSync();
        return true;
      }
      await resolveSnapshotLinks(collectionName, cleanRecord);
    }
    await purgeRecoveredId(oldId, collectionName, cleanRecord, newId);
    if (cleanRecord && sqliteKey) {
      let localArr = await sqliteStore.get(sqliteKey, []);
      if (!Array.isArray(localArr)) localArr = [];
      localArr = localArr.filter(r => r.id !== oldId && r.id !== newId);
      localArr.push(cleanRecord);
      await sqliteStore.set(sqliteKey, localArr);
    }
    try { await applyRecoveryLinks(collectionName, oldId, newId, cleanRecord, { skipReattach: !!_opts.skipReattach }); }
    catch (_lkErr) { console.warn('[recoverRecord] link re-pointing failed', _safeErr(_lkErr)); }
    if (typeof invalidateAllCaches === 'function') {
      await invalidateAllCaches();
    }
    if ((collectionName === 'transactions') && cleanRecord && cleanRecord.isPayable) {
      try {
        await _reconcileSupplierLinkAfterRecovery(cleanRecord);
        await _refreshSupplierLinkViews();
      } catch (_slErr) { console.warn('[recoverRecord] supplier link reconcile failed', _safeErr(_slErr)); }
    }
    if (collectionName === 'entities' && cleanRecord) {
      try {
        const _eph = (await sqliteStore.get('photos')) || {};
        const _etomb = (Array.isArray(localDeletionRecords) ? localDeletionRecords : deletionRecords).find(r => r.id === deletedId || r.recordId === deletedId);
        const _edata = ((_etomb && _etomb._photos) || {})['entity:' + oldId] || _eph['entity:' + oldId] || null;
        if (_edata) {
          _eph['entity:' + newId] = _edata;
          const _ets = (await sqliteStore.get('photostamps')) || {};
          const _edk = (await sqliteStore.get('photodirty')) || [];
          _ets['entity:' + newId] = Date.now();
          if (!_edk.includes('entity:' + newId)) _edk.push('entity:' + newId);
          await sqliteStore.set('photos', _eph);
          await sqliteStore.set('photostamps', _ets);
          await sqliteStore.set('photodirty', _edk);
          await sqliteStore.set('photos_timestamp', Date.now());
        }
      } catch (_ephErr) { console.warn('[recoverRecord] entity photo restore failed', _ephErr); }
    }
    if (collectionName === 'expenses' || collectionName === 'transactions') {
      try {
        const _recPh = (await sqliteStore.get('photos')) || {};
        const _recPhTs = (await sqliteStore.get('photostamps')) || {};
        const _recDk = (await sqliteStore.get('photodirty')) || [];
        const _tombstone = (Array.isArray(localDeletionRecords) ? localDeletionRecords : deletionRecords).find(r => r.id === deletedId || r.recordId === deletedId);
        const _stash = (_tombstone && _tombstone._photos) || {};
        const _now = Date.now();
        const _put = (key, data) => {
          if (!data) return;
          _recPh[key] = data;
          _recPhTs[key] = _now;
          if (!_recDk.includes(key)) _recDk.push(key);
        };
        const _ownOld = 'expense:' + oldId;
        const _ownData = _stash[_ownOld] || (_tombstone && _tombstone._photoDataUrl) || _recPh[_ownOld] || null;
        if (_ownData) {
          _put('expense:' + newId, _ownData);
          const paymentTxs = ensureArray(await sqliteStore.get('transactions'));
          const stillReferenced = collectionName === 'expenses' && paymentTxs.some(t => t && String(t.expenseId) === oldId);
          if (!stillReferenced) {
            delete _recPh[_ownOld];
            delete _recPhTs[_ownOld];
            if (!_recDk.includes(_ownOld)) _recDk.push(_ownOld);
          } else {
            _put(_ownOld, _ownData);
          }
        }
        if (cleanRecord && cleanRecord.expenseId) {
          const linkedKey = 'expense:' + cleanRecord.expenseId;
          const linkedData = _stash[linkedKey] || _recPh[linkedKey] || null;
          if (linkedData && !_recPh[linkedKey]) _put(linkedKey, linkedData);
        }
        await sqliteStore.set('photos', _recPh);
        await sqliteStore.set('photostamps', _recPhTs);
        await sqliteStore.set('photodirty', _recDk);
        await sqliteStore.set('photos_timestamp', _now);
      } catch(_recPhErr) { console.warn('[recoverRecord] photo restore failed', _recPhErr); }
    }
    triggerAutoSync();
    if (!_isPairRecovery && cleanRecord && cleanRecord.isTransfer === true && cleanRecord.transferPairId) {
      try {
        const pairTomb = await _findPairedTransferTombstone(oldId, cleanRecord.transferPairId);
        if (pairTomb) {
          await recoverRecord(pairTomb.id || pairTomb.recordId, pairTomb.collection || collectionName, true);
        }
      } catch (_pairErr) { console.warn('[RecycleBin] paired transfer recovery failed', _safeErr(_pairErr)); }
    }
    if (!_isPairRecovery) await _refreshFactoryAfterRecover([collectionName]);
    return true;
  } catch(e) {
    console.error('[RecycleBin] recoverRecord error:', _safeErr(e));
    _recoveredThisSession.delete(String(deletedId));
    return false;
  }
}

window.recoverRecord = recoverRecord;
window.registerDeletion = registerDeletion;

export const RECYCLE_COLLECTION_TO_TAB = {
  'sales':              'tab_sales',
  'customers':    'tab_sales',
  'rep':          'tab_rep',
  'clients':      'tab_rep',
  'production':         'tab_production',
  'returns':            'tab_production',
  'calculator': 'tab_calculator',
  'factory':    'tab_factory',
  'inventory':          'tab_factory',
  'transactions':       'tab_payments',
  'expenses':           'tab_payments',
  'entities':           'tab_payments',
  'daily_ledger':       'tab_ledger',
  'formulas':           'tab_formulas',
  'unknown':            'tab_payments',
};

export const RECYCLE_BIN_COLLECTION_LABELS = {
  'sales':              'Customer Sale',
  'customers':    'Customer Contact',
  'rep':          'Rep Sale',
  'clients':      'Rep Customer',
  'production':         'Production Batch',
  'returns':            'Stock Return',
  'calculator': 'Calculator Entry',
  'factory':    'Factory Production',
  'inventory':          'Inventory Item',
  'transactions':       'Transaction',
  'expenses':           'Expense',
  'entities':           'Payment Entity',
  'daily_ledger':       'Ledger Entry',
  'formulas':           'Formula',
  'unknown':            'Record',
};

export const RECYCLE_TAB_LABELS = {
  'tab_sales':       'Sales Tab',
  'tab_rep':         'Rep Tab',
  'tab_production':  'Manufacturing Tab',
  'tab_calculator':  'Calculator Tab',
  'tab_factory':     'Factory Tab',
  'tab_payments':    'Payments Tab',
  'tab_ledger':      'Daily Ledger',
  'tab_formulas':    'Formula Store',
};

function _recycleDenied(recs) {
  if (!isMoneyRestricted()) return false;
  if ((recs || []).every(r => isRecycleRecordAllowed(r))) return false;
  window.notifyBlocking('Access Denied — this record, or one linked to it, is outside your assigned tabs.', 'warning', 'Access Denied');
  return true;
}

export const RECYCLE_RECOVERABLE_COLLECTIONS = new Set([
  'sales','transactions','rep','expenses','production',
  'factory','inventory','returns','calculator',
  'customers','clients','entities',
  'daily_ledger','formulas'
]);

export async function openRecycleBin() {
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('recycle-bin-screen');
const MODE_TO_RECYCLE_FILTER = {
  'production': 'tab_production',
  'factory':    'tab_factory',
  'rep':        'tab_rep',
  'sales':      'tab_sales',
  'userrole':   null,
  'admin':      null,
};
const mode = window.appMode || 'admin';
let defaultFilter = 'all';
if (mode === 'userrole') {
  const tabs = window._assignedUserTabs || [];
  if (tabs.length === 1) {
    const singleTabMap = {
      'prod':     'tab_production',
      'factory':  'tab_factory',
      'rep':      'tab_rep',
      'sales':    'tab_sales',
      'calc':     'tab_calculator',
      'payments': 'tab_payments',
    };
    defaultFilter = singleTabMap[tabs[0]] || 'all';
  }
} else {
  defaultFilter = MODE_TO_RECYCLE_FILTER[mode] || 'all';
}
const filterSel = document.getElementById('recycleBinFilter');
if (filterSel) {
  const allowedFilters = new Set();
  allowedFilters.add('all');
  if (mode === 'admin') {
    Array.from(filterSel.options).forEach(opt => { window.setDisplay(opt, ''); });
  } else if (mode === 'userrole') {
    const tabs = window._assignedUserTabs || [];
    const tabToFilter = { prod:'tab_production', factory:'tab_factory', rep:'tab_rep', sales:'tab_sales', calc:'tab_calculator', payments:'tab_payments' };
    tabs.forEach(t => { if (tabToFilter[t]) allowedFilters.add(tabToFilter[t]); });
    Array.from(filterSel.options).forEach(opt => {
      window.setDisplay(opt, allowedFilters.has(opt.value) ? '' : 'none');
    });
  } else {
    if (defaultFilter !== 'all') allowedFilters.add(defaultFilter);
    Array.from(filterSel.options).forEach(opt => {
      window.setDisplay(opt, allowedFilters.has(opt.value) ? '' : 'none');
    });
  }
  filterSel.value = defaultFilter;
}
await renderRecycleBin(defaultFilter);
}

export function closeRecycleBin() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('recycle-bin-screen');
}

export async function renderRecycleBin(filterCollection = 'all') {
  const container = document.getElementById('recycleBinList');
  const statsEl   = document.getElementById('recycleBinStats');
  if (!container) return;
  const _rbFilters = recycleFilters();
  if (_rbFilters && !_rbFilters.has(filterCollection)) filterCollection = 'all';
  container.innerHTML = '<div class="u-7cbe623">Loading...</div>';
  try {
    let localDeletionRecords = ensureArray(await sqliteStore.get('deletions'));
    const _erasedPending = new Set(ensureArray(await sqliteStore.get('erased')).map(String));
    localDeletionRecords = localDeletionRecords.filter(r =>
      !_recoveredThisSession.has(r.id) && !_recoveredThisSession.has(r.recordId) &&
      !_erasedPending.has(String(r.id)) && !_erasedPending.has(String(r.recordId))
    );
    if (firebaseDB && currentUser) {
      try {
        const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
        const snap = await userRef.collection('deletions').orderBy('deletedAt', 'desc').limit(200).get();
        const seenIds = new Set(localDeletionRecords.map(r => String(r.id)));
        const seenRecordIds = new Set(localDeletionRecords.map(r => String(r.recordId || r.id)));
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (!d || d._placeholder) return;
          const docId = String(doc.id);
          const recId = String(d.recordId || d.id || doc.id);
          if (_recoveredThisSession.has(docId) || _recoveredThisSession.has(recId)) return;
          if (_erasedPending.has(docId) || _erasedPending.has(recId)) return;
          if (seenIds.has(docId) || seenRecordIds.has(docId) ||
              seenIds.has(recId)  || seenRecordIds.has(recId)) return;
          seenIds.add(docId);
          seenRecordIds.add(recId);
          localDeletionRecords.push({
            id: docId,
            recordId: recId,
            collection: d.collection || d.recordType || 'unknown',
            deletedAt: d.deletedAt?.toMillis ? d.deletedAt.toMillis() : (d.deletedAt || Date.now()),
            syncedToCloud: true,
            deleted_by: d.deleted_by || 'user',
            snapshot: d.snapshot || null,
            displayName: d.displayName || null,
            displayDetail: d.displayDetail || null,
            displayAmount: d.displayAmount || null,
          });
        });
      } catch(e) {   }
    }
    const _seen = new Map();
    for (const r of localDeletionRecords) {
      const key = String(r.id || r.recordId);
      const existing = _seen.get(key);
      if (!existing || (!existing.displayName && r.displayName) ||
          (!existing.snapshot && r.snapshot)) {
        _seen.set(key, r);
      }
    }
    localDeletionRecords = Array.from(_seen.values());
    if (isMoneyRestricted()) localDeletionRecords = localDeletionRecords.filter(r => isRecycleRecordAllowed(r));
    for (const r of localDeletionRecords) {
      if (r.displayName) { continue; }
      const col = r.collection || 'unknown';
      const s = r.snapshot;
      if (s && typeof s === 'object') {
        if (col === 'sales') {
          r.displayName   = s.customerName || s.name || null;
          r.displayDetail = r.displayDetail || [s.supplyStore || s.store || '', s.paymentType || '', s.date || ''].filter(Boolean).join(' · ');
          r.displayAmount = r.displayAmount || (s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null);
        } else if (col === 'rep') {
          r.displayName   = s.customerName || s.name || null;
          r.displayDetail = r.displayDetail || [s.salesRep ? `Rep: ${s.salesRep}` : '', s.paymentType || '', s.date || ''].filter(Boolean).join(' · ');
          r.displayAmount = r.displayAmount || (s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null);
        } else if (col === 'transactions') {
          if (s.isTransfer === true) {
            r.displayName   = `Transfer – ${s.entityName || '?'} ${s.type === 'OUT' ? '→' : '←'} ${s.transferPeerEntityName || '?'}`;
          } else {
            r.displayName   = s.entityName || s.name || s.description || null;
          }
          r.displayDetail = r.displayDetail || [s.type === 'IN' ? '↓ IN' : s.type === 'OUT' ? '↑ OUT' : (s.type || ''), s.date || ''].filter(Boolean).join(' · ');
          r.displayAmount = r.displayAmount || (s.amount != null ? `₨${fmtNum(s.amount)}` : null);
        } else if (col === 'expenses') {
          r.displayName   = s.name || s.description || null;
          r.displayDetail = r.displayDetail || [s.category || '', s.date || ''].filter(Boolean).join(' · ');
          r.displayAmount = r.displayAmount || (s.amount != null ? `₨${fmtNum(s.amount)}` : null);
        } else if (col === 'production') {
          if (s.isTransfer === true) {
            const _dir  = s.transferDirection === 'out' ? 'Transfer Out' : 'Transfer In';
            const _peer = s.transferPeerStore ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.transferPeerStore) : s.transferPeerStore) : '';
            const _self = (s.supplyStore || s.store) ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.supplyStore || s.store) : (s.supplyStore || s.store)) : '';
            r.displayName   = _peer ? `${_dir} – ${_self} ${s.transferDirection === 'out' ? '→' : '←'} ${_peer}` : `${_dir} – ${_self || 'Stock Transfer'}`;
            r.displayAmount = r.displayAmount || (s.net != null ? `${Math.abs(s.net)} kg` : null);
          } else {
            r.displayName   = s.supplyStore || s.store ? `Production – ${s.supplyStore || s.store}` : null;
            r.displayAmount = r.displayAmount || (s.net != null ? `${s.net} kg` : null);
          }
          r.displayDetail = r.displayDetail || s.date || '';
        } else if (col === 'returns') {
          r.displayName   = s.store ? `Return – ${s.store}` : null;
          r.displayDetail = r.displayDetail || s.date || '';
        } else if (col === 'factory') {
          r.displayName   = s.store ? `Factory – ${s.store}` : null;
          r.displayDetail = r.displayDetail || s.date || '';
        } else if (col === 'customers' || col === 'clients') {
          r.displayName   = s.name || null;
        } else {
          r.displayName   = s.name || s.customerName || s.entityName || s.description || null;
          r.displayAmount = r.displayAmount || ((s.amount ?? s.totalValue) != null ? `₨${fmtNum(s.amount ?? s.totalValue)}` : null);
        }
      }
      if (!r.displayName) {
        try {
          const live = await _captureRecordSnapshot(r.id || r.recordId, col);
          if (live && live.displayName) {
            r.displayName   = live.displayName;
            r.displayDetail = r.displayDetail || live.displayDetail;
            r.displayAmount = r.displayAmount || live.displayAmount;
          }
        } catch(_e) {}
      }
    }
    localDeletionRecords.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    if (statsEl) {
      statsEl.textContent = `${localDeletionRecords.length} deleted record${localDeletionRecords.length !== 1 ? 's' : ''} (kept for 90 days)`;
    }
    const filterSel = document.getElementById('recycleBinFilter');
    if (filterSel && filterSel.value !== filterCollection) filterSel.value = filterCollection;
    const filtered = filterCollection === 'all'
      ? localDeletionRecords
      : localDeletionRecords.filter(r => {
          const tab = RECYCLE_COLLECTION_TO_TAB[r.collection || 'unknown'] || 'tab_payments';
          return tab === filterCollection;
        });
    window._recycleBinCurrentFiltered = filtered;
    window._recycleBinCurrentFilterKey = filterCollection;
    const emptyBtn = document.getElementById('recycleBinEmptyBtn');
    const emptyBtnLabel = document.getElementById('recycleBinEmptyBtnLabel');
    if (emptyBtn && emptyBtnLabel) {
      if (filtered.length === 0) {
        window.setDisplay(emptyBtn, 'none');
      } else {
        window.setDisplay(emptyBtn, 'flex');
        emptyBtnLabel.textContent = filterCollection === 'all'
          ? `Empty Bin (${filtered.length})`
          : `Empty Tab (${filtered.length})`;
      }
    }
    if (filtered.length === 0) {
      container.innerHTML = `<div class="u-9c4dffe">
        <div class="u-5bfb9ec">Recycle Bin is empty</div>
        <div class="u-9e8750b">Deleted transactions will appear here and can be restored within 90 days.</div>
      </div>`;
      return;
    }
    container.innerHTML = filtered.map(rec => {
      const col = rec.collection || 'unknown';
      const tabKey = RECYCLE_COLLECTION_TO_TAB[col] || 'tab_payments';
      const tabLabel = RECYCLE_TAB_LABELS[tabKey] || tabKey;
      const typeLabel = `${tabLabel} › ${RECYCLE_BIN_COLLECTION_LABELS[col] || col}`;
      const deletedDate = rec.deletedAt
        ? formatDateTime(rec.deletedAt)
        : 'Unknown date';
      const daysAgo = rec.deletedAt ? Math.floor((Date.now() - rec.deletedAt) / 86400000) : '?';
      const expiresIn = rec.deletedAt ? Math.max(0, 90 - Math.floor((Date.now() - rec.deletedAt) / 86400000)) : '?';
      const canRecover = RECYCLE_RECOVERABLE_COLLECTIONS.has(col);
      let displayName = rec.displayName || null;
      let displayDetail = rec.displayDetail || null;
      let displayAmount = rec.displayAmount || null;
      if (!displayName && rec.snapshot) {
        const snap = _captureRecordSnapshot._fromObj
          ? _captureRecordSnapshot._fromObj(rec.snapshot, col)
          : null;
        if (snap && snap.displayName) {
          displayName   = snap.displayName;
          displayDetail = snap.displayDetail;
          displayAmount = snap.displayAmount;
        } else {
          const s = rec.snapshot;
          if (col === 'sales' || col === 'rep') {
            displayName   = s.customerName || s.name || null;
            displayDetail = [s.supplyStore || s.store || '', s.paymentType || '', s.date || ''].filter(Boolean).join(' · ');
            displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null;
          } else if (col === 'transactions') {
            if (s.isTransfer === true) {
              displayName = `Transfer – ${s.entityName || '?'} ${s.type === 'OUT' ? '→' : '←'} ${s.transferPeerEntityName || '?'}`;
            } else {
              displayName = s.entityName || s.description || s.name || null;
            }
            displayDetail = [s.type === 'IN' ? '↓ IN' : s.type === 'OUT' ? '↑ OUT' : (s.type || ''), s.date || ''].filter(Boolean).join(' · ');
            displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
          } else if (col === 'expenses') {
            displayName   = s.name || s.description || null;
            displayDetail = [s.category || '', s.date || ''].filter(Boolean).join(' · ');
            displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
          } else if (col === 'production') {
            if (s.isTransfer === true) {
              const _dir  = s.transferDirection === 'out' ? 'Transfer Out' : 'Transfer In';
              const _peer = s.transferPeerStore ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.transferPeerStore) : s.transferPeerStore) : '';
              const _self = (s.supplyStore || s.store) ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.supplyStore || s.store) : (s.supplyStore || s.store)) : '';
              displayName   = _peer ? `${_dir} – ${_self} ${s.transferDirection === 'out' ? '→' : '←'} ${_peer}` : `${_dir} – ${_self || 'Stock Transfer'}`;
              displayAmount = s.net != null ? `${Math.abs(s.net)} kg` : null;
            } else {
              displayName   = s.supplyStore || s.store ? `Production – ${s.supplyStore || s.store}` : 'Production Batch';
              displayAmount = s.net != null ? `${s.net} kg` : null;
            }
            displayDetail = s.date || '';
          } else if (col === 'returns') {
            displayName   = s.store ? `Return – ${s.store}` : 'Stock Return';
            displayDetail = s.date || '';
            displayAmount = s.quantity != null ? `${s.quantity} kg` : null;
          } else if (col === 'factory') {
            displayName   = s.store ? `Factory – ${s.store}` : 'Factory Production';
            displayDetail = s.date || '';
            displayAmount = s.units != null ? `${s.units} units` : null;
          } else if (col === 'calculator') {
            displayName   = s.customerName || s.customer || s.name || 'Calculator Entry';
            displayDetail = s.supplyStore || s.store || '';
            displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null;
          } else {
            displayName = s.customerName || s.entityName || s.name || s.description || null;
            displayAmount = (s.amount ?? s.totalValue) != null ? `₨${fmtNum(s.amount ?? s.totalValue)}` : null;
          }
        }
      }
      const _snap = rec.snapshot || {};
      const _rbCreatedBy = _snap.createdBy || rec.createdBy || null;
      const _rbManagedBy = _snap.managedBy || rec.managedBy || null;
      const _rbSalesRep  = _snap.salesRep  || rec.salesRep  || null;
      const _rbCreatorBadge = _rbCreatedBy
        ? `<span class="badge creator-badge">${esc(_rbCreatedBy)}</span>`
        : '';
      const _rbManagedBadge = _rbManagedBy
        ? `<span class="badge managed-by-badge">${esc(_rbManagedBy)}</span>`
        : '';
      const _rbRepBadge = (_rbSalesRep && !_rbCreatedBy)
        ? `<span class="badge sales-rep-badge">${esc(_rbSalesRep.split(' ')[0])}</span>`
        : '';
      const _rbBadgesHtml = [_rbManagedBadge, _rbCreatorBadge, _rbRepBadge].filter(Boolean).join('');
      const _rbDeletedByRaw = rec.deleted_by || null;
      const _rbDeletedByBadge = (_rbDeletedByRaw && _rbDeletedByRaw !== 'user')
        ? `<span class="u-24a7191 d-inline-flex"><svg width="9" height="9" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-b62856e"><path d="M9 10L10.6 30.2A2.5 2.5 0 0 0 13.1 32.5H22.9A2.5 2.5 0 0 0 25.4 30.2L27 10Z" fill="var(--danger)" fill-opacity="0.15" stroke="var(--danger)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M5.5 10H30.5" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M13.5 10V7A1.8 1.8 0 0 1 15.3 5.2H20.7A1.8 1.8 0 0 1 22.5 7V10" stroke="var(--danger)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14.8 15V27.5M21.2 15V27.5" stroke="var(--danger)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><path d="M18 15V27.5" stroke="var(--danger)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.4"/></svg>${esc(_rbDeletedByRaw)}</span>`
        : '';
      const nameHtml = displayName
        ? `<span class="u-46acfb3">${esc(displayName)}</span>`
        : `<span class="u-65dfeeb">${esc(RECYCLE_BIN_COLLECTION_LABELS[col] || col)} — name unavailable</span>`;
      const detailHtml = displayDetail
        ? `<span class="u-dd827b8">${esc(displayDetail)}</span>`
        : '';
      const _amtShown = recycleAmountText(displayAmount);
      const amountHtml = _amtShown
        ? `<span class="u-dd009f5">${esc(_amtShown)}</span>`
        : '';
      const syncBadge = rec.syncedToCloud
        ? `<span class="badge sync-status-badge sync-ok"> synced</span>`
        : `<span class="badge sync-status-badge sync-local"> local</span>`;
      const colDot = {
        'sales':'var(--accent)','transactions':'var(--accent-blue)','rep':'var(--accent-purple)',
        'expenses':'var(--warning)','production':'var(--accent-pink)','factory':'var(--accent-teal)',
        'returns':'var(--accent-orange)','daily_ledger':'var(--accent-sky)','formulas':'var(--accent-indigo)','unknown':'var(--text-secondary)'
      }[col] || 'var(--text-secondary)';
      const typeTag = `<span class="badge type-tag-badge">${esc(typeLabel)}</span>`;
      return `<div class="u-b8ea487 d-flex st-background__356c02 st-border-bottom__e54b2f">
        <div class="u-6b665db u-f2399ff u-cdfcec8 st-border-radius__9eaa9c dc-background u-b62856e" style="--d-background: ${colDot}"></div>
        <div class="u-8b4ab7f has-overflow u-0da05dd">
          <div class="u-f3709bc d-flex">
            ${nameHtml}
            ${amountHtml}
          </div>
          <div class="u-fefc851 d-flex">
            ${typeTag}
            ${detailHtml}
            ${syncBadge}
            ${_rbBadgesHtml}
            ${_rbDeletedByBadge}
          </div>
          <div class="u-e8a64e6">
            Deleted ${daysAgo === 0 ? 'today' : daysAgo + 'd ago'} · ${deletedDate} · expires in ${expiresIn}d
          </div>
        </div>
        <div class="u-d533703 d-flex">
          ${canRecover
            ? `<button onclick="attemptRecoverRecord('${esc(rec.id)}','${esc(col)}')" class="btn btn-theme btn-sm d-inline-flex"><svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-b62856e"><path d="M6 22V28A2.5 2.5 0 0 0 8.5 30.5H27.5A2.5 2.5 0 0 0 30 28V22" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M18 24V6M11.2 12.5L18 5.7 24.8 12.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path class="ic-sp" d="M30.5 6.1Q30.5 8.5 32.9 8.5Q30.5 8.5 30.5 10.9Q30.5 8.5 28.1 8.5Q30.5 8.5 30.5 6.1Z" fill="currentColor"/></svg> Restore</button>`
            : `<span class="text-xs st-font-size__8e87b7 st-color__5872de st-padding__f26165">—</span>`}
          <button onclick="attemptHardDeleteRecord('${esc(rec.id)}','${esc(col)}')" class="btn btn-danger btn-sm d-inline-flex"><svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-b62856e"><path d="M9 10L10.6 30.2A2.5 2.5 0 0 0 13.1 32.5H22.9A2.5 2.5 0 0 0 25.4 30.2L27 10Z" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M5.5 10H30.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M13.5 10V7A1.8 1.8 0 0 1 15.3 5.2H20.7A1.8 1.8 0 0 1 22.5 7V10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14.8 15V27.5M21.2 15V27.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><path d="M18 15V27.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.4"/></svg> Delete Forever</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = `<div class="u-7cbe623">Failed to load recycle bin.</div>`;
    const emptyBtnErr = document.getElementById('recycleBinEmptyBtn');
    if (emptyBtnErr) window.setDisplay(emptyBtnErr, 'none');
    console.error('[RecycleBin] render error', _safeErr(e));
  }
}

export async function attemptRecoverRecord(id, collectionName) {
  return _withRecycleLock(() => _attemptRecoverRecordImpl(id, collectionName));
}

async function _attemptRecoverRecordImpl(id, collectionName) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
  const tabKey = RECYCLE_COLLECTION_TO_TAB[collectionName] || 'tab_payments';
  const tabLabel = RECYCLE_TAB_LABELS[tabKey] || tabKey;
  const label = `${tabLabel} › ${RECYCLE_BIN_COLLECTION_LABELS[collectionName] || collectionName}`;
  const ownTomb = deletionRecords.find(r => String(r.id) === String(id) || String(r.recordId || r.id) === String(id));
  if (_recycleDenied([ownTomb || { collection: collectionName }])) return;
  const isTransferPair = !!(ownTomb && ownTomb.snapshot && ownTomb.snapshot.isTransfer === true && ownTomb.snapshot.transferPairId);
  const _recov = ownTomb ? await _planRecovery(ownTomb, deletionRecords) : { members: [], plan: { restore: [], skipped: [], requestedSkipped: null } };
  if (_recycleDenied(_recov.members)) return;
  const _grpMembers = _recov.plan.restore.length > 0 ? _recov.plan.restore : _recov.members;
  if (_recov.members.length > 1) {
    if (_recov.plan.requestedSkipped) { window.notifyBlocking(_recov.plan.requestedSkipped, 'warning', 'Warning'); return; }
  } else {
    const _rb = getRecoverBlockReason(collectionName, ownTomb && ownTomb.snapshot);
    if (_rb) { window.notifyBlocking(_rb, 'warning', 'Warning'); return; }
    if (ownTomb && ownTomb.snapshot) {
      const _lb = await getRecoverLinkBlockReason(collectionName, ownTomb.snapshot);
      if (_lb) { window.notifyBlocking(_lb, 'warning', 'Warning'); return; }
    }
  }
  const _skipNote = _recov.plan.skipped.length ? `\n\nThese cannot be recovered right now and will stay in the recycle bin:\n${_skippedSummary(_recov.plan)}` : '';
  const groupNote = (_grpMembers.length > 1 ? `\n\nThis was deleted together with ${_grpMembers.length - 1} other record${_grpMembers.length - 1 !== 1 ? 's' : ''}. All ${_grpMembers.length} will be recovered together so their links stay correct.` : '') + _skipNote;
  let calcNote = '';
  if (collectionName === 'calculator' && ownTomb && ownTomb.snapshot) {
    const cs = ownTomb.snapshot;
    const parts = [];
    if ((cs.linkedSalesIds || []).length) parts.push(`settle ${cs.linkedSalesIds.length} credit sale${cs.linkedSalesIds.length !== 1 ? 's' : ''} again`);
    if ((cs.linkedRepSalesIds || []).length) parts.push(`claim ${cs.linkedRepSalesIds.length} rep sale${cs.linkedRepSalesIds.length !== 1 ? 's' : ''} again`);
    if (cs.returned > 0 && cs.returnStore) parts.push(`add ${cs.returned} kg back to ${getStoreLabel(cs.returnStore)} stock`);
    if (cs.transferSaleId) parts.push(`re-create the ${cs.returned} kg transfer to ${cs.returnRep}`);
    if (cs.expired > 0 && cs.expiredApplied !== false) parts.push(`add ${cs.expired} kg back to CHORA`);
    if (parts.length) calcNote = `\n\nRecovering this record will also: ${parts.join('; ')}. If anything has changed since it was deleted, nothing is recovered.`;
  }
  const pairNote = isTransferPair ? '\n\nThis is one side of a linked transfer — both sides will be recovered together.' : '';
  if (!(await showGlassConfirm(
    `Recover this ${label}?\n\nIt will be restored to its original collection and become visible again in all views.${pairNote}${groupNote}${calcNote}`,
    { title: 'Restore Record', confirmText: 'Restore', danger: false }
  ))) return;
  const ok = await recoverRecord(id, collectionName);
  if (ok) {
    if (typeof window.sendDeviceNotification === 'function') window.sendDeviceNotification('Record recovered', label + ' was restored from the recycle bin.', 'recover-' + id, { key: id, priority: 2 }).catch(() => {});
    notifyDataChange('all');
    if (typeof calculateNetCash === 'function') calculateNetCash();
    if (typeof calculateCashTracker === 'function') calculateCashTracker();
    const filterSel = document.getElementById('recycleBinFilter');
    const current = filterSel ? filterSel.value : 'all';
    await renderRecycleBin(current);
  } else {
    window.notifyBlocking('Recovery failed. The record may have been permanently purged from cloud.', 'error', 'Something went wrong');
    notifyDataChange('all');
    const _fs = document.getElementById('recycleBinFilter');
    await renderRecycleBin(_fs ? _fs.value : 'all');
  }
}

window.openRecycleBin = openRecycleBin;
window.closeRecycleBin = closeRecycleBin;
window.renderRecycleBin = renderRecycleBin;
window.attemptRecoverRecord = attemptRecoverRecord;

export async function emptyRecycleBin() {
  return _withRecycleLock(_emptyRecycleBinImpl);
}

async function _emptyRecycleBinImpl() {
  const currentFilter = window._recycleBinCurrentFilterKey || (document.getElementById('recycleBinFilter') || {}).value || 'all';
  const shown = (window._recycleBinCurrentFiltered || []).slice();
  if (shown.length === 0) {
    showToast('Recycle bin is already empty.', 'info');
    return;
  }
  const targets = expandGroups(shown, ensureArray(await sqliteStore.get('deletions')).concat(shown));
  if (_recycleDenied(targets)) return;
  const scopeLabel = currentFilter === 'all' ? 'the entire recycle bin' : `all "${RECYCLE_TAB_LABELS[currentFilter] || currentFilter}" items`;
  const confirmed = await showGlassConfirm(
    `Permanently delete ${targets.length} record${targets.length !== 1 ? 's' : ''} from ${scopeLabel}?\n\nThis action CANNOT be undone. Any linked transfer pairs will be deleted together. All records will be erased from local storage and the cloud.`,
    { title: 'Empty Recycle Bin', confirmText: `Delete ${targets.length} Forever`, danger: true }
  );
  if (!confirmed) return;
  const emptyBtn = document.getElementById('recycleBinEmptyBtn');
  if (emptyBtn) window.setStyle(emptyBtn, 'pointer-events', 'st-pointer-events__8b1364');
  let failCount = 0;
  for (const rec of targets) {
    const rid = rec.id || rec.recordId;
    if (!rid) continue;
    const col = rec.collection || 'unknown';
    try {
      const ok = await hardDeleteRecord(rid, col, true);
      if (!ok) failCount++;
    } catch (e) {
      failCount++;
      console.warn('[RecycleBin] emptyRecycleBin item failed', _safeErr(e));
    }
  }
  notifyDataChange('all');
  if (typeof calculateNetCash === 'function') { try { calculateNetCash(); } catch (_) {} }
  if (typeof calculateCashTracker === 'function') { try { calculateCashTracker(); } catch (_) {} }
  if (emptyBtn) window.setStyle(emptyBtn, 'pointer-events', '');
  await renderRecycleBin(currentFilter);
  if (failCount > 0) {
    window.notifyBlocking(`Emptied recycle bin with ${failCount} error${failCount !== 1 ? 's' : ''}. Some records may need a retry.`, 'warning', 'Warning');
  } else {
    if (typeof window.sendDeviceNotification === 'function') window.sendDeviceNotification('Recycle bin emptied', targets.length + ' record' + (targets.length !== 1 ? 's were' : ' was') + ' permanently deleted and cannot be recovered.', 'recycle-emptied').catch(() => {});
  }
}

window.emptyRecycleBin = emptyRecycleBin;

export async function hardDeleteRecord(id, collectionName, _isPairDelete = false) {
  if (isMoneyRestricted() && !isRecycleRecordAllowed({ collection: collectionName })) return false;
  if (!id || !collectionName) return false;
  const sid = String(id);
  try {
    const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
    deletedRecordIds.delete(sid);
    await sqliteStore.set('deleted', Array.from(deletedRecordIds));
    const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
    const ownTombstone = deletionRecords.find(r => String(r.id) === sid || String(r.recordId || r.id) === sid);
    const pruned = deletionRecords.filter(r => String(r.id) !== sid && String(r.recordId || r.id) !== sid);
    await sqliteStore.set('deletions', pruned);
    const _erasedIds = new Set(ensureArray(await sqliteStore.get('erased')).map(String));
    _erasedIds.add(sid);
    await sqliteStore.set('erased', Array.from(_erasedIds));
    _recoveredThisSession.add(sid);
    const sqliteKey = getSQLiteKey(collectionName);
    if (sqliteKey) {
      const store = ensureArray(await sqliteStore.get(sqliteKey));
      const filtered = store.filter(r => String(r.id) !== sid);
      if (filtered.length !== store.length) {
        await sqliteStore.set(sqliteKey, filtered);
      }
    }
    if (typeof OfflineQueue !== 'undefined') {
      const isThisId = (item) => {
        const op = item.operation || {};
        return op.docId === sid;
      };
      const qBefore = OfflineQueue.queue.length;
      OfflineQueue.queue = OfflineQueue.queue.filter(item => !isThisId(item));
      if (OfflineQueue.queue.length !== qBefore) {
        try { await OfflineQueue.saveQueue(); } catch(e) {}
      }
      if (Array.isArray(OfflineQueue.deadLetterQueue)) {
        OfflineQueue.deadLetterQueue = OfflineQueue.deadLetterQueue.filter(item => !isThisId(item));
        try { await OfflineQueue.saveDeadLetterQueue(); } catch(e) {}
      }
    }
    if (firebaseDB && currentUser) {
      (async () => {
        try {
          const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
          const batch = firebaseDB.batch();
          batch.delete(userRef.collection('deletions').doc(sid));
          batch.delete(userRef.collection(collectionName).doc(sid));
          if (collectionName === 'expenses' || collectionName === 'transactions') {
            const _hdPhotoKey = 'expense:' + sid;
            const _hdSafeDocId = btoa(unescape(encodeURIComponent(_hdPhotoKey))).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''})[c] || '');
            batch.delete(userRef.collection('photos').doc(_hdSafeDocId));
          }
          await batch.commit();
          trackFirestoreWrite(2);
          await _clearErasedIds([sid]);
        } catch(e) {
          console.warn('[RecycleBin] Hard delete cloud failed — queuing:', _safeErr(e));
          if (typeof OfflineQueue !== 'undefined') {
            await OfflineQueue.add({ action: 'delete', collection: 'deletions',      docId: sid, data: null });
            await OfflineQueue.add({ action: 'delete', collection: collectionName,   docId: sid, data: null });
            if (collectionName === 'expenses' || collectionName === 'transactions') {
              const _hdPhotoKey = 'expense:' + sid;
              const _hdSafeDocId = btoa(unescape(encodeURIComponent(_hdPhotoKey))).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''})[c] || '');
              await OfflineQueue.add({ action: 'delete', collection: 'photos', docId: _hdSafeDocId, data: null });
            }
          }
        }
      })();
    } else if (typeof OfflineQueue !== 'undefined') {
      try {
        await OfflineQueue.add({ action: 'delete', collection: 'deletions',    docId: sid, data: null });
        await OfflineQueue.add({ action: 'delete', collection: collectionName, docId: sid, data: null });
        if (collectionName === 'expenses' || collectionName === 'transactions') {
          const _hdOffPhKey = 'expense:' + sid;
          const _hdOffSafeDocId = btoa(unescape(encodeURIComponent(_hdOffPhKey))).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''})[c] || '');
          await OfflineQueue.add({ action: 'delete', collection: 'photos', docId: _hdOffSafeDocId, data: null });
        }
      } catch(_hdOffErr) { console.warn('[hardDeleteRecord] offline queue failed', _hdOffErr); }
    }
    if ((collectionName === 'production') && ownTombstone && ownTombstone.snapshot) {
      try { await deleteProdPhotos(ownTombstone.snapshot); }
      catch (_ppErr) { console.warn('[hardDeleteRecord] production photo cleanup failed', _safeErr(_ppErr)); }
    }
    if (collectionName === 'expenses' || collectionName === 'transactions') {
      try {
        const _hdLocalPhKey = 'expense:' + sid;
        const _hdLocalPh = (await sqliteStore.get('photos')) || {};
        if (_hdLocalPh[_hdLocalPhKey] !== undefined) {
          delete _hdLocalPh[_hdLocalPhKey];
          await sqliteStore.set('photos', _hdLocalPh);
          const _hdLocalTs = (await sqliteStore.get('photostamps')) || {};
          delete _hdLocalTs[_hdLocalPhKey];
          await sqliteStore.set('photostamps', _hdLocalTs);
          const _hdDk = (await sqliteStore.get('photodirty')) || [];
          const _hdDkFiltered = _hdDk.filter(k => k !== _hdLocalPhKey);
          if (_hdDkFiltered.length !== _hdDk.length) await sqliteStore.set('photodirty', _hdDkFiltered);
        }
      } catch(_hdPhErr) { console.warn('[hardDeleteRecord] photo local cleanup failed', _hdPhErr); }
    }
    if (!_isPairDelete && ownTombstone && ownTombstone.snapshot && ownTombstone.snapshot.isTransfer === true && ownTombstone.snapshot.transferPairId) {
      try {
        const pairTomb = await _findPairedTransferTombstone(sid, ownTombstone.snapshot.transferPairId);
        if (pairTomb) {
          await hardDeleteRecord(pairTomb.id || pairTomb.recordId, pairTomb.collection || collectionName, true);
        }
      } catch (_pairErr) { console.warn('[RecycleBin] paired transfer hard-delete failed', _safeErr(_pairErr)); }
    }
    return true;
  } catch(e) {
    console.error('[RecycleBin] hardDeleteRecord error:', _safeErr(e));
    return false;
  }
}

export async function attemptHardDeleteRecord(id, collectionName) {
  return _withRecycleLock(() => _attemptHardDeleteImpl(id, collectionName));
}

async function _attemptHardDeleteImpl(id, collectionName) {
  const tabKey   = RECYCLE_COLLECTION_TO_TAB[collectionName] || 'tab_payments';
  const tabLabel = RECYCLE_TAB_LABELS[tabKey] || tabKey;
  const label    = `${tabLabel} › ${RECYCLE_BIN_COLLECTION_LABELS[collectionName] || collectionName}`;
  const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
  const ownTomb = deletionRecords.find(r => String(r.id) === String(id) || String(r.recordId || r.id) === String(id));
  const members = ownTomb ? findGroupMembers(ownTomb, deletionRecords) : [];
  if (_recycleDenied(members.length ? members : [ownTomb || { collection: collectionName }])) return;
  const isGroup = members.length > 1;
  const isTransferPair = !!(ownTomb && ownTomb.snapshot && ownTomb.snapshot.isTransfer === true && ownTomb.snapshot.transferPairId);
  const pairNote = isGroup
    ? (isTransferPair && members.length === 2
        ? '\n\nThis is one side of a linked transfer — both sides will be permanently deleted together.'
        : `\n\nThis was deleted together with ${members.length - 1} other record${members.length - 1 !== 1 ? 's' : ''}. All ${members.length} will be permanently deleted together.`)
    : '';
  const confirmed = await showGlassConfirm(
    `Permanently delete this ${label}?\n\nThis action CANNOT be undone. The record will be erased from all local storage and the cloud.${pairNote}`,
    { title: 'Delete Forever', confirmText: 'Delete Forever', danger: true }
  );
  if (!confirmed) return;
  let ok = true;
  if (isGroup) {
    for (const m of members) {
      const mid = m.recordId || m.id;
      if (!mid) continue;
      const done = await hardDeleteRecord(mid, m.collection || m.recordType || collectionName, true);
      if (!done) ok = false;
    }
  } else {
    ok = await hardDeleteRecord(id, collectionName);
  }
  if (ok) {
    if (typeof window.sendDeviceNotification === 'function') window.sendDeviceNotification('Permanently deleted', label + ' was permanently deleted and cannot be recovered.', 'hard-del-' + id).catch(() => {});
    notifyDataChange('all');
    if (typeof calculateNetCash === 'function') calculateNetCash();
    if (typeof calculateCashTracker === 'function') calculateCashTracker();
    const filterSel = document.getElementById('recycleBinFilter');
    const current = filterSel ? filterSel.value : 'all';
    await renderRecycleBin(current);
  } else {
    window.notifyBlocking('Hard delete failed. Please try again.', 'error', 'Something went wrong');
    const filterSel = document.getElementById('recycleBinFilter');
    await renderRecycleBin(filterSel ? filterSel.value : 'all');
  }
}

window.hardDeleteRecord = hardDeleteRecord;
window.attemptHardDeleteRecord = attemptHardDeleteRecord;

export async function triggerLocalBackup() {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
const factoryCostAdjustmentFactor = (await sqliteStore.get('adjustment')) || {};
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const appStoresSnapshot = ensureArray(await sqliteStore.get('stores'));
const { production, transactions, entities, returns, inventory, factory } = await loadCollections('production', 'transactions', 'entities', 'returns', 'inventory', 'factory');
closeDataMenu();
if (!currentUser) {
showToast('Please sign in to create a backup.', 'error');
showAuthOverlay();
return;
}
const data = {
production: production,
calculator: await sqliteStore.get('calculator', []),
sales: await sqliteStore.get('sales', []),
rep: await sqliteStore.get('rep', []),
clients: await sqliteStore.get('clients', []),
customers: await sqliteStore.get('customers', []),
inventory: inventory,
factory: factory,
defaults: factoryDefaultFormulas,
costs: factoryAdditionalCosts,
adjustment: factoryCostAdjustmentFactor,
tracking: factoryUnitTracking,
stores: appStoresSnapshot,
entities: entities,
transactions: transactions,
expenses: await sqliteStore.get('expenses', []),
returns: returns,
settings: await sqliteStore.get('settings', defaultSettings),
deleted: Array.from(deletedRecordIds),
...(await collectAuxBackupFields(sqliteStore)),
_meta: { encryptedFor: currentUser.email, encryptedUid: currentUser.uid, createdAt: Date.now(), version: 4 }
};
const encPassword = await promptVerifiedBackupPassword({ inputId: 'enc_local_bkp_pwd' });
if (!encPassword) {
return;
}
try {
const encryptedBlob = await CryptoEngine.encrypt(data, currentUser.email, encPassword, currentUser.uid);
const timestamp = localDateStr();
_triggerFileDownload(encryptedBlob, `NaswarDealers_SecureBackup_${timestamp}.gznd`);
window.showGlassAlert('Encrypted backup saved! Only your account and credentials can restore this file.', { tone: 'success', title: 'Backup Saved' });
} catch(encErr) {
console.error('Encryption failed:', _safeErr(encErr));
window.notifyBlocking('Encryption failed: ' + encErr.message, 'error', 'Something went wrong');
}
}

const _nativeBio = () => {
const C = window.Capacitor;
if (!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform())) return null;
return (C.Plugins && C.Plugins.NativeBiometric) || null;
};

const _bioErrorMessage = (code) => ({
1: 'Biometrics are not available on this device.',
2: 'Too many failed attempts. Try again later or use your device PIN.',
3: 'No fingerprint or face is enrolled. Add one in Android Settings > Security.',
4: 'Too many failed attempts. Please wait a moment and try again.',
10: 'Fingerprint not recognised. Please try again.',
14: 'Set a screen lock (PIN, pattern or password) in Android Settings first.'
}[code] || 'Biometric authentication failed.');

const _nativeBioError = (e) => {
const code = e && (e.code !== undefined ? Number(e.code) : NaN);
const cancelled = code === 11 || code === 15 || code === 13 || /cancel/i.test(String((e && e.message) || ''));
const err = new Error(cancelled ? 'Authentication cancelled' : _bioErrorMessage(code) || (e && e.message) || 'Biometric authentication failed.');
err.name = cancelled ? 'NotAllowedError' : 'BiometricError';
err.code = code;
return err;
};

export const BiometricAuth = {
isAvailable: async () => {
const nb = _nativeBio();
if (nb) {
try {
const r = await nb.isAvailable({ useFallback: true });
return !!(r && (r.isAvailable || r.deviceIsSecure));
} catch (_) { return false; }
}
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
const nb = _nativeBio();
if (nb) {
let info = null;
try { info = await nb.isAvailable({ useFallback: true }); } catch (_) {}
if (!info || !(info.isAvailable || info.deviceIsSecure)) {
throw Object.assign(new Error(_bioErrorMessage(info && info.errorCode !== undefined ? info.errorCode : 3)), { name: 'BiometricError' });
}
try {
await nb.verifyIdentity({ reason: 'Confirm to enable the app lock', title: 'Enable App Lock', subtitle: 'Gull & Zubair', description: 'Verify with your fingerprint, face or device PIN', useFallback: true, maxAttempts: 3 });
} catch (e) { throw _nativeBioError(e); }
await sqliteStore.set('bio_cred_id', 'native');
await sqliteStore.set('bio_enabled', 'true');
try { await sqliteStore.flush(); } catch (_) {}
notifyDataChange('all');
triggerAutoSync();
return true;
}
if (!await BiometricAuth.isAvailable()) {
throw new Error("Biometrics not available on this device.");
}
const challenge = new Uint8Array(32);
window.crypto.getRandomValues(challenge);
const userId = new Uint8Array(16);
window.crypto.getRandomValues(userId);
const publicKey = {
challenge: challenge,
rp: { name: "Sarim App", id: window.location.hostname },
user: {
id: userId,
name: username,
displayName: username
},
pubKeyCredParams: [
{ alg: -7, type: "public-key" },
{ alg: -257, type: "public-key" }
],
authenticatorSelection: {
authenticatorAttachment: "platform",
userVerification: "required",
residentKey: "preferred"
},
timeout: 60000
};
const credential = await navigator.credentials.create({ publicKey });
const credId = BiometricAuth._bufToBase64(credential.rawId);
await sqliteStore.set('bio_cred_id', credId);
await sqliteStore.set('bio_enabled', 'true');
notifyDataChange('all');
triggerAutoSync();
return true;
} catch (err) {
console.error('[BiometricAuth] registration failed:', _safeErr(err));
if (!(err && err.name === 'NotAllowedError')) showToast('Biometric setup failed. ' + (err && err.message ? err.message : 'Please try again.'), 'error');
throw err;
}
},
authenticate: async () => {
try {
const nb = _nativeBio();
if (nb) {
try {
await nb.verifyIdentity({ reason: 'Unlock the app', title: 'Unlock', subtitle: 'Gull & Zubair', description: 'Use your fingerprint, face or device PIN', useFallback: true, maxAttempts: 3 });
return true;
} catch (e) { throw _nativeBioError(e); }
}
const savedCredId = await sqliteStore.get('bio_cred_id');
if (savedCredId === 'native') {
console.warn('[BiometricAuth] lock was enabled from the Android app; cannot be enforced in the browser');
return true;
}
if (!savedCredId) throw new Error("No credential found. Please disable and re-enable Fingerprint Lock.");
const challenge = new Uint8Array(32);
window.crypto.getRandomValues(challenge);
const publicKey = {
challenge: challenge,
rpId: window.location.hostname,
allowCredentials: [{
id: BiometricAuth._base64ToBuf(savedCredId),
type: "public-key"
}],
userVerification: "required",
timeout: 60000
};
await navigator.credentials.get({ publicKey });
return true;
} catch (err) {
console.error('[BiometricAuth] authenticate error:', _safeErr(err));
throw err;
}
}
};

export async function forceAppModeFromCloud(targetMode, repName = null) {
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
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
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

export function updateSystemName() {
const el = document.getElementById('system-name-display');
if (!el) return;
if (appMode === 'admin' || !appMode) {
el.textContent = 'MAHMOOD KHAN';
} else if (appMode === 'rep') {
el.textContent = (currentRepProfile || 'Sales Rep').toUpperCase();
} else if (appMode === 'production') {
el.textContent = (window._assignedManagerName || 'Production Manager').toUpperCase();
} else if (appMode === 'factory') {
el.textContent = (window._assignedManagerName || 'Factory Manager').toUpperCase();
} else if (appMode === 'userrole') {
el.textContent = (window._assignedManagerName || 'User').toUpperCase();
}
}

export function lockToRepMode() {
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
if (btn.id !== 'snav-rep') window.setDisplay(btn, 'none');
});
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if (cloudMenuBtn) window.setDisplay(cloudMenuBtn, 'none');
updateSystemName();
['prod', 'sales', 'calc', 'factory', 'payments'].forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); window.setDisplay(el, 'none'); }
});
const repTab = document.getElementById('tab-rep');
if (repTab) { repTab.classList.remove('hidden'); window.setDisplay(repTab, ''); }
const adminControls = document.getElementById('admin-rep-controls');
if (adminControls) { adminControls.classList.add('hidden'); window.setDisplay(adminControls, 'none'); }
const manageRepsBtn = document.getElementById('btn-manage-reps');
if (manageRepsBtn) window.setDisplay(manageRepsBtn, 'none');
const adminAnalytics = document.getElementById('admin-rep-analytics');
if (adminAnalytics) { adminAnalytics.classList.add('hidden'); window.setDisplay(adminAnalytics, 'none'); }
const newTransCard = document.getElementById('rep-new-transaction-card');
if (newTransCard) window.setDisplay(newTransCard, 'block');
if (typeof refreshRepUI === 'function') refreshRepUI();
}

export function lockToProductionMode() {
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
if (btn.id !== 'snav-prod') window.setDisplay(btn, 'none');
});
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if (cloudMenuBtn) window.setDisplay(cloudMenuBtn, 'none');
const manageRepsBtn = document.getElementById('btn-manage-reps');
if (manageRepsBtn) window.setDisplay(manageRepsBtn, 'none');
updateSystemName();
['sales', 'calc', 'factory', 'payments', 'rep'].forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); window.setDisplay(el, 'none'); }
});
const prodTab = document.getElementById('tab-prod');
if (prodTab) { prodTab.classList.remove('hidden'); window.setDisplay(prodTab, ''); }
const prodToggle = document.getElementById('prod-toggle-container');
if (prodToggle) window.setDisplay(prodToggle, 'none');
['combinedOverview', 'combinedChart', 'prod-analytics-section',
'prod-history-header', 'prodHistoryList'].forEach(id => {
const el = document.getElementById(id);
if (el) window.setDisplay(el, 'none');
});
const fBlock = document.getElementById('prod-formula-cost-block');
if (fBlock) window.setDisplay(fBlock, 'none');
const pBlock = document.getElementById('prod-profit-block');
if (pBlock) window.setDisplay(pBlock, 'none');
const spField = document.getElementById('prod-sale-price-field');
if (spField) window.setDisplay(spField, 'none');
const dynCost = document.getElementById('dynamic-cost-display');
if (dynCost) window.setDisplay(dynCost, 'none');
}

export function lockToFactoryMode() {
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
if (btn.id !== 'snav-factory') window.setDisplay(btn, 'none');
});
const cloudMenuBtn = document.getElementById('cloudMenuBtn');
if (cloudMenuBtn) window.setDisplay(cloudMenuBtn, 'none');
const manageRepsBtn = document.getElementById('btn-manage-reps');
if (manageRepsBtn) window.setDisplay(manageRepsBtn, 'none');
updateSystemName();
['prod', 'sales', 'calc', 'payments', 'rep'].forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); window.setDisplay(el, 'none'); }
});
const factoryTab = document.getElementById('tab-factory');
if (factoryTab) { factoryTab.classList.remove('hidden'); window.setDisplay(factoryTab, ''); }
const factorySettingsBtn = document.getElementById('factory-settings-btn');
if (factorySettingsBtn) window.setDisplay(factorySettingsBtn, 'none');
document.querySelectorAll('#tab-factory > .card').forEach(sec => {
window.setDisplay(sec, 'none');
});
const entrySection = document.getElementById('factory-entry-section');
if (entrySection) {
window.setDisplay(entrySection, '');
entrySection.classList.add('card');
const costDisplay = document.getElementById('factoryTotalProductionCostDisplay');
if (costDisplay) {
const fieldDiv = costDisplay.closest('.field');
if (fieldDiv) window.setDisplay(fieldDiv, 'none');
}
const formulaDisplay = document.getElementById('factoryFormulaDisplay');
if (formulaDisplay) window.setDisplay(formulaDisplay, 'none');
}
}

export function lockToUserRoleMode() {
const assignedTabs = window._assignedUserTabs || [];
const userName = window._assignedManagerName || 'User';
const allTabs = ['prod','sales','calc','factory','payments','rep'];
['cloudMenuBtn','btn-manage-reps'].forEach(id => {
const el = document.getElementById(id); if (el) window.setDisplay(el, 'none');
});
updateSystemName();
allTabs.forEach(t => {
const el = document.getElementById('tab-' + t);
if (el) { el.classList.add('hidden'); window.setDisplay(el, ''); }
});
if (assignedTabs.includes('prod')) {
const prodToggle = document.getElementById('prod-toggle-container');
if (prodToggle) window.setDisplay(prodToggle, 'none');
['combinedOverview','combinedChart','prod-analytics-section',
'prod-history-header','prodHistoryList'].forEach(id => {
const el = document.getElementById(id); if (el) window.setDisplay(el, 'none');
});
['prod-formula-cost-block','prod-profit-block','prod-sale-price-field'].forEach(id => {
const el = document.getElementById(id); if (el) window.setDisplay(el, 'none');
});
const dynCostEl = document.getElementById('dynamic-cost-display');
if (dynCostEl) window.setDisplay(dynCostEl, 'none');
document.querySelectorAll('#tab-prod > .card').forEach(sec => {
if (sec.id !== 'production-entry-section') window.setDisplay(sec, 'none');
});
const ui = document.getElementById('unitsAvailableIndicator');
if (ui) window.setDisplay(ui, '');
const iuw = document.getElementById('insufficientUnitsWarning');
if (iuw) window.setDisplay(iuw, '');
}
if (assignedTabs.includes('factory')) {
const fsBtn = document.getElementById('factory-settings-btn');
if (fsBtn) window.setDisplay(fsBtn, 'none');
document.querySelectorAll('#tab-factory > .card').forEach(sec => window.setDisplay(sec, 'none'));
const entry = document.getElementById('factory-entry-section');
if (entry) {
window.setDisplay(entry, '');
entry.classList.add('card');
const cd = document.getElementById('factoryTotalProductionCostDisplay');
if (cd) { const f = cd.closest('.field'); if (f) window.setDisplay(f, 'none'); }
const fd = document.getElementById('factoryFormulaDisplay');
if (fd) window.setDisplay(fd, 'none');
}
}
if (assignedTabs.includes('sales')) {
const sh = document.querySelector('#tab-sales header');
if (sh) sh.querySelectorAll('button, .btn-theme').forEach(b => window.setDisplay(b, 'none'));
let si = 0;
document.querySelectorAll('#tab-sales > .card').forEach(sec => {
if (si === 0) { si++; return; }
window.setDisplay(sec, 'none'); si++;
});
['sale-result-cost','sale-result-value','sale-result-profit'].forEach(id => {
const el = document.getElementById(id); if (el) window.setDisplay(el, 'none');
});
const st = document.getElementById('sales-summary-toggle');
if (st) { const sh2 = st.closest('.section-header'); if (sh2) window.setDisplay(sh2, 'none'); }
const sc = document.getElementById('sales-summary-card');
if (sc) window.setDisplay(sc, 'none');
const cl = document.getElementById('custHistoryList');
if (cl) { const prev = cl.previousElementSibling; if (prev) window.setDisplay(prev, 'none'); window.setDisplay(cl, 'none'); }
}
if (assignedTabs.includes('payments')) {
const eb = document.querySelector('#tab-payments header .btn-theme');
if (eb) window.setDisplay(eb, 'none');
let pi = 0;
document.querySelectorAll('#tab-payments > .card').forEach(sec => {
if (pi === 0) { pi++; return; }
window.setDisplay(sec, 'none'); pi++;
});
const us = document.getElementById('payments-unified-section');
if (us) window.setDisplay(us, 'none');
const ph = document.getElementById('payment-history-section');
if (ph) window.setDisplay(ph, 'none');
const pl = document.getElementById('paymentHistoryList');
if (pl) window.setDisplay(pl, 'none');
}
if (assignedTabs.length > 0 && typeof showTab === 'function') {
showTab(assignedTabs[0]);
}
}

export async function enforceRepModeLock() {
if (window._modeLockEnforced) return;
window._modeLockEnforced = true;
try {
const storedMode = await sqliteStore.get('appMode');
if (storedMode === 'rep') {
_set_appMode('rep');
_set_currentRepProfile(await sqliteStore.get('repProfile') || (salesRepsList[0] || 'NORAN SHAH'));
lockToRepMode();
} else if (storedMode === 'userrole') {
_set_appMode('userrole');
window._assignedManagerName = await sqliteStore.get('assignedManager') || null;
window._assignedUserTabs = await sqliteStore.get('assignedUserTabs') || [];
window._userRoleAllowedTabs = window._assignedUserTabs;
lockToUserRoleMode();
} else if (storedMode === 'production') {
_set_appMode('production');
window._assignedManagerName = await sqliteStore.get('assignedManager') || null;
lockToProductionMode();
} else if (storedMode === 'factory') {
_set_appMode('factory');
window._assignedManagerName = await sqliteStore.get('assignedManager') || null;
lockToFactoryMode();
}
} catch(e) {
console.warn('enforceRepModeLock: failed to read mode from SQLite, defaulting to admin.', _safeErr(e));
}
}

export function preventAdminAccess() {
if (!window._originalShowTab && typeof window.showTab === 'function') {
window._originalShowTab = window.showTab;
}
if (window._originalShowTab) window.showTab = window._originalShowTab;
if (appMode === 'rep') {
const originalShowTab = window._originalShowTab || window.showTab;
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
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
window.setDisplay(btn, 'none');
});
} else if (appMode === 'userrole') {
const allowedTabs = window._userRoleAllowedTabs || window._assignedUserTabs || [];
const originalShowTabUR = window._originalShowTab || window.showTab;
window.showTab = function(tab) {
if (!allowedTabs.includes(tab)) {
showToast('Access Denied — not in your assigned sections', 'warning', 3000);
return;
}
if (typeof originalShowTabUR === 'function') originalShowTabUR(tab);
if (tab === 'payments') {
const _ph = document.getElementById('payment-history-section');
if (_ph) { window.setDisplay(_ph, 'none'); window.setStyle(_ph, 'visibility', 'st-visibility__e77555'); }
const _pl = document.getElementById('paymentHistoryList');
if (_pl) window.setDisplay(_pl, 'none');
const _us = document.getElementById('payments-unified-section');
if (_us) window.setDisplay(_us, 'none');
}
};
if (allowedTabs.length <= 1) {
document.querySelectorAll('[id^="snav-"]').forEach(btn => { window.setDisplay(btn, 'none'); });
} else {
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
const tid = btn.id.replace('snav-', '');
window.setDisplay(btn, (allowedTabs.includes(tid)) ? '' : 'none');
});
}
window._userRoleAllowedTabs = allowedTabs;
} else if (appMode === 'production') {
const originalShowTabProd = window._originalShowTab || window.showTab;
window.showTab = function(tab) {
if (tab !== 'prod') {
showToast("Access Denied - Device in Production Manager Mode", "warning", 3000);
return;
}
if (typeof originalShowTabProd === 'function') originalShowTabProd(tab);
};
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
window.setDisplay(btn, 'none');
});
} else if (appMode === 'factory') {
const originalShowTabFactory = window._originalShowTab || window.showTab;
window.showTab = function(tab) {
if (tab !== 'factory') {
showToast("Access Denied - Device in Factory Manager Mode", "warning", 3000);
return;
}
if (typeof originalShowTabFactory === 'function') originalShowTabFactory(tab);
};
document.querySelectorAll('[id^="snav-"]').forEach(btn => {
window.setDisplay(btn, 'none');
});
}
}

export async function unlockAdminMode() {
_set_appMode('admin');
updateSystemName();
window._assignedManagerName = null;
window._assignedUserTabs = [];
window._userRoleAllowedTabs = [];
_set_currentRepProfile(null);
const timestamp = Date.now();
await sqliteStore.set('appMode', 'admin');
await sqliteStore.set('appMode_timestamp', timestamp);
await sqliteStore.set('assignedManager', null);
await sqliteStore.set('assignedUserTabs', []);
await sqliteStore.set('repProfile', null);
if (typeof firebaseDB !== 'undefined' && firebaseDB && window._firestoreNetworkDisabled) {
try { await firebaseDB.enableNetwork(); window._firestoreNetworkDisabled = false; } catch (_en) {}
}
if (typeof OfflineQueue !== 'undefined' && navigator.onLine) {
try { await OfflineQueue.processQueue(); } catch (_oq) {}
}
notifyDataChange('all');
showToast('Switching to Admin Mode...', 'info', 1500);
setTimeout(() => {
location.reload();
}, 2000);
}

export async function deleteRepTransaction(id) {
const rep = ensureArray(await sqliteStore.get('rep'));
if (!id || !validateUUID(id)) {
window.notifyBlocking('Invalid transaction ID', 'error', 'Something went wrong');
return;
}
const transaction = rep.find(t => t.id === id);
if (!transaction) {
await refreshRepUI(true);
return;
}
if (transaction.isMerged) {
window.notifyBlocking('Merged opening balance records cannot be deleted', 'warning', 'Action not allowed');
return;
}
{
const _blk = await getSaleBlockReason(id, 'rep');
if (_blk) { window.notifyBlocking(_blk, 'warning', 'Warning'); return; }
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
confirmMsg += `\nBalance: ${fmtAmt(_rtAmt)}`;
confirmMsg += `\nRecorded: ${_rtDate}`;
if (transaction.notes) confirmMsg += `\nNote: ${transaction.notes}`;
confirmMsg += `\n\n\u26a0 Warning: This will erase the carried-forward balance from this rep customer's history permanently.`;
} else if (_rtPayType === 'COLLECTION') {
confirmTitle = 'Delete Rep Bulk Collection';
confirmMsg = `Delete this bulk collection payment?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nAmount Collected: ${fmtAmt(_rtAmt)}`;
confirmMsg += `\n\n\u21a9 This will reverse the collection and restore the customer's outstanding balance.`;
} else if (_rtPayType === 'PARTIAL_PAYMENT') {
confirmTitle = 'Delete Rep Partial Payment';
confirmMsg = `Delete this partial payment?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nPayment: ${fmtAmt(_rtAmt)}`;
confirmMsg += `\n\n\u21a9 This will reverse the partial payment and restore the pending credit balance.`;
} else if (_rtPayType === 'CREDIT') {
confirmTitle = 'Delete Rep Credit Sale';
confirmMsg = `Delete this credit sale permanently?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nQty: ${_rtQty} kg — ${fmtAmt(_rtAmt)}`;
if (_rtPartialPaid > 0) confirmMsg += `\n\n\u26a0 ${fmtAmt(_rtPartialPaid)} partially collected. Deleting will erase both the sale and partial payment.`;
else if (transaction.creditReceived) confirmMsg += `\n\n\u26a0 This sale is already marked PAID. Deleting will remove the payment record.`;
else confirmMsg += `\n\n\u26a0 This credit sale is UNPAID. Deleting will remove the outstanding balance.`;
} else {
confirmTitle = 'Delete Rep Cash Sale';
confirmMsg = `Delete this cash sale permanently?\n\nRep: ${_rtRep}\nCustomer: ${_rtCust}\nDate: ${_rtDate}\nQty: ${_rtQty} kg — ${fmtAmt(_rtAmt)}`;
confirmMsg += `\n\n\u21a9 ${_rtQty} kg will be restored to inventory.`;
}
confirmMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: confirmTitle || 'Delete Rep Transaction', confirmText: "Delete", danger: true })) {
try {
const wasPartialPayment = transaction.paymentType === 'PARTIAL_PAYMENT';
const wasCollection = transaction.paymentType === 'COLLECTION';
const wasCredit = transaction.paymentType === 'CREDIT';
const paymentAmount = transaction.totalValue || 0;
await detachChildPayment('rep', transaction, rep);
const repSalesFiltered = rep.filter(s => s.id !== id);
await unifiedDelete('rep', repSalesFiltered, id, { strict: true }, transaction);
if (wasCollection && Number(transaction.expiredQty) > 0 && transaction.expiredApplied !== false) {
await reverseExpiredFromChora(Number(transaction.expiredQty), transaction.date);
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
message += ` Payment of ${fmtAmt(refundAmount)} reversed.`;
}
} catch (error) {
window.notifyBlocking('Failed to delete transaction. Please try again.', 'error', 'Something went wrong');
}
}
}

export async function handleCustomerInput(query, mode) {
const { rep, sales, clients, customers } = await loadCollections('rep', 'sales', 'clients', 'customers');
if (!query) query = '';
if (typeof query !== 'string') query = String(query);
const isRep = mode === 'rep';
const phoneContainerId = isRep ? 'rep-new-customer-phone-container' : 'new-customer-phone-container';
const phoneContainer = document.getElementById(phoneContainerId);
const allSales = isRep ?
(Array.isArray(rep) ? rep : []).filter(s => s.salesRep === currentRepProfile) :
(Array.isArray(sales) ? sales : []).filter(s => s && s.currentRepProfile === 'admin');
const allRegistryNames = !isRep && Array.isArray(customers)
? customers.filter(c => c && c.name).map(c => String(c.name).trim().toLowerCase())
: Array.isArray(clients)
? clients.filter(c => c && c.name).map(c => String(c.name).trim().toLowerCase())
: [];
const existingNames = [...new Set([
...allSales
.map(s => s && s.customerName ? s.customerName : null)
.filter(n => n !== null && n !== undefined && n !== '' && typeof n === 'string')
.map(n => { try { return String(n).trim().toLowerCase(); } catch (e) { return null; } })
.filter(n => n !== null && n !== ''),
...allRegistryNames
])];
let safeQuery = '';
try {
safeQuery = query ? String(query).trim().toLowerCase() : '';
} catch (e) {
safeQuery = '';
}
const isNewCustomer = safeQuery.length > 2 && !existingNames.includes(safeQuery);
const historyInput = document.getElementById(isRep ? 'rep-cust-name' : 'cust-name');
if (historyInput) historyInput.dataset.histCustomer = existingNames.includes(safeQuery) ? safeQuery : '';
applyCustomerHistoryFilter(isRep ? 'rep' : 'admin');
if (!phoneContainer) return;
if (isNewCustomer) {
phoneContainer.classList.remove('hidden');
} else {
phoneContainer.classList.add('hidden');
}
}

export async function handleUniversalSearch(inputId, resultsId, dataSource) {
const { rep, sales, clients, customers, entities } = await loadCollections('rep', 'sales', 'clients', 'customers', 'entities');
const input = document.getElementById(inputId);
const resultsDiv = document.getElementById(resultsId);
if (!input || !resultsDiv) return;
const query = input.value || '';
if ((!query || query.length < 1) && !String(dataSource).startsWith('ledger-') && dataSource !== 'field-expense-category' && dataSource !== 'commission-category') {
resultsDiv.classList.add('hidden');
return;
}
let matches = [];
let html = '';
switch(dataSource) {
case 'customers': {
let _freshSalesReg = [];
try { _freshSalesReg = await sqliteStore.get('customers', []) || []; } catch(e) {}
const _salesRegMap = new Map((_freshSalesReg).filter(c => c && c.id).map(c => [c.id, c]));
if (Array.isArray(customers)) customers.forEach(c => { if (c && c.id && !_salesRegMap.has(c.id)) _salesRegMap.set(c.id, c); });
const _mergedSalesReg = Array.from(_salesRegMap.values());
const _custNamesFromSales = sales
.filter(s => s && s.currentRepProfile === 'admin')
.map(s => s.customerName)
.filter(n => n && typeof n === 'string');
const _custNamesFromRegistry = _mergedSalesReg
.filter(c => c && c.name && typeof c.name === 'string').map(c => c.name);
const uniqueCustomers = [...new Set([..._custNamesFromSales, ..._custNamesFromRegistry])];
matches = uniqueCustomers.filter(name =>
name && typeof name === 'string' && name.toLowerCase().includes(query.toLowerCase())
);
if (matches.length > 0) {
matches.forEach(name => {
const safeName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
html += `
<div class="u-cf7d8a2 st-background__356c02 hv-highlight"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'name')">
<strong>${esc(name)}</strong>
</div>`;
});
} else {
html = `<div class="empty is-compact" >
No match found. "${query}" will be created as new customer.
</div>`;
}
break;
}
case 'entities':
if (Array.isArray(entities)) {
matches = entities.filter(entity =>
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
<div class="u-cf7d8a2 st-background__356c02 hv-highlight"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'entity', '${safeId}')">
<strong>${esc(entity.name)}</strong>
</div>`;
});
} else {
html = `<div class="empty is-compact" >
No matching entities found
</div>`;
}
break;
case 'ledger-category':
case 'ledger-mode':
case 'ledger-party': {
const ledgerItems = typeof window.dailyLedgerSearchItems === 'function' ? await window.dailyLedgerSearchItems(dataSource, query) : [];
if (ledgerItems.length > 0) {
ledgerItems.forEach(it => {
const safeItem = String(it.value).replace(/'/g, "\\'").replace(/"/g, '&quot;');
html += `
<div class="u-cf7d8a2 st-background__356c02 hv-highlight"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeItem}', 'ledger')">
<strong>${esc(it.value)}</strong>${it.tag ? ` <span class="u-fs-sm2 u-text-muted">${esc(it.tag)}</span>` : ''}
</div>`;
});
} else if (query) {
html = `<div class="empty is-compact" >
No match found. "${esc(query)}" will be created as new.
</div>`;
} else {
resultsDiv.classList.add('hidden');
return;
}
break;
}
case 'field-expense-category':
case 'commission-category': {
const catItems = typeof window.expenseCategorySearchItems === 'function' ? await window.expenseCategorySearchItems(dataSource, query) : [];
if (catItems.length > 0) {
catItems.forEach(it => {
const safeItem = String(it.value).replace(/'/g, "\\'").replace(/"/g, '&quot;');
html += `
<div class="u-cf7d8a2 st-background__356c02 hv-highlight"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeItem}', 'category-pick')">
<strong>${esc(it.value)}</strong>${it.tag ? ` <span class="u-fs-sm2 u-text-muted">${esc(it.tag)}</span>` : ''}
</div>`;
});
} else if (query) {
html = `<div class="empty is-compact" >
No match found. "${esc(query)}" will be created as new.
</div>`;
} else {
resultsDiv.classList.add('hidden');
return;
}
break;
}
case 'suppliers':
if (Array.isArray(entities)) {
matches = entities.filter(entity =>
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
<div class="u-cf7d8a2 st-background__356c02 hv-highlight"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'supplier', '${safeId}')">
<strong>${esc(supplier.name)}</strong>
${supplier.phone ? `<span class="u-8ce609a st-font-size__8e87b7 st-color__5872de">${phoneActionHTML(supplier.phone)}</span>` : ''}
</div>`;
});
} else {
html = `<div class="empty is-compact" >
No matching suppliers found
</div>`;
}
break;
case 'clients': {
let _freshRepReg = [];
try { _freshRepReg = await sqliteStore.get('clients', []) || []; } catch(e) {}
const _repRegMap = new Map((_freshRepReg).filter(c => c && c.id).map(c => [c.id, c]));
if (Array.isArray(clients)) clients.forEach(c => { if (c && c.id && !_repRegMap.has(c.id)) _repRegMap.set(c.id, c); });
const _mergedRepReg = Array.from(_repRegMap.values());
const _repNamesFromSales = rep
.filter(s => s.salesRep === currentRepProfile)
.map(s => s.customerName)
.filter(n => n && typeof n === 'string');
const _repNamesFromRegistry = _mergedRepReg
.filter(c => c && c.name && typeof c.name === 'string' && c.salesRep === currentRepProfile).map(c => c.name);
const repUniqueCustomers = [...new Set([..._repNamesFromSales, ..._repNamesFromRegistry])];
matches = repUniqueCustomers.filter(name =>
name && typeof name === 'string' && name.toLowerCase().includes(query.toLowerCase())
);
if (matches.length > 0) {
matches.forEach(name => {
const safeName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
html += `
<div class="u-cf7d8a2 st-background__356c02 hv-highlight"
onmousedown="selectFromUniversalSearch('${inputId}', '${resultsId}', '${safeName}', 'repName')">
<strong>${esc(name)}</strong>
</div>`;
});
} else {
html = `<div class="empty is-compact" >
No match found. "${query}" will be created.
</div>`;
}
break;
}
}
resultsDiv.innerHTML = html;
resultsDiv.classList.remove('hidden');
}

export function selectFromUniversalSearch(inputId, resultsId, value, type, id) {
const input = document.getElementById(inputId);
const resultsDiv = document.getElementById(resultsId);
if (input) {
input.value = value;
if (id) {
input.setAttribute('data-entity-id', id);
input.setAttribute('data-supplier-id', id);
if (/-search$/.test(inputId)) {
const valueField = document.getElementById(inputId.replace(/-search$/, '-value'));
if (valueField) valueField.value = id;
}
}
}
if (resultsDiv) {
resultsDiv.classList.add('hidden');
}
if (type === 'name' && inputId === 'cust-name') {
if (typeof calculateCustomerStatsForDisplay === 'function') {
calculateCustomerStatsForDisplay(value);
}
if (input) input.dataset.histCustomer = String(value || '').trim().toLowerCase();
applyCustomerHistoryFilter('admin');
const _phoneContainer = document.getElementById('new-customer-phone-container');
if (_phoneContainer) _phoneContainer.classList.add('hidden');
} else if (type === 'repName' && inputId === 'rep-cust-name') {
if (typeof calculateRepCustomerStatsForDisplay === 'function') {
calculateRepCustomerStatsForDisplay(value);
}
if (input) input.dataset.histCustomer = String(value || '').trim().toLowerCase();
applyCustomerHistoryFilter('rep');
} else if (type === 'name' && inputId === 'cust-add-search') {
if (typeof openCustomerEditModal === 'function') openCustomerEditModal(value);
} else if (type === 'repName' && inputId === 'rep-cust-add-search') {
if (typeof openRepCustomerEditModal === 'function') openRepCustomerEditModal(value);
} else if (type === 'name' && inputId === 'edit-cust-name') {
if (typeof openCustomerEditModal === 'function') openCustomerEditModal(value);
} else if (type === 'repName' && inputId === 'rep-edit-cust-name') {
if (typeof openRepCustomerEditModal === 'function') openRepCustomerEditModal(value);
} else if (type === 'ledger' && typeof window.dailyLedgerOnPick === 'function') {
window.dailyLedgerOnPick(inputId, value);
} else if (type === 'category-pick' && typeof window.expenseCategoryOnPick === 'function') {
window.expenseCategoryOnPick(inputId);
}
}

document.addEventListener('click', function(e) {
if (!e.target.closest('[id^="fh-breakdown-"], [id^="sold-breakdown-"], #perf-sum-raw-breakdown') &&
    !e.target.closest('button[onclick*="fh-breakdown-"], button[onclick*="sold-breakdown-"], button[onclick*="perf-sum-raw-breakdown"]')) {
  document.querySelectorAll('[id^="fh-breakdown-"], [id^="sold-breakdown-"], #perf-sum-raw-breakdown').forEach(panel => {
    if (window.getDisplay(panel) !== 'none') {
      window.setDisplay(panel, 'none');
      const btn = panel.previousElementSibling;
      if (btn && btn.tagName === 'BUTTON') {
        const arrow = btn.querySelector('span:first-child');
        if (arrow) {
          if (arrow.textContent === '▼') arrow.textContent = '▶';
        }
      }
    }
  });
}
const searchables = [
{ input: 'cust-name', results: 'customer-search-results' },
{ input: 'rep-cust-name', results: 'rep-customer-search-results' },
{ input: 'paymentEntity', results: 'payment-entity-search-results' },
{ input: 'factoryExistingSupplier', results: 'factory-supplier-search-results' },
{ input: 'payment-transfer-from-search', results: 'payment-transfer-from-results' },
{ input: 'payment-transfer-to-search', results: 'payment-transfer-to-results' },
{ input: 'dl-mode', results: 'dl-mode-results' },
{ input: 'dl-to-mode', results: 'dl-to-results' },
{ input: 'dl-party', results: 'dl-party-results' },
{ input: 'dl-dlg-new', results: 'dl-dlg-results' },
{ input: 'fe-name', results: 'fe-results' },
{ input: 'cp-name', results: 'cp-results' }
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

window.selectCustomer = function(name) {
  const base = window._selectCustomerBase;
  if (typeof base === 'function') base(name);
  document.getElementById('new-customer-phone-container').classList.add('hidden');
  document.getElementById('new-cust-phone').value = '';
};

window.selectRepCustomer = function(name) {
  const base = window._selectRepCustomerBase;
  if (typeof base === 'function') base(name);
  document.getElementById('rep-new-customer-phone-container').classList.add('hidden');
  document.getElementById('rep-new-cust-phone').value = '';
};

export async function initTheme() {
const savedPref = readStoredPref() || normalizePref(await sqliteStore.get('theme'));
const savedTheme = resolveTheme(savedPref);
const html = document.documentElement;
html.setAttribute('data-theme', savedTheme);
writeStoredPref(savedPref);
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
themeToggle.innerHTML = savedTheme === 'dark' ? '' : '';
themeToggle.title = 'Theme: ' + prefLabel(savedPref);
}
const themeLabel = document.getElementById('theme-mode-label');
if (themeLabel) themeLabel.textContent = 'Theme: ' + prefLabel(savedPref);
const metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
metaThemeColor.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}
}

export const FIRESTORE_ENHANCED_SCHEMA = {
production: {
localKey: 'production',
firestoreCollection: 'production',
localVariable: 'production',
type: 'array',
description: 'Manufacturing / production records',
fields: ['date', 'netWeight', 'costPrice', 'salePrice', 'profit', 'id', 'timestamp']
},
calculator: {
localKey: 'calculator',
firestoreCollection: 'calculator',
localVariable: 'calculator',
type: 'array',
description: 'Calculator history – totals, revenue, returns, cash/credit splits',
fields: ['totalSold', 'revenue', 'returns', 'cash', 'credit', 'seller', 'date', 'id', 'timestamp']
},
sales: {
localKey: 'sales',
firestoreCollection: 'sales',
localVariable: 'sales',
type: 'array',
description: 'Individual customer sales transactions',
fields: ['customerName', 'quantity', 'paymentType', 'supplyStore', 'date', 'phone', 'id', 'timestamp']
},
rep: {
localKey: 'rep',
firestoreCollection: 'rep',
localVariable: 'rep',
type: 'array',
description: 'Rep-mode sales with GPS coordinates',
fields: ['customerName', 'quantity', 'paymentType', 'salesRep', 'latitude', 'longitude', 'date', 'phone', 'id', 'timestamp']
},
inventory: {
localKey: 'inventory',
firestoreCollection: 'inventory',
localVariable: 'inventory',
type: 'array',
description: 'Raw-material inventory (name, qty, cost, value)',
fields: ['materialName', 'quantityOnHand', 'unitCost', 'totalValue', 'id', 'timestamp']
},
factory: {
localKey: 'factory',
firestoreCollection: 'factory',
localVariable: 'factory',
type: 'array',
description: 'Factory formula production-batch history',
fields: ['unitsProduced', 'materialCosts', 'productType', 'date', 'id', 'timestamp']
},
returns: {
localKey: 'returns',
firestoreCollection: 'returns',
localVariable: 'returns',
type: 'array',
description: 'Stock-return logs from sellers',
fields: ['seller', 'quantity', 'reason', 'date', 'id', 'timestamp']
},
entities: {
localKey: 'entities',
firestoreCollection: 'entities',
localVariable: 'entities',
type: 'array',
description: 'Registry of payment entities',
fields: ['name', 'phone', 'entityType', 'id', 'timestamp']
},
transactions: {
localKey: 'transactions',
firestoreCollection: 'transactions',
localVariable: 'transactions',
type: 'array',
description: 'Cash-in / cash-out ledger linked to entities',
fields: ['entityId', 'amount', 'type', 'description', 'date', 'id', 'timestamp']
},
expenses: {
localKey: 'expenses',
firestoreCollection: 'expenses',
localVariable: 'expenses',
type: 'array',
description: 'Unified expense manager records (operating expenses, payments IN/OUT)',
fields: ['name', 'amount', 'category', 'description', 'date', 'time', 'id', 'timestamp', 'syncedAt']
}
};

export const FIRESTORE_SETTINGS_SCHEMA = {
defaults: {
localKey: 'defaults',
localVariable: 'factoryDefaultFormulas',
type: 'object',
defaultValue: {},
description: 'Recipe / formula definitions by formula id'
},
costs: {
localKey: 'costs',
localVariable: 'factoryAdditionalCosts',
type: 'object',
defaultValue: {},
description: 'Overhead / extra costs per unit'
},
adjustment: {
localKey: 'adjustment',
localVariable: 'factoryCostAdjustmentFactor',
type: 'object',
defaultValue: {},
description: 'Cost-price multiplier for reporting'
},
tracking: {
localKey: 'tracking',
localVariable: 'factoryUnitTracking',
type: 'object',
defaultValue: {},
description: 'Unit lifecycle: produced → consumed → available'
},
settings: {
localKey: 'settings',
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
defaultValue: 'NORAN SHAH',
description: 'Active sales-representative profile name'
},
deleted: {
localKey: 'deleted',
localVariable: 'deletedRecordIds',
type: 'set_as_array',
defaultValue: [],
description: 'Tombstone IDs – prevents deleted records from re-appearing on sync'
},
synced: {
localKey: 'synced',
localVariable: null,
type: 'string_iso_date',
defaultValue: null,
description: 'ISO timestamp of the last successful cloud sync'
}
};

export const FIRESTORE_LOCAL_ONLY_KEYS = {
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

export function updateConnectionStatus() {
if (!navigator.onLine) {
_setCloudConnectionState(null);
} else if (typeof firebase === 'undefined') {
_setCloudConnectionState('signed-out');
} else if (!(firebase.apps.length && currentUser)) {
_setCloudConnectionState('signed-out');
} else {
_setCloudConnectionState(null);
}
}

window.addEventListener('online', () => { updateConnectionStatus(); if(typeof updateOfflineBanner==='function') updateOfflineBanner(); });
window.addEventListener('offline', () => { updateConnectionStatus(); if(typeof updateOfflineBanner==='function') updateOfflineBanner(); });
export const originalSync = window.performOneClickSync;

window.performOneClickSync = async function(silent) {
updateConnectionStatus();
try {
await originalSync(silent);
} finally {
_set_isSyncing(false);
updateConnectionStatus();
}
};

(function registerRenderFunctions() {
if (typeof renderUnifiedTable === 'function') {
}
if (typeof renderCustomersTable === 'function') {
}
if (typeof renderEntityTable === 'function') {
}
if (typeof renderExpenseTable === 'function') {
}
if (typeof renderRepCustomerTable === 'function') {
}
})();

export var ThemeManager = {
currentTheme: 'dark',
observers: new Set(),
async init() {
const saved = await sqliteStore.get('theme', null);
this.currentTheme = resolveTheme(readStoredPref() || saved);
this.apply();
},
apply() {
document.documentElement.setAttribute('data-theme', this.currentTheme);
this.notifyObservers();
},
setTheme(theme) {
this.currentTheme = theme;
writeStoredPref(theme);
sqliteStore.set('theme', theme).catch(() => {});
this.apply();
},
toggle() {
this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
},
observe(callback) {
this.observers.add(callback);
return () => this.observers.delete(callback);
},
notifyObservers() {
this.observers.forEach(cb => cb(this.currentTheme));
},
getVar(varName) {
return getComputedStyle(document.documentElement)
.getPropertyValue(`--${varName}`).trim();
}
};

export const IncrementalRenderer = {
queue: [],
isRendering: false,
batchSize: 20,
enqueue(items, renderFunc, container) {
this.queue.push({ items, renderFunc, container });
if (!this.isRendering) {
this.processQueue();
}
},
async processQueue() {
this.isRendering = true;
while (this.queue.length > 0) {
const { items, renderFunc, container } = this.queue.shift();
container.innerHTML = '';
for (let i = 0; i < items.length; i += this.batchSize) {
const batch = items.slice(i, i + this.batchSize);
const fragment = document.createDocumentFragment();
batch.forEach(item => {
const element = renderFunc(item);
if (element) {
fragment.appendChild(element);
}
});
container.appendChild(fragment);
}
}
this.isRendering = false;
}
};

export class ReactiveComponent {
constructor(element, config = {}) {
this.element = element;
this.state = config.initialState || {};
this.styleMap = config.styleMap || {};
this.listeners = new Map();
}
setState(newState) {
const oldState = { ...this.state };
this.state = { ...this.state, ...newState };
this.syncStyles();
this.notifyListeners(oldState, this.state);
}
syncStyles() {
Object.entries(this.styleMap).forEach(([stateKey, styles]) => {
if (this.state[stateKey]) {
Object.assign(this.element.style, styles);
}
});
}
on(event, callback) {
if (!this.listeners.has(event)) {
this.listeners.set(event, new Set());
}
this.listeners.get(event).add(callback);
}
notifyListeners(oldState, newState) {
const listeners = this.listeners.get('change');
if (listeners) {
listeners.forEach(cb => cb(newState, oldState));
}
}
}

export var PerformanceMonitor = {
metrics: {
renderTime: [],
queryTime: [],
syncTime: []
},
startTimer(operation) {
return performance.now();
},
endTimer(operation, startTime) {
const duration = performance.now() - startTime;
if (this.metrics[operation]) {
this.metrics[operation].push(duration);
if (this.metrics[operation].length > 100) {
this.metrics[operation].shift();
}
}
return duration;
},
getAverages() {
const averages = {};
for (const [key, values] of Object.entries(this.metrics)) {
if (values.length > 0) {
averages[key] = values.reduce((a, b) => a + b, 0) / values.length;
}
}
return averages;
},
report() {
const averages = this.getAverages();
}
};

window.addEventListener('beforeunload', function() {
if (listenerReconnectTimer) {
clearTimeout(listenerReconnectTimer);
}
if (window._scrollRafId != null) {
cancelAnimationFrame(window._scrollRafId);
window._scrollRafId = null;
}
if (window._rafScrollHandler) {
window.removeEventListener('scroll', window._rafScrollHandler);
window._rafScrollHandler = null;
}
if (window._fbOfflineHandler) { window.removeEventListener('offline', window._fbOfflineHandler); window._fbOfflineHandler = null; }
if (window._tombstoneCleanupInterval) { clearInterval(window._tombstoneCleanupInterval); window._tombstoneCleanupInterval = null; }
if (window._syncUpdatesCleanupInterval) { clearInterval(window._syncUpdatesCleanupInterval); window._syncUpdatesCleanupInterval = null; }
if (window._connectionCheckInterval) { clearInterval(window._connectionCheckInterval); window._connectionCheckInterval = null; }
if (window._perfMonitorInterval) { clearInterval(window._perfMonitorInterval); window._perfMonitorInterval = null; }
});

export async function loadSalesRepsList() {
const stored = await sqliteStore.get('reps', null);
if (Array.isArray(stored) && stored.length > 0) {
_set_salesRepsList(stored);
} else {
_set_salesRepsList(['NORAN SHAH', 'NOMAN SHAH']);
await sqliteStore.set('reps', salesRepsList);
}
const storedUserRoles = await sqliteStore.get('roles', null);
if (Array.isArray(storedUserRoles)) _set_userRolesList(storedUserRoles);
if (firebaseDB && currentUser) {
try {
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
const teamDoc = await userRef.collection('settings').doc('team').get();
if (teamDoc.exists) {
const teamData = teamDoc.data();
const cloudTs = teamData.updated || 0;
const localTs = (await sqliteStore.get('team_timestamp')) || 0;
if (cloudTs >= localTs) {
if (Array.isArray(teamData.reps) && teamData.reps.length > 0) {
_set_salesRepsList(teamData.reps);
await sqliteStore.set('reps', salesRepsList);
}
if (Array.isArray(teamData.roles)) {
_set_userRolesList(teamData.roles);
await sqliteStore.set('roles', userRolesList);
}
if (cloudTs > localTs) await sqliteStore.set('team_timestamp', cloudTs);
}
}
} catch(e) { console.warn('Could not fetch team list from Firestore on startup:', _safeErr(e)); }
}
renderAllRepUI();
}

export async function saveSalesRepsList() {
try {
await sqliteStore.set('reps', salesRepsList);
await pushTeamSettings('sales reps');
renderAllRepUI();
} catch(e) {
console.error('saveSalesRepsList error:', _safeErr(e));
showToast('Failed to save team list. Please try again.', 'error');
}
}

export async function saveUserRolesList() {
try {
await sqliteStore.set('roles', userRolesList);
await pushTeamSettings('user roles');
} catch(e) {
console.error('saveUserRolesList error:', _safeErr(e));
showToast('Failed to save user roles. Please try again.', 'error');
}
}

export function renderAllRepUI() {
const adminSel = document.getElementById('admin-rep-selector');
if (adminSel) {
const prev = adminSel.value;
adminSel.innerHTML = salesRepsList.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
if (salesRepsList.includes(prev)) adminSel.value = prev;
else if (salesRepsList.includes(currentRepProfile)) adminSel.value = currentRepProfile;
else if (salesRepsList.length > 0) { adminSel.value = salesRepsList[0]; _set_currentRepProfile(salesRepsList[0]); }
}
const sellerSel = document.getElementById('sellerSelect');
if (sellerSel) {
const prev2 = sellerSel.value;
sellerSel.innerHTML = salesRepsList.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('') +
'<option value="COMBINED">COMPARISON</option>';
if (salesRepsList.includes(prev2) || prev2 === 'COMBINED') sellerSel.value = prev2;
}
const toggleGroup = document.getElementById('sales-rep-toggle-group');
if (toggleGroup) {
const currentVal = document.getElementById('sales-rep-value')?.value || 'NONE';
toggleGroup.innerHTML = `<button id="btn-rep-none" class="toggle-opt${currentVal === 'NONE' ? ' active' : ''}" onclick="selectSalesRep(this,'NONE')">Direct</button>` +
salesRepsList.map((r, i) => {
const firstName = r.split(' ')[0];
const shortName = firstName.charAt(0) + firstName.slice(1).toLowerCase();
return `<button id="btn-rep-dyn-${i}" class="toggle-opt${currentVal === r ? ' active' : ''}" onclick="selectSalesRep(this,'${esc(r)}')">${esc(shortName)}</button>`;
}).join('');
}
renderManageRepsList();
}

export function renderManageRepsList() {
const list = document.getElementById('manage-reps-list');
if (!list) return;
if (salesRepsList.length === 0) {
list.innerHTML = '<div class="u-cca393b">No representatives added yet.</div>';
return;
}
list.innerHTML = salesRepsList.map((rep, i) => `
<div class="d-flex st-align-items__7c6197 st-padding__8d6c25 st-background__f38efd st-border-bottom__e54b2f st-border-radius__c8d49a u-4d20c0a${i === 0 ? ' st-border__ad358e' : ''}">
<div class="u-2c42b11 d-flex">
<span class="u-76ebb48 has-overflow u-0da05dd">${esc(rep)}</span>
<span class="st-font-size__8303b5 st-font-weight__e3ec02 u-3d59ac9 u-fa74faf dc-color u-b62856e" style="--d-color: ${i === 0 ? 'var(--accent)' : 'var(--text-muted)'}">${i === 0 ? ' Default' : `#${i + 1}`}</span>
</div>
<button class="btn btn-theme u-eeccbea st-border-bottom__b34a17" onclick="removeSalesRep(${i})" title="Remove ${esc(rep)}"></button>
</div>
`).join('');
}

export let _newUserRoleSelectedTabs = new Set();

export function toggleUserRoleTabAccess(tabKey) {
if (_newUserRoleSelectedTabs.has(tabKey)) {
_newUserRoleSelectedTabs.delete(tabKey);
} else {
_newUserRoleSelectedTabs.add(tabKey);
}
['factory','prod','payments','sales'].forEach(t => {
const btn = document.getElementById('userrole-tab-' + t);
if (btn) btn.classList.toggle('active', _newUserRoleSelectedTabs.has(t));
});
const hint = document.getElementById('userrole-access-hint');
if (hint) {
hint.textContent = _newUserRoleSelectedTabs.size === 0
? 'Select one or more tabs to assign'
: 'Access: ' + [..._newUserRoleSelectedTabs].map(t => _cap(t)).join(', ');
}
}

export function renderUserRoleList() {
const list = document.getElementById('manage-userrole-list');
if (!list) return;
if (userRolesList.length === 0) {
list.innerHTML = '<div class="u-cca393b">No users added yet.</div>';
return;
}
const TAB_COLORS = { factory: 'var(--accent-purple)', prod: 'var(--accent-emerald)', payments: 'var(--accent-cyan)', sales: 'var(--accent-gold)' };
list.innerHTML = userRolesList.map((user, i) => {
const tabs = Array.isArray(user.tabs) ? user.tabs : [];
const tabBadges = tabs.map(t => `<span class="st-font-size__a9e436 st-padding__8f0293 st-border-radius__c8d49a dc-color dc-border st-font-weight__e3ec02 u-3d59ac9" style="--d-color: ${TAB_COLORS[t]||'var(--accent)'}; --d-border: 1px solid ${TAB_COLORS[t]||'var(--accent)'}55">${t}</span>`).join('');
return `
<div class="u-b3a0b25 d-flex st-background__f38efd st-border-bottom__e54b2f">
<div class="u-8b4ab7f">
<div class="u-5e4bab7 d-flex">
<span class="u-555bcbe">${esc(user.name)}</span>
</div>
<div class="u-91a590f d-flex">${tabBadges || '<span class="st-font-size__c3e9d8 st-color__ce14cb">No tabs assigned</span>'}</div>
</div>
<button class="btn btn-theme u-eeccbea st-border-bottom__b34a17" onclick="removeUserRole(${i})" title="Remove ${esc(user.name)}"></button>
</div>`;
}).join('');
}

export function switchManageTeamTab(tab) {
['rep', 'userrole', 'accounts'].forEach(t => {
const btn = document.getElementById('team-tab-' + t);
const panel = document.getElementById('team-panel-' + t);
if (btn) btn.classList.toggle('active', t === tab);
if (panel) window.setDisplay(panel, t === tab ? '' : 'none');
});
if (tab === 'userrole') renderUserRoleList();
if (tab === 'rep') renderManageRepsList();
if (tab === 'accounts' && typeof loadAccountsList === 'function') loadAccountsList();
}

export function addNewUserRole(...a) { return confirmGuard('addNewUserRole', () => _addNewUserRoleRaw(...a), { label: 'User', late: true, fields: [['new-userrole-name-input', 'Name']], verb: 'Add' }); }

async function _addNewUserRoleRaw() {
const input = document.getElementById('new-userrole-name-input');
if (!input) return;
const name = input.value.trim().toUpperCase();
if (!name) { window.notifyBlocking('Please enter a name', 'warning', 'Warning'); return; }
if (_newUserRoleSelectedTabs.size === 0) { window.notifyBlocking('Please select at least one tab', 'warning', 'Warning'); return; }
if (userRolesList.some(u => u.name === name)) { window.notifyBlocking('User already exists', 'warning', 'Warning'); return; }
if (!(await window.gcCommit({}))) return;
userRolesList.push({ name, tabs: [..._newUserRoleSelectedTabs] });
await saveUserRolesList();
input.value = '';
_newUserRoleSelectedTabs.clear();
['factory','prod','payments','sales'].forEach(t => {
const btn = document.getElementById('userrole-tab-' + t);
if (btn) btn.classList.remove('active');
});
const hint = document.getElementById('userrole-access-hint');
if (hint) hint.textContent = 'Select one or more tabs to assign';
renderUserRoleList();
showToast(`${name} added as User`, 'success');
}

export async function removeUserRole(index) {
const user = userRolesList[index];
if (!user) return;
const _rMsg = `Remove ${user.name} from the team?\n\nThey will lose access to their assigned sections. This does not delete any recorded data.`;
const confirmed = await showGlassConfirm(_rMsg, { title: 'Remove User', confirmText: 'Remove', cancelText: 'Cancel', danger: true });
if (!confirmed) return;
userRolesList.splice(index, 1);
await saveUserRolesList();
renderUserRoleList();
}

export function addNewSalesRep(...a) { return confirmGuard('addNewSalesRep', () => _addNewSalesRepRaw(...a), { label: 'Representative', late: true, fields: [['new-rep-name-input', 'Name']], verb: 'Add' }); }

async function _addNewSalesRepRaw() {
const input = document.getElementById('new-rep-name-input');
if (!input) return;
const name = input.value.trim().toUpperCase();
if (!name) { window.notifyBlocking('Please enter a name', 'warning', 'Warning'); return; }
if (salesRepsList.includes(name)) { window.notifyBlocking('Rep already exists', 'warning', 'Warning'); return; }
if (!(await window.gcCommit({}))) return;
salesRepsList.push(name);
await saveSalesRepsList();
input.value = '';
showToast(`${name} added`, 'success');
}

export async function removeSalesRep(index) {
const rep = ensureArray(await sqliteStore.get('rep'));
if (salesRepsList.length <= 1) { window.notifyBlocking('Must have at least one representative', 'warning', 'Warning'); return; }
const name = salesRepsList[index];
{
const _pend = await getPendingAllocationCount(name);
if (_pend > 0) { window.notifyBlocking(`${name} still has ${_pend} unsettled allocation${_pend !== 1 ? 's' : ''}. Settle them in the calculator first.`, 'warning', 'Warning'); return; }
}
const _rsrSales = (typeof rep !== 'undefined' ? rep : []).filter(s => s.salesRep === name).length;
let _rsrMsg = `Remove ${name} from the sales team?`;
_rsrMsg += `\n\nThey will no longer appear as an available rep in the app.`;
if (_rsrSales > 0) _rsrMsg += `\n\n ${name} has ${_rsrSales} recorded sale${_rsrSales !== 1 ? 's' : ''} in the system. Those records will be kept, but you will no longer be able to add new sales under this name.`;
if (typeof currentRepProfile !== 'undefined' && currentRepProfile === name) _rsrMsg += `\n\n This rep is currently active on this device. The device will switch to the next available rep.`;
_rsrMsg += `\n\nThis does not delete any of their existing sales data.`;
const confirmed = await showGlassConfirm(_rsrMsg, {
title: `Remove ${name}`,
confirmText: 'Remove',
cancelText: 'Cancel',
danger: true
});
if (!confirmed) return;
salesRepsList.splice(index, 1);
if (currentRepProfile === name) {
_set_currentRepProfile(salesRepsList[0]);
await sqliteStore.set('repProfile', currentRepProfile);
}
await saveSalesRepsList();
}

export function openManageRepsModal() {
renderManageRepsList();
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('team-access-screen');
}

export function closeManageRepsModal() {
if (typeof closeStandaloneScreen === 'function') {
closeStandaloneScreen('team-access-screen');
}
}

export const _overlayStack = (() => {
  const _registry = {
    'formula-store-screen':        { closeFn: () => closeStandaloneScreen('formula-store-screen'), contentSel: '.screen-body' },
    'formula-store-edit-screen':   { closeFn: () => closeStandaloneScreen('formula-store-edit-screen'), contentSel: '.screen-body' },
    'raw-material-screen':         { closeFn: () => closeStandaloneScreen('raw-material-screen'),     contentSel: '.screen-body' },
    'add-entity-screen':           { closeFn: () => closeStandaloneScreen('add-entity-screen'),       contentSel: '.screen-body' },
    'team-access-screen':          { closeFn: () => closeStandaloneScreen('team-access-screen'),      contentSel: '.screen-body' },
    'sync-data-screen':            { closeFn: () => closeStandaloneScreen('sync-data-screen'),        contentSel: '.screen-body' },
    'backup-restore-screen':       { closeFn: () => closeStandaloneScreen('backup-restore-screen'),   contentSel: '.screen-body' },
    'recycle-bin-screen':          { closeFn: () => closeStandaloneScreen('recycle-bin-screen'),      contentSel: '.screen-body' },
    'theme-screen':                { closeFn: () => closeStandaloneScreen('theme-screen'),            contentSel: '.screen-body' },
    'db-structure-screen':         { closeFn: () => closeStandaloneScreen('db-structure-screen'),     contentSel: '.screen-body' },
    'logout-screen':               { closeFn: () => closeStandaloneScreen('logout-screen'),           contentSel: '.screen-body' },
    'device-display-screen':       { closeFn: () => closeStandaloneScreen('device-display-screen'),   contentSel: '.screen-body' },
    'settings-screen':             { closeFn: () => closeStandaloneScreen('settings-screen'),         contentSel: '.screen-body' },
    'feedback-screen':             { closeFn: () => closeStandaloneScreen('feedback-screen'),         contentSel: '.screen-body' },
    'close-financial-year-screen': { closeFn: () => closeStandaloneScreen('close-financial-year-screen'), contentSel: '.screen-body' },
    'entity-details-screen':       { closeFn: () => closeStandaloneScreen('entity-details-screen'),          contentSel: '.screen-body' },
    'expense-details-screen':      { closeFn: () => closeStandaloneScreen('expense-details-screen'),         contentSel: '.screen-body' },
    'customer-management-screen':  { closeFn: () => closeStandaloneScreen('customer-management-screen'),     contentSel: '.screen-body' },
    'customer-edit-screen':        { closeFn: () => closeStandaloneScreen('customer-edit-screen'),           contentSel: '.screen-body' },
    'rep-customer-management-screen': { closeFn: () => closeStandaloneScreen('rep-customer-management-screen'), contentSel: '.screen-body' },
    'rep-customer-edit-screen':    { closeFn: () => closeStandaloneScreen('rep-customer-edit-screen'),       contentSel: '.screen-body' },
    'entityTransactionsOverlay':   { closeFn: () => closeEntityTransactions(),        contentSel: '.factory-overlay-card' },
  };
  function _openLayers() {
    const open = [];
    for (const [id, cfg] of Object.entries(_registry)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const isOpen = el.classList.contains('open') ||
                     (window.getDisplay(el) && window.getDisplay(el) !== 'none' && window.getDisplay(el) !== '');
      if (isOpen) open.push({ id, el, ...cfg });
    }
    open.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return open;
  }
  function closeTop() {
    const layers = _openLayers();
    if (layers.length === 0) return false;
    const top = layers[layers.length - 1];
    top.closeFn();
    return true;
  }
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.dlg-overlay')) return;
    if (closeTop()) e.preventDefault();
  });
  return { closeTop, openLayers: _openLayers };
})();

window.loadSalesRepsList = loadSalesRepsList;
window.saveSalesRepsList = saveSalesRepsList;
window.renderAllRepUI = renderAllRepUI;
window.addNewSalesRep = addNewSalesRep;
window.removeSalesRep = removeSalesRep;
window.openManageRepsModal = openManageRepsModal;
window.closeManageRepsModal = closeManageRepsModal;
window.switchManageTeamTab = switchManageTeamTab;

export async function loadUserRolesContent() {
if (firebaseDB && currentUser) {
try {
const teamDoc = await firebaseDB.collection('users').doc(dataUid(currentUser))
.collection('settings').doc('team').get();
if (teamDoc.exists) {
const data = teamDoc.data();
if (Array.isArray(data.roles) && data.roles.length > 0) {
_set_userRolesList(data.roles);
await sqliteStore.set('roles', userRolesList).catch(() => {});
}
}
} catch (e) {
console.warn('loadUserRolesContent: cloud fetch failed, showing cached list', _safeErr(e));
}
}
renderUserRoleList();
}

window.addNewUserRole = addNewUserRole;
window.removeUserRole = removeUserRole;
window.toggleUserRoleTabAccess = toggleUserRoleTabAccess;
window.renderUserRoleList = renderUserRoleList;
window.loadUserRolesContent = loadUserRolesContent;
window.saveUserRolesList = saveUserRolesList;
window.lockToUserRoleMode = lockToUserRoleMode;

export function phoneActionHTML(phone, opts = {}) {
const raw = (phone || '').toString().trim();
const empty = !raw || raw === '-' || raw === 'N/A' || raw === 'No Phone' || raw === 'No contact';
if (empty) return raw || (opts.dash ? '-' : '');
const digitCount = (raw.match(/\d/g) || []).length;
const looksLikePhone = digitCount >= 7 && /^[\d\s\-+(). ]+$/.test(raw);
if (!looksLikePhone) return esc(raw);
const clean = raw.replace(/[\s\-().]/g, '');
const wa = toInternationalDigits(raw);
return `<a href="tel:${clean}" title="Tap to call · Hold for WhatsApp" class="u-0d9dbdd phone-link"${wa ? ` data-wa="${wa}"` : ''}>${esc(raw)}</a>`;
}

window.phoneActionHTML = phoneActionHTML;

window.initDatabase = async function(silent = false) {
const result = await initializeCompleteFirestoreDatabase(silent);
return result;
};

window.checkDatabase = async function() {
const isComplete = await isCompleteDatabaseInitialized();
return isComplete;
};

window.safeInitDatabase = async function(silent = false) {
const result = await safeInitializeCompleteDatabase(silent);
return result;
};

(function() {
  let _adminLoaded = false;
  let _adminLoading = null;
  function _loadAdminModule() {
    if (_adminLoaded) return Promise.resolve();
    if (_adminLoading) return _adminLoading;
    _adminLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'admin-data.js';
      script.onload = () => { _adminLoaded = true; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return _adminLoading;
  }
  window.showDeltaSyncDetails = async function() {
    await _loadAdminModule();
    if (typeof window._showDeltaSyncDetails === 'function') {
      return window._showDeltaSyncDetails();
    }
  };
  window.showCloseFinancialYearDialog = async function() {
    await _loadAdminModule();
    if (typeof window._showCloseFinancialYearDialog === 'function') {
      return window._showCloseFinancialYearDialog();
    }
  };
})();

export async function loadDeviceList() {
const container = document.getElementById('device-list-container');
if (!container) return;
if (!firebaseDB || !currentUser) {
container.innerHTML = `
<div class="empty" >
Please log in to view devices
</div>
`;
return;
}
try {
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
const devicesSnap = await userRef.collection('devices').get();
if (devicesSnap.empty) {
container.innerHTML = `
<div class="empty" >
No devices registered yet
</div>
`;
return;
}
const currentDeviceId = await getDeviceId();
const now = Date.now();
let accountEmail = currentUser.email || 'Unknown';
try {
const accountInfoSnap = await userRef.collection('account').doc('info').get();
if (accountInfoSnap.exists) {
const accountData = accountInfoSnap.data();
accountEmail = accountData.email || accountEmail;
}
} catch (e) {
console.error('An unexpected error occurred.', _safeErr(e));
showToast('An unexpected error occurred.', 'error');
}
const seenIds = new Set();
const uniqueDocs = devicesSnap.docs.filter(doc => {
const data = doc.data();
const id = data.deviceId;
if (!id || id === 'device' || doc.id === 'device') return false;
if (id === currentDeviceId || doc.id === currentDeviceId) return false;
if (seenIds.has(id) || seenIds.has(doc.id)) return false;
seenIds.add(id);
seenIds.add(doc.id);
return true;
});
if (uniqueDocs.length === 0) {
container.innerHTML = `
<div class="empty" >
No other devices registered
</div>
`;
return;
}
let html = `
<div class="u-60c2221 st-background__e7d797 st-border-bottom__f9139a">
<div class="u-975bc61">
Account: ${accountEmail}
</div>
<div class="u-field-hint-xxs" >
Total Devices: ${uniqueDocs.length} • Online: ${uniqueDocs.filter(d => {
const ls = d.data().lastSeen?.toMillis() || 0;
return (now - ls) < 60000;
}).length}
</div>
</div>
`;
uniqueDocs.forEach(doc => {
const device = doc.data();
const lastSeen = device.lastSeen?.toMillis() || 0;
const isOnline = (now - lastSeen) < 60000;
const totalCommands = device.totalCommands || 0;
const remoteAppliedMode = device.remoteAppliedMode || null;
const remoteAppliedAt = device.remoteAppliedAt || null;
const remoteAppliedBy = device.remoteAppliedBy || null;
const deviceMode = device.currentMode || 'admin';
const assignedRep = device.assignedRep || null;
const assignedManager = device.assignedManager || null;
const assignedUserTabs = Array.isArray(device.assignedUserTabs) ? device.assignedUserTabs : [];
const modeLabel = deviceMode === 'admin'
? 'ADMIN'
: deviceMode === 'userrole'
? (assignedManager || 'USER ROLE')
: deviceMode === 'production'
? (assignedManager || 'PRODUCTION')
: deviceMode === 'factory'
? (assignedManager || 'FACTORY')
: (assignedRep || 'REP');
const modeColor = deviceMode === 'admin' ? 'var(--accent-blue)'
: deviceMode === 'userrole' ? 'var(--warning)'
: deviceMode === 'production' ? 'var(--accent-mint)'
: deviceMode === 'factory' ? 'var(--accent-purple)'
: 'var(--accent-orange)';
const modeIcon = '';
const onlineColor = isOnline ? 'var(--success)' : 'var(--danger)';
const onlineDot = isOnline ? ' Online' : ' Offline';
let deviceShard = 'N/A';
if (device.deviceShard) {
  deviceShard = String(device.deviceShard).toUpperCase();
} else if (device.deviceId && typeof deriveDeviceShard === 'function') {
try {
deviceShard = deriveDeviceShard(device.deviceId).toUpperCase();
} catch (_) { deviceShard = 'N/A'; }
}
let firstLoginStr = '';
if (device.firstLoginAt) {
  try {
    const ms = typeof device.firstLoginAt === 'number'
      ? device.firstLoginAt
      : (device.firstLoginAt.toMillis ? device.firstLoginAt.toMillis() : Number(device.firstLoginAt));
    firstLoginStr = formatDateTime(ms);
  } catch (_) {}
} else if (device.deviceId && typeof _extractDeviceFirstLoginTime === 'function') {
  try {
    const flt = _extractDeviceFirstLoginTime(device.deviceId);
    if (flt) firstLoginStr = formatDateTime(flt);
  } catch (_) {}
}
let cardHtml = '<div class="u-296d231 st-background__f38efd st-border-bottom__e54b2f">';
cardHtml += '<div class="u-d42a404 d-flex">';
cardHtml += '<div class="u-3eddfae" title="Device shard: ' + deviceShard + (firstLoginStr ? ' | First login: ' + firstLoginStr : '') + '">Shard: <span class="u-fe495ba">' + deviceShard + '</span>' + (firstLoginStr ? ' &nbsp;<span class="u-56e4c0c">first login: ' + firstLoginStr + '</span>' : '') + '</div>';
cardHtml += '<div class="u-b62856e text-right">';
cardHtml += '<div class="st-font-size__c95659 st-font-weight__2b9532 u-1cd2eeb dc-color" style="--d-color:' + modeColor + '">' + modeLabel + '</div>';
cardHtml += '<div class="st-font-size__2f7bba st-margin-top__7a21c6 dc-color" style="--d-color:' + onlineColor + '">' + onlineDot + '</div>';
cardHtml += '</div>';
cardHtml += '</div>';
const lastSeenStr = lastSeen ? formatDateTime(lastSeen) : 'Never';
cardHtml += '<div class="u-af437a1">Last seen: ' + lastSeenStr + '</div>';
const lastCmdStr = remoteAppliedAt ? formatDateTime(remoteAppliedAt) : null;
const lastCmdMode = remoteAppliedMode ? remoteAppliedMode.toUpperCase() : null;
const lastCmdBy = remoteAppliedBy || null;
if (lastCmdMode || totalCommands > 0) {
cardHtml += '<div class="u-61da305 d-flex st-background__6fedaa st-border-bottom__e54b2f">';
cardHtml += '<span class="u-2ae1270">Commands:</span>';
if (totalCommands > 0) {
cardHtml += '<span class="u-f07758c st-background__776447">' + totalCommands + ' sent</span>';
}
if (lastCmdMode) {
cardHtml += '<span class="u-040bdbd">→ ' + lastCmdMode + '</span>';
}
if (lastCmdBy) {
cardHtml += '<span class="u-a2cad5b">by ' + esc(lastCmdBy) + '</span>';
}
if (lastCmdStr) {
cardHtml += '<span class="u-bae6c2c">' + lastCmdStr + '</span>';
}
cardHtml += '</div>';
} else {
cardHtml += '<div class="u-3a66e13 st-background__64ff56 st-border-bottom__e54b2f">No commands sent yet</div>';
}
const isAdmin = deviceMode === 'admin';
const adminBg = themeVar('--accent-blue', isAdmin ? 18 : 8);
const adminBord = (isAdmin ? '2px solid ' : '1px solid ') + themeVar('--accent-blue', isAdmin ? 55 : 25);
const adminFw = isAdmin ? '800' : '600';
const adminTick = isAdmin ? ' ' : '';
cardHtml += '<button onclick="remoteControlDevice(\'' + device.deviceId + '\', \'admin\')"';
cardHtml += ' class="st-padding__9e953a st-border-radius__5f7dc3 st-color__88b379 st-cursor__3b6a3a st-font-size__569d78 u-6e48b0b dc-background dc-border dc-font-weight" style="--d-background:' + adminBg + ';--d-border:' + adminBord + ';--d-font-weight:' + adminFw + '">' + adminTick + 'Admin Mode</button>';
if (salesRepsList.length > 0) {
cardHtml += '<div class="u-788ba48">Sales Representatives</div>';
cardHtml += '<div class="u-ab90486 d-grid">';
const repColors = [
'--success', '--accent-orange', '--accent-purple', '--danger', '--accent-sky'
];
for (let ri = 0; ri < salesRepsList.length; ri++) {
const rep = salesRepsList[ri];
const c = repColors[ri % repColors.length];
const repLocked = deviceMode === 'rep' && assignedRep === rep;
const repBg = themeVar(c, repLocked ? 22 : 8);
const repBord = (repLocked ? '2' : '1') + 'px solid ' + themeVar(c, repLocked ? 65 : 28);
const repFw = repLocked ? '800' : '600';
const repTick = repLocked ? ' ' : '';
cardHtml += '<button onclick="remoteControlDevice(\'' + device.deviceId + '\', \'rep\', \'' + rep + '\')"';
cardHtml += ' class="has-overflow st-padding__9c6be7 st-border-radius__5f7dc3 st-cursor__3b6a3a st-font-size__ce2d05 u-268adcd dc-background dc-border dc-color dc-font-weight" style="--d-background:' + repBg + ';--d-border:' + repBord + ';--d-color:' + themeVar(c) + ';--d-font-weight:' + repFw + '">';
cardHtml += repTick + rep + '</button>';
}
cardHtml += '</div>';
}
if (userRolesList.length > 0) {
cardHtml += '<div class="u-788ba48">User Roles</div>';
cardHtml += '<div class="u-ab90486 d-grid">';
for (let ui = 0; ui < userRolesList.length; ui++) {
const user = userRolesList[ui];
const userLocked = deviceMode === 'userrole' && device.assignedManager === user.name;
const userBg = themeVar('--warning', userLocked ? 22 : 8);
const userBord = (userLocked ? '2' : '1') + 'px solid ' + themeVar('--warning', userLocked ? 65 : 28);
const userFw = userLocked ? '800' : '600';
const userTick = userLocked ? ' ' : '';
const lookupKey = '_devTabsCache';
if (!window[lookupKey]) window[lookupKey] = {};
window[lookupKey][device.deviceId + '_' + ui] = user.tabs || [];
cardHtml += '<button onclick="remoteControlDevice(\'' + device.deviceId + '\', \'userrole\', \'' + user.name + '\', (window._devTabsCache||{})[\'' + device.deviceId + '_' + ui + '\'])"';
cardHtml += ' class="has-overflow st-padding__9c6be7 st-border-radius__5f7dc3 st-color__0d0827 st-cursor__3b6a3a st-font-size__ce2d05 u-268adcd dc-background dc-border dc-font-weight" style="--d-background:' + userBg + ';--d-border:' + userBord + ';--d-font-weight:' + userFw + '">';
cardHtml += userTick + user.name + '</button>';
}
cardHtml += '</div>';
}
cardHtml += '<button onclick="removeDevice(\'' + device.deviceId + '\')"';
cardHtml += ' class="btn btn-danger btn-sm">Remove Device</button>';
cardHtml += '</div>';
html += cardHtml;
});
container.innerHTML = html;
} catch (error) {
console.error('An unexpected error occurred.', _safeErr(error));
showToast('An unexpected error occurred.', 'error');
container.innerHTML = `
<div class="u-72c3d7b">
Error loading devices: ${esc(error.message)}
</div>
`;
}
}

export async function refreshDeviceList() {
const container = document.getElementById('device-list-container');
if (container) {
container.innerHTML = `
<div class="empty" >
Refreshing...
</div>
`;
}
await loadDeviceList();
showToast(' Device list refreshed', 'success', 2000);
}

export async function remoteControlDevice(deviceId, targetMode, repName = null, userTabs = null) {
if (!firebaseDB || !currentUser) {
window.notifyBlocking('Not logged in', 'error', 'Something went wrong');
return;
}
let _rcTitle, _rcMsg, _rcConfirm;
if (targetMode === 'admin') {
_rcTitle = 'Unlock to Admin Mode';
_rcMsg = 'Unlock this device to full Admin mode?\n\nAll tabs and admin features will become accessible.';
_rcConfirm = 'Unlock to Admin';
} else if (targetMode === 'rep' && repName) {
_rcTitle = 'Lock Device — Sales Rep';
_rcMsg = `Lock this device to Sales Rep mode for ${repName}?\n\nThe device will only show the Rep Sales tab. All admin features, tabs and controls will be hidden until unlocked remotely.`;
_rcConfirm = `Lock to ${repName}`;
} else if (targetMode === 'userrole' && repName) {
const tabLabels = { prod: 'Production', factory: 'Factory', sales: 'Sales', payments: 'Payments' };
const tabList = Array.isArray(userTabs) ? userTabs.map(t => tabLabels[t] || t).join(', ') : 'assigned tabs';
_rcTitle = 'Lock Device — User Role';
_rcMsg = `Lock this device to User Role for ${repName}?\n\nAssigned tabs: ${tabList}\n\nOnly the assigned sections will be visible. All other tabs, analytics and admin controls will be hidden.`;
_rcConfirm = `Lock to ${repName}`;
} else {
_rcTitle = 'Switch Device Mode';
_rcMsg = `Switch this device to ${targetMode.toUpperCase()} mode?`;
_rcConfirm = 'Confirm';
}
const confirmed = await showGlassConfirm(_rcMsg, {
title: _rcTitle,
confirmText: _rcConfirm,
cancelText: 'Cancel',
danger: targetMode !== 'admin'
});
if (!confirmed) return;
try {
if (window._firestoreNetworkDisabled) {
try { await firebaseDB.enableNetwork(); window._firestoreNetworkDisabled = false; } catch (_en) {}
}
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
const commandTimestamp = Date.now();
const deviceRef = userRef.collection('devices').doc(deviceId);
const updateData = {
targetMode: targetMode,
targetModeTimestamp: commandTimestamp,
commandSource: 'remote_admin',
lastControlled: commandTimestamp,
controlledBy: currentUser.email || 'Admin',
currentMode: targetMode,
assignedRep: targetMode === 'rep' ? (repName || null) : null,
assignedManager: targetMode === 'userrole' ? (repName || null) : null,
assignedUserTabs: targetMode === 'userrole' ? (userTabs || []) : null,
assignedRoleType: targetMode,
assignedRoleName: repName || null,
lockedAt: repName ? commandTimestamp : null,
lockedBy: repName ? (currentUser.email || 'Admin') : null,
};
await deviceRef.set(updateData, { merge: true });
const successMsg = targetMode === 'admin'
? ' Device unlocked to Admin mode'
: targetMode === 'rep' ? ` Device locked to Sales Rep: ${repName}`
: targetMode === 'userrole' ? ` Device locked to User: ${repName}`
: ` Command sent: ${targetMode}`;
setTimeout(loadDeviceList, 2000);
} catch (error) {
window.notifyBlocking('Failed to control device: ' + error.message, 'error', 'Something went wrong');
}
}

export async function removeDevice(deviceId) {
if (!firebaseDB || !currentUser) {
window.notifyBlocking('Not logged in', 'error', 'Something went wrong');
return;
}
if (!deviceId || !validateUUID(String(deviceId))) {
window.notifyBlocking('Invalid device ID', 'error', 'Something went wrong');
return;
}
const _rdMsg = `Remove this device from the trusted list?\n\nThe device will be logged out immediately and will no longer be able to sync data or receive remote commands. It will need to be re-approved if the user tries to reconnect.\n\nThis does not delete any data already on the device.`;
if (!(await showGlassConfirm(_rdMsg, { title: 'Remove Trusted Device', confirmText: 'Remove', danger: true }))) {
return;
}
try {
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
const deviceRef = userRef.collection('devices').doc(deviceId);
await deviceRef.set({
targetMode: 'force_logout',
targetModeTimestamp: Date.now(),
commandSource: 'remote_admin',
forceLogout: true,
forceLogoutAt: Date.now()
}, { merge: true });
await new Promise(resolve => setTimeout(resolve, 600));
await deviceRef.delete();
await loadDeviceList();
} catch (error) {
window.notifyBlocking('Failed to remove device: ' + error.message, 'error', 'Something went wrong');
}
}

window.loadDeviceList = loadDeviceList;
window.refreshDeviceList = refreshDeviceList;
window.remoteControlDevice = remoteControlDevice;
window.removeDevice = removeDevice;
window.getDeviceId = getDeviceId;
window.getDeviceName = getDeviceName;
window.registerDevice = registerDevice;

export function _applyModeFromData(modeStr, ts, assignedRep, assignedManager, assignedUserTabs, remoteApplied) {
  const previousMode = appMode;
  _set_appMode(modeStr);
  const modeBatch = [['appMode', appMode], ['appMode_timestamp', ts]];
  if (modeStr === 'rep' && assignedRep) {
    _set_currentRepProfile(assignedRep);
    modeBatch.push(['repProfile', currentRepProfile], ['repProfile_timestamp', ts]);
  } else if (modeStr === 'userrole' && assignedManager) {
    window._assignedManagerName = assignedManager;
    window._assignedUserTabs = Array.isArray(assignedUserTabs) ? assignedUserTabs : [];
    modeBatch.push(['assignedManager', assignedManager], ['assignedUserTabs', window._assignedUserTabs]);
  } else if ((modeStr === 'production' || modeStr === 'factory') && assignedManager) {
    window._assignedManagerName = assignedManager;
    modeBatch.push(['assignedManager', assignedManager]);
  }
  sqliteStore.setBatch(modeBatch).catch(() => {});
  const modeLabel = modeStr === 'rep' ? 'Rep Mode'
    : modeStr === 'userrole'    ? 'User Role Mode'
    : modeStr === 'production'  ? 'Production Mode'
    : modeStr === 'factory'     ? 'Factory Mode'
    : 'Admin Mode';
  showToast(remoteApplied
    ? `Restoring remotely assigned ${modeLabel}...`
    : `Switching to ${modeLabel}...`, 'info', 2000);
  setTimeout(() => { window.location.reload(); }, 1500);
}

window._applyModeFromData = _applyModeFromData;

export async function restoreDeviceModeOnLogin(uid) {
try {
  const localTimestamp = Number(await sqliteStore.get('appMode_timestamp')) || 0;
  if (firebaseDB && !window._firestoreNetworkDisabled && navigator.onLine) {
    try {
      const deviceId = await getDeviceId();
      const deviceRef = firebaseDB.collection('users').doc(uid)
                                  .collection('devices').doc(deviceId);
      const deviceDoc = await deviceRef.get();
      if (deviceDoc.exists) {
        const data = deviceDoc.data();
        if (data && (data.forceLogout === true || data.targetMode === 'force_logout')) {
          if (typeof signOut === 'function') {
            showToast('This device has been removed by admin. Logging out…', 'warning', 4000);
            window._forceLogoutSignOut = true;
            setTimeout(() => signOut().catch(() => {}), 1200);
          }
          return;
        }
        const cloudMode      = data.currentMode || 'admin';
        const cloudTimestamp = data.appMode_timestamp || 0;
        const _modeIsLocked  = cloudMode !== 'admin';
        const _localIsAdmin  = appMode === 'admin';
        const shouldRestore  = (cloudMode && cloudTimestamp > localTimestamp && cloudMode !== appMode)
                            || (_modeIsLocked && _localIsAdmin);
        if (shouldRestore) {
          _applyModeFromData(
            cloudMode, cloudTimestamp,
            data.assignedRep, data.assignedManager,
            data.assignedUserTabs, !!data.remoteAppliedMode
          );
        }
        return;
      }
    } catch (_fsErr) {
      console.warn('[restoreDeviceMode] Firestore read failed, trying SQLite fallback:', _safeErr(_fsErr));
    }
  }
  const sqliteMode = await sqliteStore.get('appMode') || 'admin';
  const _modeIsLockedSqlite = sqliteMode !== 'admin';
  const _localIsAdminSqlite = appMode === 'admin';
  if (_modeIsLockedSqlite && _localIsAdminSqlite) {
    const assignedRep     = await sqliteStore.get('repProfile').catch(() => null);
    const assignedManager = await sqliteStore.get('assignedManager').catch(() => null);
    const assignedTabs    = await sqliteStore.get('assignedUserTabs').catch(() => []);
    _applyModeFromData(
      sqliteMode, localTimestamp || Date.now(),
      assignedRep, assignedManager, assignedTabs, false
    );
  }
} catch (error) {
  console.warn('[restoreDeviceMode] could not restore device mode:', _safeErr(error));
}
}

window.restoreDeviceModeOnLogin = restoreDeviceModeOnLogin;

export async function listenForDeviceCommands() {
if (!firebaseDB || !currentUser) return;
if (typeof window.deviceCommandsUnsubscribe === 'function') {
try { window.deviceCommandsUnsubscribe(); } catch (_) {}
window.deviceCommandsUnsubscribe = null;
}
if (!window._deviceCmdRetryAttempts) window._deviceCmdRetryAttempts = 0;
if (!window._deviceCmdRetrying) window._deviceCmdRetrying = false;
try {
const deviceId = await getDeviceId();
const userRef = firebaseDB.collection('users').doc(dataUid(currentUser));
const deviceRef = userRef.collection('devices').doc(deviceId);
const unsubscribe = deviceRef.onSnapshot({ includeMetadataChanges: false }, (doc) => {
try {
if (doc.metadata.fromCache || doc.metadata.hasPendingWrites) return;
if (!doc.exists) {
return;
}
const data = doc.data();
if (!data || !data.targetMode || !data.targetModeTimestamp) return;
if (data.forceLogout === true || data.targetMode === 'force_logout') {
if (typeof signOut === 'function') {
showToast('Logged out remotely by admin.', 'warning', 4000);
window._forceLogoutSignOut = true;
setTimeout(() => signOut().catch(() => {}), 1200);
}
return;
}
const targetMode = data.targetMode;
let resolvedName = null;
const roleType = data.assignedRoleType || targetMode;
if (roleType === 'rep') {
resolvedName = data.assignedRoleName || data.assignedRep || null;
} else if (roleType === 'userrole' || roleType === 'production' || roleType === 'factory') {
resolvedName = data.assignedRoleName || data.assignedManager || null;
}
const effectiveMode = data.assignedRoleType || targetMode;
const resolvedUserTabs = Array.isArray(data.assignedUserTabs) ? data.assignedUserTabs : [];
const commandTimestamp = data.targetModeTimestamp && data.targetModeTimestamp.toMillis
? data.targetModeTimestamp.toMillis()
: (typeof data.targetModeTimestamp === 'number' ? data.targetModeTimestamp : 0);
if (!commandTimestamp) return;
const lastProcessed = window.lastProcessedCommandTimestamp || 0;
if (commandTimestamp > lastProcessed) {
applyRemoteModeChange(effectiveMode, data.commandSource || 'remote', resolvedName, resolvedUserTabs);
window.lastProcessedCommandTimestamp = commandTimestamp;
window._deviceCmdRetryAttempts = 0;
}
} catch (snapErr) {
console.warn('[device] command snapshot handler error:', _safeErr(snapErr));
}
}, (error) => {
const _code = error && error.code;
console.warn('[device] command listener error:', _code, _safeErr(error));
window.deviceCommandsUnsubscribe = null;
if (_code === 'permission-denied' || _code === 'failed-precondition') {
console.warn('[device] stopping device listener — unrecoverable error:', _code);
window._deviceCmdRetryAttempts = 0;
window._deviceCmdRetrying = false;
return;
}
if (window._deviceCmdRetrying) return;
window._deviceCmdRetryAttempts = (window._deviceCmdRetryAttempts || 0) + 1;
const MAX_DEVICE_RETRIES = 8;
if (window._deviceCmdRetryAttempts > MAX_DEVICE_RETRIES) {
console.warn('[device] max retries reached — giving up device listener');
window._deviceCmdRetryAttempts = 0;
window._deviceCmdRetrying = false;
return;
}
const delay = Math.min(5000 * Math.pow(2, window._deviceCmdRetryAttempts - 1), 120000);
window._deviceCmdRetrying = true;
setTimeout(() => {
window._deviceCmdRetrying = false;
if (firebaseDB && currentUser) {
listenForDeviceCommands().catch(e => {
window._deviceCmdRetrying = false;
console.warn('[device] listenForDeviceCommands retry failed:', _safeErr(e));
});
}
}, delay);
});
window.deviceCommandsUnsubscribe = unsubscribe;
window._deviceCmdRetryAttempts = 0;
window._deviceCmdRetrying = false;
} catch (error) {
console.error('[device] listenForDeviceCommands failed:', _safeErr(error));
}
}

export async function applyRemoteModeChange(targetMode, source, repName = null, userTabs = null) {
const previousMode = appMode;
const previousManager = window._assignedManagerName || null;
const previousTabs = JSON.stringify(window._assignedUserTabs || []);
if (previousMode === targetMode) {
if (targetMode === 'admin') return;
if (targetMode === 'rep' && currentRepProfile === repName) return;
if (targetMode === 'userrole' && previousManager === repName && previousTabs === JSON.stringify(userTabs || [])) return;
}
_set_appMode(targetMode);
const nowMs = Date.now();
const batchData = [['appMode', appMode], ['appMode_timestamp', nowMs]];
if (targetMode === 'rep' && repName) {
_set_currentRepProfile(repName);
batchData.push(['repProfile', repName], ['repProfile_timestamp', nowMs]);
if (!salesRepsList.includes(repName)) {
salesRepsList.push(repName);
batchData.push(['reps', salesRepsList]);
if (typeof renderAllRepUI === 'function') renderAllRepUI();
}
} else if (targetMode === 'userrole') {
window._assignedManagerName = repName || null;
window._assignedUserTabs = Array.isArray(userTabs) ? userTabs : [];
batchData.push(['assignedManager', repName || null], ['assignedUserTabs', window._assignedUserTabs]);
} else if (targetMode === 'production' || targetMode === 'factory') {
window._assignedManagerName = repName || null;
batchData.push(['assignedManager', repName || null]);
} else if (targetMode === 'admin') {
window._assignedManagerName = null;
window._assignedUserTabs = [];
batchData.push(['assignedManager', null], ['assignedUserTabs', []]);
}
await sqliteStore.setBatch(batchData);
if (firebaseDB && currentUser) {
try {
if (targetMode === 'admin' && window._firestoreNetworkDisabled) {
try { await firebaseDB.enableNetwork(); window._firestoreNetworkDisabled = false; } catch (_en) {}
}
const deviceId = await getDeviceId();
const deviceRef = firebaseDB.collection('users').doc(dataUid(currentUser))
.collection('devices').doc(deviceId);
const payload = {
currentMode: targetMode, appMode_timestamp: nowMs,
remoteAppliedMode: targetMode, remoteAppliedAt: nowMs, remoteAppliedBy: source || 'remote',
assignedRoleType: targetMode, assignedRoleName: repName || null,
assignedRep: targetMode === 'rep' ? (repName || null) : null,
assignedManager: targetMode === 'userrole' ? (repName || null) : null,
assignedUserTabs: targetMode === 'userrole' ? (window._assignedUserTabs || []) : null,
};
if (targetMode === 'rep') payload.repProfile_timestamp = nowMs;
await deviceRef.set(payload, { merge: true });
} catch (e) { console.error('Firebase write failed:', _safeErr(e)); }
}
if (targetMode === 'rep') {
if (typeof lockToRepMode === 'function') lockToRepMode();
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
showToast(repName ? `Locked to Rep: ${repName}` : 'Device locked to Rep Sales mode', 'info', 4000);
} else if (targetMode === 'userrole') {
window._userRoleAllowedTabs = window._assignedUserTabs || [];
if (typeof lockToUserRoleMode === 'function') lockToUserRoleMode();
showToast(repName ? `Locked to User: ${repName}` : 'Device locked to User Role mode', 'info', 4000);
} else if (targetMode === 'production') {
if (typeof lockToProductionMode === 'function') lockToProductionMode();
showToast(repName ? `Locked to Production: ${repName}` : 'Device locked to Production mode', 'info', 4000);
} else if (targetMode === 'factory') {
if (typeof lockToFactoryMode === 'function') lockToFactoryMode();
showToast(repName ? `Locked to Factory: ${repName}` : 'Device locked to Factory mode', 'info', 4000);
} else if (targetMode === 'admin') {
if (typeof unlockAdminMode === 'function') unlockAdminMode();
if (typeof notifyDataChange === 'function') notifyDataChange('all');
showToast('Device unlocked to Admin mode', 'info', 4000);
}
}

window.listenForDeviceCommands = listenForDeviceCommands;

export function listenForTeamChanges() {
if (window._teamUnsubscribe) {
try { window._teamUnsubscribe(); } catch(e) {}
window._teamUnsubscribe = null;
}
}

window.listenForTeamChanges = listenForTeamChanges;
window.applyRemoteModeChange = applyRemoteModeChange;

export async function prepareEntityTransferScreen() {
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('payments')) {
showToast('Access Denied — Payment Transfer not in your assigned tabs', 'warning', 3000);
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('payment-transfer-screen');
return;
}
const dateInput = document.getElementById('payment-transfer-date');
if (dateInput && !dateInput.value) {
const d = new Date();
dateInput.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const fromSearch = document.getElementById('payment-transfer-from-search'); if (fromSearch) { fromSearch.value = ''; fromSearch.removeAttribute('data-entity-id'); }
const toSearch = document.getElementById('payment-transfer-to-search'); if (toSearch) { toSearch.value = ''; toSearch.removeAttribute('data-entity-id'); }
const fromHidden = document.getElementById('payment-transfer-from-value'); if (fromHidden) fromHidden.value = '';
const toHidden = document.getElementById('payment-transfer-to-value'); if (toHidden) toHidden.value = '';
const fromResults = document.getElementById('payment-transfer-from-results'); if (fromResults) fromResults.classList.add('hidden');
const toResults = document.getElementById('payment-transfer-to-results'); if (toResults) toResults.classList.add('hidden');
const amtInput = document.getElementById('payment-transfer-amount'); if (amtInput) amtInput.value = '';
const noteInput = document.getElementById('payment-transfer-note'); if (noteInput) noteInput.value = '';
if (typeof _applyPaymentTransferPendingPhoto === 'function') _applyPaymentTransferPendingPhoto(null);
await renderPaymentTransferHistory();
}

window.prepareEntityTransferScreen = prepareEntityTransferScreen;
export function saveEntityTransfer(...a) { return confirmGuard('saveEntityTransfer', () => runExclusive('saveEntityTransfer', () => _saveEntityTransferImpl(...a)), { label: 'Transfer', late: true, fields: [['payment-transfer-from-search', 'From'], ['payment-transfer-to-search', 'To'], ['payment-transfer-amount', 'Amount'], ['payment-transfer-date', 'Date'], ['payment-transfer-note', 'Note']], skipKinds: ['paytransfer'] }); }

async function _saveEntityTransferImpl() {
const _ed = getEditCtx('paytransfer');
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('payments')) {
window.notifyBlocking('Access Denied — Payment Transfer not in your assigned tabs', 'warning', 'Payment warning');
return;
}
const { entities, transactions } = await loadCollections('entities', 'transactions');
const fromId = (document.getElementById('payment-transfer-from-value') || {}).value;
const toId = (document.getElementById('payment-transfer-to-value') || {}).value;
const amount = parseFloat((document.getElementById('payment-transfer-amount') || {}).value) || 0;
const date = (document.getElementById('payment-transfer-date') || {}).value;
const note = ((document.getElementById('payment-transfer-note') || {}).value || '').trim();
if (!date) { window.notifyBlocking('Please select a date.', 'warning', 'Warning'); return; }
if (!fromId || !toId) { window.notifyBlocking('Please search and select both entities from the list.', 'warning', 'Warning'); return; }
if (String(fromId) === String(toId)) { window.notifyBlocking('From and To entities must be different.', 'warning', 'Warning'); return; }
if (amount <= 0) { window.notifyBlocking('Please enter a valid amount.', 'warning', 'Warning'); return; }
const fromEntity = entities.find(e => String(e.id) === String(fromId));
const toEntity = entities.find(e => String(e.id) === String(toId));
if (!fromEntity || !toEntity) { window.notifyBlocking('Selected entity not found.', 'error', 'Something went wrong'); return; }
if (fromEntity.isExpenseEntity === true || toEntity.isExpenseEntity === true) { window.notifyBlocking('Expense-only entities cannot be used in a transfer.', 'warning', 'Warning'); return; }
const _oOut = _ed ? _ed.original.records.find(r => r.type === 'OUT') : null;
const _oIn = _ed ? _ed.original.records.find(r => r.type === 'IN') : null;
if (_ed) {
const avail = await getAvailableCashInHand();
if (avail < 0) { window.notifyBlocking('Cash position is negative; fix that before editing transfers.', 'warning', 'Warning'); return; }
const _oo = _ed.original.records.find(r => r.type === 'OUT');
const _ok = await confirmEditChanges([
{ label: 'From', from: _oo?.entityName || '', to: fromEntity.name },
{ label: 'To', from: _oIn?.entityName || '', to: toEntity.name },
{ label: 'Amount', from: fmtAmt(_oo?.amount || 0), to: fmtAmt(amount) },
{ label: 'Date', from: _oo?.date || '', to: date }
], 'Update Transfer?');
if (!_ok) return;
}
if (!(await window.gcCommit({}))) return;
let pairId = _ed ? _ed.original.pairId : generateUUID('trfpair');
if (!validateUUID(pairId)) pairId = generateUUID('trfpair');
const createdAt = getTimestamp();
let outId = _oOut ? _oOut.id : generateUUID('pay');
if (!validateUUID(outId)) outId = generateUUID('pay');
let inId = _oIn ? _oIn.id : generateUUID('pay');
if (!validateUUID(inId)) inId = generateUUID('pay');
const createdBy = (appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null;
let outTx = {
id: outId, entityId: fromEntity.id, entityName: fromEntity.name, amount: amount, type: 'OUT', date: date,
description: note ? `Transfer to ${toEntity.name}: ${note}` : `Transfer to ${toEntity.name}`,
isPayable: false, isExpense: false, isTransfer: true, transferPairId: pairId,
transferPeerEntityId: toEntity.id, transferPeerEntityName: toEntity.name,
createdBy: createdBy
};
let inTx = {
id: inId, entityId: toEntity.id, entityName: toEntity.name, amount: amount, type: 'IN', date: date,
description: note ? `Transfer from ${fromEntity.name}: ${note}` : `Transfer from ${fromEntity.name}`,
isPayable: false, isExpense: false, isTransfer: true, transferPairId: pairId,
transferPeerEntityId: fromEntity.id, transferPeerEntityName: fromEntity.name,
createdBy: createdBy
};
if (_ed) {
if (_oOut) { stampEdit(outTx, _oOut); outTx.time = _oOut.time; }
if (_oIn) { stampEdit(inTx, _oIn); inTx.time = _oIn.time; }
}
const _trfLinkIssue = getTxLinkIssue(outTx, { entities }) || getTxLinkIssue(inTx, { entities });
if (_trfLinkIssue) { window.notifyBlocking(_trfLinkIssue, 'warning', 'Warning'); return; }
outTx = ensureRecordIntegrity(outTx, !!_ed);
inTx = ensureRecordIntegrity(inTx, !!_ed);
if (_ed) { replaceRecord(transactions, outTx); replaceRecord(transactions, inTx); } else { transactions.push(outTx, inTx); }
await unifiedSave('transactions', transactions, null, [outTx.id, inTx.id]);
if (window._paymentTransferPendingPhoto) {
try {
const _storedPh = (await sqliteStore.get('photos')) || {};
const _compressed = await _compressPhoto(window._paymentTransferPendingPhoto, 1280, 0.75);
_storedPh['expense:' + outTx.id] = _compressed;
_storedPh['expense:' + inTx.id] = _compressed;
await sqliteStore.set('photos', _storedPh);
const _phTs = (await sqliteStore.get('photostamps')) || {};
_phTs['expense:' + outTx.id] = Date.now();
_phTs['expense:' + inTx.id] = Date.now();
await sqliteStore.set('photostamps', _phTs);
const _dk = (await sqliteStore.get('photodirty')) || [];
if (!_dk.includes('expense:' + outTx.id)) _dk.push('expense:' + outTx.id);
if (!_dk.includes('expense:' + inTx.id)) _dk.push('expense:' + inTx.id);
await sqliteStore.set('photodirty', _dk);
await sqliteStore.set('photos_timestamp', Date.now());
} catch (_pe) { console.warn('Payment transfer photo save failed', _pe); }
}
notifyDataChange('payments');
emitSyncUpdate({ transactions: null });
if (_ed) endEditMode();
showToast(`${_ed ? 'Transfer updated' : 'Transferred'} ${fmtAmt(amount)}: ${fromEntity.name} → ${toEntity.name}`, 'success');
if (typeof prepareEntityTransferScreen === 'function') await prepareEntityTransferScreen();
if (typeof refreshPaymentTab === 'function') { try { await refreshPaymentTab(true); } catch (_) {} }
if (typeof calculateNetCash === 'function') { try { calculateNetCash(); } catch (_) {} }
triggerAutoSync();
}

window.saveEntityTransfer = saveEntityTransfer;

function _resetPaymentTransferForm() {
['payment-transfer-amount', 'payment-transfer-note'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

export async function startEditPaymentTransfer(pairId) {
const txs = ensureArray(await sqliteStore.get('transactions'));
const records = txs.filter(r => r && r.isTransfer === true && r.transferPairId === pairId);
const out = records.find(r => r.type === 'OUT');
const inn = records.find(r => r.type === 'IN');
if (!out || !inn || out.isMerged || inn.isMerged) { showToast('This transfer cannot be edited.', 'warning'); return; }
const scr = document.getElementById('payment-transfer-screen');
if (scr && getComputedStyle(scr).display === 'none') {
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('payment-transfer-screen');
await prepareEntityTransferScreen();
}
const set = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v; };
set('payment-transfer-from-value', out.entityId);
set('payment-transfer-from-search', out.entityName);
const fs = document.getElementById('payment-transfer-from-search'); if (fs) fs.setAttribute('data-entity-id', out.entityId);
set('payment-transfer-to-value', inn.entityId);
set('payment-transfer-to-search', inn.entityName);
const ts = document.getElementById('payment-transfer-to-search'); if (ts) ts.setAttribute('data-entity-id', inn.entityId);
set('payment-transfer-date', editDateValue(out));
set('payment-transfer-amount', out.amount);
const prefix = `Transfer to ${inn.entityName}: `;
set('payment-transfer-note', (out.description || '').startsWith(prefix) ? out.description.slice(prefix.length) : '');
beginEditMode('paytransfer', { id: out.id, pairId, records: JSON.parse(JSON.stringify(records)), createdAt: out.createdAt }, { buttonId: 'btn-save-payment-transfer', watchIds: ['payment-transfer-from-value','payment-transfer-to-value','payment-transfer-date','payment-transfer-amount','payment-transfer-note'], label: 'Update Transfer', anchorId: 'payment-transfer-amount', cancelFn: _resetPaymentTransferForm });
}

registerEditHandler('paytransfer', startEditPaymentTransfer, { keepScreens: ['payment-transfer-screen'] });

export function openPaymentTransferPhotoCapture() {
openPhotoCapture('paytransfer');
}

window.openPaymentTransferPhotoCapture = openPaymentTransferPhotoCapture;

export function handlePaymentTransferPhotoFile(event) {
const file = event.target.files && event.target.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = (e) => _applyPaymentTransferPendingPhoto(e.target.result);
reader.readAsDataURL(file);
event.target.value = '';
}

window.handlePaymentTransferPhotoFile = handlePaymentTransferPhotoFile;
window._paymentTransferPendingPhoto = null;

export function _applyPaymentTransferPendingPhoto(dataUrl) {
window._paymentTransferPendingPhoto = dataUrl || null;
const dot = document.getElementById('payment-transfer-photo-dot');
const btn = document.getElementById('payment-transfer-photo-btn');
if (dot) window.setDisplay(dot, dataUrl ? '' : 'none');
if (btn) {
window.setStyle(btn, 'border-color', dataUrl ? 'st-border-color__38fcbe' : 'st-border-color__aa2589');
btn.title = dataUrl ? 'Photo attached — click to replace' : 'Attach photo';
}
}

window._applyPaymentTransferPendingPhoto = _applyPaymentTransferPendingPhoto;

export async function renderPaymentTransferHistory() {
const list = document.getElementById('paymentTransferHistoryList');
if (!list) return;
const transactions = ensureArray(await sqliteStore.get('transactions'));
const transfers = transactions.filter(t => t.isTransfer === true && t.type === 'OUT')
.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
if (transfers.length === 0) {
list.innerHTML = hcEmptyHtml('No payment transfers recorded yet.');
return;
}
const fragment = document.createDocumentFragment();
const photoIds = [];
transfers.forEach(t => {
const safeId = String(t.id).replace(/'/g, "\\'");
const photoBadgeId = 'ph-badge-trf-' + String(t.id).replace(/[^a-z0-9]/gi, '');
const photoBtn = `<button type="button" id="${photoBadgeId}" title="View photo" class="badge badge-tint d-none" onclick="_toggleEntityTxnPanel(this,'','${safeId}','${safeId}')">Photo</button>`;
fragment.appendChild(hcCard({
tone: 'info', icon: 'transfer',
titleHtml: `${esc(t.entityName)} &rarr; ${esc(t.transferPeerEntityName)}`,
sub: esc(formatDisplayDateTime(t.date, t.time || null)),
chips: [photoBtn],
amount: fmtAmt(t.amount), tag: 'Transfer', tagTone: 'info',
metrics: [{ label: 'Description', value: t.description ? esc(t.description) : '', wide: true }],
actions: actionRowHtml('paytransfer', t.transferPairId, `<button class="btn btn-danger btn-sm u-w-full u-mt-8" onclick="(async () => { await deletePaymentTransfer('${esc(t.transferPairId)}') })()">Delete</button>`)
}, { className: 'transfer-card', attrs: { 'data-date': t.date } }));
if (t.id) photoIds.push([photoBadgeId, 'expense:' + t.id]);
});
list.replaceChildren(fragment);
if (photoIds.length) {
sqliteStore.get('photos').then(ph => {
photoIds.forEach(([badgeId, key]) => {
if (ph && ph[key]) {
const badge = document.getElementById(badgeId);
if (badge) window.setDisplay(badge, 'inline-flex');
}
});
}).catch(() => {});
}
}

window.renderPaymentTransferHistory = renderPaymentTransferHistory;

export async function deletePaymentTransfer(pairId, skipConfirm = false, opts = {}) {
const transactions = ensureArray(await sqliteStore.get('transactions'));
const entries = transactions.filter(t => t.transferPairId === pairId);
if (entries.length === 0) return;
const outSide = entries.find(t => t.type === 'OUT');
const inSide = entries.find(t => t.type === 'IN');
const amount = (outSide && outSide.amount) || (inSide && inSide.amount) || 0;
const fromName = outSide ? outSide.entityName : (inSide ? inSide.transferPeerEntityName : '?');
const toName = inSide ? inSide.entityName : (outSide ? outSide.transferPeerEntityName : '?');
if (!skipConfirm) {
const confirmMsg = `Remove this payment transfer?\n${fromName} → ${toName}\nAmount: ${fmtAmt(amount)}\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(confirmMsg, { title: 'Remove Transfer', confirmText: 'Remove', danger: true }))) return;
}
try {
let working = transactions.slice();
for (const entry of entries) {
working = working.filter(t => t.id !== entry.id);
await unifiedDelete('transactions', working, entry.id, { strict: true }, opts.groupId ? stampGroup(entry, opts.groupId) : entry);
}
try {
const _trfPh = (await sqliteStore.get('photos')) || {};
const _trfPhTs = (await sqliteStore.get('photostamps')) || {};
const _trfDk = (await sqliteStore.get('photodirty')) || [];
let _trfPhChanged = false;
for (const entry of entries) {
const _pk = 'expense:' + entry.id;
if (_trfPh[_pk] !== undefined) {
delete _trfPh[_pk];
delete _trfPhTs[_pk];
if (!_trfDk.includes(_pk)) _trfDk.push(_pk);
_trfPhChanged = true;
}
}
if (_trfPhChanged) {
await sqliteStore.set('photos', _trfPh);
await sqliteStore.set('photostamps', _trfPhTs);
await sqliteStore.set('photodirty', _trfDk);
if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
}
} catch (_trfPhErr) { console.warn('[deletePaymentTransfer] photo cleanup failed', _trfPhErr); }
notifyDataChange('payments');
if (typeof renderPaymentTransferHistory === 'function') await renderPaymentTransferHistory();
if (typeof refreshPaymentTab === 'function') { try { await refreshPaymentTab(true); } catch (_) {} }
if (typeof calculateNetCash === 'function') { try { calculateNetCash(); } catch (_) {} }
} catch (e) {
window.notifyBlocking('Failed to remove transfer. Please try again.', 'error', 'Something went wrong');
}
}

window.deletePaymentTransfer = deletePaymentTransfer;
window.toggleCustomerCreditReceived = toggleCustomerCreditReceived;
window.calculateComparisonData = calculateComparisonData;
window.createReportHTML = createReportHTML;
window.createHistoryCardHTML = createHistoryCardHTML;
window._calcSaleDay = _calcSaleDay;
window.getPendingRepDeliveries = getPendingRepDeliveries;
window.getPendingRepReturns = getPendingRepReturns;
window.applyRepReturnsToCalculator = applyRepReturnsToCalculator;
window.getCalcDateRange = getCalcDateRange;
window.getCalcCycleSelection = getCalcCycleSelection;
window.calculateTotalSoldForRepresentative = calculateTotalSoldForRepresentative;
window._CALC_MONTHS = _CALC_MONTHS;
window._calcFmtDay = _calcFmtDay;
window.updateCalcRangeLabel = updateCalcRangeLabel;
window.openCalcRangePicker = openCalcRangePicker;
window.onCalcDateChange = onCalcDateChange;
window.autoFillTotalSoldQuantity = autoFillTotalSoldQuantity;
window.styleAutoFilledField = styleAutoFilledField;
window.clearAutoFilledField = clearAutoFilledField;
window.loadSalesData = loadSalesData;
window.addToRange = addToRange;
window.updateSalesCharts = updateSalesCharts;
window.processReturnToProduction = processReturnToProduction;
window.reverseReturnFromProduction = reverseReturnFromProduction;
window.CHORA_MATERIAL_NAME = CHORA_MATERIAL_NAME;
window.processExpiredToChora = processExpiredToChora;
window.reverseExpiredFromChora = reverseExpiredFromChora;
window.formatCurrency = formatCurrency;
window.safeValue = safeValue;
window.refreshAllDisplays = refreshAllDisplays;
window._filterFactoryHistoryByMode = _filterFactoryHistoryByMode;
window._filterPaymentHistoryByPeriod = _filterPaymentHistoryByPeriod;
window._filterHistoryByPeriod = _filterHistoryByPeriod;
window.setSalesSummaryMode = setSalesSummaryMode;
window.setPerfOverviewMode = setPerfOverviewMode;
window.setOverviewMode = setOverviewMode;
window.deleteSalesEntry = deleteSalesEntry;
window.revertSpecificSalesEntries = revertSpecificSalesEntries;
window.toggleEntityViewMode = toggleEntityViewMode;
window.calculateEntityBalances = calculateEntityBalances;
window.getDynamicRole = getDynamicRole;
window.filterEntityCards = filterEntityCards;
window.openEntityManagement = openEntityManagement;
window.closeEntityManagement = closeEntityManagement;
window.saveEntity = saveEntity;
window.editEntityBasicInfo = editEntityBasicInfo;
window.refreshPaymentTab = refreshPaymentTab;
window.selectEntity = selectEntity;
window.refreshEntityBalances = refreshEntityBalances;
window.getMetricValue = getMetricValue;
window.getMetricLabel = getMetricLabel;
window.deleteFactoryInventoryItem = deleteFactoryInventoryItem;
window.initPaymentData = initPaymentData;
window.handleExpenseSearch = handleExpenseSearch;
window.selectExpense = selectExpense;
window.hideExpenseSearch = hideExpenseSearch;
window.selectExpenseCategory = selectExpenseCategory;
window.selectReturnStore = selectReturnStore;
window.selectReturnRep = selectReturnRep;
window.renderReturnTargets = renderReturnTargets;
window.saveExpense = saveExpense;
window.createExpenseTransaction = createExpenseTransaction;
window.renderRecentExpenses = renderRecentExpenses;
window.renderExpenseTable = renderExpenseTable;
window.renderUnifiedTable = renderUnifiedTable;
window.updateExpenseBreakdown = updateExpenseBreakdown;
window.exportUnifiedData = exportUnifiedData;
window.formatExpenseDate = formatExpenseDate;
window.toSafeDate = toSafeDate;
window.formatDisplayDate = formatDisplayDate;
window.formatDisplayDateTime = formatDisplayDateTime;
window.openExpenseEntityDetails = openExpenseEntityDetails;
window.openOperatingExpenseOverlay = openOperatingExpenseOverlay;
window.closeExpenseDetailsOverlay = closeExpenseDetailsOverlay;
window.renderExpenseOverlayContent = renderExpenseOverlayContent;
window.filterExpenseManagementHistory = filterExpenseManagementHistory;
window.deleteExpenseFromOverlay = deleteExpenseFromOverlay;
window.saveQuickExpenseEntry = saveQuickExpenseEntry;
window.deleteAllExpensesByName = deleteAllExpensesByName;
window.exportExpenseOverlayToPDF = exportExpenseOverlayToPDF;
window.deleteExpense = deleteExpense;
window.clearExpenseForm = clearExpenseForm;
window.getCategoryColor = getCategoryColor;
window.getCategoryLabel = getCategoryLabel;
window.openDataMenu = openDataMenu;
window.closeDataMenu = closeDataMenu;
window._recoveredThisSession = _recoveredThisSession;
window.purgeRecoveredId = purgeRecoveredId;
window._findPairedTransferTombstone = _findPairedTransferTombstone;
window.recoverRecord = recoverRecord;
window.RECYCLE_COLLECTION_TO_TAB = RECYCLE_COLLECTION_TO_TAB;
window.RECYCLE_BIN_COLLECTION_LABELS = RECYCLE_BIN_COLLECTION_LABELS;
window.RECYCLE_TAB_LABELS = RECYCLE_TAB_LABELS;
window.RECYCLE_RECOVERABLE_COLLECTIONS = RECYCLE_RECOVERABLE_COLLECTIONS;
window.openRecycleBin = openRecycleBin;
window.closeRecycleBin = closeRecycleBin;
window.renderRecycleBin = renderRecycleBin;
window.attemptRecoverRecord = attemptRecoverRecord;
window.emptyRecycleBin = emptyRecycleBin;
window.hardDeleteRecord = hardDeleteRecord;
window.attemptHardDeleteRecord = attemptHardDeleteRecord;
window.triggerLocalBackup = triggerLocalBackup;
window.BiometricAuth = BiometricAuth;
window.forceAppModeFromCloud = forceAppModeFromCloud;
window.updateSystemName = updateSystemName;
window.lockToRepMode = lockToRepMode;
window.lockToProductionMode = lockToProductionMode;
window.lockToFactoryMode = lockToFactoryMode;
window.lockToUserRoleMode = lockToUserRoleMode;
window.enforceRepModeLock = enforceRepModeLock;
window.preventAdminAccess = preventAdminAccess;
window.unlockAdminMode = unlockAdminMode;
window.deleteRepTransaction = deleteRepTransaction;
window.handleCustomerInput = handleCustomerInput;
window.handleUniversalSearch = handleUniversalSearch;
window.selectFromUniversalSearch = selectFromUniversalSearch;
window.initTheme = initTheme;
window.FIRESTORE_ENHANCED_SCHEMA = FIRESTORE_ENHANCED_SCHEMA;
window.FIRESTORE_SETTINGS_SCHEMA = FIRESTORE_SETTINGS_SCHEMA;
window.FIRESTORE_LOCAL_ONLY_KEYS = FIRESTORE_LOCAL_ONLY_KEYS;
window.updateConnectionStatus = updateConnectionStatus;
window.originalSync = originalSync;
window.ThemeManager = ThemeManager;
window.IncrementalRenderer = IncrementalRenderer;
window.ReactiveComponent = ReactiveComponent;
window.PerformanceMonitor = PerformanceMonitor;
window.loadSalesRepsList = loadSalesRepsList;
window.saveSalesRepsList = saveSalesRepsList;
window.saveUserRolesList = saveUserRolesList;
window.renderAllRepUI = renderAllRepUI;
window.renderManageRepsList = renderManageRepsList;
window._newUserRoleSelectedTabs = _newUserRoleSelectedTabs;
window.toggleUserRoleTabAccess = toggleUserRoleTabAccess;
window.renderUserRoleList = renderUserRoleList;
window.switchManageTeamTab = switchManageTeamTab;
window.addNewUserRole = addNewUserRole;
window.removeUserRole = removeUserRole;
window.addNewSalesRep = addNewSalesRep;
window.removeSalesRep = removeSalesRep;
window.openManageRepsModal = openManageRepsModal;
window.closeManageRepsModal = closeManageRepsModal;
window._overlayStack = _overlayStack;
window.loadUserRolesContent = loadUserRolesContent;
window.phoneActionHTML = phoneActionHTML;
window.loadDeviceList = loadDeviceList;
window.refreshDeviceList = refreshDeviceList;
window.remoteControlDevice = remoteControlDevice;
window.removeDevice = removeDevice;
window._applyModeFromData = _applyModeFromData;
window.restoreDeviceModeOnLogin = restoreDeviceModeOnLogin;
window.listenForDeviceCommands = listenForDeviceCommands;
window.applyRemoteModeChange = applyRemoteModeChange;
window.listenForTeamChanges = listenForTeamChanges;
window.prepareEntityTransferScreen = prepareEntityTransferScreen;
window.saveEntityTransfer = saveEntityTransfer;
window.openPaymentTransferPhotoCapture = openPaymentTransferPhotoCapture;
window.handlePaymentTransferPhotoFile = handlePaymentTransferPhotoFile;
window._applyPaymentTransferPendingPhoto = _applyPaymentTransferPendingPhoto;
window.renderPaymentTransferHistory = renderPaymentTransferHistory;
window.deletePaymentTransfer = deletePaymentTransfer;
