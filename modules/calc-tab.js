import { showTab, refreshCustomerSales, revertRepSalesEntries, processRepTransfer, markAllPendingCreditSalesAsCash, refreshUI, _cap } from './utilities-sales.js';
import { getCostPriceForStore, getSalePriceForStore } from './factory-core.js';
import { getDefaultStoreKey } from './store-keys.js';
import { readNum, round2, fmtAmt, safeNumber, ensureArray, sqliteStore, loadCollections, generateUUID, validateUUID, getTimestamp, ensureRecordIntegrity, salesRepsList } from './business.js';
import { safeValue, renderReturnTargets, updateCalcRangeLabel, _calcSaleDay, autoFillTotalSoldQuantity, getCalcCycleSelection, loadSalesData, currentCompMode, reverseCalcEntryForEdit, reverseReturnFromProduction, reverseExpiredFromChora, revertSpecificSalesEntries, restoreCalcAfterFailedEdit, processReturnToProduction, processExpiredToChora, getPendingRepReturns, calculateComparisonData, updateSalesCharts, getMetricLabel, getMetricValue } from './utilities-payments.js';
import { resetFieldExpenses, resetCommissionPaid, setFieldExpenseItems, setCommissionItems, getFieldExpenseItems, getCommissionItems } from './field-expenses.js';
import { beginEditMode, getEditCtx, stampEdit, confirmEditChanges, replaceRecord, endEditMode } from './edit-mode.js';
import { editDateValue } from './edit-date.js';
import { expenseItemsOfRecord, commissionItemsOfRecord } from './field-expense-items.js';
import { showToast } from './customers.js';
import { confirmGuard } from './confirm-guard.js';
import { unifiedSave, emitSyncUpdate, unifiedDelete } from './sync.js';
import { notifyDataChange, indPerformanceChart, _set_indPerformanceChart, SarimChart } from './utilities-core.js';
import { pickReturnsCovered } from './rep-return-link.js';
import { isMoneyRestricted } from './money-privacy.js';
import { themeColor } from './theme-tokens.js';
import { formatMonthYear } from './date-format.js';

export async function calculateSales() {
const seller = document.getElementById('sellerSelect').value;
const costPerKg = await getCostPriceForStore(getDefaultStoreKey());
const autoSalePrice = await getSalePriceForStore(getDefaultStoreKey());
const sold = readNum('totalSold');
const ret = readNum('returnedQuantity');
const exp = readNum('expiredQuantity');
const shared = readNum('sharedQty');
const cred = readNum('creditSales');
const prev = readNum('prevCreditReceived');
const rec = readNum('receivedCash');
const fieldExp = readNum('fieldExpenses');
const salePrice = autoSalePrice;
const commissionPerUnit = readNum('commissionPerUnit');
const commissionPaid = readNum('commissionPaid');
const netSold = Math.max(0, sold - ret - exp - shared);
const _netSoldEl = document.getElementById('netSoldQty');
if (_netSoldEl) _netSoldEl.value = netSold ? String(round2(netSold)) : '0';
const cashQty = Math.max(0, netSold - cred);
const expected = (cashQty * salePrice) + prev - fieldExp - commissionPaid;
document.getElementById('totalExpectedCash').textContent = fmtAmt(safeValue(expected));
const diff = rec - expected;
const _discEl = document.getElementById('discrepancyStatus');
const _tone = (ok) => (ok ? 'u-text-accent u-fw-800' : 'u-danger-bold');
if(Math.abs(diff) < 0.01) {
if (_discEl) { _discEl.className = _tone(true); _discEl.innerText = "PERFECT MATCH "; }
} else if(diff < -0.01) {
if (_discEl) { _discEl.className = _tone(false); _discEl.innerText = `SHORT: ${fmtAmt(Math.abs(diff))}`; }
} else {
if (_discEl) { _discEl.className = _tone(true); _discEl.innerText = `OVER: ${fmtAmt(safeNumber(diff, 0))}`; }
}
const grossCommission = commissionPerUnit * netSold;
const commissionPayable = Math.max(0, grossCommission - commissionPaid);
const grossEl = document.getElementById('grossCommissionEarned');
const paidEl = document.getElementById('commissionPaidDisplay');
const payableEl = document.getElementById('commissionPayableDisplay');
if (grossEl) grossEl.textContent = fmtAmt(safeValue(grossCommission));
if (paidEl) paidEl.textContent = fmtAmt(safeValue(commissionPaid));
if (payableEl) payableEl.textContent = fmtAmt(safeValue(commissionPayable));
if (payableEl) payableEl.className = _tone(commissionPayable <= 0.01);
}

