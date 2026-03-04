function generateUUID(prefix = '', retryCount = 0) {
const MAX_RETRIES = 3;
if (retryCount >= MAX_RETRIES) {
const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
const r = Math.random() * 16 | 0;
const v = c === 'x' ? r : (r & 0x3 | 0x8);
return v.toString(16);
});
return prefix ? `${prefix}-${uuid}` : uuid;
}
const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
const r = Math.random() * 16 | 0;
const v = c === 'x' ? r : (r & 0x3 | 0x8);
return v.toString(16);
});
const finalUUID = prefix ? `${prefix}-${uuid}` : uuid;
if (!validateUUID(finalUUID)) {
return generateUUID(prefix, retryCount + 1);
}
return finalUUID;
}
function validateUUID(uuid) {
if (!uuid || typeof uuid !== 'string') return false;
const standardRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const prefixedRegex = /^[a-z0-9_]+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
return standardRegex.test(uuid) || prefixedRegex.test(uuid);
}
function getTimestamp() {
return Date.now();
}
function validateTimestamp(timestamp, allowFuture = false) {
if (!timestamp || typeof timestamp !== 'number') return false;
if (timestamp < 946684800000 || timestamp > 4102444800000) return false;
if (!allowFuture) {
const now = Date.now();
const clockSkewTolerance = 5 * 60 * 1000;
if (timestamp > (now + clockSkewTolerance)) {
return false;
}
}
return true;
}
function _mergedBadgeHtml(record, opts = {}) {
if (!record || !record.isMerged) return '';
if (opts.inline) {
  return ` <span style="background:rgba(175, 82, 222, 0.15); color:#af52de; padding:2px 6px; border-radius:4px; font-size:0.65rem; margin-left:6px; font-weight:600;">MERGED</span>`;
}
return `<span style="font-size:0.6rem; background:rgba(175, 82, 222, 0.15); color:#af52de; padding:1px 5px; border-radius:3px; border:1px solid rgba(175, 82, 222, 0.3); display:inline-block; margin-top:3px;">MERGED</span>`;
}
function compareTimestamps(timestamp1, timestamp2) {
if (!validateTimestamp(timestamp1) || !validateTimestamp(timestamp2)) {
return 0;
}
if (timestamp1 < timestamp2) return -1;
if (timestamp1 > timestamp2) return 1;
return 0;
}
function resolveConflict(local, remote) {
if (!local) return remote;
if (!remote) return local;
const localTime = getRecordTimestamp(local);
const remoteTime = getRecordTimestamp(remote);
return localTime >= remoteTime ? local : remote;
}
function getRecordTimestamp(record) {
if (!record) return 0;
if (record.timestamp && typeof record.timestamp === 'number') {
return record.timestamp;
}
if (record.timestamp && typeof record.timestamp === 'string') {
return new Date(record.timestamp).getTime();
}
if (record.updatedAt) {
return typeof record.updatedAt === 'number' ? record.updatedAt : new Date(record.updatedAt).getTime();
}
if (record.createdAt) {
return typeof record.createdAt === 'number' ? record.createdAt : new Date(record.createdAt).getTime();
}
if (record.date) {
return new Date(record.date).getTime();
}
return 0;
}
function ensureRecordIntegrity(record, isEdit = false, isMigration = false) {
if (!record) return record;
const isTrackingObject = record.produced !== undefined ||
record.consumed !== undefined ||
record.available !== undefined ||
record.unitCostHistory !== undefined;
if (isTrackingObject) {
return record;
}
if (!record.id) {
record.id = generateUUID();
if (!isMigration) {
const hasUserData = Object.keys(record).some(key =>
!['id', 'createdAt', 'updatedAt', 'timestamp', 'deletedAt', 'tombstoned_at'].includes(key)
);
if (hasUserData) {
}
}
} else if (!validateUUID(record.id)) {
const oldId = record.id;
record.id = generateUUID();
if (!isMigration) {
}
}
const now = getTimestamp();
if (isMigration) {
if (!record.createdAt || !validateTimestamp(record.createdAt, true)) {
record.createdAt = now;
}
if (!record.updatedAt || !validateTimestamp(record.updatedAt, true)) {
record.updatedAt = record.createdAt;
}
if (!record.timestamp || !validateTimestamp(record.timestamp, true)) {
record.timestamp = record.createdAt;
}
if (record.updatedAt < record.createdAt) {
record.updatedAt = record.createdAt;
}
} else {
if (!record.createdAt || !validateTimestamp(record.createdAt, false)) {
record.createdAt = now;
}
const isMergedRecord = record.isMerged === true;
if (!isMergedRecord && (isEdit || !record.updatedAt || !validateTimestamp(record.updatedAt, false))) {
record.updatedAt = now;
} else if (!record.updatedAt || !validateTimestamp(record.updatedAt, false)) {
record.updatedAt = record.createdAt;
}
if (!record.timestamp || !validateTimestamp(record.timestamp, true)) {
record.timestamp = record.createdAt || now;
}
if (record.updatedAt < record.createdAt) {
record.updatedAt = record.createdAt;
}
}

if (record.isRepModeEntry === true) {

  if (!record.salesRep || record.salesRep === 'NONE' || record.salesRep === 'ADMIN') {
    record.isRepModeEntry = false; 
    console.warn('[schema] Corrected contradictory record (isRepModeEntry=true, salesRep="' + record.salesRep + '") → direct sale.', record.id);
  }
} else {

  if (record.salesRep && record.salesRep !== 'NONE' && record.salesRep !== 'ADMIN') {
    record.isRepModeEntry = true; 
    console.warn('[schema] Corrected contradictory record (isRepModeEntry=false, salesRep="' + record.salesRep + '") → rep sale.', record.id);
  }
}
return record;
}
async function cleanupOldTombstones() {
const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
const dataTypes = [
'expenses',
'mfg_pro_pkr',
'customer_sales',
'rep_sales',
'noman_history',
'payment_transactions',
'payment_entities',
'factory_production_history',
'stock_returns'
];
let totalCleaned = 0;
for (const dataType of dataTypes) {
try {
const allData = await idb.get(dataType) || [];
const beforeCount = allData.length;
const cleaned = allData.filter(record => {
if (!record.deletedAt && !record.tombstoned_at) {
return true;
}
const deletionTime = record.deletedAt || record.tombstoned_at;
if (validateTimestamp(deletionTime) && deletionTime > ninetyDaysAgo) {
return true;
}
return false;
});
if (cleaned.length !== beforeCount) {
await idb.set(dataType, cleaned);
const removedCount = beforeCount - cleaned.length;
totalCleaned += removedCount;
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
if (totalCleaned > 0) {
}
return totalCleaned;
}
function scheduleAutomaticCleanup() {
setTimeout(() => cleanupOldTombstones(), 5000);
if (window._tombstoneCleanupInterval) clearInterval(window._tombstoneCleanupInterval);
window._tombstoneCleanupInterval = setInterval(() => cleanupOldTombstones(), 24 * 60 * 60 * 1000);
}
async function validateAndFixRecords(dataType, records) {
if (!Array.isArray(records) || records.length === 0) {
return { fixed: 0, valid: 0, total: 0 };
}
const validRecords = records.filter(record => {
if (!record || typeof record !== 'object') return false;
const dataKeys = Object.keys(record).filter(key =>
!['id', 'createdAt', 'updatedAt', 'timestamp', 'deletedAt', 'tombstoned_at'].includes(key)
);
return dataKeys.length > 0;
});
if (validRecords.length === 0) {
return { fixed: 0, valid: 0, total: 0 };
}
let fixedCount = 0;
let validCount = 0;
const validatedRecords = validRecords.map(record => {
let needsFix = false;
if (!record.id || !validateUUID(record.id)) {
needsFix = true;
}
if (!record.createdAt || !validateTimestamp(record.createdAt)) {
needsFix = true;
}
if (!record.updatedAt || !validateTimestamp(record.updatedAt)) {
needsFix = true;
}
if (record.updatedAt && record.createdAt && record.updatedAt < record.createdAt) {
needsFix = true;
}
if (needsFix) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
} else {
validCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set(dataType, validatedRecords);
}
return {
fixed: fixedCount,
valid: validCount,
total: validRecords.length,
records: validatedRecords
};
}
async function validateAllDataOnStartup() {
const dataTypes = [
'expenses',
'mfg_pro_pkr',
'customer_sales',
'rep_sales',
'noman_history',
'payment_transactions',
'payment_entities',
'factory_production_history',
'stock_returns'
];
let totalFixed = 0;
let totalValid = 0;
let totalRecords = 0;
for (const dataType of dataTypes) {
try {
const records = await idb.get(dataType) || [];
if (records.length > 0) {
const result = await validateAndFixRecords(dataType, records);
totalFixed += result.fixed;
totalValid += result.valid;
totalRecords += result.total;
}
} catch (error) {
console.error('Data validation encountered an error.', error);
showToast('Data validation encountered an error.', 'error');
}
}
if (totalFixed > 0) {
} else {
}
return { totalFixed, totalValid, totalRecords };
}
async function toggleDarkMode() {
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const currentTheme = html.getAttribute('data-theme') || 'dark';
const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
html.setAttribute('data-theme', newTheme);
if (newTheme === 'dark') {
themeToggle.innerHTML = '';
themeToggle.title = "Switch to Light Mode";
await idb.set('theme', 'dark');
} else {
themeToggle.innerHTML = '';
themeToggle.title = "Switch to Dark Mode";
await idb.set('theme', 'light');
}
const metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
metaThemeColor.setAttribute('content', newTheme === 'light' ? '#ffffff' : '#000000');
}
if (mfgBarChart) mfgBarChart.update();
if (mfgPieChart) mfgPieChart.update();
if (custSalesChart) custSalesChart.update();
if (custPaymentChart) custPaymentChart.update();
if (storeComparisonChart) storeComparisonChart.update();
if (salesPerfChart) salesPerfChart.update();
if (salesCompChart) salesCompChart.update();
if (indPerformanceChart) indPerformanceChart.update();
}
const syncState = {
lastUpdate: {
production: 0,
sales: 0,
calculator: 0,
factory: 0,
payments: 0,
entities: 0
},
isRefreshing: false,
syncInterval: null,
pendingUpdates: new Set()
};
const OfflineQueue = {
queue: [],
deadLetterQueue: [],
isProcessing: false,
maxRetries: 10,
retryDelay: 2000,
_dlKey: 'offline_dead_letter_queue',
async init() {
try {
const savedQueue = await idb.get('offline_operation_queue', []);
this.queue = Array.isArray(savedQueue) ? savedQueue : [];
const savedDL = await idb.get(this._dlKey, []);
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
}
},
async saveQueue() {
try {
await idb.set('offline_operation_queue', this.queue);
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
},
async saveDeadLetterQueue() {
try {
await idb.set(this._dlKey, this.deadLetterQueue);
} catch (error) {
console.error('Failed to persist dead-letter queue.', error);
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
`⚠️ Upload failed permanently — tap "Failed ops" to review`,
'error',
6000
);
continue;
}
try {
await this.executeOperation(item.operation);
successfulIds.push(item.id);
} catch (error) {
console.error('Failed to save data locally.', error);
item.retries++;
item.lastAttempt = Date.now();
item.error = error.message;
const backoff = Math.min(this.retryDelay * Math.pow(2, item.retries - 1), 30000);
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
dlBadge.textContent = `⚠️ ${count} failed op${count !== 1 ? 's' : ''}`;
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
<button class="dl-btn dl-btn-retry" onclick="OfflineQueue.retryDeadLetter('${esc(entry.id)}')">Retry</button>
<button class="dl-btn dl-btn-dismiss" onclick="OfflineQueue.dismissDeadLetter('${esc(entry.id)}')">Dismiss</button>
</div>
</div>`;
}).join('');
modal.innerHTML = `
<div class="dl-queue-card">
<div class="dl-queue-header">
<h3 class="dl-queue-title">⚠️ Failed Uploads</h3>
<button class="dl-queue-close" aria-label="Close" onclick="document.getElementById('dl-queue-modal').remove()">✕</button>
</div>
<p class="dl-queue-subtitle">These operations exhausted all ${this.maxRetries} retry attempts. Retry to re-attempt upload, or dismiss to discard.</p>
<div class="dl-queue-list">${rows}</div>
<div class="dl-queue-footer">
<button class="dl-btn dl-btn-export" onclick="OfflineQueue.exportDeadLetterQueue()" title="Save failed operations as JSON">Export JSON</button>
<button class="dl-btn dl-btn-dismiss-all" onclick="OfflineQueue.dismissAllDeadLetters()">Dismiss all</button>
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
case 'set':
await userRef.collection(collection).doc(docId).set(data, { merge: true });
trackFirestoreWrite(1);
break;
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
window._firestoreNetworkDisabled = false;
function updateOfflineBanner() {
const banner = document.getElementById('offline-banner');
const badge = document.getElementById('offline-queue-badge');
const dot = document.getElementById('connection-indicator');
const isOnline = navigator.onLine;
const pending = (typeof OfflineQueue !== 'undefined') ? OfflineQueue.queue.length : 0;
const failed = (typeof OfflineQueue !== 'undefined') ? OfflineQueue.deadLetterQueue.length : 0;
if (banner) {
if (!isOnline) {
banner.classList.add('visible');
document.body.classList.add('offline-active');
if (badge) {
if (pending > 0) {
badge.textContent = `${pending} pending`;
badge.style.display = '';
} else {
badge.textContent = 'saves queued locally';
badge.style.display = '';
}
}
} else if (pending > 0 || failed > 0) {
banner.classList.add('visible');
document.body.classList.add('offline-active');
if (badge) {
badge.textContent = pending > 0 ? `Syncing ${pending} queued op(s)...` : '';
badge.style.display = pending > 0 ? '' : 'none';
}
} else {
banner.classList.remove('visible');
document.body.classList.remove('offline-active');
}
}
if (dot) {
if (!isOnline) {
dot.className = 'signal-offline';
dot.title = pending > 0
? `Offline — ${pending} operation(s) will sync when back online`
: 'Offline — changes saved locally';
} else if (failed > 0) {
dot.className = 'signal-connecting';
dot.title = `${failed} upload(s) permanently failed — click "Failed ops" to review`;
} else if (pending > 0) {
dot.className = 'signal-connecting';
dot.title = `Syncing ${pending} queued operation(s)...`;
} else if (window.isSyncing) {
dot.className = 'signal-connecting';
dot.title = 'Syncing with cloud...';
} else {
dot.className = 'signal-online';
dot.title = 'Online — connected to Firestore';
}
}
if (typeof OfflineQueue !== 'undefined') {
OfflineQueue._renderDeadLetterPanel();
}
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
showToast('All offline changes synced to cloud', 'success', 3000);
}
}
return result;
};
})();
window.addEventListener('online', async () => {
updateOfflineBanner();
if (typeof firebaseDB !== 'undefined' && firebaseDB) {
try {
await firebaseDB.enableNetwork();
window._firestoreNetworkDisabled = false;
} catch (e) {
console.warn('Failed to enable network.', e);
}
}
if (typeof OfflineQueue !== 'undefined' && OfflineQueue.queue.length > 0) {
await OfflineQueue.processQueue();
}
setTimeout(() => {
if (typeof subscribeToRealtime === 'function' && typeof currentUser !== 'undefined' && currentUser) {
subscribeToRealtime();
}
}, 500);
setTimeout(() => {
if (typeof triggerAutoSync === 'function') triggerAutoSync();
if (typeof updateOfflineBanner === 'function') updateOfflineBanner();
}, 2000);
showToast('Back online — syncing...', 'success', 3000);
});
window.addEventListener('offline', async () => {
updateOfflineBanner();
if (typeof firebaseDB !== 'undefined' && firebaseDB) {
try {
await firebaseDB.disableNetwork();
window._firestoreNetworkDisabled = true;
} catch (e) {
console.warn('Failed to disable network.', e);
}
}
if (typeof isSyncing !== 'undefined' && isSyncing) {
isSyncing = false;
}
showToast('Offline — changes will be saved locally', 'warning', 4000);
});
window.addEventListener('DOMContentLoaded', () => {
updateOfflineBanner();
});
function notifyDataChange(dataType) {
syncState.lastUpdate[dataType] = Date.now();
syncState.pendingUpdates.add(dataType);
if (!syncState.isRefreshing) {
requestAnimationFrame(() => processSync());
}
if (typeof triggerSeamlessBackup === 'function') {
triggerSeamlessBackup();
}
}
let autoSyncTimeout = null;
const AUTO_SYNC_DELAY = 5000;
async function invalidateAllCaches() {
try {
const keys = [
'mfg_pro_pkr', 'noman_history', 'customer_sales', 'rep_sales', 'rep_customers',
'sales_customers',
'factory_inventory_data', 'factory_production_history',
'payment_entities', 'payment_transactions', 'expenses',
'stock_returns', 'deletion_records', 'deleted_records',
'factory_default_formulas', 'factory_additional_costs',
'factory_sale_prices', 'factory_cost_adjustment_factor', 'factory_unit_tracking',
'naswar_default_settings', 'expense_categories'
];
const results = await idb.getBatch(keys);
db = ensureArray(results.get('mfg_pro_pkr'));
salesHistory = ensureArray(results.get('noman_history'));
customerSales = ensureArray(results.get('customer_sales'));
repSales = ensureArray(results.get('rep_sales'));
repCustomers = ensureArray(results.get('rep_customers'));
salesCustomers = ensureArray(results.get('sales_customers'));
stockReturns = ensureArray(results.get('stock_returns'));
expenseRecords = ensureArray(results.get('expenses'));
factoryInventoryData = ensureArray(results.get('factory_inventory_data'));
factoryProductionHistory = ensureArray(results.get('factory_production_history'));
paymentEntities = ensureArray(results.get('payment_entities'));
paymentTransactions = ensureArray(results.get('payment_transactions'));
deletionRecordsArray = ensureArray(results.get('deletion_records'));
const deletedArr = ensureArray(results.get('deleted_records'));
deletedRecordIds = new Set(deletedArr);
const freshFormulas = results.get('factory_default_formulas');
if (freshFormulas && typeof freshFormulas === 'object') factoryDefaultFormulas = freshFormulas;
const freshCosts = results.get('factory_additional_costs');
if (freshCosts && typeof freshCosts === 'object') factoryAdditionalCosts = freshCosts;
const freshPrices = results.get('factory_sale_prices');
if (freshPrices && typeof freshPrices === 'object') factorySalePrices = freshPrices;
const freshFactor = results.get('factory_cost_adjustment_factor');
if (freshFactor && typeof freshFactor === 'object') factoryCostAdjustmentFactor = freshFactor;
const freshTracking = results.get('factory_unit_tracking');
if (freshTracking && typeof freshTracking === 'object') factoryUnitTracking = freshTracking;
const freshSettings = results.get('naswar_default_settings');
if (freshSettings && typeof freshSettings === 'object') defaultSettings = freshSettings;
const freshCats = results.get('expense_categories');
if (Array.isArray(freshCats)) expenseCategories = freshCats;
} catch(e) {
console.error('Failed to load expense categories.', e);
showToast('Failed to load expense categories.', 'error');
}
}
function triggerAutoSync() {
if (typeof currentUser === 'undefined' || !currentUser) {
return;
}
if (typeof pushDataToCloud !== 'function') {
return;
}
if (typeof isSyncing !== 'undefined' && isSyncing) {
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
console.error('Sync failed. Check your connection.', error);
showToast('Sync failed. Check your connection.', 'error');
}
}, AUTO_SYNC_DELAY);
}
async function updateSettingTimestamp(settingName) {
const timestamp = getTimestamp();
await idb.set(`${settingName}_timestamp`, timestamp);
}
const _tabSyncInProgress = {};
function processSync() {
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
break;
case 'sales':
if (typeof syncSalesTab === 'function' && !_tabSyncInProgress['sales']) {
_tabSyncInProgress['sales'] = true;
syncSalesTab().finally(() => { _tabSyncInProgress['sales'] = false; });
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
case 'rep_sales':
case 'rep_customers':
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
case 'factory_history':
if (typeof syncFactoryTab === 'function' && !_tabSyncInProgress['factory']) {
_tabSyncInProgress['factory'] = true;
syncFactoryTab().finally(() => { _tabSyncInProgress['factory'] = false; });
}
break;
case 'calculator_history':
case 'noman_history':
if (typeof syncCalculatorTab === 'function' && !_tabSyncInProgress['calculator']) {
_tabSyncInProgress['calculator'] = true;
syncCalculatorTab().finally(() => { _tabSyncInProgress['calculator'] = false; });
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
console.error('Tab sync failed.', error);
showToast('Tab sync failed.', 'error');
} finally {
syncState.isRefreshing = false;
if (syncState.pendingUpdates.size > 0) {
requestAnimationFrame(() => processSync());
}
}
}
function getCurrentActiveTab() {
if (!document.getElementById('tab-prod').classList.contains('hidden')) return 'prod';
if (!document.getElementById('tab-sales').classList.contains('hidden')) return 'sales';
if (!document.getElementById('tab-calc').classList.contains('hidden')) return 'calc';
if (!document.getElementById('tab-factory').classList.contains('hidden')) return 'factory';
if (!document.getElementById('tab-payments').classList.contains('hidden')) return 'payments';
return 'prod';
}
function syncCoreDisplays() {
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
console.error('Calculation failed.', error);
showToast('Calculation failed.', 'error');
}
}
async function syncCalculatorTab() {
try {
await idb.init();
const fresh = await idb.get('noman_history', []);
if (Array.isArray(fresh)) {
const map = new Map(fresh.map(r => [r.id, r]));
(salesHistory || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
salesHistory = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshSales = await idb.get('customer_sales', []);
if (Array.isArray(freshSales)) {
const map = new Map(freshSales.map(r => [r.id, r]));
(customerSales || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
customerSales = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshRepSales = await idb.get('rep_sales', []);
if (Array.isArray(freshRepSales)) {
const map = new Map(freshRepSales.map(r => [r.id, r]));
(repSales || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
repSales = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
if (typeof loadSalesData === 'function') await loadSalesData(currentCompMode);
if (typeof autoFillTotalSoldQuantity === 'function') autoFillTotalSoldQuantity();
} catch (error) {
console.error('Failed to load sales data.', error);
showToast('Failed to load sales data.', 'error');
if (typeof loadSalesData === 'function') setTimeout(() => loadSalesData(currentCompMode), 500);
}
}
async function syncFactoryTab() {
try {
await idb.init();
const keys = ['factory_inventory_data', 'factory_production_history',
'factory_unit_tracking', 'factory_default_formulas',
'factory_additional_costs', 'factory_sale_prices',
'factory_cost_adjustment_factor'];
const dataMap = await idb.getBatch(keys);
const freshInv = dataMap.get('factory_inventory_data');
if (Array.isArray(freshInv)) {
const map = new Map(freshInv.map(r => [r.id, r]));
(factoryInventoryData || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
factoryInventoryData = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshHist = dataMap.get('factory_production_history');
if (Array.isArray(freshHist)) {
const map = new Map(freshHist.map(r => [r.id, r]));
(factoryProductionHistory || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
factoryProductionHistory = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshFormulas = dataMap.get('factory_default_formulas');
if (freshFormulas && typeof freshFormulas === 'object') factoryDefaultFormulas = freshFormulas;
const freshCosts = dataMap.get('factory_additional_costs');
if (freshCosts && typeof freshCosts === 'object') factoryAdditionalCosts = freshCosts;
const freshPrices = dataMap.get('factory_sale_prices');
if (freshPrices && typeof freshPrices === 'object') factorySalePrices = freshPrices;
const freshFactor = dataMap.get('factory_cost_adjustment_factor');
if (freshFactor && typeof freshFactor === 'object') factoryCostAdjustmentFactor = freshFactor;
const freshTracking = dataMap.get('factory_unit_tracking');
if (freshTracking && typeof freshTracking === 'object') factoryUnitTracking = freshTracking;
if (typeof updateFactoryUnitsAvailableStats === 'function') updateFactoryUnitsAvailableStats();
if (typeof updateFactorySummaryCard === 'function') updateFactorySummaryCard();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderFactoryHistory === 'function') renderFactoryHistory();
} catch (error) {
console.error('Failed to render data.', error);
showToast('Failed to render data.', 'error');
if (typeof updateFactoryUnitsAvailableStats === 'function') setTimeout(updateFactoryUnitsAvailableStats, 500);
}
}
async function syncPaymentsTab() {
try {
await idb.init();
const dataMap = await idb.getBatch(['expenses', 'payment_entities', 'payment_transactions']);
const freshExp = dataMap.get('expenses');
if (Array.isArray(freshExp)) {
const map = new Map(freshExp.map(r => [r.id, r]));
(expenseRecords || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
expenseRecords = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshEnt = dataMap.get('payment_entities');
if (Array.isArray(freshEnt)) {
const map = new Map(freshEnt.map(r => [r.id, r]));
(paymentEntities || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
paymentEntities = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshTx = dataMap.get('payment_transactions');
if (Array.isArray(freshTx)) {
const map = new Map(freshTx.map(r => [r.id, r]));
(paymentTransactions || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
paymentTransactions = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
if (typeof refreshPaymentTab === 'function') refreshPaymentTab();
if (typeof renderEntityTable === 'function') renderEntityTable();
} catch (error) {
console.error('Payment tab refresh failed.', error);
showToast('Payment tab refresh failed.', 'error');
if (typeof refreshPaymentTab === 'function') setTimeout(refreshPaymentTab, 500);
}
}
async function syncProductionTab() {
try {
await idb.init();
const dataMap = await idb.getBatch(['mfg_pro_pkr', 'naswar_default_settings', 'stock_returns']);
const freshProd = dataMap.get('mfg_pro_pkr');
if (Array.isArray(freshProd) && freshProd.length > 0) {
let fixed = 0;
const validated = freshProd.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
fixed++;
return ensureRecordIntegrity(record, false, true);
}
return record;
});
if (fixed > 0) {
await idb.set('mfg_pro_pkr', validated);
}
validated.sort((a, b) => compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a)));
const map = new Map(validated.map(r => [r.id, r]));
(db || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
db = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshSettings = dataMap.get('naswar_default_settings');
if (freshSettings && typeof freshSettings === 'object') defaultSettings = freshSettings;
const freshReturns = dataMap.get('stock_returns');
if (Array.isArray(freshReturns)) {
const map = new Map(freshReturns.map(r => [r.id, r]));
(stockReturns || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
stockReturns = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
if (typeof refreshUI === 'function') refreshUI();
if (typeof updateMfgCharts === 'function') updateMfgCharts();
} catch (error) {
console.error('UI refresh failed.', error);
showToast('UI refresh failed.', 'error');
if (typeof refreshUI === 'function') setTimeout(refreshUI, 500);
}
}
async function syncSalesTab() {
try {
await idb.init();
const freshSales = await idb.get('customer_sales', []);
if (Array.isArray(freshSales)) {
const validated = freshSales.map(r => ensureRecordIntegrity(r, false, true));
validated.sort((a, b) => compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a)));
const map = new Map(validated.map(r => [r.id, r]));
(customerSales || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
customerSales = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
if (typeof refreshCustomerSales === 'function') refreshCustomerSales();
} catch (error) {
console.error('Customer data operation failed.', error);
showToast('Customer data operation failed.', 'error');
if (typeof refreshCustomerSales === 'function') setTimeout(refreshCustomerSales, 500);
}
}
async function syncRepTab() {
try {
await idb.init();
const dataMap = await idb.getBatch([
'rep_sales', 'rep_customers',
'factory_default_formulas', 'factory_additional_costs',
'factory_sale_prices', 'factory_cost_adjustment_factor', 'factory_unit_tracking'
]);
const freshRepSales = dataMap.get('rep_sales');
if (Array.isArray(freshRepSales)) {
let fixed = 0;
const validated = freshRepSales.map(record => {
try {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
fixed++;
return ensureRecordIntegrity(record, false, true);
}
return record;
} catch (e) { return record; }
});
if (fixed > 0) {
await idb.set('rep_sales', validated);
}
validated.sort((a, b) => compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a)));
const map = new Map(validated.map(r => [r.id, r]));
(repSales || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
repSales = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshRepCustomers = dataMap.get('rep_customers');
if (Array.isArray(freshRepCustomers)) {
let fixed = 0;
const validated = freshRepCustomers.map(record => {
try {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
fixed++;
return ensureRecordIntegrity(record, false, true);
}
return record;
} catch (e) { return record; }
});
if (fixed > 0) {
await idb.set('rep_customers', validated);
}
const map = new Map(validated.map(r => [r.id, r]));
(repCustomers || []).forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
repCustomers = Array.from(map.values()).filter(r => !deletedRecordIds.has(r.id));
}
const freshFormulas = dataMap.get('factory_default_formulas');
if (freshFormulas && typeof freshFormulas === 'object') factoryDefaultFormulas = freshFormulas;
const freshCosts = dataMap.get('factory_additional_costs');
if (freshCosts && typeof freshCosts === 'object') factoryAdditionalCosts = freshCosts;
const freshPrices = dataMap.get('factory_sale_prices');
if (freshPrices && typeof freshPrices === 'object') factorySalePrices = freshPrices;
const freshFactor = dataMap.get('factory_cost_adjustment_factor');
if (freshFactor && typeof freshFactor === 'object') factoryCostAdjustmentFactor = freshFactor;
const freshTracking = dataMap.get('factory_unit_tracking');
if (freshTracking && typeof freshTracking === 'object') factoryUnitTracking = freshTracking;
if (typeof refreshRepUI === 'function') refreshRepUI();
if (typeof updateRepLiveMap === 'function' && appMode === 'admin') updateRepLiveMap();
} catch (error) {
console.error('An unexpected error occurred.', error);
showToast('An unexpected error occurred.', 'error');
if (typeof refreshRepUI === 'function') setTimeout(refreshRepUI, 500);
}
}
function startPeriodicSync() {
if (syncState.syncInterval) {
clearInterval(syncState.syncInterval);
}
syncState.syncInterval = setInterval(() => {
if (syncState.pendingUpdates.size > 0) {
processSync();
}
}, 2000);
}
function stopPeriodicSync() {
if (syncState.syncInterval) {
clearInterval(syncState.syncInterval);
syncState.syncInterval = null;
}
}
const RefreshDebouncer = {
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
async function reloadDataFromStorage() {
try {
await loadAllData();
} catch (error) {
console.error('Failed to load app data.', error);
showToast('Failed to load app data.', 'error');
}
}
window.forceSync = async function() {
await reloadDataFromStorage();
syncState.pendingUpdates.add('all');
processSync();
};
triggerAutoSync();
const originalShowTab = window.showTab;
if (typeof originalShowTab === 'function') {
window.showTab = function(tab) {
originalShowTab(tab);
setTimeout(() => {
if (typeof notifyDataChange === 'function') notifyDataChange(tab);
}, 150);
};
}
window.addEventListener('beforeunload', function() {
if (typeof stopPeriodicSync === 'function') stopPeriodicSync();
});
let paymentEntities = [];
let paymentTransactions = [];
let defaultSettings = {
production: {
STORE_A: { cost: 0, sale: 0 },
STORE_B: { cost: 0, sale: 0 },
STORE_C: { cost: 0, sale: 0 }
},
get calculator() {
const calc = {};
salesRepsList.forEach(r => { calc[r.replace(/\s+/g, '_')] = { cost: 0, sale: 0 }; });
return calc;
},
sales: { cost: 0, sale: 0 }
};
let mfgBarChart = null, mfgPieChart = null, salesPerfChart = null, salesCompChart = null;
let custSalesChart = null, custPaymentChart = null;
let storeComparisonChart = null;
let indPerformanceChart = null;
let currentMfgMode = 'week';
let currentCompMode = 'all';
let currentCustomerChartMode = 'week';
let currentStore = 'STORE_A';
let currentStoreComparisonMetric = 'weight';
let currentIndMode = 'week';
let currentIndMetric = 'weight';
let currentOverviewMode = 'day';
let currentProductionView = 'store';
let currentFactoryEntryStore = 'standard';
let currentFactorySettingsStore = 'standard';
let currentFactorySummaryMode = 'daily';
let editingFactoryInventoryId = null;
let currentFactoryDate = new Date().toISOString().split('T')[0];
let editingEntityId = null;
let selectedEntityId = null;
let mfgPieChartShowPercentage = false;
let custPaymentChartShowPercentage = false;
let compositionChartShowPercentage = false;
const splashQuotes = [
{ quote: "The details are not the details. They make the design.", author: "Charles Eames" },
{ quote: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
{ quote: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
{ quote: "It is not the strongest of the species that survives, nor the most intelligent — it is the one most adaptable to change.", author: "Charles Darwin" },
{ quote: "The secret of getting ahead is getting started. The secret of getting started is breaking your complex overwhelming tasks into small manageable ones.", author: "Mark Twain" },
{ quote: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
{ quote: "What gets measured gets managed.", author: "Peter Drucker" },
{ quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
{ quote: "The purpose of a business is to create a customer who creates customers.", author: "Shiv Singh" },
{ quote: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
{ quote: "Without data, you are just another person with an opinion.", author: "W. Edwards Deming" },
{ quote: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
{ quote: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
{ quote: "The best way to predict the future is to create it.", author: "Peter Drucker" },
{ quote: "Chase the vision, not the money. The money will end up following you.", author: "Tony Hsieh" },
{ quote: "A small business is an amazing way to serve and leave an impact on the world you live in.", author: "Nicole Snow" },
{ quote: "Build something 100 people love, not something 1 million people kind of like.", author: "Brian Chesky" },
{ quote: "The secret of change is to focus all of your energy not on fighting the old, but on building the new.", author: "Socrates" },
{ quote: "Excellence is never an accident. It is always the result of high intention, sincere effort, and intelligent execution.", author: "Aristotle" },
{ quote: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates" }
];
function initSplashScreen() {
const randomQuote = splashQuotes[Math.floor(Math.random() * splashQuotes.length)];
document.getElementById('splash-quote').textContent = `"${randomQuote.quote || ''}"`;
document.getElementById('splash-author').textContent = `— ${randomQuote.author || 'Unknown'}`;
setTimeout(() => {
}, 3800);
}
function selectProductionPayment(btn, value) {
document.querySelectorAll('#paymentStatusContainer .toggle-opt').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
window._productionPaymentType = value;
}
function updatePaymentStatusVisibility() {
const storeSelector = document.getElementById('storeSelector');
const paymentStatusContainer = document.getElementById('paymentStatusContainer');
if (storeSelector.value === 'STORE_C') {
paymentStatusContainer.classList.remove('hidden');
} else {
paymentStatusContainer.classList.add('hidden');
const cashBtn = document.getElementById('production-payment-cash');
const creditBtn = document.getElementById('production-payment-credit');
if (cashBtn) { cashBtn.classList.add('active'); cashBtn.dataset.paymentValue = 'CASH'; }
if (creditBtn) { creditBtn.classList.remove('active'); }
window._productionPaymentType = 'CASH';
}
}
async function recordEntry() {
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('prod')) {
showToast('Access Denied — Production not in your assigned tabs', 'warning', 3000); return;
}
const netElement = document.getElementById('net-wt');
const dateElement = document.getElementById('sys-date');
const storeElement = document.getElementById('storeSelector');
const formulaUnitsElement = document.getElementById('formula-units');
if (!netElement || !dateElement || !storeElement || !formulaUnitsElement) {
showToast('Form error: Missing required fields', 'error');
return;
}
const net = parseFloat(netElement.value) || 0;
const inputDate = dateElement.value;
const store = storeElement.value;
const formulaUnits = parseFloat(formulaUnitsElement.value) || 0;
let formulaStore = 'standard';
let salePrice = 0;
if (store === 'STORE_C') {
formulaStore = 'asaan';
salePrice = getSalePriceForStore('STORE_C'); 
} else {
salePrice = getSalePriceForStore(store); 
}
const validation = validateFormulaAvailability(store, formulaUnits);
if (!validation.sufficient) {
showToast(` Insufficient formula units! Available: ${validation.available}, Requested: ${formulaUnits}`, 'warning', 4000);
return;
}
const costData = calculateDynamicCost(store, formulaUnits, net);
if (net <= 0) {
showToast('Net production must be greater than zero. Please check weights.', 'warning', 4000);
return;
}
if (!inputDate) {
showToast('Please select a date.', 'warning', 3000);
return;
}
if (salePrice <= 0) {
showToast('Please set a sale price in Factory Formulas first.', 'warning', 3000);
return;
}
if (formulaUnits <= 0) {
showToast('Please enter formula units used.', 'warning', 3000);
return;
}
const totalCost = net * costData.dynamicCostPerKg;
const totalSale = net * salePrice;
const profit = totalSale - totalCost;
let paymentStatus = 'CASH';
if (store === 'STORE_C') {
paymentStatus = window._productionPaymentType || 'CASH';
}
const now = new Date();
let hours = now.getHours();
const minutes = now.getMinutes();
const seconds = now.getSeconds();
const ampm = hours >= 12 ? 'PM' : 'AM';
hours = hours % 12;
hours = hours ? hours : 12;
const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;
let prodId = generateUUID('prod');
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
formulaStore: costData.formulaStore,
formulaCost: costData.totalFormulaCost,
paymentStatus: paymentStatus,
timestamp: prodCreatedAt,
recordDate: new Date(inputDate).getTime(),
syncedAt: new Date().toISOString(),
managedBy: (appMode === 'production' && window._assignedManagerName) ? window._assignedManagerName : null
};
newEntry = ensureRecordIntegrity(newEntry, false);
try {
db.push(newEntry);
await unifiedSave('mfg_pro_pkr', db, newEntry);
notifyDataChange('production');
emitSyncUpdate({ mfg_pro_pkr: db });
} catch (error) {
db.pop();
showToast(" Failed to save production entry. Please try again.", "error");
return;
}
syncFactoryProductionStats();
const grossWt = document.getElementById('gross-wt');
const contWt = document.getElementById('cont-wt');
const netWt = document.getElementById('net-wt');
const formulaUnitsEl = document.getElementById('formula-units');
const displayCostValue = document.getElementById('display-cost-value');
const profitPerKg = document.getElementById('profit-per-kg');
const formulaUnitCostDisplay = document.getElementById('formula-unit-cost-display');
const totalFormulaCostDisplay = document.getElementById('total-formula-cost-display');
const dynamicCostPerKg = document.getElementById('dynamic-cost-per-kg');
if (grossWt) grossWt.value = '';
if (contWt) contWt.value = '';
if (netWt) netWt.value = '';
if (formulaUnitsEl) formulaUnitsEl.value = '1';
if (displayCostValue) displayCostValue.innerText = '0.00';
if (profitPerKg) profitPerKg.innerText = '0.00';
if (formulaUnitCostDisplay) formulaUnitCostDisplay.innerText = '0.00/unit';
if (totalFormulaCostDisplay) totalFormulaCostDisplay.innerText = '0.00';
if (dynamicCostPerKg) dynamicCostPerKg.innerText = '0.00/kg';
await refreshUI();
calculateNetCash();
calculateCashTracker();
showToast("Production record saved successfully!", "success");
}
async function registerDeletion(id, collectionName = 'unknown') {
if (!id) {
return;
}
if (!validateUUID(id)) {
return;
}
const now = getTimestamp();
const deletionRecord = {
id: id,
deletedAt: now,
collection: collectionName,
syncedToCloud: false,
tombstoned_at: now,
deleted_by: 'user',
deletion_version: '2.0'
};
if (!validateTimestamp(deletionRecord.deletedAt, false)) {
deletionRecord.deletedAt = now;
deletionRecord.tombstoned_at = now;
}
deletedRecordIds.add(id);
let deletionRecords = await idb.get('deletion_records', []);
if (!Array.isArray(deletionRecords)) deletionRecords = [];
const existingIndex = deletionRecords.findIndex(r => r.id === id);
if (existingIndex >= 0) {
deletionRecords[existingIndex] = deletionRecord;
} else {
deletionRecords.push(deletionRecord);
}
await idb.set('deletion_records', deletionRecords);
await idb.set('deleted_records', Array.from(deletedRecordIds));
triggerAutoSync();
await uploadDeletionToCloud(deletionRecord);
await cleanupOldDeletions();
}
async function uploadDeletionToCloud(deletionRecord) {
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
expiresAt: firebase.firestore.Timestamp.fromMillis(deletionRecord.deletedAt + (90 * 24 * 60 * 60 * 1000))
});
if (deletionRecord.collection && deletionRecord.collection !== 'unknown') {
const itemRef = userRef.collection(deletionRecord.collection).doc(String(deletionRecord.id));
batch.delete(itemRef);
}
await batch.commit();
trackFirestoreWrite(2);
let deletionRecords = await idb.get('deletion_records', []);
if (Array.isArray(deletionRecords)) {
const index = deletionRecords.findIndex(r => r.id === deletionRecord.id);
if (index > -1) {
deletionRecords[index].syncedToCloud = true;
await idb.set('deletion_records', deletionRecords);
}
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
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
async function cleanupOldDeletions() {
const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
let deletionRecords = await idb.get('deletion_records', []);
const validDeletions = deletionRecords.filter(record => record.deletedAt > threeMonthsAgo);
if (validDeletions.length !== deletionRecords.length) {
await idb.set('deletion_records', validDeletions);
deletedRecordIds.clear();
validDeletions.forEach(record => deletedRecordIds.add(record.id));
await idb.set('deleted_records', Array.from(deletedRecordIds));
}
if (firebaseDB && typeof currentUser !== 'undefined' && currentUser) {
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
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
}
async function openEntityDetailsOverlay(id) {
currentEntityId = id;
const entity = paymentEntities.find(e => String(e.id) === String(id));
if (!entity) return;
const quickAmountEl = document.getElementById('quickEntityAmount');
if (quickAmountEl) quickAmountEl.value = '';
setQuickEntityType('OUT');
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
const overlayEl = document.getElementById('entityDetailsOverlay');
if (overlayEl) overlayEl.style.display = 'flex';
});
await renderEntityOverlayContent(entity);
}
function closeEntityDetailsOverlay() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('entityDetailsOverlay').style.display = 'none';
});
currentEntityId = null;
refreshPaymentTab();
}
function openEditEntityFromDetails() {
const id = currentEntityId;
if (!id) return;
editEntityBasicInfo(id);
requestAnimationFrame(() => {
const editOverlay = document.getElementById('entityManagementOverlay');
if (editOverlay) editOverlay.style.zIndex = '10004';
});
}
function setQuickEntityType(type) {
currentQuickType = type;
document.getElementById('quick-type-out').className = `toggle-opt ${type === 'OUT' ? 'active' : ''}`;
document.getElementById('quick-type-in').className = `toggle-opt ${type === 'IN' ? 'active' : ''}`;
}
async function renderEntityOverlayContent(entity) {
const _manageET = document.getElementById('manageEntityTitle');
if (_manageET) {
const phone = entity.phone || '';
const wallet = entity.wallet || '';
_manageET.innerHTML = `<div class="u-fw-700" >${esc(entity.name)}</div>${(phone || wallet) ? `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; margin-top:3px;">${phone ? phoneActionHTML(phone) : ''}${phone && wallet ? ' &middot; ' : ''}${esc(wallet)}</div>` : ''}`;
}
const balances = calculateEntityBalances();
const balance = balances[entity.id] || 0;
const entityTransactions = paymentTransactions.filter(t => t.entityId === entity.id && !t.isExpense);
const totalIn = entityTransactions.filter(t => t.type === 'IN').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const totalOut = entityTransactions.filter(t => t.type === 'OUT').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const statsEl = document.getElementById('manageEntityStats');
let balanceHtml = '';
if (balance > 0) {
balanceHtml = `<span class="u-danger-bold" >Payable: ${safeToFixed(balance, 2)}</span>`;
} else if (balance < 0) {
balanceHtml = `<span class="u-text-emerald u-fw-800" >Receivable: ${safeToFixed(Math.abs(balance), 2)}</span>`;
} else {
balanceHtml = `<span class="u-text-accent u-fw-800" >Balance Settled</span>`;
}
statsEl.innerHTML = `
${balanceHtml}
<span style="display:inline-flex; gap:8px; margin-left:12px; flex-wrap:wrap;">
<span style="background:rgba(52,217,116,0.15); color:var(--accent-emerald); padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:700;">
IN: ${safeToFixed(totalIn, 2)}
</span>
<span style="background:rgba(255,77,109,0.15); color:var(--danger); padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:700;">
OUT: ${safeToFixed(totalOut, 2)}
</span>
</span>`;
const list = document.getElementById('entityManagementHistoryList');
if (!list) {
return;
}
list.innerHTML = '';
let transactions = paymentTransactions.filter(t => t.entityId === entity.id);
const rangeSelect = document.getElementById('entityPdfRange');
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
transactions.sort((a,b) => b.timestamp - a.timestamp);
if (transactions.length === 0) {
list.innerHTML = `<div class="u-empty-state-sm" >No transaction history</div>`;
return;
}
transactions.forEach(t => {
const isOut = t.type === 'OUT';
const colorClass = isOut ? 'cost-val' : 'profit-val';
const badgeBg = isOut ? 'rgba(220, 38, 38, 0.1)' : 'rgba(5, 150, 105, 0.1)';
const badgeColor = isOut ? 'var(--danger)' : 'var(--accent-emerald)';
const label = isOut ? 'PAYMENT OUT' : 'PAYMENT IN';
const item = document.createElement('div');
item.className = 'cust-history-item';
item.innerHTML = `
<div class="cust-history-info">
<div class="u-mono-bold" >${formatDisplayDate(t.date)}</div>
<div class="u-fs-sm2 u-text-muted" >${esc(t.description || 'No description')}</div>
${t.isMerged ? _mergedBadgeHtml(t) : ''}
</div>
<div style="text-align:right; margin-right:10px;">
<span style="background:${badgeBg}; color:${badgeColor}; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700;">${label}</span>
<div class="${colorClass}" style="font-size:0.9rem; margin-top:2px;">${safeToFixed(t.amount, 2)}</div>
</div>
<button class="btn btn-sm btn-danger u-p-4-8" onclick="deleteEntityTransaction('${esc(t.id)}')">⌫</button>
`;
list.appendChild(item);
});
}
function filterEntityManagementHistory() {
const term = document.getElementById('entity-trans-search').value.toLowerCase();
const items = document.querySelectorAll('#entityManagementHistoryList .cust-history-item');
items.forEach(item => {
const text = item.innerText.toLowerCase();
item.style.display = text.includes(term) ? 'flex' : 'none';
});
}
async function saveQuickEntityTransaction() {
const quickAmountEl = document.getElementById('quickEntityAmount');
if (!quickAmountEl) {
return;
}
const amount = parseFloat(quickAmountEl.value);
if (!amount || amount <= 0) {
showToast("Please enter a valid amount", "warning");
return;
}
if (!currentEntityId) return;
const entity = paymentEntities.find(e => String(e.id) === String(currentEntityId));
try {
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
let txnId = generateUUID('qtxn');
if (!validateUUID(txnId)) {
txnId = generateUUID('qtxn');
}
let transaction = {
id: txnId,
entityId: entity.id,
entityName: entity.name,
entityType: entity.type,
date: dateStr,
time: timeString,
amount: amount,
description: `Quick ${currentQuickType} from Manager`,
type: currentQuickType,
isPayable: false,
createdAt: now.getTime(),
updatedAt: now.getTime(),
timestamp: now.getTime(),
syncedAt: new Date().toISOString()
};
if (currentQuickType === 'OUT') {
const pendingMaterials = factoryInventoryData
.filter(m =>
String(m.supplierId) === String(entity.id) &&
m.paymentStatus === 'pending' &&
m.totalPayable > 0
)
.sort((a, b) =>
new Date(a.purchaseDate || a.date || a.createdAt || 0) -
new Date(b.purchaseDate || b.date || b.createdAt || 0)
);
if (pendingMaterials.length > 0) {
let remaining = amount;
const materialsToSave = [];
let firstMaterialId = null;
for (const mat of pendingMaterials) {
if (remaining <= 0) break;
if (remaining >= mat.totalPayable) {
remaining -= mat.totalPayable;
mat.totalPayable = 0;
mat.paymentStatus = 'paid';
mat.paidDate = dateStr;
mat.updatedAt = getTimestamp();
} else {
mat.totalPayable = parseFloat((mat.totalPayable - remaining).toFixed(2));
remaining = 0;
mat.updatedAt = getTimestamp();
}
materialsToSave.push(mat);
if (!firstMaterialId) firstMaterialId = mat.id;
}
if (materialsToSave.length > 0) {
transaction.isPayable = true;
transaction.materialId = firstMaterialId;
for (const mat of materialsToSave) {
await unifiedSave('factory_inventory_data', factoryInventoryData, mat);
}
}
}
}
transaction = ensureRecordIntegrity(transaction, false);
paymentTransactions.push(transaction);
await unifiedSave('payment_transactions', paymentTransactions, transaction);
emitSyncUpdate({ payment_transactions: paymentTransactions });
notifyDataChange('payments');
triggerAutoSync();
quickAmountEl.value = '';
renderEntityOverlayContent(entity);
calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (transaction.isPayable) {
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
}
showToast("Transaction saved successfully", "success");
} catch (error) {
showToast('Failed to save transaction. Please try again.', 'error');
}
}
async function deleteEntityTransaction(id) {
if (!id || !validateUUID(id)) {
showToast('Invalid transaction ID', 'error');
return;
}
const _dt = paymentTransactions.find(t => t.id === id);
if (!_dt) {
const _ent0 = paymentEntities.find(e => String(e.id) === String(currentEntityId));
if (_ent0) renderEntityOverlayContent(_ent0);
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
return;
}
if (_dt.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const _dtEntity = paymentEntities.find(e => String(e.id) === String(_dt.entityId));
const _dtEntityName = _dtEntity ? _dtEntity.name : 'Unknown';
const _dtTypeLabel = _dt.type === 'IN' ? 'Payment Received (IN)' : 'Payment Made (OUT)';
const _dtAmount = (parseFloat(_dt.amount) || 0).toFixed(2);
const _dtDate = _dt.date || 'Unknown date';
const _dtDesc = _dt.description ? `\nNote: ${_dt.description}` : '';
const _dtPayable = _dt.isPayable === true && _dt.type === 'OUT';
const _dtSupplierMats = _dtPayable
? factoryInventoryData.filter(m => String(m.supplierId) === String(_dt.entityId))
: [];
let _dtMsg = `Delete this ${_dtTypeLabel}?`;
_dtMsg += `\n\nEntity: ${_dtEntityName}`;
_dtMsg += `\nAmount: ${_dtAmount}`;
_dtMsg += `\nDate: ${_dtDate}`;
if (_dtDesc) _dtMsg += _dtDesc;
if (_dtPayable && _dtSupplierMats.length > 0) {
_dtMsg += `\n\n↩ Supplier debt reversal: This payment will be unrecorded and ${_dtSupplierMats.length} raw material${_dtSupplierMats.length !== 1 ? 's' : ''} for "${_dtEntityName}" will revert to outstanding payable status.`;
} else if (_dt.type === 'IN') {
_dtMsg += `\n\n↩ This received payment will be removed from the entity balance.`;
}
_dtMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_dtMsg, { title: `Delete ${_dt.type === 'IN' ? 'Payment IN' : 'Payment OUT'}`, confirmText: "Delete", danger: true })) {
try {
const transaction = _dt;
const supplierId = transaction.entityId;
const wasPayable = transaction.isPayable === true;
const transactionType = transaction.type;
if (wasPayable && transactionType === 'OUT') {
const supplierMaterials = factoryInventoryData.filter(m =>
String(m.supplierId) === String(supplierId)
);
supplierMaterials.forEach(mat => {
const originalAmount = parseFloat((mat.totalValue || (mat.purchaseCost && mat.purchaseQuantity ? mat.purchaseCost * mat.purchaseQuantity : mat.quantity * mat.cost) || 0).toFixed(2));
mat.totalPayable = originalAmount;
mat.paymentStatus = 'pending';
delete mat.paidDate;
mat.updatedAt = getTimestamp();
});
const remainingPayments = paymentTransactions
.filter(t =>
t.id !== id &&
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
paymentTransactions = paymentTransactions.filter(t => t.id !== id);
await unifiedDelete('payment_transactions', paymentTransactions, id);
notifyDataChange('payments');
triggerAutoSync();
const entity = paymentEntities.find(e => String(e.id) === String(currentEntityId));
if (entity) renderEntityOverlayContent(entity);
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
showToast(" Transaction deleted and all views restored successfully!", "success");
} catch (error) {
showToast('Failed to delete transaction. Please try again.', 'error');
}
}
}
async function deleteCurrentEntity() {
if(!currentEntityId) return;
const _entityToDel = paymentEntities.find(e => String(e.id) === String(currentEntityId));
const _entityName = _entityToDel ? _entityToDel.name : 'this entity';
const _entityTxs = paymentTransactions.filter(t => String(t.entityId) === String(currentEntityId));
const hasTrans = _entityTxs.length > 0;
const _totalIn = _entityTxs.filter(t => t.type === 'IN').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
const _totalOut = _entityTxs.filter(t => t.type === 'OUT').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
let msg = `Permanently delete "${_entityName}"?`;
if (hasTrans) {
msg += `\n\n⚠ This entity has ${_entityTxs.length} transaction${_entityTxs.length !== 1 ? 's' : ''} on record`;
if (_totalIn > 0) msg += `\n • Received: ${_totalIn.toFixed(2)}`;
if (_totalOut > 0) msg += `\n • Paid out: ${_totalOut.toFixed(2)}`;
msg += `\n\nAll transaction history will be permanently deleted.`;
}
msg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(msg, { title: `Delete Entity`, confirmText: "Delete", danger: true })) {
try {
const associatedTransactions = paymentTransactions.filter(t => t.entityId === currentEntityId);
paymentEntities = paymentEntities.filter(e => e.id !== currentEntityId);
paymentTransactions = paymentTransactions.filter(t => t.entityId !== currentEntityId);
await unifiedDelete('payment_entities', paymentEntities, currentEntityId);
for (const trans of associatedTransactions) {
await deleteRecordFromFirestore('payment_transactions', trans.id);
}
await saveWithTracking('payment_transactions', paymentTransactions);
notifyDataChange('entities');
closeEntityDetailsOverlay();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
showToast("Entity deleted successfully", "success");
} catch (error) {
showToast('Failed to delete entity. Please try again.', 'error');
}
}
}
function exportEntityData() {
let csvContent = "data:text/csv;charset=utf-8,";
csvContent += "Entity Name,Type,Phone,Net Balance (),Status\n";
const balances = calculateEntityBalances();
paymentEntities.forEach(e => {
const bal = balances[e.id] || 0;
let status = "Settled";
if(bal > 0) status = "Payable (You Owe)";
if(bal < 0) status = "Receivable (Owes You)";
const safeName = safeReplace(e.name, /,/g, " ");
csvContent += `"${safeName}","${e.type}","${e.phone || ''}",${safeToFixed(bal, 2)},"${status}"\n`;
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

function _pdfMergedPeriodLabel(record) {
  const ms = record.mergedSummary;
  const dr = ms && ms.dateRange;
  if (dr && dr.from && dr.to) {
    const fmt = (d) => {
      try {
        const dd = new Date(d);
        if (isNaN(dd.getTime())) return d;
        return dd.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' });
      } catch (e) { return d; }
    };
    return `${fmt(dr.from)} \u2192 ${fmt(dr.to)}`;
  }
  if (record.date) {
    try {
      const dd = new Date(record.date);
      if (!isNaN(dd.getTime()))
        return dd.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' });
    } catch (e) {}
  }
  return 'Prev. Year';
}

function _pdfMergedCountLabel(record) {
  const cnt = record.mergedRecordCount || (record.mergedSummary && record.mergedSummary.recordCount);
  return cnt ? `${cnt} txn${cnt !== 1 ? 's' : ''} merged` : 'year-end merge';
}

function _pdfDrawMergedSectionHeader(doc, yPos, pageW, label) {
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
const PDF_MERGED_HDR_COLOR  = [126, 34, 206];   
const PDF_MERGED_ROW_COLOR  = [245, 235, 255];   
const PDF_MERGED_TEXT_COLOR = [126, 34, 206];    
async function exportEntityToPDF() {
if (!currentEntityId) {
showToast("No entity selected", "warning");
return;
}
const entity = paymentEntities.find(e => String(e.id) === String(currentEntityId));
if (!entity) {
showToast("Entity not found", "error");
return;
}
const rangeSelect = document.getElementById('entityPdfRange');
const range = rangeSelect ? rangeSelect.value : 'all';
showToast("Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
await new Promise(r => setTimeout(r, 200));
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Failed to load PDF library. Please refresh and try again.");
let transactions = paymentTransactions.filter(t => String(t.entityId) === String(entity.id) && !t.isExpense);
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
const da = toSafeDate(a.date);
const db = toSafeDate(b.date);
return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
});
const isPayee = entity.type === 'payee';
const isPayor = entity.type === 'payor';
const headerColor = isPayee ? [230, 100, 20] : [0, 122, 200];
const isSupplier = typeof factoryInventoryData !== 'undefined' &&
factoryInventoryData.some(m => String(m.supplierId) === String(entity.id));
const supplierMaterials = isSupplier
? factoryInventoryData.filter(m => String(m.supplierId) === String(entity.id))
: [];
const { jsPDF } = window.jspdf;
const doc = new jsPDF('p', 'mm', 'a4');
const pageW = doc.internal.pageSize.getWidth();
doc.setFillColor(...headerColor);
doc.rect(0, 0, pageW, 22, 'F');
doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW / 2, 10, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal');
doc.text('Naswar Manufacturers & Dealers', pageW / 2, 17, { align: 'center' });
const rangeName = range === 'all' ? 'All Time' : range === 'today' ? 'Today' :
range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'This Year';
doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
doc.text(`Account Statement · ${rangeName}`, pageW / 2, 30, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
let yPos = 38;
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
doc.text(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageW / 2 + 22, yPos + 5);
yPos += 18;
doc.setDrawColor(...headerColor); doc.setLineWidth(0.5);
doc.line(14, yPos, pageW - 14, yPos);
yPos += 5;
if (transactions.length > 0) {
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...headerColor);
doc.text('PAYMENT TRANSACTIONS', 14, yPos);
doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'normal');
yPos += 5;
const mergedTxns  = transactions.filter(t => t.isMerged === true);
const normalTxns  = transactions.filter(t => !t.isMerged);
const buildTxRow = (t, runBal) => {
  const amt = parseFloat(t.amount) || 0;
  const isOut = t.type === 'OUT';
  const isSupplierPmt = t.isPayable === true;
  runBal.val += isOut ? -amt : amt;
  let balDisplay;
  if (Math.abs(runBal.val) < 0.01) balDisplay = 'SETTLED';
  else balDisplay = 'Rs ' + safeToFixed(Math.abs(runBal.val), 2);
  let desc = (t.description || '-').substring(0, 35);
  if (isSupplierPmt) desc = '\u21a9 Supplier Pmt\n' + desc;
  return [
    formatDisplayDate(t.date),
    desc,
    t.type,
    isOut ? 'Rs ' + safeToFixed(amt, 2) : '-',
    !isOut ? 'Rs ' + safeToFixed(amt, 2) : '-',
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
    const origIn  = ms.originalIn  != null ? 'In: Rs '  + safeToFixed(ms.originalIn,  2) : '';
    const origOut = ms.originalOut != null ? 'Out: Rs ' + safeToFixed(ms.originalOut, 2) : '';
    const summary = [periodLabel, countLabel, origIn, origOut].filter(Boolean).join('\n');
    row[1] = summary.substring(0, 70);
    return row;
  });
  const mTotOut = mergedTxns.filter(t => t.type === 'OUT').reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const mTotIn  = mergedTxns.filter(t => t.type === 'IN' ).reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const mFin    = mTotIn - mTotOut;
  mergedRows.push(['', 'SUBTOTAL', '', 'Rs '+safeToFixed(mTotOut,2), 'Rs '+safeToFixed(mTotIn,2),
    Math.abs(mFin)<0.01?'SETTLED':'Rs '+safeToFixed(Math.abs(mFin),2)]);
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
      const isSubtotal = data.row.index === mergedRows.length - 1;
      if (isSubtotal) {
        data.cell.styles.fillColor = [230, 210, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize  = 8.5;
      } else {
        data.cell.styles.fillColor = PDF_MERGED_ROW_COLOR;
        data.cell.styles.textColor = [80, 40, 120];
      }
      if (data.column.index === 2 && !isSubtotal)
        data.cell.styles.textColor = data.cell.text[0] === 'OUT' ? [180, 40, 40] : [40, 130, 60];
      if (data.column.index === 3 && !isSubtotal) data.cell.styles.textColor = [180, 40, 40];
      if (data.column.index === 4 && !isSubtotal) data.cell.styles.textColor = [40, 130, 60];
      if (data.column.index === 5 && !isSubtotal) {
        const txt = (data.cell.text||[]).join('');
        data.cell.styles.textColor = txt==='SETTLED'?[100,100,100]:[126,34,206];
      }
    },
    margin: { left: 14, right: 14 }
  });
  yPos = doc.lastAutoTable.finalY + 6;
  if (yPos > 255) { doc.addPage(); yPos = 20; }
}
let runningBalance = 0;
const txRunBal = { val: 0 };
const txRows = normalTxns.map(t => buildTxRow(t, txRunBal));
const totalOut = normalTxns.filter(t => t.type === 'OUT').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const totalIn  = normalTxns.filter(t => t.type === 'IN' ).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
const finalBal = totalIn - totalOut;
let finalBalDisplay;
if (Math.abs(finalBal) < 0.01) finalBalDisplay = 'SETTLED';
else finalBalDisplay = 'Rs ' + safeToFixed(Math.abs(finalBal), 2);
if (normalTxns.length > 0) {
  doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
  doc.setTextColor(...headerColor);
  doc.text('INDIVIDUAL TRANSACTIONS', 14, yPos);
  doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'normal');
  yPos += 5;
  txRows.push(['', 'TOTAL', '', 'Rs ' + safeToFixed(totalOut, 2), 'Rs ' + safeToFixed(totalIn, 2), finalBalDisplay]);
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
      const isTotal = data.row.index === txRows.length - 1;
      if (isTotal) { data.cell.styles.fontStyle='bold'; data.cell.styles.fillColor=[240,240,240]; data.cell.styles.fontSize=9; }
      if (data.column.index===2 && !isTotal)
        data.cell.styles.textColor = data.cell.text[0]==='OUT'?[220,53,69]:[40,167,69];
      if (data.column.index===5 && !isTotal) {
        const txt=(data.cell.text||[]).join('');
        if (txt.includes('SETTLED')) data.cell.styles.textColor=[100,100,100];
        else if (txt.includes('OWE')) data.cell.styles.textColor=[220,53,69];
        else data.cell.styles.textColor=[40,167,69];
      }
    },
    margin: { left: 14, right: 14 }
  });
}
const afterTx = (normalTxns.length > 0 ? doc.lastAutoTable.finalY : yPos - 5) + 5;
if (afterTx < 270) {
doc.setFillColor(245, 245, 245);
doc.roundedRect(14, afterTx, pageW - 28, 14, 2, 2, 'F');
doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
doc.setTextColor(220, 53, 69);
doc.text(`Total OUT: Rs ${safeToFixed(totalOut, 2)}`, 20, afterTx + 9);
doc.setTextColor(40, 167, 69);
doc.text(`Total IN: Rs ${safeToFixed(totalIn, 2)}`, 75, afterTx + 9);
doc.setTextColor(Math.abs(finalBal) < 0.01 ? 100 : finalBal < 0 ? 220 : 40,
Math.abs(finalBal) < 0.01 ? 100 : finalBal < 0 ? 53 : 167,
Math.abs(finalBal) < 0.01 ? 100 : finalBal < 0 ? 69 : 69);
doc.setFont(undefined, 'bold');
doc.text(`Net Balance: ${finalBalDisplay}`, 138, afterTx + 9);
yPos = afterTx + 18;
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
? `${safeToFixed(mat.purchaseQuantity, 2)} ${mat.purchaseUnitName}\n(${safeToFixed(mat.quantity || 0, 2)} kg)`
: `${safeToFixed(mat.quantity || 0, 2)} kg`;
return [
formatDisplayDate(mat.purchaseDate || mat.date || mat.createdAt || '') || '-',
(mat.name || 'Material').substring(0, 25),
qtyStr,
'Rs ' + safeToFixed(originalAmt, 2),
paid > 0 ? 'Rs ' + safeToFixed(paid, 2) : '-',
remaining > 0 ? 'Rs ' + safeToFixed(remaining, 2) : '-',
status
];
});
matRows.push([
'', 'TOTAL', '',
'Rs ' + safeToFixed(totalInvoice, 2),
'Rs ' + safeToFixed(totalPaid, 2),
'Rs ' + safeToFixed(totalRemaining, 2),
totalRemaining <= 0 ? 'CLEARED' : ''
]);
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
const isTotal = data.row.index === matRows.length - 1;
if (isTotal) {
data.cell.styles.fontStyle = 'bold';
data.cell.styles.fillColor = [255, 245, 230];
data.cell.styles.fontSize = 9;
}
if (data.column.index === 6 && !isTotal) {
const txt = (data.cell.text || []).join('');
if (txt === 'PAID') data.cell.styles.textColor = [40, 167, 69];
if (txt === 'PARTIAL') data.cell.styles.textColor = [200, 100, 0];
if (txt === 'PENDING') data.cell.styles.textColor = [220, 53, 69];
}
},
margin: { left: 14, right: 14 }
});
const afterMat = doc.lastAutoTable.finalY + 5;
if (afterMat < 272) {
doc.setFillColor(255, 245, 230);
doc.roundedRect(14, afterMat, pageW - 28, 14, 2, 2, 'F');
doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
doc.setTextColor(50, 50, 50);
doc.text(`Total Invoiced: Rs ${safeToFixed(totalInvoice, 2)}`, 20, afterMat + 9);
doc.setTextColor(40, 167, 69);
doc.text(`Paid: Rs ${safeToFixed(totalPaid, 2)}`, 88, afterMat + 9);
doc.setTextColor(totalRemaining > 0 ? 220 : 100, totalRemaining > 0 ? 53 : 100, totalRemaining > 0 ? 69 : 100);
doc.setFont(undefined, 'bold');
doc.text(`Outstanding Payable: Rs ${safeToFixed(totalRemaining, 2)}`, 138, afterMat + 9);
}
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
const filename = `Entity_Statement_${entity.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
doc.save(filename);
showToast("PDF exported successfully", "success");
} catch (error) {
showToast("Error generating PDF: " + error.message, "error");
}
}
async function exportCustomerToPDF() {
const titleElement = document.getElementById('manageCustomerTitle');
if (!titleElement) { showToast("No customer selected", "warning"); return; }
const titleHTML = titleElement.innerHTML;
const nameMatch = titleHTML.match(/<span>([^<]+)<\/span>/) || titleHTML.match(/^([^<]+)/);
const customerName = nameMatch ? nameMatch[1].trim() : titleElement.innerText.split('\n')[0].trim();
if (!customerName) { showToast("No customer selected", "warning"); return; }
const rangeSelect = document.getElementById('customerPdfRange');
const range = rangeSelect ? rangeSelect.value : 'all';
showToast("Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
await new Promise(r => setTimeout(r, 200));
}
if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Failed to load PDF library. Please refresh and try again.");
let transactions = customerSales.filter(s =>
s &&
s.customerName === customerName &&
s.isRepModeEntry !== true &&
(!s.salesRep || s.salesRep === 'NONE')
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
const salesContact = salesCustomers.find(c => c && c.name && c.name.toLowerCase() === customerName.toLowerCase());
const phone = salesContact?.phone || transactions.find(t => t.customerPhone)?.customerPhone || 'N/A';
const address = salesContact?.address || transactions.find(t => t.customerAddress)?.customerAddress || 'N/A';
const { jsPDF } = window.jspdf;
const doc = new jsPDF('p', 'mm', 'a4');
const pageW = doc.internal.pageSize.getWidth();
const hdrColor = [40, 167, 69];
doc.setFillColor(...hdrColor);
doc.rect(0, 0, pageW, 22, 'F');
doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW / 2, 10, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal');
doc.text('Naswar Manufacturers & Dealers · Sales Tab Statement', pageW / 2, 17, { align: 'center' });
const rangeName = range === 'all' ? 'All Time' : range === 'today' ? 'Today' :
range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'This Year';
doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
doc.text(`Customer Account Statement · ${rangeName}`, pageW / 2, 30, { align: 'center' });
doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
let yPos = 38;
doc.setFont(undefined, 'bold'); doc.text('Customer:', 14, yPos);
doc.setFont(undefined, 'normal'); doc.text(customerName, 36, yPos);
doc.setFont(undefined, 'bold'); doc.text('Phone:', 14, yPos + 5);
doc.setFont(undefined, 'normal'); doc.text(phone, 36, yPos + 5);
doc.setFont(undefined, 'bold'); doc.text('Address:', 14, yPos + 10);
doc.setFont(undefined, 'normal'); doc.text(address.substring(0, 60), 36, yPos + 10);
doc.setFont(undefined, 'bold'); doc.text('Generated:', pageW / 2, yPos);
doc.setFont(undefined, 'normal');
doc.text(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageW / 2 + 22, yPos);
yPos += 18;
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, yPos, pageW - 14, yPos);
yPos += 5;
if (transactions.length > 0) {
// Use stored unitPrice (set at save/merge time) or fixed getSalePriceForStore —
// never divide totalValue/quantity which gives a weighted average that changes
// after partial payments and differs from the canonical factory setting.
const getSalePrice = (t) => {
  if (t.unitPrice && t.unitPrice > 0) return t.unitPrice;
  return getSalePriceForStore(t.supplyStore || 'STORE_A');
};
const buildSaleRow = (t, runBal) => {
  const pt = t.paymentType || 'CASH';
  const isOldDebt = t.transactionType === 'OLD_DEBT';
  let debit = 0, credit = 0, typeLabel = '', detailLabel = '', displayDate = formatDisplayDate(t.date);
  if (isOldDebt) {
    debit = parseFloat(t.totalValue) || 0;
    credit = parseFloat(t.partialPaymentReceived) || 0;
    typeLabel = 'OLD DEBT';
    detailLabel = t.notes || 'Brought forward from previous records';
  } else if (pt === 'CASH') {
    const val = t.totalValue || (t.quantity || 0) * getSalePrice(t);
    debit = val; credit = val;
    typeLabel = 'CASH';
    detailLabel = `${safeToFixed(t.quantity||0,2)} kg \xd7 Rs ${safeToFixed(getSalePrice(t),0)}\n${t.supplyStore?getStoreLabel(t.supplyStore):''}`;
  } else if (pt === 'CREDIT' && !t.creditReceived) {
    const val = t.totalValue || (t.quantity || 0) * getSalePrice(t);
    const partial = parseFloat(t.partialPaymentReceived) || 0;
    debit = val; credit = partial;
    typeLabel = partial > 0 ? 'CREDIT\n(PARTIAL)' : 'CREDIT';
    detailLabel = `${safeToFixed(t.quantity||0,2)} kg \xd7 Rs ${safeToFixed(getSalePrice(t),0)}`;
    if (partial > 0) detailLabel += `\nPaid: Rs ${safeToFixed(partial,2)} | Due: Rs ${safeToFixed(val-partial,2)}`;
  } else if (pt === 'CREDIT' && t.creditReceived) {
    const val = t.totalValue || (t.quantity || 0) * getSalePrice(t);
    debit = val; credit = val;
    typeLabel = 'CREDIT\n(PAID)';
    detailLabel = `${safeToFixed(t.quantity||0,2)} kg \xd7 Rs ${safeToFixed(getSalePrice(t),0)}`;
    displayDate = formatDisplayDate(t.creditReceivedDate || t.date);
  } else if (pt === 'COLLECTION') {
    credit = parseFloat(t.totalValue) || 0;
    typeLabel = 'COLLECTION';
    detailLabel = 'Cash payment received';
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
  else if (runBal.val > 0) balDisplay = 'Rs ' + safeToFixed(runBal.val, 2);
  else balDisplay = 'OVERPAID\nRs ' + safeToFixed(Math.abs(runBal.val), 2);
  return { row: [displayDate, typeLabel, detailLabel.substring(0,55),
    debit>0?'Rs '+safeToFixed(debit,2):'-', credit>0?'Rs '+safeToFixed(credit,2):'-', balDisplay],
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
      cashS > 0 ? `Cash sales: Rs ${safeToFixed(cashS,2)}` : '',
      !isSettled ? `Net due: Rs ${safeToFixed(netOut,2)}` : 'Settled'
    ].filter(Boolean).join('\n');
    mRunBal.val += netOut;
    const balTxt = isSettled ? 'SETTLED' : 'Rs ' + safeToFixed(netOut, 2);
    const pt = t.paymentType || 'CASH';
    const typeLabel = isSettled ? 'SETTLED\n(MERGED)' : (pt === 'CREDIT' ? 'CREDIT\n(MERGED)' : 'CASH\n(MERGED)');
    return [formatDisplayDate(t.date), typeLabel, details.substring(0,70),
      netOut>0?'Rs '+safeToFixed(netOut,2):'-', isSettled?'Rs '+safeToFixed(cashS,2):'-', balTxt];
  });
  const mNetTotal = mergedSalesTxns.reduce((s,t)=>{
    const ms=t.mergedSummary||{}; return s+(ms.netOutstanding||t.totalValue||0);},0);
  mergedRows.push(['','SUBTOTAL',`${mergedSalesTxns.length} year-end record${mergedSalesTxns.length!==1?'s':''}`,
    mNetTotal>0?'Rs '+safeToFixed(mNetTotal,2):'-','',
    mNetTotal<=0.01?'SETTLED':'Rs '+safeToFixed(mNetTotal,2)]);
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
      const isSubtotal = data.row.index === mergedRows.length - 1;
      if (isSubtotal) { data.cell.styles.fillColor=[230,210,255]; data.cell.styles.fontStyle='bold'; }
      else { data.cell.styles.fillColor=PDF_MERGED_ROW_COLOR; data.cell.styles.textColor=[80,40,120]; }
      if (data.column.index===3&&!isSubtotal) data.cell.styles.textColor=[180,40,40];
      if (data.column.index===4&&!isSubtotal) data.cell.styles.textColor=[40,130,60];
      if (data.column.index===5&&!isSubtotal) {
        const txt=(data.cell.text||[]).join('');
        data.cell.styles.textColor = txt==='SETTLED'?[100,100,100]:[126,34,206];
      }
    },
    margin: { left: 14, right: 14 }
  });
  yPos = doc.lastAutoTable.finalY + 6;
  if (yPos > 255) { doc.addPage(); yPos = 20; }
}
const txRows = [];
const txRunBal = { val: 0 };
let totDebit = 0, totCredit = 0, totQty = 0;
for (const t of normalSalesTxns) {
  const r = buildSaleRow(t, txRunBal);
  txRows.push(r.row);
  totDebit  += r.debit;
  totCredit += r.credit;
  totQty    += r.qty;
}
const finalBal = totDebit - totCredit;
if (normalSalesTxns.length > 0) {
  doc.setFontSize(8.5); doc.setFont(undefined,'bold');
  doc.setTextColor(...hdrColor);
  doc.text('INDIVIDUAL TRANSACTIONS', 14, yPos);
  doc.setTextColor(80,80,80); doc.setFont(undefined,'normal');
  yPos += 5;
  txRows.push(['TOTALS','',`${safeToFixed(totQty,2)} kg total`,
    'Rs '+safeToFixed(totDebit,2),'Rs '+safeToFixed(totCredit,2),
    Math.abs(finalBal)<0.01?'SETTLED':(finalBal>0?'DUE\nRs '+safeToFixed(finalBal,2):'OVERPAID\nRs '+safeToFixed(Math.abs(finalBal),2))]);
  doc.autoTable({
    startY: yPos,
    head: [['Date', 'Type', 'Details', 'Debit (Sale)', 'Credit (Rcvd)', 'Balance']],
    body: txRows,
    theme: 'grid',
    headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [180,180,180], overflow: 'linebreak' },
    columnStyles: {
      0:{cellWidth:22,halign:'center'},1:{cellWidth:22,halign:'center',fontStyle:'bold'},
      2:{cellWidth:52},3:{cellWidth:27,halign:'right',textColor:[220,53,69],fontStyle:'bold'},
      4:{cellWidth:27,halign:'right',textColor:[40,167,69],fontStyle:'bold'},5:{cellWidth:26,halign:'center',fontStyle:'bold'}
    },
    didParseCell: function(data) {
      const isTotal = data.row.index === txRows.length - 1;
      if (isTotal) { data.cell.styles.fontStyle='bold'; data.cell.styles.fillColor=[235,255,235]; data.cell.styles.fontSize=9; }
      if (data.column.index===1&&!isTotal){
        const txt=(data.cell.text||[]).join('');
        if(txt.includes('CASH')) data.cell.styles.textColor=[40,167,69];
        if(txt.includes('CREDIT')) data.cell.styles.textColor=[200,100,0];
        if(txt.includes('COLLECTION')) data.cell.styles.textColor=[40,167,69];
        if(txt.includes('PARTIAL')) data.cell.styles.textColor=[200,100,0];
        if(txt.includes('OLD DEBT')) data.cell.styles.textColor=[220,53,69];
      }
      if (data.column.index===5&&!isTotal){
        const txt=(data.cell.text||[]).join('');
        if(txt==='SETTLED') data.cell.styles.textColor=[100,100,100];
        else if(txt.includes('OVERPAID')) data.cell.styles.textColor=[40,167,69];
        else data.cell.styles.textColor=[220,53,69];
      }
    },
    margin: { left: 14, right: 14 }
  });
}
const afterY = (normalSalesTxns.length > 0 ? doc.lastAutoTable.finalY : yPos - 5) + 5;
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
const filename = `Customer_Statement_${customerName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
doc.save(filename);
showToast("PDF exported successfully", "success");
} catch (error) {
showToast("Error generating PDF: " + error.message, "error");
}
}

const SCRIPT_INTEGRITY = {
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js':
    'sha256-4C8gBRoAE0XFxW0C7SsQ+X/TBkHSFM3YMwVaF4F8hk=',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js':
    'sha256-0ZQJSA5vPBL+6L5uyIjovZ/m7VBpAOUGc7BHOH/RBHE=',
  'https://cdn.jsdelivr.net/npm/chart.js':
    'sha256-xTzHxGI97/P0M89+tCLzQmSwGMd3ZBLCH8C+awvN73c='
};
function loadScript(url, integrity) {
return new Promise((resolve, reject) => {
if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
const script = document.createElement('script');
script.src = url;
const sri = integrity || SCRIPT_INTEGRITY[url];
if (sri) { script.integrity = sri; script.crossOrigin = 'anonymous'; }
script.onload = () => resolve();
script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
document.head.appendChild(script);
});
}
let _chartJsPromise = null;
function loadChartJs() {
if (window.Chart) return Promise.resolve();
if (!_chartJsPromise) {
_chartJsPromise = loadScript('https://cdn.jsdelivr.net/npm/chart.js')
.catch(err => { _chartJsPromise = null; return Promise.reject(err); });
}
return _chartJsPromise;
}
let currentCashTrackerMode = 'day';
function setCashTrackerMode(mode) {
currentCashTrackerMode = mode;
document.querySelectorAll('#tab-payments .toggle-group .toggle-opt').forEach(opt => {
opt.classList.remove('active');
});
const parent = event.target.parentElement;
parent.querySelectorAll('.toggle-opt').forEach(opt => {
opt.classList.remove('active');
});
event.target.classList.add('active');
calculateCashTracker();
}
function calculateCashTracker() {
const paymentDateEl = document.getElementById('paymentDate');
const selectedDate = (paymentDateEl && paymentDateEl.value) || new Date().toISOString().split('T')[0];
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
let startDate = new Date(selectedDate);
let endDate = new Date(selectedDate);
startDate.setHours(0,0,0,0);
endDate.setHours(23,59,59,999);
if (currentCashTrackerMode === 'week') {
startDate.setDate(selectedDateObj.getDate() - 6);
} else if (currentCashTrackerMode === 'month') {
startDate = new Date(selectedYear, selectedMonth, 1);
endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
} else if (currentCashTrackerMode === 'year') {
startDate = new Date(selectedYear, 0, 1);
endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
} else if (currentCashTrackerMode === 'all') {
startDate = new Date('2000-01-01');
endDate = new Date('2100-12-31');
}
let rawData = {
totalProductionValue: 0,
totalProductionQuantity: 0,
productionCredits: 0,
totalSalesValue: 0,
totalSalesQuantity: 0,
salesCash: 0,
salesCredits: 0,
repSalesValue: 0,
repSalesQuantity: 0,
repSalesCash: 0,
repSalesCredits: 0,
calculatorCash: 0,
calculatorCredits: 0,
calculatorRecovered: 0,
paymentsIn: 0,
paymentsOut: 0,
expenses: 0
};
db.forEach(item => {
if (item.isReturn) return; 
const itemDate = new Date(item.date);
if (itemDate >= startDate && itemDate <= endDate) {
rawData.totalProductionValue += item.totalSale || 0;
rawData.totalProductionQuantity += item.net || 0;
if (item.store === 'STORE_C') {
  if (item.isMerged) {
    rawData.productionCredits += (item.creditSaleNet || 0);
  } else if (item.paymentStatus === 'CREDIT') {
    rawData.productionCredits += item.totalSale || 0;
  }
}
}
});
customerSales.forEach(sale => {
const saleDate = new Date(sale.date);
if (saleDate >= startDate && saleDate <= endDate) {
if (!isDirectSale(sale)) return; 
rawData.totalSalesValue += sale.totalValue || 0;
rawData.totalSalesQuantity += sale.quantity || 0;
if (sale.isMerged && sale.mergedSummary) {
const ms = sale.mergedSummary;
rawData.salesCash    += (ms.cashSales    || 0);
rawData.salesCredits += (ms.unpaidCredit || 0);
} else if (sale.paymentType === 'CASH' || sale.creditReceived) {
rawData.salesCash += sale.totalValue || 0;
} else if (sale.paymentType === 'CREDIT' && !sale.creditReceived) {
rawData.salesCredits += sale.totalValue || 0;
}
}
});
salesHistory.forEach(item => {
const itemDate = new Date(item.date);
if (itemDate >= startDate && itemDate <= endDate) {
rawData.calculatorCash += item.received || 0;
rawData.calculatorCredits += item.creditValue || 0;
rawData.calculatorRecovered += item.prevColl || 0;
}
});
paymentTransactions.forEach(transaction => {
const transDate = new Date(transaction.date);
if (transDate >= startDate && transDate <= endDate) {
if (transaction.type === 'IN') {
rawData.paymentsIn += transaction.amount;
} else if (transaction.type === 'OUT') {
if (transaction.isExpense && transaction.category === 'operating') {
rawData.expenses += transaction.amount;
}
else if (!transaction.isExpense) {
rawData.paymentsOut += transaction.amount;
}
}
}
});

if (Array.isArray(expenseRecords)) {
expenseRecords.forEach(exp => {
if (exp.isMerged !== true) return; 
if (exp.category !== 'operating') return;
const expDate = new Date(exp.date);
if (expDate >= startDate && expDate <= endDate) {
rawData.expenses += (parseFloat(exp.amount) || 0);
}
});
}
const netProductionValue = Math.max(0, rawData.totalProductionValue - rawData.totalSalesValue);
const netSalesCash = rawData.salesCash - rawData.repSalesCash;
const netSalesCredits = rawData.salesCredits - rawData.repSalesCredits;
const netCalculatorDebt = rawData.calculatorCredits - rawData.calculatorRecovered;
const netProductionQuantity = Math.max(0, rawData.totalProductionQuantity - rawData.totalSalesQuantity);
const finalTotals = {
productionValue: netProductionValue,
productionQuantity: netProductionQuantity,
productionCredits: rawData.productionCredits,
salesTabCash: netSalesCash,
salesTabCredits: netSalesCredits,
calculatorCash: rawData.calculatorCash,
calculatorCredits: netCalculatorDebt,
paymentsIn: rawData.paymentsIn,
paymentsOut: rawData.paymentsOut,
expenses: rawData.expenses
};
const netCash = finalTotals.productionValue - finalTotals.productionCredits +
finalTotals.salesTabCash + finalTotals.calculatorCash +
finalTotals.paymentsIn - finalTotals.paymentsOut - finalTotals.expenses;
const totalCredits = finalTotals.salesTabCredits +
finalTotals.calculatorCredits +
finalTotals.productionCredits;
const elCashProdValue = document.getElementById('cash-prod-value');
if (elCashProdValue) elCashProdValue.textContent = `Rs ${safeValue(finalTotals.productionValue).toFixed(2)}`;
const elCashProdCredits = document.getElementById('cash-prod-credits');
if (elCashProdCredits) elCashProdCredits.textContent = `Rs ${safeValue(finalTotals.productionCredits).toFixed(2)}`;
const elCashSalesCash = document.getElementById('cash-sales-cash');
if (elCashSalesCash) elCashSalesCash.textContent = `Rs ${safeValue(finalTotals.salesTabCash).toFixed(2)}`;
const elCashCalcCash = document.getElementById('cash-calculator-cash');
if (elCashCalcCash) elCashCalcCash.textContent = `Rs ${safeValue(finalTotals.calculatorCash).toFixed(2)}`;
const elCashPayIn = document.getElementById('cash-payments-in');
if (elCashPayIn) elCashPayIn.textContent = `Rs ${safeValue(finalTotals.paymentsIn).toFixed(2)}`;
const elCashPayOut = document.getElementById('cash-payments-out');
if (elCashPayOut) elCashPayOut.textContent = `Rs ${safeValue(finalTotals.paymentsOut).toFixed(2)}`;
const elCashExpenses = document.getElementById('cash-expenses');
if (elCashExpenses) elCashExpenses.textContent = `Rs ${safeValue(finalTotals.expenses).toFixed(2)}`;
const elCashNet = document.getElementById('cash-net-total');
if (elCashNet) {
elCashNet.textContent = `Rs ${safeValue(netCash).toFixed(2)}`;
if (netCash < 0) {
elCashNet.style.color = 'var(--danger)';
} else {
elCashNet.style.color = 'var(--accent-emerald)';
}
}
const elCreditSales = document.getElementById('credit-sales-tab');
if (elCreditSales) elCreditSales.textContent = `Rs ${safeValue(finalTotals.salesTabCredits).toFixed(2)}`;
const elCreditCalc = document.getElementById('credit-calculator');
if (elCreditCalc) elCreditCalc.textContent = `Rs ${safeValue(finalTotals.calculatorCredits).toFixed(2)}`;
const productionCreditsElement = document.getElementById('credit-production');
if (productionCreditsElement) {
productionCreditsElement.textContent = `Rs ${safeValue(finalTotals.productionCredits).toFixed(2)}`;
}
const elCreditTotal = document.getElementById('credit-total');
if (elCreditTotal) elCreditTotal.textContent = `Rs ${safeValue(totalCredits).toFixed(2)}`;
return finalTotals;
}
function updateEconomicDashboardWithNetValues(totals, totalCredits) {
const operatingCashFlow = totals.salesTabCash + totals.calculatorCash;
const operatingCashElement = document.getElementById('operatingCashFlow');
if (operatingCashElement) {
operatingCashElement.textContent = `${safeValue(operatingCashFlow).toFixed(2)}`;
}
document.getElementById('cashDetailDirectSales').textContent = `${safeValue(totals.salesTabCash).toFixed(2)}`;
document.getElementById('cashDetailRepCollections').textContent = `${safeValue(totals.calculatorCash).toFixed(2)}`;
const creditTotalElement = document.getElementById('formulaSalesCredit');
if (creditTotalElement) {
creditTotalElement.textContent = `${safeValue(totalCredits).toFixed(2)}`;
}
const salesReceivablesElement = document.getElementById('salesReceivables');
if (salesReceivablesElement) {
salesReceivablesElement.textContent = `${safeValue(totals.salesTabCredits).toFixed(2)}`;
}
const productionValueElement = document.getElementById('formulaProdTotal');
if (productionValueElement) {
productionValueElement.textContent = `${safeValue(totals.productionValue).toFixed(2)}`;
}
}
function openEntityTransactions(entityId) {
const entity = paymentEntities.find(e => String(e.id) === String(entityId));
if (!entity) return;
const entityTransactions = paymentTransactions.filter(t => String(t.entityId) === String(entityId));
let totalIn = 0, totalOut = 0;
entityTransactions.forEach(t => {
const amount = parseFloat(t.amount) || 0;
if (t.type === 'IN') totalIn += amount;
else if (t.type === 'OUT') totalOut += amount;
});
const netBalance = totalIn - totalOut;
const _setTC = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
_setTC('entityTransactionsTitle', `${entity.name || 'Unknown'} - Transactions`);
_setTC('entityTotalIn', `${safeToFixed(totalIn, 2)}`);
_setTC('entityTotalOut', `${safeToFixed(totalOut, 2)}`);
_setTC('entityNetBalance', `${safeToFixed(netBalance, 2)}`);
_setTC('entityTotalTransactions', entityTransactions.length);
const transactionsList = document.getElementById('entityTransactionsList');
transactionsList.innerHTML = '';
if (entityTransactions.length === 0) {
transactionsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">No transactions found for this entity.</div>';
} else {
const sortedTransactions = [...entityTransactions].sort((a, b) => b.timestamp - a.timestamp);
sortedTransactions.forEach(transaction => {
const transactionCard = document.createElement('div');
transactionCard.className = 'liquid-card';
transactionCard.style.padding = '15px';
transactionCard.style.position = 'relative';
const badgeClass = transaction.type === 'IN' ? 'transaction-in' : 'transaction-out';
const badgeText = transaction.type === 'IN' ? 'IN' : 'OUT';
const amountClass = transaction.type === 'IN' ? 'profit-val' : 'cost-val';
const safeAmount = parseFloat(transaction.amount) || 0;
transactionCard.innerHTML = `
<span class="transaction-badge ${badgeClass}" style="position: absolute; top: 10px; right: 10px;">${badgeText}</span>
<div style="margin-bottom: 8px;">
<strong style="color: var(--accent); font-size: 0.9rem;">${transaction.date ? formatDisplayDate(transaction.date) : 'N/A'}</strong>
<span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 10px;">${esc(transaction.time || '')}</span>
</div>
<div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">
${esc(transaction.description || 'No description')}
</div>
<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-border);">
<span class="u-fs-sm2 u-text-muted" >Amount:</span>
<span class="${amountClass}" style="font-size: 1.1rem; font-weight: 800;">${safeAmount.toFixed(2)}</span>
</div>
`;
transactionsList.appendChild(transactionCard);
});
}
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('entityTransactionsOverlay').style.display = 'flex';
});
}
function closeEntityTransactions() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('entityTransactionsOverlay').style.display = 'none';
});
}
async function savePaymentTransaction() {
const entityInput = document.getElementById('paymentEntity');
const dateEl = document.getElementById('paymentDate');
const amountEl = document.getElementById('paymentAmount');
const descriptionEl = document.getElementById('paymentDescription');
if (!entityInput || !dateEl || !amountEl || !descriptionEl) {
showToast("Payment form not ready. Please try again.", 'error');
return;
}
const entityId = (entityInput.getAttribute('data-entity-id') || entityInput.value || '').trim();
const date = dateEl.value;
const amount = parseFloat(amountEl.value) || 0;
const description = descriptionEl.value.trim();
const type = window._expenseCategory || 'operating';
if (!entityId) {
showToast("Please select an entity", 'warning');
return;
}
if (!date) {
showToast("Please select a date", 'warning');
return;
}
if (amount <= 0) {
showToast("Please enter a valid amount", 'warning');
return;
}
if (!description) {
showToast("Please enter a description", 'warning');
return;
}
const entity = paymentEntities.find(e => String(e.id) === String(entityId));
if (!entity) {
showToast("Selected entity not found", 'error');
return;
}
const now = new Date();
let hours = now.getHours();
const minutes = now.getMinutes();
const seconds = now.getSeconds();
const ampm = hours >= 12 ? 'PM' : 'AM';
hours = hours % 12;
hours = hours ? hours : 12;
const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;
let isPayable = false;
let materialId = null;
try {
if (type === 'OUT') {
const pendingMaterials = factoryInventoryData
.filter(m =>
String(m.supplierId) === String(entityId) &&
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
if (!materialId) materialId = mat.id;
}
if (materialsToSave.length > 0) {
isPayable = true;
for (const mat of materialsToSave) {
await unifiedSave('factory_inventory_data', factoryInventoryData, mat);
}
}
}
}
let payId = generateUUID('pay');
if (!validateUUID(payId)) {
payId = generateUUID('pay');
}
const payCreatedAt = getTimestamp();
let payment = {
id: payId,
createdAt: payCreatedAt,
updatedAt: payCreatedAt,
entityId: entityId,
entityName: entity.name,
entityType: entity.type,
date: date,
time: timeString,
amount: amount,
description: description,
type: type,
materialId: materialId,
isPayable: isPayable,
timestamp: payCreatedAt,
syncedAt: new Date().toISOString()
};
payment = ensureRecordIntegrity(payment, false);
paymentTransactions.push(payment);
await unifiedSave('payment_transactions', paymentTransactions, payment);
notifyDataChange('payments');
emitSyncUpdate({ payment_transactions: paymentTransactions });
if (amountEl) amountEl.value = '';
if (descriptionEl) descriptionEl.value = '';
const typeOutEl = document.getElementById('payment-type-out');
if (typeOutEl) typeOutEl.checked = true;
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (isPayable) {
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
}
let message = `Payment ${type === 'IN' ? 'received from' : 'made to'} ${entity.name}`;
if (isPayable) {
message += ' (Material purchase settled - liability reduced)';
}
} catch (error) {
showToast('Failed to save payment transaction. Please try again.', 'error');
return;
}
showToast(message, 'success');
}
async function deletePaymentTransaction(id) {
if (!id || !validateUUID(id)) {
showToast('Invalid transaction ID', 'error');
return;
}
const _dpTx = paymentTransactions.find(t => t.id === id);
if (_dpTx && _dpTx.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const _dpEntity = _dpTx ? paymentEntities.find(e => String(e.id) === String(_dpTx.entityId)) : null;
const _dpEntityName = _dpEntity ? _dpEntity.name : 'Unknown Entity';
const _dpTypeLabel = _dpTx?.type === 'IN' ? 'Payment Received (IN)' : 'Payment Made (OUT)';
const _dpAmount = (parseFloat(_dpTx?.amount) || 0).toFixed(2);
const _dpDate = _dpTx?.date || 'Unknown date';
const _dpIsPayable = _dpTx?.isPayable === true && _dpTx?.type === 'OUT';
const _dpSupMats = _dpIsPayable ? factoryInventoryData.filter(m => String(m.supplierId) === String(_dpTx?.entityId)) : [];
let _dpMsg = `Delete this ${_dpTypeLabel}?`;
_dpMsg += `\n\nEntity: ${_dpEntityName}`;
_dpMsg += `\nAmount: ${_dpAmount}`;
_dpMsg += `\nDate: ${_dpDate}`;
if (_dpTx?.description) _dpMsg += `\nNote: ${_dpTx.description}`;
if (_dpIsPayable && _dpSupMats.length > 0) {
_dpMsg += `\n\n↩ Supplier payable reversal: This payment will be unrecorded and ${_dpSupMats.length} raw material${_dpSupMats.length !== 1 ? 's' : ''} linked to "${_dpEntityName}" will revert to outstanding payable status.`;
} else if (_dpTx?.type === 'IN') {
_dpMsg += `\n\n↩ This received payment will be removed and the entity's receivable balance will be restored.`;
} else {
_dpMsg += `\n\n↩ This outgoing payment will be removed from the entity's payment history.`;
}
_dpMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_dpMsg, { title: `Delete ${_dpTx?.type === 'IN' ? 'Payment IN' : 'Payment OUT'}`, confirmText: "Delete", danger: true })) {
try {
const transaction = paymentTransactions.find(t => t.id === id);
if (!transaction) {
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
return;
}
const supplierId = transaction.entityId;
const wasPayable = transaction.isPayable === true;
const transactionType = transaction.type;
if (wasPayable && transactionType === 'OUT') {
const supplierMaterials = factoryInventoryData.filter(m =>
String(m.supplierId) === String(supplierId)
);
supplierMaterials.forEach(mat => {
const originalAmount = parseFloat((mat.totalValue || (mat.purchaseCost && mat.purchaseQuantity ? mat.purchaseCost * mat.purchaseQuantity : mat.quantity * mat.cost) || 0).toFixed(2));
mat.totalPayable = originalAmount;
mat.paymentStatus = 'pending';
delete mat.paidDate;
mat.updatedAt = getTimestamp();
});
const remainingPayments = paymentTransactions
.filter(t =>
t.id !== id &&
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
if (transaction.expenseId) {
const expense = expenseRecords.find(e => e.id === transaction.expenseId);
if (expense) {
expense.paid = false;
delete expense.paidDate;
expense.updatedAt = getTimestamp();
await saveWithTracking('expenses', expenseRecords);
await saveRecordToFirestore('expenses', expense);
}
}
paymentTransactions = paymentTransactions.filter(t => t.id !== id);
await unifiedDelete('payment_transactions', paymentTransactions, id);
notifyDataChange('payments');
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
if (typeof calculateNetCash === 'function') calculateNetCash();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
if (typeof renderUnifiedTable === 'function') renderUnifiedTable(1);
showToast(" Transaction deleted and all views restored successfully!", "success");
} catch (error) {
showToast(" Failed to delete transaction. Please try again.", "error");
}
}
}
function filterPaymentHistory() {
const searchTerm = document.getElementById('payment-search').value.toLowerCase();
const allCards = document.querySelectorAll('#paymentHistoryList .card');
allCards.forEach(card => {
const cardText = card.textContent.toLowerCase();
if (cardText.includes(searchTerm)) {
card.style.display = '';
} else {
card.style.display = 'none';
}
});
}
function calculateNetCash() {
try {
let rawData = {
totalProductionValue: 0,
totalProductionQuantity: 0,
productionCredits: 0,
totalSalesValue: 0,
totalSalesQuantity: 0,
salesCash: 0,
salesCredits: 0,
repSalesValue: 0,
repSalesQuantity: 0,
repSalesCash: 0,
repSalesCredits: 0,
calculatorCash: 0,
calculatorTotalIssued: 0,
calculatorTotalRecovered: 0,
paymentsIn: 0,
paymentsOut: 0
};
db.forEach(item => {
if (item.isReturn) return; 
rawData.totalProductionValue += item.totalSale || 0;
rawData.totalProductionQuantity += item.net || 0;
if (item.store === 'STORE_C') {
  if (item.isMerged) {
    rawData.productionCredits += (item.creditSaleNet || 0);
  } else if (item.paymentStatus === 'CREDIT') {
    rawData.productionCredits += item.totalSale || 0;
  }
}
});
customerSales.forEach(sale => {
if (!isDirectSale(sale)) return; 
rawData.totalSalesValue += sale.totalValue || 0;
rawData.totalSalesQuantity += sale.quantity || 0;
if (sale.isMerged && sale.mergedSummary) {
const ms = sale.mergedSummary;
rawData.salesCash    += (ms.cashSales    || 0);
rawData.salesCredits += (ms.unpaidCredit || 0);
} else if (sale.paymentType === 'CASH' || sale.creditReceived) {
rawData.salesCash += sale.totalValue || 0;
} else if (sale.paymentType === 'CREDIT' && !sale.creditReceived) {
rawData.salesCredits += sale.totalValue || 0;
}
});
salesHistory.forEach(item => {
rawData.calculatorCash += item.received || 0;
rawData.calculatorTotalIssued += item.creditValue || 0;
rawData.calculatorTotalRecovered += item.prevColl || 0;
});
let totalExpenses = 0;
paymentTransactions.forEach(trans => {
if (trans.type === 'IN') {
rawData.paymentsIn += trans.amount;
} else if (trans.type === 'OUT') {
if (trans.isExpense && trans.category === 'operating') {
totalExpenses += trans.amount;
}
else if (!trans.isExpense) {
rawData.paymentsOut += trans.amount;
}
}
});

if (Array.isArray(expenseRecords)) {
expenseRecords.forEach(exp => {
if (exp.isMerged !== true) return; 
if (exp.category === 'operating') {
totalExpenses += (parseFloat(exp.amount) || 0);
}
});
}
const netProductionValue = Math.max(0, rawData.totalProductionValue - rawData.totalSalesValue);
const netSalesCash = rawData.salesCash - rawData.repSalesCash;
const netSalesCredits = rawData.salesCredits - rawData.repSalesCredits;
const combinedMarketDebt = rawData.calculatorTotalIssued - rawData.calculatorTotalRecovered;
const cashInHand = netProductionValue - rawData.productionCredits +
netSalesCash + rawData.calculatorCash +
rawData.paymentsIn - rawData.paymentsOut;
let AccountsReceivable = {
productionCredits: rawData.productionCredits,
salesTabCredit: netSalesCredits,
calculatorCredit: Math.max(0, combinedMarketDebt),
total: 0
};
AccountsReceivable.total = AccountsReceivable.productionCredits +
AccountsReceivable.salesTabCredit +
AccountsReceivable.calculatorCredit;
let RawMaterialsValue = 0;
factoryInventoryData.forEach(item => {
RawMaterialsValue += (item.quantity * item.cost) || 0;
});
let FormulaUnitsValue = 0;
const stdTracking = factoryUnitTracking?.standard || { available: 0 };
const asaanTracking = factoryUnitTracking?.asaan || { available: 0 };
const stdCostPerUnit = getCostPerUnit('standard');
const asaanCostPerUnit = getCostPerUnit('asaan');
FormulaUnitsValue = (stdTracking.available * stdCostPerUnit) +
(asaanTracking.available * asaanCostPerUnit);
const CURRENT_ASSETS = cashInHand +
RawMaterialsValue +
FormulaUnitsValue +
AccountsReceivable.total;
let CurrentLiabilities = {
accountsPayable: {
supplierPayables: 0,
entityPayables: 0,
otherPayables: {
operating: 0,
total: 0
},
total: 0
},
total: 0
};
const rawMaterialSupplierIds = new Set();
if (factoryInventoryData && factoryInventoryData.length > 0) {
factoryInventoryData.forEach(material => {
if (material.supplierId) {
rawMaterialSupplierIds.add(String(material.supplierId));
}
});
}
const entityBalances = {};
paymentEntities.forEach(entity => {
if (entity.isExpenseEntity === true) return;
entityBalances[entity.id] = 0;
});
paymentTransactions.forEach(transaction => {
if (transaction.isExpense === true) return;
if (entityBalances[transaction.entityId] !== undefined) {
if (transaction.type === 'OUT') {
entityBalances[transaction.entityId] -= parseFloat(transaction.amount) || 0;
} else if (transaction.type === 'IN') {
entityBalances[transaction.entityId] += parseFloat(transaction.amount) || 0;
}
}
});
if (factoryInventoryData && factoryInventoryData.length > 0) {
const pendingPerSupplier = {};
factoryInventoryData.forEach(material => {
if (material.supplierId && material.paymentStatus === 'pending' && material.totalPayable > 0) {
const sid = String(material.supplierId);
pendingPerSupplier[sid] = (pendingPerSupplier[sid] || 0) + material.totalPayable;
}
});
for (const sid in pendingPerSupplier) {
const pendingAmount = pendingPerSupplier[sid];
if (pendingAmount > 0) {
CurrentLiabilities.accountsPayable.supplierPayables += pendingAmount;
}
}
}
for (const entityId in entityBalances) {
if (rawMaterialSupplierIds.has(String(entityId))) continue;
const balance = entityBalances[entityId];
if (balance > 0) {
CurrentLiabilities.accountsPayable.entityPayables += balance;
}
}
CurrentLiabilities.accountsPayable.otherPayables.operating = 0;
paymentTransactions.forEach(trans => {
if (trans.isExpense && trans.category === 'operating') {
CurrentLiabilities.accountsPayable.otherPayables.operating += trans.amount;
}
});

if (Array.isArray(expenseRecords)) {
expenseRecords.forEach(exp => {
if (exp.isMerged !== true) return; 
if (exp.category === 'operating') {
CurrentLiabilities.accountsPayable.otherPayables.operating += (parseFloat(exp.amount) || 0);
}
});
}
CurrentLiabilities.accountsPayable.otherPayables.total =
CurrentLiabilities.accountsPayable.otherPayables.operating;
CurrentLiabilities.accountsPayable.total =
CurrentLiabilities.accountsPayable.supplierPayables +
CurrentLiabilities.accountsPayable.entityPayables +
CurrentLiabilities.accountsPayable.otherPayables.total;
CurrentLiabilities.total = CurrentLiabilities.accountsPayable.total;
const WORKING_CAPITAL = CURRENT_ASSETS - CurrentLiabilities.total;
const ENTERPRISE_VALUE = CURRENT_ASSETS - CurrentLiabilities.total;
const liquidityRatios = {
currentRatio: CurrentLiabilities.total > 0 ? CURRENT_ASSETS / CurrentLiabilities.total : 0,
quickRatio: CurrentLiabilities.total > 0 ? (CURRENT_ASSETS - RawMaterialsValue - FormulaUnitsValue) / CurrentLiabilities.total : 0,
cashRatio: CurrentLiabilities.total > 0 ? cashInHand / CurrentLiabilities.total : 0
};
const indicators = {
cashInHand: cashInHand,
cashDetails: {
directSales: netSalesCash,
productionCash: netProductionValue - rawData.productionCredits,
repCollections: rawData.calculatorCash,
paymentsIn: rawData.paymentsIn,
paymentsOut: rawData.paymentsOut
},
operatingCashFlow: netSalesCash + (netProductionValue - rawData.productionCredits) + rawData.calculatorCash,
assets: {
cash: cashInHand,
rawMaterials: RawMaterialsValue,
formulaUnits: FormulaUnitsValue,
accountsReceivable: AccountsReceivable.total,
currentAssetsTotal: CURRENT_ASSETS
},
receivables: {
productionCredits: AccountsReceivable.productionCredits,
salesTab: AccountsReceivable.salesTabCredit,
calculator: AccountsReceivable.calculatorCredit,
total: AccountsReceivable.total
},
liabilities: {
accountsPayable: {
supplierPayables: CurrentLiabilities.accountsPayable.supplierPayables,
entityPayables: CurrentLiabilities.accountsPayable.entityPayables,
otherPayables: CurrentLiabilities.accountsPayable.otherPayables,
total: CurrentLiabilities.accountsPayable.total
},
total: CurrentLiabilities.total
},
workingCapital: WORKING_CAPITAL,
netWorkingCapital: WORKING_CAPITAL,
totalEnterpriseValue: ENTERPRISE_VALUE,
liquidityRatios: liquidityRatios
};
updateEconomicDashboard(indicators);
return indicators;
} catch (error) {
return null;
}
}
function updateEconomicDashboard(indicators) {
const netCashValueElement = document.getElementById('netCashValue');
if (netCashValueElement) {
netCashValueElement.textContent = `${safeValue(indicators.cashInHand).toFixed(2)}`;
netCashValueElement.style.color = indicators.cashInHand < 0 ? 'var(--danger)' :
indicators.cashInHand < 10000 ? 'var(--warning)' :
'var(--accent-emerald)';
}
const operatingCashElement = document.getElementById('operatingCashFlow');
if (operatingCashElement) {
operatingCashElement.textContent = `${safeValue(indicators.operatingCashFlow).toFixed(2)}`;
}
document.getElementById('cashDetailDirectSales').textContent = `${safeValue(indicators.cashDetails.directSales).toFixed(2)}`;
document.getElementById('cashDetailProductionCash').textContent = `${safeValue(indicators.cashDetails.productionCash).toFixed(2)}`;
document.getElementById('cashDetailRepCollections').textContent = `${safeValue(indicators.cashDetails.repCollections).toFixed(2)}`;
document.getElementById('cashDetailPaymentsIn').textContent = `${safeValue(indicators.cashDetails.paymentsIn).toFixed(2)}`;
document.getElementById('cashDetailPaymentsOut').textContent = `${safeValue(indicators.cashDetails.paymentsOut).toFixed(2)}`;
document.getElementById('cashDetailNet').textContent = `${safeValue(indicators.cashInHand).toFixed(2)}`;
document.getElementById('formulaProdTotal').textContent = `${safeValue(indicators.assets.cash).toFixed(2)}`;
document.getElementById('formulaRawMaterials').textContent = `${safeValue(indicators.assets.rawMaterials).toFixed(2)}`;
document.getElementById('formulaUnitsValue').textContent = `${safeValue(indicators.assets.formulaUnits).toFixed(2)}`;
const productionCreditsElement = document.getElementById('productionReceivables');
if (productionCreditsElement) {
productionCreditsElement.textContent = `${safeValue(indicators.receivables.productionCredits).toFixed(2)}`;
}
const salesReceivablesEl = document.getElementById('salesReceivables');
const calculatorReceivablesEl = document.getElementById('calculatorReceivables');
const formulaReceivablesEl = document.getElementById('formulaReceivables');
if (salesReceivablesEl) salesReceivablesEl.textContent = `${safeValue(indicators.receivables.salesTab).toFixed(2)}`;
if (calculatorReceivablesEl) calculatorReceivablesEl.textContent = `${safeValue(indicators.receivables.calculator).toFixed(2)}`;
if (formulaReceivablesEl) formulaReceivablesEl.textContent = `${safeValue(indicators.receivables.total).toFixed(2)}`;
const supplierPayablesEl = document.getElementById('supplierPayables');
const entityPayablesEl = document.getElementById('entityPayables');
const otherPayablesOperatingEl = document.getElementById('otherPayablesOperating');
const formulaPayOutEl = document.getElementById('formulaPayOut');
if (supplierPayablesEl) supplierPayablesEl.textContent = `${safeValue(indicators.liabilities.accountsPayable.supplierPayables).toFixed(2)}`;
if (entityPayablesEl) entityPayablesEl.textContent = `${safeValue(indicators.liabilities.accountsPayable.entityPayables).toFixed(2)}`;
if (otherPayablesOperatingEl) otherPayablesOperatingEl.textContent = `${safeValue(indicators.liabilities.accountsPayable.otherPayables.operating).toFixed(2)}`;
if (formulaPayOutEl) formulaPayOutEl.textContent = `${safeValue(indicators.liabilities.accountsPayable.total).toFixed(2)}`;
const currentAssetsTotalEl = document.getElementById('currentAssetsTotal');
const currentLiabilitiesTotalEl = document.getElementById('currentLiabilitiesTotal');
if (currentAssetsTotalEl) currentAssetsTotalEl.textContent = `${safeValue(indicators.assets.currentAssetsTotal).toFixed(2)}`;
if (currentLiabilitiesTotalEl) currentLiabilitiesTotalEl.textContent = `${safeValue(indicators.liabilities.total).toFixed(2)}`;
const workingCapitalElement = document.getElementById('formulaPayIn');
if (workingCapitalElement) {
workingCapitalElement.textContent = `${safeValue(indicators.workingCapital).toFixed(2)}`;
workingCapitalElement.style.color = indicators.workingCapital < 0 ? 'var(--danger)' :
indicators.workingCapital < 50000 ? 'var(--warning)' :
'var(--accent-emerald)';
}
document.getElementById('formulaFinal').textContent = `${safeValue(indicators.totalEnterpriseValue).toFixed(2)}`;
const currentRatioElement = document.getElementById('formulaCalcDisc');
if (currentRatioElement) {
const currentRatio = safeNumber(parseFloat(indicators.liquidityRatios?.currentRatio), 0);
currentRatioElement.textContent = currentRatio.toFixed(2);
currentRatioElement.style.color = currentRatio < 1 ? 'var(--danger)' :
currentRatio < 2 ? 'var(--warning)' :
'var(--accent-emerald)';
}
const quickRatioElement = document.getElementById('quickRatio');
if (quickRatioElement) {
const quickRatio = safeNumber(parseFloat(indicators.liquidityRatios?.quickRatio), 0);
quickRatioElement.textContent = quickRatio.toFixed(2);
}
const cashRatioElement = document.getElementById('cashRatio');
if (cashRatioElement) {
const cashRatio = safeNumber(parseFloat(indicators.liquidityRatios?.cashRatio), 0);
cashRatioElement.textContent = cashRatio.toFixed(2);
}
}
function getCostPerUnit(storeType) {
const formula = factoryDefaultFormulas[storeType];
if (!formula || formula.length === 0) return 0;
let totalMaterialCost = 0;
formula.forEach(item => {
totalMaterialCost += (item.cost * item.quantity);
});
const additionalCost = factoryAdditionalCosts[storeType] || 0;
return totalMaterialCost + additionalCost;
}
function calculateFactoryInventoryValue() {
let totalValue = 0;
if (factoryInventoryData && factoryInventoryData.length > 0) {
factoryInventoryData.forEach(item => {
totalValue += (item.quantity * item.cost) || 0;
});
}
const stdTracking = factoryUnitTracking?.standard || { available: 0 };
const asaanTracking = factoryUnitTracking?.asaan || { available: 0 };
const stdCostPerUnit = getCostPerUnit('standard');
const asaanCostPerUnit = getCostPerUnit('asaan');
totalValue += (stdTracking.available * stdCostPerUnit);
totalValue += (asaanTracking.available * asaanCostPerUnit);
return totalValue;
}
function updateFactoryInventoryDisplay() {
const factoryValue = calculateFactoryInventoryValue();
let rawMaterialsValue = 0;
if (factoryInventoryData && factoryInventoryData.length > 0) {
factoryInventoryData.forEach(item => {
rawMaterialsValue += (item.quantity * item.cost) || 0;
});
}
const stdTracking = factoryUnitTracking?.standard || { available: 0 };
const asaanTracking = factoryUnitTracking?.asaan || { available: 0 };
const stdCostPerUnit = getCostPerUnit('standard');
const asaanCostPerUnit = getCostPerUnit('asaan');
const formulaUnitsValue = (stdTracking.available * stdCostPerUnit) +
(asaanTracking.available * asaanCostPerUnit);
const rawMaterialsEl = document.getElementById('formulaRawMaterials');
const unitsValueEl = document.getElementById('formulaUnitsValue');
if (rawMaterialsEl) rawMaterialsEl.textContent = `${safeValue(rawMaterialsValue).toFixed(2)}`;
if (unitsValueEl) unitsValueEl.textContent = `${safeValue(formulaUnitsValue).toFixed(2)}`;
}
function calculatePaymentSummaries() {
const today = new Date().toISOString().split('T')[0];
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
paymentTransactions.forEach(transaction => {
const transDate = new Date(transaction.date);
const transYear = transDate.getFullYear();
const transMonth = transDate.getMonth();
const transDay = transDate.getDate();
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
if (inEl) inEl.textContent = `${safeValue(data.in).toFixed(2)}`;
if (outEl) outEl.textContent = `${safeValue(data.out).toFixed(2)}`;
if (netEl) netEl.textContent = `${safeValue(data.in - data.out).toFixed(2)}`;
if (countEl) countEl.textContent = data.count;
};
updateSummary('payments-day', summaries.day);
updateSummary('payments-week', summaries.week);
updateSummary('payments-month', summaries.month);
updateSummary('payments-year', summaries.year);
}
async function openFactorySettings() {
try {
const [
loadedFormulas,
loadedCosts,
loadedFactor,
loadedPrices,
loadedTracking
] = await Promise.all([
idb.get('factory_default_formulas'),
idb.get('factory_additional_costs'),
idb.get('factory_cost_adjustment_factor'),
idb.get('factory_sale_prices'),
idb.get('factory_unit_tracking')
]);
if (loadedFormulas && typeof loadedFormulas === 'object' &&
('standard' in loadedFormulas) && ('asaan' in loadedFormulas)) {
factoryDefaultFormulas = loadedFormulas;
} else {
factoryDefaultFormulas = { standard: [], asaan: [] };
}
if (loadedCosts && typeof loadedCosts === 'object' &&
('standard' in loadedCosts) && ('asaan' in loadedCosts)) {
factoryAdditionalCosts = loadedCosts;
} else {
factoryAdditionalCosts = { standard: 0, asaan: 0 };
}
if (loadedFactor && typeof loadedFactor === 'object' &&
('standard' in loadedFactor) && ('asaan' in loadedFactor)) {
factoryCostAdjustmentFactor = loadedFactor;
} else {
factoryCostAdjustmentFactor = { standard: 1, asaan: 1 };
}
if (loadedPrices && typeof loadedPrices === 'object' &&
('standard' in loadedPrices) && ('asaan' in loadedPrices)) {
factorySalePrices = loadedPrices;
} else {
factorySalePrices = { standard: 0, asaan: 0 };
}
if (loadedTracking && typeof loadedTracking === 'object' &&
('standard' in loadedTracking) && ('asaan' in loadedTracking)) {
factoryUnitTracking = loadedTracking;
} else {
factoryUnitTracking = {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
}
} catch (error) {
showToast('Error loading factory settings. Using defaults.', 'warning');
factoryDefaultFormulas = { standard: [], asaan: [] };
factoryAdditionalCosts = { standard: 0, asaan: 0 };
factoryCostAdjustmentFactor = { standard: 1, asaan: 1 };
factorySalePrices = { standard: 0, asaan: 0 };
factoryUnitTracking = {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
}
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('factorySettingsOverlay').style.display = 'flex';
});
await renderFactorySettingsRows();
}
function closeFactorySettings() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('factorySettingsOverlay').style.display = 'none';
});
}
function selectFactoryStore(store, el) {
currentFactorySettingsStore = store;
document.querySelectorAll('#factorySettingsOverlay .factory-store-opt').forEach(o => o.classList.remove('active'));
if(el) el.classList.add('active');
const container = document.getElementById('factoryRawMaterialsContainer');
if (container) container.style.opacity = '0.35';
renderFactorySettingsRows().then(() => {
requestAnimationFrame(() => {
if (container) container.style.opacity = '1';
});
});
}
async function refreshFactorySettingsOverlay() {
const overlay = document.getElementById('factorySettingsOverlay');
if (overlay && overlay.style.display === 'flex') {
await renderFactorySettingsRows();
}
}
async function renderFactorySettingsRows() {
const container = document.getElementById('factoryRawMaterialsContainer');
try {
const [
savedFormulas,
savedAdditionalCosts,
savedCostAdjustmentFactor,
savedSalePrices,
savedUnitTracking
] = await Promise.all([
idb.get('factory_default_formulas'),
idb.get('factory_additional_costs'),
idb.get('factory_cost_adjustment_factor'),
idb.get('factory_sale_prices'),
idb.get('factory_unit_tracking')
]);
if (savedFormulas && typeof savedFormulas === 'object' &&
('standard' in savedFormulas) && ('asaan' in savedFormulas)) {
factoryDefaultFormulas = savedFormulas;
}
if (savedAdditionalCosts && typeof savedAdditionalCosts === 'object' &&
('standard' in savedAdditionalCosts) && ('asaan' in savedAdditionalCosts)) {
factoryAdditionalCosts = savedAdditionalCosts;
}
if (savedCostAdjustmentFactor && typeof savedCostAdjustmentFactor === 'object' &&
('standard' in savedCostAdjustmentFactor) && ('asaan' in savedCostAdjustmentFactor)) {
factoryCostAdjustmentFactor = savedCostAdjustmentFactor;
}
if (savedSalePrices && typeof savedSalePrices === 'object' &&
('standard' in savedSalePrices) && ('asaan' in savedSalePrices)) {
factorySalePrices = savedSalePrices;
}
if (savedUnitTracking && typeof savedUnitTracking === 'object' &&
('standard' in savedUnitTracking) && ('asaan' in savedUnitTracking)) {
factoryUnitTracking = savedUnitTracking;
}
} catch (e) {
console.error('An unexpected error occurred.', e);
showToast('An unexpected error occurred.', 'error');
}
if (!factoryDefaultFormulas || typeof factoryDefaultFormulas !== 'object') {
factoryDefaultFormulas = { standard: [], asaan: [] };
}
const formula = factoryDefaultFormulas[currentFactorySettingsStore];
if (!formula || !Array.isArray(formula)) {
factoryDefaultFormulas[currentFactorySettingsStore] = [];
}
let totalRawCost = 0, totalWeight = 0;
container.innerHTML = '';
const safeFormula = factoryDefaultFormulas[currentFactorySettingsStore] || [];
if(safeFormula.length > 0) {
safeFormula.forEach(ing => {
totalRawCost += (ing.cost * ing.quantity);
totalWeight += ing.quantity;
createFactorySettingRow(container, ing.id, ing.quantity);
});
}
if (!factoryUnitTracking || typeof factoryUnitTracking !== 'object') {
factoryUnitTracking = {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
}
const available = factoryUnitTracking[currentFactorySettingsStore]?.available || 0;
if (!factoryAdditionalCosts || typeof factoryAdditionalCosts !== 'object') {
factoryAdditionalCosts = { standard: 0, asaan: 0 };
}
const additionalCost = factoryAdditionalCosts[currentFactorySettingsStore] || 0;
document.getElementById('additional-cost-per-unit').value = additionalCost;
if (!factoryCostAdjustmentFactor || typeof factoryCostAdjustmentFactor !== 'object') {
factoryCostAdjustmentFactor = { standard: 1, asaan: 1 };
}
const adjustmentFactor = factoryCostAdjustmentFactor[currentFactorySettingsStore] || 1;
document.getElementById('cost-adjustment-factor').value = adjustmentFactor;
if (!factorySalePrices || typeof factorySalePrices !== 'object') {
factorySalePrices = { standard: 0, asaan: 0 };
}
const salePriceStandard = factorySalePrices.standard || 0;
const salePriceAsaan = factorySalePrices.asaan || 0;
document.getElementById('sale-price-standard').value = salePriceStandard;
document.getElementById('sale-price-asaan').value = salePriceAsaan;
const perUnitCost = totalRawCost + additionalCost;
const salesCostPerKg = adjustmentFactor > 0 ? perUnitCost / adjustmentFactor : perUnitCost;
const safeTotalWeight = parseFloat(totalWeight) || 0;
const _setFS1 = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setFS1('factorySettingsUnitWeight', safeTotalWeight.toFixed(2) + ' kg');
_setFS1('factorySettingsRawCostPerUnit', await formatCurrency(totalRawCost));
_setFS1('factorySettingsPerUnit', await formatCurrency(perUnitCost));
_setFS1('factorySettingsAvailableUnits', available);
_setFS1('factorySettingsSalesCostPerKg', await formatCurrency(salesCostPerKg));
}
function createFactorySettingRow(container, selectedId = '', qtyVal = '') {
const div = document.createElement('div');
div.className = 'factory-formula-grid';
let options = '<option value="">Select Material</option>';
factoryInventoryData.forEach((i, index) => {
options += `<option value="${esc(String(i.id))}" ${i.id == selectedId ? 'selected' : ''} data-cost="${i.cost}">${esc(i.name)}</option>`;
});
let currentCost = 0;
if(selectedId) {
const m = factoryInventoryData.find(i => i.id == selectedId);
if(m) currentCost = m.cost;
}
div.innerHTML = `
<div class="u-flex-col" >
<label style="font-size:0.6rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Material</label>
<select class="factory-mat-select" onchange="updateFactoryRowCost(this)">${options}</select>
</div>
<div class="u-flex-col" >
<label style="font-size:0.6rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Cost (Per Unit)</label>
<input type="number" class="factory-mat-cost" value="${currentCost}" readonly style="background:rgba(0,0,0,0.05); color:var(--text-muted);">
</div>
<div class="u-flex-col" >
<label style="font-size:0.6rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Qty (kg)</label>
<input type="number" class="factory-mat-qty" value="${esc(String(qtyVal))}" placeholder="0">
</div>
`;
container.appendChild(div);
}
function getColumnLabel(index) {
let label = '';
let num = index;
while (num >= 0) {
label = String.fromCharCode(65 + (num % 26)) + label;
num = Math.floor(num / 26) - 1;
}
return label;
}
function addFactoryMaterialRow() {
const container = document.getElementById('factoryRawMaterialsContainer');
createFactorySettingRow(container);
}
function updateFactoryRowCost(selectEl) {
const costInput = selectEl.closest('.factory-formula-grid').querySelector('.factory-mat-cost');
const selectedOption = selectEl.options[selectEl.selectedIndex];
const cost = selectedOption.getAttribute('data-cost');
costInput.value = cost || 0;
updateFactoryFormulasSummary();
}
async function updateFactoryFormulasSummary() {
const container = document.getElementById('factoryRawMaterialsContainer');
const rows = container.querySelectorAll('.factory-formula-grid');
let totalRawCost = 0, totalWeight = 0;
rows.forEach(row => {
const sel = row.querySelector('.factory-mat-select');
const qtyIn = row.querySelector('.factory-mat-qty');
const costIn = row.querySelector('.factory-mat-cost');
if(sel && sel.value && qtyIn.value > 0 && costIn.value > 0) {
totalRawCost += (parseFloat(costIn.value) * parseFloat(qtyIn.value));
totalWeight += parseFloat(qtyIn.value);
}
});
const additionalCost = parseFloat(document.getElementById('additional-cost-per-unit').value) || 0;
const adjustmentFactor = parseFloat(document.getElementById('cost-adjustment-factor').value) || 1;
const perUnitCost = totalRawCost + additionalCost;
const available = factoryUnitTracking[currentFactorySettingsStore]?.available || 0;
const salesCostPerKg = adjustmentFactor > 0 ? perUnitCost / adjustmentFactor : perUnitCost;
const safeTotalWeight = parseFloat(totalWeight) || 0;
const _setFS = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setFS('factorySettingsUnitWeight', safeTotalWeight.toFixed(2) + ' kg');
_setFS('factorySettingsRawCostPerUnit', await formatCurrency(totalRawCost));
_setFS('factorySettingsPerUnit', await formatCurrency(perUnitCost));
_setFS('factorySettingsAvailableUnits', available);
_setFS('factorySettingsSalesCostPerKg', await formatCurrency(salesCostPerKg));
}
async function saveFactoryFormulas() {
const container = document.getElementById('factoryRawMaterialsContainer');
const rows = container.querySelectorAll('.factory-formula-grid');
const newFormula = [];
rows.forEach(row => {
const sel = row.querySelector('.factory-mat-select');
const qtyIn = row.querySelector('.factory-mat-qty');
const costIn = row.querySelector('.factory-mat-cost');
if(sel && sel.value && qtyIn.value > 0 && costIn.value > 0) {
const item = factoryInventoryData.find(i => i.id == sel.value);
if(item) {
newFormula.push({
id: item.id,
name: item.name,
cost: parseFloat(costIn.value),
quantity: parseFloat(qtyIn.value)
});
}
}
});
factoryDefaultFormulas[currentFactorySettingsStore] = newFormula;
const additionalCost = parseFloat(document.getElementById('additional-cost-per-unit').value) || 0;
factoryAdditionalCosts[currentFactorySettingsStore] = additionalCost;
const adjustmentFactor = parseFloat(document.getElementById('cost-adjustment-factor').value) || 1;
factoryCostAdjustmentFactor[currentFactorySettingsStore] = adjustmentFactor;
const salePriceStandard = parseFloat(document.getElementById('sale-price-standard').value) || 0;
const salePriceAsaan = parseFloat(document.getElementById('sale-price-asaan').value) || 0;
factorySalePrices.standard = salePriceStandard;
factorySalePrices.asaan = salePriceAsaan;
try {
const timestamp = getTimestamp();
await idb.setBatch([
['factory_default_formulas', factoryDefaultFormulas],
['factory_default_formulas_timestamp', timestamp],
['factory_additional_costs', factoryAdditionalCosts],
['factory_additional_costs_timestamp', timestamp],
['factory_cost_adjustment_factor', factoryCostAdjustmentFactor],
['factory_cost_adjustment_factor_timestamp', timestamp],
['factory_sale_prices', factorySalePrices],
['factory_sale_prices_timestamp', timestamp]
]);
} catch (e) {
showToast('Failed to save settings. Please try again.', 'error', 4000);
return;
}
notifyDataChange('all');
if (database && currentUser) {
if (window._firestoreNetworkDisabled || !navigator.onLine) {
const timestamp = getTimestamp();
const factorySettingsPayload = sanitizeForFirestore({
default_formulas: factoryDefaultFormulas,
default_formulas_timestamp: timestamp,
additional_costs: factoryAdditionalCosts,
additional_costs_timestamp: timestamp,
cost_adjustment_factor: factoryCostAdjustmentFactor,
cost_adjustment_factor_timestamp: timestamp,
sale_prices: factorySalePrices,
sale_prices_timestamp: timestamp,
last_synced: new Date().toISOString()
});
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.add({
action: 'set-doc',
collection: 'factorySettings',
docId: 'config',
data: factorySettingsPayload
});
}
showToast('Settings saved locally — will sync when online', 'warning');
} else {
try {
await pushDataToCloud(true);
emitSyncUpdate({
factory_default_formulas: factoryDefaultFormulas,
factory_sale_prices: factorySalePrices,
factory_additional_costs: factoryAdditionalCosts,
factory_cost_adjustment_factor: factoryCostAdjustmentFactor
});
} catch (error) {
const timestamp = getTimestamp();
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.add({
action: 'set-doc',
collection: 'factorySettings',
docId: 'config',
data: sanitizeForFirestore({
default_formulas: factoryDefaultFormulas,
default_formulas_timestamp: timestamp,
additional_costs: factoryAdditionalCosts,
additional_costs_timestamp: timestamp,
cost_adjustment_factor: factoryCostAdjustmentFactor,
cost_adjustment_factor_timestamp: timestamp,
sale_prices: factorySalePrices,
sale_prices_timestamp: timestamp,
last_synced: new Date().toISOString()
})
});
}
showToast('Settings saved locally. Cloud sync will retry automatically.', 'warning');
}
}
}
triggerAutoSync();
calculateFactoryProduction();
updateAllTabsWithFactoryCosts();
closeFactorySettings();
showToast('Formula saved successfully!', 'success', 3000);
}
function openFactoryInventoryModal() {
requestAnimationFrame(() => {
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
document.getElementById('factoryInventoryOverlay').style.display = 'flex';
});
const _facInvT1 = document.getElementById('factoryInventoryModalTitle'); if (_facInvT1) _facInvT1.innerText = 'Add Raw Material';
const _delBtnHide = document.getElementById('deleteFactoryInventoryBtn'); if (_delBtnHide) _delBtnHide.style.display = 'none';
clearFactoryInventoryForm();
editingFactoryInventoryId = null;
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
}
function closeFactoryInventoryModal() {
requestAnimationFrame(() => {
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
document.getElementById('factoryInventoryOverlay').style.display = 'none';
});
}
function clearFactoryInventoryForm() {
document.getElementById('factoryMaterialName').value = '';
document.getElementById('factoryMaterialQuantity').value = '';
document.getElementById('factoryMaterialConversionFactor').value = '1';
document.getElementById('factoryMaterialUnitName').value = '';
document.getElementById('factoryMaterialCost').value = '';
updateFactoryKgCalculation();
}
function editFactoryInventoryItem(id) {
const item = factoryInventoryData.find(i => i.id === id);
if(item) {
openFactoryInventoryModal();
const _facInvT2 = document.getElementById('factoryInventoryModalTitle'); if (_facInvT2) _facInvT2.innerText = 'Edit Material';
const _delBtn = document.getElementById('deleteFactoryInventoryBtn');
if (_delBtn) _delBtn.style.display = '';
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
const supplier = paymentEntities.find(e => String(e.id) === String(item.supplierId));
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
editingFactoryInventoryId = id;
}
}
function updateFactoryKgCalculation() {
const qty = parseFloat(document.getElementById('factoryMaterialQuantity').value) || 0;
const conversionFactor = parseFloat(document.getElementById('factoryMaterialConversionFactor').value) || 1;
const cost = parseFloat(document.getElementById('factoryMaterialCost').value) || 0;
const totalKg = qty * conversionFactor;
const totalAmount = qty * cost;
const kgDisplayElement = document.getElementById('factoryCalculatedKg');
const amountDisplayElement = document.getElementById('factoryCalculatedAmount');
if (kgDisplayElement) {
kgDisplayElement.textContent = totalKg.toFixed(2) + ' kg';
}
if (amountDisplayElement) {
amountDisplayElement.textContent = totalAmount.toFixed(2);
}
}
function showSupplierUnlinkOption(material) {
const existingSupplierSection = document.getElementById('existingSupplierSection');
let unlinkButton = existingSupplierSection.querySelector('.unlink-supplier-btn');
if (!unlinkButton) {
unlinkButton = document.createElement('button');
unlinkButton.className = 'btn btn-danger unlink-supplier-btn';
unlinkButton.style.cssText = 'width: 100%; margin-top: 10px; font-size: 0.8rem;';
unlinkButton.innerHTML = ' Unlink Supplier & Reverse Transactions';
unlinkButton.onclick = function(e) {
e.preventDefault();
unlinkSupplierConfirmation(material);
};
existingSupplierSection.appendChild(unlinkButton);
}
}
async function unlinkSupplierConfirmation(material) {
const linkedTransactions = paymentTransactions.filter(t =>
t.materialId === material.id &&
t.entityId === material.supplierId &&
t.isPayable === true
);
let confirmMsg = ` Unlink ${material.supplierName} from ${material.name}?\n\n`;
confirmMsg += `This will:\n`;
confirmMsg += ` Remove supplier association\n`;
confirmMsg += ` Reset payment status to 'pending'\n`;
if (linkedTransactions.length > 0) {
const totalReversed = linkedTransactions.reduce((sum, t) => sum + t.amount, 0);
confirmMsg += ` Reverse ${linkedTransactions.length} payment transaction(s) totaling ${safeNumber(totalReversed, 0).toFixed(2)}\n`;
}
confirmMsg += `\nThe material will be ready to link with a different supplier.`;
confirmMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: `Unlink ${esc(material.supplierName)}`, confirmText: "Unlink", danger: true })) {
await unlinkSupplierFromMaterial(material, true);
closeFactoryInventoryModal();
setTimeout(() => editFactoryInventoryItem(material.id), 100);
refreshPaymentTab();
calculateNetCash();
renderFactoryInventory();
}
}
async function saveFactoryInventoryItem() {
const name = document.getElementById('factoryMaterialName').value;
const qty = parseFloat(document.getElementById('factoryMaterialQuantity').value) || 0;
const cost = parseFloat(document.getElementById('factoryMaterialCost').value) || 0;
const conversionFactor = parseFloat(document.getElementById('factoryMaterialConversionFactor').value) || 1;
const unitName = document.getElementById('factoryMaterialUnitName').value.trim() || '';
const supplierType = document.getElementById('factoryMaterialSupplierType').value;
if(!name) return showToast("Name required", 'warning');
try {
const quantityInKg = qty * conversionFactor;
const costPerKg = conversionFactor > 0 ? cost / conversionFactor : cost;
const totalValue = qty * cost;
const materialId = editingFactoryInventoryId || generateUUID('mat');
let existingMaterial = null;
if(editingFactoryInventoryId) {
const idx = factoryInventoryData.findIndex(i => i.id === editingFactoryInventoryId);
if(idx !== -1) {
existingMaterial = factoryInventoryData[idx];
const oldSupplierId = existingMaterial.supplierId;
const supplierInput = document.getElementById('factoryExistingSupplier');
const newSupplierId = supplierInput.getAttribute('data-supplier-id') || supplierInput.value;
const isSupplierChanging = (supplierType === 'none' && oldSupplierId) ||
(supplierType === 'existing' && oldSupplierId && String(oldSupplierId) !== String(newSupplierId));
if (isSupplierChanging) {
await unlinkSupplierFromMaterial(existingMaterial);
}
factoryInventoryData[idx] = {
...factoryInventoryData[idx],
name,
quantity: quantityInKg,
cost: costPerKg,
unit: 'kg',
totalValue,
purchaseQuantity: qty,
purchaseCost: cost,
conversionFactor: conversionFactor,
purchaseUnitName: unitName
};
}
} else {
factoryInventoryData.push({
id: materialId,
name,
quantity: quantityInKg,
cost: costPerKg,
unit: 'kg',
totalValue,
paymentStatus: 'pending',
syncedAt: new Date().toISOString(),
purchaseQuantity: qty,
purchaseCost: cost,
conversionFactor: conversionFactor,
purchaseUnitName: unitName
});
}
if (supplierType === 'none') {
const material = factoryInventoryData.find(m => m.id === materialId);
if (material) {
delete material.supplierId;
delete material.supplierName;
delete material.supplierContact;
delete material.supplierType;
material.paymentStatus = 'pending';
delete material.totalPayable;
}
}
else if (supplierType === 'existing') {
const supplierInput = document.getElementById('factoryExistingSupplier');
const existingSupplierId = supplierInput.getAttribute('data-supplier-id') || supplierInput.value;
if (existingSupplierId) {
await linkMaterialToSupplier(materialId, existingSupplierId, totalValue);
}
}
else if (supplierType === 'new') {
const supplierName = document.getElementById('factorySupplierName').value.trim();
const supplierPhone = document.getElementById('factorySupplierPhone').value.trim();
if (supplierName) {
const newSupplier = await createSupplierFromMaterial({
name: supplierName,
phone: supplierPhone,
materialId: materialId,
materialName: name,
materialTotal: totalValue
});
if (newSupplier && newSupplier.id) {
await linkMaterialToSupplier(materialId, newSupplier.id, totalValue);
}
}
}
const savedMaterial = factoryInventoryData.find(m => m.id === materialId);
await unifiedSave('factory_inventory_data', factoryInventoryData, savedMaterial);
notifyDataChange('inventory');
emitSyncUpdate({ factory_inventory_data: factoryInventoryData });
if (typeof renderFactoryInventory === 'function') renderFactoryInventory();
closeFactoryInventoryModal();
if (typeof calculateNetCash === 'function') calculateNetCash();
showToast("Material saved successfully!", 'success');
} catch (error) {
showToast('Failed to save material. Please try again.', 'error');
}
}
async function unlinkSupplierFromMaterial(material, showToastOnNoSupplier = false) {
if (!material) {
showToast('Invalid material data', 'error');
return;
}
if (!material.supplierId) {
if (showToastOnNoSupplier) {
showToast('No supplier to unlink', 'info');
}
return;
}
const supplierId = material.supplierId;
const materialId = material.id;
const supplierName = material.supplierName || 'Unknown Supplier';
const linkedTransactions = paymentTransactions.filter(t =>
t.materialId === materialId &&
t.entityId === supplierId &&
t.isPayable === true
);
if (linkedTransactions.length > 0) {
linkedTransactions.forEach(transaction => {
paymentTransactions = paymentTransactions.filter(t => t.id !== transaction.id);
});
await saveWithTracking('payment_transactions', paymentTransactions);
for (const removedTx of linkedTransactions) {
await deleteRecordFromFirestore('payment_transactions', removedTx.id);
}
}
delete material.supplierId;
delete material.supplierName;
delete material.supplierContact;
delete material.supplierType;
material.paymentStatus = 'pending';
delete material.totalPayable;
delete material.paidDate;
await unifiedSave('factory_inventory_data', factoryInventoryData, material);
notifyDataChange('all');
triggerAutoSync();
await renderFactoryInventory();
await refreshPaymentTab();
calculateNetCash();
showToast(`Unlinked from ${esc(material.name)}`, 'success');
}
async function createSupplierFromMaterial(supplierData) {
const existingSupplier = paymentEntities.find(e =>
e && e.name && supplierData && supplierData.name && e.name.toLowerCase() === supplierData.name.toLowerCase() && e.type === 'payee'
);
if (existingSupplier) {
return existingSupplier;
}
let suppId = generateUUID('supp');
if (!validateUUID(suppId)) {
suppId = generateUUID('supp');
}
const suppCreatedAt = getTimestamp();
let supplierEntity = {
id: suppId,
name: supplierData.name,
type: 'payee',
phone: supplierData.phone || '',
wallet: '',
createdAt: suppCreatedAt,
updatedAt: suppCreatedAt,
timestamp: suppCreatedAt,
isSupplier: true,
supplierCategory: 'raw_materials'
};
supplierEntity = ensureRecordIntegrity(supplierEntity, false);
paymentEntities.push(supplierEntity);
await unifiedSave('payment_entities', paymentEntities, supplierEntity);
notifyDataChange('entities');
triggerAutoSync();
if (typeof renderFactoryInventory === 'function') await renderFactoryInventory();
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
return supplierEntity;
}
async function renderFactoryInventory() {
const tbody = document.getElementById('factoryInventoryTableBody');
let totalVal = 0;
if (factoryInventoryData.length === 0) {
tbody.innerHTML = '<tr><td class="u-empty-state-md" colspan="5" >No items in inventory</td></tr>';
GNDVirtualScroll.destroy('vs-scroller-factory-inventory');
const _invEl = document.getElementById('factoryTotalInventoryValue'); if (_invEl) _invEl.innerText = await formatCurrency(0);
return;
}
// Pre-build all rows (async currency formatting required)
const prebuiltRows = [];
for (const item of factoryInventoryData) {
const itemTotalValue = (item.quantity * item.cost) || 0;
totalVal += itemTotalValue;
let supplierHtml = '';
if (item.supplierName) {
const originalAmount = item.totalValue || (item.purchaseCost && item.purchaseQuantity ? item.purchaseCost * item.purchaseQuantity : item.quantity * item.cost) || 0;
const remainingPayable = item.totalPayable || 0;
const isFullyPaid = item.paymentStatus === 'paid' || remainingPayable <= 0;
const isPartial = !isFullyPaid && remainingPayable < originalAmount && remainingPayable > 0;
const paymentStatus = isFullyPaid
? '<span style="color:var(--accent-emerald); font-weight:600;"> PAID</span>'
: isPartial
? '<span style="color:var(--accent); font-weight:600;">PARTIAL</span>'
: '<span class="u-text-warning u-fw-600" >PENDING</span>';
const payableDisplay = isFullyPaid
? `<span class="u-text-emerald" >0.00</span>`
: isPartial
? `<span style="font-weight:600; color:var(--accent);">${remainingPayable.toFixed(2)}</span>`
: `<span style="font-weight:600;">${remainingPayable.toFixed(2)}</span>`;
supplierHtml = `
<div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px;">
<div style="background:rgba(0, 122, 255, 0.1); color:var(--accent); padding:3px 8px; border-radius:4px; display:inline-block; margin-bottom:3px; font-weight:600;">
SUPPLIER: ${String(item.supplierName).replace(/'/g, "&#39;").replace(/"/g, "&quot;")}
</div>
<div style="margin-top:3px; font-size:0.7rem;">
${paymentStatus} | ${payableDisplay}
</div>
</div>
`;
} else {
supplierHtml = `
<div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px; font-style:italic; opacity:0.6;">
No supplier linked
</div>
`;
}
let quantityHtml = '';
if (item.purchaseQuantity && item.purchaseUnitName && item.conversionFactor && item.conversionFactor !== 1) {
quantityHtml = `
<div class="u-text-center" >
<div class="u-fs-sm3 u-text-main u-fw-600" >
${(item.purchaseQuantity || 0).toFixed(2)}
</div>
<div class="u-fs-sm u-text-muted" >
${esc(item.purchaseUnitName)}
</div>
<div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">
(${(item.quantity || 0).toFixed(2)})
</div>
</div>
`;
} else if (item.purchaseQuantity && item.conversionFactor && item.conversionFactor !== 1) {
quantityHtml = `
<div class="u-text-center" >
<div class="u-fs-sm3 u-text-main u-fw-600" >
${(item.purchaseQuantity || 0).toFixed(2)}
</div>
<div class="u-fs-sm u-text-muted" >
units
</div>
<div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">
(${(item.quantity || 0).toFixed(2)})
</div>
</div>
`;
} else {
quantityHtml = `
<div class="u-text-center" >
<div class="u-fs-sm3 u-text-main u-fw-600" >
${(item.quantity || 0).toFixed(2)}
</div>
<div class="u-fs-sm u-text-muted" >
kg
</div>
</div>
`;
}
let costHtml = '';
if (item.purchaseCost && item.purchaseUnitName && item.conversionFactor && item.conversionFactor !== 1) {
costHtml = `
<div class="u-text-center" >
<div class="u-fs-sm2 u-text-main" >
${await formatCurrency(item.purchaseCost)}
</div>
<div class="u-fs-sm u-text-muted" >
${esc(item.purchaseUnitName)}
</div>
</div>
`;
} else if (item.purchaseCost && item.conversionFactor && item.conversionFactor !== 1) {
costHtml = `
<div class="u-text-center" >
<div class="u-fs-sm2 u-text-main" >
${await formatCurrency(item.purchaseCost)}
</div>
<div class="u-fs-sm u-text-muted" >
unit
</div>
</div>
`;
} else {
costHtml = `
<div class="u-text-center" >
<div class="u-fs-sm2 u-text-main" >
${await formatCurrency(item.cost)}
</div>
<div class="u-fs-sm u-text-muted" >
kg
</div>
</div>
`;
}
const totalValueStr = await formatCurrency(itemTotalValue);
const itemId = esc(item.id);
const itemName = esc(item.name);
// Build tr element (pre-rendered, handed to scroller as literal elements)
const tr = document.createElement('tr');
tr.style.borderBottom = '1px solid var(--glass-border)';
tr.innerHTML = `
<td style="padding: 8px 2px;">
<div style="font-weight:600; font-size:0.8rem; color:var(--text-main);">${itemName}</div>
${supplierHtml}
</td>
<td style="text-align:center; padding: 8px 2px;">
${quantityHtml}
</td>
<td style="text-align:right; padding: 8px 2px; font-size:0.75rem; color:var(--text-muted);">${costHtml}</td>
<td style="text-align:right; padding: 8px 2px; font-size:0.8rem; font-weight:700; color:var(--accent);">${totalValueStr}</td>
<td style="text-align:center; padding: 6px 2px;">
<button class="tbl-action-btn" onclick="editFactoryInventoryItem('${itemId}')">Edit</button>
</td>
`;
prebuiltRows.push(tr);
}
// Hand pre-built elements to scroller (identity builder — elements already constructed)
GNDVirtualScroll.mount('vs-scroller-factory-inventory', prebuiltRows, function(el) { return el; }, tbody);
const _invEl = document.getElementById('factoryTotalInventoryValue'); if (_invEl) _invEl.innerText = await formatCurrency(totalVal);
}
async function unlinkSupplierFromMaterialById(materialId) {
let material = factoryInventoryData.find(m => m.id === materialId);
if (!material) {
const reloadedData = await idb.get('factory_inventory_data');
if (Array.isArray(reloadedData)) {
factoryInventoryData = reloadedData;
material = factoryInventoryData.find(m => m.id === materialId);
}
}
if (!material) {
showToast("Material not found", 'error');
return;
}
if (!material.supplierId) {
showToast("No supplier linked", 'warning');
return;
}
const linkedTransactions = paymentTransactions.filter(t =>
t.materialId === materialId &&
t.entityId === material.supplierId &&
t.isPayable === true
);
const _us2Total = linkedTransactions.reduce((sum, t) => sum + (parseFloat(t.amount)||0), 0);
let confirmMsg = `Unlink ${material.supplierName} from "${material.name}"?`;
confirmMsg += `\nCurrent Stock: ${(material.quantity||0).toFixed(2)} kg`;
if (material.totalPayable) confirmMsg += `\nOutstanding Payable: ${(material.totalPayable||0).toFixed(2)}`;
if (linkedTransactions.length > 0) {
confirmMsg += `\n\n\u21a9 ${linkedTransactions.length} payment transaction${linkedTransactions.length !== 1 ? 's' : ''} totaling ${_us2Total.toFixed(2)} will be reversed and the material reverted to "Pending Payable" status.`;
}
confirmMsg += `\n\nThe material will be available to link with a different supplier.`;
confirmMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: `Unlink ${esc(material.supplierName)}`, confirmText: "Unlink", danger: true })) {
await unlinkSupplierFromMaterial(material, true);
}
}
function toggleSupplierFields() {
const supplierType = document.getElementById('factoryMaterialSupplierType').value;
const existingSection = document.getElementById('existingSupplierSection');
const newSection = document.getElementById('newSupplierSection');
if (existingSection) existingSection.classList.add('hidden');
if (newSection) newSection.classList.add('hidden');
if (supplierType === 'existing') {
if (existingSection) {
existingSection.classList.remove('hidden');
}
} else if (supplierType === 'new') {
if (newSection) newSection.classList.remove('hidden');
}
}
function loadExistingSuppliers() {
const selectElement = document.getElementById('factoryExistingSupplier');
if (!selectElement) return;
selectElement.innerHTML = '<option value="">Choose Supplier</option>';
const suppliers = paymentEntities.filter(entity => entity.type === 'payee');
suppliers.forEach(supplier => {
const option = document.createElement('option');
option.value = supplier.id;
option.textContent = `${supplier.name || 'Unknown'} ${supplier.phone ? `(${supplier.phone})` : ''}`;
selectElement.appendChild(option);
});
if (suppliers.length === 0) {
const option = document.createElement('option');
option.value = "";
option.textContent = "No suppliers found. Create a new one.";
option.disabled = true;
selectElement.appendChild(option);
}
}
async function linkMaterialToSupplier(materialId, supplierId, totalCost) {
let material = factoryInventoryData.find(m => m.id === materialId);
if (!material) {
const reloadedData = await idb.get('factory_inventory_data');
if (Array.isArray(reloadedData)) {
factoryInventoryData = reloadedData;
material = factoryInventoryData.find(m => m.id === materialId);
}
}
if (!material) {
showToast('Material not found. Try refreshing.', 'error');
return;
}
const supplierIdToMatch = supplierId;
let supplier = paymentEntities.find(e =>
e.id === supplierIdToMatch ||
String(e.id) === String(supplierIdToMatch)
);
if (!supplier) {
const supplierTransaction = paymentTransactions.find(t =>
t.entityId === supplierIdToMatch ||
String(t.entityId) === String(supplierIdToMatch)
);
if (supplierTransaction) {
supplier = {
id: supplierIdToMatch,
name: supplierTransaction.entityName || 'Supplier',
type: 'payee',
phone: ''
};
} else {
showToast('Supplier not found. Please refresh and try again.', 'error');
return;
}
}
if (material.supplierId && String(material.supplierId) !== String(supplierIdToMatch)) {
await unlinkSupplierFromMaterial(material);
}
material.supplierId = supplier.id;
material.supplierName = supplier.name;
material.supplierContact = supplier.phone || '';
material.supplierType = 'payee';
material.paymentStatus = 'pending';
material.totalPayable = totalCost;
await unifiedSave('factory_inventory_data', factoryInventoryData, material);
notifyDataChange('all');
triggerAutoSync();
await renderFactoryInventory();
await refreshPaymentTab();
calculateNetCash();
showToast(`Linked to ${esc(supplier.name)}`, 'success');
}
function selectFactoryEntryStore(store, el) {
currentFactoryEntryStore = store;
document.querySelectorAll('.factory-store-selector .factory-store-opt').forEach(o => o.classList.remove('active'));
if(el) el.classList.add('active');
calculateFactoryProduction();
}

