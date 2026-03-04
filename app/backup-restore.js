async function unifiedBackup() {
if (!currentUser) {
showToast('Please sign in to create a backup.', 'error');
showAuthOverlay();
return;
}
if (currentUser) {
const _bkpMsg = `Choose how to save your data backup.\n\nCloud Backup: Uploads a snapshot to your connected cloud account. Accessible from any signed-in device.\n\nDownload Encrypted File: Saves an AES-256-GCM encrypted backup file to this device. The file is unreadable without your login credentials.\n\n🔐 Your account credentials are used to encrypt the file.`;
if (await showGlassConfirm(_bkpMsg, { title: 'Save Backup', confirmText: 'Cloud Backup', cancelText: 'Download Encrypted File' })) {
await pushDataToCloud();
return;
}
}
const data = {
mfg: db,
sales: await idb.get('noman_history', []),
customerSales: await idb.get('customer_sales', []),
repSales: repSales,
repCustomers: repCustomers,
salesCustomers: salesCustomers,
factoryInventoryData: factoryInventoryData,
factoryProductionHistory: factoryProductionHistory,
factoryDefaultFormulas: factoryDefaultFormulas,
factoryAdditionalCosts: factoryAdditionalCosts,
factoryCostAdjustmentFactor: factoryCostAdjustmentFactor,
factorySalePrices: factorySalePrices,
factoryUnitTracking: factoryUnitTracking,
paymentEntities: paymentEntities,
paymentTransactions: paymentTransactions,
stockReturns: stockReturns,
settings: await idb.get('naswar_default_settings', defaultSettings),
deleted_records: Array.from(deletedRecordIds),
_meta: { encryptedFor: currentUser.email, createdAt: Date.now(), version: 2 }
};
const encEmail = currentUser.email;

const encPassword = await promptVerifiedBackupPassword({ inputId: 'enc_bkp_pwd' });
if (!encPassword) {
showToast('Backup cancelled.', 'info');
return;
}
try {
showToast('🔐 Encrypting backup with AES-256-GCM...', 'info', 3000);
const encryptedBlob = await CryptoEngine.encrypt(data, encEmail, encPassword);
const a = document.createElement('a');
a.href = URL.createObjectURL(encryptedBlob);
const timestamp = new Date().toISOString().split('T')[0];
a.download = `NaswarDealers_SecureBackup_${timestamp}.gznd`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
showToast('🔐 Encrypted backup created! File requires your credentials to restore.', 'success', 5000);
} catch(encErr) {
console.error('Encryption failed:', encErr);
showToast('Encryption failed: ' + encErr.message, 'error');
}
}
async function unifiedRestore(event) {
const file = event.target.files[0];
if (!file) return;
event.target.value = '';
if (!currentUser) {
showToast('Please sign in before restoring a backup.', 'error');
showAuthOverlay();
return;
}
const isEncrypted = file.name.toLowerCase().endsWith('.gznd');
if (isEncrypted) {
const _encRestoreMsg = `Restore data from this encrypted backup file?\n\nHow it works:\n \u2022 Records are merged, not overwritten \u2014 your current data stays\n \u2022 Duplicates are automatically removed\n \u2022 Only new (non-duplicate) records are uploaded to cloud\n \u2022 Other devices are not affected until their next sync\n\nYou will be asked for your account password to decrypt the file.`;
if (!(await showGlassConfirm(_encRestoreMsg, { title: 'Restore From Encrypted Backup', confirmText: 'Restore & Merge', cancelText: 'Cancel' }))) return;
showToast('Encrypted backup detected. Decrypting...', 'info', 4000);
let decPassword = null;

if (!decPassword) {
decPassword = await new Promise((resolve) => {
const modal = document.createElement('div');
modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:20000;';
modal.innerHTML = `
<div class="liquid-card" style="max-width:360px;width:90%;padding:30px;text-align:center;">
<h3 style="margin:0 0 8px 0;color:var(--text-main);">Enter Password to Decrypt</h3>
<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">This backup is encrypted with your account credentials.</p>
<p style="font-size:0.72rem;color:var(--accent);margin-bottom:16px;">Account: <strong>${esc(currentUser.email)}</strong></p>
<input type="password" id="dec-pwd-input" placeholder="Your account password" autocomplete="current-password"
style="width:100%;padding:12px;background:var(--input-bg);border:1px solid var(--glass-border);border-radius:10px;box-sizing:border-box;color:var(--text-main);font-size:0.9rem;margin-bottom:14px;">
<div id="dec-pwd-error" style="font-size:0.75rem;color:var(--danger);min-height:18px;margin-bottom:10px;"></div>
<div style="display:flex;gap:10px;">
<button id="dec-pwd-ok" style="flex:1;padding:11px;background:var(--accent);border:none;border-radius:10px;color:#003d2e;font-weight:700;cursor:pointer;">Decrypt & Restore</button>
<button id="dec-pwd-cancel" style="flex:1;padding:11px;background:var(--input-bg);border:1px solid var(--glass-border);border-radius:10px;color:var(--text-main);cursor:pointer;">Cancel</button>
</div>
</div>`;
document.body.appendChild(modal);
document.getElementById('dec-pwd-ok').onclick = () => {
const val = document.getElementById('dec-pwd-input').value;
document.body.removeChild(modal);
resolve(val || null);
};
document.getElementById('dec-pwd-cancel').onclick = () => {
document.body.removeChild(modal);
resolve(null);
};
setTimeout(() => { const inp = document.getElementById('dec-pwd-input'); if(inp) inp.focus(); }, 100);
});
}
if (!decPassword) { showToast('Restore cancelled.', 'info'); return; }
try {
const arrayBuffer = await file.arrayBuffer();
let data;
try {
data = await CryptoEngine.decrypt(arrayBuffer, currentUser.email, decPassword);
} catch(decErr) {
if (decErr.message === 'WRONG_CREDENTIALS') {
showToast('Wrong password or wrong account. Decryption failed.', 'error', 6000);
} else if (decErr.message === 'INVALID_FORMAT') {
showToast('This file is not a valid encrypted backup.', 'error', 5000);
} else {
showToast('Decryption failed: ' + decErr.message, 'error');
}
return;
}
showToast('Decryption successful! Restoring data...', 'success', 3000);

if (data && data._meta && data._meta.isYearCloseBackup) {
const snap = data._meta.fyCloseSnapshot || {};
const closedDate = snap.lastYearClosedDate ? new Date(snap.lastYearClosedDate).toLocaleDateString() : 'unknown date';

const _ycEstItems = [
  ...(data.mfg || data.mfg_pro_pkr || []), ...(data.sales || data.noman_history || []),
  ...(data.customerSales || []), ...(data.repSales || []),
  ...(data.repCustomers || []), ...(data.salesCustomers || []),
  ...(data.factoryInventoryData || []), ...(data.factoryProductionHistory || []),
  ...(data.stockReturns || []), ...(data.paymentTransactions || []),
  ...(data.paymentEntities || []), ...(data.expenses || [])
];
const _ycEstReads  = _ycEstItems.length + 24; 
const _ycEstWrites = _ycEstItems.length * 2;  
const _ycCostNote  = (typeof buildFirestoreCostEstimate === 'function')
  ? '\n\n' + buildFirestoreCostEstimate(_ycEstReads, _ycEstWrites) : '';
const _ycRestoreMsg = `This backup was created by Close Financial Year on ${closedDate}.\n\nRestoring it will:\n \u2022 REPLACE all current data with the pre-close snapshot\n \u2022 Remove all merged opening-balance records\n \u2022 Reverse the financial year close counter\n \u2022 Upload the reversed data to cloud\n\n\u26a0\ufe0f This is a full reversal — your current year's data will be overwritten.\n\nOnly proceed if you want to completely undo the financial year close.` + _ycCostNote;
if (!(await showGlassConfirm(_ycRestoreMsg, { title: '\u21a9 Reverse Financial Year Close', confirmText: 'Reverse Year Close', cancelText: 'Cancel' }))) {
showToast('Year-close reversal cancelled.', 'info');
return;
}

const _allBackupItems = [
  ...(data.mfg || data.mfg_pro_pkr || []),
  ...(data.sales || data.noman_history || []),
  ...(data.customerSales || []),
  ...(data.repSales || []),
  ...(data.repCustomers || []),
  ...(data.salesCustomers || []),
  ...(data.factoryInventoryData || []),
  ...(data.factoryProductionHistory || []),
  ...(data.stockReturns || []),
  ...(data.paymentTransactions || []),
  ...(data.paymentEntities || []),
  ...(data.expenses || [])
];
const _postCloseDeletions = _allBackupItems.filter(
  item => item && item.id && deletedRecordIds.has(item.id)
);
let _honourDeletions = true; 
if (_postCloseDeletions.length > 0) {
  const _delMsg = `${_postCloseDeletions.length} record${_postCloseDeletions.length !== 1 ? 's' : ''} in this backup `
    + `${_postCloseDeletions.length !== 1 ? 'were' : 'was'} deleted after the year-close backup was taken.\n\n`
    + `\u2022 Keep deletions \u2014 those records stay deleted (recommended if the deletions were intentional)\n`
    + `\u2022 Restore everything \u2014 all ${_postCloseDeletions.length} deleted record${_postCloseDeletions.length !== 1 ? 's' : ''} `
    + `will be brought back as part of the full reversal\n\n`
    + `Which behaviour do you want?`;
  _honourDeletions = await showGlassConfirm(_delMsg, {
    title: '\u26a0\ufe0f Post-Close Deletions Detected',
    confirmText: 'Keep Deletions',
    cancelText: 'Restore Everything'
  });

  
}
await _doYearCloseRestore(data, _honourDeletions);
} else {
await _doRestoreMerge(data);
}
} catch(err) {
showToast('Restore error: ' + err.message, 'error');
}
} else {
const reader = new FileReader();
reader.onload = async (e) => {
try {
const data = JSON.parse(e.target.result);
if (data.repCustomers || data.salesCustomers || data.customerSales || data.repSales || data.mfg_pro_pkr || data.mfg) {
const _rfbMsg = `Restore data from this backup file?\n\nHow it works:\n \u2022 Records are merged, not overwritten \u2014 your current data stays\n \u2022 Duplicates are automatically removed\n \u2022 Only new (non-duplicate) records are uploaded to cloud\n \u2022 Other devices are not affected until their next sync\n\nIf the backup contains older versions of records you have edited since, the newer version is always kept.`;
if (await showGlassConfirm(_rfbMsg, { title: "Restore From Backup File", confirmText: "Restore & Merge", cancelText: "Cancel" })) {
await _doRestoreMerge(data);
}
} else {
showToast("Invalid backup file structure", 'error');
}
} catch (err) {
showToast("Error reading file: " + err.message, 'error');
}
};
reader.readAsText(file);
}
}