export function handleReturnQtyInput() {
const retQty = readNum('returnedQuantity');
const section = document.getElementById('returnStoreSection');
if (retQty > 0) {
section.classList.remove('hidden');
if (typeof renderReturnTargets === 'function') renderReturnTargets();
} else {
section.classList.add('hidden');
}
if (typeof calculateSales === 'function') calculateSales();
}

export function handleExpiredQtyInput() {
if (typeof calculateSales === 'function') calculateSales();
}

export function handleTripleTap(el, targetTab) {
const now = Date.now();
const TAP_WINDOW = 600;
if (!el._tapTimes) el._tapTimes = [];
el._tapTimes.push(now);
el._tapTimes = el._tapTimes.filter(t => now - t < TAP_WINDOW);
if (el._tapTimes.length >= 3) {
el._tapTimes = [];
showTab(targetTab);
}
}

function _resetCalcForm() {
['totalSold', 'returnedQuantity', 'expiredQuantity', 'sharedQty', 'creditSales', 'prevCreditReceived', 'receivedCash', 'commissionPerUnit'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
resetFieldExpenses();
resetCommissionPaid();
['sellerSelectBtn', 'sale-date'].forEach(id => { const el = document.getElementById(id); if (el) { el.readOnly = false; el.disabled = false; } });
window._calcLegacyEdit = false;
window._returnStore = null;
window._returnRep = null;
if (typeof window.autoFillTotalSoldQuantity === 'function') window.autoFillTotalSoldQuantity();
else if (typeof window.calculateSales === 'function') window.calculateSales();
}

export async function startEditCalc(id) {
const history = ensureArray(await sqliteStore.get('calculator', []));
const rec = history.find(h => h && String(h.id) === String(id));
if (!rec) { showToast('This entry cannot be edited.', 'warning'); return; }
if (rec.isMerged) { showToast('Merged opening balance records cannot be edited.', 'warning'); return; }
if (typeof showTab === 'function') showTab('calc');
const sel = document.getElementById('sellerSelect');
if (!sel || !Array.from(sel.options).some(o => o.value === rec.seller)) { showToast('The seller of this entry is not available for editing.', 'warning'); return; }
beginEditMode('calc', rec, { buttonId: 'btn-save-calculator', watchIds: ['sellerSelect', 'sale-date', 'totalSold', 'returnedQuantity', 'expiredQuantity', 'sharedQty', 'creditSales', 'prevCreditReceived', 'receivedCash', 'commissionPerUnit', 'fieldExpenses', 'commissionPaid'], label: 'Update Entry', anchorId: 'totalSold', cancelFn: _resetCalcForm });
window._calcSeller = rec.seller;
sel.value = rec.seller;
const selBtnLabel = document.querySelector('#sellerSelectBtn span');
if (selBtnLabel) { const opt = Array.from(sel.options).find(o => o.value === rec.seller); if (opt) selBtnLabel.textContent = opt.text; }
const set = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v; };
set('sale-date', editDateValue(rec, ['date', 'createdAt', 'timestamp']));
const _hasLinks = Array.isArray(rec.linkedSalesIds) && rec.linkedSalesIds.length > 0;
window._calcLegacyEdit = !_hasLinks;
{
const _allSales = ensureArray(await sqliteStore.get('sales'));
const _days = (rec.linkedSalesIds || []).map(sid => { const r = _allSales.find(x => x && x.id === sid); return r ? _calcSaleDay(r) : ''; }).filter(Boolean).sort();
set('sale-date-from', (_days[0] && _days[0] < rec.date) ? _days[0] : rec.date);
window._calcFromManual = true;
updateCalcRangeLabel();
}
const _num = (v) => (Number(v) > 0 ? String(Number(v)) : '');
const totalSold = document.getElementById('totalSold');
if (totalSold) { totalSold.readOnly = true; totalSold.value = String(Number(rec.totalSold) || 0); }
set('returnedQuantity', _num(rec.returned));
set('expiredQuantity', _num(rec.expired));
set('sharedQty', _num(rec.shared));
set('creditSales', _num(rec.creditQty));
set('prevCreditReceived', _num(rec.prevColl));
set('receivedCash', _num(rec.received));
set('commissionPerUnit', _num(rec.commissionPerUnit));
setFieldExpenseItems(expenseItemsOfRecord(rec));
setCommissionItems(commissionItemsOfRecord(rec));
['totalSold', 'returnedQuantity', 'expiredQuantity'].forEach(eid => { const el = document.getElementById(eid); if (el) el.readOnly = true; });
const selectBtn = document.getElementById('sellerSelectBtn'); if (selectBtn) selectBtn.disabled = false;
if (_hasLinks) {
await autoFillTotalSoldQuantity();
set('creditSales', _num(rec.creditQty));
set('prevCreditReceived', _num(rec.prevColl));
}
window._returnStore = rec.returnStore || null;
window._returnRep = rec.returnRep || null;
if (readNum('returnedQuantity') > 0) {
const _sec = document.getElementById('returnStoreSection');
if (_sec) _sec.classList.remove('hidden');
if (typeof renderReturnTargets === 'function') await renderReturnTargets();
const _grp = document.querySelector('#returnStoreSection .toggle-group');
if (_grp) {
_grp.querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
const _btn = rec.returnStore ? document.getElementById('ret-store-' + rec.returnStore) : Array.from(_grp.querySelectorAll('.ret-rep-btn')).find(b => (b.textContent || '').trim().toLowerCase() === String(rec.returnRep || '').trim().toLowerCase());
if (_btn) _btn.classList.add('active');
}
}
if (typeof window.calculateSales === 'function') window.calculateSales();
if (window._editCtx) window._editCtx.snapshot = Object.fromEntries(window._editCtx.watchIds.map(wid => { const el = document.getElementById(wid); return [wid, String(el ? (el.value ?? '') : '')]; }));
if (_hasLinks) showToast('Total sold, returned and expired are refreshed from the Sales tab. If they changed, saving re-applies stock and credit links.', 'info');
}

