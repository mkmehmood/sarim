import { themeColor } from './theme-tokens.js';
import { promptStatementRange, rangeBounds, rangeLabel } from './stmt-range.js';
import { renderLedger, menuButtonHtml, resetLedgerFilter, applyCmFilters } from './cm-ledger.js';
import { APP_CONFIG, BRAND_LOGO_JPEG_BASE64, loadBrandLogo } from './constants.js';
import { deletePaymentTxWithLinks, getPaymentTxDeleteBlockReason, getEntityDeleteBlockReason } from './link-guards.js';
import { newGroupId, stampGroup, allocatePayments, materialOriginalPayable, findPayableInTxs, runExclusive, planSupplierCreditRestore, txMaterialIds, dedupDeletionRecords, collectionCollected } from './link-graph.js';
import { collectionExpiredLeft } from './finance.js';
import { endEditMode, getEditCtx, replaceRecord, stampEdit } from './edit-mode.js';
import { installJsPdfImageLog, renderJsPdfToCanvases } from './pdf-canvas.js';
import { getProdPhotoKeys, persistProdPhotos } from './prod-photos.js';
import { deleteProdPhotos } from './prod-photos.js';
import { _creatorBadgeHtml, _mergedBadgeHtml, _safeErr, _set_isSyncing, appMode, currentRepProfile, currentUser, ensureArray, ensureRecordIntegrity, esc, firebaseDB, fmtAmt, fmtNum, generateUUID, getTimestamp, isSyncing, loadAllData, localDateStr, lockedUnitPrice, safeReplace, salesRepsList, sqliteStore, validateTimestamp, validateUUID, readFileAsDataUrl, oldDebtNote, balanceAfterHtml, formatTime12, loadCollections } from './business.js';
import { emitSyncUpdate, pushDataToCloud, sanitizeForFirestore, subscribeToRealtime, triggerSeamlessBackup, unifiedDelete, unifiedSave } from './sync.js';
import { DeltaSync, calculateCashTracker, calculateCustomerSale, calculateNetCash, currentActiveTab, getStorePool, getStoreLabel, refreshCustomerSales, refreshFactoryTab, refreshUI, renderEntityTable, trackFirestoreWrite, updateFactorySummaryCard, updateFactoryUnitsAvailableStats, updateMfgCharts } from './utilities-sales.js';
import { _applyPaymentTransferPendingPhoto, autoFillTotalSoldQuantity, calculateEntityBalances, currentCompMode, deletePaymentTransfer, editEntityBasicInfo, formatCurrency, formatDisplayDate, formatDisplayDateTime, loadSalesData, phoneActionHTML, refreshPaymentTab, renderUnifiedTable, toSafeDate } from './utilities-payments.js';
import { calculateDynamicCost, getEffectiveSalePriceForCustomer, getSalePriceForStore, getSaleTransactionValue, renderFactoryHistory, renderFactoryInventory, syncFactoryProductionStats, updateUnitsAvailableIndicator, validateFormulaAvailability } from './factory.js';
import { showChoiceDialog, showGlassConfirm, showToast } from './customers.js';
import { calculateRepAnalytics, refreshRepUI, renderRepCustomerTable } from './rep-sales.js';
import { confirmGuard } from './confirm-guard.js';
import { formatDayMonthYear } from './date-format.js';
import { getDefaultStoreKey, DEFAULT_STORE_KEYS } from './store-keys.js';
import { ledgerEffectiveDate } from './tx-date.js';
import { describeBinRecord } from './store-recycle.js';
export let currentEntityId;
window.currentEntityId = currentEntityId;
export function rangeCutoffDate(range, today) {
  if (range === 'today') return today;
  const cutoff = new Date(today);
  if (range === 'week') cutoff.setDate(cutoff.getDate() - 7);
  else if (range === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === 'year') cutoff.setFullYear(cutoff.getFullYear() - 1);
  else return null;
  return cutoff;
}

export function styleStatementRow(data, hasPrior) {
  const isOpeningRow = hasPrior && data.row.index === 0;
  if (isOpeningRow) {
    data.cell.styles.fillColor = [220, 235, 255];
    data.cell.styles.fontStyle = 'bold';
    data.cell.styles.textColor = [30, 80, 160];
    data.cell.styles.fontSize  = 8;
  }
  if (!isOpeningRow) {
    if (data.column.index===1){
      const txt=(data.cell.text||[]).join('');
      if(txt.includes('CASH')) data.cell.styles.textColor=[40,167,69];
      if(txt.includes('CREDIT')) data.cell.styles.textColor=[200,100,0];
      if(txt.includes('COLLECTION')) data.cell.styles.textColor=[40,167,69];
      if(txt.includes('PARTIAL')) data.cell.styles.textColor=[200,100,0];
      if(txt.includes('OLD DEBT')) data.cell.styles.textColor=[220,53,69];
    }
    if (data.column.index===5){
      const txt=(data.cell.text||[]).join('');
      if(txt==='SETTLED') data.cell.styles.textColor=[100,100,100];
      else if(txt.includes('OVERPAID')) data.cell.styles.textColor=[40,167,69];
      else data.cell.styles.textColor=[220,53,69];
    }
  }
}

export function _set_currentEntityId(v) { currentEntityId = v; window.currentEntityId = v; }
export let _lbZoom;
window._lbZoom = _lbZoom;
export function _set__lbZoom(v) { _lbZoom = v; window._lbZoom = v; }
export let _lbResetZoom;
window._lbResetZoom = _lbResetZoom;
export function _set__lbResetZoom(v) { _lbResetZoom = v; window._lbResetZoom = v; }
export let openPhotoLightbox;
window.openPhotoLightbox = openPhotoLightbox;
export function _set_openPhotoLightbox(v) { openPhotoLightbox = v; window.openPhotoLightbox = v; }
export let closePhotoLightbox;
window.closePhotoLightbox = closePhotoLightbox;
export function _set_closePhotoLightbox(v) { closePhotoLightbox = v; window.closePhotoLightbox = v; }

export async function toggleDarkMode() {
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const currentTheme = html.getAttribute('data-theme') || 'dark';
const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
html.setAttribute('data-theme', newTheme);
if (newTheme === 'dark') {
if (themeToggle) { themeToggle.innerHTML = ''; themeToggle.title = "Switch to Light Mode"; }
await sqliteStore.set('theme', 'dark');
} else {
if (themeToggle) { themeToggle.innerHTML = ''; themeToggle.title = "Switch to Dark Mode"; }
await sqliteStore.set('theme', 'light');
}
const metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
metaThemeColor.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}
if (mfgBarChart) mfgBarChart.update();
if (mfgPieChart) mfgPieChart.update();
if (custSalesChart) custSalesChart.update();
if (custPaymentChart) custPaymentChart.update();
if (storeComparisonChart) storeComparisonChart.update();
if (salesPerfChart) salesPerfChart.update();
if (salesCompChart) salesCompChart.update();
if (indPerformanceChart) indPerformanceChart.update();
showToast(newTheme === 'dark' ? ' Dark mode enabled' : 'Light mode enabled', 'info', 2000);
}

export const syncState = {
lastUpdate: {
production: 0,
sales: 0,
calculator: 0,
factory: 0,
payments: 0,
entities: 0
},
isRefreshing: false,
pendingUpdates: new Set()
};

export const OfflineQueue = {
queue: [],
deadLetterQueue: [],
isProcessing: false,
maxRetries: APP_CONFIG.OFFLINE_MAX_RETRIES,
retryDelay: APP_CONFIG.OFFLINE_RETRY_DELAY_MS,
_dlKey: 'offline_dead_letter_queue',
async init() {
try {
const savedQueue = await sqliteStore.get('offline_operation_queue', []);
this.queue = Array.isArray(savedQueue) ? savedQueue : [];
const savedDL = await sqliteStore.get(this._dlKey, []);
this.deadLetterQueue = Array.isArray(savedDL) ? savedDL : [];
if (this.deadLetterQueue.length > 0) {
this._renderDeadLetterPanel();
}
if (this.queue.length > 0 && navigator.onLine) {
this.processQueue();
}
} catch (error) {
this.queue = [];
this.deadLetterQueue = [];
}
},
async add(operation) {
if (operation.docId && operation.collection && operation.action) {
const existingIdx = this.queue.findIndex(item =>
item.operation.action === operation.action &&
item.operation.collection === operation.collection &&
item.operation.docId === operation.docId
);
if (existingIdx !== -1) {
this.queue[existingIdx].operation = operation;
this.queue[existingIdx].timestamp = Date.now();
this.queue[existingIdx].retries = 0;
this.queue[existingIdx].error = null;
await this.saveQueue();
return;
}
}
const queueItem = {
id: generateUUID('offline'),
operation: operation,
timestamp: Date.now(),
retries: 0,
lastAttempt: null,
error: null
};
this.queue.push(queueItem);
await this.saveQueue();
if (navigator.onLine) {
this.processQueue();
} else if ('serviceWorker' in navigator && 'SyncManager' in window) {
navigator.serviceWorker.ready.then((reg) => {
reg.sync.register('offline-queue-sync').catch(() => {});
}).catch(() => {});
}
},
async saveQueue() {
try {
await sqliteStore.init();
await sqliteStore.set('offline_operation_queue', this.queue);
} catch (error) {
console.warn('[OfflineQueue] saveQueue failed:', _safeErr(error));
}
},
async saveDeadLetterQueue() {
try {
await sqliteStore.set(this._dlKey, this.deadLetterQueue);
} catch (error) {
console.error('Failed to persist dead-letter queue.', _safeErr(error));
}
},
async processQueue() {
if (this.isProcessing || this.queue.length === 0 || !navigator.onLine) {
return;
}
this.isProcessing = true;
const itemsToProcess = [...this.queue];
const successfulIds = [];
for (const item of itemsToProcess) {
if (item.retries >= this.maxRetries) {
const dlEntry = {
...item,
failedAt: Date.now(),
finalError: item.error || `Exhausted ${this.maxRetries} retries`
};
this.deadLetterQueue.push(dlEntry);
await this.saveDeadLetterQueue();
successfulIds.push(item.id);
this._renderDeadLetterPanel();
this._scheduleDlqAutoRetry();
showToast(
` Upload failed permanently — tap "Failed ops" to review`,
'error',
6000
);
continue;
}
try {
await this.executeOperation(item.operation);
successfulIds.push(item.id);
} catch (error) {
console.warn('[OfflineQueue] operation failed, will retry:', _safeErr(error));
item.retries++;
item.lastAttempt = Date.now();
item.error = error.message;
const backoff = Math.min(this.retryDelay * Math.pow(2, item.retries - 1), APP_CONFIG.OFFLINE_MAX_BACKOFF_MS);
await new Promise(resolve => setTimeout(resolve, backoff));
}
}
this.queue = this.queue.filter(item => !successfulIds.includes(item.id));
await this.saveQueue();
this.isProcessing = false;
if (this.queue.length > 0 && navigator.onLine) {
if (this._retryTimer) clearTimeout(this._retryTimer);
this._retryTimer = setTimeout(() => { this._retryTimer = null; this.processQueue(); }, 15000);
}
},
async retryDeadLetter(id) {
const idx = this.deadLetterQueue.findIndex(e => e.id === id);
if (idx === -1) return;
const entry = this.deadLetterQueue.splice(idx, 1)[0];
await this.saveDeadLetterQueue();
const fresh = { ...entry, retries: 0, error: null, lastAttempt: null };
delete fresh.failedAt;
delete fresh.finalError;
this.queue.push(fresh);
await this.saveQueue();
this._renderDeadLetterPanel();
if (navigator.onLine) this.processQueue();
showToast('Operation re-queued for upload', 'info', 3000);
},
async dismissDeadLetter(id) {
this.deadLetterQueue = this.deadLetterQueue.filter(e => e.id !== id);
await this.saveDeadLetterQueue();
this._renderDeadLetterPanel();
showToast('Failed operation dismissed', 'info', 2500);
},
async dismissAllDeadLetters() {
this.deadLetterQueue = [];
await this.saveDeadLetterQueue();
this._renderDeadLetterPanel();
showToast('All failed operations cleared', 'info', 2500);
},
dlqAutoRetryDelay: 30 * 60 * 1000,
_dlqAutoRetryTimer: null,
_scheduleDlqAutoRetry() {
  if (this._dlqAutoRetryTimer) return;
  if (this.deadLetterQueue.length === 0) return;
  this._dlqAutoRetryTimer = setTimeout(async () => {
    try {
      this._dlqAutoRetryTimer = null;
      if (this.deadLetterQueue.length === 0) return;
      showToast('\uD83D\uDD04 Auto-retrying ' + this.deadLetterQueue.length + ' failed operation(s)\u2026', 'info', 4000);
      const items = [...this.deadLetterQueue];
      this.deadLetterQueue = [];
      await this.saveDeadLetterQueue();
      for (const entry of items) {
        const fresh = { ...entry, retries: 0, error: null, lastAttempt: null };
        delete fresh.failedAt; delete fresh.finalError;
        this.queue.push(fresh);
      }
      await this.saveQueue();
      this._renderDeadLetterPanel();
      if (navigator.onLine) await this.processQueue();
      if (this.deadLetterQueue.length > 0) {
        showToast('\u26A0\uFE0F Auto-retry complete \u2014 ' + this.deadLetterQueue.length + ' operation(s) still failing. Use \"Failed ops\" to retry manually or export for safekeeping.', 'error', 8000);
      }
    } catch (e) { console.warn('[DLQ] Auto-retry error:', _safeErr(e)); }
  }, this.dlqAutoRetryDelay);
},
exportDeadLetterQueue() {
  if (this.deadLetterQueue.length === 0) { showToast('No failed operations to export', 'info', 2500); return; }
  const blob = new Blob([JSON.stringify(this.deadLetterQueue, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'failed_ops_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Failed operations exported', 'success', 2500);
},
cancelRetry() {
if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
if (this._dlqAutoRetryTimer) { clearTimeout(this._dlqAutoRetryTimer); this._dlqAutoRetryTimer = null; }
},
_renderDeadLetterPanel() {
const count = this.deadLetterQueue.length;
let dlBadge = document.getElementById('dl-queue-badge');
if (count === 0) {
if (dlBadge) dlBadge.remove();
const panel = document.getElementById('dl-queue-panel');
if (panel) panel.remove();
return;
}
if (!dlBadge) {
const offlineBanner = document.getElementById('offline-banner');
if (offlineBanner) {
dlBadge = document.createElement('button');
dlBadge.id = 'dl-queue-badge';
dlBadge.title = 'Show permanently-failed upload operations';
dlBadge.onclick = () => this._showDeadLetterModal();
offlineBanner.appendChild(dlBadge);
}
}
if (dlBadge) {
dlBadge.textContent = ` ${count} failed op${count !== 1 ? 's' : ''}`;
}
if (document.getElementById('dl-queue-modal')) {
this._showDeadLetterModal();
}
},
_showDeadLetterModal() {
const existing = document.getElementById('dl-queue-modal');
if (existing) existing.remove();
if (this.deadLetterQueue.length === 0) return;
const modal = document.createElement('div');
modal.id = 'dl-queue-modal';
modal.setAttribute('role', 'dialog');
modal.setAttribute('aria-modal', 'true');
modal.setAttribute('aria-label', 'Failed operations');
const rows = this.deadLetterQueue.map(entry => {
const ts = entry.failedAt ? new Date(entry.failedAt).toLocaleString() : '—';
const op = entry.operation || {};
const label = [op.action, op.collection, op.docId ? op.docId.slice(0, 8) + '…' : ''].filter(Boolean).join(' · ');
const errText = esc(entry.finalError || '');
return `<div class="dl-queue-row" data-id="${esc(entry.id)}">
<div class="dl-queue-row-info">
<span class="dl-queue-label">${esc(label)}</span>
<span class="dl-queue-time">${ts}</span>
${errText ? `<span class="dl-queue-error">${errText}</span>` : ''}
</div>
<div class="dl-queue-actions">
<button class="btn btn-sm btn-main" onclick="OfflineQueue.retryDeadLetter('${esc(entry.id)}')">Retry</button>
<button class="btn btn-sm btn-theme" onclick="OfflineQueue.dismissDeadLetter('${esc(entry.id)}')">Dismiss</button>
</div>
</div>`;
}).join('');
modal.innerHTML = `
<div class="card dl-queue-card">
<div class="dl-queue-header">
<h3 class="dl-queue-title"> Failed Uploads</h3>
</div>
<p class="dl-queue-subtitle">These operations exhausted all ${this.maxRetries} retry attempts. Retry to re-attempt upload, or dismiss to discard.</p>
<div class="dl-queue-list">${rows}</div>
<div class="dl-queue-footer">
<button class="btn btn-sm btn-theme" onclick="OfflineQueue.exportDeadLetterQueue()" title="Save failed operations as JSON">Export JSON</button>
<button class="btn btn-sm btn-danger u-w-full" onclick="OfflineQueue.dismissAllDeadLetters()">Dismiss all</button>
</div>
</div>`;
modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
document.body.appendChild(modal);
},
async executeOperation(operation) {
if (!firebaseDB || !currentUser) {
throw new Error('Database or user not available');
}
const { collection, docId, data, action } = operation;
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
switch (action) {
case 'set': {
const setData = (data && typeof data === 'object') ? { ...data } : data;
if (setData && !setData.isMerged) {
setData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
}
if (collection === 'inventory') {
  await userRef.collection(collection).doc(docId).set(setData);
} else {
  await userRef.collection(collection).doc(docId).set(setData, { merge: true });
}
trackFirestoreWrite(1);
if (typeof DeltaSync !== 'undefined') {
  DeltaSync.markUploaded(collection, docId);
  await DeltaSync.setLastSyncTimestamp(collection);
}
break;
}
case 'update':
await userRef.collection(collection).doc(docId).update(data);
trackFirestoreWrite(1);
break;
case 'delete':
const deleteBatch = firebaseDB.batch();
deleteBatch.delete(userRef.collection(collection).doc(docId));
const tombstoneRef = userRef.collection('deletions').doc(docId);
deleteBatch.set(tombstoneRef, {
id: docId,
recordId: docId,
collection: collection,
recordType: operation.recordType || collection,
deletedAt: firebase.firestore.Timestamp.now(),
expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + (90 * 24 * 60 * 60 * 1000))
}, { merge: true });
await deleteBatch.commit();
trackFirestoreWrite(2);
break;
case 'set-doc':
await userRef.collection(collection).doc(docId).set(data, { merge: true });
trackFirestoreWrite(1);
break;
default:
throw new Error(`Unknown operation action: ${action}`);
}
},
getQueueStatus() {
return {
pendingCount: this.queue.length,
deadLetterCount: this.deadLetterQueue.length,
isProcessing: this.isProcessing,
items: this.queue.map(item => ({
id: item.id,
action: item.operation.action,
collection: item.operation.collection,
docId: item.operation.docId,
retries: item.retries,
timestamp: item.timestamp,
error: item.error
})),
deadLetterItems: this.deadLetterQueue.map(item => ({
id: item.id,
action: item.operation.action,
collection: item.operation.collection,
docId: item.operation.docId,
failedAt: item.failedAt,
finalError: item.finalError
}))
};
}
};

if (typeof window._firestoreNetworkDisabled === 'undefined') window._firestoreNetworkDisabled = false;

export function updateOfflineBanner() {
const banner = document.getElementById('offline-banner');
const badge = document.getElementById('offline-queue-badge');
const dot = document.getElementById('network-status-dot');
const msgEl = document.getElementById('offline-banner-msg');
const isOnline = navigator.onLine;
const pending = (typeof OfflineQueue !== 'undefined') ? OfflineQueue.queue.length : 0;
const failed = (typeof OfflineQueue !== 'undefined') ? OfflineQueue.deadLetterQueue.length : 0;
const isSlow = isOnline && !!window._isSlowConnection;
const slowDetail = window._slowConnectionDetail || 'Weak signal';
const cloudState = window._cloudConnectionState || null;
let show = true;
let message = '';
if (!isOnline) {
message = 'Offline — changes saved locally';
} else if (isSlow) {
message = `${slowDetail} — changes queued for sync`;
} else if (pending > 0) {
message = `Syncing ${pending} queued operation${pending !== 1 ? 's' : ''}...`;
} else if (cloudState === 'connecting' || cloudState === 'loading') {
message = 'Connecting to cloud...';
} else if (cloudState === 'error') {
message = 'Cloud connection error — retrying...';
} else if (cloudState === 'signed-out') {
message = 'Signed out — please sign in to sync';
} else if (window.isSyncing) {
message = 'Syncing with cloud...';
} else if (failed > 0) {
message = 'All caught up — some uploads need attention';
} else {
show = false;
}
if (banner) {
banner.classList.toggle('visible', show);
banner.dataset.state = !isOnline ? 'offline' : (isSlow ? 'slow' : (cloudState === 'error' ? 'error' : 'sync'));
banner.title = message;
banner.setAttribute('aria-label', message || 'Online');
if (!banner.__tapBound) {
banner.__tapBound = true;
banner.addEventListener('click', () => { if (typeof showToast === 'function' && banner.title) showToast(banner.title, 'info', 3500); });
}
}
if (msgEl) msgEl.textContent = message;
if (badge) {
if (!isOnline) {
badge.textContent = pending > 0 ? `${pending} pending` : 'saves queued locally';
window.setDisplay(badge, '');
} else if (isSlow && pending > 0) {
badge.textContent = `${pending} pending`;
window.setDisplay(badge, '');
} else if (pending > 0) {
badge.textContent = `Syncing ${pending}...`;
window.setDisplay(badge, '');
} else {
badge.textContent = '';
window.setDisplay(badge, 'none');
}
}
if (dot) {
if (!isOnline) {
dot.className = 'net-dot net-dot-offline';
dot.title = pending > 0
? `Offline — ${pending} operation(s) will sync when back online`
: 'Offline — changes saved locally';
} else if (failed > 0) {
dot.className = 'net-dot net-dot-warning';
dot.title = `${failed} upload(s) permanently failed — tap "Failed ops" to review`;
} else if (isSlow) {
dot.className = 'net-dot net-dot-warning';
dot.title = slowDetail;
} else if (pending > 0) {
dot.className = 'net-dot net-dot-warning';
dot.title = `Syncing ${pending} queued operation(s)...`;
} else if (cloudState === 'connecting' || cloudState === 'loading') {
dot.className = 'net-dot net-dot-warning';
dot.title = 'Connecting to cloud...';
} else if (cloudState === 'error') {
dot.className = 'net-dot net-dot-warning';
dot.title = 'Cloud connection error — retrying...';
} else if (cloudState === 'signed-out') {
dot.className = 'net-dot net-dot-warning';
dot.title = 'Signed out — please sign in to sync';
} else if (window.isSyncing) {
dot.className = 'net-dot net-dot-warning';
dot.title = 'Syncing with cloud...';
} else {
dot.className = 'net-dot net-dot-online';
dot.title = 'Online — connected to Firestore';
}
}
if (typeof OfflineQueue !== 'undefined') {
OfflineQueue._renderDeadLetterPanel();
}
}

export function _setCloudConnectionState(state) {
window._cloudConnectionState = state;
updateOfflineBanner();
}

export function _setSlowConnectionState(isSlow, detail) {
window._isSlowConnection = isSlow;
window._slowConnectionDetail = detail || null;
updateOfflineBanner();
}

(function patchOfflineQueueAdd() {
const _origAdd = OfflineQueue.add.bind(OfflineQueue);
OfflineQueue.add = async function(operation) {
const result = await _origAdd(operation);
updateOfflineBanner();
return result;
};
const _origProcess = OfflineQueue.processQueue.bind(OfflineQueue);
OfflineQueue.processQueue = async function() {
const result = await _origProcess();
updateOfflineBanner();
if (this.queue.length === 0 && navigator.onLine) {
if (typeof showToast === 'function') {
showToast(' Offline changes synced', 'success', 3000);
}
}
return result;
};
})();

if ('serviceWorker' in navigator) {
navigator.serviceWorker.addEventListener('message', (event) => {
if (event.data && event.data.type === 'PROCESS_QUEUE') {
if (typeof OfflineQueue !== 'undefined' && OfflineQueue.queue.length > 0 && navigator.onLine) {
OfflineQueue.processQueue().catch(() => {});
}
}
});
}

window.addEventListener('online', async () => {
updateOfflineBanner();
if (typeof firebaseDB !== 'undefined' && firebaseDB) {
let retries = 0;
const tryEnable = async () => {
try {
await firebaseDB.enableNetwork();
window._firestoreNetworkDisabled = false;
} catch (e) {
retries++;
if (retries < 3) {
setTimeout(tryEnable, retries * 1000);
} else {
console.warn('Failed to enable Firestore network after retries:', _safeErr(e));
}
}
};
tryEnable();
}
if (typeof OfflineQueue !== 'undefined' && OfflineQueue.queue.length > 0) {
await OfflineQueue.processQueue();
}
setTimeout(() => {
if (typeof subscribeToRealtime === 'function' && typeof currentUser !== 'undefined' && currentUser) {
subscribeToRealtime().catch(e => console.warn('subscribeToRealtime failed:', _safeErr(e)));
}
}, 500);
setTimeout(() => {
if (typeof triggerAutoSync === 'function') triggerAutoSync();
if (typeof updateOfflineBanner === 'function') updateOfflineBanner();
}, 2000);
showToast(' Back online — syncing…', 'success', 3000);
});

window.addEventListener('offline', async () => {
updateOfflineBanner();
if (typeof firebaseDB !== 'undefined' && firebaseDB) {
try {
await firebaseDB.disableNetwork();
window._firestoreNetworkDisabled = true;
} catch (e) {
console.warn('Failed to disable network.', _safeErr(e));
}
}
if (typeof isSyncing !== 'undefined' && isSyncing) {
_set_isSyncing(false);
}
showToast('Offline — changes will be saved locally', 'warning', 4000);
});

(function initConnectionMonitor() {
  const SLOW_RTT_MS      = 500;
  const SLOW_DOWNLINK    = 0.5;
  const CHECK_INTERVAL   = 20000;
  const TOAST_COOLDOWN   = 60000;
  let _lastSlowToast     = 0;
  let _monitorTimer      = null;
  function isConnectionSlow() {
    if (!navigator.onLine) return false;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    const type = conn.effectiveType || '';
    if (type === 'slow-2g' || type === '2g') return true;
    if (conn.rtt && conn.rtt > SLOW_RTT_MS) return true;
    if (conn.downlink && conn.downlink < SLOW_DOWNLINK) return true;
    return false;
  }
  function checkConnection() {
    if (!navigator.onLine) { _setSlowConnectionState(false); return; }
    const slow = isConnectionSlow();
    if (slow) {
      const conn = navigator.connection || {};
      const detail = conn.effectiveType
        ? `${conn.effectiveType.toUpperCase()} signal`
        : conn.rtt ? `${conn.rtt}ms latency` : 'Weak signal';
      _setSlowConnectionState(true, detail);
      if (Date.now() - _lastSlowToast > TOAST_COOLDOWN) {
        _lastSlowToast = Date.now();
        if (typeof showToast === 'function') {
          showToast('⚠️ Weak connection — all changes saved locally', 'warning', 5000);
        }
      }
    } else {
      _setSlowConnectionState(false);
    }
  }
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    conn.addEventListener('change', checkConnection);
  }
  function startMonitor() {
    if (_monitorTimer) clearInterval(_monitorTimer);
    checkConnection();
    _monitorTimer = setInterval(checkConnection, CHECK_INTERVAL);
  }
  function stopMonitor() {
    if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
    _setSlowConnectionState(false);
  }
  window.addEventListener('online',  () => { startMonitor(); });
  window.addEventListener('offline', () => { stopMonitor(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMonitor);
  } else {
    setTimeout(startMonitor, 1500);
  }
})();

setInterval(async () => {
if (!navigator.onLine) return;
if (typeof firebaseDB === 'undefined' || !firebaseDB) return;
if (!window._firestoreNetworkDisabled) return;
try {
await firebaseDB.enableNetwork();
window._firestoreNetworkDisabled = false;
if (typeof updateOfflineBanner === 'function') updateOfflineBanner();
if (typeof triggerAutoSync === 'function') triggerAutoSync();
} catch(e) {  }
}, APP_CONFIG.OFFLINE_MAX_BACKOFF_MS);

export function notifyDataChange(dataType) {
syncState.lastUpdate[dataType] = Date.now();
syncState.pendingUpdates.add(dataType);
if (!syncState.isRefreshing) {
requestAnimationFrame(() => processSync());
}
if (typeof triggerSeamlessBackup === 'function') {
triggerSeamlessBackup();
}
}

export let autoSyncTimeout = null;
export const AUTO_SYNC_DELAY = 5000;

export async function invalidateAllCaches() {
try {
const freshSettings = await sqliteStore.get('settings');
if (freshSettings && typeof freshSettings === 'object') defaultSettings = freshSettings;
const freshCats = await sqliteStore.get('categories');
if (typeof DeltaSync !== 'undefined' && typeof DeltaSync.loadAllPendingIds === 'function') {
DeltaSync.loadAllPendingIds().catch(() => {});
}
} catch(e) {
console.error('Failed to invalidate caches.', _safeErr(e));
}
}

export async function triggerAutoSync() {
let user = null;
try {
  user = (typeof window !== 'undefined' && window.currentUser) ? window.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);
} catch (_) {
  user = null;
}
if (!user) {
return;
}
if (typeof pushDataToCloud !== 'function') {
return;
}
let syncing = false;
try {
  syncing = (typeof window !== 'undefined' && window.isSyncing) ? window.isSyncing : (typeof isSyncing !== 'undefined' ? isSyncing : false);
} catch (_) {
  syncing = false;
}
if (syncing) {
return;
}
if (autoSyncTimeout) {
clearTimeout(autoSyncTimeout);
}
autoSyncTimeout = setTimeout(async () => {
if (typeof isSyncing !== 'undefined' && isSyncing) return;
try {
await pushDataToCloud(true);
} catch (error) {
if (navigator.onLine) {
const _errMsg = (error && (error.message || error.code || error.name))
? (error.message || error.code || error.name)
: (typeof error === 'string' ? error : 'please try again or check your data');
console.error('Sync failed. Check your connection.', _safeErr(error));
showToast('Sync failed: ' + _errMsg, 'error');
}
}
}, AUTO_SYNC_DELAY);
}

