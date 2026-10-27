import { themeColor } from './theme-tokens.js';
import { formatDayMonthYear } from './date-format.js';
import { getSaleBlockReason, getSaleEditLinkIssue, recordCustomerRename, applyCollectionToSales, getExpiredDeleteBlockReason } from './link-guards.js';
import { smBarHtml } from './summary-card.js';
import { hcCardHtml, hcChip } from './history-card.js';
import { txEffectiveDate, txShowTime, txChronoCompare, ledgerEffectiveDate, pinOpeningDays } from './tx-date.js';
import { editDateValue } from './edit-date.js';
import { newGroupId, stampGroup, planEditSettlement, applySettlement, collectionCollected, planGoodsCredit } from './link-graph.js';
import { beginEditMode, endEditMode, getEditCtx, registerEditHandler, replaceRecord, stampEdit } from './edit-mode.js';
import { BRAND_LOGO_JPEG_BASE64 } from './constants.js';
import { _creatorBadgeHtml, _mergedBadgeHtml, _safeErr, _set_currentRepProfile, appMode, compareTimestamps, currentRepProfile, debtDelta, ensureArray, ensureRecordIntegrity, esc, fmtAmt, fmtNum, generateUUID, getRecordTimestamp, getTimestamp, localDateStr, lockedUnitPrice, round2, safeNumber, salesRepsList, sqliteStore, validateUUID, oldDebtNote, selectedCustomerFilter, readNum, repairStoredRecords, loadCollections } from './business.js';
import { emitSyncUpdate, unifiedDelete, unifiedSave } from './sync.js';
import { _buildStatementText, _captureAutoTables, _exportDocAsImageAndOpenWhatsApp, _shareStatementText, getPersonPhoto, loadPersonPhotoIntoEditor, loadScript, notifyDataChange, renderPersonAvatarHTML, savePersonPhoto, triggerAutoSync, styleStatementRow } from './utilities-core.js';
import { BiometricAuth, formatCurrency, formatDisplayDate, formatDisplayDateTime, handleUniversalSearch, phoneActionHTML, processExpiredToChora, reverseExpiredFromChora } from './utilities-payments.js';
import { getCostPriceForStore, getSalePriceForStore, getRepGoodsCreditUnitPrice } from './factory.js';
import { periodTotals, periodQuantity, soldQuantity, collectionExpiredLeft } from './finance.js';
import { renderLedger, menuButtonHtml, resetLedgerFilter } from './cm-ledger.js';
import { rangeBounds, rangeLabel } from './stmt-range.js';
import { custSummaryHtml, runningBalanceHtml, _set_currentManagingRepCustomer, currentManagingRepCustomer, showGlassConfirm, showToast, fetchLocationInto } from './customers.js';
import { confirmGuard } from './confirm-guard.js';
import { rlRowHtml, rlEmptyHtml, rlJsArg, rlPhoto } from './record-list.js';
import { getDefaultStoreKey } from './store-keys.js';
export let repTransactionMode = 'sale';
window.repTransactionMode = repTransactionMode;
export function _set_repTransactionMode(v) { repTransactionMode = v; window.repTransactionMode = v; }
export let currentRepAnalyticsMode = 'day';
window.currentRepAnalyticsMode = currentRepAnalyticsMode;
export function _set_currentRepAnalyticsMode(v) { currentRepAnalyticsMode = v; window.currentRepAnalyticsMode = v; }

(window.__uiSyncers = window.__uiSyncers || []).push(() => {
  try { const v = window.currentRepAnalyticsMode; if (v !== undefined) currentRepAnalyticsMode = v; } catch (_) {}
  try { const v = window.repTransactionMode; if (v !== undefined) repTransactionMode = v; } catch (_) {}
});

const _bioIsOn = (v) => v === true || v === 'true';

export async function syncBiometricButton() {
const btn = document.getElementById('bio-toggle-btn');
if (!btn) return;
let on = false;
try { on = _bioIsOn(await sqliteStore.get('bio_enabled')); } catch (_) {}
const lbl = document.getElementById('bio-toggle-label');
if (lbl) lbl.textContent = on ? 'Disable Fingerprint Lock' : 'Enable Fingerprint Lock';
btn.classList.toggle('active', on);
btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

export async function toggleBiometricLock() {
let on = false;
try { on = _bioIsOn(await sqliteStore.get('bio_enabled')); } catch (_) {}
if (on) await disableBiometricLock();
else await enableBiometricLock();
await syncBiometricButton();
}

export async function enableBiometricLock() {
try {
const success = await BiometricAuth.register("Manager");
if (success) {
if (window.__setBioHint) window.__setBioHint(true);
showToast("Biometric Lock Enabled! ", "success");
await syncBiometricButton();
}
} catch (e) {
if (!(e && e.name === 'NotAllowedError')) showToast("Setup failed: " + e.message, "error");
}
}

export async function disableBiometricLock() {
const _bioMsg = `Remove the biometric (fingerprint / Face ID) lock from this app?\n\nAfter removal:\n • Anyone with access to this device can open the app without biometric verification\n • To re-enable, tap Fingerprint Lock in the sidebar again\n\nYour data will not be affected.`;
if (await showGlassConfirm(_bioMsg, { title: "Remove Biometric Lock", confirmText: "Remove Lock", danger: true })) {
await sqliteStore.set('bio_enabled', 'false');
await sqliteStore.remove('bio_cred_id');
window.__appLocked = false;
if (window.__setBioHint) window.__setBioHint(false);
try { await sqliteStore.flush(); } catch (_) {}
await syncBiometricButton();
}
}

export async function checkBiometricLock() {
const isEnabled = await sqliteStore.get('bio_enabled');
syncBiometricButton();
const resolved = () => { window.__lockResolved = true; if (typeof window.__splashTryHide === 'function') window.__splashTryHide(); };
if (!(isEnabled === 'true' || isEnabled === true)) { window.__appLocked = false; if (window.__setBioHint) window.__setBioHint(false); resolved(); return; }
if (window.__setBioHint) window.__setBioHint(true);
const splash = document.getElementById('splash-screen');
if (!splash) { resolved(); return; }
window.__appLocked = true;
window.__lockResolved = true;
splash.classList.add('splash-locked');
const isNativeApp = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const whenSettled = () => new Promise(resolve => {
const started = Date.now();
const ready = () => window.__splashPainted && (!isNativeApp || window.__nativeSplashHidden);
const tick = () => {
if (ready() || Date.now() - started > 3000) { setTimeout(resolve, 350); return; }
setTimeout(tick, 60);
};
tick();
});
let busy = false;
let failures = 0;
let retryTimer = null;
const scheduleRetry = (delay) => {
if (retryTimer) clearTimeout(retryTimer);
retryTimer = setTimeout(() => { retryTimer = null; unlock(); }, delay);
};
const unlock = async () => {
if (busy || !window.__appLocked) return;
busy = true;
try {
await BiometricAuth.authenticate();
window.__appLocked = false;
failures = 0;
if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
splash.classList.remove('splash-locked');
splash.classList.add('splash-out');
window.setStyle(splash, 'pointer-events', 'st-pointer-events__8b1364');
if (window.__restoreThemeColor) window.__restoreThemeColor();
setTimeout(() => { window.setDisplay(splash, 'none'); }, 620);
} catch (e) {
const errName = e && e.name ? e.name : '';
failures++;
if (errName !== 'NotAllowedError' && failures === 1) {
window.notifyBlocking((e && e.message) ? e.message : 'Authentication failed', 'error', 'Something went wrong');
}
if (failures < 5) scheduleRetry(errName === 'NotAllowedError' ? 1200 : 2000);
} finally {
busy = false;
}
};
window.triggerUnlock = unlock;
if (!splash.__unlockBound) {
splash.__unlockBound = true;
document.addEventListener('visibilitychange', () => {
if (document.visibilityState === 'visible' && window.__appLocked) { failures = 0; scheduleRetry(250); }
});
}
whenSettled().then(unlock);
}

function _resetRepForm() {
['rep-cust-name', 'rep-quantity', 'rep-amount-collected', 'rep-expired-qty', 'rep-new-cust-phone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
const pc = document.getElementById('rep-new-customer-phone-container'); if (pc) pc.classList.add('hidden');
setRepMode('sale');
}

export async function startEditRepSale(id) {
const rep = ensureArray(await sqliteStore.get('rep'));
const rec = rep.find(s => s && String(s.id) === String(id));
if (!rec || rec.isMerged) { showToast('This entry cannot be edited.', 'warning'); return; }
{
const _blk = await getSaleBlockReason(rec.id, 'rep', { forEdit: true });
if (_blk) { window.notifyBlocking(_blk, 'warning', 'Warning'); return; }
}
if (rec.transactionType === 'OLD_DEBT') { showToast('Opening balances are edited from the customer details.', 'warning'); return; }
if (typeof showTab === 'function') showTab('rep');
const isColl = rec.paymentType === 'COLLECTION' || rec.paymentType === 'PARTIAL_PAYMENT';
setRepMode(isColl ? 'collection' : 'sale');
const set = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v; };
set('rep-date', editDateValue(rec));
set('rep-cust-name', rec.customerName || '');
if (isColl) {
set('rep-amount-collected', collectionCollected(rec));
set('rep-expired-qty', Number(rec.expiredQty) > 0 ? rec.expiredQty : '');
} else {
set('rep-quantity', rec.quantity);
window.selectRepPaymentType(document.getElementById(rec.paymentType === 'CASH' ? 'btn-rep-pay-cash' : 'btn-rep-pay-credit'), rec.paymentType === 'CASH' ? 'CASH' : 'CREDIT');
}
if (rec.customerPhone) {
const pc = document.getElementById('rep-new-customer-phone-container'); if (pc) pc.classList.remove('hidden');
set('rep-new-cust-phone', rec.customerPhone);
}
beginEditMode('repsale', rec, { buttonId: 'btn-save-rep-transaction', watchIds: ['rep-cust-name','rep-quantity','rep-amount-collected','rep-expired-qty','rep-date','rep-new-cust-phone'], label: 'Update Transaction', anchorId: 'rep-cust-name', cancelFn: _resetRepForm });
}

registerEditHandler('repsale', startEditRepSale);

export function setRepMode(mode) {
repTransactionMode = mode; window.repTransactionMode = repTransactionMode;
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
updateRepCollectionPreview();
}
}

export function selectRepCustomer(name) {
document.getElementById('rep-cust-name').value = name;
document.getElementById('rep-customer-search-results').classList.add('hidden');
calculateRepCustomerStats(name);
}

window._selectRepCustomerBase = selectRepCustomer;

export async function calculateRepCustomerStatsForDisplay(name) {
calculateRepCustomerStats(name);
}