function getSalePriceForStore(store) {

	
	if (!store) return 0;
	if (store === 'STORE_C') {
		return factorySalePrices.asaan || 0;
	}

	return factorySalePrices.standard || 0;
}

function getCostPriceForStore(store) {

	
	if (!store) return 0;
	const formulaStore = (store === 'STORE_C') ? 'asaan' : 'standard';
	return calculateSalesCostPerKg(formulaStore);
}

function getStorePricing(store) {

	return {
		salePrice: getSalePriceForStore(store),
		costPrice: getCostPriceForStore(store)
	};
}

async function calculateFactoryProduction() {
const units = parseInt(document.getElementById('factoryProductionUnits').value) || 1;
const settings = factoryDefaultFormulas[currentFactoryEntryStore];
const additionalCost = factoryAdditionalCosts[currentFactoryEntryStore] || 0;
let baseCost = 0;
let rawMaterialsUsed = 0;
let html = `<h4 style="margin:0 0 5px 0; font-size:0.9rem;">${currentFactoryEntryStore.toUpperCase()} Formula (${units} Units)</h4>`;
if (settings && settings.length > 0) {
for (const i of settings) {
const lineTotal = i.cost * i.quantity * units;
baseCost += lineTotal;
rawMaterialsUsed += i.quantity * units;
html += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:2px;">
<span>${i.name} (${i.quantity * units} kg)</span>
<span>${await formatCurrency(lineTotal)}</span>
</div>`;
}
const totalAdditionalCost = additionalCost * units;
if (totalAdditionalCost > 0) {
html += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:2px; color:var(--danger);">
<span>Additional Cost (${additionalCost} per unit)</span>
<span>${await formatCurrency(totalAdditionalCost)}</span>
</div>`;
baseCost += totalAdditionalCost;
}
} else {
html += `<div class="u-text-muted" >No formula set.</div>`;
}
document.getElementById('factoryFormulaDisplay').innerHTML = html;
const _prodCostEl = document.getElementById('factoryTotalProductionCostDisplay'); if (_prodCostEl) _prodCostEl.innerText = await formatCurrency(baseCost);
}
async function saveFactoryProductionEntry() {
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('factory')) {
showToast('Access Denied — Factory not in your assigned tabs', 'warning', 3000); return;
}
const units = parseInt(document.getElementById('factoryProductionUnits').value) || 0;
if(units <= 0) return showToast('Invalid units', 'warning', 3000);
const inventorySnapshot = JSON.parse(JSON.stringify(factoryInventoryData));
const historySnapshot = [...factoryProductionHistory];
try {
const settings = factoryDefaultFormulas[currentFactoryEntryStore];
const additionalCost = factoryAdditionalCosts[currentFactoryEntryStore] || 0;
let baseCost = 0;
let rawMat = 0;
if(settings) {
baseCost = settings.reduce((acc, cur) => acc + (cur.cost * cur.quantity), 0) * units;
rawMat = settings.reduce((acc, cur) => acc + cur.quantity, 0) * units;
}
const totalAdditionalCost = additionalCost * units;
const totalCost = baseCost + totalAdditionalCost;
let inventoryUpdated = false;
if(settings && settings.length > 0) {
settings.forEach(item => {
const materialUsed = item.quantity * units;
const inventoryItem = factoryInventoryData.find(i => i.id === item.id);
if(inventoryItem) {
if(inventoryItem.quantity >= materialUsed) {
inventoryItem.quantity -= materialUsed;
inventoryItem.totalValue = inventoryItem.quantity * inventoryItem.cost;
inventoryUpdated = true;
} else {
throw new Error(`Insufficient ${inventoryItem.name} in inventory! Available: ${inventoryItem.quantity}, Required: ${materialUsed}`);
}
}
});
}
let factProdId = generateUUID('fact_prod');
if (!validateUUID(factProdId)) {
factProdId = generateUUID('fact_prod');
}
const factProdCreatedAt = getTimestamp();
const productionRecord = {
id: factProdId,
date: new Date().toISOString().split('T')[0],
time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
store: currentFactoryEntryStore,
units,
totalCost,
materialsCost: baseCost,
additionalCost: totalAdditionalCost,
rawMaterialsUsed: rawMat,
createdAt: factProdCreatedAt,
updatedAt: factProdCreatedAt,
timestamp: factProdCreatedAt,
syncedAt: new Date().toISOString(),
managedBy: (appMode === 'factory' && window._assignedManagerName) ? window._assignedManagerName : null
};
const validatedRecord = ensureRecordIntegrity(productionRecord);
factoryProductionHistory.unshift(validatedRecord);
await Promise.all([
saveWithTracking('factory_inventory_data', factoryInventoryData),
saveWithTracking('factory_production_history', factoryProductionHistory)
]);
notifyDataChange('factory');
emitSyncUpdate({
factory_inventory_data: factoryInventoryData,
factory_production_history: factoryProductionHistory
});
await syncFactoryProductionStats();
await refreshFactoryTab();
calculateNetCash();
calculateCashTracker();
document.getElementById('factoryProductionUnits').value = '1';
showToast("Production saved successfully!", "success");
const cloudWrites = [
saveRecordToFirestore('factory_production_history', validatedRecord)
];
if (inventoryUpdated) {
for (const item of factoryInventoryData) {
cloudWrites.push(saveRecordToFirestore('factory_inventory_data', item));
}
}
Promise.all(cloudWrites)
.then(() => triggerAutoSync())
.catch(err => console.warn(' Background Firestore sync failed (will retry):', err));
} catch (error) {
factoryInventoryData.length = 0;
factoryInventoryData.push(...inventorySnapshot);
factoryProductionHistory.length = 0;
factoryProductionHistory.push(...historySnapshot);
try {
await idb.setBatch([
['factory_inventory_data', factoryInventoryData],
['factory_production_history', factoryProductionHistory]
]);
} catch (rollbackError) {
console.error('Failed to save data locally.', rollbackError);
showToast('Failed to save data locally.', 'error');
}
showToast(error.message || 'Failed to save production data. Please try again.', 'error', 4000);
}
}
function setFactorySummaryMode(mode, el) {
currentFactorySummaryMode = mode;
document.querySelectorAll('#tab-factory .toggle-group .toggle-opt').forEach(opt => opt.classList.remove('active'));
if(el) el.classList.add('active');
updateFactorySummaryCard();
_filterFactoryHistoryByMode(mode);
}
function setFactoryAvailableStore(store, el) {
document.getElementById('factoryAvailStatsStandard').classList.add('hidden');
document.getElementById('factoryAvailStatsStandard').style.display = 'none';
document.getElementById('factoryAvailStatsAsaan').style.display = 'none';
const statsElement = document.getElementById('factoryAvailStats' + (store === 'standard' ? 'Standard' : 'Asaan'));
if (statsElement) {
statsElement.classList.remove('hidden');
statsElement.style.display = 'grid';
}
const parent = el.parentElement;
parent.querySelectorAll('.toggle-opt').forEach(t => t.classList.remove('active'));
el.classList.add('active');
updateFactoryUnitsAvailableStats();
}
async function renderFactoryHistory() {
const list = document.getElementById('factoryHistoryList');
list.innerHTML = '';
if (factoryProductionHistory.length === 0) {
list.innerHTML = '<div class="u-empty-state-sm" >No recent activity</div>';
return;
}
const recent = [...factoryProductionHistory].sort((a, b) => {
const timeA = a.timestamp || new Date(a.date + ' ' + a.time).getTime();
const timeB = b.timestamp || new Date(b.date + ' ' + b.time).getTime();
return timeB - timeA;
});
for (const entry of recent) {
const dateObj = new Date(entry.date);
const dateStr = (() => {
const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
const day = String(dateObj.getDate()).padStart(2, '0');
const year = String(dateObj.getFullYear()).slice(-2);
return `${month} ${day} ${year} ${esc(entry.time || '')}`;
})();
const badgeClass = entry.store === 'standard' ? 'factory-badge-std' : 'factory-badge-asn';
const storeLabel = entry.store === 'standard' ? 'STD' : 'ASN';
const perUnitCost = entry.units > 0 ? entry.totalCost / entry.units : 0;
const additionalCostPerUnit = factoryAdditionalCosts[entry.store] || 0;
const totalAdditionalCost = additionalCostPerUnit * entry.units;
const div = document.createElement('div');
div.className = 'factory-history-item';
if (entry.date) div.setAttribute('data-date', entry.date);
div.innerHTML = `
<div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid var(--glass-border); padding-bottom:5px;">
<span class="u-fs-sm2 u-text-muted" >${dateStr}</span>
<div style="display:flex; gap:6px; align-items:center;">
${_mergedBadgeHtml(entry)}
<span class="factory-badge ${badgeClass}">${esc(storeLabel)}</span>
</div>
</div>
${entry.managedBy ? `<div style="margin-bottom:8px;"><span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;font-size:0.65rem;font-weight:700;letter-spacing:0.04em;color:var(--accent-purple);background:rgba(206,147,216,0.10);border:1px solid rgba(206,147,216,0.28);border-radius:999px;">${esc(entry.managedBy)}</span></div>` : ''}
<div class="factory-summary-row">
<span class="factory-summary-label">Units Produced</span>
<span class="qty-val">${entry.units}</span>
</div>
<div class="factory-summary-row">
<span class="factory-summary-label">Material Cost</span>
<span class="cost-val">${await formatCurrency(entry.materialsCost || 0)}</span>
</div>
${totalAdditionalCost > 0 ? `<div class="factory-summary-row">
<span class="factory-summary-label">Additional Cost</span>
<span class="cost-val">${await formatCurrency(totalAdditionalCost)}</span>
</div>` : ''}
<div class="factory-summary-row">
<span class="factory-summary-label">Per Unit Cost</span>
<span class="cost-val">${await formatCurrency(perUnitCost)}</span>
</div>
<div class="factory-summary-row">
<span class="factory-summary-label">Total Cost</span>
<span class="rev-val">${await formatCurrency(entry.totalCost)}</span>
</div>
<div class="factory-summary-row">
<span class="factory-summary-label">Raw Materials Used</span>
<span class="qty-val">${safeNumber(entry.rawMaterialsUsed, 0).toFixed(2)} kg</span>
</div>
${entry.isMerged ? '' : `<button class="tbl-action-btn danger u-w-full u-mt-8" onclick="deleteFactoryEntry('${entry.id}')">Delete & Restore Inventory</button>`}
`;
list.appendChild(div);
}
_filterFactoryHistoryByMode(currentFactorySummaryMode || 'all');
}
async function deleteFactoryEntry(id) {
if (!id || !validateUUID(id)) {
showToast('Invalid factory entry ID', 'error');
return;
}
const entryIndex = factoryProductionHistory.findIndex(e => e.id === id);
if (entryIndex === -1) {
await refreshFactoryTab();
return;
}
const entry = factoryProductionHistory[entryIndex];
if (entry.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const _feStoreLabel = getStoreLabel(entry.store) || entry.store;
const _feFormula = factoryDefaultFormulas[entry.store] || [];
const _feMatsDetail = _feFormula.length > 0
? _feFormula.map(f => { const inv = factoryInventoryData.find(i => i.id === f.id); return ` 2022 ${inv?.name || 'Material'}: ${(f.quantity * entry.units).toFixed(2)} kg restored`; }).join('\n')
: '';
let _feMsg = `Delete this factory production batch permanently?`;
_feMsg += `\nStore: ${_feStoreLabel}`;
_feMsg += `\nDate: ${entry.date}`;
_feMsg += `\nUnits Produced: ${entry.units}`;
if (entry.totalCost) _feMsg += `\nTotal Cost: ${(entry.totalCost||0).toFixed(2)}`;
if (_feMatsDetail) _feMsg += `\n\n21a9 Raw materials restored to inventory:\n${_feMatsDetail}`;
else _feMsg += `\n\n21a9 Raw materials used in this batch will be restored to inventory.`;
_feMsg += `\n\n26a0 Sales already made from this batch will NOT be reversed 2014 but available stock will change.`;
_feMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_feMsg, { title: "Delete Factory Production", confirmText: "Delete", danger: true })) {
try {
if (entry) {
entry.deletedAt = getTimestamp();
entry.updatedAt = getTimestamp();
}
await registerDeletion(id, 'factory_history');
let restoredMaterials = [];
const formula = factoryDefaultFormulas[entry.store];
if (formula && formula.length > 0) {
let inventoryUpdated = false;
formula.forEach(formulaItem => {
const materialToRestore = formulaItem.quantity * entry.units;
const inventoryItem = factoryInventoryData.find(i => i.id === formulaItem.id);
if (inventoryItem) {
inventoryItem.quantity += materialToRestore;
inventoryItem.totalValue = inventoryItem.quantity * inventoryItem.cost;
inventoryItem.updatedAt = getTimestamp();
inventoryUpdated = true;
restoredMaterials.push({
name: inventoryItem.name || 'Unknown',
quantity: materialToRestore
});
}
});
}
factoryProductionHistory.splice(entryIndex, 1);
await Promise.all([
unifiedDelete('factory_production_history', factoryProductionHistory, id),
saveWithTracking('factory_inventory_data', factoryInventoryData)
]);
await refreshFactoryTab();
calculateNetCash();
calculateCashTracker();
notifyDataChange('factory');
if (restoredMaterials.length > 0) {
const materialsList = restoredMaterials.map(m => `${m.name}: +${m.quantity.toFixed(2)} kg`).join(', ');
showToast(` Entry deleted! Raw materials restored: ${materialsList}`, "success");
} else {
showToast(" Entry deleted and inventory restored.", "success");
}
const cloudWrites = factoryInventoryData
.filter(item => item && item.id)
.map(item => saveRecordToFirestore('factory_inventory_data', item));
Promise.all(cloudWrites)
.then(() => triggerAutoSync())
.catch(err => console.warn(' Background Firestore sync failed on delete (will retry):', err));
} catch (error) {
showToast(" Failed to delete entry. Please try again.", "error");
}
}
}
function calculateDynamicCost(storeType, formulaUnits, netWeight) {
let formulaStore = 'standard';
if (storeType === 'STORE_C' || storeType === 'asaan') {
formulaStore = 'asaan';
} else if (storeType !== 'STORE_A' && storeType !== 'STORE_B' && storeType !== 'standard') {
return {
costPerUnit: 0,
totalFormulaCost: 0,
dynamicCostPerKg: 0,
formulaStore: storeType,
rawMaterialCost: 0
};
}
const formula = factoryDefaultFormulas[formulaStore];
if (!formula || formula.length === 0 || netWeight <= 0) {
return {
costPerUnit: 0,
totalFormulaCost: 0,
dynamicCostPerKg: 0,
formulaStore: formulaStore,
rawMaterialCost: 0
};
}
let totalMaterialCost = 0;
let totalWeight = 0;
formula.forEach(item => {
totalMaterialCost += (item.cost * item.quantity);
totalWeight += item.quantity;
});
const additionalCost = factoryAdditionalCosts[formulaStore] || 0;
const costPerUnit = totalMaterialCost + additionalCost;
const dynamicCostPerKg = formulaUnits > 0 ? (costPerUnit * formulaUnits) / netWeight : 0;
return {
costPerUnit: costPerUnit,
totalMaterialCost: totalMaterialCost,
additionalCost: additionalCost,
totalFormulaCost: costPerUnit * formulaUnits,
dynamicCostPerKg: dynamicCostPerKg,
formulaStore: formulaStore,
rawMaterialCost: totalMaterialCost,
unitWeight: totalWeight
};
}
function calculateSalesCostPerKg(formulaStore) {
const formula = factoryDefaultFormulas[formulaStore];
if (!formula || formula.length === 0) {
return 0;
}
let rawMaterialCost = 0;
formula.forEach(item => {
rawMaterialCost += (item.cost * item.quantity);
});
const additionalCost = factoryAdditionalCosts[formulaStore] || 0;
const totalCostPerUnit = rawMaterialCost + additionalCost;
const adjustmentFactor = factoryCostAdjustmentFactor[formulaStore] || 1;
const costPerKgForSales = adjustmentFactor > 0 ? totalCostPerUnit / adjustmentFactor : totalCostPerUnit;
return costPerKgForSales;
}
async function updateFormulaInventory() {
const tracking = {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
factoryProductionHistory.forEach(entry => {
if (entry.store && entry.units > 0) {
tracking[entry.store].produced += entry.units;
if (entry.totalCost && entry.units > 0) {
tracking[entry.store].unitCostHistory.push({
date: entry.date,
costPerUnit: entry.totalCost / entry.units,
units: entry.units
});
}
}
});
db.forEach(entry => {
let formulaStore = 'standard';
if (entry.store === 'STORE_C') {
formulaStore = 'asaan';
}
if (entry.formulaUnits) {
tracking[formulaStore].consumed += entry.formulaUnits;
}
});
tracking.standard.available = Math.max(0, tracking.standard.produced - tracking.standard.consumed);
tracking.asaan.available = Math.max(0, tracking.asaan.produced - tracking.asaan.consumed);
factoryUnitTracking = tracking;
const timestamp = Date.now();
await idb.set('factory_unit_tracking', factoryUnitTracking);
await idb.set('factory_unit_tracking_timestamp', timestamp);
return tracking;
}
async function syncFactoryProductionStats() {
const tracking = await updateFormulaInventory();
updateUnitsAvailableIndicator();
updateFactoryUnitsAvailableStats();
updateFactorySummaryCard();
return tracking;
}
function validateFormulaAvailability(storeType, requestedUnits) {
let formulaStore = 'standard';
if (storeType === 'STORE_C' || storeType === 'asaan') {
formulaStore = 'asaan';
}
const available = factoryUnitTracking[formulaStore]?.available || 0;
return {
available: available,
sufficient: available >= requestedUnits,
deficit: Math.max(0, requestedUnits - available)
};
}
function updateUnitsAvailableIndicator() {
const store = document.getElementById('storeSelector').value;
let formulaStore = 'standard';
if (store === 'STORE_C') {
formulaStore = 'asaan';
}
const available = factoryUnitTracking[formulaStore]?.available || 0;
const indicator = document.getElementById('currentUnitsAvailable');
const warning = document.getElementById('insufficientUnitsWarning');
let indicatorClass = 'units-available-good';
if (available < 10) {
indicatorClass = 'units-available-warning';
}
if (available <= 0) {
indicatorClass = 'units-available-danger';
}
if (indicator) {
indicator.className = `units-available-indicator ${indicatorClass}`;
indicator.textContent = `${(available || 0).toFixed(2)} units available`;
}
const requestedUnits = parseFloat(document.getElementById('formula-units')?.value) || 0;
if (warning) {
if (requestedUnits > available) {
warning.classList.remove('hidden');
} else {
warning.classList.add('hidden');
}
}
}
function calculateDynamicProductionCost() {
const net = parseFloat(document.getElementById('net-wt').value) || 0;
const store = document.getElementById('storeSelector').value;
const formulaUnits = parseFloat(document.getElementById('formula-units').value) || 0;
const costData = calculateDynamicCost(store, formulaUnits, net);
// getSalePriceForStore handles all three stores:
// STORE_C → asaan price, STORE_A / STORE_B → standard price
const salePrice = getSalePriceForStore(store);
const _setProd = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setProd('formula-unit-cost-display', `${safeValue(costData.costPerUnit).toFixed(2)}/unit`);
_setProd('total-formula-cost-display', `${safeValue(costData.totalFormulaCost).toFixed(2)}`);
_setProd('dynamic-cost-per-kg', `${safeValue(costData.dynamicCostPerKg).toFixed(2)}/kg`);
_setProd('factory-cost-price', `${safeValue(costData.dynamicCostPerKg).toFixed(2)}/kg`);
_setProd('production-sale-price-display', `${safeValue(salePrice).toFixed(2)}/kg`);
_setProd('profit-sale-price', `${safeValue(salePrice).toFixed(2)}/kg`);
const totalCost = net * costData.dynamicCostPerKg;
_setProd('display-cost-value', `${safeValue(totalCost).toFixed(2)}`);
const profitPerKg = salePrice - costData.dynamicCostPerKg;
_setProd('profit-per-kg', `${safeValue(profitPerKg).toFixed(2)}`);
updateUnitsAvailableIndicator();
}
function updateProductionCostOnStoreChange() {
const store = document.getElementById('storeSelector').value;
currentStore = store;
// getSalePriceForStore handles all three stores:
// STORE_C → asaan price, STORE_A / STORE_B → standard price
const salePrice = getSalePriceForStore(store);
const _setStore = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setStore('production-sale-price-display', `${safeValue(salePrice).toFixed(2)}/kg`);
_setStore('profit-sale-price', `${safeValue(salePrice).toFixed(2)}/kg`);
calculateDynamicProductionCost();
updatePaymentStatusVisibility();
if (typeof refreshUI === 'function') refreshUI();
}
function calcNet() {
const g = parseFloat(document.getElementById('gross-wt').value) || 0;
const c = parseFloat(document.getElementById('cont-wt').value) || 0;
const net = Math.max(0, g - c);
document.getElementById('net-wt').value = safeNumber(net, 0).toFixed(2);
calculateDynamicProductionCost();
}
async function deleteProdEntry(id) {
if (!id || !validateUUID(id)) {
showToast('Invalid production record ID', 'error');
return;
}
const entryToDelete = db.find(item => item.id === id);
if (!entryToDelete) return;
if (entryToDelete.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const isReturn = entryToDelete.isReturn === true;
const _dpStoreLabel = getStoreLabel(entryToDelete.store) || entryToDelete.store;
const _dpSalesOnDate = (typeof customerSales !== 'undefined' ? customerSales : []).filter(s => s.date === entryToDelete.date && s.store === entryToDelete.store).length;
let confirmMsg;
if (isReturn) {
confirmMsg = `Remove this stock return record?`;
confirmMsg += `\nStore: ${_dpStoreLabel}`;
confirmMsg += `\nDate: ${entryToDelete.date}`;
confirmMsg += `\nQty Returned: ${entryToDelete.net} kg`;
confirmMsg += `\n\n\u21a9 This will DECREASE available stock by ${entryToDelete.net} kg on ${entryToDelete.date}.`;
if (_dpSalesOnDate > 0) confirmMsg += ` ${_dpSalesOnDate} sale${_dpSalesOnDate !== 1 ? 's' : ''} exist on this date — those records may be affected.`;
} else {
confirmMsg = `Permanently delete this production record?`;
confirmMsg += `\nStore: ${_dpStoreLabel}`;
confirmMsg += `\nDate: ${entryToDelete.date}`;
confirmMsg += `\nNet Qty: ${entryToDelete.net} kg`;
if (entryToDelete.gross) confirmMsg += `\nGross / Tare: ${entryToDelete.gross} / ${((entryToDelete.gross||0) - (entryToDelete.net||0)).toFixed(2)} kg`;
confirmMsg += `\n\n\u21a9 ${entryToDelete.net} kg will be removed from ${entryToDelete.date} inventory.`;
if (_dpSalesOnDate > 0) confirmMsg += `\n\n\u26a0 ${_dpSalesOnDate} sale${_dpSalesOnDate !== 1 ? 's' : ''} on this date for ${_dpStoreLabel} will remain on record, but available stock will drop.`;
}
confirmMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(confirmMsg, { title: isReturn ? "Remove Return" : "Delete Production", confirmText: isReturn ? "Remove" : "Delete", danger: true })) {
try {
const deletedDate = entryToDelete.date;
const deletedStore = entryToDelete.store;
const deletedQuantity = entryToDelete.net || 0;
const record = db.find(item => item.id === id);
if (record) {
record.deletedAt = getTimestamp();
record.updatedAt = getTimestamp();
}
db = db.filter(item => item.id !== id);
await unifiedDelete('mfg_pro_pkr', db, id);
notifyDataChange('production');
syncFactoryProductionStats();
await refreshUI();
calculateNetCash();
calculateCashTracker();
if (isReturn) {
showToast(` Return record removed. ${deletedQuantity} kg removed from ${deletedDate} stock.`, "success");
} else {
showToast(` Production deleted. ${deletedQuantity} kg removed from ${deletedDate} inventory. Sales on this date may be affected.`, "success");
}
} catch (error) {
showToast(" Failed to delete entry. Please try again.", "error");
}
}
}
async function saveCustomerSale() {
if (appMode === 'userrole' && !(window._userRoleAllowedTabs || []).includes('sales')) {
showToast('Access Denied — Sales not in your assigned tabs', 'warning', 3000); return;
}
const date = document.getElementById('cust-date').value;
const name = document.getElementById('cust-name').value.trim();
const quantity = parseFloat(document.getElementById('cust-quantity').value) || 0;
const store = document.getElementById('supply-store-value').value;
const paymentType = document.getElementById('payment-type-value').value;
const salesRep = document.getElementById('sales-rep-value').value;
const phoneInput = document.getElementById('new-cust-phone');
const phoneNumber = (!document.getElementById('new-customer-phone-container').classList.contains('hidden'))
? phoneInput.value.trim()
: '';
if (!date) {
showToast('Please select a date.', 'warning', 3000);
return;
}
if (!name) {
showToast('Please enter customer name.', 'warning', 3000);
return;
}
if (quantity <= 0) {
showToast('Please enter a valid quantity.', 'warning', 3000);
return;
}
let storeSpecificProduction = 0;
db.forEach(production => {
if (production.date === date) {
if (store === 'STORE_A' && production.store === 'STORE_A') {
storeSpecificProduction += production.net || 0;
} else if (store === 'STORE_B' && production.store === 'STORE_B') {
storeSpecificProduction += production.net || 0;
} else if (store === 'STORE_C' && production.store === 'STORE_C') {
storeSpecificProduction += production.net || 0;
}
}
});
let storeSpecificSales = 0;
customerSales.forEach(sale => {

if (isRepSale(sale)) return;
if (sale.date === date && sale.supplyStore === store) {
storeSpecificSales += sale.quantity || 0;
}
});
let storeReturns = 0;
stockReturns.forEach(returnEntry => {
if (returnEntry.date === date && returnEntry.store === store) {
storeReturns += returnEntry.quantity || 0;
}
});
const totalAvailableInventory = storeSpecificProduction + storeReturns;
const storeAvailableInventory = totalAvailableInventory - storeSpecificSales;
if (totalAvailableInventory === 0) {
showToast(` No production recorded for ${date}. You cannot sell what has not been produced.`, 'warning', 5000);
return;
}
if (storeSpecificProduction === 0 && storeReturns === 0) {
showToast(` No production or returns for ${getStoreLabel(store)} on ${date}. Check available stores.`, 'warning', 5000);
return;
}
const remainingAfterSale = storeAvailableInventory - quantity;
if (remainingAfterSale < 0) {
showToast(` Insufficient stock! Available: ${safeNumber(storeAvailableInventory, 0).toFixed(2)} kg, Requested: ${safeNumber(quantity, 0).toFixed(2)} kg. Shortage: ${safeNumber(Math.abs(remainingAfterSale), 0).toFixed(2)} kg`, 'error', 6000);
return;
}
const costData = calculateSalesCost(store, quantity);
const totalCost = costData.totalCost;
const totalValue = costData.totalValue;
const profit = totalValue - totalCost;
const existingCustomer = customerSales.find(s => s && s.customerName && name && s.customerName.toLowerCase() === name.toLowerCase());
let existingCredit = 0;
if (existingCustomer) {
customerSales.forEach(sale => {
if (sale && sale.customerName && name && sale.customerName.toLowerCase() === name.toLowerCase() &&
sale.paymentType === 'CREDIT' &&
!sale.creditReceived) {
if (sale.isMerged && typeof sale.creditValue === 'number') {
existingCredit += sale.creditValue;
} else {
existingCredit += (sale.totalValue || 0) - (sale.partialPaymentReceived || 0);
}
}
});
}
if (paymentType === 'CREDIT') {
const creditWarningThreshold = 5000;
if (existingCredit > creditWarningThreshold) {
const _cwMsg = `${name} already has an outstanding credit balance.
Current unpaid balance: ${safeNumber(existingCredit, 0).toFixed(2)}
This new credit sale: ${safeNumber(totalValue, 0).toFixed(2)}
New total if you proceed: ${safeNumber(existingCredit + totalValue, 0).toFixed(2)}
⚠ Consider collecting the existing balance before adding more credit. Proceeding will increase their total debt beyond the threshold.`;
if (!(await showGlassConfirm(_cwMsg, { title: "⚠ High Credit Warning", confirmText: "Add Credit Anyway", cancelText: "Cancel" }))) {
return;
}
}
}
const now = new Date();
let hours = now.getHours();
const minutes = now.getMinutes();
const seconds = now.getSeconds();
const ampm = hours >= 12 ? 'PM' : 'AM';
hours = hours % 12;
hours = hours ? hours : 12;
const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;
const recordId = generateUUID();
const recordTimestamp = getTimestamp();
if (!validateUUID(recordId)) {
showToast(' Error generating transaction ID. Please try again.', 'error');
return;
}
const saleRecord = {
id: recordId,
timestamp: recordTimestamp,
createdAt: recordTimestamp,
updatedAt: recordTimestamp,
date: date,
time: timeString,
customerName: name,
customerPhone: phoneNumber,
quantity: quantity,
supplyStore: store,
paymentType: paymentType,
salesRep: salesRep,
totalCost: totalCost,
totalValue: totalValue,
profit: profit,
// Store the canonical sale price per kg at the time of the transaction.
// getSalePriceForStore returns the fixed factory setting — not a computed average.
unitPrice: costData.salePricePerKg || getSalePriceForStore(store),
creditReceived: paymentType === 'CASH' ? true : false,
syncedAt: new Date().toISOString(),
isRepModeEntry: false
};
const validatedRecord = ensureRecordIntegrity(saleRecord);
const salesSnapshot = [...customerSales];
try {
customerSales.push(validatedRecord);
await saveWithTracking('customer_sales', customerSales);
await saveRecordToFirestore('customer_sales', validatedRecord);
notifyDataChange('sales');
triggerAutoSync();
if (typeof calculateCashTracker === 'function') calculateCashTracker();
if (typeof calculateNetCash === 'function') calculateNetCash();
emitSyncUpdate({ customer_sales: customerSales });
document.getElementById('cust-name').value = '';
document.getElementById('cust-quantity').value = '';
selectPaymentType(document.getElementById('btn-payment-cash'), 'CASH');
selectSupplyStore(document.getElementById('btn-supply-store-a'), 'STORE_A');
if (phoneInput) phoneInput.value = '';
document.getElementById('new-customer-phone-container').classList.add('hidden');
if (typeof renderCustomersTable === 'function') {
renderCustomersTable();
}
refreshEntityList();
showToast(` Sale recorded successfully! ${name} - ${safeNumber(quantity, 0).toFixed(2)} kg`, "success");
} catch (error) {
customerSales.length = 0;
customerSales.push(...salesSnapshot);
try {
await saveWithTracking('customer_sales', customerSales);
} catch (rollbackError) {
console.error('UI refresh failed.', rollbackError);
showToast('UI refresh failed.', 'error');
}
showToast(' Failed to save sale. Please try again.', 'error');
}
}
function getStoreLabel(storeCode) {
switch(storeCode) {
case 'STORE_A': return 'ZUBAIR';
case 'STORE_B': return 'MAHMOOD';
case 'STORE_C': return 'ASAAN';
default: return storeCode;
}
}
function getAvailableStoresForDate(date) {
const stores = new Set();
db.forEach(production => {
if (production.date === date && production.net > 0) {
stores.add(getStoreLabel(production.store));
}
});
return Array.from(stores).join(', ') || 'None';
}
function calculateSalesCost(store, quantity) {
let costPerKg = 0;
let salePricePerKg = 0;
if (store === 'STORE_C') {
const formulaCost = getCostPerUnit('asaan');
const adjustmentFactor = factoryCostAdjustmentFactor.asaan || 1;
costPerKg = adjustmentFactor > 0 ? formulaCost / adjustmentFactor : formulaCost;
			salePricePerKg = getSalePriceForStore('STORE_C'); 
} else {
const formulaCost = getCostPerUnit('standard');
const adjustmentFactor = factoryCostAdjustmentFactor.standard || 1;
costPerKg = adjustmentFactor > 0 ? formulaCost / adjustmentFactor : formulaCost;
salePricePerKg = getSalePriceForStore('STORE_A'); 
}
const totalCost = quantity * costPerKg;
const totalValue = quantity * salePricePerKg;
return {
costPerKg: costPerKg,
salePricePerKg: salePricePerKg,
totalCost: totalCost,
totalValue: totalValue
};
}
function calculateCustomerSale() {
const quantity = parseFloat(document.getElementById('cust-quantity').value) || 0;
const date = document.getElementById('cust-date').value;
const store = document.getElementById('supply-store-value').value;
const costData = calculateSalesCost(store, quantity);
document.getElementById('cust-total-cost').textContent = safeNumber(costData?.totalCost, 0).toFixed(2);
document.getElementById('cust-total-value').textContent = safeNumber(costData?.totalValue, 0).toFixed(2);
document.getElementById('cust-profit').textContent = safeNumber((costData?.totalValue || 0) - (costData?.totalCost || 0), 0).toFixed(2);
if (date) {
let storeProduction = 0;
db.forEach(production => {
if (production.date === date && production.store === store) {
storeProduction += production.net || 0;
}
});
let storeReturns = 0;
stockReturns.forEach(returnEntry => {
if (returnEntry.date === date && returnEntry.store === store) {
storeReturns += returnEntry.quantity || 0;
}
});
let storeSales = 0;
customerSales.forEach(sale => {
if (sale.date === date && sale.supplyStore === store) {
storeSales += sale.quantity || 0;
}
});
const totalAvailable = storeProduction + storeReturns;
const availableInventory = totalAvailable - storeSales;
const inventoryWarning = document.getElementById('inventory-warning') || createInventoryWarningElement();
if (quantity > availableInventory) {
inventoryWarning.innerHTML = ` Warning: Only ${safeNumber(availableInventory, 0).toFixed(2)} kg available.<br><small>Production: ${safeNumber(storeProduction, 0).toFixed(2)} kg + Returns: ${safeNumber(storeReturns, 0).toFixed(2)} kg = ${safeNumber(totalAvailable, 0).toFixed(2)} kg total</small>`;
inventoryWarning.style.display = 'block';
inventoryWarning.style.color = 'var(--danger)';
inventoryWarning.style.background = 'rgba(220, 38, 38, 0.1)';
} else if (availableInventory < (quantity * 1.5)) {
inventoryWarning.innerHTML = ` Inventory: ${safeNumber(availableInventory, 0).toFixed(2)} kg available (${safeNumber(availableInventory - quantity, 0).toFixed(2)} kg remaining)<br><small>Production: ${safeNumber(storeProduction, 0).toFixed(2)} kg + Returns: ${safeNumber(storeReturns, 0).toFixed(2)} kg</small>`;
inventoryWarning.style.display = 'block';
inventoryWarning.style.color = 'var(--warning)';
inventoryWarning.style.background = 'rgba(245, 158, 11, 0.1)';
} else {
inventoryWarning.innerHTML = ` Inventory: ${safeNumber(availableInventory, 0).toFixed(2)} kg available<br><small>Production: ${safeNumber(storeProduction, 0).toFixed(2)} kg + Returns: ${safeNumber(storeReturns, 0).toFixed(2)} kg = ${safeNumber(totalAvailable, 0).toFixed(2)} kg total</small>`;
inventoryWarning.style.display = 'block';
inventoryWarning.style.color = 'var(--accent-emerald)';
inventoryWarning.style.background = 'rgba(5, 150, 105, 0.1)';
}
}
}
function selectSalesRep(btn, value) {
document.querySelectorAll('#sales-rep-toggle-group .toggle-opt').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.getElementById('sales-rep-value').value = value;
autoFillCustomerName();
}
function selectSupplyStore(btn, value) {
document.querySelectorAll('#btn-supply-store-a, #btn-supply-store-b, #btn-supply-store-c').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.getElementById('supply-store-value').value = value;
calculateCustomerSale();
}
function selectPaymentType(btn, value) {
if (!btn) return;
document.querySelectorAll('#btn-payment-cash, #btn-payment-credit').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.getElementById('payment-type-value').value = value;
}
function selectRepPaymentType(btn, value) {
document.querySelectorAll('#btn-rep-pay-credit, #btn-rep-pay-cash').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.getElementById('rep-payment-value').value = value;
calculateRepSalePreview();
}
function autoFillCustomerName() {
const salesRepValue = document.getElementById('sales-rep-value').value;
const nameInput = document.getElementById('cust-name');
if (salesRepValue === 'NONE') {
nameInput.value = '';
nameInput.placeholder = "Enter Customer Name";
nameInput.readOnly = false;
const cashBtn = document.getElementById('btn-payment-cash');
const creditBtn = document.getElementById('btn-payment-credit');
if (cashBtn) { cashBtn.disabled = false; selectPaymentType(cashBtn, 'CASH'); }
if (creditBtn) creditBtn.disabled = false;
} else {
nameInput.value = salesRepValue;
nameInput.readOnly = true;
const cashBtn = document.getElementById('btn-payment-cash');
const creditBtn = document.getElementById('btn-payment-credit');
if (creditBtn) selectPaymentType(creditBtn, 'CREDIT');
if (cashBtn) cashBtn.disabled = true;
}
if (nameInput.value) {
calculateCustomerStatsForDisplay(nameInput.value);
} else {
const infoDisplay = document.getElementById('customer-info-display');
if (infoDisplay) {
infoDisplay.classList.add('hidden');
}
}
}
function createInventoryWarningElement() {
const warningDiv = document.createElement('div');
warningDiv.id = 'inventory-warning';
warningDiv.style.fontSize = '0.8rem';
warningDiv.style.marginTop = '8px';
warningDiv.style.padding = '6px';
warningDiv.style.borderRadius = '6px';
warningDiv.style.display = 'none';
const salesSection = document.querySelector('#tab-sales .section.liquid-card');
const calculateButton = salesSection.querySelector('.btn-main');
salesSection.insertBefore(warningDiv, calculateButton);
return warningDiv;
}
async function deleteCustomerSale(id) {
if (!id || !validateUUID(id)) {
showToast(' Invalid transaction ID. Cannot delete.', 'error');
return;
}
const recordToDelete = customerSales.find(item => item.id === id);
if (!recordToDelete) {
await refreshCustomerSales();
renderCustomersTable();
return;
}
if (recordToDelete.isMerged) {
showToast('Merged opening balance records cannot be deleted', 'warning');
return;
}
const recordTime = getRecordTimestamp(recordToDelete);
const recordDate = recordToDelete.date || 'Unknown date';
const _dcStoreLabel = recordToDelete.supplyStore ? getStoreLabel(recordToDelete.supplyStore) : '';
const _dcIsCredit = recordToDelete.paymentType === 'CREDIT';
const _dcIsPaid = _dcIsCredit && recordToDelete.creditReceived;
const _dcPartialPaid = recordToDelete.partialPaymentReceived || 0;
const _dcPayLabel = _dcIsCredit ? 'Credit Sale' : 'Cash Sale';
let _dcMsg = `Permanently delete this ${_dcPayLabel}?`;
_dcMsg += `\nCustomer: ${recordToDelete.customerName || 'Unknown'}`;
_dcMsg += `\nDate: ${recordDate}`;
_dcMsg += `\nQty: ${recordToDelete.quantity || 0} kg`;
if (recordToDelete.totalValue) _dcMsg += `\nValue: ${(recordToDelete.totalValue||0).toFixed(2)}`;
if (_dcStoreLabel) _dcMsg += `\nStore: ${_dcStoreLabel}`;
if (_dcIsCredit) {
if (_dcIsPaid) _dcMsg += `\n\n\u2714 This sale is already marked PAID. Deleting will erase the payment record from the customer's history.`;
else if (_dcPartialPaid > 0) _dcMsg += `\n\n\u26a0 ${_dcPartialPaid.toFixed(2)} partially collected. Deleting will erase both the sale and the partial payment.`;
else _dcMsg += `\n\n\u26a0 This credit sale is UNPAID. Deleting will permanently remove the outstanding balance of ${(recordToDelete.totalValue||0).toFixed(2)} from this customer's account.`;
} else {
_dcMsg += `\n\n\u21a9 ${(recordToDelete.quantity||0).toFixed(2)} kg will be restored to ${recordDate} inventory.`;
}
_dcMsg += `\n\nThis cannot be undone.`;
if (await showGlassConfirm(_dcMsg, { title: `Delete ${_dcPayLabel}`, confirmText: "Delete", danger: true })) {
try {
await registerDeletion(id, 'sales');
const originalLength = customerSales.length;
customerSales = customerSales.filter(item => item.id !== id);
if (customerSales.length === originalLength) {
throw new Error('Record not found or not deleted');
}
await saveWithTracking('customer_sales', customerSales);
await deleteRecordFromFirestore('customer_sales', id);
await refreshCustomerSales();
calculateNetCash();
calculateCashTracker();
renderCustomersTable();
if (currentManagingCustomer && typeof renderCustomerTransactions === 'function') {
await renderCustomerTransactions(currentManagingCustomer);
}
notifyDataChange('sales');
triggerAutoSync();
emitSyncUpdate({ customer_sales: customerSales });
showToast(` Sale deleted! ${recordToDelete.quantity} kg restored to ${recordDate} inventory.`, "success");
} catch (error) {
showToast(" Failed to delete sale. Please try again.", "error");
}
}
}
function calculateSales() {
const seller = document.getElementById('sellerSelect').value;
const costPerKg = getCostPriceForStore('STORE_A'); 
const salePrice = getSalePriceForStore('STORE_A'); 
const sold = parseFloat(document.getElementById('totalSold').value) || 0;
const ret = parseFloat(document.getElementById('returnedQuantity').value) || 0;
const cred = parseFloat(document.getElementById('creditSales').value) || 0;
const prev = parseFloat(document.getElementById('prevCreditReceived').value) || 0;
const rec = parseFloat(document.getElementById('receivedCash').value) || 0;
const netSold = Math.max(0, sold - ret);
const cashQty = Math.max(0, netSold - cred);
const expected = (cashQty * salePrice) + prev;
document.getElementById('totalExpectedCash').textContent = safeValue(expected).toFixed(2);
const diff = rec - expected;
const box = document.getElementById('discrepancyBox');
const _discEl = document.getElementById('discrepancyStatus');
if(Math.abs(diff) < 0.01) {
if (box) box.className = 'result-box discrepancy-ok';
if (_discEl) _discEl.innerText = "PERFECT MATCH ";
} else if(diff < -0.01) {
if (box) box.className = 'result-box discrepancy-alert';
if (_discEl) _discEl.innerText = `SHORT: ${Math.abs(diff).toFixed(2)}`;
} else {
if (box) box.className = 'result-box discrepancy-ok';
if (_discEl) _discEl.innerText = `OVER: ${safeNumber(diff, 0).toFixed(2)}`;
}
}