function migrateBackupSchema(data) {
  if (!data || typeof data !== 'object') return data;

  const metaVersion = (data._meta && data._meta.version) ? Number(data._meta.version) : null;
  const bkpVersion  = (data.backupMetadata && data.backupMetadata.version)
                      ? String(data.backupMetadata.version)
                      : null;

  
  let version = 0;
  if (metaVersion !== null && !isNaN(metaVersion)) {
    version = metaVersion;
  } else if (bkpVersion !== null) {
    version = parseInt(bkpVersion, 10) || 0;
  }

  
  if (version < 2) {

    if (!data.mfg && data.mfg_pro_pkr) {
      data.mfg = data.mfg_pro_pkr;
    }

    if (!data.sales && data.noman_history) {
      data.sales = data.noman_history;
    }

    if (!data.customerSales && data.customer_sales) {
      data.customerSales = data.customer_sales;
    }

    if (!data.repSales && data.rep_sales) {
      data.repSales = data.rep_sales;
    }

    if (!data.repCustomers && data.rep_customers) {
      data.repCustomers = data.rep_customers;
    }

    if (!data.salesCustomers && data.sales_customers) {
      data.salesCustomers = data.sales_customers;
    }

    if (!data.stockReturns && data.stock_returns) {
      data.stockReturns = data.stock_returns;
    }

    if (!data.paymentTransactions && data.payment_transactions) {
      data.paymentTransactions = data.payment_transactions;
    }

    if (!data.paymentEntities && data.payment_entities) {
      data.paymentEntities = data.payment_entities;
    }

    if (!data.factoryInventoryData && data.factory_inventory_data) {
      data.factoryInventoryData = data.factory_inventory_data;
    }

    if (!data.factoryProductionHistory && data.factory_production_history) {
      data.factoryProductionHistory = data.factory_production_history;
    }

    if (!data.settings && data.naswar_default_settings) {
      data.settings = data.naswar_default_settings;
    }
  }

  

  

  if (data.mfg && !data.mfg_pro_pkr)       data.mfg_pro_pkr   = data.mfg;
  if (data.mfg_pro_pkr && !data.mfg)       data.mfg           = data.mfg_pro_pkr;
  if (data.sales && !data.noman_history)    data.noman_history = data.sales;
  if (data.noman_history && !data.sales)    data.sales         = data.noman_history;

  if (!data._migrated) {
    data._migrated = { fromVersion: version, toVersion: 2, at: Date.now() };
  }
  return data;
}
async function _doRestoreMerge(data) {
showToast('Analyzing backup file...', 'info', 5000);

data = migrateBackupSchema(data);
const getTimestampValue = (record) => {
if (!record) return 0;
let ts = record.updatedAt || record.timestamp || record.createdAt || 0;
if (typeof ts === 'number') {
return ts;
}
if (ts && typeof ts.toMillis === 'function') {
return ts.toMillis();
}
if (ts && typeof ts === 'object') {
if (typeof ts.seconds === 'number') {
return ts.seconds * 1000;
}
if (typeof ts._seconds === 'number') {
return ts._seconds * 1000;
}
}
if (ts instanceof Date) {
return ts.getTime();
}
if (typeof ts === 'string') {
try {
const dateStr = ts.replace('Z', '+00:00');
const date = new Date(dateStr);
const time = date.getTime();
if (!isNaN(time)) {
return time;
}
} catch (e) {
}
}
return 0;
};
const deduplicateByUUID = (array, collectionName) => {
if (!Array.isArray(array) || array.length === 0) return array;
const seen = new Map();
let duplicatesFound = 0;
array.forEach(item => {
if (!item || !item.id) return;
if (!validateUUID(item.id)) item.id = generateUUID();
if (seen.has(item.id)) {
duplicatesFound++;
const existing = seen.get(item.id);
const existingTime = getTimestampValue(existing);
const itemTime = getTimestampValue(item);
if (itemTime > existingTime) {
seen.set(item.id, item);
}
} else {
seen.set(item.id, item);
}
});
if (duplicatesFound > 0) {
showToast(`Cleaned ${collectionName}: removed ${duplicatesFound} duplicates`, 'info');
}
return Array.from(seen.values());
};
if (data.mfg_pro_pkr) data.mfg_pro_pkr = deduplicateByUUID(data.mfg_pro_pkr, 'Production');
if (data.noman_history) data.noman_history = deduplicateByUUID(data.noman_history, 'Calculator History');
if (data.customerSales) data.customerSales = deduplicateByUUID(data.customerSales, 'Customer Sales');
if (data.repSales) data.repSales = deduplicateByUUID(data.repSales, 'Rep Sales');
if (data.repCustomers) data.repCustomers = deduplicateByUUID(data.repCustomers, 'Rep Customers');
if (data.salesCustomers) data.salesCustomers = deduplicateByUUID(data.salesCustomers, 'Sales Customers');
if (data.factoryInventoryData) data.factoryInventoryData = deduplicateByUUID(data.factoryInventoryData, 'Factory Inventory');
if (data.factoryProductionHistory) data.factoryProductionHistory = deduplicateByUUID(data.factoryProductionHistory, 'Factory History');
if (data.stockReturns) data.stockReturns = deduplicateByUUID(data.stockReturns, 'Stock Returns');
if (data.paymentTransactions) data.paymentTransactions = deduplicateByUUID(data.paymentTransactions, 'Payment Transactions');
if (data.paymentEntities) data.paymentEntities = deduplicateByUUID(data.paymentEntities, 'Payment Entities');
if (data.expenses) data.expenses = deduplicateByUUID(data.expenses, 'Expenses');

data.mfg           = data.mfg_pro_pkr;
data.sales         = data.noman_history;
showToast(' Backup cleaned! Restoring with smart merge...', 'success');
if (data.deleted_records && Array.isArray(data.deleted_records)) {
data.deleted_records.forEach(id => deletedRecordIds.add(id));
await idb.set('deleted_records', Array.from(deletedRecordIds));
}
const isAlive = (item) => {
if (!item || !item.id) return false;
if (deletedRecordIds.has(item.id)) {
return false;
}
return true;
};
const currentLocalData = {
mfg_pro_pkr: await idb.get('mfg_pro_pkr') || [],
noman_history: await idb.get('noman_history') || [],
customer_sales: await idb.get('customer_sales') || [],
rep_sales: await idb.get('rep_sales') || [],
rep_customers: await idb.get('rep_customers') || [],
sales_customers: await idb.get('sales_customers') || [],
factory_inventory_data: await idb.get('factory_inventory_data') || [],
factory_production_history: await idb.get('factory_production_history') || [],
stock_returns: await idb.get('stock_returns') || [],
payment_transactions: await idb.get('payment_transactions') || [],
payment_entities: await idb.get('payment_entities') || [],
expenses: await idb.get('expenses') || []
};
const cleanBackupData = {
mfg_pro_pkr: ensureArray(data.mfg || data.mfg_pro_pkr).filter(isAlive),
noman_history: ensureArray(data.sales || data.noman_history).filter(isAlive),
customer_sales: ensureArray(data.customerSales).filter(isAlive),
rep_sales: ensureArray(data.repSales).filter(isAlive),
rep_customers: ensureArray(data.repCustomers).filter(isAlive),
sales_customers: ensureArray(data.salesCustomers).filter(isAlive),
factory_inventory_data: ensureArray(data.factoryInventoryData).filter(isAlive),
factory_production_history: ensureArray(data.factoryProductionHistory).filter(isAlive),
stock_returns: ensureArray(data.stockReturns).filter(isAlive),
payment_transactions: ensureArray(data.paymentTransactions).filter(isAlive),
payment_entities: ensureArray(data.paymentEntities).filter(isAlive),
expenses: ensureArray(data.expenses).filter(isAlive)
};
let totalAdded = 0;
let totalUpdated = 0;
let totalSkipped = 0;
const mergedData = {};
for (const [key, backupArray] of Object.entries(cleanBackupData)) {
const localArray = currentLocalData[key] || [];
const merged = mergeArraysByTimestamp(localArray, backupArray);
const localIds = new Set(localArray.map(item => item.id));
backupArray.forEach(backupItem => {
if (!localIds.has(backupItem.id)) {
totalAdded++;
} else {
const localItem = localArray.find(item => item.id === backupItem.id);
const backupTs = backupItem.timestamp || backupItem.updatedAt || backupItem.createdAt || 0;
const localTs = localItem?.timestamp || localItem?.updatedAt || localItem?.createdAt || 0;
const backupTime = typeof backupTs === 'number' ? backupTs : new Date(backupTs).getTime();
const localTime = typeof localTs === 'number' ? localTs : new Date(localTs).getTime();
if (backupTime > localTime) {
totalUpdated++;
} else {
totalSkipped++;
}
}
});
mergedData[key] = merged;
}
await Promise.all([
idb.set('mfg_pro_pkr', mergedData.mfg_pro_pkr),
idb.set('noman_history', mergedData.noman_history),
idb.set('customer_sales', mergedData.customer_sales),
idb.set('rep_sales', mergedData.rep_sales),
idb.set('rep_customers', mergedData.rep_customers),
idb.set('sales_customers', mergedData.sales_customers),
idb.set('factory_inventory_data', mergedData.factory_inventory_data),
idb.set('factory_production_history', mergedData.factory_production_history),
idb.set('stock_returns', mergedData.stock_returns),
idb.set('payment_transactions', mergedData.payment_transactions),
idb.set('payment_entities', mergedData.payment_entities),
idb.set('expenses', mergedData.expenses)
]);
const currentSettings = {
factoryDefaultFormulas: await idb.get('factory_default_formulas'),
factoryAdditionalCosts: await idb.get('factory_additional_costs'),
factoryCostAdjustmentFactor: await idb.get('factory_cost_adjustment_factor'),
factorySalePrices: await idb.get('factory_sale_prices'),
factoryUnitTracking: await idb.get('factory_unit_tracking'),
naswarDefaultSettings: await idb.get('naswar_default_settings')
};
const settingsTimestamp = Date.now();
if (data.factoryDefaultFormulas && JSON.stringify(data.factoryDefaultFormulas) !== JSON.stringify(currentSettings.factoryDefaultFormulas)) {
await idb.set('factory_default_formulas', data.factoryDefaultFormulas);
await idb.set('factory_default_formulas_timestamp', settingsTimestamp);
factoryDefaultFormulas = data.factoryDefaultFormulas;
}
if (data.factoryAdditionalCosts && JSON.stringify(data.factoryAdditionalCosts) !== JSON.stringify(currentSettings.factoryAdditionalCosts)) {
await idb.set('factory_additional_costs', data.factoryAdditionalCosts);
await idb.set('factory_additional_costs_timestamp', settingsTimestamp);
factoryAdditionalCosts = data.factoryAdditionalCosts;
}
if (data.factoryCostAdjustmentFactor && JSON.stringify(data.factoryCostAdjustmentFactor) !== JSON.stringify(currentSettings.factoryCostAdjustmentFactor)) {
await idb.set('factory_cost_adjustment_factor', data.factoryCostAdjustmentFactor);
await idb.set('factory_cost_adjustment_factor_timestamp', settingsTimestamp);
factoryCostAdjustmentFactor = data.factoryCostAdjustmentFactor;
}
if (data.factorySalePrices && JSON.stringify(data.factorySalePrices) !== JSON.stringify(currentSettings.factorySalePrices)) {
await idb.set('factory_sale_prices', data.factorySalePrices);
await idb.set('factory_sale_prices_timestamp', settingsTimestamp);
factorySalePrices = data.factorySalePrices;
}
if (data.factoryUnitTracking && JSON.stringify(data.factoryUnitTracking) !== JSON.stringify(currentSettings.factoryUnitTracking)) {
await idb.set('factory_unit_tracking', data.factoryUnitTracking);
await idb.set('factory_unit_tracking_timestamp', settingsTimestamp);
factoryUnitTracking = data.factoryUnitTracking;
}
if (data.settings && JSON.stringify(data.settings) !== JSON.stringify(currentSettings.naswarDefaultSettings)) {
await idb.set('naswar_default_settings', data.settings);
await idb.set('naswar_default_settings_timestamp', settingsTimestamp);
defaultSettings = data.settings;
}
await loadAllData();
try { syncFactoryProductionStats(); } catch(e) { console.error('Factory stats error:', e); }
try { await invalidateAllCaches(); } catch(e) { console.error('Cache invalidation error:', e); }
try { await refreshAllDisplays(); } catch(e) { console.error('Display refresh error:', e); }
let cloudSyncSuccess = false;
if (firebaseDB && currentUser) {
try {
showToast('Analyzing records for intelligent upload...', 'info');
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const collectionMapping = {
'production': { data: ensureArray(mergedData.mfg_pro_pkr), deltaName: 'production' },
'sales': { data: ensureArray(mergedData.customer_sales), deltaName: 'sales' },
'calculator_history': { data: ensureArray(mergedData.noman_history), deltaName: 'calculator_history' },
'rep_sales': { data: ensureArray(mergedData.rep_sales), deltaName: 'rep_sales' },
'rep_customers': { data: ensureArray(mergedData.rep_customers), deltaName: 'rep_customers' },
'sales_customers': { data: ensureArray(mergedData.sales_customers), deltaName: 'sales_customers' },
'inventory': { data: ensureArray(mergedData.factory_inventory_data), deltaName: 'inventory' },
'factory_history': { data: ensureArray(mergedData.factory_production_history), deltaName: 'factory_history' },
'returns': { data: ensureArray(mergedData.stock_returns), deltaName: 'returns' },
'transactions': { data: ensureArray(mergedData.payment_transactions), deltaName: 'transactions' },
'entities': { data: ensureArray(mergedData.payment_entities), deltaName: 'entities' },
'expenses': { data: ensureArray(mergedData.expenses), deltaName: 'expenses' }
};

const itemsToUpload = {};
let totalToUpload = 0;
for (const [cloudName, config] of Object.entries(collectionMapping)) {
const allItems = config.data.filter(item => item);
itemsToUpload[cloudName] = allItems;
totalToUpload += allItems.length;
}
const batch = firebaseDB.batch();
let operationCount = 0;
const batches = [batch];
const getCurrentBatch = () => {
if (operationCount >= 495) {
batches.push(firebaseDB.batch());
operationCount = 0;
}
return batches[batches.length - 1];
};
if (totalToUpload === 0) {
showToast(' No records found in backup to upload.', 'info');
} else {
showToast(`Uploading ${totalToUpload} records to cloud...`, 'info');
for (const [cloudCollectionName, records] of Object.entries(itemsToUpload)) {
for (const record of records) {
if (!record || !record.id) continue;
try {
const docId = String(record.id);
const sanitizedRecord = sanitizeForFirestore(record);
if (!sanitizedRecord || typeof sanitizedRecord !== 'object') continue;
sanitizedRecord.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
const currentBatch = getCurrentBatch();
currentBatch.set(userRef.collection(cloudCollectionName).doc(docId), sanitizedRecord, { merge: true });
operationCount++;
trackFirestoreWrite(1);
} catch (error) { console.error('Cloud save op failed', error); }
}
}
}
try {
const currentBatch = getCurrentBatch();
const ensureFactorySettings = (obj, defaultVal) => {
if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return defaultVal;
const hasStandard = ('standard' in obj) && obj.standard !== undefined;
const hasAsaan = ('asaan' in obj) && obj.asaan !== undefined;
if (!hasStandard || !hasAsaan) return defaultVal;
return { standard: obj.standard, asaan: obj.asaan };
};
const currentTimestamp = new Date().toISOString();
const factorySettingsPayload = {
default_formulas: ensureFactorySettings(await idb.get('factory_default_formulas'), { standard: [], asaan: [] }),
default_formulas_timestamp: await idb.get('factory_default_formulas_timestamp') || currentTimestamp,
additional_costs: ensureFactorySettings(await idb.get('factory_additional_costs'), { standard: 0, asaan: 0 }),
additional_costs_timestamp: await idb.get('factory_additional_costs_timestamp') || currentTimestamp,
cost_adjustment_factor: ensureFactorySettings(await idb.get('factory_cost_adjustment_factor'), { standard: 1, asaan: 1 }),
cost_adjustment_factor_timestamp: await idb.get('factory_cost_adjustment_factor_timestamp') || currentTimestamp,
sale_prices: ensureFactorySettings(await idb.get('factory_sale_prices'), { standard: 0, asaan: 0 }),
sale_prices_timestamp: await idb.get('factory_sale_prices_timestamp') || currentTimestamp,
unit_tracking: ensureFactorySettings(await idb.get('factory_unit_tracking'), { standard: { produced:0,consumed:0,available:0,unitCostHistory:[] }, asaan: { produced:0,consumed:0,available:0,unitCostHistory:[] } }),
unit_tracking_timestamp: await idb.get('factory_unit_tracking_timestamp') || currentTimestamp,
last_synced: new Date().toISOString()
};
const sanitizedFactorySettings = sanitizeForFirestore(factorySettingsPayload);
const factorySettingsRef = userRef.collection('factorySettings').doc('config');
currentBatch.set(factorySettingsRef, sanitizedFactorySettings, { merge: true });
operationCount++;
} catch (factorySettingsError) { console.error('Factory settings cloud error', factorySettingsError); }
if (operationCount > 0) {
await Promise.all(batches.map(b => b.commit()));
for (const [cloudName, config] of Object.entries(collectionMapping)) {
if (itemsToUpload[cloudName] && itemsToUpload[cloudName].length > 0) {
await DeltaSync.setLastSyncTimestamp(config.deltaName);
}
}
cloudSyncSuccess = true;
const message = totalToUpload > 0
? ` Successfully restored & uploaded ${totalToUpload} records + factory settings to cloud!`
: ' Factory settings uploaded to cloud!';
showToast(message, 'success');
} else {
showToast(' No changes to upload.', 'info');
cloudSyncSuccess = true;
}
} catch (syncError) {
showToast('Data restored locally, but cloud sync failed. Please sync manually.', 'warning');
}
} else {
showToast('Not logged in to cloud. Data restored locally only.', 'warning');
}
const statsMessage = `Added: ${totalAdded}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}`;
const syncMessage = cloudSyncSuccess ? ' and changed records uploaded to cloud' : '';
showToast(`Restore complete${syncMessage}! ${statsMessage}`, 'success', 5000);
}