export async function updateSettingTimestamp(settingName) {
const timestamp = getTimestamp();
await sqliteStore.set(`${settingName}_timestamp`, timestamp);
}

export const _tabSyncInProgress = {};

export function processSync() {
if (syncState.isRefreshing || syncState.pendingUpdates.size === 0) return;
syncState.isRefreshing = true;
const updates = Array.from(syncState.pendingUpdates);
syncState.pendingUpdates.clear();
try {
updates.forEach(dataType => {
switch(dataType) {
case 'production':
if (typeof syncProductionTab === 'function' && !_tabSyncInProgress['production']) {
_tabSyncInProgress['production'] = true;
syncProductionTab().finally(() => { _tabSyncInProgress['production'] = false; });
}
if (typeof syncSalesTab === 'function' && !_tabSyncInProgress['sales']) {
_tabSyncInProgress['sales'] = true;
syncSalesTab().finally(() => { _tabSyncInProgress['sales'] = false; });
}
break;
case 'sales':
if (typeof syncSalesTab === 'function' && !_tabSyncInProgress['sales']) {
_tabSyncInProgress['sales'] = true;
syncSalesTab().finally(() => { _tabSyncInProgress['sales'] = false; });
}
if (typeof syncProductionTab === 'function' && !_tabSyncInProgress['production']) {
_tabSyncInProgress['production'] = true;
syncProductionTab().finally(() => { _tabSyncInProgress['production'] = false; });
}
if (typeof syncCalculatorTab === 'function' && !_tabSyncInProgress['calculator']) {
_tabSyncInProgress['calculator'] = true;
syncCalculatorTab().finally(() => { _tabSyncInProgress['calculator'] = false; });
}
break;
case 'calculator':
if (typeof syncCalculatorTab === 'function' && !_tabSyncInProgress['calculator']) {
_tabSyncInProgress['calculator'] = true;
syncCalculatorTab().finally(() => { _tabSyncInProgress['calculator'] = false; });
}
break;
case 'factory':
if (typeof syncFactoryTab === 'function' && !_tabSyncInProgress['factory']) {
_tabSyncInProgress['factory'] = true;
syncFactoryTab().finally(() => { _tabSyncInProgress['factory'] = false; });
}
break;
case 'payments':
case 'entities':
if (typeof syncPaymentsTab === 'function' && !_tabSyncInProgress['payments']) {
_tabSyncInProgress['payments'] = true;
syncPaymentsTab().finally(() => { _tabSyncInProgress['payments'] = false; });
}
break;
case 'rep':
case 'clients':
if (typeof syncRepTab === 'function' && !_tabSyncInProgress['rep']) {
_tabSyncInProgress['rep'] = true;
syncRepTab().finally(() => { _tabSyncInProgress['rep'] = false; });
}
break;
case 'expenses':
case 'transactions':
if (typeof syncPaymentsTab === 'function' && !_tabSyncInProgress['payments']) {
_tabSyncInProgress['payments'] = true;
syncPaymentsTab().finally(() => { _tabSyncInProgress['payments'] = false; });
}
break;
case 'returns':
case 'production_record':
if (typeof syncProductionTab === 'function' && !_tabSyncInProgress['production']) {
_tabSyncInProgress['production'] = true;
syncProductionTab().finally(() => { _tabSyncInProgress['production'] = false; });
}
break;
case 'inventory':
if (typeof syncFactoryTab === 'function' && !_tabSyncInProgress['factory']) {
_tabSyncInProgress['factory'] = true;
syncFactoryTab().finally(() => { _tabSyncInProgress['factory'] = false; });
}
break;
case 'all':
[
['production', syncProductionTab],
['sales', syncSalesTab],
['calculator', syncCalculatorTab],
['factory', syncFactoryTab],
['payments', syncPaymentsTab],
['rep', syncRepTab]
].forEach(([t, fn]) => {
if (typeof fn === 'function' && !_tabSyncInProgress[t]) {
_tabSyncInProgress[t] = true;
fn().finally(() => { _tabSyncInProgress[t] = false; });
}
});
break;
}
});
syncCoreDisplays();
} catch (error) {
console.error('Tab sync failed.', _safeErr(error));
showToast('Tab sync failed: ' + (_safeErr(error).message || 'please reload the app'), 'error');
} finally {
syncState.isRefreshing = false;
if (syncState.pendingUpdates.size > 0) {
requestAnimationFrame(() => processSync());
}
}
}

export function getCurrentActiveTab() {
return currentActiveTab || 'prod';
}

export function syncCoreDisplays() {
try {
if (typeof updateUnitsAvailableIndicator === 'function') {
updateUnitsAvailableIndicator();
}
if (typeof calculateNetCash === 'function') {
calculateNetCash();
}
if (typeof calculateCashTracker === 'function') {
calculateCashTracker();
}
} catch (error) {
console.error('Calculation failed.', _safeErr(error));
showToast('Dashboard calculation failed: ' + (_safeErr(error).message || 'please reload the app'), 'error');
}
}

export async function syncCalculatorTab() {
try {
if (typeof loadSalesData === 'function') await loadSalesData(currentCompMode);
if (typeof autoFillTotalSoldQuantity === 'function') autoFillTotalSoldQuantity();
} catch (error) {
console.error('Failed to load sales data.', _safeErr(error));
showToast('Failed to load sales data: ' + (_safeErr(error).message || 'please try again'), 'error');
if (typeof loadSalesData === 'function') setTimeout(() => loadSalesData(currentCompMode), 500);
}
}

export async function syncFactoryTab() {
try {
if (typeof syncFactoryProductionStats === 'function') await syncFactoryProductionStats();
if (typeof window.calculateFactoryProduction === 'function') window.calculateFactoryProduction();
if (typeof updateFactoryUnitsAvailableStats === 'function') updateFactoryUnitsAvailableStats();
if (typeof updateFactorySummaryCard === 'function') updateFactorySummaryCard();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderFactoryHistory === 'function') renderFactoryHistory();
} catch (error) {
console.error('Failed to render data.', _safeErr(error));
showToast('Factory tab failed to render: ' + (_safeErr(error).message || 'please reload the app'), 'error');
if (typeof updateFactoryUnitsAvailableStats === 'function') setTimeout(updateFactoryUnitsAvailableStats, 500);
}
}

export async function syncPaymentsTab() {
try {
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof renderEntityTable === 'function') await renderEntityTable();
} catch (error) {
console.error('Payment tab refresh failed.', _safeErr(error));
showToast('Payments tab failed to load: ' + (_safeErr(error).message || 'please reload the app'), 'error');
if (typeof refreshPaymentTab === 'function') setTimeout(refreshPaymentTab, 500);
}
}

export async function syncProductionTab() {
try {
if (typeof refreshUI === 'function') refreshUI();
if (typeof updateMfgCharts === 'function') updateMfgCharts();
if (typeof calculateCustomerSale === 'function') calculateCustomerSale();
} catch (error) {
console.error('UI refresh failed.', _safeErr(error));
showToast('Production tab failed to refresh: ' + (_safeErr(error).message || 'please reload the app'), 'error');
if (typeof refreshUI === 'function') setTimeout(refreshUI, 500);
}
}

export async function syncSalesTab() {
try {
if (typeof calculateCustomerSale === 'function') calculateCustomerSale();
if (typeof refreshCustomerSales === 'function') refreshCustomerSales();
} catch (error) {
console.error('Customer data operation failed.', _safeErr(error));
showToast('Sales tab failed to refresh: ' + (_safeErr(error).message || 'please reload the app'), 'error');
if (typeof refreshCustomerSales === 'function') setTimeout(refreshCustomerSales, 500);
}
}

export async function syncRepTab() {
try {
if (typeof renderRepCustomerTable === 'function') await renderRepCustomerTable();
if (typeof calculateRepAnalytics === 'function') calculateRepAnalytics();
} catch (error) {
console.error('Rep tab refresh failed.', _safeErr(error));
showToast('Rep tab failed to refresh: ' + (_safeErr(error).message || 'please reload the app'), 'error');
if (typeof renderRepCustomerTable === 'function') setTimeout(renderRepCustomerTable, 500);
}
}

export function stopPeriodicSync() {
}

export const RefreshDebouncer = {
timers: {
production: null,
sales: null,
calculator: null,
factory: null,
payments: null,
rep: null
},
delays: {
production: 300,
sales: 300,
calculator: 200,
factory: 300,
payments: 300,
rep: 300
},
debounce(tab, callback) {
if (this.timers[tab]) {
clearTimeout(this.timers[tab]);
}
this.timers[tab] = setTimeout(() => {
callback();
this.timers[tab] = null;
}, this.delays[tab]);
},
immediate(tab, callback) {
if (this.timers[tab]) {
clearTimeout(this.timers[tab]);
this.timers[tab] = null;
}
callback();
}
};

window.debouncedRefreshUI = function() {
RefreshDebouncer.debounce('production', () => {
if (typeof refreshUI === 'function') refreshUI();
});
};

window.debouncedRefreshCustomerSales = function() {
RefreshDebouncer.debounce('sales', () => {
if (typeof refreshCustomerSales === 'function') refreshCustomerSales();
});
};

window.debouncedRefreshFactoryTab = function() {
RefreshDebouncer.debounce('factory', () => {
if (typeof refreshFactoryTab === 'function') refreshFactoryTab();
});
};

window.debouncedRefreshPaymentTab = function() {
RefreshDebouncer.debounce('payments', () => {
if (typeof refreshPaymentTab === 'function') refreshPaymentTab();
});
};

window.debouncedRefreshRepUI = function() {
RefreshDebouncer.debounce('rep', () => {
if (typeof refreshRepUI === 'function') refreshRepUI();
});
};

export async function reloadDataFromStorage() {
try {
await loadAllData();
} catch (error) {
console.error('Failed to load app data.', _safeErr(error));
showToast('Failed to load app data: ' + (_safeErr(error).message || 'please reload the app'), 'error');
}
}

window.forceSync = async function() {
await reloadDataFromStorage();
syncState.pendingUpdates.add('all');
processSync();
};

setTimeout(() => { try { triggerAutoSync(); } catch (_) {} }, 1000);

window._notifyOnTabChange = function(tab) {
setTimeout(() => {
if (typeof notifyDataChange === 'function') notifyDataChange(tab);
}, 150);
};

window.addEventListener('beforeunload', function() {
if (typeof stopPeriodicSync === 'function') stopPeriodicSync();
});

export let defaultSettings = {
production: {
...Object.fromEntries(DEFAULT_STORE_KEYS.map(k => [k, { cost: 0, sale: 0 }]))
},
get calculator() {
const calc = {};
salesRepsList.forEach(r => { calc[r.replace(/\s+/g, '_')] = { cost: 0, sale: 0 }; });
return calc;
},
sales: { cost: 0, sale: 0 }
};

export let mfgBarChart = null, mfgPieChart = null, salesPerfChart = null, salesCompChart = null;
export let custSalesChart = null, custPaymentChart = null;
export let storeComparisonChart = null;
export let indPerformanceChart = null;
export const _UI_STATE_KEY = 'ui';

export const _UI_DEFAULTS = {
  currentMfgMode: 'week',
  currentCompMode: 'all',
  currentCustomerChartMode: 'week',
  currentStore: getDefaultStoreKey(),
  currentStoreComparisonMetric: 'weight',
  currentIndMode: 'week',
  currentIndMetric: 'weight',
  currentOverviewMode: 'day',
  currentProductionView: 'store',
  currentFactoryEntryStore: getDefaultStoreKey(),
  currentFactorySummaryMode: 'daily',
  currentCashTrackerMode: 'day',
  currentSalesSummaryMode: 'day',
  currentPerfOverviewMode: 'day',
  currentRepAnalyticsMode: 'day',
  currentActiveTab: 'prod',
  custTransactionMode: 'sale',
  repTransactionMode: 'sale',
  entityViewMode: 'detailed',
  currentEntityId: null,
  currentExpenseOverlayName: null,
  editingFactoryInventoryId: null,
  editingEntityId: null,
  selectedEntityId: null,
  currentFactoryDate: localDateStr(),
};

export let _uiState = { ..._UI_DEFAULTS };

export function getUI(key) {
  return _uiState[key] !== undefined ? _uiState[key] : _UI_DEFAULTS[key];
}

export function setUI(key, val) {
  _uiState[key] = val;
  if (typeof sqliteStore !== 'undefined') {
    sqliteStore.set(_UI_STATE_KEY, _uiState).catch(() => {});
  }
}

export async function loadUIState() {
  if (typeof sqliteStore === 'undefined') return;
  try {
    const saved = await sqliteStore.get(_UI_STATE_KEY, null);
    if (saved && typeof saved === 'object') {
      _uiState = { ..._UI_DEFAULTS, ...saved };
    }
    (window.__uiSyncers || []).forEach(fn => { try { fn(); } catch (_) {} });
  } catch (_) {}
}

Object.defineProperties(window, {
  currentMfgMode:               { get: () => getUI('currentMfgMode'),               set: v => setUI('currentMfgMode', v),               configurable: true },
  currentCompMode:              { get: () => getUI('currentCompMode'),              set: v => setUI('currentCompMode', v),              configurable: true },
  currentCustomerChartMode:     { get: () => getUI('currentCustomerChartMode'),     set: v => setUI('currentCustomerChartMode', v),     configurable: true },
  currentStore:                 { get: () => getUI('currentStore'),                 set: v => setUI('currentStore', v),                 configurable: true },
  currentStoreComparisonMetric: { get: () => getUI('currentStoreComparisonMetric'), set: v => setUI('currentStoreComparisonMetric', v), configurable: true },
  currentIndMode:               { get: () => getUI('currentIndMode'),               set: v => setUI('currentIndMode', v),               configurable: true },
  currentIndMetric:             { get: () => getUI('currentIndMetric'),             set: v => setUI('currentIndMetric', v),             configurable: true },
  currentOverviewMode:          { get: () => getUI('currentOverviewMode'),          set: v => setUI('currentOverviewMode', v),          configurable: true },
  currentProductionView:        { get: () => getUI('currentProductionView'),        set: v => setUI('currentProductionView', v),        configurable: true },
  currentFactoryEntryStore:     { get: () => getUI('currentFactoryEntryStore'),     set: v => setUI('currentFactoryEntryStore', v),     configurable: true },
  currentFactorySummaryMode:    { get: () => getUI('currentFactorySummaryMode'),    set: v => setUI('currentFactorySummaryMode', v),    configurable: true },
  currentCashTrackerMode:       { get: () => getUI('currentCashTrackerMode'),       set: v => setUI('currentCashTrackerMode', v),       configurable: true },
  currentSalesSummaryMode:      { get: () => getUI('currentSalesSummaryMode'),      set: v => setUI('currentSalesSummaryMode', v),      configurable: true },
  currentPerfOverviewMode:      { get: () => getUI('currentPerfOverviewMode'),      set: v => setUI('currentPerfOverviewMode', v),      configurable: true },
  currentRepAnalyticsMode:      { get: () => getUI('currentRepAnalyticsMode'),      set: v => setUI('currentRepAnalyticsMode', v),      configurable: true },
  currentActiveTab:             { get: () => getUI('currentActiveTab'),             set: v => setUI('currentActiveTab', v),             configurable: true },
  custTransactionMode:          { get: () => getUI('custTransactionMode'),          set: v => setUI('custTransactionMode', v),          configurable: true },
  repTransactionMode:           { get: () => getUI('repTransactionMode'),           set: v => setUI('repTransactionMode', v),           configurable: true },
  entityViewMode:               { get: () => getUI('entityViewMode'),               set: v => setUI('entityViewMode', v),               configurable: true },
  currentEntityId:              { get: () => getUI('currentEntityId'),              set: v => setUI('currentEntityId', v),              configurable: true },
  currentExpenseOverlayName:    { get: () => getUI('currentExpenseOverlayName'),    set: v => setUI('currentExpenseOverlayName', v),    configurable: true },
  editingFactoryInventoryId:    { get: () => getUI('editingFactoryInventoryId'),    set: v => setUI('editingFactoryInventoryId', v),    configurable: true },
  editingEntityId:              { get: () => getUI('editingEntityId'),              set: v => setUI('editingEntityId', v),              configurable: true },
  selectedEntityId:             { get: () => getUI('selectedEntityId'),             set: v => setUI('selectedEntityId', v),             configurable: true },
  currentFactoryDate:           { get: () => getUI('currentFactoryDate'),           set: v => setUI('currentFactoryDate', v),           configurable: true },
});

export const splashQuotes = (typeof window !== 'undefined' && window.__splashQuotes) || [];

export function initSplashScreen() {
if (typeof window.__splashTryHide === 'function') window.__splashTryHide();
}

export function updatePaymentStatusVisibility() {
}

export function recordEntry(...a) { return confirmGuard('recordEntry', () => runExclusive('recordEntry', () => _recordEntryImpl(...a)), { label: 'Production Entry', late: true, fields: [['storeSelector', 'Store'], ['sys-date', 'Date'], ['gross-wt', 'Gross Weight'], ['cont-wt', 'Container'], ['net-wt', 'Net Weight'], ['formula-units', 'Units']], editKinds: ['prod'] }); }

async function _recordEntryImpl() {
const _ed = getEditCtx('prod');
const { production, returns, sales } = await loadCollections('production', 'returns', 'sales');
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('prod')) {
window.notifyBlocking('Access Denied — Production not in your assigned tabs', 'warning', 'Warning'); return;
}
const netElement = document.getElementById('net-wt');
const dateElement = document.getElementById('sys-date');
const storeElement = document.getElementById('storeSelector');
const formulaUnitsElement = document.getElementById('formula-units');
const grossWtEl = document.getElementById('gross-wt');
const contWtEl = document.getElementById('cont-wt');
if (!netElement || !dateElement || !storeElement || !formulaUnitsElement) {
window.notifyBlocking('Form error: Missing required fields', 'error', 'Something went wrong');
return;
}
const net = parseFloat(netElement.value) || 0;
const grossWt = parseFloat(grossWtEl ? grossWtEl.value : 0) || 0;
const contWt = parseFloat(contWtEl ? contWtEl.value : 0) || 0;
const inputDate = dateElement.value;
const store = storeElement.value;
const formulaUnits = parseFloat(formulaUnitsElement.value) || 0;
const formulaId = await getStorePool(store);
const salePrice = await getSalePriceForStore(store);
const validation = await validateFormulaAvailability(store, formulaUnits);
const _unitCredit = (_ed && _ed.original.formulaId === formulaId) ? (_ed.original.formulaUnits || 0) : 0;
if (!validation.sufficient && !(_ed && validation.available + _unitCredit + 1e-9 >= formulaUnits)) {
window.notifyBlocking(`Not enough formula units at ${(typeof window.getStoreLabel === 'function' && window.getStoreLabel(store)) || store}\nAvailable: ${fmtNum(validation.available)} units\nRequested: ${fmtNum(formulaUnits)} units\nShortage: ${fmtNum(Math.max(0, formulaUnits - validation.available))} units`, 'error', 'Low formula units');
return;
}
if (_ed) {
const o = _ed.original;
const sameBucket = o.store === store && o.date === inputDate;
const prodOld = production.filter(p => p && !p.isReturn && p.id !== o.id && p.date === o.date && p.store === o.store).reduce((a, p) => a + (p.net || 0), 0) + (sameBucket ? net : 0);
const retOld = returns.filter(r => r && r.date === o.date && r.store === o.store).reduce((a, r) => a + (r.quantity || 0), 0);
const soldOld = sales.filter(s => s && (s.supplyDate || s.date) === o.date && s.supplyStore === o.store).reduce((a, s) => a + (s.quantity || 0), 0);
if (prodOld + retOld - soldOld < -1e-6) {
window.notifyBlocking(` Cannot reduce this entry: ${fmtNum(soldOld - prodOld - retOld)} kg already sold from ${o.date}. Reduce or delete those sales first.`, 'warning', 'Warning');
return;
}
}
let costData = await calculateDynamicCost(store, formulaUnits, net);
if (_ed && _ed.original.formulaId === costData.formulaId && Array.isArray(_ed.original.formulaMaterials) && _ed.original.formulaUnits > 0 && _ed.original.formulaCost > 0 && net > 0) {
const _frozenUnit = _ed.original.formulaCost / _ed.original.formulaUnits;
costData = { ...costData, costPerUnit: _frozenUnit, totalFormulaCost: _frozenUnit * formulaUnits, dynamicCostPerKg: (_frozenUnit * formulaUnits) / net, formulaName: _ed.original.formulaName || costData.formulaName, formulaMaterials: _ed.original.formulaMaterials };
}
if (net <= 0) {
window.notifyBlocking('Net production must be greater than zero. Please check weights.', 'warning', 'Warning');
return;
}
if (!inputDate) {
window.notifyBlocking('Please select a date.', 'warning', 'Warning');
return;
}
if (salePrice <= 0) {
window.notifyBlocking('Please set a sale price in Factory Formulas first.', 'warning', 'Warning');
return;
}
if (formulaUnits <= 0) {
window.notifyBlocking('Please enter formula units used.', 'warning', 'Low formula units');
return;
}
if (!(await window.gcCommit({ lead: _ed ? 'Update this production entry?' : 'Save this production entry?', lines: [`Total Cost: ${fmtAmt(net * costData.dynamicCostPerKg)}`, `Net Profit: ${fmtAmt(net * salePrice - net * costData.dynamicCostPerKg)}`] }))) return;
const totalCost = net * costData.dynamicCostPerKg;
const totalSale = net * salePrice;
const profit = totalSale - totalCost;
let paymentStatus = 'CASH';
const now = new Date();
const timeString = formatTime12(now);
let prodId = _ed ? _ed.id : generateUUID('prod');
if (!validateUUID(prodId)) {
prodId = generateUUID('prod');
}
const prodCreatedAt = getTimestamp();
let newEntry = {
id: prodId,
createdAt: prodCreatedAt,
updatedAt: prodCreatedAt,
date: inputDate,
time: timeString,
store: store,
net,
cp: costData.dynamicCostPerKg,
sp: salePrice,
totalCost,
totalSale,
profit,
formulaUnits: formulaUnits,
formulaId: costData.formulaId,
formulaName: costData.formulaName,
formulaMaterials: costData.formulaMaterials,
formulaCost: costData.totalFormulaCost,
grossWt: grossWt || 0,
contWt: contWt || 0,
paymentStatus: paymentStatus,
timestamp: prodCreatedAt,
recordDate: new Date(inputDate).getTime(),
syncedAt: new Date().toISOString(),
managedBy: (appMode === 'production' && window._assignedManagerName) ? window._assignedManagerName : null,
createdBy: (appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null,
photoKeys: getProdPhotoKeys(prodId)
};
if (newEntry.photoKeys.length === 0) delete newEntry.photoKeys;
if (_ed) {
const o = _ed.original;
stampEdit(newEntry, o);
newEntry.time = o.time;
newEntry.paymentStatus = o.paymentStatus || newEntry.paymentStatus;
if (o.managedBy) newEntry.managedBy = o.managedBy;
}
newEntry = ensureRecordIntegrity(newEntry, !!_ed);
const _edIdx = _ed ? production.findIndex(r => r && r.id === _ed.id) : -1;
try {
if (_ed) replaceRecord(production, newEntry); else production.push(newEntry);
await unifiedSave('production', production, newEntry);
await persistProdPhotos(prodId, _ed ? (_ed.original.photoKeys || []) : []);
notifyDataChange('production');
emitSyncUpdate({ production: null});
} catch (error) {
if (_ed && _edIdx >= 0) production[_edIdx] = _ed.original; else production.pop();
window.notifyBlocking(" Failed to save production entry. Please try again.", 'error', 'Something went wrong');
return;
}
await syncFactoryProductionStats().catch(e => console.warn('[saveProductionEntry] stats failed:', _safeErr(e)));
const _clearGrossWt = document.getElementById('gross-wt');
const _clearContWt = document.getElementById('cont-wt');
const _clearNetWt = document.getElementById('net-wt');
const formulaUnitsEl = document.getElementById('formula-units');
const displayCostValue = document.getElementById('display-cost-value');
const profitPerKg = document.getElementById('profit-per-kg');
const formulaUnitCostDisplay = document.getElementById('formula-unit-cost-display');
const totalFormulaCostDisplay = document.getElementById('total-formula-cost-display');
const dynamicCostPerKg = document.getElementById('dynamic-cost-per-kg');
if (_clearGrossWt) _clearGrossWt.value = '';
if (_clearContWt) _clearContWt.value = '';
if (_clearNetWt) _clearNetWt.value = '';
if (formulaUnitsEl) formulaUnitsEl.value = '1';
if (displayCostValue) displayCostValue.innerText = '0';
if (profitPerKg) profitPerKg.innerText = '0';
if (formulaUnitCostDisplay) formulaUnitCostDisplay.innerText = '0/unit';
if (totalFormulaCostDisplay) totalFormulaCostDisplay.innerText = '0';
if (dynamicCostPerKg) dynamicCostPerKg.innerText = '0/kg';
if (_ed) endEditMode();
await refreshUI();
if (typeof window.calculateDynamicProductionCost === 'function') await window.calculateDynamicProductionCost();
calculateNetCash();
calculateCashTracker();
showToast(_ed ? "Production record updated!" : "Production record saved successfully!", "success");
}