const firebaseConfig = {
  apiKey: "AIzaSyDd-lV05JevXqE5-on_PFkF-nlwKK5GcTw",
  authDomain: "gull-and-zubair-3207d.firebaseapp.com",
  databaseURL: "https://gull-and-zubair-3207d-default-rtdb.firebaseio.com",
  projectId: "gull-and-zubair-3207d",
  storageBucket: "gull-and-zubair-3207d.firebasestorage.app",
  messagingSenderId: "843533993616",
  appId: "1:843533993616:web:951d968f33fd39a39bba15"
};
function loadFirestoreStats() {
const saved = localStorage.getItem('firestoreStats');
if (saved) {
try {
firestoreStats = JSON.parse(saved);
if (!firestoreStats.lastReset) {
firestoreStats.lastReset = Date.now();
}
checkAndAutoResetFirestoreStats();
} catch (e) {
firestoreStats = {
reads: 0,
writes: 0,
history: [],
lastReset: Date.now()
};
}
} else {
firestoreStats = {
reads: 0,
writes: 0,
history: [],
lastReset: Date.now()
};
}
}
function saveFirestoreStats() {
try {
localStorage.setItem('firestoreStats', JSON.stringify(firestoreStats));
} catch (e) {
console.error('Firebase operation failed.', e);
showToast('Firebase operation failed.', 'error');
}
}
let firestoreStats = {
reads: 0,
writes: 0,
history: [],
lastReset: Date.now()
};
let firestoreUsageChart = null;
function checkAndAutoResetFirestoreStats() {
const now = Date.now();
const hoursSinceReset = (now - firestoreStats.lastReset) / (1000 * 60 * 60);
if (hoursSinceReset >= 24) {
firestoreStats.reads = 0;
firestoreStats.writes = 0;
firestoreStats.history = [];
firestoreStats.lastReset = now;
saveFirestoreStats();
updateFirestoreDisplay();
if (firestoreUsageChart) {
firestoreUsageChart.data.labels = [];
firestoreUsageChart.data.datasets[0].data = [];
firestoreUsageChart.data.datasets[1].data = [];
firestoreUsageChart.update();
}
}
}
function initFirestoreUsageChart() {
const canvas = document.getElementById('firestoreUsageChart');
if (!canvas) {
return;
}
if (!(canvas instanceof HTMLCanvasElement)) {
return;
}
const ctx = canvas.getContext('2d');
if (!ctx) {
return;
}
firestoreUsageChart = new Chart(ctx, {
type: 'line',
data: {
labels: [],
datasets: [
{
label: 'Reads',
data: [],
borderColor: '#30d158',
backgroundColor: 'rgba(48, 209, 88, 0.1)',
tension: 0.4,
fill: true
},
{
label: 'Writes',
data: [],
borderColor: '#007aff',
backgroundColor: 'rgba(0, 122, 255, 0.1)',
tension: 0.4,
fill: true
}
]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: {
display: false
}
},
scales: {
y: {
beginAtZero: true,
ticks: {
color: 'var(--text-muted)',
font: { size: 10 }
},
grid: {
color: 'rgba(255, 255, 255, 0.05)'
}
},
x: {
ticks: {
color: 'var(--text-muted)',
font: { size: 9 }
},
grid: {
color: 'rgba(255, 255, 255, 0.05)'
}
}
}
}
});
}