let _calcSaveInFlight = false;

export function saveTransaction(...a) { return confirmGuard('saveTransaction', () => _saveTransactionRaw(...a), { label: 'Sale', late: true, fields: [['sellerSelect', 'Seller'], ['sale-date', 'Date'], ['totalSold', 'Total Sold'], ['returnedQuantity', 'Returned'], ['expiredQuantity', 'Expired'], ['creditSales', 'Credit Sales'], ['receivedCash', 'Cash Received']] }); }

async function _saveTransactionRaw() {
if (_calcSaveInFlight) return;
_calcSaveInFlight = true;
try { return await _saveTransactionImpl(); } finally { _calcSaveInFlight = false; }
}

async function _saveTransactionImpl() {
const { calculator } = await loadCollections('calculator');
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const seller = document.getElementById('sellerSelect').value;
const date = document.getElementById('sale-date').value;
const sold = readNum('totalSold');
const _calcEd = getEditCtx('calc');
const ret = readNum('returnedQuantity');
const exp = readNum('expiredQuantity');
const _r2e = (n) => Number(safeNumber(n, 0).toFixed(2));
const _calcFull = !!_calcEd && (() => {
const o = _calcEd.original;
if (seller !== o.seller || date !== editDateValue(o, ['date', 'createdAt', 'timestamp'])) return true;
if (_r2e(sold) !== _r2e(o.totalSold) || _r2e(ret) !== _r2e(o.returned) || _r2e(exp) !== _r2e(o.expired)) return true;
return ret > 0 && ((window._returnStore || null) !== (o.returnStore || null) || (window._returnRep || null) !== (o.returnRep || null));
})();
const _calcQuick = !!_calcEd && !_calcFull;
const shared = readNum('sharedQty');
const cred = readNum('creditSales');
const prev = readNum('prevCreditReceived');
const rec = readNum('receivedCash');
const fieldExp = readNum('fieldExpenses');
const commissionPerUnit = readNum('commissionPerUnit');
const commissionPaid = readNum('commissionPaid');
let selectedStore = null;
let selectedRep = null;
if (ret > 0 && !_calcQuick) {
if (window._returnRep && window._returnRep !== seller) {
selectedRep = window._returnRep;
} else if (window._returnStore) {
selectedStore = { value: window._returnStore };
} else {
window.notifyBlocking('Please select a store (ZUBAIR or MAHMOOD) for a product return, or a sales representative for a transfer!', 'warning', 'Warning');
return;
}
}
const costPerKg = _calcQuick ? (Number(_calcEd.original.costPrice) || 0) : ((await getCostPriceForStore(getDefaultStoreKey(), date)) || 0);
const salePrice = _calcQuick ? (Number(_calcEd.original.unitPrice) || 0) : await getSalePriceForStore(getDefaultStoreKey());
if(!date) return window.notifyBlocking('Please select a date', 'warning', 'Warning');
if(sold <= 0) return window.notifyBlocking('Please enter valid units sold (must be greater than 0)', 'warning', 'Warning');
if(salePrice <= 0) return window.notifyBlocking('Please set a sale price in Factory Formulas first', 'warning', 'Warning');
if(ret > sold) return window.notifyBlocking('Returned quantity cannot exceed total sold', 'warning', 'Warning');
if(exp < 0) return window.notifyBlocking('Expired quantity cannot be negative', 'warning', 'Warning');
if(ret < 0) return window.notifyBlocking('Returned quantity cannot be negative', 'warning', 'Warning');
if(shared < 0) return window.notifyBlocking('Shared (deduction) quantity cannot be negative', 'warning', 'Warning');
if(cred < 0) return window.notifyBlocking('Credit sales cannot be negative', 'warning', 'Credit warning');
if(prev < 0) return window.notifyBlocking('Previous credit received cannot be negative', 'warning', 'Credit warning');
if(rec < 0) return window.notifyBlocking('Received cash cannot be negative', 'warning', 'Warning');
if(fieldExp < 0) return window.notifyBlocking('Field expenses cannot be negative', 'warning', 'Warning');
if(commissionPerUnit < 0) return window.notifyBlocking('Commission per unit cannot be negative', 'warning', 'Warning');
if(commissionPaid < 0) return window.notifyBlocking('Commission paid cannot be negative', 'warning', 'Warning');
if((ret + exp + shared) > sold) return window.notifyBlocking('Combined returned + expired + shared quantity cannot exceed total sold', 'warning', 'Warning');
const netSold = Math.max(0, sold - ret - exp - shared);
if(cred > netSold) return window.notifyBlocking('Credit sales cannot exceed net sold quantity', 'warning', 'Credit warning');
const cashQty = Math.max(0, netSold - cred);
const creditValue = cred * salePrice;
const revenue = netSold * salePrice;
const totalCost = netSold * costPerKg;
const profit = revenue - totalCost;
const totalExpected = (cashQty * salePrice) + prev - fieldExp - commissionPaid;
const diff = rec - totalExpected;
const grossCommission = commissionPerUnit * netSold;
const commissionPayable = Math.max(0, grossCommission - commissionPaid);
let statusText = "PERFECT MATCH ";
let statusClass = "result-box callout discrepancy-ok";
if (Math.abs(diff) > 0.01) {
if (diff < 0) {
statusText = `SHORT: ${fmtAmt(safeNumber(Math.abs(diff), 0))}`;
statusClass = "result-box callout discrepancy-alert";
} else {
statusText = `OVER: ${fmtAmt(safeNumber(diff, 0))}`;
statusClass = "result-box callout discrepancy-ok";
}
}
if (_calcQuick) {
const _o = _calcEd.original;
const _r2 = (n) => Number(safeNumber(n, 0).toFixed(2));
const _fieldItems = getFieldExpenseItems();
const _commItems = getCommissionItems();
const _changes = {
totalSold: _r2(sold), shared: _r2(shared), creditQty: _r2(cred), cashQty: _r2(cashQty), creditValue: _r2(creditValue),
prevColl: _r2(prev), fieldExpenses: _r2(fieldExp), fieldExpenseItems: _fieldItems,
commissionPerUnit: _r2(commissionPerUnit), commissionPaid: _r2(commissionPaid), commissionPaidItems: _commItems,
grossCommission: _r2(grossCommission), commissionPayable: _r2(commissionPayable),
revenue: _r2(revenue), profit: _r2(profit), totalCost: _r2(totalCost), totalExpected: _r2(totalExpected), received: _r2(rec),
statusText, statusClass
};
const _rows = [
{ label: 'Total sold', from: _o.totalSold, to: _changes.totalSold },
{ label: 'Shared', from: _o.shared, to: _changes.shared },
{ label: 'Credit qty', from: _o.creditQty, to: _changes.creditQty },
{ label: 'Previous credit received', from: _o.prevColl, to: _changes.prevColl },
{ label: 'Field expenses', from: _o.fieldExpenses, to: _changes.fieldExpenses },
{ label: 'Commission / unit', from: _o.commissionPerUnit, to: _changes.commissionPerUnit },
{ label: 'Commission paid', from: _o.commissionPaid, to: _changes.commissionPaid },
{ label: 'Cash received', from: _o.received, to: _changes.received }
].map(r => ({ ...r, from: _r2(r.from), to: _r2(r.to) }));
if (!(await confirmEditChanges(_rows, 'Update Calculator Entry?'))) return;
try {
let _hist = ensureArray(await sqliteStore.get('calculator', []));
const _live = _hist.find(h => h && String(h.id) === String(_o.id)) || _o;
const _updated = ensureRecordIntegrity(stampEdit({ ..._live, ..._changes, syncedAt: new Date().toISOString() }, _live), true);
replaceRecord(_hist, _updated);
await unifiedSave('calculator', _hist, _updated);
notifyDataChange('calculator');
emitSyncUpdate({ calculator: null });
if (Array.isArray(calculator)) replaceRecord(calculator, _updated);
endEditMode();
_resetCalcForm();
showToast('Calculator entry updated', 'success');
await loadSalesData(currentCompMode);
if (typeof refreshCustomerSales === 'function') await refreshCustomerSales(1, true);
} catch (e) {
window.notifyBlocking('Could not update the entry. Nothing was changed.', 'error', 'Something went wrong');
}
return;
}
if (_calcFull) {
const _o = _calcEd.original;
const _fr = [
{ label: 'Seller', from: _o.seller, to: seller },
{ label: 'Date', from: editDateValue(_o, ['date', 'createdAt', 'timestamp']), to: date },
{ label: 'Total sold', from: _r2e(_o.totalSold), to: _r2e(sold) },
{ label: 'Returned', from: _r2e(_o.returned), to: _r2e(ret) },
{ label: 'Expired', from: _r2e(_o.expired), to: _r2e(exp) },
{ label: 'Shared', from: _r2e(_o.shared), to: _r2e(shared) },
{ label: 'Credit qty', from: _r2e(_o.creditQty), to: _r2e(cred) },
{ label: 'Previous credit received', from: _r2e(_o.prevColl), to: _r2e(prev) },
{ label: 'Field expenses', from: _r2e(_o.fieldExpenses), to: _r2e(fieldExp) },
{ label: 'Commission / unit', from: _r2e(_o.commissionPerUnit), to: _r2e(commissionPerUnit) },
{ label: 'Commission paid', from: _r2e(_o.commissionPaid), to: _r2e(commissionPaid) },
{ label: 'Cash received', from: _r2e(_o.received), to: _r2e(rec) }
];
if (!(await confirmEditChanges(_fr, 'Update Calculator Entry?'))) return;
}
if (!(await window.gcCommit({}))) return;
const _ed = _calcFull ? _calcEd : null;
let _rev = null;
if (_ed) {
_rev = await reverseCalcEntryForEdit(_ed.id);
if (_rev.error) { window.notifyBlocking(_rev.error, 'warning', 'Action not allowed'); return; }
}
let transferInfo = null;
let _retIds = null;
let _expApplied = null;
let linkedIds = [];
let linkedRepIds = [];
const _rollbackCalc = async () => {
try {
if (_retIds && selectedStore) await reverseReturnFromProduction(selectedStore.value, ret, date, seller, _retIds);
if (transferInfo) {
const _all = ensureArray(await sqliteStore.get('sales'));
const _r = _all.find(x => x.id === transferInfo.saleId);
if (_r) await unifiedDelete('sales', _all.filter(x => x.id !== _r.id), _r.id, { strict: true }, _r);
}
if (_expApplied) await reverseExpiredFromChora(exp, date);
if (linkedIds.length) await revertSpecificSalesEntries(linkedIds);
if (linkedRepIds.length) await revertRepSalesEntries(linkedRepIds);
} catch (_) {}
if (_rev) { try { await restoreCalcAfterFailedEdit(_rev); } catch (_) {} }
};
try {
if (ret > 0 && selectedStore) {
_retIds = await processReturnToProduction(selectedStore.value, ret, date, seller);
} else if (ret > 0 && selectedRep) {
transferInfo = await processRepTransfer(selectedRep, ret, date, seller);
}
if (exp > 0) {
_expApplied = await processExpiredToChora(exp, date, seller);
}
} catch (e) {
await _rollbackCalc();
window.notifyBlocking('Could not save: ' + ((e && e.message) || 'unknown error'), 'error', 'Something went wrong');
return;
}
let calcId = _ed ? _ed.id : generateUUID('calc');
if (!_ed && !validateUUID(calcId)) {
calcId = generateUUID('calc');
}
const calcCreatedAt = getTimestamp();
let entry = {
id: calcId,
seller: seller,
date: date,
createdAt: calcCreatedAt,
updatedAt: calcCreatedAt,
timestamp: calcCreatedAt,
unitPrice: Number(safeNumber(salePrice, 0).toFixed(2)),
costPrice: Number(safeNumber(costPerKg, 0).toFixed(2)),
revenue: Number(safeNumber(revenue, 0).toFixed(2)),
profit: Number(safeNumber(profit, 0).toFixed(2)),
totalCost: Number(safeNumber(totalCost, 0).toFixed(2)),
totalSold: Number(safeNumber(sold, 0).toFixed(2)),
returned: Number(safeNumber(ret, 0).toFixed(2)),
returnStore: selectedStore ? selectedStore.value : null,
returnEntryId: _retIds ? _retIds.returnEntryId : null,
returnLogId: _retIds ? _retIds.returnLogId : null,
expiredApplied: exp > 0 ? !!_expApplied : null,
returnRep: selectedRep || null,
returnType: selectedRep ? 'TRANSFER' : (selectedStore ? 'RETURN' : null),
transferSaleId: transferInfo ? transferInfo.saleId : null,
expired: Number(safeNumber(exp, 0).toFixed(2)),
shared: Number(safeNumber(shared, 0).toFixed(2)),
creditQty: Number(safeNumber(cred, 0).toFixed(2)),
cashQty: Number(safeNumber(cashQty, 0).toFixed(2)),
creditValue: Number(safeNumber(creditValue, 0).toFixed(2)),
prevColl: Number(safeNumber(prev, 0).toFixed(2)),
fieldExpenses: Number(safeNumber(fieldExp, 0).toFixed(2)),
fieldExpenseItems: getFieldExpenseItems(),
commissionPaidItems: getCommissionItems(),
totalExpected: Number(safeNumber(totalExpected, 0).toFixed(2)),
received: Number(safeNumber(rec, 0).toFixed(2)),
commissionPerUnit: Number(safeNumber(commissionPerUnit, 0).toFixed(2)),
commissionPaid: Number(safeNumber(commissionPaid, 0).toFixed(2)),
grossCommission: Number(safeNumber(grossCommission, 0).toFixed(2)),
commissionPayable: Number(safeNumber(commissionPayable, 0).toFixed(2)),
statusText: statusText,
statusClass: statusClass,
linkedSalesIds: [],
linkedRepSalesIds: [],
linkedRepReturnIds: [],
syncedAt: new Date().toISOString()
};
if (_ed) stampEdit(entry, _ed.original);
entry = ensureRecordIntegrity(entry, !!_ed);
const reconciledCustomerIds = new Set();
if (Array.isArray(calculator)) {
  calculator.forEach(h => { if (_ed && h.id === _ed.id) return; if (Array.isArray(h.linkedSalesIds)) h.linkedSalesIds.forEach(id => reconciledCustomerIds.add(id)); });
}
const _cycSel = await getCalcCycleSelection(seller);
try {
linkedIds = await markAllPendingCreditSalesAsCash(seller, reconciledCustomerIds, _cycSel.selectedIds);
entry.linkedSalesIds = linkedIds;
linkedRepIds = await markRepSalesEntriesAsUsed(seller, date, calcId, _cycSel.from);
entry.linkedRepSalesIds = linkedRepIds;
entry.linkedRepReturnIds = pickReturnsCovered(await getPendingRepReturns(seller, _cycSel.to || date), ret, exp).map(r => r.id);
} catch (e) {
await _rollbackCalc();
window.notifyBlocking('Failed to save transaction. Nothing was changed.', 'error', 'Something went wrong');
return;
}
let _persisted = false;
try {
let history = await sqliteStore.get('calculator', []);
if (!Array.isArray(history)) history = [];
if (_ed) replaceRecord(history, entry); else history.push(entry);
await unifiedSave('calculator', history, entry);
_persisted = true;
notifyDataChange('calculator');
emitSyncUpdate({ calculator: null});
if (Array.isArray(calculator)) {
if (_ed) replaceRecord(calculator, entry); else calculator.push(entry);
}
if (_ed) endEditMode();
document.getElementById('totalSold').value = '';
document.getElementById('returnedQuantity').value = '';
document.getElementById('expiredQuantity').value = '';
document.getElementById('sharedQty').value = '';
document.getElementById('creditSales').value = '';
document.getElementById('prevCreditReceived').value = '';
document.getElementById('receivedCash').value = '';
resetFieldExpenses();
document.getElementById('commissionPerUnit').value = '';
resetCommissionPaid();
window._returnStore = null;
window._returnRep = null;
{ const _rr = document.getElementById('returnedQuantity'), _ee = document.getElementById('expiredQuantity'), _hh = document.getElementById('repReturnAutoHint');
if (_rr) { delete _rr.dataset.repReturnAuto; window.clearAutoFilledField(_rr); }
if (_ee) { delete _ee.dataset.repReturnAuto; window.clearAutoFilledField(_ee); }
if (_hh) { _hh.classList.add('hidden'); _hh.textContent = ''; } }
document.getElementById('returnStoreSection').classList.add('hidden');
window._calcFromManual = false;
showToast(_ed ? `Transaction updated! ${linkedIds.length} sales entries reconciled.` : `Transaction saved! ${linkedIds.length} sales entries reconciled.`, 'success');
await loadSalesData(currentCompMode);
if (typeof refreshCustomerSales === 'function') await refreshCustomerSales(1, true);
if (entry.returned > 0 && (entry.returnStore || entry.returnRep)) {
if (typeof refreshUI === 'function') await refreshUI();
}
if (entry.expired > 0) {
if (typeof window.renderFactoryInventory === 'function') window.renderFactoryInventory?.();
}
} catch (error) {
if (_persisted) {
console.warn('[saveTransaction] saved, but a screen refresh failed:', error && error.message);
window.notifyBlocking('Saved. Some screens could not refresh - reload to see everything.', 'warning', 'Warning');
} else {
await _rollbackCalc();
window.notifyBlocking('Failed to save transaction. Nothing was changed.', 'error', 'Something went wrong');
}
}
}