export async function registerDeletion(id, collectionName = 'unknown', preDeletedRecord = null) {
const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
if (!id) {
return;
}
if (!validateUUID(id)) {
return;
}
const now = getTimestamp();
let _snapshot;
if (preDeletedRecord && typeof preDeletedRecord === 'object') {
  const tempResult = { displayName: null, displayDetail: null, displayAmount: null, record: preDeletedRecord };
  const s = preDeletedRecord;
  switch (collectionName) {
    case 'sales':
      tempResult.displayName   = s.customerName || s.name || 'Unknown Customer';
      tempResult.displayDetail = [s.supplyStore || s.store || '', s.paymentType ? (s.paymentType === 'CASH' ? 'Cash' : s.paymentType === 'CREDIT' ? 'Credit' : s.paymentType) : '', s.date || ''].filter(Boolean).join(' · ');
      tempResult.displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : (s.quantity ? `${s.quantity} kg` : null);
      break;
    case 'transactions':
      if (s.isTransfer === true) {
        tempResult.displayName   = `Transfer – ${s.entityName || '?'} ${s.type === 'OUT' ? '→' : '←'} ${s.transferPeerEntityName || '?'}`;
        tempResult.displayDetail = [s.type === 'IN' ? '↓ IN' : s.type === 'OUT' ? '↑ OUT' : (s.type || ''), s.date || ''].filter(Boolean).join(' · ');
        tempResult.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
      } else {
        tempResult.displayName   = s.entityName || s.name || s.description || 'Unknown Transaction';
        tempResult.displayDetail = [s.type === 'IN' ? '↓ IN' : s.type === 'OUT' ? '↑ OUT' : (s.type || ''), s.date || ''].filter(Boolean).join(' · ');
        tempResult.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : (s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null);
      }
      break;
    case 'rep':
      tempResult.displayName   = s.customerName || s.name || 'Unknown Rep Customer';
      tempResult.displayDetail = [s.salesRep ? `Rep: ${s.salesRep}` : '', s.paymentType === 'COLLECTION' ? 'Collection' : s.paymentType === 'CREDIT' ? 'Credit' : s.paymentType === 'CASH' ? 'Cash' : (s.paymentType || ''), s.date || ''].filter(Boolean).join(' · ');
      tempResult.displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : (s.quantity ? `${s.quantity} kg` : null);
      break;
    case 'expenses':
      tempResult.displayName   = s.name || s.description || 'Unknown Expense';
      tempResult.displayDetail = [s.category || '', s.date || ''].filter(Boolean).join(' · ');
      tempResult.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
      break;
    case 'customers':
      tempResult.displayName   = s.name || null;
      tempResult.displayDetail = s.phone ? ` ${s.phone}` : '';
      break;
    case 'clients':
      tempResult.displayName   = s.name || null;
      tempResult.displayDetail = [s.salesRep ? `Rep: ${s.salesRep}` : '', s.phone || ''].filter(Boolean).join(' · ');
      break;
    case 'production':
      if (s.isTransfer === true) {
        const _dir  = s.transferDirection === 'out' ? 'Transfer Out' : 'Transfer In';
        const _peer = s.transferPeerStore ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.transferPeerStore) : s.transferPeerStore) : '';
        const _self = s.store ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.store) : s.store) : '';
        tempResult.displayName   = _peer ? `${_dir} – ${_self} ${s.transferDirection === 'out' ? '→' : '←'} ${_peer}` : `${_dir} – ${_self || 'Stock Transfer'}`;
        tempResult.displayDetail = s.date || '';
        tempResult.displayAmount = s.net != null ? `${Math.abs(s.net)} kg` : null;
      } else {
        tempResult.displayName   = s.store ? `Production – ${getStoreLabel ? getStoreLabel(s.store) : s.store}` : 'Production Batch';
        tempResult.displayDetail = s.date || '';
        tempResult.displayAmount = s.net != null ? `${s.net} kg` : null;
      }
      break;
    case 'factory':
      tempResult.displayName   = s.store ? `Factory – ${getStoreLabel ? getStoreLabel(s.store) : s.store}` : 'Factory Production';
      tempResult.displayDetail = s.date || '';
      tempResult.displayAmount = s.units != null ? `${s.units} units` : null;
      break;
    case 'returns':
      tempResult.displayName   = s.store ? `Return – ${getStoreLabel ? getStoreLabel(s.store) : s.store}` : 'Stock Return';
      tempResult.displayDetail = s.date || '';
      tempResult.displayAmount = s.quantity != null ? `${s.quantity} kg` : null;
      break;
    case 'inventory':
      tempResult.displayName   = s.name || 'Inventory Item';
      tempResult.displayDetail = s.supplierName ? `Supplier: ${s.supplierName}` : '';
      tempResult.displayAmount = s.quantity != null ? `${s.quantity} kg` : null;
      break;
    case 'daily_ledger':
    case 'formulas':
      Object.assign(tempResult, describeBinRecord(collectionName, s, fmtNum));
      break;
    case 'calculator':
      tempResult.displayName   = s.customerName || s.customer || s.name || 'Calculator Entry';
      tempResult.displayDetail = s.supplyStore || s.store || '';
      tempResult.displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null;
      break;
    case 'entities':
      tempResult.displayName   = s.name || 'Payment Entity';
      tempResult.displayDetail = s.phone ? ` ${s.phone}` : (s.type || '');
      break;
    default:
      tempResult.displayName   = s.name || s.customerName || s.entityName || s.description || null;
      tempResult.displayDetail = s.date || null;
      tempResult.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
  }
  _snapshot = tempResult;
} else {
  _snapshot = await _captureRecordSnapshot(id, collectionName);
}
const deletionRecord = {
id: id,
recordId: id,
recordType: collectionName,
deletedAt: now,
collection: collectionName,
syncedToCloud: false,
tombstoned_at: now,
deleted_by: (() => {
  const _mode = typeof appMode !== 'undefined' ? appMode : 'admin';
  if (_mode === 'rep') return (typeof currentRepProfile !== 'undefined' && currentRepProfile) ? currentRepProfile : 'Sales Rep';
  if (_mode === 'userrole' || _mode === 'production' || _mode === 'factory') return (window._assignedManagerName) ? window._assignedManagerName : (_mode === 'userrole' ? 'User Role' : _mode === 'production' ? 'Production' : 'Factory');
  return 'Admin';
})(),
deletion_version: '2.0',
displayName: _snapshot.displayName || null,
displayDetail: _snapshot.displayDetail || null,
displayAmount: _snapshot.displayAmount || null,
snapshot: _snapshot.record || null,
};
if (collectionName === 'entities') {
  try {
    const _entPhAll = (await sqliteStore.get('photos')) || {};
    const _entPhV = _entPhAll['entity:' + id];
    if (_entPhV && String(_entPhV).length < 700000) deletionRecord._photos = { ['entity:' + id]: _entPhV };
  } catch (_entPhErr) { console.warn('[registerDeletion] entity photo snapshot failed', _entPhErr); }
}
if (collectionName === 'expenses' || collectionName === 'transactions') {
  try {
    const _regPh = (await sqliteStore.get('photos')) || {};
    const _regKeys = ['expense:' + id];
    const _snapRec = _snapshot.record || null;
    if (_snapRec && _snapRec.expenseId) _regKeys.push('expense:' + _snapRec.expenseId);
    const _regPhotos = {};
    let _regBytes = 0;
    for (const k of _regKeys) {
      const v = _regPh[k];
      if (v && _regBytes + String(v).length < 700000) { _regPhotos[k] = v; _regBytes += String(v).length; }
    }
    if (_regPh['expense:' + id] && String(_regPh['expense:' + id]).length < 700000) deletionRecord._photoDataUrl = _regPh['expense:' + id];
    if (Object.keys(_regPhotos).length) deletionRecord._photos = _regPhotos;
  } catch(_regPhErr) { console.warn('[registerDeletion] photo snapshot failed', _regPhErr); }
}
if (!validateTimestamp(deletionRecord.deletedAt, false)) {
deletionRecord.deletedAt = now;
deletionRecord.tombstoned_at = now;
}
deletedRecordIds.add(id);
const _sid = String(id);
const existingIndex = deletionRecords.findIndex(r => String(r.id) === _sid || String(r.recordId) === _sid);
if (existingIndex >= 0) {
deletionRecords[existingIndex] = deletionRecord;
} else {
deletionRecords.push(deletionRecord);
}
const _deduped = dedupDeletionRecords(deletionRecords);
await sqliteStore.set('deletions', _deduped);
await sqliteStore.set('deleted', Array.from(deletedRecordIds));
triggerAutoSync();
uploadDeletionToCloud(deletionRecord).catch(e => console.warn('[registerDeletion] cloud upload failed:', _safeErr(e)));
cleanupOldDeletions().catch(e => console.warn('[registerDeletion] cleanup failed:', _safeErr(e)));
}

export async function _captureRecordSnapshot(id, collectionName) {
const { production, sales, rep, calculator, returns, expenses, entities, transactions, inventory, factory } = await loadCollections('production', 'sales', 'rep', 'calculator', 'returns', 'expenses', 'entities', 'transactions', 'inventory', 'factory');
  const result = { displayName: null, displayDetail: null, displayAmount: null, record: null };
  try {
    let record = null;
    const searches = [
      [sales,            r => r.id === id],
      [transactions,      r => r.id === id],
      [rep,                 r => r.id === id],
      [expenses,           r => r.id === id],
      [production,                       r => r.id === id],
      [factory, r => r.id === id],
      [returns,             r => r.id === id],
      [calculator,             r => r.id === id],
      [entities,          r => r.id === id],
      [inventory,     r => r.id === id],
    ];
    for (const [arr, pred] of searches) {
      if (Array.isArray(arr)) { record = arr.find(pred); if (record) break; }
    }
    if (!record) return result;
    result.record = record;
    switch (collectionName) {
      case 'sales':
        result.displayName   = record.customerName || record.name || 'Unknown Customer';
        result.displayDetail = [
          record.supplyStore || record.store || '',
          record.paymentType ? (record.paymentType === 'CASH' ? 'Cash' : record.paymentType === 'CREDIT' ? 'Credit' : record.paymentType) : '',
          record.date || ''
        ].filter(Boolean).join(' · ');
        result.displayAmount = record.totalValue != null ? `₨${fmtNum(record.totalValue)}` : (record.quantity ? `${record.quantity} kg` : null);
        break;
      case 'transactions':
        if (record.isTransfer === true) {
          result.displayName   = `Transfer – ${record.entityName || '?'} ${record.type === 'OUT' ? '→' : '←'} ${record.transferPeerEntityName || '?'}`;
          result.displayDetail = [
            record.type === 'IN' ? '↓ IN' : record.type === 'OUT' ? '↑ OUT' : (record.type || ''),
            record.date || ''
          ].filter(Boolean).join(' · ');
          result.displayAmount = record.amount != null ? `₨${fmtNum(record.amount)}` : null;
        } else {
          result.displayName   = record.entityName || record.description || record.name || 'Unknown Entity';
          result.displayDetail = [
            record.type === 'IN' ? '↓ IN' : record.type === 'OUT' ? '↑ OUT' : (record.type || ''),
            record.date || ''
          ].filter(Boolean).join(' · ');
          result.displayAmount = record.amount != null ? `₨${fmtNum(record.amount)}` : (record.totalValue != null ? `₨${fmtNum(record.totalValue)}` : null);
        }
        break;
      case 'rep':
        result.displayName   = record.customerName || record.name || 'Unknown Rep Customer';
        result.displayDetail = [
          record.salesRep ? `Rep: ${record.salesRep}` : '',
          record.paymentType === 'COLLECTION' ? 'Collection' : record.paymentType === 'CREDIT' ? 'Credit' : record.paymentType === 'CASH' ? 'Cash' : (record.paymentType || ''),
          record.date || ''
        ].filter(Boolean).join(' · ');
        result.displayAmount = record.totalValue != null ? `₨${fmtNum(record.totalValue)}` : (record.quantity ? `${record.quantity} kg` : null);
        break;
      case 'expenses':
        result.displayName   = record.name || 'Unknown Expense';
        result.displayDetail = record.category || '';
        result.displayAmount = record.amount != null ? `₨${fmtNum(record.amount)}` : null;
        break;
      case 'production':
        if (record.isTransfer === true) {
          const _dir  = record.transferDirection === 'out' ? 'Transfer Out' : 'Transfer In';
          const _peer = record.transferPeerStore ? (typeof getStoreLabel === 'function' ? getStoreLabel(record.transferPeerStore) : record.transferPeerStore) : '';
          const _self = record.store ? (typeof getStoreLabel === 'function' ? getStoreLabel(record.store) : record.store) : '';
          result.displayName   = _peer ? `${_dir} – ${_self} ${record.transferDirection === 'out' ? '→' : '←'} ${_peer}` : `${_dir} – ${_self || 'Stock Transfer'}`;
          result.displayDetail = record.date || '';
          result.displayAmount = record.net != null ? `${Math.abs(record.net)} kg` : null;
        } else {
          result.displayName   = record.store ? `Store ${record.store}` : 'Production Batch';
          result.displayDetail = record.date || '';
          result.displayAmount = record.net != null ? `${record.net} kg net` : null;
        }
        break;
      case 'factory':
        result.displayName   = record.store ? `Factory – ${record.store}` : 'Factory Production';
        result.displayDetail = record.date || '';
        result.displayAmount = record.units != null ? `${record.units} units` : null;
        break;
      case 'returns':
        result.displayName   = record.store ? `Return – ${record.store}` : 'Stock Return';
        result.displayDetail = record.date || '';
        result.displayAmount = record.quantity != null ? `${record.quantity} kg` : null;
        break;
      case 'calculator':
        result.displayName   = record.customerName || record.customer || 'Calculator Entry';
        result.displayDetail = record.store || record.supplyStore || '';
        result.displayAmount = record.totalValue != null ? `₨${fmtNum(record.totalValue)}` : null;
        break;
      case 'inventory':
        result.displayName   = record.name || 'Inventory Item';
        result.displayDetail = record.supplierName ? `Supplier: ${record.supplierName}` : '';
        result.displayAmount = record.quantity != null ? `${record.quantity} kg` : null;
        break;
      case 'customers':
        result.displayName   = record.name || null;
        result.displayDetail = record.phone ? ` ${record.phone}` : '';
        result.displayAmount = null;
        break;
      case 'clients':
        result.displayName   = record.name || null;
        result.displayDetail = [record.salesRep ? `Rep: ${record.salesRep}` : '', record.phone || ''].filter(Boolean).join(' · ');
        result.displayAmount = null;
        break;
      case 'entities':
        result.displayName   = record.name || 'Payment Entity';
        result.displayDetail = record.phone ? ` ${record.phone}` : (record.type || '');
        result.displayAmount = null;
        break;
      default:
        result.displayName   = record.name || record.customerName || record.entityName || record.description || null;
        result.displayDetail = record.date || null;
        result.displayAmount = record.amount != null ? `₨${fmtNum(record.amount)}` : null;
    }
  } catch(e) {   }
  return result;
}

_captureRecordSnapshot._fromObj = function(snapshotObj, collectionName) {
  const result = { displayName: null, displayDetail: null, displayAmount: null };
  if (!snapshotObj) return result;
  const s = snapshotObj;
  try {
    switch (collectionName) {
      case 'sales':
        result.displayName   = s.customerName || s.name || null;
        result.displayDetail = [s.supplyStore || s.store || '', s.paymentType || '', s.date || ''].filter(Boolean).join(' · ');
        result.displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null;
        break;
      case 'rep':
        result.displayName   = s.customerName || s.name || null;
        result.displayDetail = [s.salesRep ? `Rep: ${s.salesRep}` : '', s.paymentType || '', s.date || ''].filter(Boolean).join(' · ');
        result.displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null;
        break;
      case 'transactions':
        if (s.isTransfer === true) {
          result.displayName = `Transfer – ${s.entityName || '?'} ${s.type === 'OUT' ? '→' : '←'} ${s.transferPeerEntityName || '?'}`;
        } else {
          result.displayName = s.entityName || s.description || s.name || null;
        }
        result.displayDetail = [s.type === 'IN' ? '↓ IN' : s.type === 'OUT' ? '↑ OUT' : (s.type || ''), s.date || ''].filter(Boolean).join(' · ');
        result.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
        break;
      case 'expenses':
        result.displayName   = s.name || s.description || null;
        result.displayDetail = [s.category || '', s.date || ''].filter(Boolean).join(' · ');
        result.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
        break;
      case 'production':
        if (s.isTransfer === true) {
          const _dir  = s.transferDirection === 'out' ? 'Transfer Out' : 'Transfer In';
          const _peer = s.transferPeerStore ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.transferPeerStore) : s.transferPeerStore) : '';
          const _self = s.store ? (typeof getStoreLabel === 'function' ? getStoreLabel(s.store) : s.store) : '';
          result.displayName   = _peer ? `${_dir} – ${_self} ${s.transferDirection === 'out' ? '→' : '←'} ${_peer}` : `${_dir} – ${_self || 'Stock Transfer'}`;
          result.displayAmount = s.net != null ? `${Math.abs(s.net)} kg` : null;
        } else {
          result.displayName   = s.store ? `Production – ${s.store}` : 'Production Batch';
          result.displayAmount = s.net != null ? `${s.net} kg` : null;
        }
        result.displayDetail = s.date || '';
        break;
      case 'returns':
        result.displayName   = s.store ? `Return – ${s.store}` : 'Stock Return';
        result.displayDetail = s.date || '';
        result.displayAmount = s.quantity != null ? `${s.quantity} kg` : null;
        break;
      case 'factory':
        result.displayName   = s.store ? `Factory – ${s.store}` : 'Factory Production';
        result.displayDetail = s.date || '';
        result.displayAmount = s.units != null ? `${s.units} units` : null;
        break;
      case 'calculator':
        result.displayName   = s.customerName || s.customer || s.name || 'Calculator Entry';
        result.displayDetail = s.supplyStore || s.store || '';
        result.displayAmount = s.totalValue != null ? `₨${fmtNum(s.totalValue)}` : null;
        break;
      case 'inventory':
        result.displayName   = s.name || 'Inventory Item';
        result.displayDetail = s.supplierName ? `Supplier: ${s.supplierName}` : '';
        result.displayAmount = s.quantity != null ? `${s.quantity} kg` : null;
        break;
      case 'customers':
        result.displayName   = s.name || null;
        result.displayDetail = s.phone ? ` ${s.phone}` : '';
        result.displayAmount = null;
        break;
      case 'clients':
        result.displayName   = s.name || null;
        result.displayDetail = [s.salesRep ? `Rep: ${s.salesRep}` : '', s.phone || ''].filter(Boolean).join(' · ');
        result.displayAmount = null;
        break;
      case 'entities':
        result.displayName   = s.name || 'Payment Entity';
        result.displayDetail = s.phone ? ` ${s.phone}` : (s.type || '');
        result.displayAmount = null;
        break;
      default:
        result.displayName   = s.name || s.customerName || s.entityName || s.description || null;
        result.displayDetail = s.date || null;
        result.displayAmount = s.amount != null ? `₨${fmtNum(s.amount)}` : null;
    }
  } catch(e) {   }
  return result;
};

export async function uploadDeletionToCloud(deletionRecord) {
const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
if (!firebaseDB || typeof currentUser === 'undefined' || !currentUser) {
return;
}
if (window._firestoreNetworkDisabled || !navigator.onLine) {
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.add({
action: 'delete',
collection: deletionRecord.collection !== 'unknown' ? deletionRecord.collection : null,
docId: String(deletionRecord.id),
recordType: deletionRecord.collection,
data: null
});
}
return;
}
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const batch = firebaseDB.batch();
const deletionsRef = userRef.collection('deletions').doc(String(deletionRecord.id));
batch.set(deletionsRef, {
id: String(deletionRecord.id),
recordId: String(deletionRecord.id),
deletedAt: firebase.firestore.Timestamp.fromMillis(deletionRecord.deletedAt),
collection: deletionRecord.collection,
recordType: deletionRecord.collection,
expiresAt: firebase.firestore.Timestamp.fromMillis(deletionRecord.deletedAt + (90 * 24 * 60 * 60 * 1000)),
displayName: deletionRecord.displayName || null,
displayDetail: deletionRecord.displayDetail || null,
displayAmount: deletionRecord.displayAmount || null,
snapshot: deletionRecord.snapshot ? (typeof sanitizeForFirestore === 'function' ? sanitizeForFirestore({...deletionRecord.snapshot}) : deletionRecord.snapshot) : null,
deleted_by: deletionRecord.deleted_by || 'user',
deletion_version: deletionRecord.deletion_version || '2.0'
});
if (deletionRecord.collection && deletionRecord.collection !== 'unknown') {
const itemRef = userRef.collection(deletionRecord.collection).doc(String(deletionRecord.id));
batch.delete(itemRef);
}
await batch.commit();
trackFirestoreWrite(2);
if (Array.isArray(deletionRecords)) {
const index = deletionRecords.findIndex(r => String(r.id) === String(deletionRecord.id) || String(r.recordId) === String(deletionRecord.id));
if (index > -1) {
deletionRecords[index].syncedToCloud = true;
await sqliteStore.set('deletions', deletionRecords);
}
}
} catch (error) {
console.warn('[uploadDeletion] cloud commit failed, queuing for retry:', _safeErr(error));
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.add({
action: 'delete',
collection: deletionRecord.collection !== 'unknown' ? deletionRecord.collection : null,
docId: String(deletionRecord.id),
recordType: deletionRecord.collection,
data: null
});
}
}
}

export async function cleanupOldDeletions() {
const deletionRecords = ensureArray(await sqliteStore.get('deletions'));
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
const validDeletions = deletionRecords.filter(record => record.deletedAt > threeMonthsAgo);
if (validDeletions.length !== deletionRecords.length) {
const expiredRecs = deletionRecords.filter(r => r.deletedAt <= threeMonthsAgo);
const expiredIds = new Set(expiredRecs.map(r => r.id));
for (const r of expiredRecs) {
  try { if ((r.collection || r.recordType) === 'production' && r.snapshot) await deleteProdPhotos(r.snapshot); }
  catch (_e) { console.warn('[cleanupOldDeletions] photo cleanup failed', _safeErr(_e)); }
}
expiredIds.forEach(id => deletedRecordIds.delete(id));
await sqliteStore.set('deletions', validDeletions);
await sqliteStore.set('deleted', Array.from(deletedRecordIds));
}
if (firebaseDB && typeof currentUser !== 'undefined' && currentUser &&
!window._firestoreNetworkDisabled && navigator.onLine) {
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const expiredQuery = userRef.collection('deletions')
.where('expiresAt', '<=', firebase.firestore.Timestamp.now());
const snapshot = await expiredQuery.get();
if (!snapshot.empty) {
const batch = firebaseDB.batch();
snapshot.docs.forEach(doc => {
batch.delete(doc.ref);
});
await batch.commit();
}
} catch (error) {
console.warn('[cleanupOldDeletions] cloud cleanup failed, will retry when online:', _safeErr(error));
}
}
}