export async function calculateRepCustomerStats(name) {
const { rep } = await loadCollections('rep');
if(salesRepsList.includes(name)) {
document.getElementById('rep-customer-info-display').classList.add('hidden');
showToast("Cannot create transaction with representative name", "warning");
return;
}
const history = rep.filter(s =>
s && s.customerName && s.customerName.toLowerCase() === name.toLowerCase() &&
s.salesRep === currentRepProfile
);
let debt = 0;
history.forEach(h => { debt = round2(debt + debtDelta(h, h.totalValue)); });
debt = Math.max(0, debt);
const _repCred = document.getElementById('rep-customer-current-credit');
if (_repCred) _repCred.innerText = "" + fmtAmt(safeNumber(debt, 0));
const _repInfo = document.getElementById('rep-customer-info-display');
if (_repInfo) _repInfo.classList.remove('hidden');
if(repTransactionMode === 'collection') {
updateRepCollectionPreview(debt);
}
}

let _repPreviewSeq = 0;
export function updateRepCollectionPreview(debtOverride) {
if (repTransactionMode !== 'collection') return;
const seq = ++_repPreviewSeq;
const _credEl = document.getElementById('rep-customer-current-credit');
const debt = (typeof debtOverride === 'number')
? debtOverride
: parseFloat((_credEl?.innerText || '0').replace(/[^0-9.-]/g, '')) || 0;
const inputAmt = parseFloat(document.getElementById('rep-amount-collected')?.value) || 0;
const expired = parseFloat(document.getElementById('rep-expired-qty')?.value) || 0;
const paint = (remaining) => {
const _repTV = document.getElementById('rep-total-value');
if (_repTV) _repTV.innerText = '' + fmtAmt(safeNumber(remaining, 0));
};
paint(Math.max(0, debt - inputAmt));
if (expired <= 0) return;
(async () => {
try {
const who = (document.getElementById('rep-cust-name')?.value || '').trim();
const unit = await getRepGoodsCreditUnitPrice(currentRepProfile, who);
const plan = planGoodsCredit(expired, unit, Math.max(0, debt - inputAmt));
if (seq !== _repPreviewSeq || repTransactionMode !== 'collection') return;
paint(Math.max(0, round2(debt - inputAmt - plan.value)));
} catch (_) {}
})();
}

export async function calculateRepSalePreview() {
if(repTransactionMode === 'sale') {
const qty = readNum('rep-quantity');
const salePrice = await getSalePriceForStore(getDefaultStoreKey());
const _repTVS = document.getElementById('rep-total-value');
if (_repTVS) _repTVS.innerText = "" + fmtAmt(safeNumber(qty * salePrice, 0));
}
}

export function saveRepTransaction(...a) { return confirmGuard('saveRepTransaction', () => _saveRepTransactionRaw(...a), { label: 'Rep Sale', late: true, fields: [['rep-date', 'Date'], ['rep-cust-name', 'Customer'], ['rep-quantity', 'Quantity'], ['rep-amount-collected', 'Collected'], ['rep-expired-qty', 'Expired (kg)']], editKinds: ['repsale'], share: { kind: 'rep' } }); }

async function _saveRepTransactionRaw() {
const _ed = getEditCtx('repsale');
let _gcWarn = null;
const rep = ensureArray(await sqliteStore.get('rep'));
let clients = ensureArray(await sqliteStore.get('clients'));
const submitBtn = document.querySelector('#rep-new-transaction-card .btn-main');
if (submitBtn) {
if (submitBtn.disabled) return;
submitBtn.disabled = true;
}
async function restoreBtn() {
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
window.notifyBlocking("Date and Name required", 'warning', 'Warning');
restoreBtn();
return;
}
let gpsCoords = null;
const _gpsBgPromise = Promise.race([
  getPosition(),
  new Promise(resolve => setTimeout(() => resolve(null), 10000))
]).catch(() => null);
const now = new Date();
const timeString = now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', hour12: true});
const costPerKg = await getCostPriceForStore(getDefaultStoreKey(), date);
const salePrice = await getSalePriceForStore(getDefaultStoreKey());
let transactionRecord = {};
let _expiredQty = 0, _expiredValue = 0, _expUnit = 0;
if(repTransactionMode === 'sale') {
const qty = readNum('rep-quantity');
const payType = document.getElementById('rep-payment-value').value;
if(qty <= 0) {
window.notifyBlocking("Enter Quantity", 'warning', 'Warning');
restoreBtn();
return;
}
if(!salePrice || salePrice <= 0) {
window.notifyBlocking(" Sale price not configured. Set prices in Factory Formulas before recording rep sales.", 'warning', 'Warning');
restoreBtn();
return;
}
if(costPerKg < 0) {
window.notifyBlocking(" Invalid cost price detected. Please check Factory Formulas.", 'warning', 'Warning');
restoreBtn();
return;
}
const _lockedPrice = (_ed && _ed.original.unitPrice > 0) ? _ed.original.unitPrice : salePrice;
const _lockedCost = (_ed && _ed.original.quantity > 0) ? (_ed.original.totalCost || 0) / _ed.original.quantity : costPerKg;
const totalValue = qty * _lockedPrice;
const computedProfit = totalValue - (qty * _lockedCost);
if(computedProfit < 0) {
window.notifyBlocking(` This sale would result in a loss of ${fmtAmt ? fmtAmt(Math.abs(computedProfit)) : fmtNum(Math.abs(computedProfit))}. Check sale price vs cost price in Factory Formulas.`, 'warning', 'Warning');
restoreBtn();
return;
}
let saleId = _ed ? _ed.id : generateUUID('sale');
if (!validateUUID(saleId)) {
saleId = generateUUID('sale');
}
transactionRecord = {
id: saleId,
date: date,
time: timeString,
customerName: name,
customerPhone: phoneNumber,
quantity: qty,
supplyStore: getDefaultStoreKey(),
paymentType: payType,
salesRep: currentRepProfile,
gps: gpsCoords,
totalCost: qty * _lockedCost,
totalValue: totalValue,
profit: totalValue - (qty * _lockedCost),
unitPrice: _lockedPrice,
creditReceived: (payType === 'CASH'),
createdAt: getTimestamp(),
updatedAt: getTimestamp(),
timestamp: getTimestamp(),
affectsInventory: false,
syncedAt: new Date().toISOString()
};
transactionRecord = ensureRecordIntegrity(transactionRecord, false);
} else {
const amount = readNum('rep-amount-collected');
const expired = round2(readNum('rep-expired-qty'));
if(amount < 0 || expired < 0) {
window.notifyBlocking("Amount and expired quantity cannot be negative.", 'warning', 'Warning');
restoreBtn();
return;
}
if(amount <= 0 && expired <= 0) {
window.notifyBlocking("Please enter an amount collected and/or an expired quantity.", 'warning', 'Warning');
restoreBtn();
return;
}
let _repOutstanding = 0;
try {
const _repHistory = rep.filter(s =>
s && !(_ed && s.id === _ed.id) && s.customerName && s.customerName.toLowerCase() === name.toLowerCase() &&
s.salesRep === currentRepProfile
);
for (const h of _repHistory) _repOutstanding = round2(_repOutstanding + debtDelta(h, parseFloat(h.totalValue) || 0));
if (_ed && Array.isArray(_ed.original.allocations)) _repOutstanding = round2(_repOutstanding + _ed.original.allocations.reduce((t, a) => t + (Number(a.amount) || 0), 0));
_repOutstanding = Math.max(0, _repOutstanding);
} catch (_e) { _repOutstanding = -1; }
if (amount > 0 && _repOutstanding === 0 && !_ed) {
window.notifyBlocking(`${name} has no outstanding credit balance. Collections can only be recorded against existing unpaid credit.`, 'error', 'Credit error');
restoreBtn();
return;
} else if (amount > 0 && _repOutstanding >= 0 && amount > _repOutstanding) {
const _overAmt = amount - _repOutstanding;
_gcWarn = { lines: [`Owes: ${fmtAmt ? fmtAmt(_repOutstanding) : _repOutstanding}`, `Collecting: ${fmtAmt ? fmtAmt(amount) : amount}`, `Overpayment: ${fmtAmt ? fmtAmt(_overAmt) : _overAmt}`], warning: 'Proceed only if this is an advance payment.', confirmText: 'Collect Anyway' };
}
_expiredQty = expired;
if (expired > 0) {
_expUnit = await getRepGoodsCreditUnitPrice(currentRepProfile, name, _ed ? _ed.id : null);
const _gp = planGoodsCredit(expired, _expUnit, _repOutstanding >= 0 ? Math.max(0, _repOutstanding - amount) : -1);
_expiredValue = _gp.value;
_gcWarn = { ...(_gcWarn || {}), notes: [`Expired ${fmtNum(expired)} kg will be added to CHORA raw material.`, _expiredValue > 0
? `Expired goods credited: ${fmtAmt(_expiredValue)} (${fmtNum(expired)} kg × ${fmtAmt(_expUnit)}) will be deducted from ${name}'s balance${_gp.capped ? ' (limited to what is owed)' : ''}. This is not cash.`
: `No balance is owed, so the expired goods are recorded without a credit.`] };
}
let collId = _ed ? _ed.id : generateUUID('sale');
if (!validateUUID(collId)) {
collId = generateUUID('sale');
}
transactionRecord = {
id: collId,
date: date,
time: timeString,
customerName: name,
customerPhone: phoneNumber,
quantity: 0,
supplyStore: getDefaultStoreKey(),
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
affectsInventory: false,
syncedAt: new Date().toISOString()
};
if (expired > 0) transactionRecord.expiredQty = expired;
if (_expiredValue > 0) { transactionRecord.expiredValue = _expiredValue; transactionRecord.expiredUnitPrice = _expUnit; }
transactionRecord = ensureRecordIntegrity(transactionRecord, false);
}
if (_ed && _ed.original.paymentType === 'PARTIAL_PAYMENT' && _ed.original.relatedSaleId && Math.abs((_ed.original.totalValue || 0) - (transactionRecord.totalValue || 0)) > 0.001) {
window.notifyBlocking('This payment is linked to a credit sale. Delete it and record a new one instead of changing the amount.', 'warning', 'Credit warning'); restoreBtn(); return;
}
let _repAlloc = null;
if (transactionRecord.paymentType === 'COLLECTION' && !(_ed && _ed.original.paymentType === 'PARTIAL_PAYMENT')) {
try {
_repAlloc = await applyCollectionToSales({ kind: 'rep', arr: rep, record: transactionRecord, amount: parseFloat(transactionRecord.totalValue) || 0, expiredValue: _expiredValue, name: transactionRecord.customerName, repName: currentRepProfile, original: _ed ? _ed.original : null, when: { date: transactionRecord.date, time: timeString }, getGross: async (s) => parseFloat(s.totalValue) || 0 });
} catch (_allocErr) { window.notifyBlocking(_allocErr.message || 'Could not apply this collection to the sales.', 'warning', 'Warning'); restoreBtn(); return; }
}
const _linkIssue = _ed ? await getSaleEditLinkIssue('rep', _ed.original, transactionRecord) : null;
if (_linkIssue) { if (_repAlloc) _repAlloc.undo(); window.notifyBlocking(_linkIssue, 'warning', 'Warning'); restoreBtn(); return; }
if (transactionRecord.paymentType === 'CREDIT' && !_gcWarn) {
let _rcOwed = 0;
for (const h of rep) {
if (h && !(_ed && h.id === _ed.id) && h.customerName && h.customerName.toLowerCase() === String(transactionRecord.customerName || '').toLowerCase() && h.salesRep === currentRepProfile) _rcOwed = round2(_rcOwed + debtDelta(h, parseFloat(h.totalValue) || 0));
}
_rcOwed = Math.max(0, _rcOwed);
if (_rcOwed > 5000) {
const _rcSale = parseFloat(transactionRecord.totalValue) || 0;
_gcWarn = { lines: [`Unpaid balance: ${fmtAmt ? fmtAmt(_rcOwed) : _rcOwed}`, `This credit sale: ${fmtAmt ? fmtAmt(_rcSale) : _rcSale}`, `New total: ${fmtAmt ? fmtAmt(_rcOwed + _rcSale) : _rcOwed + _rcSale}`], warning: `${transactionRecord.customerName} already has unpaid credit. Collect it before adding more.`, confirmText: 'Add Credit Anyway' };
}
}
if (!(await window.gcCommit(_gcWarn || {}))) { if (_repAlloc) _repAlloc.undo(); restoreBtn(); return; }
const _origExp = _ed ? (Number(_ed.original.expiredQty) || 0) : 0;
const _origApplied = (_origExp > 0 && _ed.original.expiredApplied !== false) ? _origExp : 0;
const _expDelta = transactionRecord.paymentType === 'COLLECTION' ? round2(_expiredQty - _origApplied) : 0;
let _choraAdded = 0, _choraRemoved = 0, _choraOk = true;
const _undoChora = async () => {
try {
if (_choraAdded > 0) await reverseExpiredFromChora(_choraAdded, transactionRecord.date);
else if (_choraRemoved > 0) await processExpiredToChora(_choraRemoved, transactionRecord.date, name);
} catch (_) {}
_choraAdded = 0; _choraRemoved = 0;
};
try {
if (_expDelta > 0) {
_choraOk = !!(await processExpiredToChora(_expDelta, transactionRecord.date, name));
if (_choraOk) _choraAdded = _expDelta;
} else if (_expDelta < 0) {
const _choraBlock = await getExpiredDeleteBlockReason({ expired: -_expDelta, expiredApplied: true });
if (_choraBlock) { if (_repAlloc) _repAlloc.undo(); window.notifyBlocking(_choraBlock, 'warning'); restoreBtn(); return; }
await reverseExpiredFromChora(-_expDelta, transactionRecord.date);
_choraRemoved = -_expDelta;
}
} catch (_choraErr) {
await _undoChora();
if (_repAlloc) _repAlloc.undo();
window.notifyBlocking('Could not update CHORA raw material: ' + ((_choraErr && _choraErr.message) || 'unknown error'), 'error');
restoreBtn(); return;
}
if (_expiredQty > 0) transactionRecord.expiredApplied = _expDelta > 0 ? _choraOk : true;
if (_ed) {
const o = _ed.original;
stampEdit(transactionRecord, o);
if (transactionRecord.paymentType === 'CREDIT' || transactionRecord.paymentType === 'CASH') applySettlement(transactionRecord, planEditSettlement(o, transactionRecord.paymentType));
transactionRecord.time = o.time;
transactionRecord.gps = o.gps || transactionRecord.gps;
transactionRecord.salesRep = o.salesRep;
if (o.partialPaymentReceived) transactionRecord.partialPaymentReceived = o.partialPaymentReceived;
ensureRecordIntegrity(transactionRecord, true);
replaceRecord(rep, transactionRecord);
} else {
rep.push(transactionRecord);
}
try {
if (_repAlloc && _repAlloc.changedIds.length) await unifiedSave('rep', rep, null, _repAlloc.changedIds);
await unifiedSave('rep', rep, transactionRecord);
} catch (_saveErr) { await _undoChora(); if (_repAlloc) _repAlloc.undo(); throw _saveErr; }
void _gpsBgPromise.then(async coords => {
  if (!coords) return;
  try {
    const allSales = ensureArray(await sqliteStore.get('rep'));
    const idx = allSales.findIndex(s => s.id === transactionRecord.id);
    if (idx !== -1 && !allSales[idx].gps) {
      allSales[idx].gps = coords;
      allSales[idx].updatedAt = getTimestamp();
      await unifiedSave('rep', allSales, allSales[idx]);
    }
    autoUpdateCustomerLocation(name, coords).catch(() => {});
  } catch (_gpsErr) { console.warn('Background GPS patch failed:', _safeErr(_gpsErr)); }
}).catch(() => {});
try {
const _rcName = transactionRecord.customerName;
const _rcPhone = transactionRecord.customerPhone || '';
if (_rcName && _rcName.trim()) {
const existsInRepRegistry = Array.isArray(clients) && clients.some(c => c && c.name && c.name.toLowerCase() === _rcName.toLowerCase() && (c.salesRep === currentRepProfile || !c.salesRep));
if (!existsInRepRegistry) {
const _rcContact = { id: generateUUID('rep_cust'), name: _rcName, phone: _rcPhone, address: '', oldDebit: 0, salesRep: currentRepProfile, createdAt: getTimestamp(), updatedAt: getTimestamp(), timestamp: getTimestamp() };
if (!Array.isArray(clients)) clients = [];
clients.push(_rcContact);
await unifiedSave('clients', clients, _rcContact);
}
}
} catch (_rcErr) { console.warn('Auto-register rep customer failed:', _safeErr(_rcErr)); }
notifyDataChange('rep');
if (navigator.onLine) {
emitSyncUpdate({ rep: null}).catch(e => {
});
}
document.getElementById('rep-quantity').value = '';
document.getElementById('rep-amount-collected').value = '';
{ const _xe = document.getElementById('rep-expired-qty'); if (_xe) _xe.value = ''; }
if (_expiredQty > 0 || _expDelta !== 0) { if (typeof window.renderFactoryInventory === 'function') window.renderFactoryInventory(); }
if(repTransactionMode === 'sale') {
const _custName = document.getElementById('rep-cust-name'); if (_custName) _custName.value = '';
const _custInfo = document.getElementById('rep-customer-info-display'); if (_custInfo) _custInfo.classList.add('hidden');
const _repTV1 = document.getElementById('rep-total-value'); if (_repTV1) _repTV1.innerText = '0';
} else {
const _custName2 = document.getElementById('rep-cust-name'); if (_custName2) _custName2.value = '';
const _custInfo2 = document.getElementById('rep-customer-info-display'); if (_custInfo2) _custInfo2.classList.add('hidden');
await setRepMode('sale');
}
if(phoneInput) phoneInput.value = '';
document.getElementById('rep-new-customer-phone-container').classList.add('hidden');
if (_ed) endEditMode();
renderRepCustomerTable();
renderRepHistory();
showToast(_ed ? "Transaction updated" : "Transaction Saved Successfully", "success");
if (typeof window.shareInvoiceAfterSave === 'function') window.shareInvoiceAfterSave('rep', { name, date, render: () => window.renderRepCustomerTransactions(name) });
setTimeout(updateRepLiveMap, 300);
} catch (error) {
window.notifyBlocking('Failed to save transaction. Please try again.', 'error', 'Something went wrong');
} finally {
restoreBtn();
}
}

