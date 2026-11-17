
// ==== module: payment-transfer.js ====
import { _showFilterEmpty, refreshPaymentTab, formatDisplayDateTime } from '../../modules/utilities-payments.js';
import { customerHistoryMatcher, appMode, loadCollections, generateUUID, validateUUID, getTimestamp, ensureRecordIntegrity, fmtAmt, sqliteStore, ensureArray, esc } from '../../modules/business.js';
import { showToast } from '../../modules/customers.js';
import { confirmGuard } from '../../modules/confirm-guard.js';
import { runExclusive, getTxLinkIssue } from '../../modules/link-graph.js';
import { getEditCtx, endEditMode, confirmEditChanges, stampEdit, replaceRecord, beginEditMode, actionRowHtml } from '../../modules/edit-mode.js';
import { unifiedSave, emitSyncUpdate } from '../../modules/sync.js';
import { notifyDataChange, triggerAutoSync, _compressPhoto, openPhotoCapture } from '../../modules/utilities-core.js';
import { calculateNetCash, getAvailableCashInHand } from '../../modules/utilities-sales.js';
import { editDateValue } from '../../modules/edit-date.js';
import { hcEmptyHtml, hcCard } from '../../modules/history-card.js';

export function applyPaymentTransferFilter() {
const matchFrom = customerHistoryMatcher('payment-transfer-from-search');
const matchTo = customerHistoryMatcher('payment-transfer-to-search');
let total = 0, shown = 0;
document.querySelectorAll('#paymentTransferHistoryList .card').forEach(card => {
total++;
const show = (!matchFrom || matchFrom(String(card.getAttribute('data-from') || ''))) &&
(!matchTo || matchTo(String(card.getAttribute('data-to') || '')));
if (show) shown++;
window.setDisplay(card, show ? '' : 'none');
});
_showFilterEmpty('#paymentTransferHistoryList', total, shown, 'No transfers match the selected entities. Clear the names to see all.');
}

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
const fromSearch = document.getElementById('payment-transfer-from-search'); if (fromSearch) { fromSearch.value = ''; fromSearch.dataset.histCustomer = ''; fromSearch.removeAttribute('data-entity-id'); }
const toSearch = document.getElementById('payment-transfer-to-search'); if (toSearch) { toSearch.value = ''; toSearch.dataset.histCustomer = ''; toSearch.removeAttribute('data-entity-id'); }
const fromHidden = document.getElementById('payment-transfer-from-value'); if (fromHidden) fromHidden.value = '';
const toHidden = document.getElementById('payment-transfer-to-value'); if (toHidden) toHidden.value = '';
const fromResults = document.getElementById('payment-transfer-from-results'); if (fromResults) window.Dropdown.hide(fromResults);
const toResults = document.getElementById('payment-transfer-to-results'); if (toResults) window.Dropdown.hide(toResults);
const amtInput = document.getElementById('payment-transfer-amount'); if (amtInput) amtInput.value = '';
const noteInput = document.getElementById('payment-transfer-note'); if (noteInput) noteInput.value = '';
if (typeof _applyPaymentTransferPendingPhoto === 'function') _applyPaymentTransferPendingPhoto(null);
await renderPaymentTransferHistory();
}

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
applyPaymentTransferFilter();
set('payment-transfer-date', editDateValue(out));
set('payment-transfer-amount', out.amount);
const prefix = `Transfer to ${inn.entityName}: `;
set('payment-transfer-note', (out.description || '').startsWith(prefix) ? out.description.slice(prefix.length) : '');
beginEditMode('paytransfer', { id: out.id, pairId, records: JSON.parse(JSON.stringify(records)), createdAt: out.createdAt }, { buttonId: 'btn-save-payment-transfer', watchIds: ['payment-transfer-from-value','payment-transfer-to-value','payment-transfer-date','payment-transfer-amount','payment-transfer-note'], label: 'Update Transfer', anchorId: 'payment-transfer-amount', cancelFn: _resetPaymentTransferForm });
}

export function openPaymentTransferPhotoCapture() {
openPhotoCapture('paytransfer');
}

export function handlePaymentTransferPhotoFile(event) {
const file = event.target.files && event.target.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = (e) => _applyPaymentTransferPendingPhoto(e.target.result);
reader.readAsDataURL(file);
event.target.value = '';
}

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
}, { className: 'transfer-card', attrs: { 'data-date': t.date, 'data-rec': t.transferPairId, 'data-from': String(t.entityName || '').trim().toLowerCase(), 'data-to': String(t.transferPeerEntityName || '').trim().toLowerCase() } }));
if (t.id) photoIds.push([photoBadgeId, 'expense:' + t.id]);
});
list.replaceChildren(fragment);
applyPaymentTransferFilter();
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

Object.assign(window, { prepareEntityTransferScreen, saveEntityTransfer, openPaymentTransferPhotoCapture, handlePaymentTransferPhotoFile, _applyPaymentTransferPendingPhoto, renderPaymentTransferHistory, applyPaymentTransferFilter, startEditPaymentTransfer });