export async function _buildPreclosePanel(record, type, panelId) {
  const ms  = record.mergedSummary || {};
  const dr  = ms.dateRange || {};
  const fmt = async (v) => (v != null && v !== '' && !isNaN(Number(v))) ? await formatCurrency(v) : '—';
  const fmtDate = (d) => d ? (formatDayMonthYear(new Date(d)) || '—') : '—';
  const row = (label, v, cls) =>
    `<div class="txn-preclose-row"><span class="txn-preclose-label">${label}</span><span class="txn-preclose-val${cls ? ' '+cls : ''}">${v}</span></div>`;
  const sec = (t) => `<div class="txn-preclose-section">${t}</div>`;
  const fromDate = fmtDate(dr.from);
  const toDate   = fmtDate(dr.to);
  const recCount = ms.recordCount || record.mergedRecordCount || '—';
  let html = sec('<svg width="13" height="13" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-abe84e9 d-inline-block"><rect x="4" y="7" width="28" height="25" rx="4.5" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round"/><path d="M4.85 11.5A3.6 3.6 0 0 1 8.4 8H27.6A3.6 3.6 0 0 1 31.2 11.5V15H4.85Z" fill="var(--accent)" fill-opacity=".3"/><path d="M11 3.8V10M25 3.8V10" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="20" r="1.5" fill="var(--accent)" opacity="0.8"/><circle cx="18" cy="20" r="1.5" fill="var(--accent)" opacity="0.8"/><circle cx="24" cy="20" r="1.5" fill="var(--accent)" opacity="0.8"/><circle cx="12" cy="25.5" r="1.5" fill="var(--accent)" opacity="0.8"/><circle cx="18" cy="25.5" r="1.5" fill="var(--accent)" opacity="0.8"/><circle cx="24" cy="25.5" r="1.5" fill="var(--accent-gold)" opacity="0.8"/></svg>Year-Close Overview');
  html += row('Period',          `${fromDate} → ${toDate}`, 'muted');
  html += row('Transactions',    `${recCount} merged`, 'purple');
  html += row('Merge Date',      fmtDate(record.date), 'muted');
  if (type === 'sale') {
    const storeLabel = typeof getStoreLabel === 'function'
      ? getStoreLabel(record.supplyStore || getDefaultStoreKey()) : (record.supplyStore || '—');
    if (record.quantity > 0 || record.totalValue > 0) {
      html += sec('Sales Volume');
      if (record.quantity > 0)   html += row('Total Quantity',  `${fmtNum(record.quantity)} kg`);
      if (record.unitPrice > 0)  html += row('Unit Price',      `${await fmt(record.unitPrice)}/kg`);
      if (record.supplyStore)    html += row('Supply Store',    storeLabel, 'muted');
      html += row('Gross Sale Value', await fmt(record.totalValue));
    }
    html += sec('Sales Breakdown');
    if (ms.cashSales    != null) html += row('Cash Sales',         await fmt(ms.cashSales),    'green');
    if (ms.unpaidCredit  > 0)    html += row('Credit (Unpaid)',    await fmt(ms.unpaidCredit), 'red');
    if (ms.oldDebt       > 0)    html += row('Old Debt Carried',  await fmt(ms.oldDebt),      'warn');
    html += sec('Payments & Collections');
    if (ms.collectionsReceived > 0) html += row('Collections Received', await fmt(ms.collectionsReceived), 'green');
    if (ms.partialPayments     > 0) html += row('Partial Payments',     await fmt(ms.partialPayments),     'green');
    if (ms.advanceCreditHeld   > 0) html += row('Advance Held',         await fmt(ms.advanceCreditHeld),   'green');
    if (record.partialPaymentReceived > 0)
                                    html += row('Total Paid So Far',    await fmt(record.partialPaymentReceived), 'green');
    if (ms.grossOutstanding    > 0) html += row('Gross Outstanding',    await fmt(ms.grossOutstanding), 'red');
    const netOut = ms.netOutstanding != null ? ms.netOutstanding : (record.creditValue || 0);
    html += row('Net Outstanding', await fmt(netOut), netOut <= 0.01 ? 'green' : 'red');
    html += sec('Profitability');
    if (record.totalCost > 0)         html += row('Total Cost',        await fmt(record.totalCost),       'red');
    if (ms.realizedProfit   != null)   html += row('Realized Profit',  await fmt(ms.realizedProfit),      ms.realizedProfit   >= 0 ? 'green' : 'red');
    if (ms.unrealizedProfit != null && ms.unrealizedProfit !== 0)
                                       html += row('Unrealized Profit', await fmt(ms.unrealizedProfit),   'warn');
    if (record.profit != null) {
      const pSign = record.profit < 0 ? '− ' : '';
      html += row('Total Profit', `${pSign}${await fmt(Math.abs(record.profit))}`, record.profit >= 0 ? 'green' : 'red');
    }
    html += sec('Status');
    const settled = ms.isSettled || netOut <= 0.01;
    html += row('Settlement', settled ? '<svg width="12" height="12" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-b2f0371 d-inline-block"><circle class="ic-ck-ring" pathLength="100" cx="18" cy="18" r="13.5" fill="var(--success)" fill-opacity="0.15" stroke="var(--success)" stroke-width="1.7"/><path class="ic-ck-tick" pathLength="100" d="M11 18.5L16 23.5 25.3 12.8" stroke="var(--accent-gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path class="ic-sp" d="M30.5 2.9Q30.5 5.5 33.1 5.5Q30.5 5.5 30.5 8.1Q30.5 5.5 27.9 5.5Q30.5 5.5 30.5 2.9Z" fill="var(--accent-gold)"/></svg>Fully Settled' : '<svg width="12" height="12" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-b2f0371 d-inline-block"><circle cx="18" cy="18" r="13.5" fill="var(--warning)" fill-opacity="0.15" stroke="var(--warning)" stroke-width="1.7"/><path d="M18 10V18L23.5 21.5" stroke="var(--warning)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="18" cy="18" r="1.3" fill="var(--warning)"/></svg>Outstanding', settled ? 'green' : 'red');
    if (record.creditReceivedDate) html += row('Settled On', fmtDate(record.creditReceivedDate), 'muted');
    html += row('Payment Type', record.paymentType || '—', 'muted');
    if (record.salesRep && record.salesRep !== 'NONE' && record.salesRep !== 'ADMIN')
      html += row('Sales Rep', esc(record.salesRep), 'muted');
  }
  if (type === 'entity') {
    const isOut  = record.type === 'OUT';
    const netBal = ms.netBalance != null ? ms.netBalance : (isOut ? -record.amount : record.amount);
    const netLbl = netBal >= 0 ? 'Receivable' : 'Payable';
    html += sec('Payment Breakdown');
    if (ms.originalIn  != null) html += row('Total Payments IN',  await fmt(ms.originalIn),  'green');
    if (ms.originalOut != null) html += row('Total Payments OUT', await fmt(ms.originalOut), 'red');
    html += row('Net Balance',        `${await fmt(Math.abs(netBal))} (${netLbl})`, netBal >= 0 ? 'green' : 'red');
    html += row('Carried Forward As', `${await fmt(record.amount)} ${isOut ? 'Payable' : 'Receivable'}`);
    if (ms.hasSupplierMaterials) html += row('Note', 'Includes supplier material payments', 'muted');
    html += sec('Details');
    html += row('Type',   record.type === 'OUT' ? 'Payment OUT' : 'Payment IN', isOut ? 'red' : 'green');
    html += row('Amount', await fmt(record.amount));
    if (record.description) html += row('Description', esc(record.description), 'muted');
  }
  if (record.notes) {
    html += `<div class="u-1000f16">${esc(record.notes)}</div>`;
  }
  return `<div class="txn-preclose-panel" id="${panelId}">
    <div class="txn-preclose-title">Pre-Close Year Data</div>
    ${html}
  </div>`;
}

export async function _togglePreclosePanel(btn, panelId, recordId, storeKey, type) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    btn.classList.remove('active');
    return;
  }
  if (!panel.dataset.built) {
    try {
      const store = ensureArray(await sqliteStore.get(storeKey));
      const rec   = store.find(x => String(x.id) === String(recordId));
      if (rec) {
        const inner = await _buildPreclosePanel(rec, type, panelId);
        const tmp = document.createElement('div');
        tmp.innerHTML = inner;
        const built = tmp.firstElementChild;
        panel.innerHTML = built ? built.innerHTML : '';
        panel.dataset.built = '1';
      }
    } catch(e) { console.warn('preclose panel build error', e); }
  }
  panel.classList.add('open');
  btn.classList.add('active');
}

export async function openEntityDetailsOverlay(id) {
const { entities } = await loadCollections('entities');
currentEntityId = id; window.currentEntityId = currentEntityId;
const entity = entities.find(e => String(e.id) === String(id));
if (!entity) return;
resetLedgerFilter('ent');
const _entS = document.getElementById('entity-trans-search'); if (_entS) _entS.value = '';
await renderEntityOverlayContent(entity);
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('entity-details-screen');
}

export async function refreshEntityOverlay() {
if (!currentEntityId) return;
const entities = ensureArray(await sqliteStore.get('entities'));
const entity = entities.find(e => String(e.id) === String(currentEntityId));
if (entity) await renderEntityOverlayContent(entity);
}

export function closeEntityDetailsOverlay() {
if (typeof window.closeCustomerTxnSheet === 'function') window.closeCustomerTxnSheet();
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('entity-details-screen');
currentEntityId = null; window.currentEntityId = currentEntityId;
refreshPaymentTab();
}

export function openEditEntityFromDetails() {
const id = currentEntityId;
if (!id) return;
editEntityBasicInfo(id);
}

export async function renderEntityOverlayContent(entity) {
const transactions = ensureArray(await sqliteStore.get('transactions'));
const _manageET = document.getElementById('manageEntityTitle');
if (_manageET) {
const phone = entity.phone || '';
const wallet = entity.wallet || '';
const _safeEntityId = String(entity.id).replace(/'/g, "\\'");
const _entPhoto = await getPersonPhoto('entity:' + String(entity.id));
const _entAvatarHTML = renderPersonAvatarHTML(_entPhoto, 44);
_manageET.innerHTML = `<div class="u-1043921 d-flex">${_entAvatarHTML}<div class="u-69f8e5a"><div class="u-611b408 d-flex"><span class="u-fw-700">${esc(entity.name)}</span>${menuButtonHtml('ent', _safeEntityId)}</div>${(phone || wallet) ? `<div class="st-font-size__8113a0 st-color__5872de st-font-weight__1f3c50 st-margin-top__c00d39">${phone ? phoneActionHTML(phone) : ''}${phone && wallet ? ' &middot; ' : ''}${esc(wallet)}</div>` : ''}</div></div>`;
}
const _entStats = document.getElementById('manageEntityStats');
if (_entStats) _entStats.replaceChildren();
const balances = await calculateEntityBalances();
const balance = balances[entity.id] || 0;
const money = async (v) => fmtAmt(v);
const realTxns = transactions.filter(t => t.entityId === entity.id && !t.isExpense);
const totalIn = realTxns.filter(t => t.type === 'IN').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const totalOut = realTxns.filter(t => t.type === 'OUT').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const entityTxns = transactions.filter(t => t.entityId === entity.id);
const _tsOf = (t) => Number(t.timestamp) || new Date(t.date || t.createdAt || 0).getTime() || 0;
const _delta = (t) => (t.isExpense ? 0 : (t.type === 'IN' ? 1 : -1) * (parseFloat(t.amount) || 0));
const _asc = entityTxns.map((t, i) => ({ t, i })).sort((a, b) => _tsOf(a.t) - _tsOf(b.t) || (a.i - b.i));
const _sum = _asc.reduce((s, x) => s + _delta(x.t), 0);
let _run = balance - _sum;
const _runBal = new Map();
for (const { t } of _asc) { _run += _delta(t); _runBal.set(t, _run); }
const _photos = (await sqliteStore.get('photos').catch(() => null)) || {};
const _sorted = entityTxns.slice().sort((a, b) => _tsOf(b) - _tsOf(a));
const _balText = (b) => (b < -0.005 ? `${fmtAmt(-b)} REC` : fmtAmt(Math.max(0, b)));
const _entries = [];
for (const t of _sorted) {
const isOut = t.type === 'OUT';
const amt = parseFloat(t.amount) || 0;
const safeId = String(t.id).replace(/'/g, "\\'");
const _photoRefId = t.expenseId || t.id;
const safeExpenseId = _photoRefId ? String(_photoRefId).replace(/'/g, "\\'") : '';
const hasPhoto = !!(_photoRefId && _photos['expense:' + _photoRefId]);
const label = t.isTransfer ? (isOut ? 'Transfer out' : 'Transfer in') : (isOut ? 'Payment out' : 'Payment in');
const peer = t.isTransfer ? `${isOut ? 'To' : 'From'}: ${t.transferPeerEntityName || ''}` : '';
const note = t.description || '';
const rSub = [peer, note].filter(Boolean).join(' · ') || 'No description';
const _bal = _runBal.get(t) || 0;
const info = `<div class="u-fs-sm2 u-text-muted">${formatDisplayDateTime(t.date, t.time || null)}</div><div class="u-fs-sm2 u-text-muted">${esc(t.description || 'No description')}${(typeof _creatorBadgeHtml === 'function') ? _creatorBadgeHtml(t) : ''}</div>${peer ? `<div class="u-fs-sm2 u-text-muted">${esc(peer)}</div>` : ''}${t.isMerged ? _mergedBadgeHtml(t) : ''}`;
const canEdit = !(t.isMerged || t.isSettled);
const editCall = `startEdit('${t.isTransfer ? 'paytransfer' : 'payment'}','${esc(t.isTransfer ? t.transferPairId : t.id)}')`;
const delCall = t.isTransfer
  ? `(async()=>{await deletePaymentTransfer('${esc(t.transferPairId)}');const _ent=(await sqliteStore.get('entities')||[]).find(e=>String(e.id)===String(currentEntityId));if(_ent)renderEntityOverlayContent(_ent);})()`
  : `deleteEntityTransaction('${esc(t.id)}')`;
const photoBtn = hasPhoto ? `<button type="button" class="btn btn-sm btn-main u-mt-8" onclick="_toggleEntityTxnPanel(this,'','${safeId}','${safeExpenseId}')">View photo</button>` : '';
_entries.push({
  id: t.id, dkey: t.date || 'undated', rTitle: label, rSub, rIn: !isOut, rKind: isOut ? 'out' : 'in',
  rCat: t.isTransfer ? 'transfer' : (isOut ? 'out' : 'in'),
  tag: t.isTransfer ? '<span class="status-toggle-btn txn-warning">TRANSFER</span>' : '',
  amtText: fmtAmt(amt),
  balText: _balText(_bal), balTone: _bal > 0.005 ? 'is-debt' : 'is-clear',
  unpaid: false,
  sold: isOut && !t.isExpense ? amt : 0, got: !isOut && !t.isExpense ? amt : 0,
  debit: Math.max(0, _delta(t)), credit: Math.max(0, -_delta(t)), bal: _bal, isSettled: !!t.isSettled,
  row: { title: label, amtText: fmtAmt(amt), rIn: !isOut, info, panelPlaceholder: '', kebabBtn: photoBtn, canEdit, canDelete: !t.isMerged, editCall, delCall, balHtml: balanceAfterHtml(_balText(_bal), _bal > 0.005 ? 'debt' : 'clear'), safeId: esc(t.id) }
});
}
await renderLedger('ent', { name: entity.name, phone: entity.phone || '', entries: _entries, summaryHtml: entitySummaryHtml(balance, totalIn, totalOut, _entries.length), money, emptyAction: "openEntityPaymentFromDetails()" });
}

export function entitySummaryHtml(balance, totalIn, totalOut, n) {
const settled = Math.abs(balance) < 0.005;
const label = balance > 0.005 ? 'Payable' : balance < -0.005 ? 'Receivable' : 'Balance';
const tone = balance > 0.005 ? 'is-debt' : 'is-clear';
const value = settled ? 'Settled' : fmtAmt(Math.abs(balance));
let html = `<div class="cm-sum-label">${label}</div><div class="cm-sum-debt ${tone}">${value}</div>`;
if (n === 0) return html;
html += `<div class="cust-period-row d-flex"><div class="cust-stat-chip is-collect"><span class="cust-stat-label">Total In</span><span class="cust-stat-value">${fmtAmt(totalIn)}</span></div><div class="cust-stat-chip is-out"><span class="cust-stat-label">Total Out</span><span class="cust-stat-value">${fmtAmt(totalOut)}</span></div></div>`;
return html;
}

export function openEntityPaymentFromDetails() {
const id = currentEntityId;
closeEntityDetailsOverlay();
if (typeof window.sidebarNav === 'function') window.sidebarNav('payments');
if (id && typeof window.selectEntity === 'function') window.selectEntity(id);
}

export function filterEntityManagementHistory() {
applyCmFilters('ent');
}

export async function _toggleEntityTxnPanel(btn, panelId, txnId, expenseId) {
  const photoKey = expenseId ? 'expense:' + expenseId : null;
  if (photoKey) {
    try {
      const stored = (await sqliteStore.get('photos')) || {};
      const dataUrl = stored[photoKey] || null;
      if (dataUrl) { openPhotoLightbox(dataUrl); return; }
    } catch(_) {}
  }
  showToast('No photo attached to this transaction', 'warning', 2000);
}

const _supplierMatOriginal = (m) => parseFloat((m.totalValue || (m.purchaseCost && m.purchaseQuantity ? m.purchaseCost * m.purchaseQuantity : (m.quantity || 0) * (m.cost || 0)) || 0).toFixed(2));

const _clearMaterialSupplier = (m) => {
delete m.supplierId;
delete m.supplierName;
delete m.supplierContact;
delete m.supplierType;
delete m.totalPayable;
delete m.paidDate;
m.paymentStatus = 'pending';
m.updatedAt = getTimestamp();
ensureRecordIntegrity(m, true);
};

export async function _recomputeSupplierPayables(supplierIds, inventory, transactions, excludeIds, extraMaterialIds, skipMaterialIds) {
const saved = [];
for (const sid of supplierIds) {
const payments = transactions
.filter(t => !excludeIds.has(String(t.id)) && t.isPayable === true && t.type === 'OUT' && String(t.entityId) === String(sid))
.sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));
const ids = new Set(extraMaterialIds || []);
payments.forEach(t => txMaterialIds(t).forEach(i => ids.add(i)));
const skip = skipMaterialIds || new Set();
const mats = inventory.filter(m => !skip.has(String(m.id)) && (String(m.supplierId) === String(sid) || (!m.supplierId && ids.has(String(m.id)))));
if (mats.length === 0) continue;
mats.sort((a, b) => new Date(a.purchaseDate || a.createdAt || 0) - new Date(b.purchaseDate || b.createdAt || 0));
const invoices = transactions.filter(t => !excludeIds.has(String(t.id)) && String(t.entityId) === String(sid));
allocatePayments(mats, payments, m => materialOriginalPayable(m, invoices));
for (const m of mats) {
m.updatedAt = getTimestamp();
ensureRecordIntegrity(m, true);
await unifiedSave('inventory', inventory, m);
saved.push(m);
}
}
return saved;
}

export function _describeSupplierLinkImpact(tx, transactions, inventory) {
const out = { materialNames: [], paymentCount: 0, paymentTotal: 0 };
const seen = new Set();
if (!tx || !tx.isPayable || tx.type !== 'IN') return out;
const ids = txMaterialIds(tx);
const inv = ensureArray(inventory);
const txs = ensureArray(transactions);
inv.filter(m => ids.has(String(m.id)) && String(m.supplierId) === String(tx.entityId)).forEach(m => {
out.materialNames.push(m.name || 'Material');
txs.filter(t => String(t.id) !== String(tx.id) && t.isPayable === true && t.type === 'OUT' && String(t.entityId) === String(tx.entityId) && txMaterialIds(t).size > 0 && [...txMaterialIds(t)].every(i => ids.has(i))).forEach(t => {
if (seen.has(String(t.id))) return;
seen.add(String(t.id));
out.paymentCount++;
out.paymentTotal += parseFloat(t.amount) || 0;
});
});
return out;
}

export async function _reconcileSupplierLinksForDeletedTransactions(deletedTxs, allTransactions, allInventory, opts = {}) {
const result = { unlinked: [], recomputed: [], removedTxs: [], restoredCredits: [], changed: false };
const txs = (Array.isArray(deletedTxs) ? deletedTxs : [deletedTxs]).filter(t => t && (t.isPayable || t.materialId));
if (txs.length === 0) return result;
const inventory = allInventory || ensureArray(await sqliteStore.get('inventory'));
const transactions = allTransactions || ensureArray(await sqliteStore.get('transactions'));
const deletingIds = new Set(txs.map(t => String(t.id)));
const groupId = opts.groupId || null;
const restoredCreditIds = [];
for (const t of txs) {
if (t.type !== 'OUT') continue;
for (const r of planSupplierCreditRestore(t, transactions)) {
if (deletingIds.has(String(r.id))) continue;
const ct = transactions.find(x => x && !x.deletedAt && String(x.id) === String(r.id));
if (!ct) continue;
ct.supplierCreditAmount = parseFloat(((parseFloat(ct.supplierCreditAmount) || 0) + r.amount).toFixed(2));
ct.updatedAt = getTimestamp();
ensureRecordIntegrity(ct, true);
if (!restoredCreditIds.includes(String(ct.id))) restoredCreditIds.push(String(ct.id));
}
}
if (restoredCreditIds.length) {
await unifiedSave('transactions', transactions, null, restoredCreditIds);
result.restoredCredits = restoredCreditIds;
}
const supplierIds = new Set();
const extraMaterialIds = new Set();
const unlinkIds = new Set();
txs.forEach(t => {
if (!t.isPayable) return;
if (t.type === 'IN') txMaterialIds(t).forEach(i => unlinkIds.add(i));
else if (t.type === 'OUT') {
supplierIds.add(String(t.entityId));
txMaterialIds(t).forEach(i => extraMaterialIds.add(i));
}
});
for (const id of unlinkIds) {
const mat = inventory.find(m => String(m.id) === id);
if (!mat || !mat.supplierId) continue;
const oldSupplier = String(mat.supplierId);
const entityMatches = txs.some(t => t.type === 'IN' && t.isPayable && String(t.entityId) === oldSupplier && txMaterialIds(t).has(id));
if (!entityMatches) continue;
const linked = transactions.filter(t => !deletingIds.has(String(t.id)) && t.isPayable === true && String(t.entityId) === oldSupplier && txMaterialIds(t).has(id));
for (const lt of linked) {
const ids = txMaterialIds(lt);
const exclusive = lt.type === 'IN' || [...ids].every(i => unlinkIds.has(i));
if (!exclusive) continue;
const idx = transactions.findIndex(t => String(t.id) === String(lt.id));
if (idx === -1) continue;
transactions.splice(idx, 1);
await unifiedDelete('transactions', transactions, lt.id, { strict: true }, groupId ? stampGroup(lt, groupId) : lt);
result.removedTxs.push(lt);
}
_clearMaterialSupplier(mat);
await unifiedSave('inventory', inventory, mat);
result.unlinked.push(mat);
supplierIds.add(oldSupplier);
}
const removedIds = new Set(result.removedTxs.map(t => String(t.id)));
const exclude = new Set([...deletingIds, ...removedIds]);
result.recomputed = await _recomputeSupplierPayables([...supplierIds], inventory, transactions, exclude, extraMaterialIds, new Set(result.unlinked.map(m => String(m.id))));
result.changed = result.unlinked.length > 0 || result.recomputed.length > 0 || result.removedTxs.length > 0 || result.restoredCredits.length > 0;
return result;
}

export async function _reconcileSupplierLinkAfterRecovery(tx) {
if (!tx || !tx.isPayable) return false;
const { inventory, transactions, entities } = await loadCollections('inventory', 'transactions', 'entities');
let changed = false;
if (tx.type === 'IN') {
const ent = entities.find(e => String(e.id) === String(tx.entityId));
for (const id of txMaterialIds(tx)) {
const mat = inventory.find(m => String(m.id) === id);
if (!mat || mat.supplierId || !ent) continue;
mat.supplierId = ent.id;
mat.supplierName = ent.name;
mat.supplierContact = ent.phone || '';
mat.supplierType = 'payee';
mat.paymentStatus = 'pending';
mat.totalPayable = _supplierMatOriginal(mat);
mat.updatedAt = getTimestamp();
ensureRecordIntegrity(mat, true);
await unifiedSave('inventory', inventory, mat);
changed = true;
}
}
if (tx.type === 'OUT' && Array.isArray(tx.consumedCredits) && tx.consumedCredits.length) {
const creditChanged = [];
for (const c of tx.consumedCredits) {
if (!c || c.id == null) continue;
const ct = transactions.find(t => t && !t.deletedAt && String(t.id) === String(c.id));
if (!ct) continue;
const avail = parseFloat(ct.supplierCreditAmount) || 0;
const take = Math.min(avail, parseFloat(c.amount) || 0);
if (!(take > 0)) continue;
ct.supplierCreditAmount = parseFloat((avail - take).toFixed(2));
ct.updatedAt = getTimestamp();
ensureRecordIntegrity(ct, true);
if (!creditChanged.includes(String(ct.id))) creditChanged.push(String(ct.id));
}
if (creditChanged.length) {
await unifiedSave('transactions', transactions, null, creditChanged);
changed = true;
}
}
const saved = await _recomputeSupplierPayables([String(tx.entityId)], inventory, transactions, new Set(), txMaterialIds(tx));
return changed || saved.length > 0;
}

export async function _refreshSupplierLinkViews() {
try { notifyDataChange('all'); } catch (_) {}
try { if (typeof syncFactoryProductionStats === 'function') await syncFactoryProductionStats(); } catch (_) {}
try { if (typeof renderFactoryInventory === 'function') await renderFactoryInventory(); } catch (_) {}
try { if (typeof updateFactorySummaryCard === 'function') updateFactorySummaryCard(); } catch (_) {}
try { if (typeof updateFactoryUnitsAvailableStats === 'function') updateFactoryUnitsAvailableStats(); } catch (_) {}
try { if (typeof refreshPaymentTab === 'function') await refreshPaymentTab(true); } catch (_) {}
try { if (typeof renderEntityTable === 'function') await renderEntityTable(); } catch (_) {}
try { if (typeof calculateNetCash === 'function') calculateNetCash(); } catch (_) {}
try { if (typeof calculateCashTracker === 'function') calculateCashTracker(); } catch (_) {}
try { if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1); } catch (_) {}
try {
if (currentEntityId) {
const ents = ensureArray(await sqliteStore.get('entities'));
const ent = ents.find(e => String(e.id) === String(currentEntityId));
if (ent) await renderEntityOverlayContent(ent);
}
} catch (_) {}
}

export async function _restorePayableFromDeletedTransaction(tx, allTransactions, allInventory, opts = {}) {
if (!tx || !tx.isPayable) return false;
const res = await _reconcileSupplierLinksForDeletedTransactions([tx], allTransactions, allInventory, opts);
return res.changed || tx.type === 'IN';
}