export async function markRepSalesEntriesAsUsed(seller, date, calcId, fromDate) {
const rep = ensureArray(await sqliteStore.get('rep'));
  if (!seller || seller === 'COMBINED' || !date || !calcId) return [];
  const linkedRepIds = [];
  rep.forEach(sale => {
    if (
      sale.salesRep === seller &&
      ((fromDate && fromDate < date) ? (sale.date >= fromDate && sale.date <= date) : sale.date === date) &&
      !sale.usedInCalcId &&
      (sale.paymentType === 'CREDIT' || sale.paymentType === 'COLLECTION')
    ) {
      sale.usedInCalcId = calcId;
      sale.updatedAt = getTimestamp();
      ensureRecordIntegrity(sale, true);
      linkedRepIds.push(sale.id);
    }
  });
  if (linkedRepIds.length > 0) {
    await unifiedSave('rep', rep, null, linkedRepIds);
  }
  return linkedRepIds;
}

export async function updateCompositionChart() {
const _sdEl = document.getElementById('sellerSelect');
if (_sdEl && _sdEl.value === 'COMBINED') {
const comp = await calculateComparisonData();
updateSalesCharts(comp);
}
}

export async function setIndChartMode(mode) {
window.currentIndMode = mode;
document.getElementById('ind-week-btn').className = `toggle-opt ${mode === 'week' ? 'active' : ''}`;
document.getElementById('ind-month-btn').className = `toggle-opt ${mode === 'month' ? 'active' : ''}`;
document.getElementById('ind-year-btn').className = `toggle-opt ${mode === 'year' ? 'active' : ''}`;
document.getElementById('ind-all-btn').className = `toggle-opt ${mode === 'all' ? 'active' : ''}`;
await updateIndChart();
}