export function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
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

export function deg2rad(deg) {
return deg * (Math.PI / 180);
}

export async function autoUpdateCustomerLocation(customerName, currentGps) {
const { clients, rep } = await loadCollections('clients', 'rep');
if (!currentGps || !currentGps.lat || !currentGps.lng) return;
const _lcAutoName = customerName.toLowerCase();
const contactIndex = clients.findIndex(c => {
if (!c || !c.name) return false;
if (c.name.toLowerCase() !== _lcAutoName) return false;
if (c.salesRep) return c.salesRep === currentRepProfile;
return rep.some(s => s && s.salesRep === currentRepProfile && s.customerName && s.customerName.toLowerCase() === _lcAutoName);
});
if (contactIndex === -1) return;
const contact = clients[contactIndex];
if (contact.locationConfirmed) return;
const isManualAddress = contact.address && contact.address.length > 5 && !contact.address.startsWith('GPS:');
if (isManualAddress) return;
const pastTransactions = rep.filter(sale =>
sale &&
sale.customerName &&
sale.customerName.toLowerCase() === customerName.toLowerCase() &&
sale.gps &&
sale.gps.lat &&
sale.gps.lng &&
sale.timestamp < Date.now() - 2000
).sort((a, b) => b.timestamp - a.timestamp);
if (pastTransactions.length < 3) return;
const CLUSTER_RADIUS_M = 150;
let clusterCount = 0;
let clusterLat = 0;
let clusterLng = 0;
for (const sale of pastTransactions) {
if (getDistanceFromLatLonInMeters(currentGps.lat, currentGps.lng, sale.gps.lat, sale.gps.lng) <= CLUSTER_RADIUS_M) {
clusterCount++;
clusterLat += sale.gps.lat;
clusterLng += sale.gps.lng;
}
if (clusterCount >= 3) break;
}
if (clusterCount < 3) return;
const avgLat = ((clusterLat + currentGps.lat) / (clusterCount + 1));
const avgLng = ((clusterLng + currentGps.lng) / (clusterCount + 1));
const coordsString = `GPS: ${safeNumber(avgLat, 0).toFixed(6)}, ${safeNumber(avgLng, 0).toFixed(6)}`;
clients[contactIndex].address = coordsString;
clients[contactIndex].locationConfirmed = true;
clients[contactIndex].updatedAt = getTimestamp();
ensureRecordIntegrity(clients[contactIndex], true);
await unifiedSave('clients', clients, clients[contactIndex]);
notifyDataChange('rep');
if (typeof showToast === 'function') {
showToast(`Location confirmed for ${customerName} after 3 consistent visits.`, 'success');
}
}

export let repMap = null;
export let repMapMarkers = [];
export let repPolyline = null;

export function getPosition() {
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
{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
);
});
}