export async function deleteEntityTransaction(id) {
const { entities, transactions, inventory } = await loadCollections('entities', 'transactions', 'inventory');
if (!id || !validateUUID(id)) {
window.notifyBlocking('Invalid transaction ID', 'error', 'Something went wrong');
return;
}
const _dt = transactions.find(t => t.id === id);
if (!_dt) {
const _ent0 = entities.find(e => String(e.id) === String(currentEntityId));
if (_ent0) renderEntityOverlayContent(_ent0);
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
return;
}
const _dtGuard = await getPaymentTxDeleteBlockReason(_dt, { allTxs: transactions });
if (_dtGuard.plan && _dtGuard.plan.kind === 'transfer') {
if (typeof deletePaymentTransfer === 'function') await deletePaymentTransfer(_dtGuard.plan.pairId);
const _ent0b = entities.find(e => String(e.id) === String(currentEntityId));
if (_ent0b) renderEntityOverlayContent(_ent0b);
return;
}
if (_dtGuard.block) { window.notifyBlocking(_dtGuard.block, 'warning', 'Warning'); return; }
const _dtEntity = entities.find(e => String(e.id) === String(_dt.entityId));
const _dtEntityName = _dtEntity ? _dtEntity.name : 'Unknown';
const _dtTypeLabel = _dt.type === 'IN' ? 'Payment Received (IN)' : 'Payment Made (OUT)';
const _dtAmount = fmtNum(parseFloat(_dt.amount) || 0);
const _dtDate = _dt.date || 'Unknown date';
const _dtDesc = _dt.description ? `\nNote: ${_dt.description}` : '';
let _dtMsg = `Delete this ${_dtTypeLabel}?`;
_dtMsg += `\n\nEntity: ${_dtEntityName}`;
_dtMsg += `\nAmount: ${_dtAmount}`;
_dtMsg += `\nDate: ${_dtDate}`;
if (_dtDesc) _dtMsg += _dtDesc;
if (_dt.isPayable && _dt.type === 'OUT') {
_dtMsg += `\n\n↩ Supplier payable status will be restored — material will revert to pending payment.`;
}
if (_dt.isPayable && _dt.type === 'IN') {
const _dtImpact = _describeSupplierLinkImpact(_dt, transactions, inventory);
_dtMsg += `\n\n↩ Credit purchase record removed — supplier will be unlinked from ${_dtImpact.materialNames.length ? _dtImpact.materialNames.join(', ') : 'the material'}.`;
if (_dtImpact.paymentCount > 0) _dtMsg += `\n↩ ${_dtImpact.paymentCount} supplier payment${_dtImpact.paymentCount !== 1 ? 's' : ''} (${fmtAmt(_dtImpact.paymentTotal)}) for it will also be reversed.`;
}
_dtMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_dtMsg, { title: `Delete ${_dt.type === 'IN' ? 'Payment IN' : 'Payment OUT'}`, confirmText: "Delete", danger: true })) {
try {
const _dtGroupId = (_dt.isPayable || _dt.expenseId) ? newGroupId('pay') : null;
await _restorePayableFromDeletedTransaction(_dt, transactions, inventory, { groupId: _dtGroupId });
await deletePaymentTxWithLinks(_dt, { groupId: _dtGroupId });
notifyDataChange('payments');
await _refreshSupplierLinkViews();
const _dtEntityRefreshed = ensureArray(await sqliteStore.get('entities')).find(e => String(e.id) === String(_dt.entityId));
if (_dtEntityRefreshed) await renderEntityOverlayContent(_dtEntityRefreshed);
} catch (error) {
window.notifyBlocking('Failed to delete transaction. Please try again.', 'error', 'Something went wrong');
}
}
}

export async function deleteCurrentEntity() {
const { entities, transactions, inventory } = await loadCollections('entities', 'transactions', 'inventory');
if (!currentEntityId) return;
if (!validateUUID(String(currentEntityId))) {
window.notifyBlocking('Invalid entity ID', 'error', 'Something went wrong');
return;
}
const _entityToDel = entities.find(e => String(e.id) === String(currentEntityId));
if (!_entityToDel) {
window.notifyBlocking('Entity not found', 'error', 'Something went wrong');
return;
}
const _entityName = _entityToDel.name || 'this entity';
const _entDelBlock = await getEntityDeleteBlockReason(currentEntityId, { allTxs: transactions, name: `"${_entityName}"` });
if (_entDelBlock) { window.notifyBlocking(_entDelBlock, 'warning', 'Warning'); return; }
const _entityTxs = transactions.filter(t => String(t.entityId) === String(currentEntityId));
const _totalIn = _entityTxs.filter(t => t.type === 'IN' && !t.isPayable).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const _totalOut = _entityTxs.filter(t => t.type === 'OUT' && !t.isPayable).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const _linkedMaterials = inventory.filter(m => String(m.supplierId) === String(currentEntityId));
let msg = `Permanently delete "${_entityName}"?`;
if (_entityTxs.length > 0) {
msg += `\n\n\u26a0 This entity has ${_entityTxs.length} transaction${_entityTxs.length !== 1 ? 's' : ''} on record`;
if (_totalIn > 0) msg += `\n • Received: ${fmtAmt(_totalIn)}`;
if (_totalOut > 0) msg += `\n • Paid out: ${fmtAmt(_totalOut)}`;
msg += `\n\nAll ${_entityTxs.length} transaction${_entityTxs.length !== 1 ? 's' : ''} will also be permanently deleted.`;
}
if (_linkedMaterials.length > 0) {
msg += `\n\n\u21a9 ${_linkedMaterials.length} linked material${_linkedMaterials.length !== 1 ? 's' : ''} will be unlinked and reverted to pending payment status.`;
}
msg += `\n\nThis cannot be undone.`;
if (!(await showGlassConfirm(msg, { title: `Delete Entity Permanently`, confirmText: "Delete", danger: true }))) return;
try {
const _entGroup = newGroupId('ent');
await _reconcileSupplierLinksForDeletedTransactions(_entityTxs.filter(t => t.isPayable === true), transactions, inventory, { groupId: _entGroup });
for (const mat of _linkedMaterials) {
if (!mat.supplierId) continue;
_clearMaterialSupplier(mat);
await unifiedSave('inventory', inventory, mat);
}
const txsToDelete = _entityTxs.slice();
const _transferTxs = txsToDelete.filter(t => t.isTransfer === true);
const _normalTxs = txsToDelete.filter(t => t.isTransfer !== true);
const _processedPairIds = new Set();
for (const tx of _transferTxs) {
if (_processedPairIds.has(tx.transferPairId)) continue;
_processedPairIds.add(tx.transferPairId);
if (typeof deletePaymentTransfer === 'function') await deletePaymentTransfer(tx.transferPairId, true, { groupId: _entGroup });
}
const _entTxIds = new Set(_normalTxs.map(t => String(t.id)));
for (const tx of _normalTxs) {
await deletePaymentTxWithLinks(tx, { groupId: _entGroup, excludeIds: _entTxIds });
}
const filteredEntities = ensureArray(await sqliteStore.get('entities')).filter(e => String(e.id) !== String(currentEntityId));
await unifiedDelete('entities', filteredEntities, _entityToDel.id, { strict: true }, stampGroup(_entityToDel, _entGroup));
try {
const _delEntPh = (await sqliteStore.get('photos')) || {};
const _delEntPhTs = (await sqliteStore.get('photostamps')) || {};
const _delEntDk = (await sqliteStore.get('photodirty')) || [];
let _delEntPhChanged = false;
const _entityPhotoKeys = [
'entity:' + String(currentEntityId),
...txsToDelete.filter(tx => tx.expenseId).map(tx => 'expense:' + tx.expenseId)
];
for (const _epk of _entityPhotoKeys) {
if (_delEntPh[_epk] !== undefined) {
delete _delEntPh[_epk];
delete _delEntPhTs[_epk];
if (!_delEntDk.includes(_epk)) _delEntDk.push(_epk);
_delEntPhChanged = true;
}
}
if (_delEntPhChanged) {
await sqliteStore.set('photos', _delEntPh);
await sqliteStore.set('photostamps', _delEntPhTs);
await sqliteStore.set('photodirty', _delEntDk);
if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
}
} catch(_delEntPhErr) { console.warn('[deleteCurrentEntity] photo cleanup failed', _delEntPhErr); }
notifyDataChange('entities');
closeEntityDetailsOverlay();
await _refreshSupplierLinkViews();
} catch (error) {
window.notifyBlocking('Failed to delete entity. Please try again.', 'error', 'Something went wrong');
}
}

export async function exportEntityData() {
const entities = ensureArray(await sqliteStore.get('entities'));
let csvContent = "data:text/csv;charset=utf-8,";
csvContent += "Entity Name,Type,Phone,Net Balance (),Status\n";
const balances = await calculateEntityBalances();
entities.forEach(e => {
const bal = balances[e.id] || 0;
let status = "Settled";
if(bal > 0) status = "Payable (You Owe)";
if(bal < 0) status = "Receivable (Owes You)";
const safeName = safeReplace(e.name, /,/g, " ");
csvContent += `"${safeName}","${e.type}","${e.phone || ''}",${fmtAmt(bal)},"${status}"\n`;
});
const encodedUri = encodeURI(csvContent);
const link = document.createElement("a");
link.setAttribute("href", encodedUri);
link.setAttribute("download", "Entities_List.csv");
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
showToast("Entity list exported", "success");
}

export function _pdfMergedPeriodLabel(record) {
  const ms = record.mergedSummary;
  const dr = ms && ms.dateRange;
  if (dr && dr.from && dr.to) {
    const fmt = (d) => {
      try {
        const dd = new Date(d);
        if (isNaN(dd.getTime())) return d;
        return formatDayMonthYear(dd);
      } catch (e) { return d; }
    };
    return `${fmt(dr.from)} \u2192 ${fmt(dr.to)}`;
  }
  if (record.date) {
    try {
      const dd = new Date(record.date);
      if (!isNaN(dd.getTime()))
        return formatDayMonthYear(dd);
    } catch (e) {}
  }
  return 'Prev. Year';
}

export function _pdfMergedCountLabel(record) {
  const cnt = record.mergedRecordCount || (record.mergedSummary && record.mergedSummary.recordCount);
  return cnt ? `${cnt} txn${cnt !== 1 ? 's' : ''} merged` : 'year-end merge';
}

export function _pdfDrawMergedSectionHeader(doc, yPos, pageW, label) {
  const purpleLight = [245, 235, 255];
  const purpleDark  = [126, 34, 206];
  const purpleBorder= [175, 82, 222];
  doc.setFillColor(...purpleLight);
  doc.roundedRect(14, yPos, pageW - 28, 12, 2, 2, 'F');
  doc.setDrawColor(...purpleBorder);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, yPos, pageW - 28, 12, 2, 2, 'S');
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...purpleDark);
  doc.text('\u2605 ' + (label || 'YEAR-END OPENING BALANCE — MERGED RECORDS'), 20, yPos + 8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(80, 80, 80);
  return yPos + 16;
}

export const PDF_MERGED_HDR_COLOR  = [126, 34, 206];
export const PDF_MERGED_ROW_COLOR  = [245, 235, 255];
export const PDF_MERGED_TEXT_COLOR = [126, 34, 206];

export async function _exportDocAsImageAndOpenWhatsApp(doc, phone, filenameBase) {
  const canvases = await renderJsPdfToCanvases(doc, { scale: 3 });
  if (!canvases.length) throw new Error('Nothing to export.');
  const files = [];
  for (let i = 0; i < canvases.length; i++) {
    const blob = await new Promise(resolve => canvases[i].toBlob(resolve, 'image/jpeg', 0.92));
    const suffix = canvases.length > 1 ? `-page${i + 1}` : '';
    files.push(new File([blob], `${filenameBase}${suffix}.jpg`, { type: 'image/jpeg' }));
  }
  const hasPhone = phone && phone !== 'N/A' && phone.trim() !== '';
  const cleaned  = hasPhone ? phone.trim().replace(/[^\d+]/g, '') : '';
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: 'Account Statement', phone: hasPhone ? cleaned : '' });
      showToast('Statement shared successfully', 'success');
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('Share cancelled', 'info');
        return;
      }
      console.warn('[statement share] Web Share failed, falling back to download:', _safeErr(err));
    }
  }
  files.forEach((f, i) => {
    setTimeout(() => {
      const dlLink = document.createElement('a');
      dlLink.href = URL.createObjectURL(f);
      dlLink.download = f.name;
      document.body.appendChild(dlLink);
      dlLink.click();
      document.body.removeChild(dlLink);
      setTimeout(() => URL.revokeObjectURL(dlLink.href), 5000);
    }, i * 300);
  });
  if (hasPhone) {
    showToast('Image saved — opening WhatsApp to send it\u2026', 'success');
    setTimeout(() => window.open(`https://wa.me/${cleaned}`, '_blank'), 600 + files.length * 300);
  } else {
    showToast('Statement saved as image (no phone number on record)', 'success');
  }
}

export function _captureAutoTables(doc) {
  const captured = [];
  const orig = doc.autoTable.bind(doc);
  doc.autoTable = function(opts) {
    try { captured.push({ head: opts && opts.head, body: opts && opts.body }); } catch (_) {}
    return orig(opts);
  };
  return captured;
}

function _stmtCellText(c) {
  if (c == null) return '';
  if (typeof c === 'object') c = c.content != null ? c.content : '';
  return String(c).replace(/\s*\n\s*/g, ' ').trim();
}

const _URDU_HEADS = {
  'date': 'تاریخ', 'invoice date': 'تاریخ',
  'description': 'تفصیل', 'details': 'تفصیل', 'year period / summary': 'تفصیل', 'material': 'مال',
  'qty': 'مقدار',
  'payment out': 'ادائیگی', 'payment in': 'وصولی',
  'debit (sale)': 'بل', 'credit (rcvd)': 'وصولی', 'debit': 'بل', 'credit': 'وصولی',
  'balance': 'بقایا', 'running balance': 'بقایا',
  'outstanding': 'بقایا', 'settled': 'ادا شدہ',
  'invoice amt': 'انوائس رقم', 'paid so far': 'اب تک ادا', 'remaining': 'باقی', 'status': 'حالت'
};

const _URDU_RANGES = {
  'All Time': 'تمام وقت', 'Today': 'آج', 'This Week': 'اس ہفتے', 'This Month': 'اس مہینے', 'This Year': 'اس سال'
};

const _URDU_TITLES = {
  'Account Statement': 'اکاؤنٹ اسٹیٹمنٹ',
  'Customer Account Statement': 'کسٹمر اکاؤنٹ اسٹیٹمنٹ',
  'Rep Customer Account Statement': 'ریپ کسٹمر اکاؤنٹ اسٹیٹمنٹ'
};

const _URDU_VALUE_RULES = [
  [/^[\u21a9\u2714]\s*(Credit Purchase|Supplier Pmt)\s*/i, ''],
  [/^Opening Balance$/i, 'سابقہ بقایا'],
  [/^(Previous balance|Previous balance brought forward|Brought forward from previous records)$/i, 'سابقہ بقایا'],
  [/Cash payment received/i, 'نقد رقم وصول'],
  [/Partial payment received/i, 'جزوی رقم وصول'],
  [/(\d+) txns? merged/i, '$1 لین دین یکجا'],
  [/year-end merge/i, 'سال کے آخر کا انضمام'],
  [/Prev\. Year/i, 'پچھلا سال'],
  [/Cash sales:/gi, 'نقد فروخت:'],
  [/Net due:/gi, 'واجب الادا:'],
  [/\bOVERPAID\b/g, 'زائد ادائیگی'],
  [/\bSETTLED\b/g, 'حساب صاف'],
  [/\bSettled\b/g, 'ادا شدہ'],
  [/\bPaid:/g, 'ادا:'],
  [/\bDue:/g, 'باقی:'],
  [/\bkg\b/gi, 'کلو'],
  [/^Prior$/, 'پچھلا']
];

function _urduValue(v) {
  let out = String(v == null ? '' : v);
  _URDU_VALUE_RULES.forEach(([re, rep]) => { out = out.replace(re, rep); });
  return out.replace(/\s+/g, ' ').trim();
}

const _RLM = '\u200F';
const _LRI = '\u2066';
const _PDI = '\u2069';
const _HAS_URDU = /[\u0600-\u06FF]/;
const _AMOUNT_ONLY = /^(Rs\.?\s*)?[\d,]+(\.\d+)?$/i;

function _ltr(v) {
  const t = String(v == null ? '' : v);
  return t ? _LRI + t + _PDI : t;
}

function _bidiValue(v) {
  const t = String(v == null ? '' : v);
  if (!t) return t;
  if (_AMOUNT_ONLY.test(t) || !_HAS_URDU.test(t)) return _ltr(t);
  return t;
}

export function _buildStatementText({ title, name, phone, rangeName, tables }) {
  const lines = [];
  const add = (t) => lines.push(t === '' ? '' : _RLM + t);
  add('*گل اینڈ زبیر نسوار ڈیلرز*');
  add(`${_URDU_TITLES[title] || title} \u00b7 ${_URDU_RANGES[rangeName] || rangeName}`);
  add('');
  add(`نام: ${_bidiValue(name)}`);
  if (phone && phone !== 'N/A') add(`فون: ${_ltr(phone)}`);
  add(`تاریخ اجراء: ${_ltr(formatDayMonthYear(new Date()))}`);
  let closing = '';
  (tables || []).forEach(t => {
    const headRaw = Array.isArray(t.head) && Array.isArray(t.head[0]) ? t.head[0].map(_stmtCellText) : [];
    const body = Array.isArray(t.body) ? t.body : [];
    if (!body.length) return;
    const headKey = headRaw.map(h => h.toLowerCase());
    const skip = new Set();
    headKey.forEach((h, i) => { if (h === 'type') skip.add(i); });
    const isMoney = (i) => /amt|debit|credit|payment|balance|outstanding|settled|remaining|paid/.test(headKey[i] || '');
    add('');
    add('------------------------');
    body.forEach(row => {
      const cells = (Array.isArray(row) ? row : []).map(_stmtCellText);
      const parts = [];
      cells.forEach((raw, i) => {
        if (i === 0 || skip.has(i)) return;
        const v = _urduValue(raw);
        if (!v || v === '-' || v === '\u2014') return;
        const label = _URDU_HEADS[headKey[i]];
        parts.push(label && isMoney(i) ? `${label}: ${_bidiValue(v)}` : _bidiValue(v));
      });
      add(`\u2022 ${_bidiValue(_urduValue(cells[0] || ''))}${parts.length ? ' | ' + parts.join(' | ') : ''}`);
    });
    const lastIdx = headKey.length - 1;
    if (lastIdx >= 0 && /balance/.test(headKey[lastIdx])) {
      const last = body[body.length - 1];
      const v = _urduValue(_stmtCellText(Array.isArray(last) ? last[last.length - 1] : ''));
      if (v) closing = v;
    }
  });
  if (closing) {
    add('');
    add('------------------------');
    add(`*کل بقایا: ${_bidiValue(closing)}*`);
  }
  return lines.join('\n');
}

