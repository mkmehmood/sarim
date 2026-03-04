const USE_IDB_ONLY = true;
function safeNumber(value, defaultValue = 0) {
const num = Number(value);
return (isNaN(num) || !isFinite(num)) ? defaultValue : num;
}
function safeToFixed(value, decimals = 2) {
return safeNumber(value, 0).toFixed(decimals);
}
const originalToFixed = Number.prototype.toFixed;
Number.prototype.toFixed = function(decimals = 2) {
const num = safeNumber(this, 0);
return originalToFixed.call(num, decimals);
};
function safeString(value, defaultValue = '') {
if (value === null || value === undefined) return defaultValue;
return String(value);
}
function safeReplace(value, searchValue, replaceValue) {
return safeString(value).replace(searchValue, replaceValue);
}
const IDB_CONFIG = {
name: 'NaswarDealersDB',
version: 2,
store: 'app_data',
indexes: {
timestamp: 'timestamp',
type: 'type',
userId: 'userId',
composite: 'type_timestamp'
},
performance: {
batchSize: 100,
compressThreshold: 10240
}
};
const idb = {
db: null,
_initPromise: null,
_prefix: '',
_DEVICE_GLOBAL: new Set(['device_id', 'device_name', 'theme']),
setUserPrefix(uid) {
  const newPrefix = uid ? 'u_' + uid + '_' : '';
  if (this._prefix !== newPrefix) {
    this._prefix = newPrefix;
    if (typeof DeltaSync !== 'undefined') {
      DeltaSync._cache = {};
      DeltaSync._dirty = new Map();
    }
  }
},
clearUserPrefix() {
  this._prefix = '';
  if (typeof DeltaSync !== 'undefined') {
    DeltaSync._cache = {};
    DeltaSync._dirty = new Map();
  }
},
_k(key) {
  if (!this._prefix) return key;
  if (this._DEVICE_GLOBAL.has(key)) return key;
  return this._prefix + key;
},
async init() {
if (this.db) return this.db;
if (this._initPromise) return this._initPromise;
this._initPromise = new Promise((resolve, reject) => {
const request = indexedDB.open(IDB_CONFIG.name, IDB_CONFIG.version);
request.onupgradeneeded = (e) => {
const db = e.target.result;
const oldVersion = e.oldVersion;
if (!db.objectStoreNames.contains(IDB_CONFIG.store)) {
const objectStore = db.createObjectStore(IDB_CONFIG.store);
try {
objectStore.createIndex(IDB_CONFIG.indexes.timestamp, 'metadata.timestamp', { unique: false });
objectStore.createIndex(IDB_CONFIG.indexes.type, 'metadata.type', { unique: false });
objectStore.createIndex(IDB_CONFIG.indexes.userId, 'metadata.userId', { unique: false });
objectStore.createIndex(IDB_CONFIG.indexes.composite, ['metadata.type', 'metadata.timestamp'], { unique: false });
} catch (e) {
console.error('An unexpected error occurred.', e);
showToast('An unexpected error occurred.', 'error');
}
} else if (oldVersion < 2) {
}
};
request.onsuccess = (e) => {
this.db = e.target.result;
this.db.onerror = (event) => {
};
this.db.onversionchange = () => {
this.db.close();
this.db = null;
this._initPromise = null;
};
resolve(this.db);
};
request.onerror = (e) => {
this._initPromise = null;
reject(e.target.error);
};
request.onblocked = () => {
};
});
return this._initPromise;
},
_wrapValue(key, value) {
let recordIds = [];
let recordCount = 0;
const isCollectionString = typeof value === 'string' && (value.trimStart()[0] === '[' || value.trimStart()[0] === '{');
if (isCollectionString || (typeof value !== 'string')) {
try {
const parsedData = typeof value === 'string' ? JSON.parse(value) : value;
if (Array.isArray(parsedData)) {
recordCount = parsedData.length;
recordIds = parsedData.slice(0, 10).map(item => item.id).filter(Boolean);
}
} catch (e) {
console.warn('IDB record parsing error', e);
}
}
const serialized = typeof value === 'string' ? value : JSON.stringify(value);
const wrapped = {
data: serialized,
metadata: {
timestamp: Date.now(),
type: this._inferType(key),
userId: 'default_user',
key: key,
compressed: false,
encrypted: false,
recordCount: recordCount,
sampleIds: [],
version: 2
}
};
return wrapped;
},
_unwrapValue(wrapped) {
if (!wrapped) return null;
if (!wrapped.metadata) {
try {
return JSON.parse(wrapped);
} catch (e) {
return wrapped;
}
}
return wrapped.data;
},
_inferType(key) {
if (key.includes('payment')) return 'payment';
if (key.includes('expense')) return 'expense';
if (key.includes('factory')) return 'factory';
if (key.includes('customer') || key.includes('sales')) return 'sales';
if (key.includes('mfg') || key.includes('production')) return 'production';
return 'other';
},
async get(key, defaultValue = null) {
await this.init();
return new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readonly');
const store = transaction.objectStore(IDB_CONFIG.store);
const request = store.get(this._k(key));
request.onsuccess = async () => {
const wrapped = request.result;
if (wrapped === undefined) {
resolve(defaultValue);
} else {
const rawData = this._unwrapValue(wrapped);
if (rawData === null || rawData === undefined) { resolve(defaultValue); return; }
try {
const decrypted = await IDBCrypto.decrypt(rawData);
if (decrypted === null) {
console.warn('IDB: Decryption returned null for key:', key);
resolve(defaultValue);
return;
}
if (typeof decrypted === 'string') {
try { resolve(JSON.parse(decrypted)); } catch(e) { resolve(decrypted); }
} else {
resolve(decrypted);
}
} catch(decErr) {
console.warn('IDB: Decryption error for key:', key, decErr);
try { resolve(JSON.parse(rawData)); } catch(e) { resolve(rawData); }
}
}
};
request.onerror = () => reject(request.error);
});
},
async set(key, value) {
await this.init();
if (Array.isArray(value)) {
value = value.map(record => {
if (typeof record === 'object' && record !== null) {
return ensureRecordIntegrity(record);
}
return record;
});
} else if (typeof value === 'object' && value !== null) {
value = ensureRecordIntegrity(value);
}
const serialized = typeof value === 'string' ? value : JSON.stringify(value);
const encryptedData = await IDBCrypto.encrypt(serialized);
return new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readwrite');
const store = transaction.objectStore(IDB_CONFIG.store);
const wrapped = this._wrapValue(key, value);
wrapped.data = encryptedData;
wrapped.metadata.encrypted = IDBCrypto.isReady();
const request = store.put(wrapped, this._k(key));
request.onsuccess = () => {
resolve();
};
request.onerror = () => {
reject(request.error);
};
});
},
async setBatch(entries) {
await this.init();
const validatedEntries = entries.map(([key, value]) => {
if (Array.isArray(value)) {
value = value.map(record => {
if (typeof record === 'object' && record !== null) {
return ensureRecordIntegrity(record);
}
return record;
});
} else if (typeof value === 'object' && value !== null) {
value = ensureRecordIntegrity(value);
}
return [key, value];
});
const encryptedEntries = await Promise.all(
validatedEntries.map(async ([key, value]) => {
try {
const serialized = typeof value === 'string' ? value : JSON.stringify(value);
const encryptedData = await IDBCrypto.encrypt(serialized);
return [key, value, encryptedData];
} catch (encErr) {
console.error('IDB: Encryption failed for key:', key, encErr);
return [key, value, typeof value === 'string' ? value : JSON.stringify(value)];
}
})
);
const batches = [];
for (let i = 0; i < encryptedEntries.length; i += IDB_CONFIG.performance.batchSize) {
batches.push(encryptedEntries.slice(i, i + IDB_CONFIG.performance.batchSize));
}
for (const batch of batches) {
await new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readwrite');
const store = transaction.objectStore(IDB_CONFIG.store);
batch.forEach(([key, value, encryptedData]) => {
const wrapped = this._wrapValue(key, value);
wrapped.data = encryptedData;
wrapped.metadata.encrypted = IDBCrypto.isReady();
store.put(wrapped, this._k(key));
});
transaction.oncomplete = () => {
resolve();
};
transaction.onerror = () => reject(transaction.error);
});
}
},
async getBatch(keys) {
await this.init();
const results = new Map();
await new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readonly');
const store = transaction.objectStore(IDB_CONFIG.store);
let completed = 0;
if (keys.length === 0) { resolve(); return; }
keys.forEach(key => {
const request = store.get(this._k(key));
request.onsuccess = async () => {
const rawData = this._unwrapValue(request.result);
if (rawData !== null && rawData !== undefined) {
try {
const decrypted = await IDBCrypto.decrypt(rawData);
if (decrypted === null) {
console.warn('IDB: Decryption returned null for key in batch:', key);
results.set(key, null);
} else if (typeof decrypted === 'string') {
try { results.set(key, JSON.parse(decrypted)); } catch(e) { results.set(key, decrypted); }
} else {
results.set(key, decrypted);
}
} catch(e) {
console.warn('IDB: Decryption error for key in batch:', key, e);
try { results.set(key, JSON.parse(rawData)); } catch(e2) { results.set(key, rawData); }
}
} else {
results.set(key, null);
}
completed++;
if (completed === keys.length) resolve();
};
request.onerror = () => { completed++; if (completed === keys.length) resolve(); };
});
});
return results;
},
async remove(key) {
await this.init();
return new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readwrite');
const store = transaction.objectStore(IDB_CONFIG.store);
const request = store.delete(this._k(key));
request.onsuccess = () => resolve();
request.onerror = () => reject(request.error);
});
},
async queryByType(type, options = {}) {
await this.init();
return new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readonly');
const store = transaction.objectStore(IDB_CONFIG.store);
try {
const index = store.index(IDB_CONFIG.indexes.type);
const range = IDBKeyRange.only(type);
const request = index.openCursor(range);
const results = [];
const limit = options.limit || Infinity;
let count = 0;
request.onsuccess = (e) => {
const cursor = e.target.result;
if (cursor && count < limit) {
const value = this._unwrapValue(cursor.value);
results.push({
key: cursor.primaryKey,
value: value,
metadata: cursor.value.metadata
});
count++;
cursor.continue();
} else {
resolve(results);
}
};
request.onerror = () => reject(request.error);
} catch (e) {
resolve([]);
}
});
},
async queryByTimeRange(type, startTime, endTime, options = {}) {
await this.init();
return new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readonly');
const store = transaction.objectStore(IDB_CONFIG.store);
try {
const index = store.index(IDB_CONFIG.indexes.composite);
const range = IDBKeyRange.bound([type, startTime], [type, endTime]);
const request = index.openCursor(range);
const results = [];
const limit = options.limit || Infinity;
let count = 0;
request.onsuccess = (e) => {
const cursor = e.target.result;
if (cursor && count < limit) {
const value = this._unwrapValue(cursor.value);
results.push({
key: cursor.primaryKey,
value: value,
metadata: cursor.value.metadata
});
count++;
cursor.continue();
} else {
resolve(results);
}
};
request.onerror = () => reject(request.error);
} catch (e) {
console.error('An unexpected error occurred.', e);
showToast('An unexpected error occurred.', 'error');
this.queryByType(type, options).then(resolve).catch(reject);
}
});
},
async count(options = {}) {
await this.init();
return new Promise((resolve, reject) => {
const transaction = this.db.transaction(IDB_CONFIG.store, 'readonly');
const store = transaction.objectStore(IDB_CONFIG.store);
if (options.type) {
try {
const index = store.index(IDB_CONFIG.indexes.type);
const range = IDBKeyRange.only(options.type);
const request = index.count(range);
request.onsuccess = () => resolve(request.result);
request.onerror = () => reject(request.error);
} catch (e) {
console.error('An unexpected error occurred.', e);
showToast('An unexpected error occurred.', 'error');
const request = store.count();
request.onsuccess = () => resolve(request.result);
request.onerror = () => reject(request.error);
}
} else {
const request = store.count();
request.onsuccess = () => resolve(request.result);
request.onerror = () => reject(request.error);
}
});
}
};
function ensureArray(value) {
if (Array.isArray(value)) {
return value;
}
if (value === null || value === undefined) {
return [];
}
if (typeof value === 'object') {
try {
return Array.isArray(value) ? value : [];
} catch(e) {
return [];
}
}
return [];
}
async function loadAllData() {
const dataKeys = [
'mfg_pro_pkr', 'noman_history', 'customer_sales', 'rep_sales', 'rep_customers',
'sales_customers',
'factory_inventory_data', 'factory_production_history',
'payment_entities', 'payment_transactions', 'expenses',
'stock_returns', 'deletion_records', 'deleted_records',
'factory_default_formulas', 'factory_additional_costs',
'factory_sale_prices', 'factory_cost_adjustment_factor',
'factory_unit_tracking', 'naswar_default_settings',
'appMode', 'repProfile', 'expense_categories', 'sales_reps_list',
'assignedManager',
'factory_default_formulas_timestamp', 'factory_additional_costs_timestamp',
'factory_sale_prices_timestamp', 'factory_cost_adjustment_factor_timestamp',
'factory_unit_tracking_timestamp', 'naswar_default_settings_timestamp',
'appMode_timestamp', 'repProfile_timestamp'
];
const batchResults = await idb.getBatch(dataKeys);
db = ensureArray(batchResults.get('mfg_pro_pkr'));
salesHistory = ensureArray(batchResults.get('noman_history'));
customerSales = ensureArray(batchResults.get('customer_sales'));
repSales = ensureArray(batchResults.get('rep_sales'));
repCustomers = ensureArray(batchResults.get('rep_customers'));
salesCustomers = ensureArray(batchResults.get('sales_customers'));
stockReturns = ensureArray(batchResults.get('stock_returns'));
factoryInventoryData = ensureArray(batchResults.get('factory_inventory_data'));
factoryProductionHistory = ensureArray(batchResults.get('factory_production_history'));
paymentEntities = ensureArray(batchResults.get('payment_entities'));
paymentTransactions = ensureArray(batchResults.get('payment_transactions'));
expenseRecords = ensureArray(batchResults.get('expenses'));
deletionRecordsArray = ensureArray(batchResults.get('deletion_records'));
const deletedRecordsArray = ensureArray(batchResults.get('deleted_records'));
deletedRecordIds = new Set(deletedRecordsArray);
const loadedFormulas = batchResults.get('factory_default_formulas');
if (loadedFormulas && typeof loadedFormulas === 'object' && 'standard' in loadedFormulas && 'asaan' in loadedFormulas) {
factoryDefaultFormulas = loadedFormulas;
}
const loadedAdditionalCosts = batchResults.get('factory_additional_costs');
if (loadedAdditionalCosts && typeof loadedAdditionalCosts === 'object' && 'standard' in loadedAdditionalCosts && 'asaan' in loadedAdditionalCosts) {
factoryAdditionalCosts = loadedAdditionalCosts;
}
const loadedSalePrices = batchResults.get('factory_sale_prices');
if (loadedSalePrices && typeof loadedSalePrices === 'object' && 'standard' in loadedSalePrices && 'asaan' in loadedSalePrices) {
factorySalePrices = loadedSalePrices;
}
const loadedAdjustmentFactor = batchResults.get('factory_cost_adjustment_factor');
if (loadedAdjustmentFactor && typeof loadedAdjustmentFactor === 'object' && 'standard' in loadedAdjustmentFactor && 'asaan' in loadedAdjustmentFactor) {
factoryCostAdjustmentFactor = loadedAdjustmentFactor;
}
const loadedUnitTracking = batchResults.get('factory_unit_tracking');
if (loadedUnitTracking && typeof loadedUnitTracking === 'object') {
factoryUnitTracking = loadedUnitTracking;
}
const loadedDefaultSettings = batchResults.get('naswar_default_settings');
if (loadedDefaultSettings && typeof loadedDefaultSettings === 'object') {
defaultSettings = loadedDefaultSettings;
}
const loadedAppMode = batchResults.get('appMode');
if (loadedAppMode) {
appMode = loadedAppMode;
}
const loadedRepProfile = batchResults.get('repProfile');
if (loadedRepProfile) {
currentRepProfile = loadedRepProfile;
}
const loadedExpenseCategories = batchResults.get('expense_categories');
if (loadedExpenseCategories && Array.isArray(loadedExpenseCategories)) {
expenseCategories = loadedExpenseCategories;
}
const loadedSalesRepsList = batchResults.get('sales_reps_list');
if (loadedSalesRepsList && Array.isArray(loadedSalesRepsList) && loadedSalesRepsList.length > 0) {
salesRepsList = loadedSalesRepsList;
}
const loadedAssignedManager = batchResults.get('assignedManager');
if (loadedAssignedManager) {
window._assignedManagerName = loadedAssignedManager;
}
}