export function initRepMap() {
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

export async function updateRepLiveMap() {
const rep = ensureArray(await sqliteStore.get('rep'));
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
const selectedDate = dateInput ? dateInput.value : localDateStr();
const dailyRoute = rep
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
let color = themeColor('--accent-blue');
let typeStr = 'Cash Sale';
let detailStr = `${fmtNum(txn.quantity)} kg`;
if (txn.paymentType === 'COLLECTION') {
color = themeColor('--accent');
typeStr = 'Collection';
detailStr = `${fmtAmt(txn.totalValue)}`;
} else if (txn.paymentType === 'CREDIT') {
color = themeColor('--warning');
typeStr = 'Credit Sale';
detailStr = `${fmtNum(txn.quantity)} kg (Credit)`;
}
const marker = L.circleMarker([lat, lng], {
radius: 8,
fillColor: color,
color: themeColor('--white'),
weight: 2,
opacity: 1,
fillOpacity: 0.8
})
.bindPopup(`
<strong>${txn.customerName}</strong><br>
<small>${txn.time}</small><br>
<span class="dc-color st-font-weight__bff3d1" style="--d-color: ${color}">${typeStr}</span>: ${detailStr}
`);
marker.addTo(repMap);
repMapMarkers.push(marker);
}
});
if (latLngs.length > 1) {
repPolyline = L.polyline(latLngs, {
color: themeColor('--accent-blue'),
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

export function adminSwitchRepProfile(newProfile) {
if (appMode !== 'admin') return;
_set_currentRepProfile(newProfile);
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

export function setRepAnalyticsMode(mode) {
currentRepAnalyticsMode = mode; window.currentRepAnalyticsMode = currentRepAnalyticsMode;
document.querySelectorAll('#admin-rep-analytics .toggle-group .toggle-opt').forEach(opt => {
opt.classList.remove('active');
});
document.getElementById(`rep-analytics-${mode}-btn`).classList.add('active');
calculateRepAnalytics();
}

export async function calculateRepAnalytics() {
const { rep } = await loadCollections('rep');
if (appMode !== 'admin') return;
const adminDateInput = document.getElementById('admin-rep-date');
const selectedDate = (adminDateInput && adminDateInput.value) || localDateStr();
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
rep.forEach(sale => {
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
if (collectionsEl) collectionsEl.textContent = `${fmtAmt(collections)}`;
if (cashSalesEl) cashSalesEl.textContent = `${fmtAmt(cashSales)}`;
if (creditSalesEl) creditSalesEl.textContent = `${fmtAmt(creditSales)}`;
const cashInEl = document.getElementById('rep-analytics-cash-in');
if (cashInEl) cashInEl.textContent = `${fmtAmt(collections + cashSales)}`;
const repBarEl = document.getElementById('rep-analytics-bar');
if (repBarEl) repBarEl.innerHTML = smBarHtml([
{ label: 'Collections', value: collections, text: fmtAmt(collections), tone: 'good' },
{ label: 'Cash sales', value: cashSales, text: fmtAmt(cashSales), tone: 'info' },
{ label: 'Credit sales', value: creditSales, text: fmtAmt(creditSales), tone: 'warn' }
]);
}

export async function renderRepCustomerTable(page = 1) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const _rrctAlive = (item) => item && item.id && !deletedRecordIds.has(String(item.id));
const rep = ensureArray(await sqliteStore.get('rep')).filter(_rrctAlive);
const clients = ensureArray(await sqliteStore.get('clients')).filter(_rrctAlive);
const tbody = document.getElementById('rep-customers-table-body');
if (!tbody) {
return;
}
try {
const freshRepCustomersList = await sqliteStore.get('clients', []);
if (Array.isArray(freshRepCustomersList) && freshRepCustomersList.length > 0) {
const repRegMap = new Map(freshRepCustomersList.map(c => [c.id, c]));
if (Array.isArray(clients)) {
clients.forEach(c => { if (c && c.id && !repRegMap.has(c.id)) repRegMap.set(c.id, c); });
}
const mergedRepCustomers = Array.from(repRegMap.values());
}
} catch (repRegError) {
console.warn('Rep registry refresh failed, using in-memory:', _safeErr(repRegError));
}
const filterInput = document.getElementById('rep-filter');
const filter = filterInput ? filterInput.value.toLowerCase() : '';
let activeRepSales = rep;
try {
const freshRepSales2 = await sqliteStore.get('rep', []);
if (Array.isArray(freshRepSales2) && freshRepSales2.length > 0) {
const recordMap2 = new Map(freshRepSales2.filter(s => s && s.id).map(s => [s.id, s]));
rep.forEach(s => { if (s && s.id && !recordMap2.has(s.id)) recordMap2.set(s.id, s); });
activeRepSales = Array.from(recordMap2.values());
}
} catch (_e) {  }
const myData = activeRepSales.filter(s =>
s.salesRep === currentRepProfile
);
const custMap = {};
myData.forEach(s => {
if(!custMap[s.customerName]) custMap[s.customerName] = { debt: 0, qty: 0 };
custMap[s.customerName].qty = round2(custMap[s.customerName].qty + periodQuantity([{ t: s }]));
custMap[s.customerName].debt = round2(custMap[s.customerName].debt + debtDelta(s, s.totalValue));
});
const sortedCustomers = Object.keys(custMap).sort();
if (Array.isArray(clients)) {
const custMapNames = new Set(Object.keys(custMap).map(n => n.toLowerCase()));
const repSalesNamesForProfile = new Set(
(Array.isArray(rep) ? rep : [])
.filter(s => s && s.salesRep === currentRepProfile && s.customerName)
.map(s => s.customerName.toLowerCase())
);
clients.forEach(rc => {
if (!rc || !rc.name || !rc.name.trim()) return;
if (rc.salesRep && rc.salesRep !== currentRepProfile) return;
if (!rc.salesRep && !repSalesNamesForProfile.has(rc.name.toLowerCase())) return;
const lcName = rc.name.toLowerCase();
if (custMapNames.has(lcName)) return;
custMap[rc.name] = { debt: 0, qty: 0 };
sortedCustomers.push(rc.name);
custMapNames.add(lcName);
});
sortedCustomers.sort();
}
const filteredCustomers = sortedCustomers.filter(name => {
if (!filter) return true;
return name && typeof name === 'string' && name.toLowerCase().includes(filter);
});
const totalItems = filteredCustomers.length;
if (!filteredCustomers || !Array.isArray(filteredCustomers) || !custMap) {
tbody.innerHTML = rlEmptyHtml('Customer data is invalid', 'Reload the app and try again.');
} else if (totalItems === 0) {
if (Object.keys(custMap).length === 0) {
tbody.innerHTML = rlEmptyHtml('No customers yet', 'Add your first sale or tap the add button to get started.');
} else {
tbody.innerHTML = rlEmptyHtml('No customers match your search', 'Try a different name.');
}
} else {
const latestByName = new Map();
rep.forEach(s => {
if (!s || s.salesRep !== currentRepProfile || !s.customerName) return;
const cur = latestByName.get(s.customerName);
if (!cur || (s.timestamp || 0) > (cur.timestamp || 0)) latestByName.set(s.customerName, s);
});
const _rlPhotos = (await sqliteStore.get('photos')) || {};
const buildRepCustomerRow = (name) => {
const customerData = custMap[name];
const latest = latestByName.get(name);
const dateText = latest?.date ? formatDisplayDate(latest.date) : '';
const repContact = clients.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase() && (c.salesRep === currentRepProfile || !c.salesRep));
const phone = repContact?.phone || latest?.customerPhone || '';
const owes = customerData.debt > 0.005;
return rlRowHtml({
name,
photo: rlPhoto(_rlPhotos, 'rep-cust:' + (currentRepProfile || '') + ':' + name.toLowerCase()),
tone: customerData.debt > 1 ? 'warn' : 'clear',
details: [
phone ? phoneActionHTML(phone) : '<span class="rl-muted">No phone</span>',
customerData.qty > 0 ? `<span class="rl-muted">${fmtNum(customerData.qty)} kg sold</span>` : '',
dateText ? `<span class="rl-muted">Last ${esc(dateText)}</span>` : ''
],
amount: fmtAmt(Math.max(0, customerData.debt)),
tag: owes ? 'Owes' : 'Settled',
onOpen: `openRepCustomerManagement('${rlJsArg(name)}')`
});
};
tbody.innerHTML = filteredCustomers.map(buildRepCustomerRow).join('');
}
let repTotalCreditSales = 0;
let repTotalCollections = 0;
myData.forEach(s => {
if (s.paymentType === 'CREDIT') {
repTotalCreditSales += (s.totalValue || 0);
} else if (s.paymentType === 'COLLECTION' || s.paymentType === 'PARTIAL_PAYMENT') {
repTotalCollections += collectionCollected(s);
}
});
const totalOutstanding = Object.values(custMap).reduce((sum, c) => sum + (c.debt > 0 ? c.debt : 0), 0);
const _setRepH = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setRepH('rep-customers-total-credit', fmtAmt(totalOutstanding));
_setRepH('rep-customers-total-credit-sales', fmtAmt(repTotalCreditSales));
_setRepH('rep-customers-total-collections', fmtAmt(repTotalCollections));
}

export async function openRepCustomerManagement(customerName) {
_set_currentManagingRepCustomer(customerName);
resetLedgerFilter('rep');
const _repS = document.getElementById('rep-cust-trans-search'); if (_repS) _repS.value = '';
const _repMCT = document.getElementById('repManageCustomerTitle'); if (_repMCT) _repMCT.innerText = customerName;
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('rep-customer-management-screen');
await renderRepCustomerTransactions(customerName);
}

export async function closeRepCustomerManagement() {
if (typeof window.closeCustomerTxnSheet === 'function') window.closeCustomerTxnSheet();
const rep = ensureArray(await sqliteStore.get('rep'));
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('rep-customer-management-screen');
_set_currentManagingRepCustomer(null);
setTimeout(async () => {
try {
const freshRepSales = await sqliteStore.get('rep', []);
if (Array.isArray(freshRepSales)) {
const m = new Map(freshRepSales.map(s => [s.id, s]));
if (Array.isArray(rep)) rep.forEach(s => { if (!m.has(s.id)) m.set(s.id, s); });
const _freshRepSales = Array.from(m.values());
await sqliteStore.set('rep', _freshRepSales);
}
} catch(e) {
showToast('Rep sales operation failed.', 'error');
console.warn('closeRepCustomerManagement SQLite error', _safeErr(e));
}
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
}, 100);
}

export async function deleteCurrentRepCustomer() {
const { rep, clients } = await loadCollections('rep', 'clients');
if (!currentManagingRepCustomer) return;
const name = currentManagingRepCustomer;
const txs = rep.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
for (const _t of txs) {
const _blk = await getSaleBlockReason(_t.id, 'rep', { ignoreChildren: true });
if (_blk) { window.notifyBlocking(`Cannot delete "${name}": ${_blk}`, 'warning', 'Action not allowed'); return; }
}
let totalDebt = 0;
for (const s of txs) totalDebt = round2(totalDebt + debtDelta(s, s.totalValue));
totalDebt = Math.max(0, totalDebt);
let msg = `Permanently delete rep customer "${name}"?`;
if (txs.length > 0) {
msg += `\n\n This customer has ${txs.length} transaction record${txs.length !== 1 ? 's' : ''} on file.`;
if (totalDebt > 0) msg += `\n Outstanding debt: ${fmtAmt(totalDebt)}`;
msg += `\n\nAll rep sales history for this customer will be permanently deleted.`;
}
msg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(msg, { title: 'Delete Rep Customer', confirmText: 'Delete Permanently', danger: true }))) return;
try {
const _lcDelName = name.toLowerCase();
const _repCustGroup = newGroupId('repcust');
const contactIdx = clients.findIndex(c => {
if (!c || !c.name) return false;
if (c.name.toLowerCase() !== _lcDelName) return false;
if (c.salesRep) return c.salesRep === currentRepProfile;
return rep.some(s => s && s.salesRep === currentRepProfile && s.customerName && s.customerName.toLowerCase() === _lcDelName);
});
if (contactIdx !== -1) {
const contactRecord = stampGroup(clients[contactIdx], _repCustGroup);
const contactId = contactRecord.id;
const filteredContacts = clients.filter((_, i) => i !== contactIdx);
await unifiedDelete('clients', filteredContacts, contactId, { strict: true }, contactRecord);
clients.splice(contactIdx, 1);
}
const repTxsToDelete = txs.slice();
let prunedRepSales = rep.slice();
for (const tx of repTxsToDelete) {
prunedRepSales = prunedRepSales.filter(s => s.id !== tx.id);
await unifiedDelete('rep', prunedRepSales, tx.id, { strict: true }, stampGroup(tx, _repCustGroup));
}
try {
const _rcPhKey = 'rep-cust:' + (currentRepProfile || '') + ':' + name.toLowerCase();
const _rcPh = (await sqliteStore.get('photos')) || {};
if (_rcPh[_rcPhKey] !== undefined) {
delete _rcPh[_rcPhKey];
await sqliteStore.set('photos', _rcPh);
const _rcPhTs = (await sqliteStore.get('photostamps')) || {};
delete _rcPhTs[_rcPhKey];
await sqliteStore.set('photostamps', _rcPhTs);
const _rcDk = (await sqliteStore.get('photodirty')) || [];
if (!_rcDk.includes(_rcPhKey)) _rcDk.push(_rcPhKey);
await sqliteStore.set('photodirty', _rcDk);
}
} catch(_rcPhErr) { console.warn('[deleteCurrentRepCustomer] photo cleanup failed', _rcPhErr); }
notifyDataChange('rep');
triggerAutoSync();
closeRepCustomerManagement();
} catch (e) {
window.notifyBlocking('Failed to delete rep customer. Please try again.', 'error', 'Something went wrong');
}
}

export async function renderRepCustomerTransactions(name) {
const { rep, clients } = await loadCollections('rep', 'clients');
const list = document.getElementById('repCustomerManagementHistoryList');
if (!list) return;
let transactions = [];
try {
const dbSales = await sqliteStore.get('rep', []);
if (Array.isArray(dbSales)) {
const recordMap = new Map(dbSales.filter(s => s && s.id).map(s => [s.id, s]));
if (Array.isArray(rep)) rep.forEach(s => { if (s && s.id && !recordMap.has(s.id)) recordMap.set(s.id, s); });
const mergedTx = Array.from(recordMap.values());
transactions = mergedTx.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
} else {
transactions = rep.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
}
} catch (e) {
console.error('Rep sales operation failed.', _safeErr(e));
showToast('Rep sales operation failed.', 'error');
transactions = rep.filter(s => s.customerName === name && s.salesRep === currentRepProfile);
}
const _repDelta = (t) => debtDelta(t, t.totalValue);
const _runBal = new Map();
const _deltaMap = new Map();
let _gAll = 0, _rAll = 0;
let _runTotal = 0;
const _ascTx = transactions.map((t, i) => ({ t, i })).sort((a, b) => txChronoCompare(a.t, b.t) || (a.i - b.i));
for (const { t } of _ascTx) {
const _dl = _repDelta(t);
_deltaMap.set(t, _dl);
if (_dl > 0) _gAll += _dl; else _rAll -= _dl;
_runTotal = round2(_runTotal + _dl);
_runBal.set(t, _runTotal);
}
const repContacts = clients;
const contact = repContacts.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase() && c.salesRep === currentRepProfile)
  || repContacts.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase());
const phone = contact?.phone || transactions.find(t => t && t.customerPhone)?.customerPhone || '';
const address = contact?.address || '';
const _repHeaderPhoto = await getPersonPhoto('rep-cust:' + (currentRepProfile || '') + ':' + name.toLowerCase());
const _repAvatarHTML = renderPersonAvatarHTML(_repHeaderPhoto, 42);
const _repSafeName = esc(name).split("'").join("\\'");
const _repRows = transactions.map(t => ({ t, value: t.totalValue }));
const _repTotals = periodTotals(_repRows);
const headerTitle = document.getElementById('repManageCustomerTitle');
headerTitle.innerHTML = `
<div class="u-1043921 d-flex">
${_repAvatarHTML}
<div class="u-69f8e5a">
<div class="u-611b408 d-flex">
<span>${esc(name)}</span>
${menuButtonHtml('rep', _repSafeName)}
</div>
<div class="u-9e739fd">
${phone ? phoneActionHTML(phone) : 'No Phone'} ${address ? `|  ${esc(address)}` : ''}
</div>
</div>
</div>
`;
transactions.sort((a, b) => txChronoCompare(b, a));
const _nAll = transactions.length;
const _entries = [];
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
? `<span class="badge status-badge paid u-3b42672">SETTLED</span>`
: `<span class="badge status-badge pending u-3b42672">PENDING</span>`;
} else if (isCredit) {
if (hasPartialPayment) {
btnText = `PARTIAL (${await formatCurrency(effectiveDue)} due)`;
statusClass = 'partial';
}
toggleBtnHtml = `<span class="badge status-badge ${statusClass} u-77e4b99 st-pointer-events__8b1364">${btnText}</span>`;
}
const safeId = String(t.id).replace(/'/g, "\\'");
const panelId = `rp-${t.id}`;
const kebabBtn = t.isMerged
  ? `<button class="btn txn-kebab-btn" title="View pre-close details" onclick="_togglePreclosePanel(this,'${panelId}','${safeId}','rep','sale')">⋮</button>`
  : '';
const panelPlaceholder = t.isMerged ? `<div class="callout txn-preclose-panel" id="${panelId}"></div>` : '';
const _when = formatDisplayDateTime(txEffectiveDate(t), txShowTime(t) ? (t.time || null) : null);
let info = '';
let _price = 0;
let rTitle = '', rSub = '', rAmt = 0, rIn = false, rKind = 'cash', rCat = 'cash';
if (isPartialPayment || isCollection) {
const _pay = collectionCollected(t), _expV = Number(t.expiredValue) || 0;
const _hasPay = isPartialPayment || _pay > 0 || !(Number(t.expiredQty) > 0);
const _expText = _expV > 0 ? (Number(t.expiredUnitPrice) > 0 ? `${fmtNum(Number(t.expiredQty))} kg @${fmtAmt(Number(t.expiredUnitPrice))} = ${await formatCurrency(_expV)}` : await formatCurrency(_expV)) : '';
info = `
    <div class="u-fs-sm2 u-text-muted">${_when}${_mergedBadgeHtml(t, {inline:true})}</div>
    ${_hasPay ? `<div class="u-dbdd85e">Payment: ${await formatCurrency(_pay)}</div>` : ''}
    ${_expV > 0 ? `<div class="u-dbdd85e"><span class="u-expired-credit">Expired credit: ${_expText}</span></div>` : ''}
    ${(Number(t.expiredQty) > 0 && t.expiredApplied === false) ? `<div class="u-fs-sm2 u-text-warning">Expired / Damage: ${fmtNum(Number(t.expiredQty))} kg (CHORA not updated)</div>` : ''}
    <div class="u-5d1cf22 text-xs">${isPartialPayment ? 'Partial Payment' : (_hasPay ? (_expV > 0 ? 'Payment | Expired credit' : 'Bulk Payment') : 'Payment | Expired credit')}</div>
`;
rTitle = isPartialPayment ? 'Partial payment' : (_expV > 0 ? 'Payment | Expired credit' : 'Collection');
rSub = isPartialPayment ? 'Payment received' : (_expV > 0 ? `${fmtAmt(_pay)} | ${fmtNum(Number(t.expiredQty) || 0)} kg${Number(t.expiredUnitPrice) > 0 ? ` @${fmtAmt(Number(t.expiredUnitPrice))}` : ''}` : 'Bulk payment');
rAmt = _pay > 0 ? _pay : _expV; rIn = true; rKind = 'in'; rCat = 'pay';
} else if (isOldDebt) {
info = `
    <div class="u-fs-sm2 u-text-muted">
      <span class="badge old-debt-badge">OLD DEBT</span>${_mergedBadgeHtml(t, {inline:true})}
    </div>
    <div class="u-200c327">Previous Balance: ${await formatCurrency(t.totalValue)}</div>
    <div class="u-5d1cf22 text-xs">${esc(oldDebtNote(t.notes))}</div>
`;
rTitle = 'Old debt'; rSub = oldDebtNote(t.notes) || 'Previous balance';
rAmt = Number(t.totalValue) || 0; rKind = 'cr'; rCat = 'credit';
} else {
_price = lockedUnitPrice(t) > 0 ? lockedUnitPrice(t) : await getSalePriceForStore(t.supplyStore || getDefaultStoreKey());
info = `
    <div class="u-fs-sm2 u-text-muted">${_when}${_mergedBadgeHtml(t, {inline:true})}</div>
    <div class="u-d8853f1">${fmtNum(t.quantity)} kg @ ${await formatCurrency(_price)} = ${await formatCurrency(t.totalValue)}</div>
    ${hasPartialPayment ? `<div class="text-xs st-font-size__8e87b7 st-color__a4c6ac st-margin-top__7a21c6">Paid: ${await formatCurrency(partialPaid)}</div>` : ''}
`;
rTitle = isCredit ? 'Credit sale' : 'Cash sale';
rSub = `${fmtNum(t.quantity)} kg @ ${fmtAmt(_price)}`;
rAmt = Number(t.totalValue) || 0; rKind = isCredit ? 'cr' : 'cash'; rCat = isCredit ? 'credit' : 'cash';
}
const _dkey = txEffectiveDate(t) || 'undated';
const _bal = _runBal.get(t) || 0;
const _dl = _deltaMap.get(t) || 0;
let _debit = 0, _credit = 0;
if (_dl > 0.005) _debit = _dl; else if (_dl < -0.005) _credit = -_dl;
else if (rKind === 'cash' || (isCredit && t.creditReceived)) { _debit = rAmt; _credit = rAmt; }
const _isSale = !isOldDebt && !isCollection && !isPartialPayment;
_entries.push({
  id: t.id, qty: periodQuantity([{ t }]), dkey: _dkey, opening: !!(t.isMerged || t.transactionType === 'OLD_DEBT'), noDate: t.transactionType === 'OLD_DEBT', rTitle, rSub, rIn, rKind, rCat,
  tag: (t.isMerged || isCredit) ? toggleBtnHtml : '',
  amtText: await formatCurrency(rAmt),
  balText: _bal < -0.005 ? `${await formatCurrency(-_bal)} CR` : await formatCurrency(Math.max(0, _bal)),
  balTone: _bal > 0.005 ? 'is-debt' : 'is-clear',
  unpaid: isCredit && !t.creditReceived && !t.isMerged,
  kg: soldQuantity(t), sold: _isSale ? rAmt : 0, got: (isCollection || isPartialPayment) ? rAmt : 0,
  debit: _debit, credit: _credit, bal: _bal, isSettled: !!t.isSettled,
  row: { title: rTitle, amtText: await formatCurrency(rAmt), rIn, info, panelPlaceholder, kebabBtn, canEdit: !(t.isMerged || isOldDebt), canDelete: !t.isMerged, balHtml: await runningBalanceHtml(_bal), safeId: esc(t.id) }
});
}
await renderLedger('rep', { name, phone, entries: pinOpeningDays(_entries), summaryHtml: await custSummaryHtml(_repTotals, Math.max(0, _runTotal), periodQuantity(_repRows), _gAll, _rAll, _nAll, 'rep'), money: formatCurrency });
}