export async function _shareStatementText(text, phone) {
  if (navigator.share) {
    try {
      await navigator.share({ text, title: 'اکاؤنٹ اسٹیٹمنٹ', phone: (phone && phone !== 'N/A') ? String(phone) : '' });
      showToast('Statement shared successfully', 'success');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') { showToast('Share cancelled', 'info'); return; }
      console.warn('[statement text share] Web Share failed, falling back to WhatsApp link:', _safeErr(err));
    }
  }
  const hasPhone = phone && phone !== 'N/A' && String(phone).trim() !== '';
  const cleaned = hasPhone ? String(phone).trim().replace(/[^\d]/g, '') : '';
  window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`, '_blank');
  showToast(hasPhone ? 'Opening WhatsApp with the statement message\u2026' : 'Opening WhatsApp \u2014 choose a contact to send to', 'success');
}

const _SHARE_ICON_IMAGE = '<svg viewBox="0 0 36 36" fill="none" width="18" height="18"><rect x="4" y="5" width="28" height="26" rx="4.5" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12.5" cy="13" r="2.8" fill="currentColor"/><path d="M4.8 27L13 18.5L20 25L25 20L31.2 26.5V27.8A3.2 3.2 0 0 1 28 31H8A3.2 3.2 0 0 1 4.8 27.8Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const _SHARE_ICON_TEXT = '<svg viewBox="0 0 36 36" fill="none" width="18" height="18"><path d="M5 9A4 4 0 0 1 9 5H27A4 4 0 0 1 31 9V21A4 4 0 0 1 27 25H16L9 32V25A4 4 0 0 1 5 21Z" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M11 12H25M11 18H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
const _SHARE_ICON_HEAD = '<svg viewBox="0 0 36 36" fill="none"><path d="M10.5 16L25 9.5M10.5 20L25 26.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><circle cx="27.5" cy="8" r="4.5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="18" r="4.5" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.7"/><circle cx="27.5" cy="28" r="4.5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.7"/></svg>';

export async function promptStatementShare(kind) {
  let range = null;
  if (kind === 'customer' || kind === 'rep' || kind === 'entity') {
    const bounds = typeof window.getLedgerDayRange === 'function' ? window.getLedgerDayRange(kind === 'rep' ? 'rep' : kind === 'entity' ? 'ent' : 'cust') : {};
    range = await promptStatementRange({ min: bounds.min, max: bounds.max });
    if (!range) return;
  }
  const choice = await showChoiceDialog('Choose how you want to share this statement.', [
    { label: 'PDF / Image', value: 'image', icon: _SHARE_ICON_IMAGE },
    { label: 'Text message', value: 'text', icon: _SHARE_ICON_TEXT }
  ], { title: 'Share Statement', icon: _SHARE_ICON_HEAD });
  if (!choice) return;
  const opts = { mode: choice };
  if (range) { opts.from = range.from; opts.to = range.to; }
  if (kind === 'entity') return exportEntityToPDF(opts);
  if (kind === 'customer') return exportCustomerToPDF(opts);
  if (kind === 'rep' && typeof window.exportRepCustomerToPDF === 'function') return window.exportRepCustomerToPDF(opts);
}

window.promptStatementShare = promptStatementShare;

export async function exportEntityToPDF(opts = {}) {
const { inventory, entities, transactions } = await loadCollections('inventory', 'entities', 'transactions');
if (!currentEntityId) {
showToast("No entity selected", "warning");
return;
}
const entity = entities.find(e => String(e.id) === String(currentEntityId));
if (!entity) {
showToast("Entity not found", "error");
return;
}
const _rb = rangeBounds(opts && opts.from, opts && opts.to);
const range = (_rb.start || _rb.end) ? 'custom' : 'all';
const _textMode = !!(opts && opts.mode === 'text');
showToast(_textMode ? "Preparing message..." : "Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
await new Promise(r => setTimeout(r, 200));
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Failed to load PDF library. Please refresh and try again.");
const allEntityTxns = transactions.filter(t => String(t.entityId) === String(entity.id) && !t.isExpense);
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const periodCutoff = _rb.start;
const _periodEnd = _rb.end;
const priorTxns = periodCutoff
  ? allEntityTxns.filter(t => { if (!t.date) return false; return new Date(t.date) < periodCutoff; })
  : [];
let periodTxns = (periodCutoff || _periodEnd)
  ? allEntityTxns.filter(t => { if (!t.date) return false; const d = new Date(t.date); return (!periodCutoff || d >= periodCutoff) && (!_periodEnd || d <= _periodEnd); })
  : allEntityTxns;
const openingBalance = priorTxns.reduce((bal, t) => {
  const amt = parseFloat(t.amount) || 0;
  return t.type === 'OUT' ? bal - amt : bal + amt;
}, 0);
periodTxns.sort((a, b) => {
const da = toSafeDate(a.date);
const db = toSafeDate(b.date);
return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
});
const isPayee = entity.type === 'payee';
const isPayor = entity.type === 'payor';
const headerColor = isPayee ? [230, 100, 20] : [0, 122, 200];
const isSupplier = typeof inventory !== 'undefined' &&
inventory.some(m => String(m.supplierId) === String(entity.id));
const supplierMaterials = isSupplier
? inventory.filter(m => String(m.supplierId) === String(entity.id))
: [];
const { jsPDF } = window.jspdf;
const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
const _capTables = _textMode ? _captureAutoTables(doc) : null;
const pageW = doc.internal.pageSize.getWidth();
doc.setFillColor(...headerColor);
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
doc.text(`Account Statement · ${rangeName}`, pageW / 2, 30, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
let yPos = 38;
const _entPdfPhoto = await getPersonPhoto('entity:' + String(entity.id));
if (_entPdfPhoto) {
  try {
    const _pdfPhotoX = pageW - 14 - 22;
    doc.addImage(_entPdfPhoto, 'JPEG', _pdfPhotoX, 25, 22, 22, undefined, 'NONE');
  } catch(e) {}
}
doc.setFont(undefined, 'bold'); doc.text('Name:', 14, yPos);
doc.setFont(undefined, 'normal'); doc.text(entity.name, 32, yPos);
doc.setFont(undefined, 'bold'); doc.text('Phone:', 14, yPos + 5);
doc.setFont(undefined, 'normal'); doc.text(entity.phone || 'N/A', 32, yPos + 5);
if (entity.wallet) {
doc.setFont(undefined, 'bold'); doc.text('Wallet/Account:', pageW / 2, yPos);
doc.setFont(undefined, 'normal'); doc.text(entity.wallet, pageW / 2 + 30, yPos);
}
doc.setFont(undefined, 'bold'); doc.text('Generated:', pageW / 2, yPos + 5);
doc.setFont(undefined, 'normal');
doc.text(formatDayMonthYear(now), pageW / 2 + 22, yPos + 5);
yPos += 18;
doc.setDrawColor(...headerColor); doc.setLineWidth(0.5);
doc.line(14, yPos, pageW - 14, yPos);
yPos += 5;
if (periodTxns.length > 0 || priorTxns.length > 0) {
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...headerColor);
doc.text('PAYMENT TRANSACTIONS', 14, yPos);
doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'normal');
yPos += 5;
const mergedTxns  = periodTxns.filter(t => t.isMerged === true);
const normalTxns  = periodTxns.filter(t => !t.isMerged);
const buildTxRow = (t, runBal) => {
  const amt = parseFloat(t.amount) || 0;
  const isOut = t.type === 'OUT';
  const isPayableTx = t.isPayable === true;
  runBal.val += isOut ? -amt : amt;
  let balDisplay;
  if (Math.abs(runBal.val) < 0.01) balDisplay = 'SETTLED';
  else balDisplay = fmtAmt(Math.abs(runBal.val));
  let desc = (t.description || '-').substring(0, 35);
  if (isPayableTx && !isOut) desc = '\u21a9 Credit Purchase\n' + desc;
  else if (isPayableTx && isOut) desc = '\u2714 Supplier Pmt\n' + desc;
  const typeLabel = isPayableTx && !isOut ? 'CR' : t.type;
  return [
    formatDisplayDate(t.date),
    desc,
    typeLabel,
    isOut ? fmtAmt(amt) : '-',
    !isOut ? fmtAmt(amt) : '-',
    balDisplay
  ];
};
if (mergedTxns.length > 0) {
  yPos = _pdfDrawMergedSectionHeader(doc, yPos, pageW, 'YEAR-END OPENING BALANCES (Carried Forward)');
  const mergedRunBal = { val: 0 };
  const mergedRows = mergedTxns.map(t => {
    const row = buildTxRow(t, mergedRunBal);
    const ms = t.mergedSummary || {};
    const periodLabel = _pdfMergedPeriodLabel(t);
    const countLabel  = _pdfMergedCountLabel(t);
    const origIn  = ms.originalIn  != null ? 'In: ' + fmtAmt(ms.originalIn) : '';
    const origOut = ms.originalOut != null ? 'Out: ' + fmtAmt(ms.originalOut) : '';
    const summary = [periodLabel, countLabel, origIn, origOut].filter(Boolean).join('\n');
    row[1] = summary.substring(0, 70);
    return row;
  });
  doc.autoTable({
    startY: yPos,
    head: [['Date', 'Year Period / Summary', 'Type', 'Payment OUT', 'Payment IN', 'Balance']],
    body: mergedRows,
    theme: 'grid',
    headStyles: { fillColor: PDF_MERGED_HDR_COLOR, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [200, 180, 230], overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      data.cell.styles.fillColor = PDF_MERGED_ROW_COLOR;
      data.cell.styles.textColor = [80, 40, 120];
      if (data.column.index === 2)
        data.cell.styles.textColor = data.cell.text[0] === 'OUT' ? [180, 40, 40] : data.cell.text[0] === 'CR' ? [200, 100, 0] : [40, 130, 60];
      if (data.column.index === 3) data.cell.styles.textColor = [180, 40, 40];
      if (data.column.index === 4) data.cell.styles.textColor = [40, 130, 60];
      if (data.column.index === 5) {
        const txt = (data.cell.text||[]).join('');
        data.cell.styles.textColor = txt==='SETTLED'?[100,100,100]:[126,34,206];
      }
    },
    margin: { left: 14, right: 14 }
  });
  yPos = doc.lastAutoTable.finalY + 6;
  if (yPos > 255) { doc.addPage(); yPos = 20; }
}
const hasPriorBalance = periodCutoff !== null && priorTxns.length > 0;
const txRunBal = { val: hasPriorBalance ? openingBalance : 0 };
const txRows = normalTxns.map(t => buildTxRow(t, txRunBal));
if (hasPriorBalance) {
  const obAbs = Math.abs(openingBalance);
  const obDisplay = obAbs < 0.01 ? 'SETTLED' : fmtAmt(obAbs);
  const obLabel = obAbs < 0.01
    ? 'Settled'
    : openingBalance > 0 ? 'Receivable (they owe)' : 'Payable (we owe)';
  txRows.unshift([
    'Prior',
    `Opening Balance`,
    '—',
    '-',
    '-',
    obDisplay
  ]);
}
const totalOut          = normalTxns.filter(t => t.type === 'OUT').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const totalCashIn       = normalTxns.filter(t => t.type === 'IN' && !t.isPayable).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const totalCreditPurch  = normalTxns.filter(t => t.type === 'IN' && t.isPayable).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const totalIn           = totalCashIn + totalCreditPurch;
const finalBal          = (hasPriorBalance ? openingBalance : 0) + totalIn - totalOut;
let finalBalDisplay;
if (Math.abs(finalBal) < 0.01) finalBalDisplay = 'SETTLED';
else finalBalDisplay = fmtAmt(Math.abs(finalBal));
const openingRowOffset  = hasPriorBalance ? 1 : 0;
if (normalTxns.length > 0 || hasPriorBalance) {
  doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
  doc.setTextColor(...headerColor);
  doc.text('INDIVIDUAL TRANSACTIONS', 14, yPos);
  doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'normal');
  yPos += 5;
  doc.autoTable({
    startY: yPos,
    head: [['Date', 'Description', 'Type', 'Payment OUT', 'Payment IN', 'Running Balance']],
    body: txRows,
    theme: 'grid',
    headStyles: { fillColor: headerColor, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [180, 180, 180], overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'right', textColor: [220, 53, 69], fontStyle: 'bold' },
      4: { cellWidth: 28, halign: 'right', textColor: [40, 167, 69], fontStyle: 'bold' },
      5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      const isOpeningRow = hasPriorBalance && data.row.index === 0;
      if (isOpeningRow) {
        data.cell.styles.fillColor  = [220, 235, 255];
        data.cell.styles.fontStyle  = 'bold';
        data.cell.styles.textColor  = [30, 80, 160];
        data.cell.styles.fontSize   = 8;
      }
      if (!isOpeningRow) {
        if (data.column.index===2)
          data.cell.styles.textColor = data.cell.text[0]==='OUT'?[220,53,69]:data.cell.text[0]==='CR'?[200,100,0]:[40,167,69];
        if (data.column.index===5) {
          const txt=(data.cell.text||[]).join('');
          if (txt.includes('SETTLED')) data.cell.styles.textColor=[100,100,100];
          else if (txt.includes('OWE')) data.cell.styles.textColor=[220,53,69];
          else data.cell.styles.textColor=[40,167,69];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });
}
const afterTx = ((normalTxns.length > 0 || hasPriorBalance) ? doc.lastAutoTable.finalY : yPos - 5) + 5;
if (afterTx < 255) {
doc.setFillColor(245, 245, 245);
const summaryRows = totalCreditPurch > 0 ? 2 : 1;
doc.roundedRect(14, afterTx, pageW - 28, summaryRows * 11 + 3, 2, 2, 'F');
doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
if (hasPriorBalance && Math.abs(openingBalance) >= 0.01) {
  doc.setTextColor(30, 80, 160);
  const obSign = openingBalance > 0 ? '+' : '-';
  doc.text(`Opening Bal: ${obSign}${fmtAmt(Math.abs(openingBalance))}`, 20, afterTx + 9);
  doc.setTextColor(220, 53, 69);
  doc.text(`Period OUT: ${fmtAmt(totalOut)}`, 75, afterTx + 9);
  doc.setTextColor(40, 167, 69);
  doc.text(`Period IN: ${fmtAmt(totalIn)}`, 125, afterTx + 9);
} else {
  doc.setTextColor(220, 53, 69);
  doc.text(`Total OUT: ${fmtAmt(totalOut)}`, 20, afterTx + 9);
  doc.setTextColor(40, 167, 69);
  doc.text(`Cash IN: ${fmtAmt(totalCashIn)}`, 75, afterTx + 9);
}
if (totalCreditPurch > 0) {
doc.setTextColor(200, 100, 0);
doc.text(`Credit Purchases: ${fmtAmt(totalCreditPurch)}`, 20, afterTx + 17);
}
doc.setTextColor(Math.abs(finalBal) < 0.01 ? 100 : finalBal < 0 ? 220 : 40,
Math.abs(finalBal) < 0.01 ? 100 : finalBal < 0 ? 53 : 167,
Math.abs(finalBal) < 0.01 ? 100 : finalBal < 0 ? 69 : 69);
doc.setFont(undefined, 'bold');
doc.text(`Net Balance: ${finalBalDisplay}`, 138, afterTx + 9);
yPos = afterTx + (summaryRows * 11 + 7);
} else {
yPos = afterTx + 5;
}
} else {
doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(150);
doc.text('No payment transactions recorded for this period.', pageW / 2, yPos + 8, { align: 'center' });
yPos += 15;
}
if (isSupplier && supplierMaterials.length > 0) {
if (yPos > 240) { doc.addPage(); yPos = 20; }
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...headerColor);
doc.text('SUPPLIER INVOICES — RAW MATERIAL PAYABLES', 14, yPos);
doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(120, 120, 120);
doc.text('Each row = one material invoice. Payments are applied FIFO (oldest invoice first).', 14, yPos + 4.5);
doc.setTextColor(80, 80, 80);
yPos += 9;
let totalInvoice = 0, totalPaid = 0, totalRemaining = 0;
const matRows = supplierMaterials
.sort((a, b) => {
const da = toSafeDate(a.purchaseDate || a.date || a.createdAt);
const db = toSafeDate(b.purchaseDate || b.date || b.createdAt);
return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
})
.map(mat => {
const originalAmt = parseFloat((
mat.totalValue ||
(mat.purchaseCost && mat.purchaseQuantity ? mat.purchaseCost * mat.purchaseQuantity : (mat.quantity || 0) * (mat.cost || 0)) ||
0
).toFixed(2));
const remaining = parseFloat(mat.totalPayable || 0);
const paid = Math.max(0, originalAmt - remaining);
totalInvoice += originalAmt;
totalPaid += paid;
totalRemaining += remaining;
const status = mat.paymentStatus === 'paid' || remaining <= 0
? 'PAID'
: remaining < originalAmt
? 'PARTIAL'
: 'PENDING';
const qtyStr = mat.purchaseQuantity && mat.purchaseUnitName && mat.conversionFactor && mat.conversionFactor !== 1
? `${fmtAmt(mat.purchaseQuantity)} ${mat.purchaseUnitName}\n(${fmtAmt(mat.quantity || 0)} kg)`
: `${fmtAmt(mat.quantity || 0)} kg`;
return [
formatDisplayDate(mat.purchaseDate || mat.date || mat.createdAt || '') || '-',
(mat.name || 'Material').substring(0, 25),
qtyStr,
fmtAmt(originalAmt),
paid > 0 ? fmtAmt(paid) : '-',
remaining > 0 ? fmtAmt(remaining) : '-',
status
];
});
doc.autoTable({
startY: yPos,
head: [['Invoice Date', 'Material', 'Qty', 'Invoice Amt', 'Paid So Far', 'Remaining', 'Status']],
body: matRows,
theme: 'grid',
headStyles: { fillColor: headerColor, textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [180, 180, 180], overflow: 'linebreak' },
columnStyles: {
0: { cellWidth: 22, halign: 'center' },
1: { cellWidth: 36 },
2: { cellWidth: 24, halign: 'center' },
3: { cellWidth: 27, halign: 'right', fontStyle: 'bold' },
4: { cellWidth: 25, halign: 'right', textColor: [40, 167, 69], fontStyle: 'bold' },
5: { cellWidth: 25, halign: 'right', textColor: [220, 53, 69], fontStyle: 'bold' },
6: { cellWidth: 17, halign: 'center', fontStyle: 'bold' }
},
didParseCell: function(data) {
if (data.column.index === 6) {
const txt = (data.cell.text || []).join('');
if (txt === 'PAID') data.cell.styles.textColor = [40, 167, 69];
if (txt === 'PARTIAL') data.cell.styles.textColor = [200, 100, 0];
if (txt === 'PENDING') data.cell.styles.textColor = [220, 53, 69];
}
},
margin: { left: 14, right: 14 }
});
const afterMat = doc.lastAutoTable.finalY + 5;
if (afterMat < 265) {
doc.setFillColor(255, 245, 230);
doc.roundedRect(14, afterMat, pageW - 28, 14, 2, 2, 'F');
doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
doc.setTextColor(50, 50, 50);
doc.text(`Total Invoiced: ${fmtAmt(totalInvoice)}`, 20, afterMat + 9);
doc.setTextColor(40, 167, 69);
doc.text(`Paid: ${fmtAmt(totalPaid)}`, 88, afterMat + 9);
doc.setTextColor(totalRemaining > 0 ? 220 : 100, totalRemaining > 0 ? 53 : 100, totalRemaining > 0 ? 69 : 100);
doc.setFont(undefined, 'bold');
doc.text(`Outstanding Payable: ${fmtAmt(totalRemaining)}`, 138, afterMat + 9);
}
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
const safeName   = entity.name.replace(/[^a-z0-9]/gi, '_');
if (_textMode) {
  await _shareStatementText(_buildStatementText({ title: 'Account Statement', name: entity.name, phone: (entity.phone || ''), rangeName, tables: _capTables }), (entity.phone || ''));
} else if (pageCount === 1) {
  showToast('Single-page statement — converting to image…', 'info');
  await _exportDocAsImageAndOpenWhatsApp(
    doc,
    entity.phone || '',
    `Entity_Statement_${safeName}_${dateStamp}`
  );
} else {
  doc.save(`Entity_Statement_${safeName}_${dateStamp}.pdf`);
  showToast('PDF exported successfully', 'success');
}
} catch (error) {
showToast("Error generating PDF: " + error.message, "error");
}
}

export async function exportCustomerToPDF(opts = {}) {
const { sales, customers } = await loadCollections('sales', 'customers');
const titleElement = document.getElementById('manageCustomerTitle');
if (!titleElement) { showToast("No customer selected", "warning"); return; }
const titleHTML = titleElement.innerHTML;
const nameMatch = titleHTML.match(/<span>([^<]+)<\/span>/) || titleHTML.match(/^([^<]+)/);
const customerName = nameMatch ? nameMatch[1].trim() : titleElement.innerText.split('\n')[0].trim();
if (!customerName) { showToast("No customer selected", "warning"); return; }
const _rb = rangeBounds(opts && opts.from, opts && opts.to);
const range = (_rb.start || _rb.end) ? 'custom' : 'all';
const _textMode = !!(opts && opts.mode === 'text');
showToast(_textMode ? "Preparing message..." : "Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
await new Promise(r => setTimeout(r, 200));
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Failed to load PDF library. Please refresh and try again.");
const allCustTxns = sales.filter(s => s && s.customerName === customerName);
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const custPeriodCutoff = _rb.start;
const _periodEnd = _rb.end;
const custPriorTxns = custPeriodCutoff
  ? allCustTxns.filter(t => {
      if (t.transactionType === 'OLD_DEBT') return true;
      if (!t.date) return false;
      return new Date(t.date) < custPeriodCutoff;
    })
  : [];
let transactions = custPeriodCutoff
  ? allCustTxns.filter(t => {
      if (t.transactionType === 'OLD_DEBT') return false;
      if (!t.date) return false;
      return new Date(t.date) >= custPeriodCutoff && (!_periodEnd || new Date(t.date) <= _periodEnd);
    })
  : (_periodEnd ? allCustTxns.filter(t => t.transactionType === 'OLD_DEBT' || (t.date && new Date(t.date) <= _periodEnd)) : allCustTxns);
const custOpeningBalance = custPriorTxns.reduce((bal, t) => {
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
    credit = parseFloat(t.totalValue) || 0;
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
const salesContact = customers.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const phone = salesContact?.phone || transactions.find(t => t.customerPhone)?.customerPhone || 'N/A';
const address = salesContact?.address || transactions.find(t => t.customerAddress)?.customerAddress || 'N/A';
const { jsPDF } = window.jspdf;
const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
const _capTables = _textMode ? _captureAutoTables(doc) : null;
const pageW = doc.internal.pageSize.getWidth();
const hdrColor = [40, 167, 69];
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
doc.text(`Customer Account Statement · ${rangeName}`, pageW / 2, 30, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
let yPos = 38;
const _custPdfPhoto = await getPersonPhoto('cust:' + customerName.toLowerCase());
if (_custPdfPhoto) {
  try { doc.addImage(_custPdfPhoto, 'JPEG', pageW - 14 - 22, 25, 22, 22, undefined, 'NONE'); } catch(e) {}
}
doc.setFont(undefined, 'bold'); doc.text('Customer:', 14, yPos);
doc.setFont(undefined, 'normal'); doc.text(customerName, 36, yPos);
doc.setFont(undefined, 'bold'); doc.text('Phone:', 14, yPos + 5);
doc.setFont(undefined, 'normal'); doc.text(phone, 36, yPos + 5);
doc.setFont(undefined, 'bold'); doc.text('Address:', 14, yPos + 10);
doc.setFont(undefined, 'normal'); doc.text(address.substring(0, 60), 36, yPos + 10);
doc.setFont(undefined, 'bold'); doc.text('Generated:', pageW / 2, yPos);
doc.setFont(undefined, 'normal');
doc.text(formatDayMonthYear(now), pageW / 2 + 22, yPos);
yPos += 18;
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, yPos, pageW - 14, yPos);
yPos += 5;
if (transactions.length > 0) {
const getSalePrice = async (t) => {
  if (lockedUnitPrice(t) > 0) return lockedUnitPrice(t);
  return await getEffectiveSalePriceForCustomer(t.customerName, t.supplyStore || getDefaultStoreKey());
};
const _rrSet = await (typeof window.getReconciledRepReturnIds === 'function' ? window.getReconciledRepReturnIds() : new Set());
const buildSaleRow = async (t, runBal) => {
  const pt = t.paymentType || 'CASH';
  const isOldDebt = t.transactionType === 'OLD_DEBT';
  let debit = 0, credit = 0, typeLabel = '', detailLabel = '', extraDetail = '', displayDate = formatDisplayDate(t.supplyDate || t.date);
  if (isOldDebt) {
    debit = parseFloat(t.totalValue) || 0;
    credit = parseFloat(t.partialPaymentReceived) || 0;
    typeLabel = 'OLD DEBT';
    detailLabel = oldDebtNote(t.notes);
    displayDate = '';
  } else if (pt === 'CASH') {
    const val = await getSaleTransactionValue(t);
    debit = val; credit = val;
    typeLabel = 'CASH';
    detailLabel = `${fmtAmt(t.quantity||0)} kg \xd7 ${fmtAmt(await getSalePrice(t))}\n${t.supplyStore?getStoreLabel(t.supplyStore):''}`;
  } else if (pt === 'CREDIT' && !t.creditReceived) {
    const val = await getSaleTransactionValue(t);
    const partial = parseFloat(t.partialPaymentReceived) || 0;
    debit = val; credit = partial;
    typeLabel = partial > 0 ? 'CREDIT\n(PARTIAL)' : 'CREDIT';
    detailLabel = `${fmtAmt(t.quantity||0)} kg \xd7 ${fmtAmt(await getSalePrice(t))}`;
    if (partial > 0) detailLabel += `\nPaid: ${fmtAmt(partial)} | Due: ${fmtAmt(val-partial)}`;
  } else if (pt === 'CREDIT' && t.creditReceived) {
    const val = await getSaleTransactionValue(t);
    debit = val; credit = val;
    typeLabel = 'CREDIT\n(PAID)';
    detailLabel = `${fmtAmt(t.quantity||0)} kg \xd7 ${fmtAmt(await getSalePrice(t))}`;
    displayDate = formatDisplayDate(t.creditReceivedDate || t.supplyDate || t.date);
  } else if (pt === 'REP_RETURN') {
    typeLabel = 'REP RETURN';
    {
      const _rrE = Number(t.expiredQty) || 0, _rrR = Number(t.returnedQty) || 0, _rrP = Number(t.returnUnitPrice) > 0 ? ` @${fmtAmt(Number(t.returnUnitPrice))}` : '';
      detailLabel = '';
      extraDetail = _rrE > 0 ? `Return ${fmtAmt(_rrR)} kg | Expired credit ${fmtAmt(_rrE)} kg${_rrP}` : `Return ${fmtAmt(_rrR)} kg${_rrP}`;
    }
    if (Number(t.returnValue) > 0 && !_rrSet.has(t.id)) { credit = Number(t.returnValue); }
    displayDate = formatDisplayDate(t.date);
  } else if (pt === 'COLLECTION') {
    credit = parseFloat(t.totalValue) || 0;
    typeLabel = 'COLLECTION';
    {
      const _cPay = collectionCollected(t), _cExp = Number(t.expiredValue) || 0;
      const _cHasPay = _cPay > 0 || !(Number(t.expiredQty) > 0), _cHasExp = _cExp > 0;
      const _cExpTxt = _cHasExp ? `Expired credit ${Number(t.expiredQty) > 0 ? `${fmtAmt(Number(t.expiredQty))} kg` : fmtAmt(_cExp)}${Number(t.expiredUnitPrice) > 0 ? ` @${fmtAmt(Number(t.expiredUnitPrice))}` : ''}` : '';
      detailLabel = '';
      extraDetail = [_cHasPay ? `Payment ${fmtAmt(_cPay)}` : '', _cExpTxt].filter(Boolean).join(' | ');
      if (_cHasExp) credit += collectionExpiredLeft(t);
    }
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
  else if (runBal.val > 0) balDisplay = fmtAmt(runBal.val);
  else balDisplay = 'OVERPAID\n' + fmtAmt(Math.abs(runBal.val));
  return { row: [displayDate, typeLabel, detailLabel.substring(0,55) + extraDetail,
    debit>0?fmtAmt(debit):'-', credit>0?fmtAmt(credit):'-', balDisplay],
    debit, credit, qty: t.quantity||0 };
};
const mergedSalesTxns = transactions.filter(t => t.isMerged === true);
const normalSalesTxns = transactions.filter(t => !t.isMerged);
if (mergedSalesTxns.length > 0) {
  yPos = _pdfDrawMergedSectionHeader(doc, yPos, pageW, 'YEAR-END OPENING BALANCES (Carried Forward)');
  const mRunBal = { val: 0 };
  const mergedRows = mergedSalesTxns.map(t => {
    const ms = t.mergedSummary || {};
    const periodLabel = _pdfMergedPeriodLabel(t);
    const countLabel  = _pdfMergedCountLabel(t);
    const isSettled = ms.isSettled || t.creditReceived;
    const netOut = ms.netOutstanding != null ? ms.netOutstanding : (t.totalValue || 0);
    const cashS  = ms.cashSales != null ? ms.cashSales : 0;
    const details = [
      periodLabel,
      countLabel,
      cashS > 0 ? `Cash sales: ${fmtAmt(cashS)}` : '',
      !isSettled ? `Net due: ${fmtAmt(netOut)}` : 'Settled'
    ].filter(Boolean).join('\n');
    mRunBal.val += netOut;
    const balTxt = isSettled ? 'SETTLED' : fmtAmt(netOut);
    const pt = t.paymentType || 'CASH';
    const typeLabel = isSettled ? 'SETTLED\n(MERGED)' : (pt === 'CREDIT' ? 'CREDIT\n(MERGED)' : 'CASH\n(MERGED)');
    return [formatDisplayDate(t.date), typeLabel, details.substring(0,70),
      netOut>0?fmtAmt(netOut):'-', isSettled?fmtAmt(cashS):'-', balTxt];
  });
  doc.autoTable({
    startY: yPos,
    head: [['Date', 'Type', 'Year Period / Summary', 'Outstanding', 'Settled', 'Balance']],
    body: mergedRows,
    theme: 'grid',
    headStyles: { fillColor: PDF_MERGED_HDR_COLOR, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [200, 180, 230], overflow: 'linebreak' },
    columnStyles: {
      0:{cellWidth:22,halign:'center'},1:{cellWidth:22,halign:'center',fontStyle:'bold'},
      2:{cellWidth:52},3:{cellWidth:27,halign:'right',fontStyle:'bold'},
      4:{cellWidth:27,halign:'right',fontStyle:'bold'},5:{cellWidth:26,halign:'center',fontStyle:'bold'}
    },
    didParseCell: function(data) {
      data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR; data.cell.styles.textColor=[80,40,120];
      if (data.column.index===3) data.cell.styles.textColor=[180,40,40];
      if (data.column.index===4) data.cell.styles.textColor=[40,130,60];
      if (data.column.index===5) {
        const txt=(data.cell.text||[]).join('');
        data.cell.styles.textColor = txt==='SETTLED'?[100,100,100]:[126,34,206];
      }
    },
    margin: { left: 14, right: 14 }
  });
  yPos = doc.lastAutoTable.finalY + 6;
  if (yPos > 255) { doc.addPage(); yPos = 20; }
}
const custHasPrior = custPeriodCutoff !== null && custPriorTxns.length > 0;
const txRunBal = { val: custHasPrior ? custOpeningBalance : 0 };
const txRows = [];
let totDebit = 0, totCredit = 0, totQty = 0;
for (const t of normalSalesTxns) {
  const r = await buildSaleRow(t, txRunBal);
  txRows.push(r.row);
  totDebit  += r.debit;
  totCredit += r.credit;
  totQty    += r.qty;
}
if (custHasPrior) {
  const obAbs = Math.abs(custOpeningBalance);
  const obDisplay = obAbs < 0.01 ? 'SETTLED' : fmtAmt(obAbs);
  txRows.unshift([
    'Prior', '—',
    'Opening Balance',
    '-', '-', obDisplay
  ]);
}
const finalBal = (custHasPrior ? custOpeningBalance : 0) + totDebit - totCredit;
if (normalSalesTxns.length > 0 || custHasPrior) {
  doc.setFontSize(8.5); doc.setFont(undefined,'bold');
  doc.setTextColor(...hdrColor);
  doc.text('INDIVIDUAL TRANSACTIONS', 14, yPos);
  doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
  yPos += 5;
  doc.autoTable({
    startY: yPos,
    head: [['Date', 'Type', 'Details', 'Debit (Sale)', 'Credit (Rcvd)', 'Balance']],
    body: txRows,
    theme: 'grid',
    headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [180,180,180], overflow: 'linebreak' },
    columnStyles: {
      0:{cellWidth:22,halign:'center'},1:{cellWidth:22,halign:'center',fontStyle:'bold'},
      2:{cellWidth:62},3:{cellWidth:24,halign:'right',textColor:[220,53,69],fontStyle:'bold'},
      4:{cellWidth:24,halign:'right',textColor:[40,167,69],fontStyle:'bold'},5:{cellWidth:24,halign:'center',fontStyle:'bold'}
    },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 2 && typeof data.cell.raw === 'string' && data.cell.raw.includes('Expired credit') && !data.cell.raw.includes('\n')) {
        data.cell.text = [' '];
      }
      styleStatementRow(data, custHasPrior);
    },
    didDrawCell: function(data) {
      if (data.section !== 'body' || data.column.index !== 2) return;
      const raw = data.cell.raw;
      if (typeof raw !== 'string' || raw.includes('\n')) return;
      const idx = raw.indexOf('Expired credit');
      if (idx < 0) return;
      const left = raw.slice(0, idx), right = raw.slice(idx);
      const avail = data.cell.width - 5;
      let f = 7.5;
      for (; f > 5; f -= 0.25) {
        doc.setFontSize(f); doc.setFont(undefined, 'normal');
        const wL = doc.getTextWidth(left);
        doc.setFont(undefined, 'bold');
        if (wL + doc.getTextWidth(right) <= avail) break;
      }
      const y = data.cell.y + data.cell.height / 2;
      const x = data.cell.x + 2.5;
      doc.setFontSize(f); doc.setFont(undefined, 'normal'); doc.setTextColor(40, 40, 40);
      if (left) doc.text(left, x, y, { baseline: 'middle' });
      const wLeft = left ? doc.getTextWidth(left) : 0;
      doc.setFont(undefined, 'bold'); doc.setTextColor(160, 55, 20);
      doc.text(right, x + wLeft, y, { baseline: 'middle' });
      doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(80, 80, 80);
    },
    margin: { left: 14, right: 14 }
  });
}
const afterY = ((normalSalesTxns.length > 0 || custHasPrior) ? doc.lastAutoTable.finalY : yPos - 5) + 5;
if (afterY < 252) {
const custSummaryH = custHasPrior && Math.abs(custOpeningBalance) >= 0.01 ? 28 : 20;
doc.setFillColor(245, 255, 245);
doc.roundedRect(14, afterY, pageW - 28, custSummaryH, 2, 2, 'F');
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.3);
doc.roundedRect(14, afterY, pageW - 28, custSummaryH, 2, 2, 'S');
doc.setFontSize(8); doc.setFont(undefined, 'normal');
if (custHasPrior && Math.abs(custOpeningBalance) >= 0.01) {
  const obSign = custOpeningBalance > 0 ? '+' : '-';
  doc.setTextColor(30, 80, 160);
  doc.text(`Opening Balance: ${obSign}${fmtAmt(Math.abs(custOpeningBalance))}`, pageW / 2, afterY + 7, { align: 'center' });
  doc.setTextColor(220, 53, 69);
  doc.text(`Period Debit: ${fmtAmt(totDebit)}`, pageW / 4, afterY + 15, { align: 'center' });
  doc.setTextColor(40, 167, 69);
  doc.text(`Period Credit: ${fmtAmt(totCredit)}`, (pageW * 3) / 4, afterY + 15, { align: 'center' });
} else {
  doc.setTextColor(220, 53, 69);
  doc.text(`Total Debit (Sales): ${fmtAmt(totDebit)}`, pageW / 4, afterY + 8, { align: 'center' });
  doc.setTextColor(40, 167, 69);
  doc.text(`Total Credit (Rcvd): ${fmtAmt(totCredit)}`, (pageW * 3) / 4, afterY + 8, { align: 'center' });
}
doc.setTextColor(Math.abs(finalBal) < 0.01 ? 100 : finalBal > 0 ? 220 : 40,
Math.abs(finalBal) < 0.01 ? 100 : finalBal > 0 ? 53 : 167,
Math.abs(finalBal) < 0.01 ? 100 : finalBal > 0 ? 69 : 69);
doc.setFont(undefined, 'bold');
const balStr = Math.abs(finalBal) < 0.01 ? 'SETTLED'
: finalBal > 0 ? `Outstanding Due: ${fmtAmt(finalBal)}`
: `Overpaid by: ${fmtAmt(Math.abs(finalBal))}`;
doc.text(balStr, pageW / 2, afterY + (custHasPrior && Math.abs(custOpeningBalance) >= 0.01 ? 23 : 15), { align: 'center' });
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
`Generated on ${formatDayMonthYear(now)} at ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW / 2, 291, { align: 'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 287, { align: 'center' });
}
await new Promise(r => setTimeout(r, 100));
const dateStamp    = localDateStr();
const safeCustName = customerName.replace(/[^a-z0-9]/gi, '_');
if (_textMode) {
  await _shareStatementText(_buildStatementText({ title: 'Customer Account Statement', name: customerName, phone: phone, rangeName, tables: _capTables }), phone);
} else if (pageCount === 1) {
  showToast('Single-page statement — converting to image…', 'info');
  await _exportDocAsImageAndOpenWhatsApp(
    doc,
    phone,
    `Customer_Statement_${safeCustName}_${dateStamp}`
  );
} else {
  doc.save(`Customer_Statement_${safeCustName}_${dateStamp}.pdf`);
  showToast('PDF exported successfully', 'success');
}
} catch (error) {
showToast("Error generating PDF: " + error.message, "error");
}
}