async function _doYearCloseRestore(data, honourPostCloseDeletions = true) {
  data = migrateBackupSchema(data);
  showToast('↩ Reversing financial year close — replacing data...', 'info', 5000);

  

  

  const isAlive = honourPostCloseDeletions
    ? (item) => item && item.id && !deletedRecordIds.has(item.id)
    : (item) => item && item.id; 
  const replaceData = {
    mfg_pro_pkr:                ensureArray(data.mfg || data.mfg_pro_pkr).filter(isAlive),
    noman_history:              ensureArray(data.sales || data.noman_history).filter(isAlive),
    customer_sales:             ensureArray(data.customerSales).filter(isAlive),
    rep_sales:                  ensureArray(data.repSales).filter(isAlive),
    rep_customers:              ensureArray(data.repCustomers).filter(isAlive),
    sales_customers:            ensureArray(data.salesCustomers).filter(isAlive),
    factory_inventory_data:     ensureArray(data.factoryInventoryData).filter(isAlive),
    factory_production_history: ensureArray(data.factoryProductionHistory).filter(isAlive),
    stock_returns:              ensureArray(data.stockReturns).filter(isAlive),
    payment_transactions:       ensureArray(data.paymentTransactions).filter(isAlive),
    payment_entities:           ensureArray(data.paymentEntities).filter(isAlive),
    expenses:                   ensureArray(data.expenses).filter(isAlive)
  };
  await Promise.all([
    idb.set('mfg_pro_pkr',                replaceData.mfg_pro_pkr),
    idb.set('noman_history',              replaceData.noman_history),
    idb.set('customer_sales',             replaceData.customer_sales),
    idb.set('rep_sales',                  replaceData.rep_sales),
    idb.set('rep_customers',              replaceData.rep_customers),
    idb.set('sales_customers',            replaceData.sales_customers),
    idb.set('factory_inventory_data',     replaceData.factory_inventory_data),
    idb.set('factory_production_history', replaceData.factory_production_history),
    idb.set('stock_returns',              replaceData.stock_returns),
    idb.set('payment_transactions',       replaceData.payment_transactions),
    idb.set('payment_entities',           replaceData.payment_entities),
    idb.set('expenses',                   replaceData.expenses)
  ]);
  const settingsTimestamp = Date.now();
  if (data.factoryDefaultFormulas) { await idb.set('factory_default_formulas', data.factoryDefaultFormulas); await idb.set('factory_default_formulas_timestamp', settingsTimestamp); factoryDefaultFormulas = data.factoryDefaultFormulas; }
  if (data.factoryAdditionalCosts) { await idb.set('factory_additional_costs', data.factoryAdditionalCosts); await idb.set('factory_additional_costs_timestamp', settingsTimestamp); factoryAdditionalCosts = data.factoryAdditionalCosts; }
  if (data.factoryCostAdjustmentFactor) { await idb.set('factory_cost_adjustment_factor', data.factoryCostAdjustmentFactor); await idb.set('factory_cost_adjustment_factor_timestamp', settingsTimestamp); factoryCostAdjustmentFactor = data.factoryCostAdjustmentFactor; }
  if (data.factorySalePrices) { await idb.set('factory_sale_prices', data.factorySalePrices); await idb.set('factory_sale_prices_timestamp', settingsTimestamp); factorySalePrices = data.factorySalePrices; }
  if (data.factoryUnitTracking) { await idb.set('factory_unit_tracking', data.factoryUnitTracking); await idb.set('factory_unit_tracking_timestamp', settingsTimestamp); factoryUnitTracking = data.factoryUnitTracking; }

  try {
    const currentSettings = await idb.get('naswar_default_settings', {});
    const snap = (data._meta && data._meta.fyCloseSnapshot) || {};
    currentSettings.fyCloseCount       = snap.fyCloseCount       ?? Math.max(0, (currentSettings.fyCloseCount || 1) - 1);
    currentSettings.lastYearClosedAt   = snap.lastYearClosedAt   ?? null;
    currentSettings.lastYearClosedDate = snap.lastYearClosedDate ?? null;
    currentSettings.pendingFirestoreYearClose = false;
    pendingFirestoreYearClose = false;
    await idb.set('naswar_default_settings', currentSettings);
    await idb.set('pendingFirestoreYearClose', false);
    defaultSettings = currentSettings;
    if (firebaseDB && currentUser) {
      try {
        await firebaseDB.collection('users').doc(currentUser.uid)
          .collection('settings').doc('naswar_default_settings')
          .set({ fyCloseCount: currentSettings.fyCloseCount, lastYearClosedAt: currentSettings.lastYearClosedAt, lastYearClosedDate: currentSettings.lastYearClosedDate }, { merge: true });
      } catch(e) { console.warn('Cloud FY meta reversal failed:', e); }
    }
  } catch(metaErr) { console.warn('Could not reverse FY metadata:', metaErr); }

  if (firebaseDB && currentUser) {
    try {
      showToast('Uploading reversed data to cloud...', 'info');
      const userRef = firebaseDB.collection('users').doc(currentUser.uid);
      const cloudCollections = {
        production: replaceData.mfg_pro_pkr, sales: replaceData.customer_sales,
        calculator_history: replaceData.noman_history, rep_sales: replaceData.rep_sales,
        rep_customers: replaceData.rep_customers, sales_customers: replaceData.sales_customers,
        inventory: replaceData.factory_inventory_data, factory_history: replaceData.factory_production_history,
        returns: replaceData.stock_returns, transactions: replaceData.payment_transactions,
        entities: replaceData.payment_entities, expenses: replaceData.expenses
      };
      for (const [colName, records] of Object.entries(cloudCollections)) {
        try {
          const colRef = userRef.collection(colName);


          

          
          const healSnap = await colRef.where('_pendingDelete', '==', true).get();
          if (!healSnap.empty) {
            const healBatches = [firebaseDB.batch()]; let healOps = 0;
            healSnap.docs.forEach(doc => {
              if (healOps >= 495) { healBatches.push(firebaseDB.batch()); healOps = 0; }
              healBatches[healBatches.length-1].delete(doc.ref);
              healOps++;
            });
            await Promise.all(healBatches.map(b => b.commit()));
          }


          

          

          
          const incomingIds = new Set(
            records.filter(r => r && r.id).map(r => String(r.id))
          );
          const preSnap = await colRef.get();
          const staleDocs = preSnap.docs.filter(doc => !incomingIds.has(doc.id) && doc.id !== '_placeholder_' && !doc.data()._placeholder);
          if (staleDocs.length > 0) {
            const markBatches = [firebaseDB.batch()]; let markOps = 0;
            staleDocs.forEach(doc => {
              if (markOps >= 495) { markBatches.push(firebaseDB.batch()); markOps = 0; }
              markBatches[markBatches.length-1].update(doc.ref, { _pendingDelete: true });
              markOps++;
            });
            await Promise.all(markBatches.map(b => b.commit()));
          }


          

          
          const wrBatches = [firebaseDB.batch()]; let wrOps = 0;
          for (const record of records) {
            if (!record || !record.id) continue;
            const sanitized = sanitizeForFirestore(record);
            if (!sanitized) continue;
            if (wrOps >= 495) { wrBatches.push(firebaseDB.batch()); wrOps = 0; }
            wrBatches[wrBatches.length-1].set(colRef.doc(String(record.id)), sanitized, { merge: false });
            wrOps++; trackFirestoreWrite(1);
          }
          if (wrOps > 0) await Promise.all(wrBatches.map(b => b.commit()));


          

          
          if (staleDocs.length > 0) {
            const delBatches = [firebaseDB.batch()]; let delOps = 0;
            staleDocs.forEach(doc => {
              if (delOps >= 495) { delBatches.push(firebaseDB.batch()); delOps = 0; }
              delBatches[delBatches.length-1].delete(doc.ref);
              delOps++;
            });
            await Promise.all(delBatches.map(b => b.commit()));
          }

          await DeltaSync.setLastSyncTimestamp(colName);
        } catch(colErr) { console.warn(`Cloud replace warning for ${colName}:`, colErr); }
      }
      showToast('☁️ Cloud data replaced with pre-close snapshot', 'success', 3000);
    } catch(cloudErr) {
      console.warn('Cloud replace failed:', cloudErr);
      showToast('Local data reversed. Cloud sync failed — sync manually.', 'warning', 5000);
    }
  }
  await loadAllData();
  try { syncFactoryProductionStats(); } catch(e) {}
  try { await invalidateAllCaches(); } catch(e) {}
  try { await refreshAllDisplays(); } catch(e) {}
  const totalRecords = Object.values(replaceData).reduce((s, a) => s + a.length, 0);
  showToast(`✅ Financial year close reversed! ${totalRecords} pre-close records restored.`, 'success', 6000);
}