const FIRESTORE_THRESHOLDS = {
  reads:  { warn: 40000, critical: 48000 },
  writes: { warn: 16000, critical: 19000 },
  _alerted: { reads_warn: false, reads_critical: false, writes_warn: false, writes_critical: false }
};
function _checkFirestoreCostThresholds() {
  const r = firestoreStats.reads;
  const w = firestoreStats.writes;
  if (r >= FIRESTORE_THRESHOLDS.reads.critical && !FIRESTORE_THRESHOLDS._alerted.reads_critical) {
    FIRESTORE_THRESHOLDS._alerted.reads_critical = true;
    showToast('\uD83D\uDD34 Firestore reads at ' + r.toLocaleString() + ' today \u2014 approaching the 50\u202f000/day free-tier limit', 'error', 8000);
  } else if (r >= FIRESTORE_THRESHOLDS.reads.warn && !FIRESTORE_THRESHOLDS._alerted.reads_warn) {
    FIRESTORE_THRESHOLDS._alerted.reads_warn = true;
    showToast('\u26A0\uFE0F Firestore reads at ' + r.toLocaleString() + ' today \u2014 80\u202f% of 50\u202f000/day free tier used', 'warning', 6000);
  }
  if (w >= FIRESTORE_THRESHOLDS.writes.critical && !FIRESTORE_THRESHOLDS._alerted.writes_critical) {
    FIRESTORE_THRESHOLDS._alerted.writes_critical = true;
    showToast('\uD83D\uDD34 Firestore writes at ' + w.toLocaleString() + ' today \u2014 approaching the 20\u202f000/day free-tier limit', 'error', 8000);
  } else if (w >= FIRESTORE_THRESHOLDS.writes.warn && !FIRESTORE_THRESHOLDS._alerted.writes_warn) {
    FIRESTORE_THRESHOLDS._alerted.writes_warn = true;
    showToast('\u26A0\uFE0F Firestore writes at ' + w.toLocaleString() + ' today \u2014 80\u202f% of 20\u202f000/day free tier used', 'warning', 6000);
  }
}