export const SCRIPT_INTEGRITY = {
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js':
    'sha256-mMzxeqEMILsTAXYmGPzJtqs6Tn8mtgcdZNC0EVTfOHU=',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js':
    'sha256-iQWUsO+u9rPj2uc1m13fZG9V4W2wef4jIt5gMh2dRac='
};

export const _scriptLoadPromises = {};
export let _photoCaptureTarget = null;
export let _photoCaptureStream = null;

export function _photoIds(prefix) {
  return {
    preview: prefix + '-photo-preview',
    placeholder: prefix + '-photo-placeholder',
    img: prefix + '-photo-img',
    clearBtn: prefix + '-photo-clear-btn',
    fileInput: prefix + '-photo-file',
  };
}

export function handlePersonPhotoFile(event, prefix) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => applyPersonPhoto(prefix, e.target.result);
  reader.readAsDataURL(file);
  event.target.value = '';
}

export function applyPersonPhoto(prefix, dataUrl) {
  const ids = _photoIds(prefix);
  const ph = document.getElementById(ids.placeholder);
  const img = document.getElementById(ids.img);
  const clearBtn = document.getElementById(ids.clearBtn);
  if (ph) window.setDisplay(ph, 'none');
  if (img) { img.src = dataUrl; window.setDisplay(img, 'block'); }
  if (clearBtn) window.setDisplay(clearBtn, '');
  const preview = document.getElementById(ids.preview);
  if (preview) preview.dataset.pendingPhoto = dataUrl;
}

export function clearPersonPhoto(prefix) {
  const ids = _photoIds(prefix);
  const ph = document.getElementById(ids.placeholder);
  const img = document.getElementById(ids.img);
  const clearBtn = document.getElementById(ids.clearBtn);
  if (ph) window.setDisplay(ph, '');
  if (img) { img.src = ''; window.setDisplay(img, 'none'); }
  if (clearBtn) window.setDisplay(clearBtn, 'none');
  const preview = document.getElementById(ids.preview);
  if (preview) { preview.dataset.pendingPhoto = ''; preview.dataset.existingPhotoKey = ''; }
}

export async function loadPersonPhotoIntoEditor(prefix, storageKey) {
  const ids = _photoIds(prefix);
  const preview = document.getElementById(ids.preview);
  if (preview) { preview.dataset.pendingPhoto = ''; preview.dataset.existingPhotoKey = storageKey || ''; }
  clearPersonPhoto(prefix);
  if (!storageKey) return;
  try {
    const stored = await sqliteStore.get('photos');
    const photos = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const dataUrl = photos[storageKey];
    if (dataUrl) applyPersonPhoto(prefix, dataUrl);
  } catch(e) {}
}

export async function savePersonPhoto(prefix, storageKey) {
  if (!storageKey) return;
  const ids = _photoIds(prefix);
  const preview = document.getElementById(ids.preview);
  if (!preview) return;
  const pending = preview.dataset.pendingPhoto;
  if (pending === undefined) return;
  try {
    const stored = await sqliteStore.get('photos');
    const photos = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const timestamps = (await sqliteStore.get('photostamps')) || {};
    const now = Date.now();
    if (pending) {
      const compressed = await _compressPhoto(pending, 1280, 0.75);
      photos[storageKey] = compressed;
      timestamps[storageKey] = now;
    } else {
      delete photos[storageKey];
      delete timestamps[storageKey];
    }
    await sqliteStore.set('photos', photos);
    await sqliteStore.set('photostamps', timestamps);
    const _dirtyKeys = (await sqliteStore.get('photodirty')) || [];
    if (!_dirtyKeys.includes(storageKey)) _dirtyKeys.push(storageKey);
    await sqliteStore.set('photodirty', _dirtyKeys);
    await sqliteStore.set('photos_timestamp', now);
    if (typeof triggerAutoSync === 'function') { try { triggerAutoSync(); } catch(_) {} }
  } catch(e) { console.warn('Photo save failed', e); }
}

export async function getPersonPhoto(storageKey) {
  if (!storageKey) return null;
  try {
    const stored = await sqliteStore.get('photos');
    const photos = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    return photos[storageKey] || null;
  } catch(e) { return null; }
}

export const PHOTO_MAX_CHARS = 700000;

export async function _compressPhoto(dataUrl, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL('image/jpeg', quality);
      let q = quality, cw = w, ch = h;
      for (let i = 0; i < 6 && out.length > PHOTO_MAX_CHARS; i++) {
        if (q > 0.5) q = Math.max(0.5, q - 0.1);
        else {
          cw = Math.round(cw * 0.85); ch = Math.round(ch * 0.85);
          canvas.width = cw; canvas.height = ch;
          canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        }
        out = canvas.toDataURL('image/jpeg', q);
      }
      resolve(out);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

let _camFacing = 'environment';
let _camZoom = 1;
let _camCaps = { min: 1, max: 4, hw: false };
let _camRaf = 0;
let _camPinch = null;
let _camGrid = true;
let _camBusy = false;
const _camPointers = new Map();
const CAM_ZOOM_STOPS = [1, 2, 3, 5, 8];
const CAM_TITLES = {
  prod: 'Product photo',
  expense: 'Expense receipt',
  paytransfer: 'Payment proof',
  entity: 'Profile photo',
  cust: 'Profile photo',
  'rep-cust': 'Profile photo'
};

function _camEls() {
  return {
    modal: document.getElementById('photo-capture-modal'),
    video: document.getElementById('photo-capture-video'),
    view: document.getElementById('cam-view'),
    stage: document.getElementById('cam-stage'),
    badge: document.getElementById('cam-zoom-badge'),
    pills: document.getElementById('cam-pills'),
    torch: document.getElementById('torch-btn'),
    flip: document.getElementById('cam-flip-btn'),
    focus: document.getElementById('cam-focus'),
    title: document.getElementById('cam-title'),
    gridBtn: document.getElementById('cam-grid-btn')
  };
}

function _camLayout() {
  const { video, view, stage } = _camEls();
  if (!video || !view || !stage) return;
  const ar = (video.videoWidth || 3) / (video.videoHeight || 4);
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  let w = W, h = W / ar;
  if (h > H) { h = H; w = H * ar; }
  view.style.width = Math.floor(w) + 'px';
  view.style.height = Math.floor(h) + 'px';
}

function _camRenderPills() {
  const { pills } = _camEls();
  if (!pills) return;
  const stops = CAM_ZOOM_STOPS.filter(z => z >= _camCaps.min - 0.001 && z <= _camCaps.max + 0.001);
  pills.innerHTML = stops.length < 2 ? '' : stops.map(z => `<button type="button" class="cam-pill${Math.abs(_camZoom - z) < 0.06 ? ' on' : ''}" onclick="setCameraZoom(${z})">${z}×</button>`).join('');
}

function _camApplyZoom(z) {
  const { video, badge, view } = _camEls();
  _camZoom = Math.min(_camCaps.max, Math.max(_camCaps.min, z));
  if (badge) {
    badge.textContent = (Math.round(_camZoom * 10) / 10) + '×';
    badge.classList.add('show');
    clearTimeout(badge._t);
    badge._t = setTimeout(() => badge.classList.remove('show'), 1100);
  }
  if (view) view.classList.toggle('is-front', _camFacing === 'user');
  const track = _camCaps.hw && _photoCaptureStream ? _photoCaptureStream.getVideoTracks()[0] : null;
  if (track && track.applyConstraints) {
    cancelAnimationFrame(_camRaf);
    _camRaf = requestAnimationFrame(() => { track.applyConstraints({ advanced: [{ zoom: _camZoom }] }).catch(() => {}); });
  }
  if (video) video.style.setProperty('--cam-zoom', track ? '1' : String(_camZoom));
  _camRenderPills();
}

export function setCameraZoom(z) { _camApplyZoom(Number(z) || 1); }

export function toggleCameraGrid() {
  const { view, gridBtn } = _camEls();
  _camGrid = !_camGrid;
  if (view) view.classList.toggle('grid-on', _camGrid);
  if (gridBtn) { gridBtn.classList.toggle('on', _camGrid); gridBtn.setAttribute('aria-pressed', _camGrid ? 'true' : 'false'); }
}

function _camFocusAt(clientX, clientY) {
  const { view, focus } = _camEls();
  if (!view || !focus) return;
  const r = view.getBoundingClientRect();
  focus.style.setProperty('--cam-fx', (clientX - r.left) + 'px');
  focus.style.setProperty('--cam-fy', (clientY - r.top) + 'px');
  focus.classList.remove('go');
  void focus.offsetWidth;
  focus.classList.add('go');
  const track = _photoCaptureStream && _photoCaptureStream.getVideoTracks()[0];
  if (!track || !track.applyConstraints) return;
  const pt = { x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)) };
  track.applyConstraints({ advanced: [{ pointsOfInterest: [pt], focusMode: 'single-shot' }] }).catch(() => {});
}

function _camInstallGestures() {
  const { view } = _camEls();
  if (!view || view._camBound) return;
  view._camBound = true;
  const dist = () => { const p = [..._camPointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  let tap = null;
  let lastTap = 0;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (view.setPointerCapture) view.setPointerCapture(e.pointerId);
    _camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_camPointers.size === 2) { _camPinch = { d: dist(), z: _camZoom }; tap = null; }
    else tap = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  view.addEventListener('pointermove', (e) => {
    if (!_camPointers.has(e.pointerId)) return;
    _camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;
    if (_camPointers.size === 2 && _camPinch && _camPinch.d > 0) _camApplyZoom(_camPinch.z * (dist() / _camPinch.d));
  });
  const end = (e) => {
    if (!_camPointers.has(e.pointerId)) return;
    _camPointers.delete(e.pointerId);
    if (_camPointers.size < 2) _camPinch = null;
    if (_camPointers.size > 0) return;
    const wasTap = tap && e.type === 'pointerup' && Date.now() - tap.t < 350;
    tap = null;
    if (!wasTap) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      lastTap = 0;
      _camApplyZoom(_camZoom > 1.4 ? _camCaps.min : Math.min(2, _camCaps.max));
    } else {
      lastTap = now;
      _camFocusAt(e.clientX, e.clientY);
    }
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('wheel', (e) => { e.preventDefault(); _camApplyZoom(_camZoom * (e.deltaY < 0 ? 1.08 : 0.93)); }, { passive: false });
  window.addEventListener('resize', _camLayout);
}

async function _camStart() {
  const { video, torch, flip, view } = _camEls();
  _camStopStream();
  _photoCaptureStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: _camFacing }, width: { ideal: 4096 }, height: { ideal: 4096 } },
    audio: false
  });
  video.srcObject = _photoCaptureStream;
  if (view) view.classList.toggle('is-front', _camFacing === 'user');
  const track = _photoCaptureStream.getVideoTracks()[0];
  const caps = track && track.getCapabilities ? track.getCapabilities() : {};
  if (torch) window.setDisplay(torch, caps.torch ? 'flex' : 'none');
  if (flip) window.setDisplay(flip, 'flex');
  if (caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min) {
    _camCaps = { min: Math.max(1, caps.zoom.min), max: Math.min(caps.zoom.max, 10), hw: true };
  } else {
    _camCaps = { min: 1, max: 4, hw: false };
  }
  _camApplyZoom(_camCaps.min);
  if (video.readyState >= 1) _camLayout(); else video.addEventListener('loadedmetadata', _camLayout, { once: true });
  setTimeout(_camLayout, 250);
}

function _camStopStream() {
  if (!_photoCaptureStream) return;
  try {
    const track = _photoCaptureStream.getVideoTracks()[0];
    if (track && track.applyConstraints && window._torchOn) track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
  } catch (_) {}
  _photoCaptureStream.getTracks().forEach(t => t.stop());
  _photoCaptureStream = null;
}

function _camResetTorch() {
  window._torchOn = false;
  const { torch } = _camEls();
  if (torch) torch.classList.remove('on');
}

export async function openPhotoCapture(prefix) {
  _photoCaptureTarget = prefix;
  const { modal, video, view, title, gridBtn } = _camEls();
  if (!modal || !video) return;
  _camBusy = false;
  _camFacing = 'environment';
  _camResetTorch();
  if (title) title.textContent = CAM_TITLES[prefix] || 'Photo';
  if (view) view.classList.toggle('grid-on', _camGrid);
  if (gridBtn) { gridBtn.classList.toggle('on', _camGrid); gridBtn.setAttribute('aria-pressed', _camGrid ? 'true' : 'false'); }
  window.setDisplay(modal, 'flex');
  _camInstallGestures();
  try {
    await _camStart();
  } catch (e) {
    window.setDisplay(modal, 'none');
    _photoCaptureTarget = null;
    showToast('Camera not available. Check the camera permission for this app.', 'warning');
  }
}

export async function flipCamera() {
  const previous = _camFacing;
  _camFacing = previous === 'environment' ? 'user' : 'environment';
  _camResetTorch();
  try { await _camStart(); } catch (_) {
    _camFacing = previous;
    showToast('Could not switch camera', 'warning');
    try { await _camStart(); } catch (__) {}
  }
}

export function closePhotoCapture() {
  const { modal, video, view } = _camEls();
  if (modal) window.setDisplay(modal, 'none');
  _camStopStream();
  if (video) { video.srcObject = null; video.style.removeProperty('--cam-zoom'); }
  if (view) view.classList.remove('is-front');
  _camPointers.clear();
  _camPinch = null;
  _camResetTorch();
  _photoCaptureTarget = null;
}

export async function toggleTorch() {
  const track = _photoCaptureStream && _photoCaptureStream.getVideoTracks()[0];
  if (!track) return;
  window._torchOn = !window._torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: window._torchOn }] });
    const btn = document.getElementById('torch-btn');
    if (btn) btn.classList.toggle('on', !!window._torchOn);
  } catch (e) {
    showToast('Flashlight not supported on this device', 'warning');
    window._torchOn = false;
  }
}

function _camDeliver(target, dataUrl) {
  if (target === 'expense') _applyExpensePendingPhoto(dataUrl);
  else if (target === 'paytransfer') { if (typeof _applyPaymentTransferPendingPhoto === 'function') _applyPaymentTransferPendingPhoto(dataUrl); }
  else if (target === 'prod') { if (typeof window.addProdPhotoDataUrl === 'function') window.addProdPhotoDataUrl(dataUrl); }
  else applyPersonPhoto(target, dataUrl);
}

async function _camFullSensorStill(video) {
  const track = _photoCaptureStream && _photoCaptureStream.getVideoTracks()[0];
  if (!track || typeof ImageCapture !== 'function' || (!_camCaps.hw && _camZoom > 1.001)) return null;
  try {
    const ic = new ImageCapture(track);
    const caps = await ic.getPhotoCapabilities();
    const opts = {};
    if (caps.imageWidth && caps.imageWidth.max) opts.imageWidth = caps.imageWidth.max;
    if (caps.imageHeight && caps.imageHeight.max) opts.imageHeight = caps.imageHeight.max;
    const dataUrl = await readFileAsDataUrl(await ic.takePhoto(opts));
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const want = video.videoWidth / video.videoHeight;
    const got = img.naturalWidth / img.naturalHeight;
    return Math.abs(got - want) / want < 0.03 || Math.abs(1 / got - want) / want < 0.03 ? dataUrl : null;
  } catch (_) { return null; }
}

function _camFrameStill(video, canvas) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const z = _camCaps.hw ? 1 : _camZoom;
  const sw = w / z, sh = h / z;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export async function capturePhotoFromCamera() {
  const { video } = _camEls();
  const canvas = document.getElementById('photo-capture-canvas');
  if (_camBusy || !video || !canvas || !_photoCaptureTarget || !video.videoWidth) return;
  _camBusy = true;
  const target = _photoCaptureTarget;
  const fl = document.getElementById('cam-flash');
  if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
  try { if (navigator.vibrate) navigator.vibrate(25); } catch (_) {}
  const dataUrl = (await _camFullSensorStill(video)) || _camFrameStill(video, canvas);
  closePhotoCapture();
  _camBusy = false;
  _camDeliver(target, dataUrl);
}

export function openCameraGallery() {
  const input = document.getElementById('cam-gallery-input');
  if (input) input.click();
}

export async function handleCameraGalleryFiles(event) {
  const files = Array.from((event.target.files || [])).filter(f => !f.type || f.type.startsWith('image/'));
  event.target.value = '';
  const target = _photoCaptureTarget;
  if (!files.length || !target) return;
  closePhotoCapture();
  try {
    if (target === 'prod' && typeof window.addProdPhotos === 'function') { await window.addProdPhotos(files); return; }
    _camDeliver(target, await readFileAsDataUrl(files[0]));
  } catch (e) {
    showToast('Could not load the selected photo', 'warning');
  }
}

window._expensePendingPhoto = null;

export function openExpensePhotoCapture() {
  openPhotoCapture('expense');
}

export function handleExpensePhotoFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => _applyExpensePendingPhoto(e.target.result);
  reader.readAsDataURL(file);
  event.target.value = '';
}

export function _applyExpensePendingPhoto(dataUrl) {
  window._expensePendingPhoto = dataUrl;
  const dot = document.getElementById('expense-photo-dot');
  const btn = document.getElementById('expense-photo-btn');
  if (dot) window.setDisplay(dot, dataUrl ? '' : 'none');
  if (btn) {
    window.setStyle(btn, 'border-color', dataUrl ? 'st-border-color__38fcbe' : 'st-border-color__aa2589');
    btn.title = dataUrl ? 'Photo attached — click to replace' : 'Attach photo';
  }
}

export function renderPersonAvatarHTML(photoDataUrl, size) {
  const sz = size || 44;
  if (photoDataUrl) {
    const safe = photoDataUrl.replace(/'/g, '&#39;');
    return `<div class="person-avatar-ring dc-width dc-height st-cursor__3b6a3a st-position__d461c9" style="--d-width: ${sz}px; --d-height: ${sz}px" onclick="openPhotoLightbox('${safe}')" title="View photo"><img src="${photoDataUrl}" alt="" class="u-b53f32f d-block"><div class="u-578ba6d st-background__f4525e hv-dim u-23fc511"></div></div>`;
  }
  return `<div class="person-avatar-ring dc-width dc-height" style="--d-width: ${sz}px; --d-height: ${sz}px"><svg width="${Math.round(sz*0.5)}" height="${Math.round(sz*0.5)}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="12.5" r="6.2" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 31.5C5.5 23.5 12 20.5 18 20.5S30.5 23.5 30.5 31.5Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg></div>`;
}

(function() {
  const MIN_SCALE = 1, MAX_SCALE = 6, DISMISS_PX = 110;
  const ptrs = new Map();
  let s = 1, x = 0, y = 0;
  let pinch = null, drag = null, lastTap = null;
  const $ = (id) => document.getElementById(id);
  const clampScale = (v) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
  function apply(animate) {
    const img = $('photo-lightbox-img');
    if (!img) return;
    img.classList.toggle('animate', !!animate);
    img.classList.toggle('zoomed', s > 1.001);
    img.style.setProperty('--lb-s', String(s));
    img.style.setProperty('--lb-x', x + 'px');
    img.style.setProperty('--lb-y', y + 'px');
    const label = $('photo-lb-zoom-label');
    if (label) label.textContent = (Math.round(s * 10) / 10) + '×';
  }
  function setDim(v) {
    const modal = $('photo-lightbox-modal');
    if (modal) modal.style.setProperty('--lb-dim', String(v));
  }
  function clampPan() {
    const stage = $('photo-lightbox-inner'), img = $('photo-lightbox-img');
    if (!stage || !img) return;
    const mx = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2);
    const my = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  }
  function rel(cx, cy) {
    const r = $('photo-lightbox-inner').getBoundingClientRect();
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  }
  function zoomTo(next, fx, fy, animate) {
    next = clampScale(next);
    const k = next / s;
    x = fx - (fx - x) * k;
    y = fy - (fy - y) * k;
    s = next;
    if (s <= MIN_SCALE + 0.001) { s = MIN_SCALE; x = 0; y = 0; } else clampPan();
    apply(animate);
  }
  function touched() {
    const modal = $('photo-lightbox-modal');
    if (modal) modal.classList.add('touched');
  }
  _lbZoom = function(dir) { zoomTo(s + dir * 0.5, 0, 0, true); }; window._lbZoom = _lbZoom;
  _lbResetZoom = function() { zoomTo(MIN_SCALE, 0, 0, true); }; window._lbResetZoom = _lbResetZoom;
  const mid = () => { const p = [...ptrs.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }; };
  function seedDrag(p, onImg, moved) {
    drag = { px: p.x, py: p.y, sx: x, sy: y, onImg, moved, t: Date.now() };
  }
  function onDown(e) {
    const stage = $('photo-lightbox-inner');
    touched();
    if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const m = mid(), c = rel(m.x, m.y);
      pinch = { d: m.d, s, x, y, mx: c.x, my: c.y };
      drag = null;
    } else if (ptrs.size === 1) {
      seedDrag({ x: e.clientX, y: e.clientY }, e.target === $('photo-lightbox-img'), false);
    }
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch && pinch.d > 0) {
      const m = mid(), c = rel(m.x, m.y);
      const ns = clampScale(pinch.s * m.d / pinch.d);
      const k = ns / pinch.s;
      s = ns;
      x = c.x - (pinch.mx - pinch.x) * k;
      y = c.y - (pinch.my - pinch.y) * k;
      if (s <= MIN_SCALE + 0.001) { x = 0; y = 0; } else clampPan();
      apply(false);
      return;
    }
    if (ptrs.size !== 1 || !drag) return;
    const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; $('photo-lightbox-img').classList.add('dragging'); }
    if (!drag.moved) return;
    if (s > 1.001) {
      x = drag.sx + dx; y = drag.sy + dy;
      clampPan();
    } else {
      x = dx * 0.35; y = dy;
      setDim(1 - Math.min(1, Math.abs(dy) / 420));
    }
    apply(false);
  }
  function onUp(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 1) { seedDrag([...ptrs.values()][0], true, true); return; }
    if (ptrs.size > 0) return;
    const img = $('photo-lightbox-img');
    if (img) img.classList.remove('dragging');
    const d = drag;
    drag = null;
    if (!d) return;
    if (!d.moved) {
      if (e.type !== 'pointerup') return;
      if (!d.onImg) { closePhotoLightbox(); return; }
      const now = Date.now();
      if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
        lastTap = null;
        if (s > 1.001) zoomTo(MIN_SCALE, 0, 0, true);
        else { const c = rel(e.clientX, e.clientY); zoomTo(2.5, c.x, c.y, true); }
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      return;
    }
    if (s <= 1.001) {
      if (e.type === 'pointerup' && Math.abs(y) > DISMISS_PX) { closePhotoLightbox(); return; }
      x = 0; y = 0;
      setDim(1);
      apply(true);
    }
  }
  function onWheel(e) {
    e.preventDefault();
    touched();
    const c = rel(e.clientX, e.clientY);
    zoomTo(s * (e.deltaY < 0 ? 1.15 : 0.87), c.x, c.y, false);
  }
  function onKey(e) {
    if (e.key === 'Escape') closePhotoLightbox();
    else if (e.key === '+' || e.key === '=') _lbZoom(1);
    else if (e.key === '-') _lbZoom(-1);
    else if (e.key === '0') _lbResetZoom();
  }
  function bindOnce(stage) {
    if (stage._lbBound) return;
    stage._lbBound = true;
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
  }
  function reset() {
    s = 1; x = 0; y = 0;
    ptrs.clear(); pinch = null; drag = null; lastTap = null;
  }
  openPhotoLightbox = function(src) {
    const modal = $('photo-lightbox-modal'), img = $('photo-lightbox-img'), stage = $('photo-lightbox-inner');
    if (!modal || !img || !stage || !src) return;
    reset();
    img.src = src;
    img.classList.remove('dragging');
    setDim(1);
    apply(false);
    modal.classList.remove('touched');
    bindOnce(stage);
    window.setDisplay(modal, 'flex');
    document.body.classList.add('scroll-locked');
    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
  }; window.openPhotoLightbox = openPhotoLightbox;
  closePhotoLightbox = function() {
    const modal = $('photo-lightbox-modal'), img = $('photo-lightbox-img');
    if (modal) window.setDisplay(modal, 'none');
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('scroll-locked');
    reset();
    setDim(1);
    if (img) { img.removeAttribute('src'); apply(false); }
  }; window.closePhotoLightbox = closePhotoLightbox;
})();