export async function openRepCustomerEditModal(customerName) {
customerName = customerName || '';
const isAddMode = !customerName;
const titleEl = document.getElementById('rep-cust-edit-screen-title');
const saveBtn = document.getElementById('rep-cust-edit-save-btn');
const nameInput = document.getElementById('rep-edit-cust-name');
const nameHint = document.getElementById('rep-cust-name-hint');
const nameLabel = document.getElementById('rep-cust-name-label');
if (titleEl) titleEl.textContent = isAddMode ? 'Add Customer' : 'Edit Rep Customer';
if (saveBtn) saveBtn.textContent = isAddMode ? 'Add Customer' : 'Update Customer';
if (isAddMode) {
nameInput.placeholder = 'Type name to search or add...';
nameInput.oninput = function() {
handleUniversalSearch('rep-edit-cust-name', 'rep-cust-add-search-results', 'clients');
};
if (nameLabel) nameLabel.textContent = 'Customer Name';
if (nameHint) nameHint.textContent = 'Search existing customers or type a new name to add.';
const searchResults = document.getElementById('rep-cust-add-search-results');
if (searchResults) searchResults.classList.add('hidden');
} else {
nameInput.placeholder = 'Customer name';
nameInput.oninput = null;
if (nameLabel) nameLabel.textContent = 'Customer Name';
if (nameHint) nameHint.textContent = 'Editing the name will update all records for this customer';
}
const { rep, clients } = await loadCollections('rep', 'clients');
nameInput.value = customerName;
nameInput.dataset.originalName = customerName;
if (!customerName) {
document.getElementById('rep-edit-cust-phone').value = '';
document.getElementById('rep-edit-cust-address').value = '';
document.getElementById('rep-edit-cust-old-debit').value = '';
const _repPhotoKey = 'rep-cust:' + (currentRepProfile || '') + ':';
await loadPersonPhotoIntoEditor('rep-cust', _repPhotoKey);
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('rep-customer-edit-screen');
return;
}
const contact = clients.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase() && c.salesRep === currentRepProfile)
  || clients.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase() && !c.salesRep);
