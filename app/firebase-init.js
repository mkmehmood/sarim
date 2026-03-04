class FirestoreDatabaseInitializer {
constructor(firebaseDB, currentUser) {
this.firebaseDB = firebaseDB;
this.currentUser = currentUser;
this.userRef = null;
this.results = {
success: [],
errors: []
};
this.timestamp = new Date().toISOString();
}
async initialize(silent = false) {
if (!this.firebaseDB || !this.currentUser) {
throw new Error('Firebase DB and Current User are required');
}
if (!silent) showToast('Setting up complete cloud database...', 'info');
this.userRef = this.firebaseDB.collection('users').doc(this.currentUser.uid);
try {
await this.createUserDocument();
await this.createDevicesCollection();
await this.createAccountCollection();
await this.createActivityLogCollection();
await this.createProductionCollection();
await this.createSalesCollections();
await this.createRepCollections();
await this.createPaymentCollections();
await this.createFactoryCollections();
await this.createExpenseCollections();
await this.createCalculatorCollection();
await this.createSettingsCollections();
await this.createContactCollections();
await this.createTeamSettingsDocument();
await this.createDeletionsCollection();
await this.createSyncUpdatesCollection();
await idb.set('firestore_initialized', true);
await idb.set('firestore_init_timestamp', Date.now());
if (!silent) showToast('Cloud database ready with all collections!', 'success');
return {
success: true,
results: this.results,
message: 'Firestore database initialized successfully with all 21 collections'
};
} catch (error) {
if (!silent) showToast(' Setup failed: ' + error.message, 'error');
return {
success: false,
error: error.message,
results: this.results
};
}
}
async createUserDocument() {
try {
await this.userRef.set({
uid: this.currentUser.uid,
email: this.currentUser.email || 'unknown@example.com',
displayName: this.currentUser.displayName || '',
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
isActive: true,
accountType: 'standard',
version: '2.0',
initialized: true
}, { merge: true });
this.results.success.push('users/document');
} catch (error) {
this.results.errors.push({ collection: 'users', error: error.message });
throw error;
}
}
async createDevicesCollection() {
try {
const deviceRef = this.userRef.collection('devices').doc('default_device');
await deviceRef.set({
deviceId: 'default_device',
deviceName: 'Default Device',
deviceType: 'desktop',
browser: navigator.userAgent || 'Unknown',
platform: navigator.platform || 'Unknown',
online: true,
lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
currentMode: 'admin',
assignedRep: null,
capabilities: {
canSync: true,
canReceiveCommands: true,
supportsBiometric: false,
supportsNotifications: false
},
totalSyncs: 0,
totalCommands: 0,
dataUsage: {
reads: 0,
writes: 0,
deletes: 0
}
});
this.results.success.push('devices');
} catch (error) {
this.results.errors.push({ collection: 'devices', error: error.message });
}
}
async createAccountCollection() {
try {
const infoRef = this.userRef.collection('account').doc('info');
await infoRef.set({
email: this.currentUser.email || 'unknown@example.com',
displayName: this.currentUser.displayName || 'User',
accountCreated: firebase.firestore.FieldValue.serverTimestamp(),
lastActivity: firebase.firestore.FieldValue.serverTimestamp()
});
const preferencesRef = this.userRef.collection('account').doc('preferences');
await preferencesRef.set({
defaultRepProfile: salesRepsList[0] || 'NORAN SHAH',
timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
language: navigator.language || 'en',
theme: 'dark',
currency: 'PKR'
});
this.results.success.push('account');
} catch (error) {
this.results.errors.push({ collection: 'account', error: error.message });
}
}
async createActivityLogCollection() {
try {
const activityRef = this.userRef.collection('activityLog').doc('initial');
await activityRef.set({
timestamp: firebase.firestore.FieldValue.serverTimestamp(),
deviceId: 'default_device',
activityType: 'account_initialized',
details: {
message: 'Firestore database initialized with complete structure'
},
userId: this.currentUser.uid
});
this.results.success.push('activityLog');
} catch (error) {
this.results.errors.push({ collection: 'activityLog', error: error.message });
}
}
async createProductionCollection() {
try {
const placeholderRef = this.userRef.collection('production').doc('_placeholder_');
await placeholderRef.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Production collection initialized'
});
this.results.success.push('production');
} catch (error) {
this.results.errors.push({ collection: 'production', error: error.message });
}
}
async createSalesCollections() {
try {
const salesPlaceholder = this.userRef.collection('sales').doc('_placeholder_');
await salesPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Sales collection initialized'
});
const customerSalesPlaceholder = this.userRef.collection('customer_sales').doc('_placeholder_');
await customerSalesPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Customer sales collection initialized'
});
this.results.success.push('sales');
this.results.success.push('customer_sales');
} catch (error) {
this.results.errors.push({ collection: 'sales', error: error.message });
}
}
async createRepCollections() {
try {
const repSalesPlaceholder = this.userRef.collection('rep_sales').doc('_placeholder_');
await repSalesPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Rep sales collection initialized'
});
const repCustomersPlaceholder = this.userRef.collection('rep_customers').doc('_placeholder_');
await repCustomersPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Rep customers collection initialized'
});
this.results.success.push('rep_sales');
this.results.success.push('rep_customers');
} catch (error) {
this.results.errors.push({ collection: 'rep_sales', error: error.message });
}
}
async createPaymentCollections() {
try {
const transactionsPlaceholder = this.userRef.collection('transactions').doc('_placeholder_');
await transactionsPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Transactions collection initialized'
});
const entitiesPlaceholder = this.userRef.collection('entities').doc('_placeholder_');
await entitiesPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Entities collection initialized'
});
this.results.success.push('transactions');
this.results.success.push('entities');
} catch (error) {
this.results.errors.push({ collection: 'transactions', error: error.message });
}
}
async createFactoryCollections() {
try {
const inventoryPlaceholder = this.userRef.collection('inventory').doc('_placeholder_');
await inventoryPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Inventory collection initialized'
});
const factoryHistoryPlaceholder = this.userRef.collection('factory_history').doc('_placeholder_');
await factoryHistoryPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Factory history collection initialized'
});
this.results.success.push('inventory');
this.results.success.push('factory_history');
} catch (error) {
this.results.errors.push({ collection: 'inventory', error: error.message });
}
}
async createExpenseCollections() {
try {
const expensesPlaceholder = this.userRef.collection('expenses').doc('_placeholder_');
await expensesPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Expenses collection initialized'
});
const returnsPlaceholder = this.userRef.collection('returns').doc('_placeholder_');
await returnsPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Returns collection initialized'
});
this.results.success.push('expenses');
this.results.success.push('returns');
} catch (error) {
this.results.errors.push({ collection: 'expenses', error: error.message });
}
}
async createCalculatorCollection() {
try {
const calculatorPlaceholder = this.userRef.collection('calculator_history').doc('_placeholder_');
await calculatorPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Calculator history collection initialized'
});
this.results.success.push('calculator_history');
} catch (error) {
this.results.errors.push({ collection: 'calculator_history', error: error.message });
}
}
async createSettingsCollections() {
try {
const settingsRef = this.userRef.collection('settings').doc('config');
await settingsRef.set({
naswar_default_settings: {},
appMode: 'admin',
repProfile: salesRepsList[0] || 'NORAN SHAH',
theme: 'dark',
biometricEnabled: false,
lastSync: null,
initialized_at: this.timestamp,
last_synced: this.timestamp,
version: '2.0'
});
const factorySettingsRef = this.userRef.collection('factorySettings').doc('config');
await factorySettingsRef.set({
default_formulas: { standard: [], asaan: [] },
default_formulas_timestamp: Date.now(),
additional_costs: { standard: 0, asaan: 0 },
additional_costs_timestamp: Date.now(),
cost_adjustment_factor: { standard: 1, asaan: 1 },
cost_adjustment_factor_timestamp: Date.now(),
sale_prices: { standard: 0, asaan: 0 },
sale_prices_timestamp: Date.now(),
unit_tracking: {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
},
unit_tracking_timestamp: Date.now(),
last_synced: this.timestamp
});
const expenseCategoriesRef = this.userRef.collection('expenseCategories').doc('categories');
await expenseCategoriesRef.set({
categories: [
{ id: 'operating', name: 'Operating Expense', color: '#3b82f6' },
{ id: 'IN', name: 'Payment IN', color: '#10b981' },
{ id: 'OUT', name: 'Payment OUT', color: '#ef4444' }
],
last_synced: this.timestamp
});
this.results.success.push('settings');
this.results.success.push('factorySettings');
this.results.success.push('expenseCategories');
} catch (error) {
this.results.errors.push({ collection: 'settings', error: error.message });
}
}
async createContactCollections() {
try {
const repContactsPlaceholder = this.userRef.collection('rep_customers').doc('_placeholder_');
await repContactsPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Rep customers collection initialized'
});
const salesContactsPlaceholder = this.userRef.collection('sales_customers').doc('_placeholder_');
await salesContactsPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Sales customers collection initialized'
});
this.results.success.push('rep_customers');
this.results.success.push('sales_customers');
} catch (error) {
this.results.errors.push({ collection: 'rep_customers', error: error.message });
}
}
async createTeamSettingsDocument() {
try {
const teamRef = this.userRef.collection('settings').doc('team');
await teamRef.set({
sales_reps: [],
user_roles: [],
updated_at: 0,
last_synced: this.timestamp,
initialized: true
});
this.results.success.push('settings/team');
} catch (error) {
this.results.errors.push({ collection: 'settings/team', error: error.message });
}
}
async createDeletionsCollection() {
try {
const deletionsPlaceholder = this.userRef.collection('deletions').doc('_placeholder_');
await deletionsPlaceholder.set({
_placeholder: true,
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
type: 'placeholder',
message: 'Deletions collection initialized'
});
this.results.success.push('deletions');
} catch (error) {
this.results.errors.push({ collection: 'deletions', error: error.message });
}
}
async createSyncUpdatesCollection() {
try {
const syncUpdateRef = this.userRef.collection('sync_updates').doc('initial');
await syncUpdateRef.set({
timestamp: firebase.firestore.FieldValue.serverTimestamp(),
deviceId: 'default_device',
collections: ['all'],
type: 'initialization',
message: 'Database initialized with complete structure'
});
this.results.success.push('sync_updates');
} catch (error) {
this.results.errors.push({ collection: 'sync_updates', error: error.message });
}
}
}
async function initializeCompleteFirestoreDatabase(silent = false) {
if (!firebaseDB || !currentUser) {
if (!silent) showToast('Please log in first', 'warning');
return { success: false, error: 'Not logged in' };
}
const initializer = new FirestoreDatabaseInitializer(firebaseDB, currentUser);
return await initializer.initialize(silent);
}
async function isCompleteDatabaseInitialized() {
if (!firebaseDB || !currentUser) return false;
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const requiredCollections = [
'devices', 'account', 'activityLog', 'production', 'sales',
'customer_sales', 'rep_sales', 'rep_customers',
'sales_customers',
'transactions', 'entities', 'inventory', 'factory_history', 'expenses', 'returns',
'calculator_history', 'settings', 'factorySettings', 'expenseCategories',
'deletions', 'sync_updates'
];
const checks = await Promise.all(
requiredCollections.map(async (coll) => {
const snapshot = await userRef.collection(coll).limit(1).get();
return { collection: coll, exists: !snapshot.empty };
})
);
const missing = checks.filter(c => !c.exists).map(c => c.collection);
if (missing.length > 0) {
return false;
}
return true;
} catch (error) {
return false;
}
}
async function safeInitializeCompleteDatabase(silent = false) {
const isInitialized = await isCompleteDatabaseInitialized();
if (isInitialized) {
return {
success: true,
alreadyInitialized: true,
message: 'Database was already initialized with complete structure'
};
}
return await initializeCompleteFirestoreDatabase(silent);
}
async function initializeFirestoreStructure(silent = false) {
return await initializeCompleteFirestoreDatabase(silent);
}
async function cleanupPlaceholders() {
if (!firebaseDB || !currentUser) return false;
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const batch = firebaseDB.batch();
const collections = [
'devices', 'account', 'activityLog',
'production', 'sales', 'customer_sales',
'rep_sales', 'rep_customers',
'sales_customers',
'transactions', 'entities',
'inventory', 'factory_history',
'expenses', 'returns',
'calculator_history',
'settings', 'factorySettings', 'expenseCategories',
'deletions', 'sync_updates'
];
let deleteCount = 0;
for (const collectionName of collections) {
const placeholderRef = userRef.collection(collectionName).doc('_placeholder_');
const doc = await placeholderRef.get();
if (doc.exists) {
batch.delete(placeholderRef);
deleteCount++;
}
}
if (deleteCount > 0) {
await batch.commit();
}
return true;
} catch (error) {
return false;
}
}
async function isUserInitialized() {
if (!firebaseDB || !currentUser) return false;
try {
return await isCompleteDatabaseInitialized();
} catch (error) {
return false;
}
}
function retryFirebaseInit(attempts = 0, maxAttempts = 5) {
const success = initializeFirebase();
if (success) {
return;
}
if (attempts < maxAttempts) {
const delay = Math.min(1000 * Math.pow(2, attempts), 5000);
setTimeout(() => retryFirebaseInit(attempts + 1, maxAttempts), delay);
} else {
const indicator = document.getElementById('connection-indicator');
if (indicator) {
indicator.title = 'Firebase failed to load - check console';
indicator.style.background = 'red';
}
if (typeof showToast === 'function') {
showToast(' Cloud sync unavailable. App will work offline.', 'warning');
}
}
}
let realtimeRefs = [];
let socketReconnectTimer = null;
let pendingSocketUpdate = false;
let socketDebounceTimer = null;
let dbWakeUpAttempted = false;
let heartbeatInterval = null;
let autoSaveTimer = null;
let broadcastQueue = [];
let listenerRetryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 5000;
let listenerReconnectTimer = null;
let lastSuccessfulConnection = Date.now();
let isReconnecting = false;
let _syncLockPendingQueue = [];
function _enqueueSyncLocked(handlerFn, snapshot) {
const existing = _syncLockPendingQueue.findIndex(e => e.handlerFn === handlerFn);
if (existing !== -1) {
_syncLockPendingQueue[existing].snapshot = snapshot;
} else {
_syncLockPendingQueue.push({ handlerFn, snapshot });
}
}
async function _flushSyncLockQueue() {
if (_syncLockPendingQueue.length === 0) return;
const queued = _syncLockPendingQueue.splice(0);
for (const entry of queued) {
try {
await entry.handlerFn(entry.snapshot);
} catch (err) {
console.warn('[SyncLock] Error replaying buffered snapshot', err);
}
}
}
function updateSignal(status) {
updateSignalUI(status);
}
function updateSignalUI(status) {
const dot = document.getElementById('connection-indicator');
if (!dot) return;
dot.className = '';
if (status === 'online') {
dot.classList.add('signal-online');
dot.title = 'Live Connection Active';
} else if (status === 'connecting') {
dot.classList.add('signal-connecting');
dot.title = 'Connecting...';
} else if (status === 'error') {
dot.classList.add('signal-connecting');
dot.title = 'Connection Error — Reconnecting...';
} else {
dot.classList.add('signal-offline');
dot.title = 'Offline / Disconnected';
}
}
let syncChannel = null;
try {
syncChannel = new BroadcastChannel('data-sync-channel');
syncChannel.onmessage = async (event) => {
const { type, collections, timestamp, senderId } = event.data;
if (senderId && senderId === window._selfSenderId) {
return;
}
if (type === 'data-update' && collections) {
for (const collectionName of collections) {
try {
const data = await idb.get(collectionName);
switch(collectionName) {
case 'mfg_pro_pkr':
db = data || [];
break;
case 'customer_sales':
customerSales = data || [];
break;
case 'rep_sales':
repSales = data || [];
break;
case 'rep_customers':
repCustomers = data || [];
break;
case 'sales_customers':
salesCustomers = data || [];
break;
case 'noman_history':
salesHistory = data || [];
break;
case 'factory_inventory_data':
factoryInventoryData = data || [];
break;
case 'factory_production_history':
factoryProductionHistory = data || [];
break;
case 'payment_entities':
paymentEntities = data || [];
break;
case 'payment_transactions':
paymentTransactions = data || [];
break;
case 'expenses':
expenseRecords = data || [];
break;
case 'stock_returns':
stockReturns = data || [];
break;
case 'settings': {
const settingsData = await idb.get('naswar_default_settings');
if (settingsData !== undefined && settingsData !== null) {
defaultSettings = settingsData;
}
break;
}
case 'factorySettings': {
const fs = await idb.get('factory_default_formulas');
if (fs !== undefined && fs !== null) factoryDefaultFormulas = fs;
const ac = await idb.get('factory_additional_costs');
if (ac !== undefined && ac !== null) factoryAdditionalCosts = ac;
const caf = await idb.get('factory_cost_adjustment_factor');
if (caf !== undefined && caf !== null) factoryCostAdjustmentFactor = caf;
const sp = await idb.get('factory_sale_prices');
if (sp !== undefined && sp !== null) factorySalePrices = sp;
const ut = await idb.get('factory_unit_tracking');
if (ut !== undefined && ut !== null) factoryUnitTracking = ut;
break;
}
case 'expenseCategories': {
const cats = await idb.get('expense_categories');
if (Array.isArray(cats)) expenseCategories = cats;
break;
}
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
if (typeof invalidateAllCaches === 'function') await invalidateAllCaches();
if (typeof refreshAllDisplays === 'function') await refreshAllDisplays();
flashLivePulse();
showToast('Data synced from another device', 'success');
}
};
} catch (e) {
console.warn('BroadcastChannel not supported or failed to initialize:', e);
}
function flashLivePulse() {
const dot = document.getElementById('connection-indicator');
if (!dot) return;
dot.style.transform = 'scale(1.8)';
dot.style.boxShadow = '0 0 20px #10b981';
setTimeout(() => {
dot.style.transform = '';
dot.style.boxShadow = '';
}, 300);
}
async function emitSyncUpdate(payload) {
if (!firebaseDB || !currentUser) return;
flashLivePulse();
if (payload && typeof payload === 'object') {
const changedKeys = Object.keys(payload);
if (syncChannel) {
try {
if (!window._selfSenderId) {
window._selfSenderId = Date.now().toString(36) + Math.random().toString(36).slice(2);
}
syncChannel.postMessage({
type: 'data-update',
collections: changedKeys,
timestamp: Date.now(),
senderId: window._selfSenderId
});
} catch (e) {
console.warn('BroadcastChannel postMessage failed', e);
}
}
}
}
function startSyncUpdatesCleanup() {
if (!firebaseDB || !currentUser) return;
const runCleanup = async () => {
if (!firebaseDB || !currentUser) return;
try {
const syncSnapshot = await firebaseDB
.collection('users').doc(currentUser.uid)
.collection('sync_updates')
.orderBy('timestamp', 'desc')
.get();
if (syncSnapshot.docs.length > 10) {
const batch = firebaseDB.batch();
syncSnapshot.docs.slice(10).forEach(doc => batch.delete(doc.ref));
await batch.commit();
}
} catch (error) {
console.error('Cloud save operation failed.', error);
showToast('Cloud save operation failed.', 'error');
}
};
runCleanup();
if (window._syncUpdatesCleanupInterval) clearInterval(window._syncUpdatesCleanupInterval);
window._syncUpdatesCleanupInterval = setInterval(runCleanup, 60 * 60 * 1000);
}
function scheduleListenerReconnect() {
if (isReconnecting) {
return;
}
if (listenerReconnectTimer) {
clearTimeout(listenerReconnectTimer);
}
if (listenerRetryAttempts >= MAX_RETRY_ATTEMPTS) {
updateSignalUI('offline');
if (typeof showToast === 'function') {
showToast('Connection lost. Please refresh the page.', 'error');
}
return;
}
const delay = BASE_RETRY_DELAY * Math.pow(2, listenerRetryAttempts);
listenerRetryAttempts++;
isReconnecting = true;
listenerReconnectTimer = setTimeout(() => {
isReconnecting = false;
if (firebaseDB && currentUser) {
subscribeToRealtime();
}
}, delay);
}
function recordSuccessfulConnection() {
lastSuccessfulConnection = Date.now();
listenerRetryAttempts = 0;
isReconnecting = false;
}
function isConnectionStale() {
const timeSinceLastSuccess = Date.now() - lastSuccessfulConnection;
const staleThreshold = 5 * 60 * 1000;
return timeSinceLastSuccess > staleThreshold;
}
async function subscribeToRealtime() {
if (!firebaseDB || !currentUser) return;

if (!pendingFirestoreYearClose) {
  const storedFlag = await idb.get('pendingFirestoreYearClose');
  if (storedFlag === true) pendingFirestoreYearClose = true;
}
if (pendingFirestoreYearClose && !closeYearInProgress) {
  try {
    const userRef = firebaseDB.collection('users').doc(currentUser.uid);
    const collections = [
      { name: 'production',          data: db,                     filter: d => !d.isMerged },
      { name: 'sales',               data: customerSales,          filter: d => !d.isMerged },
      { name: 'rep_sales',           data: repSales,               filter: d => !d.isMerged },
      { name: 'calculator_history',  data: salesHistory,           filter: d => !d.isMerged },
      { name: 'transactions',        data: paymentTransactions,    filter: d => !d.isMerged },
      { name: 'factory_history',     data: factoryProductionHistory, filter: d => !d.isMerged },
      { name: 'expenses',            data: expenseRecords,         filter: d => !d.isMerged },
      { name: 'returns',             data: stockReturns,           filter: d => !d.isMerged }
    ];
    let allOk = true;
    for (const col of collections) {
      if (!Array.isArray(col.data)) continue;
      const merged = col.data.filter(r => r.isMerged === true);
      if (merged.length === 0) continue;
      const result = await _commitMergedBatch(userRef, col.name, merged, col.filter);
      if (!result.ok) { allOk = false; break; }
    }
    if (allOk) {
      pendingFirestoreYearClose = false;
      await idb.set('pendingFirestoreYearClose', false);
      showToast('Cloud sync for year-close completed successfully', 'success', 4000);
    }
  } catch (e) {
    console.warn('pendingFirestoreYearClose retry failed:', e);
  }
}
updateSignalUI('connecting');
realtimeRefs.forEach(unsub => {
try {
if (typeof unsub === 'function') unsub();
} catch (e) {
console.error('Firebase operation failed.', e);
showToast('Firebase operation failed.', 'error');
}
});
realtimeRefs = [];
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
try {
const updateArray = (array, docData, arrayName) => {
if (docData._placeholder || docData.id === '_placeholder_') return array;
const existingIndex = array.findIndex(item => item.id === docData.id);
if (existingIndex === -1) {
array.push(docData);
return array;
} else {
const getComparableTimestamp = (item) => {
const ts = item.updatedAt !== undefined ? item.updatedAt
          : item.timestamp !== undefined ? item.timestamp
          : item.createdAt;
if (!ts) return 0;
if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
if (ts instanceof Date) return ts.getTime();
if (typeof ts === 'number') return ts;
if (typeof ts === 'string') return new Date(ts).getTime();
return 0;
};
const localTimestamp = getComparableTimestamp(array[existingIndex]);
const cloudTimestamp = getComparableTimestamp(docData);
if (cloudTimestamp >= localTimestamp) {
array[existingIndex] = docData;
}
return array;
}
};
let productionQuery = userRef.collection('production');
const lastProductionSync = await DeltaSync.getLastSyncFirestoreTimestamp('production');
if (lastProductionSync) {
productionQuery = productionQuery.where('updatedAt', '>', lastProductionSync);
}
const _handleProductionSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
const changes = snapshot.docChanges();
if (changes.length === 0) return;
let hasChanges = false;
for (const change of changes) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
db = updateArray(db, docData, 'production');
hasChanges = true;
} else if (change.type === 'removed') {
db = db.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) {
console.warn('Firebase operation failed.', docError);
}
}
if (hasChanges) {
await idb.set('mfg_pro_pkr', db);
await DeltaSync.setLastSyncTimestamp('production');
emitSyncUpdate({ mfg_pro_pkr: db });
if (typeof syncProductionTab === 'function') syncProductionTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const productionUnsub = productionQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleProductionSnapshot, snapshot); return; }
await _handleProductionSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let salesQuery = userRef.collection('sales');
const lastSalesSync = await DeltaSync.getLastSyncFirestoreTimestamp('sales');
if (lastSalesSync) {
salesQuery = salesQuery.where('updatedAt', '>', lastSalesSync);
}
const _handleSalesSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
const changes = snapshot.docChanges();
if (changes.length === 0) return;
let hasChanges = false;
for (const change of changes) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
customerSales = updateArray(customerSales, docData, 'sale');
hasChanges = true;
} else if (change.type === 'removed') {
customerSales = customerSales.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) {
console.warn('Firebase operation failed.', docError);
}
}
if (hasChanges) {
await idb.set('customer_sales', customerSales);
await DeltaSync.setLastSyncTimestamp('sales');
emitSyncUpdate({ customer_sales: customerSales });
if (typeof syncSalesTab === 'function') syncSalesTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const salesUnsub = salesQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleSalesSnapshot, snapshot); return; }
await _handleSalesSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let repSalesQuery = userRef.collection('rep_sales');
const lastRepSalesSync = await DeltaSync.getLastSyncFirestoreTimestamp('rep_sales');
if (lastRepSalesSync) {
repSalesQuery = repSalesQuery.where('updatedAt', '>', lastRepSalesSync);
}
const _handleRepSalesSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
let hasChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
repSales = updateArray(repSales, docData, 'rep sale');
hasChanges = true;
} else if (change.type === 'removed') {
repSales = repSales.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) { console.warn('repSales doc error', docError); }
}
if (hasChanges) {
await idb.set('rep_sales', repSales);
await DeltaSync.setLastSyncTimestamp('rep_sales');
emitSyncUpdate({ rep_sales: repSales });
if (typeof syncRepTab === 'function') syncRepTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('repSales snapshot error', error);
}
};
const repSalesUnsub = repSalesQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleRepSalesSnapshot, snapshot); return; }
await _handleRepSalesSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let repCustomersQuery = userRef.collection('rep_customers');
const lastRepCustomersSync = await DeltaSync.getLastSyncFirestoreTimestamp('rep_customers');
if (lastRepCustomersSync) {
repCustomersQuery = repCustomersQuery.where('updatedAt', '>', lastRepCustomersSync);
}
const _handleRepCustomersSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
trackFirestoreRead(snapshot.docChanges().length);
let hasChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
repCustomers = updateArray(repCustomers, docData, 'rep customer');
hasChanges = true;
} else if (change.type === 'removed') {
repCustomers = repCustomers.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) { console.warn('repCustomers doc error', docError); }
}
if (hasChanges) {
await idb.set('rep_customers', repCustomers);
await DeltaSync.setLastSyncTimestamp('rep_customers');
emitSyncUpdate({ rep_customers: repCustomers });
if (typeof syncRepTab === 'function') syncRepTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('repCustomers snapshot error', error);
}
};
const repCustomersUnsub = repCustomersQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleRepCustomersSnapshot, snapshot); return; }
await _handleRepCustomersSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let transactionsQuery = userRef.collection('transactions');
const lastTransactionsSync = await DeltaSync.getLastSyncFirestoreTimestamp('transactions');
if (lastTransactionsSync) {
transactionsQuery = transactionsQuery.where('updatedAt', '>', lastTransactionsSync);
}
const _handleTransactionsSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
const changes = snapshot.docChanges();
if (changes.length === 0) return;
let hasChanges = false;
for (const change of changes) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
paymentTransactions = updateArray(paymentTransactions, docData, 'transaction');
hasChanges = true;
} else if (change.type === 'removed') {
paymentTransactions = paymentTransactions.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) {
console.warn('Payment transaction failed.', docError);
}
}
if (hasChanges) {
await idb.set('payment_transactions', paymentTransactions);
await DeltaSync.setLastSyncTimestamp('transactions');
emitSyncUpdate({ payment_transactions: paymentTransactions });
if (typeof syncPaymentsTab === 'function') syncPaymentsTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const transactionsUnsub = transactionsQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleTransactionsSnapshot, snapshot); return; }
await _handleTransactionsSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let entitiesQuery = userRef.collection('entities');
const lastEntitiesSync = await DeltaSync.getLastSyncFirestoreTimestamp('entities');
if (lastEntitiesSync) {
entitiesQuery = entitiesQuery.where('updatedAt', '>', lastEntitiesSync);
}
const _handleEntitiesSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
trackFirestoreRead(snapshot.docChanges().length);
let hasChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
paymentEntities = updateArray(paymentEntities, docData, 'entity');
hasChanges = true;
} else if (change.type === 'removed') {
paymentEntities = paymentEntities.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) { console.warn('entities doc error', docError); }
}
if (hasChanges) {
await idb.set('payment_entities', paymentEntities);
await DeltaSync.setLastSyncTimestamp('entities');
emitSyncUpdate({ payment_entities: paymentEntities });
if (typeof renderEntityTable === 'function') renderEntityTable();
if (typeof refreshPaymentTab === 'function') refreshPaymentTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('entities snapshot error', error);
}
};
const entitiesUnsub = entitiesQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleEntitiesSnapshot, snapshot); return; }
await _handleEntitiesSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let inventoryQuery = userRef.collection('inventory');
const lastInventorySync = await DeltaSync.getLastSyncFirestoreTimestamp('inventory');
if (lastInventorySync) {
inventoryQuery = inventoryQuery.where('updatedAt', '>', lastInventorySync);
}
const _handleInventorySnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
trackFirestoreRead(snapshot.docChanges().length);
let hasChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
factoryInventoryData = updateArray(factoryInventoryData, docData, 'inventory item');
hasChanges = true;
} else if (change.type === 'removed') {
factoryInventoryData = factoryInventoryData.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) { console.warn('inventory doc error', docError); }
}
if (hasChanges) {
await idb.set('factory_inventory_data', factoryInventoryData);
await DeltaSync.setLastSyncTimestamp('inventory');
emitSyncUpdate({ factory_inventory_data: factoryInventoryData });
if (typeof syncFactoryTab === 'function') syncFactoryTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('inventory snapshot error', error);
}
};
const inventoryUnsub = inventoryQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleInventorySnapshot, snapshot); return; }
await _handleInventorySnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let factoryHistoryQuery = userRef.collection('factory_history');
const lastFactoryHistorySync = await DeltaSync.getLastSyncFirestoreTimestamp('factory_history');
if (lastFactoryHistorySync) {
factoryHistoryQuery = factoryHistoryQuery.where('updatedAt', '>', lastFactoryHistorySync);
}
const _handleFactoryHistorySnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
let hasChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
factoryProductionHistory = updateArray(factoryProductionHistory, docData, 'factory history');
hasChanges = true;
} else if (change.type === 'removed') {
factoryProductionHistory = factoryProductionHistory.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) { console.warn('factoryHistory doc error', docError); }
}
if (hasChanges) {
await idb.set('factory_production_history', factoryProductionHistory);
await DeltaSync.setLastSyncTimestamp('factory_history');
emitSyncUpdate({ factory_production_history: factoryProductionHistory });
if (typeof syncFactoryTab === 'function') syncFactoryTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('factoryHistory snapshot error', error);
}
};
const factoryHistoryUnsub = factoryHistoryQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleFactoryHistorySnapshot, snapshot); return; }
await _handleFactoryHistorySnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let returnsQuery = userRef.collection('returns');
const lastReturnsSync = await DeltaSync.getLastSyncFirestoreTimestamp('returns');
if (lastReturnsSync) {
returnsQuery = returnsQuery.where('updatedAt', '>', lastReturnsSync);
}
const _handleReturnsSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
let hasChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
stockReturns = updateArray(stockReturns, docData, 'return');
hasChanges = true;
} else if (change.type === 'removed') {
stockReturns = stockReturns.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) { console.warn('returns doc error', docError); }
}
if (hasChanges) {
await idb.set('stock_returns', stockReturns);
await DeltaSync.setLastSyncTimestamp('returns');
emitSyncUpdate({ stock_returns: stockReturns });
if (typeof syncProductionTab === 'function') syncProductionTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('returns snapshot error', error);
}
};
const returnsUnsub = returnsQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleReturnsSnapshot, snapshot); return; }
await _handleReturnsSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let expensesQuery = userRef.collection('expenses');
const lastExpensesSync = await DeltaSync.getLastSyncFirestoreTimestamp('expenses');
if (lastExpensesSync) {
expensesQuery = expensesQuery.where('updatedAt', '>', lastExpensesSync);
}
const _handleExpensesSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
let hasExpenseChanges = false;
for (const change of snapshot.docChanges()) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
expenseRecords = updateArray(expenseRecords, docData, 'expense');
hasExpenseChanges = true;
} else if (change.type === 'removed') {
expenseRecords = expenseRecords.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasExpenseChanges = true;
}
} catch (docError) { console.warn('expenses doc error', docError); }
}
if (hasExpenseChanges) {
await idb.set('expenses', expenseRecords);
await DeltaSync.setLastSyncTimestamp('expenses');
emitSyncUpdate({ expenses: expenseRecords });
if (typeof refreshPaymentTab === 'function') refreshPaymentTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('expenses snapshot error', error);
}
};
const expensesUnsub = expensesQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleExpensesSnapshot, snapshot); return; }
await _handleExpensesSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
let calcHistoryQuery = userRef.collection('calculator_history');
const lastCalcHistorySync = await DeltaSync.getLastSyncFirestoreTimestamp('calculator_history');
if (lastCalcHistorySync) {
calcHistoryQuery = calcHistoryQuery.where('updatedAt', '>', lastCalcHistorySync);
}
const _handleCalcHistorySnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
if (closeYearInProgress) return; 
trackFirestoreRead(snapshot.docChanges().length);
const changes = snapshot.docChanges();
if (changes.length === 0) return;
let hasChanges = false;
for (const change of changes) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
salesHistory = updateArray(salesHistory, docData, 'calc history');
hasChanges = true;
} else if (change.type === 'removed') {
salesHistory = salesHistory.filter(item => item.id !== change.doc.id);
deletedRecordIds.add(change.doc.id);
hasChanges = true;
}
} catch (docError) {
console.warn('Firebase operation failed.', docError);
}
}
if (hasChanges) {
await idb.set('noman_history', salesHistory);
await DeltaSync.setLastSyncTimestamp('calculator_history');
emitSyncUpdate({ noman_history: salesHistory });
if (typeof syncCalculatorTab === 'function') syncCalculatorTab();
flashLivePulse();
}
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const calcHistoryUnsub = calcHistoryQuery.onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleCalcHistorySnapshot, snapshot); return; }
await _handleCalcHistorySnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
const _handleSettingsSnapshot = async (doc) => {
try {
if (!doc.exists || doc.metadata.hasPendingWrites) return;
if (doc.metadata.fromCache) return;
trackFirestoreRead(1);
const cloudSettings = doc.data();
if (!cloudSettings || typeof cloudSettings !== 'object') {
return;
}
let hasUpdates = false;
const timestampChecks = [
{ cloud: cloudSettings.naswar_default_settings_timestamp, local: await idb.get('naswar_default_settings_timestamp'), name: 'settings' },
{ cloud: cloudSettings.repProfile_timestamp, local: await idb.get('repProfile_timestamp'), name: 'repProfile' }
];
for (const check of timestampChecks) {
if ((check.cloud || 0) > (check.local || 0)) {
hasUpdates = true;
break;
}
}
if (!hasUpdates) {
return;
}
if (cloudSettings.naswar_default_settings) {
const cloudTimestamp = cloudSettings.naswar_default_settings_timestamp || 0;
const localTimestamp = (await idb.get('naswar_default_settings_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
defaultSettings = cloudSettings.naswar_default_settings;
await idb.setBatch([
['naswar_default_settings', defaultSettings],
['naswar_default_settings_timestamp', cloudTimestamp]
]);
}
}
if (cloudSettings.repProfile) {
const cloudTimestamp = cloudSettings.repProfile_timestamp || 0;
const localTimestamp = (await idb.get('repProfile_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
currentRepProfile = cloudSettings.repProfile;
await idb.setBatch([
['current_rep_profile', currentRepProfile],
['repProfile_timestamp', cloudTimestamp]
]);
}
}
if (cloudSettings.last_synced) {
await idb.set('last_synced', cloudSettings.last_synced);
}
emitSyncUpdate({ settings: cloudSettings });
flashLivePulse();
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const settingsUnsub = userRef.collection('settings').doc('config').onSnapshot(async (doc) => {
if (isSyncing) { _enqueueSyncLocked(_handleSettingsSnapshot, doc); return; }
await _handleSettingsSnapshot(doc);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
const _handleFactorySettingsSnapshot = async (doc) => {
try {
if (!doc.exists || doc.metadata.hasPendingWrites) return;
if (doc.metadata.fromCache) return;
trackFirestoreRead(1);
const cloudFactorySettings = doc.data();
if (!cloudFactorySettings || typeof cloudFactorySettings !== 'object') {
return;
}
let hasUpdates = false;
const timestampChecks = [
{ cloud: cloudFactorySettings.default_formulas_timestamp, local: await idb.get('factory_default_formulas_timestamp') },
{ cloud: cloudFactorySettings.additional_costs_timestamp, local: await idb.get('factory_additional_costs_timestamp') },
{ cloud: cloudFactorySettings.cost_adjustment_factor_timestamp, local: await idb.get('factory_cost_adjustment_factor_timestamp') },
{ cloud: cloudFactorySettings.sale_prices_timestamp, local: await idb.get('factory_sale_prices_timestamp') },
{ cloud: cloudFactorySettings.unit_tracking_timestamp, local: await idb.get('factory_unit_tracking_timestamp') }
];
for (const check of timestampChecks) {
if ((check.cloud || 0) > (check.local || 0)) {
hasUpdates = true;
break;
}
}
if (!hasUpdates) {
return;
}
if (cloudFactorySettings.default_formulas && typeof cloudFactorySettings.default_formulas === 'object') {
try {
const formulas = cloudFactorySettings.default_formulas;
if (('standard' in formulas) && ('asaan' in formulas)) {
const cloudTimestamp = cloudFactorySettings.default_formulas_timestamp || 0;
const localTimestamp = (await idb.get('factory_default_formulas_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
factoryDefaultFormulas = {
standard: Array.isArray(formulas.standard) ? formulas.standard : [],
asaan: Array.isArray(formulas.asaan) ? formulas.asaan : []
};
await idb.setBatch([
['factory_default_formulas', factoryDefaultFormulas],
['factory_default_formulas_timestamp', cloudTimestamp]
]);
refreshFactorySettingsOverlay();
}
} else {
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
if (cloudFactorySettings.additional_costs && typeof cloudFactorySettings.additional_costs === 'object') {
const costs = cloudFactorySettings.additional_costs;
if (('standard' in costs) && ('asaan' in costs)) {
const cloudTimestamp = cloudFactorySettings.additional_costs_timestamp || 0;
const localTimestamp = (await idb.get('factory_additional_costs_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
factoryAdditionalCosts = {
standard: parseFloat(costs.standard) || 0,
asaan: parseFloat(costs.asaan) || 0
};
await idb.setBatch([
['factory_additional_costs', factoryAdditionalCosts],
['factory_additional_costs_timestamp', cloudTimestamp]
]);
refreshFactorySettingsOverlay();
}
} else {
}
}
if (cloudFactorySettings.cost_adjustment_factor && typeof cloudFactorySettings.cost_adjustment_factor === 'object') {
const factor = cloudFactorySettings.cost_adjustment_factor;
if (('standard' in factor) && ('asaan' in factor)) {
const cloudTimestamp = cloudFactorySettings.cost_adjustment_factor_timestamp || 0;
const localTimestamp = (await idb.get('factory_cost_adjustment_factor_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
factoryCostAdjustmentFactor = {
standard: parseFloat(factor.standard) || 1,
asaan: parseFloat(factor.asaan) || 1
};
await idb.setBatch([
['factory_cost_adjustment_factor', factoryCostAdjustmentFactor],
['factory_cost_adjustment_factor_timestamp', cloudTimestamp]
]);
refreshFactorySettingsOverlay();
}
} else {
}
}
if (cloudFactorySettings.sale_prices && typeof cloudFactorySettings.sale_prices === 'object') {
const prices = cloudFactorySettings.sale_prices;
if (('standard' in prices) && ('asaan' in prices)) {
const cloudTimestamp = cloudFactorySettings.sale_prices_timestamp || 0;
const localTimestamp = (await idb.get('factory_sale_prices_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
factorySalePrices = {
standard: parseFloat(prices.standard) || 0,
asaan: parseFloat(prices.asaan) || 0
};
await idb.setBatch([
['factory_sale_prices', factorySalePrices],
['factory_sale_prices_timestamp', cloudTimestamp]
]);
refreshFactorySettingsOverlay();
}
} else {
}
}
if (cloudFactorySettings.unit_tracking && typeof cloudFactorySettings.unit_tracking === 'object') {
const tracking = cloudFactorySettings.unit_tracking;
if (('standard' in tracking) && ('asaan' in tracking)) {
const cloudTimestamp = cloudFactorySettings.unit_tracking_timestamp || 0;
const localTimestamp = (await idb.get('factory_unit_tracking_timestamp')) || 0;
if (cloudTimestamp > localTimestamp) {
factoryUnitTracking = {
standard: tracking.standard || { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: tracking.asaan || { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
await idb.setBatch([
['factory_unit_tracking', factoryUnitTracking],
['factory_unit_tracking_timestamp', cloudTimestamp]
]);
refreshFactorySettingsOverlay();
}
} else {
}
}
emitSyncUpdate({ factorySettings: cloudFactorySettings });
flashLivePulse();
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const factorySettingsUnsub = userRef.collection('factorySettings').doc('config').onSnapshot(async (doc) => {
if (isSyncing) { _enqueueSyncLocked(_handleFactorySettingsSnapshot, doc); return; }
await _handleFactorySettingsSnapshot(doc);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
const _handleExpenseCategoriesSnapshot = async (doc) => {
try {
if (!doc.exists || doc.metadata.hasPendingWrites) return;
if (doc.metadata.fromCache) return;
trackFirestoreRead(1);
const cloudExpenseCategories = doc.data();
if (!cloudExpenseCategories || typeof cloudExpenseCategories !== 'object') {
return;
}
if (cloudExpenseCategories.categories && Array.isArray(cloudExpenseCategories.categories)) {
const localCategories = await idb.get('expense_categories') || [];
if (JSON.stringify(cloudExpenseCategories.categories) !== JSON.stringify(localCategories)) {
expenseCategories = cloudExpenseCategories.categories;
await idb.set('expense_categories', expenseCategories);
emitSyncUpdate({ expenseCategories: cloudExpenseCategories });
flashLivePulse();
}
}
recordSuccessfulConnection();
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const expenseCategoriesUnsub = userRef.collection('expenseCategories').doc('categories').onSnapshot(async (doc) => {
if (isSyncing) { _enqueueSyncLocked(_handleExpenseCategoriesSnapshot, doc); return; }
await _handleExpenseCategoriesSnapshot(doc);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
const _handleDeletionsSnapshot = async (snapshot) => {
try {
if (snapshot.metadata.hasPendingWrites) return;
if (snapshot.metadata.fromCache) return;
trackFirestoreRead(snapshot.docChanges().length);
const changes = snapshot.docChanges();
if (changes.length === 0) return;
let hasChanges = false;
for (const change of changes) {
try {
const docData = { id: change.doc.id, ...change.doc.data() };
if (change.type === 'added' || change.type === 'modified') {
if (docData.recordId || docData.id) {
deletedRecordIds.add(docData.recordId || docData.id);
}
const normalizedDoc = {
...docData,
syncedToCloud: true,
deletedAt: docData.deletedAt?.toMillis ? docData.deletedAt.toMillis() : (typeof docData.deletedAt === 'number' ? docData.deletedAt : Date.now())
};
const existingIndex = deletionRecords.findIndex(item => item.id === docData.id);
if (existingIndex === -1) {
deletionRecords.push(normalizedDoc);
} else {
deletionRecords[existingIndex] = normalizedDoc;
}
try {
if (docData.recordType === 'production' && docData.recordId) {
db = db.filter(item => item.id !== docData.recordId);
await idb.set('mfg_pro_pkr', db);
} else if ((docData.recordType === 'sale' || docData.recordType === 'sales') && docData.recordId) {
customerSales = customerSales.filter(item => item.id !== docData.recordId);
await idb.set('customer_sales', customerSales);
} else if (docData.recordType === 'expense' && docData.recordId) {
expenseRecords = expenseRecords.filter(item => item.id !== docData.recordId);
await idb.set('expenses', expenseRecords);
} else if (docData.recordType === 'transaction' && docData.recordId) {
paymentTransactions = paymentTransactions.filter(item => item.id !== docData.recordId);
await idb.set('payment_transactions', paymentTransactions);
} else if (docData.recordType === 'rep_sale' && docData.recordId) {
repSales = repSales.filter(item => item.id !== docData.recordId);
await idb.set('rep_sales', repSales);
} else if (docData.recordType === 'rep_customers' && docData.recordId) {
repCustomers = repCustomers.filter(item => item.id !== docData.recordId);
await idb.set('rep_customers', repCustomers);
} else if (docData.recordType === 'inventory' && docData.recordId) {
factoryInventoryData = factoryInventoryData.filter(item => item.id !== docData.recordId);
await idb.set('factory_inventory_data', factoryInventoryData);
} else if (docData.recordType === 'factory_history' && docData.recordId) {
factoryProductionHistory = factoryProductionHistory.filter(item => item.id !== docData.recordId);
await idb.set('factory_production_history', factoryProductionHistory);
} else if (docData.recordType === 'returns' && docData.recordId) {
stockReturns = stockReturns.filter(item => item.id !== docData.recordId);
await idb.set('stock_returns', stockReturns);
} else if (docData.recordType === 'calculator_history' && docData.recordId) {
salesHistory = salesHistory.filter(item => item.id !== docData.recordId);
await idb.set('noman_history', salesHistory);
} else if (docData.recordType === 'entities' && docData.recordId) {
paymentEntities = paymentEntities.filter(item => item.id !== docData.recordId);
await idb.set('payment_entities', paymentEntities);
}
} catch (collectionError) {
console.warn('Failed to apply deletion to collection', collectionError);
}
hasChanges = true;
} else if (change.type === 'removed') {
deletionRecords = deletionRecords.filter(item => item.id !== change.doc.id);
hasChanges = true;
}
} catch (docError) {
console.warn('Failed to save data locally.', docError);
}
}
if (hasChanges) {
await idb.set('deletion_records', deletionRecords);
emitSyncUpdate({ deletion_records: deletionRecords });
flashLivePulse();
recordSuccessfulConnection();
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
};
const deletionsUnsub = userRef.collection('deletions').onSnapshot(async (snapshot) => {
if (isSyncing) { _enqueueSyncLocked(_handleDeletionsSnapshot, snapshot); return; }
await _handleDeletionsSnapshot(snapshot);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
const _handleTeamSnapshot = async (doc) => {
try {
if (!doc.exists || doc.metadata.hasPendingWrites) return;
if (!doc.metadata.fromCache) trackFirestoreRead(1);
const teamData = doc.data();
if (!teamData || typeof teamData !== 'object') return;
const cloudTs = teamData.updated_at || 0;
const localTs = (await idb.get('team_list_timestamp')) || 0;
if (cloudTs <= localTs) {
recordSuccessfulConnection();
return;
}
let changed = false;
if (Array.isArray(teamData.sales_reps) && teamData.sales_reps.length > 0) {
const prev = JSON.stringify(salesRepsList);
salesRepsList = teamData.sales_reps;
await idb.set('sales_reps_list', salesRepsList);
if (JSON.stringify(salesRepsList) !== prev) changed = true;
}
if (Array.isArray(teamData.user_roles)) {
const prev2 = JSON.stringify(userRolesList);
userRolesList = teamData.user_roles;
await idb.set('user_roles_list', userRolesList);
if (JSON.stringify(userRolesList) !== prev2) changed = true;
}
await idb.set('team_list_timestamp', cloudTs);
if (changed) {
if (typeof renderAllRepUI === 'function') renderAllRepUI();
if (typeof renderUserRoleList === 'function') {
const list = document.getElementById('manage-userrole-list');
if (list) renderUserRoleList();
}
flashLivePulse();
showToast('Team list updated from another device', 'info', 3000);
}
recordSuccessfulConnection();
} catch (err) {
console.warn('Team list sync error:', err);
}
};
const teamUnsub = userRef.collection('settings').doc('team').onSnapshot(async (doc) => {
if (isSyncing) { _enqueueSyncLocked(_handleTeamSnapshot, doc); return; }
await _handleTeamSnapshot(doc);
}, error => {
updateSignalUI('error');
scheduleListenerReconnect();
});
realtimeRefs.push(
productionUnsub, salesUnsub, repSalesUnsub, repCustomersUnsub, transactionsUnsub,
entitiesUnsub, inventoryUnsub, factoryHistoryUnsub, returnsUnsub,
expensesUnsub, calcHistoryUnsub, settingsUnsub, factorySettingsUnsub,
expenseCategoriesUnsub, deletionsUnsub, teamUnsub
);
updateSignalUI('online');
recordSuccessfulConnection();
if (typeof registerDevice === 'function') {
registerDevice().catch(err => {
});
}
} catch (error) {
console.error('Device registration failed.', error);
showToast('Device registration failed.', 'error');
updateSignalUI('offline');
scheduleListenerReconnect();
}
}
async function executeSmartPull() {
await pullDataFromCloud(true);
if (pendingSocketUpdate) {
pendingSocketUpdate = false;
setTimeout(executeSmartPull, 1000);
} else {
showToast('Data synced via Live Socket', 'success');
}
}
function scheduleSocketReconnect() {
if (socketReconnectTimer) clearTimeout(socketReconnectTimer);
socketReconnectTimer = setTimeout(() => {
subscribeToRealtime();
}, 5000);
}
function initFirebase() {
if (window._firebaseListenersRegistered) return;
window._firebaseListenersRegistered = true;
try {
window._fbOfflineHandler = () => { updateSignalUI('offline'); };
window._fbVisibilityHandler = async () => {
if (document.visibilityState === 'visible') {
if (currentUser && database) {
try {
await pullDataFromCloud(true);
} catch (error) {
console.warn('Failed to pull data from cloud.', error);
}
}
}
};
window.addEventListener('offline', window._fbOfflineHandler);
document.addEventListener('visibilitychange', window._fbVisibilityHandler);
} catch (e) {
console.warn('Failed to pull data from cloud.', e);
}
}