export async function setIndChartMetric(metric) {
window.currentIndMetric = metric;
await updateIndChart();
}

export async function updateIndChart() {
if (isMoneyRestricted()) return;
const seller = document.getElementById('sellerSelect').value;
if (seller === 'COMBINED') return;
if(indPerformanceChart) indPerformanceChart.destroy();
let history; history = await sqliteStore.get('calculator', []);
const sellerHistory = history.filter(h => h.seller === seller);
const now = new Date(document.getElementById('sale-date').value);
const selectedYear = now.getFullYear();
const selectedMonth = now.getMonth();
const selectedDay = now.getDate();
let labels = [];
let data = [];
if (window.currentIndMode === 'week') {
for(let i=6; i>=0; i--) {
const d = new Date(now);
d.setDate(now.getDate() - i);
const dateStr = d.toISOString().split('T')[0];
labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
let metricValue = 0;
sellerHistory.forEach(h => {
if(h.date === dateStr) {
metricValue += getMetricValue(h, window.currentIndMetric);
}
});
data.push(metricValue);
}
} else if (window.currentIndMode === 'month') {
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
data = new Array(daysInMonth).fill(0);
sellerHistory.forEach(h => {
const d = new Date(h.date);
if(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
const day = d.getDate();
data[day - 1] += getMetricValue(h, window.currentIndMetric);
}
});
} else if (window.currentIndMode === 'year') {
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
labels = months;
data = new Array(12).fill(0);
sellerHistory.forEach(h => {
const d = new Date(h.date);
if(d.getFullYear() === now.getFullYear()) {
const month = d.getMonth();
data[month] += getMetricValue(h, window.currentIndMetric);
}
});
} else if (window.currentIndMode === 'all') {
const allMonths = [];
const monthData = {};
sellerHistory.forEach(h => {
const d = new Date(h.date);
const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = formatMonthYear(d);
if (!monthData[monthYear]) {
monthData[monthYear] = {
label: monthLabel,
value: 0
};
}
monthData[monthYear].value += getMetricValue(h, window.currentIndMetric);
});
const sortedMonths = Object.keys(monthData).sort();
sortedMonths.forEach(monthKey => {
labels.push(monthData[monthKey].label);
data.push(monthData[monthKey].value);
});
if (labels.length > 12) {
labels = labels.slice(-12);
data = data.slice(-12);
}
}
const colors = {
text: themeColor('--text-muted'),
grid: themeColor('--text-main', 10)
};
const repChartColorsInd = ['--accent-blue', '--success', '--warning', '--accent-purple', '--danger', '--accent-cyan'].map((t) => themeColor(t));
const sellerColor = repChartColorsInd[salesRepsList.indexOf(seller) >= 0 ? salesRepsList.indexOf(seller) : 0];
const chartElement = document.getElementById('indPerformanceChart');
if (!chartElement) { return; }
_set_indPerformanceChart(new SarimChart(chartElement, {
type: 'bar',
data: {
labels: labels,
datasets: [{
label: getMetricLabel(window.currentIndMetric),
data: data,
backgroundColor: sellerColor + '80',
borderColor: sellerColor,
borderWidth: 1,
borderRadius: 4
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { display: false },
title: {
display: true,
text: `${getMetricLabel(window.currentIndMetric)} - ${window.currentIndMode === 'all' ? 'All Times' : _cap(window.currentIndMode) + 'ly'} View`,
color: colors.text,
font: { size: 13, weight: 'bold' }
}
},
scales: {
y: {
beginAtZero: true,
grid: { color: colors.grid },
ticks: { color: colors.text }
},
x: {
ticks: { color: colors.text, maxRotation: 45 }
}
}
}
}));
}

export function filterCalculatorHistory() {
const searchTerm = document.getElementById('calculator-search').value.toLowerCase();
const allCards = document.querySelectorAll('#historyList .card');
allCards.forEach(card => {
const cardText = card.textContent.toLowerCase();
const sellerElement = card.querySelector('.seller-badge');
const sellerText = sellerElement ? sellerElement.textContent.toLowerCase() : '';
if (cardText.includes(searchTerm) || sellerText.includes(searchTerm)) {
window.setDisplay(card, '');
} else {
window.setDisplay(card, 'none');
}
});
}

Object.assign(window, { startEditCalc, calculateSales, handleReturnQtyInput, handleExpiredQtyInput, handleTripleTap, saveTransaction, markRepSalesEntriesAsUsed, updateCompositionChart, setIndChartMode, setIndChartMetric, updateIndChart, filterCalculatorHistory });