const saleRecord = rep.find(s => s.customerName === customerName && s.salesRep === currentRepProfile && s.customerPhone);
const existingOldDebtTx = rep.find(s =>
s.customerName && s.customerName.toLowerCase() === customerName.toLowerCase() &&
s.transactionType === 'OLD_DEBT' &&
s.salesRep === currentRepProfile
);
const oldDebitValue = existingOldDebtTx ? (existingOldDebtTx.totalValue || 0) : (contact?.oldDebit || 0);
document.getElementById('rep-edit-cust-phone').value = contact?.phone || saleRecord?.customerPhone || '';
document.getElementById('rep-edit-cust-address').value = contact?.address || '';
document.getElementById('rep-edit-cust-old-debit').value = oldDebitValue;
const _repPhotoKey = 'rep-cust:' + (currentRepProfile || '') + ':' + customerName.toLowerCase();
await loadPersonPhotoIntoEditor('rep-cust', _repPhotoKey);
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('rep-customer-edit-screen');
}

export function closeRepCustomerEditModal() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('rep-customer-edit-screen');
}

export function saveRepCustomerDetails(...a) { return confirmGuard('saveRepCustomerDetails', () => _saveRepCustomerDetailsRaw(...a), { label: 'Customer', late: true, fields: [['rep-edit-cust-name', 'Name'], ['rep-edit-cust-phone', 'Phone'], ['rep-edit-cust-address', 'Address'], ['rep-edit-cust-old-debit', 'Old Debit']], isUpdate: () => !!(document.getElementById('rep-edit-cust-name') || {}).dataset.originalName }); }

async function _saveRepCustomerDetailsRaw() {
const { rep, clients } = await loadCollections('rep', 'clients');
const nameInput = document.getElementById('rep-edit-cust-name');
const name = nameInput.value.trim();
const originalName = nameInput.dataset.originalName || name;
const phone = document.getElementById('rep-edit-cust-phone').value.trim();
const address = document.getElementById('rep-edit-cust-address').value.trim();
const oldDebit = readNum('rep-edit-cust-old-debit');
if (!name) { window.notifyBlocking('Customer name is required', 'error', 'Something went wrong'); return; }
if (oldDebit < 0) { window.notifyBlocking('Old debt balance cannot be negative. Enter 0 to clear the balance.', 'warning', 'Warning'); return; }
if (!(await window.gcCommit({}))) return;
try {
const nameChanged = name.toLowerCase() !== originalName.toLowerCase();
const freshRepContacts = await sqliteStore.get('clients', []);
if (Array.isArray(freshRepContacts)) {
const m = new Map(freshRepContacts.map(c => [c.id, c]));
if (Array.isArray(clients)) clients.forEach(c => { if (!m.has(c.id)) m.set(c.id, c); });
const mergedRepC = Array.from(m.values());
await sqliteStore.set('clients', mergedRepC);
}
let contact = clients.find(c => c && c.name && c.name.toLowerCase() === originalName.toLowerCase() && c.salesRep === currentRepProfile);
if (!contact) contact = clients.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase() && c.salesRep === currentRepProfile);
if (!contact) contact = clients.find(c => c && c.name && c.name.toLowerCase() === originalName.toLowerCase() && !c.salesRep);
if (!contact) contact = clients.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase() && !c.salesRep);
const previousOldDebit = contact?.oldDebit || 0;
if (contact) {
if (!validateUUID(String(contact.id || ''))) { contact.id = generateUUID('rep_cust'); }
contact.name = name; contact.phone = phone; contact.address = address; contact.oldDebit = oldDebit;
contact.salesRep = currentRepProfile; contact.updatedAt = getTimestamp();
ensureRecordIntegrity(contact, true);
} else {
contact = { id: generateUUID('rep_cust'), name, phone, address, oldDebit, salesRep: currentRepProfile,
createdAt: getTimestamp(), updatedAt: getTimestamp(), timestamp: getTimestamp() };
clients.push(contact);
}
await unifiedSave('clients', clients, contact);
let salesArray = await sqliteStore.get('rep', []);
if (!Array.isArray(salesArray)) salesArray = [];
if (Array.isArray(rep) && rep.length > 0) {
const mSales = new Map(salesArray.map(s => [s.id, s]));
rep.forEach(s => { if (s && s.id && !mSales.has(s.id)) mSales.set(s.id, s); });
salesArray = Array.from(mSales.values());
}
const renamedRecords = [];
if (nameChanged) {
await recordCustomerRename('rep|' + currentRepProfile, originalName, name);
salesArray.forEach(s => {
if (s.customerName && s.customerName.toLowerCase() === originalName.toLowerCase() && s.salesRep === currentRepProfile) {
s.customerName = name;
renamedRecords.push(s);
}
});
}
const oldDebtIdx = salesArray.findIndex(s => s.customerName === name &&
s.transactionType === 'OLD_DEBT' && s.salesRep === currentRepProfile);
let oldDebtModified = false, oldDebtRecord = null, deletedOldDebtId = null;
if (oldDebit > 0) {
if (oldDebtIdx !== -1) {
const tx = salesArray[oldDebtIdx];
if (!validateUUID(String(tx.id || ''))) { tx.id = generateUUID('old_debt'); }
const amountChanged = tx.totalValue !== oldDebit;
tx.totalValue = oldDebit; tx.customerPhone = phone; tx.timestamp = getTimestamp();
tx.updatedAt = getTimestamp();
if (amountChanged) { tx.creditReceived = false; tx.partialPaymentReceived = 0; }
if (!tx.time) tx.time = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
ensureRecordIntegrity(tx, true);
oldDebtModified = true; oldDebtRecord = tx;
} else {
const tx = { id: generateUUID('old_debt'), date: localDateStr(),
customerName: name, customerPhone: phone, salesRep: currentRepProfile, quantity: 0,
supplyStore: 'N/A', paymentType: 'CREDIT', transactionType: 'OLD_DEBT',
totalValue: oldDebit, creditReceived: false, partialPaymentReceived: 0,
time: new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}),
timestamp: getTimestamp(), createdAt: getTimestamp(), updatedAt: getTimestamp(),
notes: 'Previous balance' };
salesArray.push(tx); oldDebtModified = true; oldDebtRecord = tx;
}
} else if (oldDebit === 0 && oldDebtIdx !== -1) {
const _repOldDebtRecordForDeletion = salesArray[oldDebtIdx];
deletedOldDebtId = _repOldDebtRecordForDeletion.id;
salesArray.splice(oldDebtIdx, 1); oldDebtModified = true;
if (deletedOldDebtId) { window._repOldDebtRecordForDeletion = _repOldDebtRecordForDeletion; }
}
let phoneUpdated = false;
salesArray.forEach(s => { if (s && s.customerName === name && s.customerPhone !== phone) { s.customerPhone = phone; phoneUpdated = true; } });
rep.length = 0; rep.push(...salesArray);
if (nameChanged || oldDebtModified || phoneUpdated) {
if (deletedOldDebtId) {
const _deletedRecord = window._repOldDebtRecordForDeletion || null;
window._repOldDebtRecordForDeletion = null;
await unifiedDelete('rep', salesArray, deletedOldDebtId, { strict: true }, _deletedRecord);
} else {
await unifiedSave('rep', salesArray, oldDebtModified && !phoneUpdated && !nameChanged ? oldDebtRecord : null);
}
if (nameChanged && renamedRecords.length > 0) {
await unifiedSave('rep', salesArray, null, renamedRecords.map(r => r.id));
}
}
const message = nameChanged ? `Rep customer renamed to "${name}" and details updated`
: oldDebit > 0 ? `Rep customer updated with old debt of ₨${fmtNum(oldDebit)}`
: (oldDebit === 0 && previousOldDebit > 0) ? 'Rep customer updated and old debt cleared'
: 'Rep customer details updated successfully';
const _repPhotoKeyOld = 'rep-cust:' + (currentRepProfile || '') + ':' + originalName.toLowerCase();
const _repPhotoKeyNew = 'rep-cust:' + (currentRepProfile || '') + ':' + name.toLowerCase();
if (nameChanged) {
const _oldRepPhoto = await getPersonPhoto(_repPhotoKeyOld);
if (_oldRepPhoto) {
const _repPhotos = await sqliteStore.get('photos') || {};
_repPhotos[_repPhotoKeyNew] = _oldRepPhoto;
delete _repPhotos[_repPhotoKeyOld];
await sqliteStore.set('photos', _repPhotos);
const _rdk = (await sqliteStore.get('photodirty')) || [];
if (!_rdk.includes(_repPhotoKeyNew)) _rdk.push(_repPhotoKeyNew);
if (!_rdk.includes(_repPhotoKeyOld)) _rdk.push(_repPhotoKeyOld);
await sqliteStore.set('photodirty', _rdk);
await sqliteStore.set('photos_timestamp', Date.now());
const _repPreview = document.getElementById('rep-cust-photo-preview');
if (_repPreview) _repPreview.dataset.pendingPhoto = undefined;
} else {
await savePersonPhoto('rep-cust', _repPhotoKeyNew);
}
} else {
await savePersonPhoto('rep-cust', _repPhotoKeyNew);
}
showToast(message, 'success');
closeRepCustomerEditModal();
await new Promise(r => setTimeout(r, 350));
if (nameChanged && currentManagingRepCustomer && currentManagingRepCustomer.toLowerCase() === originalName.toLowerCase()) {
_set_currentManagingRepCustomer(name);
}
const overlay = document.getElementById('rep-customer-management-screen');
if (overlay && window.getDisplay(overlay) !== 'none') await renderRepCustomerTransactions(currentManagingRepCustomer || name);
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
notifyDataChange('rep');
triggerAutoSync();
} catch (error) {
window.notifyBlocking('Failed to save rep customer details. Please try again.', 'error', 'Something went wrong');
}
}

