function mergeDatasets(localArray, cloudArray) {
if (!Array.isArray(localArray)) localArray = [];
if (!Array.isArray(cloudArray)) cloudArray = [];
const mergedMap = new Map();
cloudArray.forEach(item => {
if (item && item.id) {
if (deletedRecordIds.has(item.id)) {
return;
}
mergedMap.set(item.id, item);
}
});
localArray.forEach(localItem => {
if (!localItem || !localItem.id) return;
if (deletedRecordIds.has(localItem.id)) return;
const cloudItem = mergedMap.get(localItem.id);
if (!cloudItem) {
mergedMap.set(localItem.id, localItem);
return;
}
const isFinancialRecord = (localItem.totalSold !== undefined || localItem.revenue !== undefined);
if (isFinancialRecord) {
const localHasData = (localItem.totalSold > 0 || localItem.revenue > 0);
const cloudIsCorrupt = (cloudItem.totalSold === undefined || cloudItem.totalSold === null || cloudItem.revenue === null);
if (localHasData && cloudIsCorrupt) {
mergedMap.set(localItem.id, localItem);
return;
}
}
if (localItem.isRepModeEntry === true && !cloudItem.isRepModeEntry) {
mergedMap.set(localItem.id, localItem);
return;
}
if (localItem.isReturn === true && !cloudItem.isReturn) {
mergedMap.set(localItem.id, localItem);
return;
}
if ((localItem.formulaUnits > 0 && !cloudItem.formulaUnits) ||
(localItem.formulaCost > 0 && !cloudItem.formulaCost)) {
mergedMap.set(localItem.id, localItem);
return;
}
if (localItem.supplierId && !cloudItem.supplierId) {
mergedMap.set(localItem.id, localItem);
return;
}
if (localItem.paymentStatus === 'paid' && cloudItem.paymentStatus !== 'paid') {
mergedMap.set(localItem.id, localItem);
return;
}
const localTime = localItem.timestamp || new Date(localItem.date).getTime() || 0;
const cloudTime = cloudItem.timestamp || new Date(cloudItem.date).getTime() || 0;
if (localTime >= cloudTime) {
mergedMap.set(localItem.id, localItem);
}
});
return Array.from(mergedMap.values());
}
function sanitizeForFirestore(obj, depth = 0) {
if (depth > 20) {
return null;
}
if (obj === null || obj === undefined) {
return null;
}
if (obj instanceof Date) {
return obj.toISOString();
}
if (typeof obj !== 'object') {
if (typeof obj === 'number') {
if (isNaN(obj) || !isFinite(obj)) return 0;
return obj;
}
if (typeof obj === 'string') {
return obj;
}
if (typeof obj === 'boolean') {
return obj;
}
try {
return String(obj);
} catch (e) {
return null;
}
}
if (Array.isArray(obj)) {
const sanitizedArray = [];
for (let i = 0; i < obj.length; i++) {
const item = obj[i];
if (typeof item === 'function') continue;
const sanitized = sanitizeForFirestore(item, depth + 1);
if (sanitized !== null && sanitized !== undefined) {
sanitizedArray.push(sanitized);
}
}
return sanitizedArray;
}
const sanitized = {};
try {
for (const key in obj) {
if (!obj.hasOwnProperty(key)) continue;
const value = obj[key];
if (!key || typeof key !== 'string') {
continue;
}
if (typeof value === 'function') {
continue;
}
let cleanKey = key;
if (typeof key !== 'string') {
cleanKey = String(key);
}
cleanKey = cleanKey.replace(/[\.\$#\[\]\/\\]/g, '_');
if (!cleanKey) continue;
if (cleanKey === 'id') {
if (value === null || value === undefined) {
sanitized[cleanKey] = '';
} else {
try {
sanitized[cleanKey] = String(value);
} catch (e) {
sanitized[cleanKey] = '';
}
}
continue;
}
if (cleanKey === 'amount' || cleanKey === 'quantity' || cleanKey === 'price' || cleanKey === 'cost') {
const num = parseFloat(value);
sanitized[cleanKey] = (isNaN(num) || !isFinite(num)) ? 0 : num;
continue;
}
if (cleanKey === 'timestamp' || cleanKey === 'createdAt' || cleanKey === 'updatedAt') {
if (value instanceof Date) {
sanitized[cleanKey] = value.toISOString();
} else if (typeof value === 'string' || typeof value === 'number') {
sanitized[cleanKey] = value;
} else {
sanitized[cleanKey] = new Date().toISOString();
}
continue;
}
const sanitizedValue = sanitizeForFirestore(value, depth + 1);
if (sanitizedValue !== null && sanitizedValue !== undefined) {
if (typeof sanitizedValue === 'object' && !Array.isArray(sanitizedValue)) {
const isFactorySettings = cleanKey === 'default_formulas' ||
cleanKey === 'additional_costs' ||
cleanKey === 'cost_adjustment_factor' ||
cleanKey === 'sale_prices' ||
cleanKey === 'unit_tracking' ||
cleanKey === 'standard' ||
cleanKey === 'asaan';
if (Object.keys(sanitizedValue).length > 0 || isFactorySettings) {
sanitized[cleanKey] = sanitizedValue;
}
} else if (Array.isArray(sanitizedValue)) {
sanitized[cleanKey] = sanitizedValue;
} else {
sanitized[cleanKey] = sanitizedValue;
}
}
}
} catch (e) {
return {};
}
return sanitized;
}
function mergeArraysByTimestamp(localArray, cloudArray) {
const merged = [...localArray];

const mergedIndexMap = new Map(merged.map((item, idx) => [item.id, idx]));
const localIds = new Set(localArray.map(item => item.id));
let downloadedCount = 0;
let updatedCount = 0;
let fixedCount = 0;
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
for (let cloudItem of cloudArray) {
if (!cloudItem.id || cloudItem.id === '_placeholder_' || cloudItem._placeholder) continue;
if (!validateUUID(cloudItem.id)) {
cloudItem = ensureRecordIntegrity(cloudItem, false, true);
fixedCount++;
}
const cloudTimestamp = getComparableTimestamp(cloudItem);
if (!localIds.has(cloudItem.id)) {
cloudItem = ensureRecordIntegrity(cloudItem, false, true);

mergedIndexMap.set(cloudItem.id, merged.length);
merged.push(cloudItem);
downloadedCount++;
} else {

const index = mergedIndexMap.get(cloudItem.id);
const localItem = merged[index];
const localTimestamp = getComparableTimestamp(localItem);
if (cloudTimestamp > localTimestamp) {
cloudItem = ensureRecordIntegrity(cloudItem, false, true);
merged[index] = cloudItem;
updatedCount++;
}
}
}
const validatedMerged = merged.map(item => {
if (!item.id || !validateUUID(item.id)) {
item = ensureRecordIntegrity(item, false, true);
fixedCount++;
}
return item;
});
if (downloadedCount > 0 || updatedCount > 0 || fixedCount > 0) {
}
return validatedMerged;
}
async function performOneClickSync(silent = false) {
if (!firebaseDB) {
if (!silent) {
showToast(" Connecting to Cloud... Please wait.", "info");
initializeFirebaseSystem();
}
return;
}
if (!currentUser) {
if (!silent) {
showToast("Please log in to sync data", "warning");
}
return;
}
if (isSyncing) {
return;
}
isSyncing = true;
const btn = document.getElementById('sync-btn');
const originalText = btn ? btn.innerHTML : '';
if (!silent && btn) {
btn.innerHTML = 'Syncing...';
}
if (!silent) {
showToast("Syncing....", "info");
}
(async () => {
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const currentAppMode = appMode || 'admin';
const isRepMode = currentAppMode === 'rep';
const getAccessibleCollections = () => {
return {
download: ['production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers',
'transactions', 'entities', 'inventory', 'factory_history', 'returns', 'expenses'],
upload: ['production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers',
'transactions', 'entities', 'inventory', 'factory_history', 'returns', 'expenses'],
settings: ['settings', 'factorySettings', 'expenseCategories']
};
};
const accessibleCollections = getAccessibleCollections();
let userType = 'returning';
const hasInitialized = await idb.get('firestore_initialized');
const idbCounts = await Promise.all([
idb.get('mfg_pro_pkr', []),
idb.get('customer_sales', []),
idb.get('rep_sales', []),
idb.get('noman_history', []),
idb.get('payment_transactions', []),
idb.get('payment_entities', []),
idb.get('factory_inventory_data', []),
idb.get('factory_production_history', []),
idb.get('stock_returns', []),
idb.get('rep_customers', []),
idb.get('expenses', [])
]);
const totalLocalRecords = idbCounts.reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
const isLocalDataEmpty = totalLocalRecords === 0;
const shouldCheckFirestore = !hasInitialized || isLocalDataEmpty;
if (shouldCheckFirestore) {
try {
const [productionCheck, salesCheck, transactionsCheck, repSalesCheck, entitiesCheck, inventoryCheck, expensesCheck] = await Promise.all([
userRef.collection('production').limit(20).get(),
userRef.collection('sales').limit(20).get(),
userRef.collection('transactions').limit(20).get(),
userRef.collection('rep_sales').limit(20).get(),
userRef.collection('entities').limit(20).get(),
userRef.collection('inventory').limit(20).get(),
userRef.collection('expenses').limit(20).get()
]);
const hasRealData =
productionCheck.docs.some(doc => !doc.data()._placeholder) ||
salesCheck.docs.some(doc => !doc.data()._placeholder) ||
transactionsCheck.docs.some(doc => !doc.data()._placeholder) ||
repSalesCheck.docs.some(doc => !doc.data()._placeholder) ||
entitiesCheck.docs.some(doc => !doc.data()._placeholder) ||
inventoryCheck.docs.some(doc => !doc.data()._placeholder) ||
expensesCheck.docs.some(doc => !doc.data()._placeholder);
if (hasRealData) {
userType = 'existing';
} else {
userType = 'new';
}
} catch (error) {
userType = hasInitialized ? 'returning' : 'new';
}
} else {
userType = 'returning';
}
if (userType === 'new') {
await initializeFirestoreStructure(true);
await idb.set('firestore_initialized', true);
await idb.set('user_state', {
type: 'new',
hasRealData: false,
lastChecked: Date.now(),
initialized: true
});
if (!silent) {
showToast('Your account is ready!', 'success');
}
isSyncing = false;
if (!silent && btn) {
btn.innerHTML = originalText;
}
return;
}
const buildDeltaQuery = async (collection, collectionName) => {
if (userType === 'existing') {
return collection.get();
}
const lastSync = await DeltaSync.getLastSyncFirestoreTimestamp(collectionName);
if (lastSync) {
return collection.where('updatedAt', '>', lastSync).get();
}
return collection.get();
};
const [settingsSnap, factorySettingsSnap, expenseCategoriesSnap] = await Promise.all([
userRef.collection('settings').doc('config').get(),
userRef.collection('factorySettings').doc('config').get(),
userRef.collection('expenseCategories').doc('categories').get()
]);
let productionSnap = null, salesSnap = null, calcHistorySnap = null;
let repSalesSnap = null, repCustomersSnap = null, salesCustomersSnap = null;
let transactionsSnap = null, entitiesSnap = null;
let inventorySnap = null, factoryHistorySnap = null;
let expensesSnap = null, returnsSnap = null;
productionSnap = await buildDeltaQuery(userRef.collection('production'), 'production');
salesSnap = await buildDeltaQuery(userRef.collection('sales'), 'sales');
calcHistorySnap = await buildDeltaQuery(userRef.collection('calculator_history'), 'calculator_history');
[repSalesSnap, repCustomersSnap] = await Promise.all([
buildDeltaQuery(userRef.collection('rep_sales'), 'rep_sales'),
buildDeltaQuery(userRef.collection('rep_customers'), 'rep_customers')
]);
salesCustomersSnap = await buildDeltaQuery(userRef.collection('sales_customers'), 'sales_customers');
[transactionsSnap, entitiesSnap] = await Promise.all([
buildDeltaQuery(userRef.collection('transactions'), 'transactions'),
buildDeltaQuery(userRef.collection('entities'), 'entities')
]);
[inventorySnap, factoryHistorySnap] = await Promise.all([
buildDeltaQuery(userRef.collection('inventory'), 'inventory'),
buildDeltaQuery(userRef.collection('factory_history'), 'factory_history')
]);
[expensesSnap, returnsSnap] = await Promise.all([
buildDeltaQuery(userRef.collection('expenses'), 'expenses'),
buildDeltaQuery(userRef.collection('returns'), 'returns')
]);
trackFirestoreRead(11);
trackFirestoreRead(3);
const extractDocs = (snap) => {
if (!snap) return [];
return snap.docs
.map(doc => ({ id: doc.id, ...doc.data() }))
.filter(doc => !doc._placeholder);
};
const cloudData = {
mfg_pro_pkr: extractDocs(productionSnap),
customer_sales: extractDocs(salesSnap),
noman_history: extractDocs(calcHistorySnap),
rep_sales: extractDocs(repSalesSnap),
rep_customers: extractDocs(repCustomersSnap),
sales_customers: extractDocs(salesCustomersSnap),
payment_transactions: extractDocs(transactionsSnap),
payment_entities: extractDocs(entitiesSnap),
factory_inventory_data: extractDocs(inventorySnap),
factory_production_history: extractDocs(factoryHistorySnap),
stock_returns: extractDocs(returnsSnap),
expenses: extractDocs(expensesSnap)
};
let totalCloudChanges = 0;
Object.values(cloudData).forEach(arr => {
totalCloudChanges += (arr?.length || 0);
});
if (totalCloudChanges === 0) {
if (settingsSnap && settingsSnap.exists) {
const settingsData = settingsSnap.data();
if (settingsData && typeof settingsData === 'object') {
if (settingsData.naswar_default_settings) {
defaultSettings = settingsData.naswar_default_settings;
await idb.set('naswar_default_settings', defaultSettings);
}
}
}
if (factorySettingsSnap && factorySettingsSnap.exists) {
const fsData = factorySettingsSnap.data();
if (fsData && typeof fsData === 'object') {
if (fsData.default_formulas) { factoryDefaultFormulas = fsData.default_formulas; await idb.set('factory_default_formulas', factoryDefaultFormulas); }
if (fsData.additional_costs) { factoryAdditionalCosts = fsData.additional_costs; await idb.set('factory_additional_costs', factoryAdditionalCosts); }
if (fsData.cost_adjustment_factor) { factoryCostAdjustmentFactor = fsData.cost_adjustment_factor; await idb.set('factory_cost_adjustment_factor', factoryCostAdjustmentFactor); }
if (fsData.sale_prices) { factorySalePrices = fsData.sale_prices; await idb.set('factory_sale_prices', factorySalePrices); }
if (fsData.unit_tracking) { factoryUnitTracking = fsData.unit_tracking; await idb.set('factory_unit_tracking', factoryUnitTracking); }
}
}
if (expenseCategoriesSnap && expenseCategoriesSnap.exists) {
const expenseCategoriesData = expenseCategoriesSnap.data();
if (expenseCategoriesData && expenseCategoriesData.categories) {
expenseCategories = expenseCategoriesData.categories;
await idb.set('expense_categories', expenseCategories);
}
}
} else {
if (settingsSnap && settingsSnap.exists) {
const settingsData = settingsSnap.data();
if (settingsData && typeof settingsData === 'object') {
if (settingsData.naswar_default_settings) {
defaultSettings = settingsData.naswar_default_settings;
await idb.set('naswar_default_settings', defaultSettings);
}
}
}
if (expenseCategoriesSnap && expenseCategoriesSnap.exists) {
const expenseCategoriesData = expenseCategoriesSnap.data();
if (expenseCategoriesData && expenseCategoriesData.categories) {
expenseCategories = expenseCategoriesData.categories;
await idb.set('expense_categories', expenseCategories);
}
}
db = mergeArraysByTimestamp(db || [], cloudData.mfg_pro_pkr || []);
customerSales = mergeArraysByTimestamp(customerSales || [], cloudData.customer_sales || []);
salesHistory = mergeArraysByTimestamp(salesHistory || [], cloudData.noman_history || []);
repSales = mergeArraysByTimestamp(repSales || [], cloudData.rep_sales || []);
repCustomers = mergeArraysByTimestamp(repCustomers || [], cloudData.rep_customers || []);
salesCustomers = mergeArraysByTimestamp(salesCustomers || [], cloudData.sales_customers || []);
paymentTransactions = mergeArraysByTimestamp(paymentTransactions || [], cloudData.payment_transactions || []);
paymentEntities = mergeArraysByTimestamp(paymentEntities || [], cloudData.payment_entities || []);
factoryInventoryData = mergeArraysByTimestamp(factoryInventoryData || [], cloudData.factory_inventory_data || []);
factoryProductionHistory = mergeArraysByTimestamp(factoryProductionHistory || [], cloudData.factory_production_history || []);
stockReturns = mergeArraysByTimestamp(stockReturns || [], cloudData.stock_returns || []);
expenseRecords = mergeArraysByTimestamp(expenseRecords || [], cloudData.expenses || []);
const _notDeleted = item => !deletedRecordIds.has(item.id);
db = db.filter(_notDeleted);
customerSales = customerSales.filter(_notDeleted);
salesHistory = salesHistory.filter(_notDeleted);
repSales = repSales.filter(_notDeleted);
repCustomers = repCustomers.filter(_notDeleted);
salesCustomers = salesCustomers.filter(_notDeleted);
paymentTransactions = paymentTransactions.filter(_notDeleted);
paymentEntities = paymentEntities.filter(_notDeleted);
factoryInventoryData = factoryInventoryData.filter(_notDeleted);
factoryProductionHistory = factoryProductionHistory.filter(_notDeleted);
stockReturns = stockReturns.filter(_notDeleted);
expenseRecords = expenseRecords.filter(_notDeleted);
['production','sales','calculator_history','transactions','entities',
'inventory','factory_history','returns','expenses','rep_sales','rep_customers',
'sales_customers','deletions'
].reduce((p, c) => p.then(() => DeltaSync.updateSyncStats(c)), Promise.resolve());
await idb.set('mfg_pro_pkr', db);
await idb.set('customer_sales', customerSales);
await idb.set('noman_history', salesHistory);
await idb.set('factory_inventory_data', factoryInventoryData);
await idb.set('factory_production_history', factoryProductionHistory);
await idb.set('payment_entities', paymentEntities);
await idb.set('payment_transactions', paymentTransactions);
await idb.set('expenses', expenseRecords);
await idb.set('stock_returns', stockReturns);
await idb.set('rep_sales', repSales);
await idb.set('rep_customers', repCustomers);
await idb.set('sales_customers', salesCustomers);
await idb.set('deleted_records', Array.from(deletedRecordIds));
await idb.set('last_synced', new Date().toISOString());
for (const collection of ['production', 'sales', 'calculator_history', 'transactions',
'entities', 'inventory', 'factory_history', 'returns', 'expenses',
'rep_sales', 'rep_customers', 'sales_customers', 'deletions']) {
await DeltaSync.setLastSyncTimestamp(collection);
}
if (userType === 'existing') {
await idb.set('firestore_initialized', true);
await idb.set('user_state', {
type: 'existing',
hasRealData: true,
lastChecked: Date.now(),
initialized: true,
restoredItems: totalCloudChanges
});
['production','sales','calculator_history','transactions','entities',
'inventory','factory_history','returns','expenses','rep_sales',
'rep_customers','sales_customers','deletions'
].reduce((p, c) => p.then(() => DeltaSync.setLastSyncTimestamp(c)), Promise.resolve());
}
}
if (userType === 'existing') {
setTimeout(() => {
if (typeof refreshAllDisplays === 'function') {
refreshAllDisplays();
}
}, 100);
if (!silent) {
const message = `Data fully restored — ${totalCloudChanges} records downloaded`;
showToast(message, 'success');
if(typeof closeDataMenu === 'function') closeDataMenu();
}
setTimeout(async () => {
try {
if (typeof validateAllDataOnStartup === 'function') {
await validateAllDataOnStartup();
}
} catch (error) {
console.error('Data validation encountered an error:', error);
}
}, 2000);
isSyncing = false;
if (!silent && btn) {
btn.innerHTML = originalText;
}
return;
}
const batch = firebaseDB.batch();
let operationCount = 0;
const batches = [batch];
const getCurrentBatch = () => {
if (operationCount >= 450) {
batches.push(firebaseDB.batch());
operationCount = 0;
}
return batches[batches.length - 1];
};
const isRealRecord = (item) => item && item.id && !item._placeholder && item.id !== '_placeholder_';
const collections = {
'production': db.filter(isRealRecord), 'sales': customerSales.filter(isRealRecord), 'rep_sales': repSales.filter(isRealRecord), 'rep_customers': repCustomers.filter(isRealRecord),
'calculator_history': salesHistory.filter(isRealRecord), 'inventory': factoryInventoryData.filter(isRealRecord),
'factory_history': factoryProductionHistory.filter(isRealRecord), 'entities': paymentEntities.filter(isRealRecord),
'transactions': paymentTransactions.filter(isRealRecord), 'expenses': expenseRecords.filter(isRealRecord), 'returns': stockReturns.filter(isRealRecord)
};
let totalItemsToWrite = 0;
let collectionIndex = 0;
const collectionEntries = Object.entries(collections);
const collectionNameMap = {
'production': 'production',
'sales': 'sales',
'calculator_history': 'calculator_history',
'rep_sales': 'rep_sales',
'rep_customers': 'rep_customers',
'inventory': 'inventory',
'factory_history': 'factory_history',
'entities': 'entities',
'transactions': 'transactions',
'expenses': 'expenses',
'returns': 'returns'
};
for (const [collectionName, dataArray] of collectionEntries) {
if (!collectionName || typeof collectionName !== 'string') {
continue;
}
if (Array.isArray(dataArray) && dataArray.length > 0) {
const deltaName = collectionNameMap[collectionName] || collectionName;
const changedItems = await DeltaSync.getChangedItems(deltaName, dataArray);
if (changedItems.length === 0) {
continue;
}
let uploadedCount = 0;
for (let i = 0; i < changedItems.length; i++) {
const item = changedItems[i];
if (item && item.id) {
try {
const docId = String(item.id);
const currentBatch = getCurrentBatch();
if (!docId || docId.includes('/')) {
continue;
}
const sanitizedItem = sanitizeForFirestore(item);
sanitizedItem.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
if (!sanitizedItem || typeof sanitizedItem !== 'object' || Object.keys(sanitizedItem).length === 0) {
continue;
}
if (sanitizedItem.id && typeof sanitizedItem.id !== 'string') {
sanitizedItem.id = String(sanitizedItem.id);
}
currentBatch.set(userRef.collection(collectionName).doc(docId), sanitizedItem, { merge: true });
operationCount++;
uploadedCount++;
totalItemsToWrite++;
trackFirestoreWrite(1);
if (i > 0 && i % 50 === 0) {
}
} catch (itemError) {
console.warn('Cloud save operation failed.', itemError);
}
}
}
if (uploadedCount > 0) {
}
}
collectionIndex++;
if (collectionIndex < collectionEntries.length) {
}
}
if (factorySettingsSnap && factorySettingsSnap.exists) {
const factorySettingsData = factorySettingsSnap.data();
if (factorySettingsData && typeof factorySettingsData === 'object') {
const timestamp = getTimestamp();
if (factorySettingsData.default_formulas) {
const formulas = factorySettingsData.default_formulas;
if (('standard' in formulas) && ('asaan' in formulas)) {
factoryDefaultFormulas = {
standard: Array.isArray(formulas.standard) ? formulas.standard : [],
asaan: Array.isArray(formulas.asaan) ? formulas.asaan : []
};
await idb.set('factory_default_formulas', factoryDefaultFormulas);
await idb.set('factory_default_formulas_timestamp',
factorySettingsData.default_formulas_timestamp || timestamp);
}
}
if (factorySettingsData.additional_costs) {
const costs = factorySettingsData.additional_costs;
if (('standard' in costs) && ('asaan' in costs)) {
factoryAdditionalCosts = {
standard: parseFloat(costs.standard) || 0,
asaan: parseFloat(costs.asaan) || 0
};
await idb.set('factory_additional_costs', factoryAdditionalCosts);
await idb.set('factory_additional_costs_timestamp',
factorySettingsData.additional_costs_timestamp || timestamp);
}
}
if (factorySettingsData.sale_prices) {
const prices = factorySettingsData.sale_prices;
if (('standard' in prices) && ('asaan' in prices)) {
factorySalePrices = {
standard: parseFloat(prices.standard) || 0,
asaan: parseFloat(prices.asaan) || 0
};
await idb.set('factory_sale_prices', factorySalePrices);
await idb.set('factory_sale_prices_timestamp',
factorySettingsData.sale_prices_timestamp || timestamp);
}
}
if (factorySettingsData.cost_adjustment_factor) {
const factor = factorySettingsData.cost_adjustment_factor;
if (('standard' in factor) && ('asaan' in factor)) {
factoryCostAdjustmentFactor = {
standard: parseFloat(factor.standard) || 1,
asaan: parseFloat(factor.asaan) || 1
};
await idb.set('factory_cost_adjustment_factor', factoryCostAdjustmentFactor);
await idb.set('factory_cost_adjustment_factor_timestamp',
factorySettingsData.cost_adjustment_factor_timestamp || timestamp);
}
}
if (factorySettingsData.unit_tracking) {
const tracking = factorySettingsData.unit_tracking;
if (('standard' in tracking) && ('asaan' in tracking)) {
const validateTrackingData = (data) => ({
produced: parseFloat(data?.produced) || 0,
consumed: parseFloat(data?.consumed) || 0,
available: parseFloat(data?.available) || 0,
unitCostHistory: Array.isArray(data?.unitCostHistory) ? data.unitCostHistory : []
});
factoryUnitTracking = {
standard: validateTrackingData(tracking.standard),
asaan: validateTrackingData(tracking.asaan)
};
await idb.set('factory_unit_tracking', factoryUnitTracking);
await idb.set('factory_unit_tracking_timestamp',
factorySettingsData.unit_tracking_timestamp || timestamp);
}
}
if (isRepMode) {
}
refreshFactorySettingsOverlay();
}
}
if (totalItemsToWrite === 0) {
if (!silent) {
showToast(" Already synced ", "success");
}
setTimeout(() => {
if (typeof refreshAllDisplays === 'function') {
refreshAllDisplays();
}
}, 100);
isSyncing = false;
if (!silent && btn) {
btn.innerHTML = originalText;
}
return;
}
const configBatch = getCurrentBatch();
const syncLocalFormulaTs = await idb.get('factory_default_formulas_timestamp');
const syncLocalCostsTs = await idb.get('factory_additional_costs_timestamp');
const syncLocalFactorTs = await idb.get('factory_cost_adjustment_factor_timestamp');
const syncLocalPricesTs = await idb.get('factory_sale_prices_timestamp');
const syncDeviceHasFactoryData = syncLocalFormulaTs || syncLocalCostsTs || syncLocalFactorTs || syncLocalPricesTs;
if (syncDeviceHasFactoryData) {
const factorySettingsPayload = {
default_formulas: factoryDefaultFormulas || { standard: [], asaan: [] },
additional_costs: factoryAdditionalCosts || { standard: 0, asaan: 0 },
sale_prices: factorySalePrices || { standard: 0, asaan: 0 }
};
configBatch.set(userRef.collection('factorySettings').doc('config'), sanitizeForFirestore(factorySettingsPayload), { merge: true });
} else {
}
const settingsPayload = {
naswar_default_settings: defaultSettings || {},
};
const expenseCategoriesPayload = {
categories: expenseCategories || []
};
configBatch.set(userRef.collection('settings').doc('config'), sanitizeForFirestore(settingsPayload), { merge: true });
configBatch.set(userRef.collection('expenseCategories').doc('categories'), sanitizeForFirestore(expenseCategoriesPayload), { merge: true });
for (let i = 0; i < batches.length; i++) {
await batches[i].commit();
if (i < batches.length - 1) {
}
}
setTimeout(() => {
if (typeof refreshAllDisplays === 'function') {
refreshAllDisplays();
}
}, 100);
const syncSummary = {
mode: currentAppMode,
downloaded: totalCloudChanges,
uploaded: totalItemsToWrite,
optimized: (totalCloudChanges === 0 ? 'Skipped merge/save' : 'Processed') +
' | ' +
(totalItemsToWrite === 0 ? 'Skipped upload' : `Uploaded ${totalItemsToWrite} items`) +
` | ${currentAppMode.toUpperCase()} MODE`
};
if (!silent) {
let message;
const modeLabel = `[${currentAppMode.toUpperCase()}] `;
if (userType === 'existing') {
message = `${modeLabel} Your data has been fully restored (${totalCloudChanges} items)`;
} else {
message = totalCloudChanges === 0 && totalItemsToWrite === 0
? `${modeLabel} Already synced - no changes needed`
: totalCloudChanges === 0
? `${modeLabel} Uploaded ${totalItemsToWrite} local changes`
: totalItemsToWrite === 0
? `${modeLabel} Downloaded ${totalCloudChanges} cloud changes`
: `${modeLabel} Synced ${totalCloudChanges} down, ${totalItemsToWrite} up`;
}
showToast(message, "success");
if(typeof closeDataMenu === 'function') closeDataMenu();
}
setTimeout(async () => {
try {
if (typeof validateAllDataOnStartup === 'function') {
await validateAllDataOnStartup();
}
} catch (error) {
console.error('Data validation encountered an error.', error);
showToast('Data validation encountered an error.', 'error');
}
}, 2000);
} catch (e) {
if (!silent) showToast(" Sync error - will retry automatically", "warning");
} finally {
isSyncing = false;
if (!silent && btn) {
btn.innerHTML = originalText;
}
_flushSyncLockQueue().catch(err => console.warn('[SyncLock] Flush error', err));
}
})();
}
async function pushDataToCloud(silent = false) {
if (!firebaseDB || !currentUser) {
if (!silent) showToast('Please sign in to sync data', 'warning');
return;
}
if (isSyncing) {
return;
}
isSyncing = true;
let btn = null;
let originalText = '';
const pushTimeout = setTimeout(() => {
isSyncing = false;
if (!silent) {
showToast(" Upload timeout - Please try again", "warning");
if (btn) {
btn.innerText = originalText;
btn.disabled = false;
}
}
}, 300000);
try {
if (!silent) {
const menuBtn = document.querySelector('#dataMenuOverlay .btn-main');
if (menuBtn) {
btn = menuBtn;
originalText = btn.innerText;
btn.textContent = ' Uploading...';
btn.disabled = true;
} else {
showToast(' Starting upload - app remains usable...', 'info');
}
}
let progressInterval = null;
if (!silent) {
let progressStep = 0;
const progressMessages = [
" Preparing data...",
" Uploading to cloud...",
" Syncing collections...",
"Finalizing upload..."
];
progressInterval = setInterval(() => {
if (progressStep < progressMessages.length) {
showToast(progressMessages[progressStep], "info");
progressStep++;
}
}, 30000);
}
await idb.init();
const dataKeys = [
'mfg_pro_pkr',
'customer_sales',
'rep_sales',
'rep_customers',
'noman_history',
'factory_inventory_data',
'factory_production_history',
'payment_entities',
'payment_transactions',
'stock_returns',
'expenses',
'factory_default_formulas',
'factory_additional_costs',
'factory_cost_adjustment_factor',
'factory_sale_prices',
'factory_unit_tracking',
'naswar_default_settings',
'deleted_records'
];
let freshDataMap = new Map();
if (idb.getBatch) {
freshDataMap = await idb.getBatch(dataKeys);
} else {
for (const key of dataKeys) {
const value = await idb.get(key);
if (value !== null) {
freshDataMap.set(key, value);
}
}
}
if (freshDataMap.get('mfg_pro_pkr')) db = freshDataMap.get('mfg_pro_pkr');
if (freshDataMap.get('customer_sales')) customerSales = freshDataMap.get('customer_sales');
if (freshDataMap.get('rep_sales')) repSales = freshDataMap.get('rep_sales');
if (freshDataMap.get('rep_customers')) repCustomers = freshDataMap.get('rep_customers');
if (freshDataMap.get('noman_history')) salesHistory = freshDataMap.get('noman_history');
if (freshDataMap.get('factory_inventory_data')) factoryInventoryData = freshDataMap.get('factory_inventory_data');
if (freshDataMap.get('factory_production_history')) factoryProductionHistory = freshDataMap.get('factory_production_history');
if (freshDataMap.get('payment_entities')) paymentEntities = freshDataMap.get('payment_entities');
if (freshDataMap.get('payment_transactions')) paymentTransactions = freshDataMap.get('payment_transactions');
if (freshDataMap.get('stock_returns')) stockReturns = freshDataMap.get('stock_returns');
if (freshDataMap.get('expenses')) expenseRecords = freshDataMap.get('expenses');
if (freshDataMap.get('factory_default_formulas')) factoryDefaultFormulas = freshDataMap.get('factory_default_formulas');
if (freshDataMap.get('factory_additional_costs')) factoryAdditionalCosts = freshDataMap.get('factory_additional_costs');
if (freshDataMap.get('factory_cost_adjustment_factor')) factoryCostAdjustmentFactor = freshDataMap.get('factory_cost_adjustment_factor');
if (freshDataMap.get('factory_sale_prices')) factorySalePrices = freshDataMap.get('factory_sale_prices');
if (freshDataMap.get('factory_unit_tracking')) factoryUnitTracking = freshDataMap.get('factory_unit_tracking');
if (freshDataMap.get('naswar_default_settings')) defaultSettings = freshDataMap.get('naswar_default_settings');
if (freshDataMap.get('deleted_records')) {
deletedRecordIds = new Set(freshDataMap.get('deleted_records'));
}
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const batches = [];
let currentBatch = firebaseDB.batch();
let operationCount = 0;
const getCurrentBatch = () => {
if (operationCount >= 450) {
batches.push(currentBatch);
currentBatch = firebaseDB.batch();
operationCount = 0;
}
return currentBatch;
};
const isRealRecord = (item) => item && item.id && !item._placeholder && item.id !== '_placeholder_';
const collections = {
'production': db.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'sales': customerSales.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'rep_sales': repSales.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'rep_customers': repCustomers.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'calculator_history': salesHistory.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'inventory': factoryInventoryData.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'factory_history': factoryProductionHistory.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'entities': paymentEntities.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'transactions': paymentTransactions.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'expenses': expenseRecords.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id)),
'returns': stockReturns.filter(item => isRealRecord(item) && !deletedRecordIds.has(item.id))
};
for (const [collectionName, dataArray] of Object.entries(collections)) {
if (!collectionName || typeof collectionName !== 'string') {
continue;
}
if (Array.isArray(dataArray)) {
const deltaName = collectionName;
const itemsToUpload = await DeltaSync.getChangedItems(deltaName, dataArray);
if (itemsToUpload.length === 0) {
continue;
}
for (const item of itemsToUpload) {
if (item && item.id) {
try {
const batch = getCurrentBatch();
let docId = String(item.id);
if (!docId || docId.includes('/')) {
continue;
}
const docRef = userRef.collection(collectionName).doc(docId);
const sanitizedItem = sanitizeForFirestore(item);
sanitizedItem.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
if (!sanitizedItem || typeof sanitizedItem !== 'object' || Object.keys(sanitizedItem).length === 0) {
continue;
}
if (sanitizedItem.id && typeof sanitizedItem.id !== 'string') {
sanitizedItem.id = String(sanitizedItem.id);
}
batch.set(docRef, sanitizedItem, { merge: true });
operationCount++;
trackFirestoreWrite(1);
} catch (itemError) {
console.warn('Failed to write batch item to Firestore', itemError);
}
}
}
await DeltaSync.setLastSyncTimestamp(deltaName);
}
}
const deletionRecords = await idb.get('deletion_records', []);
const unsyncedDeletions = deletionRecords.filter(record => !record.syncedToCloud);
if (unsyncedDeletions.length > 0) {
for (const deletionRecord of unsyncedDeletions) {
if (!deletionRecord.id) continue;
const deletedAtMs = typeof deletionRecord.deletedAt === 'number' && deletionRecord.deletedAt > 0
? deletionRecord.deletedAt
: Date.now();
try {
const batch = getCurrentBatch();
const deletionsRef = userRef.collection('deletions').doc(String(deletionRecord.id));
batch.set(deletionsRef, {
id: String(deletionRecord.id),
deletedAt: firebase.firestore.Timestamp.fromMillis(deletedAtMs),
collection: deletionRecord.collection || 'unknown',
expiresAt: firebase.firestore.Timestamp.fromMillis(deletedAtMs + (90 * 24 * 60 * 60 * 1000))
});
operationCount++;
if (deletionRecord.collection && deletionRecord.collection !== 'unknown') {
const itemRef = userRef.collection(deletionRecord.collection).doc(String(deletionRecord.id));
batch.delete(itemRef);
operationCount++;
}
deletionRecord.syncedToCloud = true;
} catch (error) {
console.warn('Could not queue deletion record for sync:', deletionRecord.id, error);
}
}
await idb.set('deletion_records', deletionRecords);
}
const now = new Date().toISOString();
const batch = getCurrentBatch();
const ensureFactorySettings = (obj, defaultVal) => {
if (!obj || typeof obj !== 'object') {
return defaultVal;
}
if (Array.isArray(obj)) {
return defaultVal;
}
const hasStandard = ('standard' in obj) && obj.standard !== undefined;
const hasAsaan = ('asaan' in obj) && obj.asaan !== undefined;
if (!hasStandard || !hasAsaan) {
return defaultVal;
}
return {
standard: obj.standard,
asaan: obj.asaan
};
};
const localFormulaTs = await idb.get('factory_default_formulas_timestamp');
const localCostsTs = await idb.get('factory_additional_costs_timestamp');
const localFactorTs = await idb.get('factory_cost_adjustment_factor_timestamp');
const localPricesTs = await idb.get('factory_sale_prices_timestamp');
const localTrackingTs = await idb.get('factory_unit_tracking_timestamp');
const deviceHasLocalFactoryData = localFormulaTs || localCostsTs || localFactorTs || localPricesTs || localTrackingTs;
let sanitizedFactorySettings = null;
const factorySettingsRef = userRef.collection('factorySettings').doc('config');
if (deviceHasLocalFactoryData) {
const factorySettingsPayload = {
default_formulas: ensureFactorySettings(factoryDefaultFormulas, { standard: [], asaan: [] }),
default_formulas_timestamp: localFormulaTs || getTimestamp(),
additional_costs: ensureFactorySettings(factoryAdditionalCosts, { standard: 0, asaan: 0 }),
additional_costs_timestamp: localCostsTs || getTimestamp(),
cost_adjustment_factor: ensureFactorySettings(factoryCostAdjustmentFactor, { standard: 1, asaan: 1 }),
cost_adjustment_factor_timestamp: localFactorTs || getTimestamp(),
sale_prices: ensureFactorySettings(factorySalePrices, { standard: 0, asaan: 0 }),
sale_prices_timestamp: localPricesTs || getTimestamp(),
unit_tracking: ensureFactorySettings(factoryUnitTracking, {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
}),
unit_tracking_timestamp: localTrackingTs || getTimestamp(),
last_synced: now
};
sanitizedFactorySettings = sanitizeForFirestore(factorySettingsPayload);
} else {
try {
const cloudFactorySnap = await factorySettingsRef.get();
if (cloudFactorySnap.exists) {
const cfs = cloudFactorySnap.data();
if (cfs && typeof cfs === 'object') {
if (cfs.default_formulas && ('standard' in cfs.default_formulas) && ('asaan' in cfs.default_formulas)) {
factoryDefaultFormulas = { standard: Array.isArray(cfs.default_formulas.standard) ? cfs.default_formulas.standard : [], asaan: Array.isArray(cfs.default_formulas.asaan) ? cfs.default_formulas.asaan : [] };
await idb.setBatch([['factory_default_formulas', factoryDefaultFormulas], ['factory_default_formulas_timestamp', cfs.default_formulas_timestamp || Date.now()]]);
}
if (cfs.additional_costs && ('standard' in cfs.additional_costs) && ('asaan' in cfs.additional_costs)) {
factoryAdditionalCosts = { standard: parseFloat(cfs.additional_costs.standard) || 0, asaan: parseFloat(cfs.additional_costs.asaan) || 0 };
await idb.setBatch([['factory_additional_costs', factoryAdditionalCosts], ['factory_additional_costs_timestamp', cfs.additional_costs_timestamp || Date.now()]]);
}
if (cfs.cost_adjustment_factor && ('standard' in cfs.cost_adjustment_factor) && ('asaan' in cfs.cost_adjustment_factor)) {
factoryCostAdjustmentFactor = { standard: parseFloat(cfs.cost_adjustment_factor.standard) || 1, asaan: parseFloat(cfs.cost_adjustment_factor.asaan) || 1 };
await idb.setBatch([['factory_cost_adjustment_factor', factoryCostAdjustmentFactor], ['factory_cost_adjustment_factor_timestamp', cfs.cost_adjustment_factor_timestamp || Date.now()]]);
}
if (cfs.sale_prices && ('standard' in cfs.sale_prices) && ('asaan' in cfs.sale_prices)) {
factorySalePrices = { standard: parseFloat(cfs.sale_prices.standard) || 0, asaan: parseFloat(cfs.sale_prices.asaan) || 0 };
await idb.setBatch([['factory_sale_prices', factorySalePrices], ['factory_sale_prices_timestamp', cfs.sale_prices_timestamp || Date.now()]]);
}
if (cfs.unit_tracking && ('standard' in cfs.unit_tracking) && ('asaan' in cfs.unit_tracking)) {
factoryUnitTracking = { standard: cfs.unit_tracking.standard, asaan: cfs.unit_tracking.asaan };
await idb.setBatch([['factory_unit_tracking', factoryUnitTracking], ['factory_unit_tracking_timestamp', cfs.unit_tracking_timestamp || Date.now()]]);
}
refreshFactorySettingsOverlay();
}
} else {
const factorySettingsPayload = {
default_formulas: ensureFactorySettings(factoryDefaultFormulas, { standard: [], asaan: [] }),
default_formulas_timestamp: getTimestamp(),
additional_costs: ensureFactorySettings(factoryAdditionalCosts, { standard: 0, asaan: 0 }),
additional_costs_timestamp: getTimestamp(),
cost_adjustment_factor: ensureFactorySettings(factoryCostAdjustmentFactor, { standard: 1, asaan: 1 }),
cost_adjustment_factor_timestamp: getTimestamp(),
sale_prices: ensureFactorySettings(factorySalePrices, { standard: 0, asaan: 0 }),
sale_prices_timestamp: getTimestamp(),
unit_tracking: ensureFactorySettings(factoryUnitTracking, {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
}),
unit_tracking_timestamp: getTimestamp(),
last_synced: now
};
sanitizedFactorySettings = sanitizeForFirestore(factorySettingsPayload);
}
} catch (fetchErr) {
console.error('Firebase operation failed.', fetchErr);
showToast('Firebase operation failed.', 'error');
}
}
if (sanitizedFactorySettings) {
console.group(' Factory Settings Upload Diagnostic');
if (!sanitizedFactorySettings.default_formulas) {
} else if (Object.keys(sanitizedFactorySettings.default_formulas).length === 0) {
} else {
}
if (!sanitizedFactorySettings.additional_costs) {
} else {
}
console.groupEnd();
const factoryBatch = getCurrentBatch();
factoryBatch.set(factorySettingsRef, sanitizedFactorySettings, { merge: true });
operationCount++;
} else {
}
const expenseCategories = await idb.get('expense_categories') || [];
const expenseCategoriesPayload = {
categories: expenseCategories,
last_synced: now
};
const sanitizedExpenseCategories = sanitizeForFirestore(expenseCategoriesPayload);
const expenseCategoriesRef = userRef.collection('expenseCategories').doc('categories');
const expenseCategoriesBatch = getCurrentBatch();
expenseCategoriesBatch.set(expenseCategoriesRef, sanitizedExpenseCategories, { merge: true });
operationCount++;
const settingsPayload = {
naswar_default_settings: defaultSettings || {},
naswar_default_settings_timestamp: await idb.get('naswar_default_settings_timestamp') || getTimestamp(),
last_synced: now
};
const sanitizedSettings = sanitizeForFirestore(settingsPayload);
const settingsRef = userRef.collection('settings').doc('config');
const settingsBatch = getCurrentBatch();
settingsBatch.set(settingsRef, sanitizedSettings, { merge: true });
operationCount++;
batches.push(currentBatch);
await idb.set('last_synced', now);
try {
await Promise.all(batches.map(b => b.commit()));
} catch (batchError) {
console.error('Failed to save data locally.', batchError);
showToast('Failed to save data locally.', 'error');
if (batchError.message && (batchError.message.includes('indexOf') || batchError.message.includes('is not a function'))) {
}
throw batchError;
}
const pushSummary = {
totalOperations: operationCount,
batchCount: batches.length,
optimized: operationCount === 0 ? 'No changes to upload' : `Uploaded ${operationCount} operations`
};
if (!silent) {
const message = operationCount === 0
? ' Already synced - no changes to upload'
: ` Cloud Backup Complete - ${operationCount} items uploaded`;
showToast(message, 'success');
const display = document.getElementById('lastSyncDisplay');
if (display) display.textContent = `Last Cloud Sync: ${new Date(now).toLocaleString()}`;
}
} catch (error) {
if (!silent) showToast(` Backup failed: ${error.message}`, 'error');
} finally {
if (typeof pushTimeout !== 'undefined') {
clearTimeout(pushTimeout);
}
if (typeof progressInterval !== 'undefined' && progressInterval) {
clearInterval(progressInterval);
}
isSyncing = false;
if (btn) {
btn.innerText = originalText || 'Backup to Cloud';
btn.disabled = false;
}
}
}
async function pullDataFromCloud(silent = false, forceDownload = false) {
if (!firebaseDB || !currentUser) {
if (!silent) showToast('Please sign in to sync data', 'warning');
return;
}
if (isSyncing) {
if (!silent) showToast('Sync in progress...', 'info');
return;
}
isSyncing = true;
try {
if (!silent) showToast('Downloading cloud data...', 'info');
await idb.init();
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const buildDeltaQuery = async (collection, collectionName) => {
const lastSync = await DeltaSync.getLastSyncFirestoreTimestamp(collectionName);
if (lastSync) {
return collection.where('updatedAt', '>', lastSync).get();
}
return collection.get();
};
const [
productionSnap,
salesSnap,
calcHistorySnap,
repSalesSnap,
repCustomersSnap,
transactionsSnap,
entitiesSnap,
inventorySnap,
factoryHistorySnap,
returnsSnap,
expensesSnap,
settingsSnap,
factorySettingsSnap,
expenseCategoriesSnap,
deletionsSnap
] = await Promise.all([
buildDeltaQuery(userRef.collection('production'), 'production'),
buildDeltaQuery(userRef.collection('sales'), 'sales'),
buildDeltaQuery(userRef.collection('calculator_history'), 'calculator_history'),
buildDeltaQuery(userRef.collection('rep_sales'), 'rep_sales'),
buildDeltaQuery(userRef.collection('rep_customers'), 'rep_customers'),
buildDeltaQuery(userRef.collection('transactions'), 'transactions'),
buildDeltaQuery(userRef.collection('entities'), 'entities'),
buildDeltaQuery(userRef.collection('inventory'), 'inventory'),
buildDeltaQuery(userRef.collection('factory_history'), 'factory_history'),
buildDeltaQuery(userRef.collection('returns'), 'returns'),
buildDeltaQuery(userRef.collection('expenses'), 'expenses'),
userRef.collection('settings').doc('config').get(),
userRef.collection('factorySettings').doc('config').get(),
userRef.collection('expenseCategories').doc('categories').get(),
userRef.collection('deletions').get()
]);
for (const collection of ['production', 'sales', 'calculator_history', 'rep_sales', 'rep_customers', 'transactions',
'entities', 'inventory', 'factory_history', 'returns', 'expenses']) {
await DeltaSync.setLastSyncTimestamp(collection);
}
trackFirestoreRead(12);
trackFirestoreRead(3);
const hasData = productionSnap.docs.length > 0 || salesSnap.docs.length > 0 ||
transactionsSnap.docs.length > 0 || repSalesSnap.docs.length > 0 ||
entitiesSnap.docs.length > 0 ||
settingsSnap.exists || factorySettingsSnap.exists;
if (!hasData) {
if (!silent) showToast('Cloud is empty. Nothing to download.', 'info');
isSyncing = false;
return;
}
const cloudProduction = productionSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudSales = salesSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudCalcHistory = calcHistorySnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudRepSales = repSalesSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudRepCustomers = repCustomersSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudTransactions = transactionsSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudEntities = entitiesSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudInventory = inventorySnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudFactoryHistory = factoryHistorySnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudReturns = returnsSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudExpenses = expensesSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => ({ id: doc.id, ...doc.data() }));
const cloudDeletions = deletionsSnap.docs.filter(doc => doc.id !== '_placeholder_' && !doc.data()._placeholder).map(doc => {
const data = doc.data();
return {
id: String(doc.id),
deletedAt: data.deletedAt?.toMillis ? data.deletedAt.toMillis() : data.deletedAt,
collection: data.collection,
syncedToCloud: true
};
});
let localDeletionRecords = await idb.get('deletion_records', []);
const allDeletions = [...localDeletionRecords];
cloudDeletions.forEach(cloudDel => {
if (!allDeletions.find(d => d.id === cloudDel.id)) {
allDeletions.push(cloudDel);
}
});
const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
const validDeletions = allDeletions.filter(record => record.deletedAt > threeMonthsAgo);
await idb.set('deletion_records', validDeletions);
deletedRecordIds.clear();
validDeletions.forEach(record => deletedRecordIds.add(record.id));
await idb.set('deleted_records', Array.from(deletedRecordIds));
const filterDeletedItems = (items) => items.filter(item => !deletedRecordIds.has(item.id));
const filteredCloudProduction = filterDeletedItems(cloudProduction);
const filteredCloudSales = filterDeletedItems(cloudSales);
const filteredCloudCalcHistory = filterDeletedItems(cloudCalcHistory);
const filteredCloudRepSales = filterDeletedItems(cloudRepSales);
const filteredCloudRepCustomers = filterDeletedItems(cloudRepCustomers);
const filteredCloudTransactions = filterDeletedItems(cloudTransactions);
const filteredCloudEntities = filterDeletedItems(cloudEntities);
const filteredCloudInventory = filterDeletedItems(cloudInventory);
const filteredCloudFactoryHistory = filterDeletedItems(cloudFactoryHistory);
const filteredCloudReturns = filterDeletedItems(cloudReturns);
const filteredCloudExpenses = filterDeletedItems(cloudExpenses);
db = mergeArraysByTimestamp(db || [], filteredCloudProduction);
customerSales = mergeArraysByTimestamp(customerSales || [], filteredCloudSales);
salesHistory = mergeArraysByTimestamp(salesHistory || [], filteredCloudCalcHistory);
repSales = mergeArraysByTimestamp(repSales || [], filteredCloudRepSales);
repCustomers = mergeArraysByTimestamp(repCustomers || [], filteredCloudRepCustomers);
paymentTransactions = mergeArraysByTimestamp(paymentTransactions || [], filteredCloudTransactions);
paymentEntities = mergeArraysByTimestamp(paymentEntities || [], filteredCloudEntities);
factoryInventoryData = mergeArraysByTimestamp(factoryInventoryData || [], filteredCloudInventory);
factoryProductionHistory = mergeArraysByTimestamp(factoryProductionHistory || [], filteredCloudFactoryHistory);
stockReturns = mergeArraysByTimestamp(stockReturns || [], filteredCloudReturns);
expenseRecords = mergeArraysByTimestamp(expenseRecords || [], filteredCloudExpenses);
if (factorySettingsSnap.exists) {
const cloudFactorySettings = factorySettingsSnap.data();
if (cloudFactorySettings.default_formulas && typeof cloudFactorySettings.default_formulas === 'object') {
const formulas = cloudFactorySettings.default_formulas;
if (('standard' in formulas) && ('asaan' in formulas)) {
const cloudTimestamp = cloudFactorySettings.default_formulas_timestamp || 0;
const localTimestamp = (await idb.get('factory_default_formulas_timestamp')) || 0;
if (forceDownload || cloudTimestamp > localTimestamp) {
factoryDefaultFormulas = {
standard: Array.isArray(formulas.standard) ? formulas.standard : [],
asaan: Array.isArray(formulas.asaan) ? formulas.asaan : []
};
await idb.setBatch([
['factory_default_formulas', factoryDefaultFormulas],
['factory_default_formulas_timestamp', cloudTimestamp || Date.now()]
]);
}
} else {
}
}
if (cloudFactorySettings.additional_costs && typeof cloudFactorySettings.additional_costs === 'object') {
const costs = cloudFactorySettings.additional_costs;
if (('standard' in costs) && ('asaan' in costs)) {
const cloudTimestamp = cloudFactorySettings.additional_costs_timestamp || 0;
const localTimestamp = (await idb.get('factory_additional_costs_timestamp')) || 0;
if (forceDownload || cloudTimestamp > localTimestamp) {
factoryAdditionalCosts = {
standard: parseFloat(costs.standard) || 0,
asaan: parseFloat(costs.asaan) || 0
};
await idb.setBatch([
['factory_additional_costs', factoryAdditionalCosts],
['factory_additional_costs_timestamp', cloudTimestamp || Date.now()]
]);
}
} else {
}
}
if (cloudFactorySettings.cost_adjustment_factor && typeof cloudFactorySettings.cost_adjustment_factor === 'object') {
const factor = cloudFactorySettings.cost_adjustment_factor;
if (('standard' in factor) && ('asaan' in factor)) {
const cloudTimestamp = cloudFactorySettings.cost_adjustment_factor_timestamp || 0;
const localTimestamp = (await idb.get('factory_cost_adjustment_factor_timestamp')) || 0;
if (forceDownload || cloudTimestamp > localTimestamp) {
factoryCostAdjustmentFactor = {
standard: parseFloat(factor.standard) || 1,
asaan: parseFloat(factor.asaan) || 1
};
await idb.setBatch([
['factory_cost_adjustment_factor', factoryCostAdjustmentFactor],
['factory_cost_adjustment_factor_timestamp', cloudTimestamp || Date.now()]
]);
}
} else {
}
}
if (cloudFactorySettings.sale_prices && typeof cloudFactorySettings.sale_prices === 'object') {
const prices = cloudFactorySettings.sale_prices;
if (('standard' in prices) && ('asaan' in prices)) {
const cloudTimestamp = cloudFactorySettings.sale_prices_timestamp || 0;
const localTimestamp = (await idb.get('factory_sale_prices_timestamp')) || 0;
if (forceDownload || cloudTimestamp > localTimestamp) {
factorySalePrices = {
standard: parseFloat(prices.standard) || 0,
asaan: parseFloat(prices.asaan) || 0
};
await idb.setBatch([
['factory_sale_prices', factorySalePrices],
['factory_sale_prices_timestamp', cloudTimestamp || Date.now()]
]);
}
} else {
}
}
if (cloudFactorySettings.unit_tracking && typeof cloudFactorySettings.unit_tracking === 'object') {
const tracking = cloudFactorySettings.unit_tracking;
if (('standard' in tracking) && ('asaan' in tracking)) {
const cloudTimestamp = cloudFactorySettings.unit_tracking_timestamp || 0;
const localTimestamp = (await idb.get('factory_unit_tracking_timestamp')) || 0;
if (forceDownload || cloudTimestamp > localTimestamp) {
const validateTrackingData = (data) => ({
produced: parseFloat(data?.produced) || 0,
consumed: parseFloat(data?.consumed) || 0,
available: parseFloat(data?.available) || 0,
unitCostHistory: Array.isArray(data?.unitCostHistory) ? data.unitCostHistory : []
});
factoryUnitTracking = {
standard: validateTrackingData(tracking.standard),
asaan: validateTrackingData(tracking.asaan)
};
await idb.setBatch([
['factory_unit_tracking', factoryUnitTracking],
['factory_unit_tracking_timestamp', cloudTimestamp || Date.now()]
]);
}
} else {
}
}
refreshFactorySettingsOverlay();
}
if (expenseCategoriesSnap.exists) {
const cloudExpenseCategories = expenseCategoriesSnap.data();
if (cloudExpenseCategories.categories && Array.isArray(cloudExpenseCategories.categories)) {
const localCategories = await idb.get('expense_categories') || [];
const mergedCategories = [...new Set([...localCategories, ...cloudExpenseCategories.categories])];
expenseCategories = mergedCategories;
await idb.set('expense_categories', expenseCategories);
}
}
if (settingsSnap.exists) {
const cloudSettings = settingsSnap.data();
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
}
db = db.filter(item => !deletedRecordIds.has(item.id));
customerSales = customerSales.filter(item => !deletedRecordIds.has(item.id));
repSales = repSales.filter(item => !deletedRecordIds.has(item.id));
repCustomers = repCustomers.filter(item => !deletedRecordIds.has(item.id));
salesHistory = salesHistory.filter(item => !deletedRecordIds.has(item.id));
paymentTransactions = paymentTransactions.filter(item => !deletedRecordIds.has(item.id));
paymentEntities = paymentEntities.filter(item => !deletedRecordIds.has(item.id));
factoryInventoryData = factoryInventoryData.filter(item => !deletedRecordIds.has(item.id));
hasChanges = true;
factoryProductionHistory = factoryProductionHistory.filter(item => !deletedRecordIds.has(item.id));
stockReturns = stockReturns.filter(item => !deletedRecordIds.has(item.id));
expenseRecords = expenseRecords.filter(item => !deletedRecordIds.has(item.id));
(async () => {
await DeltaSync.updateSyncStats('production');
await DeltaSync.updateSyncStats('sales');
await DeltaSync.updateSyncStats('rep_sales');
await DeltaSync.updateSyncStats('rep_customers');
await DeltaSync.updateSyncStats('calculator_history');
await DeltaSync.updateSyncStats('transactions');
await DeltaSync.updateSyncStats('entities');
await DeltaSync.updateSyncStats('inventory');
await DeltaSync.updateSyncStats('factory_history');
await DeltaSync.updateSyncStats('returns');
await DeltaSync.updateSyncStats('expenses');
await DeltaSync.updateSyncStats('deletions');
})().catch(e => console.warn('[DeltaSync] updateSyncStats batch failed:', e));
if (!factoryDefaultFormulas || typeof factoryDefaultFormulas !== 'object' || !('standard' in factoryDefaultFormulas) || !('asaan' in factoryDefaultFormulas)) {
factoryDefaultFormulas = { standard: [], asaan: [] };
}
if (!factoryAdditionalCosts || typeof factoryAdditionalCosts !== 'object' || !('standard' in factoryAdditionalCosts) || !('asaan' in factoryAdditionalCosts)) {
factoryAdditionalCosts = { standard: 0, asaan: 0 };
}
if (!factoryCostAdjustmentFactor || typeof factoryCostAdjustmentFactor !== 'object' || !('standard' in factoryCostAdjustmentFactor) || !('asaan' in factoryCostAdjustmentFactor)) {
factoryCostAdjustmentFactor = { standard: 1, asaan: 1 };
}
if (!factorySalePrices || typeof factorySalePrices !== 'object' || !('standard' in factorySalePrices) || !('asaan' in factorySalePrices)) {
factorySalePrices = { standard: 0, asaan: 0 };
}
if (!factoryUnitTracking || typeof factoryUnitTracking !== 'object' || !('standard' in factoryUnitTracking) || !('asaan' in factoryUnitTracking)) {
factoryUnitTracking = {
standard: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] },
asaan: { produced: 0, consumed: 0, available: 0, unitCostHistory: [] }
};
}
const saveEntries = [
['mfg_pro_pkr', db],
['customer_sales', customerSales],
['rep_sales', repSales],
['rep_customers', repCustomers],
['noman_history', salesHistory],
['factory_inventory_data', factoryInventoryData],
['factory_production_history', factoryProductionHistory],
['payment_entities', paymentEntities],
['payment_transactions', paymentTransactions],
['stock_returns', stockReturns],
['expenses', expenseRecords],
['factory_default_formulas', factoryDefaultFormulas],
['factory_additional_costs', factoryAdditionalCosts],
['factory_cost_adjustment_factor', factoryCostAdjustmentFactor],
['factory_sale_prices', factorySalePrices],
['factory_unit_tracking', factoryUnitTracking],
['naswar_default_settings', defaultSettings],
['deleted_records', Array.from(deletedRecordIds)],
['last_synced', new Date().toISOString()],
['appMode', appMode],
['current_rep_profile', currentRepProfile]
];
if (idb.setBatch) {
await idb.setBatch(saveEntries);
} else {
await Promise.all(saveEntries.map(([key, value]) => idb.set(key, value)));
}
if (!silent) showToast(' Data Restored Successfully', 'success');
updateUnitsAvailableIndicator();
await refreshAllDisplays();
} catch (error) {
if (!silent) showToast('Restore failed. Using local data.', 'error');
} finally {
isSyncing = false;
}
}
let seamlessBackupTimer = null;
const SEAMLESS_DELAY_MS = 5000;
function triggerSeamlessBackup() {
if (seamlessBackupTimer) {
clearTimeout(seamlessBackupTimer);
}
seamlessBackupTimer = setTimeout(async () => {
if (currentUser && firebaseDB) {
await pushDataToCloud(true);
}
}, SEAMLESS_DELAY_MS);
}
function stopDatabaseHeartbeat() {
if (window.deviceHeartbeatInterval) {
clearInterval(window.deviceHeartbeatInterval);
window.deviceHeartbeatInterval = null;
}
}
const AUTO_BACKUP_INTERVAL = 180000;
function scheduleAutoBackup() {
clearAutoBackup();
return;
if (!currentUser) return;
autoSaveTimer = setInterval(async () => {
if (!currentUser) {
clearAutoBackup();
return;
}
await performOneClickSync(true);
}, AUTO_BACKUP_INTERVAL);
}
function clearAutoBackup() {
if (autoSaveTimer) {
clearInterval(autoSaveTimer);
autoSaveTimer = null;
}
}
async function wakeUpDatabase() {
if (!firebaseDB || !currentUser) return false;
try {
const wakeUpPromise = firebaseDB.collection('users').doc(currentUser.uid)
.collection('settings').doc('config').get();
const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 45000));
await Promise.race([wakeUpPromise, timeoutPromise]);
dbWakeUpAttempted = true;
return true;
} catch (error) {
return false;
}
}
async function wakeUpDatabaseAndSync() {
showToast('Connecting to cloud...', 'info');
const awake = await wakeUpDatabase();
if (awake) {
await pullDataFromCloud(true);
} else {
setTimeout(async () => {
const retryAwake = await wakeUpDatabase();
if (retryAwake) await pullDataFromCloud(true);
}, 5000);
}
}
async function triggerCloudAction(action) {
if (!firebaseDB) {
showToast("Cloud system not initialized. Check internet.", "error");
return;
}
if (isSyncing) {
isSyncing = false;
}
if (!currentUser) {
closeDataMenu();
showToast("Please sign in to access Cloud functions.", "info");
showAuthOverlay();
return;
}
if (action === 'backup') {
await pushDataToCloud(false);
}
if (action === 'restore') {
const _ufc_localCount = Object.keys(localStorage).filter(k => k.startsWith('gznd_')).length;
const _ufc_msg = `Merge the latest cloud data into this device?\n\n• Your local records will be compared with cloud records\n• Newer versions of each record always win\n• No local data will be overwritten or deleted\n• This device only — other devices are unaffected\n\nRecommended if another device has recently added records.`;
if (await showGlassConfirm(_ufc_msg, { title: "Sync from Cloud", confirmText: "Update from Cloud", cancelText: "Cancel" })) {
closeDataMenu();
showToast("Starting Update...", "info");
await pullDataFromCloud(false);
}
}
}