export const __screenHtml = "<div id=\"payment-transfer-screen\" class=\"standalone-screen d-none\">\n  <div class=\"shell-bar screen-topbar\">\n    <h2 class=\"screen-title\">Payment Transfer</h2>\n  </div>\n  <div class=\"screen-body\">\n    <div class=\"card u-d8ddece st-border-bottom__e54b2f\">\n      <p class=\"settings-group-label\">Move Balance Between Entities</p>\n      <div class=\"grid-inputs u-mb-15\">\n        <div class=\"field u-a8a9035\">\n          <label>From Entity</label>\n          <input type=\"hidden\" id=\"payment-transfer-from-value\" value=\"\">\n          <input\n            type=\"text\"\n            id=\"payment-transfer-from-search\"\n            placeholder=\"Search entity...\"\n            oninput=\"handleUniversalSearch('payment-transfer-from-search','payment-transfer-from-results','entities');document.getElementById('payment-transfer-from-value').value='';applyPaymentTransferFilter()\"\n            autocomplete=\"off\"\n            class=\"form-ctl u-13f34eb\"\n          >\n          <div id=\"payment-transfer-from-results\" class=\"hidden u-327750f has-overflow st-background__e02427 st-border-bottom__e54b2f u-86c6b8a\"></div>\n        </div>\n        <div class=\"field u-a8a9035\">\n          <label>To Entity</label>\n          <input type=\"hidden\" id=\"payment-transfer-to-value\" value=\"\">\n          <input\n            type=\"text\"\n            id=\"payment-transfer-to-search\"\n            placeholder=\"Search entity...\"\n            oninput=\"handleUniversalSearch('payment-transfer-to-search','payment-transfer-to-results','entities');document.getElementById('payment-transfer-to-value').value='';applyPaymentTransferFilter()\"\n            autocomplete=\"off\"\n            class=\"form-ctl u-13f34eb\"\n          >\n          <div id=\"payment-transfer-to-results\" class=\"hidden u-327750f has-overflow st-background__e02427 st-border-bottom__e54b2f u-86c6b8a\"></div>\n        </div>\n      </div>\n      <div class=\"grid-inputs u-mb-15\">\n        <div class=\"field\">\n          <label>Date</label>\n          <input class=\"form-ctl\" type=\"date\" id=\"payment-transfer-date\">\n        </div>\n        <div class=\"field\">\n          <label>Amount</label>\n          <input class=\"form-ctl\" type=\"number\" id=\"payment-transfer-amount\" placeholder=\"0.00\" step=\"0.01\" min=\"0\">\n        </div>\n      </div>\n      <div class=\"field u-mb-15\">\n        <label>Note (optional)</label>\n        <div class=\"u-832bae1 d-flex\">\n          <input type=\"text\" id=\"payment-transfer-note\" placeholder=\"e.g. Settling shared supplier bill\" maxlength=\"120\" class=\"form-ctl u-634a28b\">\n          <button id=\"payment-transfer-photo-btn\" title=\"Attach photo\" onclick=\"openPaymentTransferPhotoCapture()\" class=\"btn btn-theme btn-icon\">\n            <svg width=\"17\" height=\"17\" viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M4 13A3.2 3.2 0 0 1 7.2 9.8H10.4L12.6 6.5H23.4L25.6 9.8H28.8A3.2 3.2 0 0 1 32 13V27A3.2 3.2 0 0 1 28.8 30.2H7.2A3.2 3.2 0 0 1 4 27Z\" fill=\"var(--accent)\" fill-opacity=\"0.13\" stroke=\"var(--accent)\" stroke-width=\"1.7\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"18\" cy=\"19.5\" r=\"5.8\" fill=\"var(--accent-gold)\" fill-opacity=\"0.28\" stroke=\"var(--accent-gold)\" stroke-width=\"1.7\"/><circle cx=\"18\" cy=\"19.5\" r=\"2\" fill=\"var(--accent-gold)\"/><circle cx=\"27.5\" cy=\"14\" r=\"1.3\" fill=\"var(--accent)\"/></svg>\n            <span id=\"payment-transfer-photo-dot\" class=\"u-c5bbf32 d-none st-background__36d305 st-border-bottom__42309d\"></span>\n          </button>\n        </div>\n        <input type=\"file\" id=\"payment-transfer-photo-file\" accept=\"image/*\" class=\"d-none\" onchange=\"handlePaymentTransferPhotoFile(event)\">\n      </div>\n      <button class=\"btn btn-main u-mt-8 u-16000cc\" id=\"btn-save-payment-transfer\" onclick=\"(async()=>{await saveEntityTransfer()})()\">Transfer Payment</button>\n    </div>\n    <p class=\"settings-group-label\">Transfer History</p>\n    <div id=\"paymentTransferHistoryList\" class=\"history-list report-grid\"></div>\n    <div class=\"u-5efdd87 st-background__5e344c st-border-bottom__167edb\">\n      <strong class=\"u-cab13eb\">Note:</strong> A payment transfer records an OUT transaction against the source entity and an IN transaction against the destination entity.\n      Both entities' balances update immediately and sync to all connected devices automatically.\n    </div>\n  </div>\n</div>";
export const __screenCss = "\n";