export function previewPhotoClick(prefix) {
  const img = document.getElementById(prefix + '-photo-img');
  if (img && window.getDisplay(img) !== 'none' && img.src && img.src !== window.location.href) {
    openPhotoLightbox(img.src);
  } else {
    document.getElementById(prefix + '-photo-file').click();
  }
}

export function loadScript(url, integrity) {
  if (/\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js$/.test(url)) { url = 'vendor/jspdf.umd.min.js'; integrity = null; }
  else if (/\/jspdf-autotable\/3\.5\.31\/jspdf\.plugin\.autotable\.min\.js$/.test(url)) { url = 'vendor/jspdf.plugin.autotable.min.js'; integrity = null; }
  const existing = document.querySelector('script[src="' + url + '"]');
  if (existing && !existing.dataset.failed) {
    if (_scriptLoadPromises[url]) return _scriptLoadPromises[url];
    return Promise.resolve();
  }
  if (_scriptLoadPromises[url]) return _scriptLoadPromises[url];
  _scriptLoadPromises[url] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    const sri = integrity || SCRIPT_INTEGRITY[url];
    if (sri) {
      script.integrity = sri;
      script.crossOrigin = 'anonymous';
    }
    script.onload = () => {
      delete _scriptLoadPromises[url];
      if (/jspdf\.umd/.test(url) && window.jspdf && window.jspdf.jsPDF) installJsPdfImageLog(window.jspdf.jsPDF);
      if (/jspdf\.umd/.test(url)) loadBrandLogo().then(() => resolve(), () => resolve());
      else resolve();
    };
    script.onerror = () => {
      script.dataset.failed = '1';
      document.head.removeChild(script);
      delete _scriptLoadPromises[url];
      if (sri) {
        const fallback = document.createElement('script');
        fallback.src = url;
        fallback.crossOrigin = 'anonymous';
        fallback.onload = () => resolve();
        fallback.onerror = () => reject(new Error('Failed to load: ' + url));
        document.head.appendChild(fallback);
      } else {
        reject(new Error('Failed to load: ' + url));
      }
    };
    document.head.appendChild(script);
  });
  return _scriptLoadPromises[url];
}

export const SarimChart = (() => {
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function _fmt(v) { return typeof fmtAmt === 'function' ? fmtAmt(+v || 0) : Math.round(+v || 0).toLocaleString(); }
  function _short(v) {
    v = +v || 0;
    if (v >= 1e6) return (v/1e6).toFixed(1)+'M';
    if (v >= 1e3) return (v/1e3).toFixed(v < 1e4 ? 1 : 0).replace(/\.0$/, '')+'k';
    return Math.round(v).toString();
  }
  let _uid = 0;
  function _compact(v) {
    v = +v || 0; const a = Math.abs(v);
    if (a >= 1e7) return (v / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'Cr';
    if (a >= 1e5) return (v / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '') + 'L';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return (a < 100 && v % 1 !== 0) ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v).toString();
  }
  function _tick(v, max) {
    if (!v) return '0';
    const a = Math.abs(max || v);
    const [div, unit] = a >= 1e7 ? [1e7, 'Cr'] : a >= 1e5 ? [1e5, 'L'] : a >= 1e3 ? [1e3, 'k'] : [1, ''];
    return String(+(v / div).toFixed(2)) + unit;
  }
  function _niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    const steps = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10];
    return (steps.find((s) => s >= f - 1e-9) || 10) * p;
  }
  function _rbar(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`;
  }
  function _smooth(p) {
    if (p.length < 2) return p.length ? `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}` : '';
    let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
      const c1y = Math.max(lo, Math.min(hi, p1.y + (p2.y - p0.y) / 6));
      const c2y = Math.max(lo, Math.min(hi, p2.y - (p3.y - p1.y) / 6));
      d += `C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${c1y.toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }
  let _bodyTip = null;
  function _getBodyTip() {
    if (!_bodyTip || !_bodyTip.isConnected) {
      _bodyTip = document.createElement('div');
      _bodyTip.className = 'sc-tooltip';
      _bodyTip.classList.add('d-none', 'st-position__072a0d', 'st-pointer-events__8b1364', 'u-a7cc75a');
      document.body.appendChild(_bodyTip);
    }
    return _bodyTip;
  }
  function _bindTips(host) {
    host.querySelectorAll('[data-tip]').forEach(el => {
      const show = () => {
        const tip = _getBodyTip();
        tip.textContent = el.dataset.tip;
        window.setDisplay(tip, 'block');
        const r = el.getBoundingClientRect();
        const tw = tip.offsetWidth || 120;
        let left = r.left + r.width / 2 - tw / 2;
        let top = r.top - 38;
        if (top < 4) top = r.bottom + 4;
        left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
      };
      el.addEventListener('mouseenter', show);
      el.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); show(); }, {passive:false});
      el.addEventListener('mouseleave', () => { const tip = _getBodyTip(); window.setDisplay(tip, 'none'); });
      el.addEventListener('touchend', () => setTimeout(() => { const tip = _getBodyTip(); window.setDisplay(tip, 'none'); }, 1800));
    });
  }
  class SarimChart {
    constructor(el, cfg) {
      this.el = el; this.config = cfg;
      this.data = JSON.parse(JSON.stringify(cfg.data || {labels:[],datasets:[]}));
      this.options = cfg.options || {};
      if (this.el) { this.el.classList.add('sc-host'); this._render(); }
    }
    destroy() { if (this.el) { this.el.innerHTML = ''; this.el.classList.remove('sc-host'); } }
    update() { if (this.el) this._render(); }
    _render() {
      if (!this.el) return;
      const t = this.config.type;
      if (t === 'bar') this._bar();
      else if (t === 'pie') this._pie();
      else if (t === 'line') this._line();
    }
    _titleHtml() {
      const p = this.options?.plugins?.title;
      return (p?.display && p?.text) ? `<div class="cx-title">${_esc(p.text)}</div>` : '';
    }
    _color(ds, i) {
      const pick = (v) => (Array.isArray(v) ? (v[i] != null ? v[i] : v[0]) : v);
      const solid = pick(ds.borderColor);
      return solid || pick(ds.backgroundColor) || themeColor('--accent');
    }
    _legendHtml(datasets) {
      if (this.options?.plugins?.legend?.display === false) return '';
      return '<div class="cx-legend">' + datasets.map((ds) => {
        const c = this._color(ds, 0);
        return `<span class="cx-legend-item"><span class="sx-dot dc-background" style="--d-background: ${_esc(c)}"></span>${_esc(ds.label || '')}</span>`;
      }).join('') + '</div>';
    }
    _empty(msg) {
      this.el.innerHTML = `<div class="cx">${this._titleHtml()}<div class="cx-empty">${_esc(msg || 'No data yet')}</div></div>`;
    }
    _bar() {
      const { datasets = [], labels = [] } = this.data;
      const n = labels.length;
      if (!n || !datasets.length) return this._empty();
      const stacked = !!this.options?.scales?.y?.stacked;
      const uid = ++_uid;
      const val = (ds, i) => +ds.data[i] || 0;
      const totals = labels.map((_, i) => stacked ? datasets.reduce((a, ds) => a + val(ds, i), 0) : Math.max(0, ...datasets.map((ds) => val(ds, i))));
      const rawMax = Math.max(0, ...totals);
      if (rawMax <= 0) return this._empty('Nothing recorded in this period');
      const maxVal = _niceMax(rawMax);
      const W = 320, H = 184, pL = 36, pR = 8, pT = 22, pB = 24;
      const cW = W - pL - pR, cH = H - pT - pB, slot = cW / n;
      const yOf = (v) => pT + cH - (v / maxVal) * cH;
      const single = datasets.length === 1 && !stacked;
      const peakIdx = single ? totals.indexOf(rawMax) : -1;
      let defs = '', grid = '', body = '', xl = '';
      for (let i = 0; i <= 4; i++) {
        const y = pT + cH - (i / 4) * cH;
        if (i > 0) grid += `<line class="cx-grid" x1="${pL}" y1="${y.toFixed(1)}" x2="${W - pR}" y2="${y.toFixed(1)}"/>`;
        grid += `<text class="cx-tick" x="${pL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${_tick(maxVal * i / 4, maxVal)}</text>`;
      }
      grid += `<line class="cx-axis" x1="${pL}" y1="${pT + cH}" x2="${W - pR}" y2="${pT + cH}"/>`;
      const groupW = Math.min(slot * 0.66, stacked || single ? 34 : 44);
      const barW = single || stacked ? groupW : groupW / datasets.length - 2;
      const showAllVals = single && n <= 8;
      labels.forEach((lbl, i) => {
        const cx = pL + slot * i + slot / 2;
        if (single) {
          const ds = datasets[0], v = val(ds, i), c = this._color(ds, i), gid = `cxg${uid}_${i}`;
          const h = Math.max(v > 0 ? 2 : 0, (v / maxVal) * cH), x = cx - barW / 2, y = pT + cH - h;
          defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${_esc(c)}"/><stop offset="1" stop-color="${_esc(c)}" stop-opacity="0.35"/></linearGradient>`;
          body += `<rect class="cx-hit" x="${(cx - slot / 2).toFixed(1)}" y="${pT}" width="${slot.toFixed(1)}" height="${cH}" data-tip="${_esc(`${lbl}: ${_fmt(v)}`)}" tabindex="0"/>`;
          if (h > 0) body += `<path class="cx-bar${i === peakIdx ? ' is-peak' : ''}" pointer-events="none" fill="url(#${gid})" d="${_rbar(x, y, barW, h, 5)}"/>`;
          if (v > 0 && (showAllVals || i === peakIdx)) body += `<text class="cx-val" x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${_compact(v)}</text>`;
        } else if (stacked) {
          const total = totals[i], clipId = `cxc${uid}_${i}`;
          const hT = (total / maxVal) * cH, x = cx - barW / 2;
          defs += `<clipPath id="${clipId}"><path d="${_rbar(x, pT + cH - hT, barW, Math.max(hT, 1), 5)}"/></clipPath>`;
          let acc = 0, segs = '';
          datasets.forEach((ds) => {
            const v = val(ds, i); if (v <= 0) return;
            const h = (v / maxVal) * cH, y = pT + cH - acc - h; acc += h;
            segs += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${_esc(this._color(ds, i))}" data-tip="${_esc(`${ds.label || ''}: ${_fmt(v)}`)}" tabindex="0" class="cx-tap"/>`;
          });
          body += `<g clip-path="url(#${clipId})" class="cx-bar is-peak">${segs}</g>`;
        } else {
          datasets.forEach((ds, k) => {
            const v = val(ds, i), c = this._color(ds, i), gid = `cxg${uid}_${i}_${k}`;
            const h = Math.max(v > 0 ? 2 : 0, (v / maxVal) * cH);
            const x = cx - groupW / 2 + k * (barW + 2), y = pT + cH - h;
            defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${_esc(c)}"/><stop offset="1" stop-color="${_esc(c)}" stop-opacity="0.4"/></linearGradient>`;
            body += `<rect class="cx-hit" x="${x.toFixed(1)}" y="${pT}" width="${barW.toFixed(1)}" height="${cH}" data-tip="${_esc(`${ds.label || ''}: ${_fmt(v)}`)}" tabindex="0"/>`;
            if (h > 0) body += `<path class="cx-bar is-peak" pointer-events="none" fill="url(#${gid})" d="${_rbar(x, y, barW, h, 4)}"/>`;
          });
        }
      });
      const maxLen = Math.max(...labels.map((l) => String(l).length));
      const step = Math.max(1, Math.ceil((Math.min(maxLen, Math.max(5, Math.floor(slot / 5.4))) * 5.4) / slot));
      labels.forEach((lbl, i) => {
        if (i % step !== 0 && i !== n - 1) return;
        if (i !== n - 1 && n - 1 - i < step && step > 1) return;
        const s = String(lbl), cap = Math.max(5, Math.floor(slot / 5.4)), t = s.length > cap ? s.slice(0, cap - 1) + '…' : s;
        xl += `<text class="cx-xlbl" x="${(pL + slot * i + slot / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${_esc(t)}</text>`;
      });
      let avg = '';
      if (single && n >= 4) {
        const a = totals.reduce((s, v) => s + v, 0) / n;
        if (a > 0) avg = `<line class="cx-avg" x1="${pL}" y1="${yOf(a).toFixed(1)}" x2="${W - pR}" y2="${yOf(a).toFixed(1)}"/><text class="cx-avg-lbl" x="${W - pR}" y="${(yOf(a) - 3).toFixed(1)}" text-anchor="end">Avg ${_compact(a)}</text>`;
      }
      this.el.innerHTML = `<div class="cx">${this._titleHtml()}${datasets.length > 1 ? this._legendHtml(datasets) : ''}<svg class="cx-svg" viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${grid}${avg}${body}${xl}</svg></div>`;
      _bindTips(this.el);
    }
    _pie() {
      const { datasets = [], labels = [] } = this.data;
      if (!datasets.length) return this._empty();
      const ds = datasets[0];
      const raw = (ds.data || []).map((v) => Math.max(0, +v || 0));
      const total = raw.reduce((a, b) => a + b, 0);
      if (total <= 0) return this._empty('Nothing recorded in this period');
      const cols = Array.isArray(ds.backgroundColor) ? ds.backgroundColor : ['--accent', '--accent-cyan', '--danger', '--warning', '--accent-purple', '--accent-sky'].map((t) => themeColor(t));
      const col = (i) => cols[i % cols.length];
      const r = 44, C = 2 * Math.PI * r, gap = raw.filter((v) => v > 0).length > 1 ? 2.2 : 0;
      let off = 0, slices = '';
      raw.forEach((v, i) => {
        if (v <= 0) return;
        const len = (v / total) * C;
        const tip = _esc(`${labels[i] || ''}: ${_fmt(v)} (${(v / total * 100).toFixed(1)}%)`);
        slices += `<circle class="cx-donut-slice" cx="60" cy="60" r="${r}" fill="none" stroke="${_esc(col(i))}" stroke-width="15" stroke-dasharray="${Math.max(0.1, len - gap).toFixed(2)} ${(C - Math.max(0.1, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" data-tip="${tip}" tabindex="0"/>`;
        off += len;
      });
      const leg = raw.map((v, i) => {
        const p = (v / total) * 100;
        return `<div class="cx-leg-row"><div class="cx-leg-top"><span class="sx-dot dc-background" style="--d-background: ${_esc(col(i))}"></span><span class="cx-leg-name">${_esc(labels[i] || '')}</span><b>${_compact(v)}</b><em>${p.toFixed(1)}%</em></div><div class="cx-leg-track"><i class="dc-background dc-width" style="--d-width: ${p.toFixed(1)}%; --d-background: ${_esc(col(i))}"></i></div></div>`;
      }).join('');
      this.el.innerHTML = `<div class="cx">${this._titleHtml()}<div class="cx-donut-row"><div class="cx-donut-wrap"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--glass-border)" stroke-width="15"/>${slices}</svg><div class="cx-donut-center"><b>${_compact(total)}</b><span>Total</span></div></div><div class="cx-leg">${leg}</div></div></div>`;
      _bindTips(this.el);
    }
    _line() {
      const { datasets = [], labels = [] } = this.data;
      const n = labels.length;
      if (!datasets.length || !n) return this._empty();
      const uid = ++_uid;
      let rawMax = 0;
      datasets.forEach((ds) => ds.data.forEach((v) => { if (+v > rawMax) rawMax = +v; }));
      if (rawMax <= 0) return this._empty('Nothing recorded in this period');
      const maxVal = _niceMax(rawMax);
      const W = 320, H = 160, pL = 36, pR = 10, pT = 14, pB = 24, cW = W - pL - pR, cH = H - pT - pB;
      const xf = (i) => pL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
      const yf = (v) => pT + cH - ((+v || 0) / maxVal) * cH;
      let defs = '', svg = '';
      for (let i = 0; i <= 4; i++) {
        const y = pT + cH - (i / 4) * cH;
        if (i > 0) svg += `<line class="cx-grid" x1="${pL}" y1="${y.toFixed(1)}" x2="${W - pR}" y2="${y.toFixed(1)}"/>`;
        svg += `<text class="cx-tick" x="${pL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${_tick(maxVal * i / 4, maxVal)}</text>`;
      }
      svg += `<line class="cx-axis" x1="${pL}" y1="${pT + cH}" x2="${W - pR}" y2="${pT + cH}"/>`;
      const step = Math.max(1, Math.ceil(n / 6));
      labels.forEach((lbl, i) => {
        if (i % step !== 0 && i !== n - 1) return;
        if (i !== n - 1 && n - 1 - i < step && step > 1) return;
        svg += `<text class="cx-xlbl" x="${xf(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${_esc(String(lbl))}</text>`;
      });
      datasets.forEach((ds, k) => {
        const c = this._color(ds, 0), pts = ds.data.map((v, i) => ({ x: xf(i), y: yf(v), v: +v || 0 }));
        const line = _smooth(pts), gid = `cxl${uid}_${k}`;
        if (ds.fill !== false && pts.length > 1) {
          defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${_esc(c)}" stop-opacity="0.32"/><stop offset="1" stop-color="${_esc(c)}" stop-opacity="0"/></linearGradient>`;
          svg += `<path d="${line} L${pts[pts.length - 1].x.toFixed(1)},${pT + cH} L${pts[0].x.toFixed(1)},${pT + cH} Z" fill="url(#${gid})"/>`;
        }
        svg += `<path d="${line}" fill="none" stroke="${_esc(c)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
        pts.forEach((p, i) => {
          const last = i === pts.length - 1;
          if (n <= 14 || last) svg += `<circle class="cx-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${last ? 4 : 2.8}" fill="${_esc(c)}"/>`;
          svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9" fill="transparent" data-tip="${_esc(`${ds.label || ''}: ${_fmt(p.v)}`)}" class="cx-tap"/>`;
        });
        const last = pts[pts.length-1];
        svg += `<circle class="sc-dot-end" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" fill="${_esc(c)}"/>`;
      });
      this.el.innerHTML = `<div class="cx">${this._titleHtml()}${datasets.length > 1 ? this._legendHtml(datasets) : ''}<svg class="cx-svg" viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${svg}</svg></div>`;
      _bindTips(this.el);
    }
  }
  return SarimChart;
})();

window.toggleDarkMode = toggleDarkMode;
window.syncState = syncState;
window.OfflineQueue = OfflineQueue;
window.updateOfflineBanner = updateOfflineBanner;
window._setCloudConnectionState = _setCloudConnectionState;
window._setSlowConnectionState = _setSlowConnectionState;
window.notifyDataChange = notifyDataChange;
window.autoSyncTimeout = autoSyncTimeout;
window.AUTO_SYNC_DELAY = AUTO_SYNC_DELAY;
window.invalidateAllCaches = invalidateAllCaches;
window.triggerAutoSync = triggerAutoSync;
window.updateSettingTimestamp = updateSettingTimestamp;
window._tabSyncInProgress = _tabSyncInProgress;
window.processSync = processSync;
window.getCurrentActiveTab = getCurrentActiveTab;
window.syncCoreDisplays = syncCoreDisplays;
window.syncCalculatorTab = syncCalculatorTab;
window.syncFactoryTab = syncFactoryTab;
window.syncPaymentsTab = syncPaymentsTab;
window.syncProductionTab = syncProductionTab;
window.syncSalesTab = syncSalesTab;
window.syncRepTab = syncRepTab;
window.stopPeriodicSync = stopPeriodicSync;
window.RefreshDebouncer = RefreshDebouncer;
window.reloadDataFromStorage = reloadDataFromStorage;
window.defaultSettings = defaultSettings;
window.mfgBarChart = mfgBarChart;
window.mfgPieChart = mfgPieChart;
window.salesPerfChart = salesPerfChart;
window.salesCompChart = salesCompChart;
window.custSalesChart = custSalesChart;
window.custPaymentChart = custPaymentChart;
window.storeComparisonChart = storeComparisonChart;
window.indPerformanceChart = indPerformanceChart;
window._UI_STATE_KEY = _UI_STATE_KEY;
window._UI_DEFAULTS = _UI_DEFAULTS;
window._uiState = _uiState;
window.getUI = getUI;
window.setUI = setUI;
window.loadUIState = loadUIState;
window.splashQuotes = splashQuotes;
window.initSplashScreen = initSplashScreen;
window.updatePaymentStatusVisibility = updatePaymentStatusVisibility;
window.recordEntry = recordEntry;
window.registerDeletion = registerDeletion;
window._captureRecordSnapshot = _captureRecordSnapshot;
window.uploadDeletionToCloud = uploadDeletionToCloud;
window.cleanupOldDeletions = cleanupOldDeletions;
window._buildPreclosePanel = _buildPreclosePanel;
window._togglePreclosePanel = _togglePreclosePanel;
window.openEntityDetailsOverlay = openEntityDetailsOverlay;
window.closeEntityDetailsOverlay = closeEntityDetailsOverlay;
window.openEditEntityFromDetails = openEditEntityFromDetails;
window.renderEntityOverlayContent = renderEntityOverlayContent;
window.refreshEntityOverlay = refreshEntityOverlay;
window.filterEntityManagementHistory = filterEntityManagementHistory;
window.openEntityPaymentFromDetails = openEntityPaymentFromDetails;
window._toggleEntityTxnPanel = _toggleEntityTxnPanel;
window._restorePayableFromDeletedTransaction = _restorePayableFromDeletedTransaction;
window._reconcileSupplierLinksForDeletedTransactions = _reconcileSupplierLinksForDeletedTransactions;
window._refreshSupplierLinkViews = _refreshSupplierLinkViews;
window.deleteEntityTransaction = deleteEntityTransaction;
window.deleteCurrentEntity = deleteCurrentEntity;
window.exportEntityData = exportEntityData;
window._pdfMergedPeriodLabel = _pdfMergedPeriodLabel;
window._pdfMergedCountLabel = _pdfMergedCountLabel;
window._pdfDrawMergedSectionHeader = _pdfDrawMergedSectionHeader;
window.PDF_MERGED_HDR_COLOR = PDF_MERGED_HDR_COLOR;
window.PDF_MERGED_ROW_COLOR = PDF_MERGED_ROW_COLOR;
window.PDF_MERGED_TEXT_COLOR = PDF_MERGED_TEXT_COLOR;
window._exportDocAsImageAndOpenWhatsApp = _exportDocAsImageAndOpenWhatsApp;
window.exportEntityToPDF = exportEntityToPDF;
window.exportCustomerToPDF = exportCustomerToPDF;
window.SCRIPT_INTEGRITY = SCRIPT_INTEGRITY;
window._scriptLoadPromises = _scriptLoadPromises;
window._photoCaptureTarget = _photoCaptureTarget;
window._photoCaptureStream = _photoCaptureStream;
window._photoIds = _photoIds;
window.handlePersonPhotoFile = handlePersonPhotoFile;
window.applyPersonPhoto = applyPersonPhoto;
window.clearPersonPhoto = clearPersonPhoto;
window.loadPersonPhotoIntoEditor = loadPersonPhotoIntoEditor;
window.savePersonPhoto = savePersonPhoto;
window.getPersonPhoto = getPersonPhoto;
window._compressPhoto = _compressPhoto;
window.openPhotoCapture = openPhotoCapture;
window.closePhotoCapture = closePhotoCapture;
window.toggleTorch = toggleTorch;
window.flipCamera = flipCamera;
window.setCameraZoom = setCameraZoom;
window.toggleCameraGrid = toggleCameraGrid;
window.capturePhotoFromCamera = capturePhotoFromCamera;
window.openCameraGallery = openCameraGallery;
window.handleCameraGalleryFiles = handleCameraGalleryFiles;
window.openExpensePhotoCapture = openExpensePhotoCapture;
window.handleExpensePhotoFile = handleExpensePhotoFile;
window._applyExpensePendingPhoto = _applyExpensePendingPhoto;
window.renderPersonAvatarHTML = renderPersonAvatarHTML;
window.previewPhotoClick = previewPhotoClick;
window.loadScript = loadScript;
window.SarimChart = SarimChart;
export function _set_autoSyncTimeout(v) { autoSyncTimeout = v; }
export function _set_custPaymentChart(v) { custPaymentChart = v; }
export function _set_custSalesChart(v) { custSalesChart = v; }
export function _set_defaultSettings(v) { defaultSettings = v; }
export function _set_indPerformanceChart(v) { indPerformanceChart = v; }
export function _set_mfgBarChart(v) { mfgBarChart = v; }
export function _set_mfgPieChart(v) { mfgPieChart = v; }
export function _set_salesCompChart(v) { salesCompChart = v; }
export function _set_salesPerfChart(v) { salesPerfChart = v; }
export function _set_storeComparisonChart(v) { storeComparisonChart = v; }