export async function fetchRepDeviceLocation() {
return fetchLocationInto('rep-location-status', 'rep-edit-cust-address', 'fetchRepDeviceLocation');
}

export async function exportRepCustomerToPDF(opts = {}) {
const { rep, clients } = await loadCollections('rep', 'clients');
if (!currentManagingRepCustomer) { showToast('No rep customer selected', 'warning'); return; }
const customerName = currentManagingRepCustomer.trim();
if (!customerName) { showToast('No rep customer selected', 'warning'); return; }
const _rb = rangeBounds(opts && opts.from, opts && opts.to);
const range = (_rb.start || _rb.end) ? 'custom' : 'all';
const _textMode = !!(opts && opts.mode === 'text');
showToast(_textMode ? 'Preparing message...' : 'Generating PDF...', 'info');
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
await new Promise(r => setTimeout(r, 200));
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Failed to load PDF library. Please refresh and try again.');
const allRepCustTxns = rep.filter(s => s.customerName === customerName && s.salesRep === currentRepProfile);
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const repPeriodCutoff = _rb.start;
const _periodEnd = _rb.end;
const repPriorTxns = repPeriodCutoff
  ? allRepCustTxns.filter(t => {
      if (t.transactionType === 'OLD_DEBT') return true;
      if (!t.date) return false;
      return new Date(t.date) < repPeriodCutoff;
    })
  : [];
let transactions = repPeriodCutoff
  ? allRepCustTxns.filter(t => {
      if (t.transactionType === 'OLD_DEBT') return false;
      if (!t.date) return false;
      return new Date(t.date) >= repPeriodCutoff && (!_periodEnd || new Date(t.date) <= _periodEnd);
    })
  : (_periodEnd ? allRepCustTxns.filter(t => t.transactionType === 'OLD_DEBT' || (t.date && new Date(t.date) <= _periodEnd)) : allRepCustTxns);
const repOpeningBalance = repPriorTxns.reduce((bal, t) => {
  const pt = t.paymentType || 'CASH';
  const isOldDebt = t.transactionType === 'OLD_DEBT';
  let debit = 0, credit = 0;
  if (isOldDebt) {
    debit = parseFloat(t.totalValue) || 0;
    credit = parseFloat(t.partialPaymentReceived) || 0;
  } else if (pt === 'CASH' || (pt === 'CREDIT' && t.creditReceived)) {
  } else if (pt === 'CREDIT' && !t.creditReceived) {
    debit = parseFloat(t.totalValue) || 0;
    credit = parseFloat(t.partialPaymentReceived) || 0;
  } else if (pt === 'COLLECTION' || pt === 'PARTIAL_PAYMENT') {
    credit = (parseFloat(t.totalValue) || 0) + collectionExpiredLeft(t);
  }
  return bal + (debit - credit);
}, 0);
transactions.sort((a, b) => {
if (a.isMerged && !b.isMerged) return -1;
if (!a.isMerged && b.isMerged) return 1;
if (a.transactionType === 'OLD_DEBT' && b.transactionType !== 'OLD_DEBT') return -1;
if (a.transactionType !== 'OLD_DEBT' && b.transactionType === 'OLD_DEBT') return 1;
return ledgerEffectiveDate(a) - ledgerEffectiveDate(b);
});
const repContact = clients.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const phone = repContact?.phone || transactions.find(t => t.customerPhone)?.customerPhone || 'N/A';
const address = repContact?.address || 'N/A';
const { jsPDF } = window.jspdf;
const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
const _capTables = _textMode ? _captureAutoTables(doc) : null;
const pageW = doc.internal.pageSize.getWidth();
const hdrColor = [79, 70, 229];
doc.setFillColor(...hdrColor);
doc.rect(0, 0, pageW, 22, 'F');
if (typeof BRAND_LOGO_JPEG_BASE64 !== 'undefined') {
  try { doc.addImage(BRAND_LOGO_JPEG_BASE64, 'JPEG', 6, 2.5, 23.72, 17, undefined, 'NONE'); } catch(e) {}
}
doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW / 2, 10, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal');
doc.text('Naswar Manufacturers & Dealers', pageW / 2, 17, { align: 'center' });
const rangeName = rangeLabel(opts && opts.from, opts && opts.to);
doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
doc.text(`Rep Customer Account Statement · ${rangeName}`, pageW / 2, 30, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
let yPos = 38;
const _repPdfPhotoKey = 'rep-cust:' + (currentRepProfile || '') + ':' + customerName.toLowerCase();
const _repPdfPhoto = await getPersonPhoto(_repPdfPhotoKey);
if (_repPdfPhoto) {
  try { doc.addImage(_repPdfPhoto, 'JPEG', pageW - 14 - 22, 25, 22, 22, undefined, 'NONE'); } catch(e) {}
}
doc.setFont(undefined, 'bold'); doc.text('Customer:', 14, yPos);
doc.setFont(undefined, 'normal'); doc.text(customerName, 36, yPos);
doc.setFont(undefined, 'bold'); doc.text('Phone:', 14, yPos + 5);
doc.setFont(undefined, 'normal'); doc.text(phone, 36, yPos + 5);
doc.setFont(undefined, 'bold'); doc.text('Sales Rep:', 14, yPos + 10);
doc.setFont(undefined, 'normal'); doc.text(currentRepProfile || 'N/A', 36, yPos + 10);
doc.setFont(undefined, 'bold'); doc.text('Generated:', pageW / 2, yPos);
doc.setFont(undefined, 'normal');
doc.text(formatDayMonthYear(now), pageW / 2 + 22, yPos);
yPos += 18;
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, yPos, pageW - 14, yPos);
yPos += 5;
if (transactions.length > 0) {
const buildRow = async (t, runBal) => {
const pt = t.paymentType || 'CASH';
const isOldDebt = t.transactionType === 'OLD_DEBT';
let debit = 0, credit = 0, typeLabel = '', detailLabel = '', displayDate = formatDisplayDate(t.supplyDate || t.date);
const unitPrice = lockedUnitPrice(t) > 0 ? lockedUnitPrice(t) : await getSalePriceForStore(t.supplyStore || getDefaultStoreKey());
if (isOldDebt) {
debit = parseFloat(t.totalValue) || 0;
credit = parseFloat(t.partialPaymentReceived) || 0;
typeLabel = 'OLD DEBT';
detailLabel = oldDebtNote(t.notes);
displayDate = '';
} else if (pt === 'CASH') {
const val = t.totalValue || 0;
debit = val; credit = val;
typeLabel = 'CASH';
detailLabel = `${fmtAmt(t.quantity||0)} kg × Rs ${fmtAmt(unitPrice)}`;
} else if (pt === 'CREDIT' && !t.creditReceived) {
const val = t.totalValue || 0;
const partial = parseFloat(t.partialPaymentReceived) || 0;
debit = val; credit = partial;
typeLabel = partial > 0 ? 'CREDIT\n(PARTIAL)' : 'CREDIT';
detailLabel = `${fmtAmt(t.quantity||0)} kg × Rs ${fmtAmt(unitPrice)}`;
if (partial > 0) detailLabel += `\nPaid: Rs ${fmtAmt(partial)} | Due: Rs ${fmtAmt(val-partial)}`;
} else if (pt === 'CREDIT' && t.creditReceived) {
const val = t.totalValue || 0;
debit = val; credit = val;
typeLabel = 'CREDIT\n(PAID)';
detailLabel = `${fmtAmt(t.quantity||0)} kg × Rs ${fmtAmt(unitPrice)}`;
displayDate = formatDisplayDate(t.creditReceivedDate || t.supplyDate || t.date);
} else if (pt === 'COLLECTION') {
credit = (parseFloat(t.totalValue) || 0) + collectionExpiredLeft(t);
typeLabel = 'COLLECTION';
detailLabel = (t.allocations && t.allocations.length) ? `Rs ${fmtAmt(t.collectedAmount)} received` : (collectionCollected(t) > 0 || !(Number(t.expiredQty) > 0) ? 'Cash payment received' : '');
if (Number(t.expiredValue) > 0) detailLabel += `${detailLabel ? ' | ' : ''}Expired credit ${Number(t.expiredQty) > 0 ? `${fmtAmt(Number(t.expiredQty))} kg` : fmtAmt(Number(t.expiredValue))}${Number(t.expiredUnitPrice) > 0 ? ` @${fmtAmt(Number(t.expiredUnitPrice))}` : ''}`;
displayDate = formatDisplayDate(t.creditReceivedDate || t.date);
} else if (pt === 'PARTIAL_PAYMENT') {
credit = parseFloat(t.totalValue) || 0;
typeLabel = 'PARTIAL\nPAYMENT';
detailLabel = 'Partial payment received';
displayDate = formatDisplayDate(t.creditReceivedDate || t.date);
}
runBal.val += (debit - credit);
let balDisplay;
if (Math.abs(runBal.val) < 0.01) balDisplay = 'SETTLED';
else if (runBal.val > 0) balDisplay = 'Rs ' + fmtAmt(runBal.val);
else balDisplay = 'OVERPAID\nRs ' + fmtAmt(Math.abs(runBal.val));
return { row: [displayDate, typeLabel, detailLabel.substring(0,55),
debit>0?'Rs '+fmtAmt(debit):'-', credit>0?'Rs '+fmtAmt(credit):'-', balDisplay],
debit, credit, qty: t.quantity||0 };
};
const normalTxns = transactions.filter(t => !t.isMerged);
const repHasPrior = repPeriodCutoff !== null && repPriorTxns.length > 0;
const txRunBal = { val: repHasPrior ? repOpeningBalance : 0 };
const txRows = [];
let totDebit = 0, totCredit = 0, totQty = 0;
for (const t of normalTxns) {
const r = await buildRow(t, txRunBal);
txRows.push(r.row);
totDebit += r.debit;
totCredit += r.credit;
totQty += r.qty;
}
if (repHasPrior) {
  const obAbs = Math.abs(repOpeningBalance);
  const obDisplay = obAbs < 0.01 ? 'SETTLED' : 'Rs ' + fmtAmt(obAbs);
  txRows.unshift([
    'Prior', '—',
    'Opening Balance',
    '-', '-', obDisplay
  ]);
}
const finalBal = (repHasPrior ? repOpeningBalance : 0) + totDebit - totCredit;
doc.autoTable({
startY: yPos,
head: [['Date', 'Type', 'Details', 'Debit (Sale)', 'Credit (Rcvd)', 'Balance']],
body: txRows,
theme: 'grid',
headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [180,180,220], overflow: 'linebreak' },
columnStyles: {
0:{cellWidth:22,halign:'center'},1:{cellWidth:22,halign:'center',fontStyle:'bold'},
2:{cellWidth:52},3:{cellWidth:27,halign:'right',textColor:[220,53,69],fontStyle:'bold'},
4:{cellWidth:27,halign:'right',textColor:[40,167,69],fontStyle:'bold'},5:{cellWidth:26,halign:'center',fontStyle:'bold'}
},
didParseCell: function(data) {
styleStatementRow(data, repHasPrior);
},
margin: { left: 14, right: 14 }
});
const afterY = ((normalTxns.length > 0 || repHasPrior) ? doc.lastAutoTable.finalY : yPos - 5) + 5;
if (afterY < 252) {
const repBoxH = repHasPrior && Math.abs(repOpeningBalance) >= 0.01 ? 28 : 20;
doc.setFillColor(240, 235, 255);
doc.roundedRect(14, afterY, pageW - 28, repBoxH, 2, 2, 'F');
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.3);
doc.roundedRect(14, afterY, pageW - 28, repBoxH, 2, 2, 'S');
doc.setFontSize(8); doc.setFont(undefined, 'normal');
if (repHasPrior && Math.abs(repOpeningBalance) >= 0.01) {
  const repObSign = repOpeningBalance > 0 ? '+' : '-';
  doc.setTextColor(30, 80, 160);
  doc.text(`Opening Balance: ${repObSign}Rs ${fmtAmt(Math.abs(repOpeningBalance))}`, pageW / 2, afterY + 7, { align: 'center' });
  doc.setTextColor(220, 53, 69);
  doc.text(`Period Debit: Rs ${fmtAmt(totDebit)}`, pageW / 4, afterY + 15, { align: 'center' });
  doc.setTextColor(40, 167, 69);
  doc.text(`Period Credit: Rs ${fmtAmt(totCredit)}`, (pageW * 3) / 4, afterY + 15, { align: 'center' });
} else {
  doc.setTextColor(220, 53, 69);
  doc.text(`Total Debit (Sales): Rs ${fmtAmt(totDebit)}`, pageW / 4, afterY + 8, { align: 'center' });
  doc.setTextColor(40, 167, 69);
  doc.text(`Total Credit (Rcvd): Rs ${fmtAmt(totCredit)}`, (pageW * 3) / 4, afterY + 8, { align: 'center' });
}
doc.setFont(undefined, 'bold');
const balStr = Math.abs(finalBal) < 0.01 ? 'SETTLED'
: finalBal > 0 ? `Outstanding Due: Rs ${fmtAmt(finalBal)}`
: `Overpaid by: Rs ${fmtAmt(Math.abs(finalBal))}`;
doc.setTextColor(Math.abs(finalBal)<0.01?100:finalBal>0?220:40,
Math.abs(finalBal)<0.01?100:finalBal>0?53:167,
Math.abs(finalBal)<0.01?100:69);
doc.text(balStr, pageW / 2, afterY + (repHasPrior && Math.abs(repOpeningBalance) >= 0.01 ? 23 : 15), { align: 'center' });
}
} else {
doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(150);
doc.text('No transactions recorded for this period.', pageW / 2, yPos + 15, { align: 'center' });
}
const pageCount = doc.internal.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
doc.setPage(i);
doc.setFontSize(7); doc.setTextColor(160);
doc.text(
`Generated on ${formatDayMonthYear(now)} at ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW / 2, 291, { align: 'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 287, { align: 'center' });
}
await new Promise(r => setTimeout(r, 100));
const dateStamp  = localDateStr();
const safeRepName = customerName.replace(/[^a-z0-9]/gi, '_');
if (_textMode) {
  await _shareStatementText(_buildStatementText({ title: 'Rep Customer Account Statement', name: customerName, phone, rangeName, tables: _capTables }), phone);
} else if (pageCount === 1) {
  showToast('Single-page statement — converting to image…', 'info');
  await _exportDocAsImageAndOpenWhatsApp(
    doc,
    phone,
    `Rep_Customer_Statement_${safeRepName}_${dateStamp}`
  );
} else {
  doc.save(`Rep_Customer_Statement_${safeRepName}_${dateStamp}.pdf`);
  showToast('PDF exported successfully', 'success');
}
} catch (error) {
showToast('Error generating PDF: ' + error.message, 'error');
}
}

export async function renderRepHistory() {
const rep = ensureArray(await sqliteStore.get('rep'));
const list = document.getElementById('repHistoryList');
if (!list) return;
const dateInput = document.getElementById('rep-date');
const selectedDate = dateInput && dateInput.value ? dateInput.value : localDateStr();
const isToday = selectedDate === localDateStr();
const pickedCustomer = selectedCustomerFilter('rep-cust-name');
const baseHeader = isToday ? "Today's Activity" : `Activity for ${selectedDate}`;
const headerText = pickedCustomer ? `${baseHeader} - ${(document.getElementById('rep-cust-name').value || '').trim()}` : baseHeader;
const activityData = rep
.filter(s =>
s.salesRep === currentRepProfile &&
s.date === selectedDate &&
s.paymentType !== 'PARTIAL_PAYMENT' &&
(!pickedCustomer || String(s.customerName || '').trim().toLowerCase() === pickedCustomer)
)
.sort((a,b) => b.timestamp - a.timestamp);
if(activityData.length === 0) {
list.innerHTML = `<div class="empty hc-empty">No activity found for ${pickedCustomer ? `${esc((document.getElementById('rep-cust-name').value || '').trim())} on ` : ''}${esc(selectedDate)}</div>`;
return;
}
const cardsHtml = activityData.map(item => {
const isCollection = item.paymentType === 'COLLECTION';
const isCredit = item.paymentType === 'CREDIT';
const isOldDebt = item.transactionType === 'OLD_DEBT';
const tone = isCollection ? 'good' : (isCredit ? 'warn' : 'info');
const tag = isCollection ? 'Collection' : (isOldDebt ? 'Old debt' : (isCredit ? 'Credit' : 'Sale'));
const repChip = item.salesRep && !item.createdBy ? hcChip(item.salesRep.split(' ')[0], 'info') : '';
return hcCardHtml({
tone, avatar: item.customerName, title: item.customerName,
sub: `${esc(item.time || '')}${item.isMerged ? _mergedBadgeHtml(item, {inline:true}) : ''}${item.createdBy && typeof _creatorBadgeHtml === 'function' ? _creatorBadgeHtml(item) : ''}`,
chips: [repChip, item.isSettled ? hcChip('Settled', 'good') : ''],
amount: fmtAmt(isCollection && !(Number(item.totalValue) > 0) && Number(item.expiredValue) > 0 ? item.expiredValue : item.totalValue), tag, tagTone: isCollection ? 'good' : (isCredit ? 'warn' : ''),
metrics: (isCollection || isOldDebt) ? [] : [{ label: 'Quantity', value: `${fmtNum(item.quantity)} kg`, cls: 'qty-val' }]
}, { className: `is-compact${item.isSettled ? ' is-settled-record' : ''}`, attrs: { 'data-date': item.date } });
}).join('');
const tableHTML = `<div class="hc-list-head"><span class="hc-list-title">${esc(headerText)}</span><span class="hc-list-count">${fmtNum(periodQuantity(activityData.map((t) => ({ t }))))} kg</span></div><div class="hc-list">${cardsHtml}</div>`;
list.innerHTML = tableHTML;
}

export async function refreshRepUI(force = false) {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
if (sqliteStore && sqliteStore.getBatch) {
try {
const repKeys = ['rep', 'clients'];
const repDataMap = await sqliteStore.getBatch(repKeys);
if (repDataMap.get('rep') !== undefined && repDataMap.get('rep') !== null) {
let freshRepSales = await repairStoredRecords('rep', repDataMap.get('rep') || []);
if (Array.isArray(freshRepSales) && freshRepSales.length > 0) {
freshRepSales = freshRepSales.filter(r => !deletedRecordIds.has(r.id));
freshRepSales.sort((a, b) => compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a)));
}
}
if (repDataMap.get('clients') !== undefined && repDataMap.get('clients') !== null) {
await repairStoredRecords('clients', repDataMap.get('clients') || []);
}
} catch (error) {
console.error('Failed to save data locally.', _safeErr(error));
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

window.enableBiometricLock = enableBiometricLock;
window.disableBiometricLock = disableBiometricLock;
window.toggleBiometricLock = toggleBiometricLock;
window.syncBiometricButton = syncBiometricButton;
window.checkBiometricLock = checkBiometricLock;
window.setRepMode = setRepMode;
window.selectRepCustomer = selectRepCustomer;
window.calculateRepCustomerStatsForDisplay = calculateRepCustomerStatsForDisplay;
window.calculateRepCustomerStats = calculateRepCustomerStats;
window.updateRepCollectionPreview = updateRepCollectionPreview;
window.calculateRepSalePreview = calculateRepSalePreview;
window.saveRepTransaction = saveRepTransaction;
window.getDistanceFromLatLonInMeters = getDistanceFromLatLonInMeters;
window.deg2rad = deg2rad;
window.autoUpdateCustomerLocation = autoUpdateCustomerLocation;
window.repMap = repMap;
window.repMapMarkers = repMapMarkers;
window.repPolyline = repPolyline;
window.getPosition = getPosition;
window.initRepMap = initRepMap;
window.updateRepLiveMap = updateRepLiveMap;
window.adminSwitchRepProfile = adminSwitchRepProfile;
window.setRepAnalyticsMode = setRepAnalyticsMode;
window.calculateRepAnalytics = calculateRepAnalytics;
window.renderRepCustomerTable = renderRepCustomerTable;
window.openRepCustomerManagement = openRepCustomerManagement;
window.closeRepCustomerManagement = closeRepCustomerManagement;
window.deleteCurrentRepCustomer = deleteCurrentRepCustomer;
window.renderRepCustomerTransactions = renderRepCustomerTransactions;
window.openRepCustomerEditModal = openRepCustomerEditModal;
window.closeRepCustomerEditModal = closeRepCustomerEditModal;
window.saveRepCustomerDetails = saveRepCustomerDetails;
window.fetchRepDeviceLocation = fetchRepDeviceLocation;
window.exportRepCustomerToPDF = exportRepCustomerToPDF;
window.renderRepHistory = renderRepHistory;
window.refreshRepUI = refreshRepUI;
