const DeltaSync = {
_cache: {},
_cacheGet(key) {
  return Object.prototype.hasOwnProperty.call(this._cache, key)
    ? this._cache[key]
    : undefined;
},
_cacheSet(key, value) {
  this._cache[key] = value;
},
_cacheDel(key) {
  delete this._cache[key];
},
_dirty: new Map(),
trackId(collection, id) {
  if (!id) return;
  if (!this._dirty.has(collection)) this._dirty.set(collection, new Set());
  this._dirty.get(collection).add(String(id));
  this.setLastLocalModification(collection, Date.now());
},
trackCollection(collection) {
  if (!this._dirty.has(collection)) this._dirty.set(collection, new Set());
  this._dirty.get(collection).add('*');
  this.setLastLocalModification(collection, Date.now());
},
clearDirty(collection) {
  this._dirty.delete(collection);
},
isDirty(collection) {
  const s = this._dirty.get(collection);
  return s !== undefined && s.size > 0;
},
async getLastSyncTimestamp(collection) {
  const key = `lastSync_${collection}`;
  const cached = this._cacheGet(key);
  if (cached !== undefined) return cached === null ? null : new Date(cached).getTime();
  const isoStr = await idb.get(key);
  this._cacheSet(key, isoStr || null);
  if (!isoStr) return null;
  return new Date(isoStr).getTime();
},
async getLastSyncMs(collection) {
  return (await this.getLastSyncTimestamp(collection)) || 0;
},
async getLastSyncFirestoreTimestamp(collection) {
  const key = `lastSync_${collection}`;
  const cached = this._cacheGet(key);
  const isoStr = cached !== undefined ? cached : await idb.get(key);
  if (!isoStr) return null;
  try {
    return firebase.firestore.Timestamp.fromDate(new Date(isoStr));
  } catch (e) {
    return null;
  }
},
async setLastSyncTimestamp(collection, explicitMs) {
  const key = `lastSync_${collection}`;
  const ts = explicitMs ? new Date(explicitMs).toISOString() : new Date().toISOString();
  this._cacheSet(key, ts);
  this.clearDirty(collection);
  await idb.set(key, ts);
},
async getLastLocalModification(collection) {
  const key = `lastLocalMod_${collection}`;
  const cached = this._cacheGet(key);
  if (cached !== undefined) return cached === null ? 0 : cached;
  const raw = await idb.get(key);
  const val = raw !== null && raw !== undefined ? (typeof raw === 'number' ? raw : parseInt(raw)) : 0;
  this._cacheSet(key, val || null);
  return val || 0;
},
async setLastLocalModification(collection, timestamp) {
  const key = `lastLocalMod_${collection}`;
  const val = Number(timestamp);
  this._cacheSet(key, val);
  await idb.set(key, val);
},
async trackModification(collection) {
  this.trackCollection(collection);
},
async hasLocalChanges(collection) {
  if (this.isDirty(collection)) return true;
  const lastSyncMs = await this.getLastSyncMs(collection);
  const lastLocalMod = await this.getLastLocalModification(collection);
  if (!lastSyncMs) return true;
  if (!lastLocalMod) return false;
  return lastLocalMod > lastSyncMs;
},
async getChangedItemsCount(collectionName, dataArray) {
  const ids = this._dirty.get(collectionName);
  if (ids && !ids.has('*')) return ids.size;
  const lastSyncMs = await this.getLastSyncMs(collectionName);
  if (!lastSyncMs || !Array.isArray(dataArray)) return dataArray?.length || 0;
  let changedCount = 0;
  for (const item of dataArray) {
    if (!item) continue;
    const itemTime = item.updatedAt || item.timestamp || item.createdAt || 0;
    const itemTimestamp = typeof itemTime === 'number' ? itemTime :
      typeof itemTime === 'string' ? new Date(itemTime).getTime() :
      itemTime?.toMillis ? itemTime.toMillis() : 0;
    if (itemTimestamp > lastSyncMs) changedCount++;
  }
  return changedCount;
},
async getChangedItems(collectionName, dataArray) {
  if (!Array.isArray(dataArray)) return [];
  const ids = this._dirty.get(collectionName);
  if (ids && ids.size > 0 && !ids.has('*')) {
    return dataArray.filter(item => item && ids.has(String(item.id)));
  }
  const lastSyncMs = await this.getLastSyncMs(collectionName);
  if (!lastSyncMs) return dataArray.filter(item => item);
  const changedItems = [];
  for (const item of dataArray) {
    if (!item) continue;
    const itemTime = item.updatedAt || item.timestamp || item.createdAt || 0;
    const itemTimestamp = typeof itemTime === 'number' ? itemTime :
      typeof itemTime === 'string' ? new Date(itemTime).getTime() :
      itemTime?.toMillis ? itemTime.toMillis() : 0;
    if (itemTimestamp > lastSyncMs) changedItems.push(item);
  }
  return changedItems;
},
async hasAnyChanges(collections) {
  for (const collection of collections) {
    if (await this.hasLocalChanges(collection)) return true;
  }
  return false;
},
async clearAllTimestamps() {
  const knownCollections = [
    'production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers',
    'sales_customers', 'transactions', 'entities', 'inventory',
    'factory_history', 'returns', 'expenses', 'deletions'
  ];
  for (const col of knownCollections) {
    const lsKey = `lastSync_${col}`;
    const lmKey = `lastLocalMod_${col}`;
    this._cacheDel(lsKey);
    this._cacheDel(lmKey);
    this.clearDirty(col);
    await idb.remove(lsKey);
    await idb.remove(lmKey);
    localStorage.removeItem(lsKey);
    localStorage.removeItem(lmKey);
  }
},
async getSyncSummary() {
  const currentAppMode = appMode || 'admin';
  const isRepMode = currentAppMode === 'rep';
  const collections = [
    'production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers',
    'sales_customers', 'transactions', 'entities', 'inventory',
    'factory_history', 'returns', 'expenses', 'deletions'
  ];
  const summary = { mode: currentAppMode, isRepMode };
  for (const collection of collections) {
    const lastSyncMs = await this.getLastSyncTimestamp(collection);
    const hasChanges = await this.hasLocalChanges(collection);
    summary[collection] = {
      lastSync: lastSyncMs ? new Date(lastSyncMs).toISOString() : 'Never',
      hasChanges,
      needsUpload: hasChanges,
      needsDownload: !lastSyncMs
    };
  }
  return summary;
},
async updateSyncStats(collection) {
  const stats = await this.getSyncStats();
  if (!stats[collection]) {
    stats[collection] = { syncCount: 0, lastSync: null, totalReads: 0, totalWrites: 0 };
  }
  stats[collection].syncCount++;
  stats[collection].lastSync = new Date().toISOString();
  await idb.set('deltaSyncStats', stats);
},
async getSyncStats() {
  try {
    const stats = await idb.get('deltaSyncStats');
    return (stats && typeof stats === 'object') ? stats : {};
  } catch (e) {
    return {};
  }
},
async recordOperation(collection, reads = 0, writes = 0) {
  const stats = await this.getSyncStats();
  if (!stats[collection]) {
    stats[collection] = { syncCount: 0, lastSync: null, totalReads: 0, totalWrites: 0 };
  }
  stats[collection].totalReads += reads;
  stats[collection].totalWrites += writes;
  await idb.set('deltaSyncStats', stats);
}
};
async function initializeSyncStatsIfNeeded() {
const stats = await DeltaSync.getSyncStats();
const hasStats = Object.keys(stats).length > 0;
if (!hasStats) {
let lastSyncTime = new Date().toISOString();
try {
const lastSynced = await idb.get('last_synced');
if (lastSynced) {
lastSyncTime = lastSynced;
}
} catch (e) {
console.warn('Could not read last sync time', e);
}
const collections = [
'production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers',
'sales_customers',
'transactions', 'entities', 'inventory', 'factory_history',
'returns', 'expenses', 'deletions'
];
for (const collection of collections) {
stats[collection] = {
syncCount: 1,
lastSync: lastSyncTime,
totalReads: 0,
totalWrites: 0
};
}
await idb.set('deltaSyncStats', stats);
return true;
}
return false;
}
async function saveWithTracking(key, data) {
const keyToCollection = {
'mfg_pro_pkr': 'production',
'customer_sales': 'sales',
'noman_history': 'calculator_history',
'rep_sales': 'rep_sales',
'rep_customers': 'rep_customers',
'sales_customers': 'sales_customers',
'payment_transactions': 'transactions',
'payment_entities': 'entities',
'factory_inventory_data': 'inventory',
'factory_production_history': 'factory_history',
'expenses': 'expenses',
'stock_returns': 'returns'
};
const result = await idb.set(key, data);
const collectionName = keyToCollection[key];
if (collectionName) {
  DeltaSync.trackCollection(collectionName);
}
return result;
}
const IndexedDBToFirestoreMap = {
'mfg_pro_pkr': { collection: 'production', varName: 'db' },
'customer_sales': { collection: 'sales', varName: 'customerSales' },
'noman_history': { collection: 'calculator_history', varName: 'salesHistory' },
'rep_sales': { collection: 'rep_sales', varName: 'repSales' },
'rep_customers': { collection: 'rep_customers', varName: 'repCustomers' },
'sales_customers': { collection: 'sales_customers', varName: 'salesCustomers' },
'payment_transactions': { collection: 'transactions', varName: 'paymentTransactions' },
'payment_entities': { collection: 'entities', varName: 'paymentEntities' },
'factory_inventory_data': { collection: 'inventory', varName: 'factoryInventoryData' },
'factory_production_history': { collection: 'factory_history', varName: 'factoryProductionHistory' },
'expenses': { collection: 'expenses', varName: 'expenseRecords' },
'stock_returns': { collection: 'returns', varName: 'stockReturns' }
};
const FirestoreToIndexedDBMap = {
'production': 'mfg_pro_pkr',
'sales': 'customer_sales',
'calculator_history': 'noman_history',
'rep_sales': 'rep_sales',
'rep_customers': 'rep_customers',
'sales_customers': 'sales_customers',
'transactions': 'payment_transactions',
'entities': 'payment_entities',
'inventory': 'factory_inventory_data',
'factory_history': 'factory_production_history',
'expenses': 'expenses',
'returns': 'stock_returns'
};
function getFirestoreCollection(idbKey) {
return IndexedDBToFirestoreMap[idbKey]?.collection || idbKey;
}
function getIndexedDBKey(firestoreCollection) {
return FirestoreToIndexedDBMap[firestoreCollection] || firestoreCollection;
}
async function saveRecordToFirestore(idbKey, record, silent = true) {
if (!firebaseDB || !currentUser) {
return false;
}
if (!record || !record.id) {
return false;
}
const collectionName = getFirestoreCollection(idbKey);
if (!collectionName) {
return false;
}
if (window._firestoreNetworkDisabled || !navigator.onLine) {
if (typeof OfflineQueue !== 'undefined') {
const now = Date.now();
const recordWithTimestamps = {
...record,
updatedAt: record.isMerged ? record.updatedAt : now,
syncedAt: new Date().toISOString()
};
if (!recordWithTimestamps.createdAt) {
recordWithTimestamps.createdAt = now;
}
await OfflineQueue.add({
action: 'set',
collection: collectionName,
docId: String(record.id),
data: sanitizeForFirestore(recordWithTimestamps)
});
}
return true;
}
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const docRef = userRef.collection(collectionName).doc(String(record.id));
const now = Date.now();
const recordWithTimestamps = {
...record,
updatedAt: record.isMerged ? record.updatedAt : now,
syncedAt: new Date().toISOString()
};
if (!recordWithTimestamps.createdAt) {
recordWithTimestamps.createdAt = now;
}
await docRef.set(sanitizeForFirestore(recordWithTimestamps), { merge: true });
trackFirestoreWrite(1);
await DeltaSync.setLastSyncTimestamp(collectionName);
return true;
} catch (error) {
if (typeof OfflineQueue !== 'undefined') {
const now = Date.now();
const recordWithTimestamps = {
...record,
updatedAt: record.isMerged ? record.updatedAt : now,
syncedAt: new Date().toISOString()
};
if (!recordWithTimestamps.createdAt) recordWithTimestamps.createdAt = now;
await OfflineQueue.add({
action: 'set',
collection: collectionName,
docId: String(record.id),
data: sanitizeForFirestore(recordWithTimestamps)
});
return true;
}
if (!silent) {
showToast('Failed to sync to cloud — will retry when online', 'warning');
}
return false;
}
}
async function deleteRecordFromFirestore(idbKey, recordId, silent = true) {
if (!firebaseDB || !currentUser) {
return false;
}
if (!recordId) {
return false;
}
const collectionName = getFirestoreCollection(idbKey);
if (!collectionName) {
return false;
}
if (window._firestoreNetworkDisabled || !navigator.onLine) {
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.add({
action: 'delete',
collection: collectionName,
docId: String(recordId),
data: null
});
}
return true;
}
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const batch = firebaseDB.batch();
batch.delete(userRef.collection(collectionName).doc(String(recordId)));
batch.set(userRef.collection('deletions').doc(String(recordId)), {
id: recordId,
recordId: recordId,
collection: collectionName,
recordType: collectionName,
deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + (90 * 24 * 60 * 60 * 1000))
});
await batch.commit();
trackFirestoreWrite(2);
return true;
} catch (error) {
console.error('deleteRecordFromFirestore error:', error);
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.add({
action: 'delete',
collection: collectionName,
docId: String(recordId),
recordType: collectionName,
data: null
});
return true;
}
if (!silent) {
showToast('Failed to delete from cloud — will retry when online', 'warning');
}
return false;
}
}
async function unifiedSave(idbKey, dataArray, specificRecord = null) {
await saveWithTracking(idbKey, dataArray);
if (specificRecord && specificRecord.id) {
  const collectionName = getFirestoreCollection(idbKey);
  if (collectionName) DeltaSync.trackId(collectionName, specificRecord.id);
  await saveRecordToFirestore(idbKey, specificRecord);
}
triggerAutoSync();
return true;
}
async function unifiedDelete(idbKey, dataArray, deletedRecordId) {
const collectionName = getFirestoreCollection(idbKey);
if (collectionName) {
await registerDeletion(deletedRecordId, collectionName);
}
await saveWithTracking(idbKey, dataArray);
await deleteRecordFromFirestore(idbKey, deletedRecordId);
triggerAutoSync();
return true;
}
async function verifyDeltaSyncSystem() {
const collections = [
'production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers',
'sales_customers',
'transactions', 'entities', 'inventory', 'factory_history', 'returns', 'expenses', 'deletions'
];
const results = {
valid: [],
issues: []
};
for (const collection of collections) {
const lastSyncMs = await DeltaSync.getLastSyncTimestamp(collection);
const lastMod = await DeltaSync.getLastLocalModification(collection);
const idbKey = getIndexedDBKey(collection);
const data = await idb.get(idbKey, []);
const hasChanges = await DeltaSync.hasLocalChanges(collection);
const status = {
collection,
lastSync: lastSyncMs
? new Date(lastSyncMs).toLocaleString()
: 'Never',
lastModification: lastMod ? new Date(lastMod).toLocaleString() : 'Never',
localRecords: data.length,
hasPendingChanges: hasChanges
};
if (lastSyncMs || data.length === 0) {
results.valid.push(status);
} else {
results.issues.push(status);
}
}
return results;
}
async function resetDeltaSync() {
await DeltaSync.clearAllTimestamps();
await idb.remove('deltaSyncStats');
showToast('Delta sync reset - next sync will download all data', 'info');
}
window.verifyDeltaSyncSystem = verifyDeltaSyncSystem;
window.resetDeltaSync = resetDeltaSync;
window.getFirestoreCollection = getFirestoreCollection;
window.getIndexedDBKey = getIndexedDBKey;
window.saveRecordToFirestore = saveRecordToFirestore;
window.deleteRecordFromFirestore = deleteRecordFromFirestore;
window.unifiedSave = unifiedSave;
window.unifiedDelete = unifiedDelete;
function initializeFirebaseSystem() {
const indicator = document.getElementById('connection-indicator');
if (typeof firebase === 'undefined') {
if (indicator) {
indicator.title = 'Loading Cloud SDK...';
indicator.className = 'signal-connecting';
}
setTimeout(initializeFirebaseSystem, 500);
return;
}
try {
if (!firebase.apps.length) {
firebase.initializeApp(firebaseConfig);
}
database = firebase.firestore();
firebaseDB = database;
firebaseDB.enablePersistence({ synchronizeTabs: true })
.then(function() {
})
.catch(function(err) {
if (err.code === 'failed-precondition') {
} else if (err.code === 'unimplemented') {
} else {
}
});
auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
.then(() => {
})
.catch((error) => {
});
auth.onAuthStateChanged(async (user) => {
if (user) {
currentUser = {
id: user.uid,
uid: user.uid,
email: user.email,
displayName: user.displayName
};
try {
const savedLogin = localStorage.getItem('persistentLogin');
const isRestoredSession = savedLogin && JSON.parse(savedLogin).uid === user.uid;
localStorage.setItem('persistentLogin', JSON.stringify({
uid: user.uid,
email: user.email,
displayName: user.displayName,
lastLogin: new Date().toISOString()
}));
} catch (e) {
console.warn('Failed to save persistent login:', e);
}
hideAuthOverlay();
showToast(`Welcome back, ${user.email.split('@')[0]}`, 'success');
try { sessionStorage.setItem('_gznd_session_active', '1'); } catch(e) {}
idb.setUserPrefix(user.uid);
await IDBCrypto.initialize();
const keyRestored = await IDBCrypto.restoreSessionKeyFromStorage();
if (!keyRestored) {

const hasStoredCreds = await OfflineAuth.hasStoredCredentials();
if (hasStoredCreds) {
const savedEmail = await OfflineAuth.getSavedEmail();
if (savedEmail && savedEmail.toLowerCase() === user.email.toLowerCase()) {

showToast('Please enter your password to restore data access', 'warning');
setTimeout(() => {
showAuthOverlay();
const messageDiv = document.getElementById('auth-message');
if (messageDiv) {
messageDiv.textContent = 'Please enter your password to restore encrypted data access';
messageDiv.style.color = 'var(--warning)';
}
const emailInput = document.getElementById('auth-email');
if (emailInput) emailInput.value = user.email;
}, 1000);
return;
}
}
console.warn('Auth: Could not restore encryption key - user may need to log in again');
showToast('Session restored but encryption key missing. Some features may be limited.', 'warning');
} else {
const isKeyValid = await IDBCrypto.validateKey();
if (!isKeyValid) {
console.warn('Auth: Encryption key validation failed');
IDBCrypto.clearSessionKey();
showToast('Encryption key invalid. Please log in again.', 'error');
showAuthOverlay();
return;
}

}
updateSyncButton();
if (typeof subscribeToRealtime === 'function') {
subscribeToRealtime();
}
if (typeof registerDevice === 'function') {
setTimeout(() => {
registerDevice().catch(err => {
console.warn('Device registration failed:', err);
});
}, 500);
}
setTimeout(async () => {
try {
await restoreDeviceModeOnLogin(user.uid);
} catch (error) {
console.error('Could not restore device mode:', error);
}
}, 1000);
setTimeout(async () => {
if (typeof performOneClickSync === 'function' && !isSyncing) {
performOneClickSync(false);
}
}, 1500);
} else {
currentUser = null;
try {
localStorage.removeItem('persistentLogin');
} catch (e) {
console.error('Failed to clear persistent login:', e);
}
updateSyncButton();
}
});
if (indicator) {
indicator.title = 'Cloud Connected';
indicator.className = 'signal-online';
}
if (typeof initFirebase === 'function') {
initFirebase();
} else {
setTimeout(initializeFirebaseSystem, 500);
}
} catch (error) {
console.error('Sync failed. Check your connection.', error);
showToast('Sync failed. Check your connection.', 'error');
if (indicator) {
indicator.title = 'Connection Failed';
indicator.className = 'signal-offline';
}
setTimeout(initializeFirebaseSystem, 2000);
}
}