function buildFirestoreCostEstimate(estimatedReads, estimatedWrites) {
  const totalR = firestoreStats.reads  + estimatedReads;
  const totalW = firestoreStats.writes + estimatedWrites;
  const lines = [
    'Estimated Firestore operations for this action:',
    '  \u2022 Reads : ~' + estimatedReads.toLocaleString()  + '  (daily total after: ' + totalR.toLocaleString() + ' / 50\u202f000 free)',
    '  \u2022 Writes: ~' + estimatedWrites.toLocaleString() + '  (daily total after: ' + totalW.toLocaleString() + ' / 20\u202f000 free)'
  ];
  if (totalR > FIRESTORE_THRESHOLDS.reads.warn || totalW > FIRESTORE_THRESHOLDS.writes.warn) {
    lines.push('\n\u26A0\uFE0F This will push your daily usage above 80\u202f% of the free-tier limit.');
  }
  return lines.join('\n');
}
function trackFirestoreRead(count = 1) {
checkAndAutoResetFirestoreStats();
firestoreStats.reads += count;
saveFirestoreStats();
updateFirestoreDisplay();
_checkFirestoreCostThresholds();
}
function trackFirestoreWrite(count = 1) {
checkAndAutoResetFirestoreStats();
firestoreStats.writes += count;
saveFirestoreStats();
updateFirestoreDisplay();
_checkFirestoreCostThresholds();
}
function updateFirestoreDisplay() {
const readsEl = document.getElementById('firestore-reads-count');
const writesEl = document.getElementById('firestore-writes-count');
if (readsEl) readsEl.textContent = firestoreStats.reads;
if (writesEl) writesEl.textContent = firestoreStats.writes;
if ((firestoreStats.reads + firestoreStats.writes) % 10 === 0) {
updateFirestoreChart();
}
}
function updateFirestoreChart() {
if (!firestoreUsageChart) return;
const now = new Date();
const timeLabel = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
firestoreUsageChart.data.labels.push(timeLabel);
firestoreUsageChart.data.datasets[0].data.push(firestoreStats.reads);
firestoreUsageChart.data.datasets[1].data.push(firestoreStats.writes);
if (firestoreUsageChart.data.labels.length > 10) {
firestoreUsageChart.data.labels.shift();
firestoreUsageChart.data.datasets[0].data.shift();
firestoreUsageChart.data.datasets[1].data.shift();
}
firestoreUsageChart.update();
}
function resetFirestoreStats() {
firestoreStats = { reads: 0, writes: 0, history: [], lastReset: Date.now() };
updateFirestoreDisplay();
if (firestoreUsageChart) {
firestoreUsageChart.data.labels = [];
firestoreUsageChart.data.datasets[0].data = [];
firestoreUsageChart.data.datasets[1].data = [];
firestoreUsageChart.update();
}
}
const originalOpenDataMenu = window.openDataMenu;
window.openDataMenu = function() {
if (typeof originalOpenDataMenu === 'function') {
originalOpenDataMenu();
} else {
document.getElementById('dataMenuOverlay').style.display = 'flex';
}
setTimeout(async () => {
if (!firestoreUsageChart) {
await loadChartJs();
initFirestoreUsageChart();
}
}, 100);
};
