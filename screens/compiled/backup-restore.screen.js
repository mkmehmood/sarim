
// ==== module: backup-restore.js ====
import { ensureArray, sqliteStore, loadCollections, currentUser, CryptoEngine, _triggerFileDownload, _safeErr } from '../../modules/business.js';
import { closeDataMenu } from '../../modules/utilities-payments.js';
import { showToast } from '../../modules/customers.js';
import { showAuthOverlay } from '../../modules/sync.js';
import { defaultSettings } from '../../modules/utilities-core.js';
import { collectAuxBackupFields } from '../../modules/link-graph.js';
import { promptVerifiedBackupPassword } from '../../modules/utilities-sales.js';
import { localDateStr } from '../../modules/finance.js';

export async function triggerLocalBackup() {
const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
const factoryCostAdjustmentFactor = (await sqliteStore.get('adjustment')) || {};
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const appStoresSnapshot = ensureArray(await sqliteStore.get('stores'));
const { production, transactions, entities, returns, inventory, factory } = await loadCollections('production', 'transactions', 'entities', 'returns', 'inventory', 'factory');
closeDataMenu();
if (!currentUser) {
showToast('Please sign in to create a backup.', 'error');
showAuthOverlay();
return;
}
const data = {
production: production,
calculator: await sqliteStore.get('calculator', []),
sales: await sqliteStore.get('sales', []),
rep: await sqliteStore.get('rep', []),
clients: await sqliteStore.get('clients', []),
customers: await sqliteStore.get('customers', []),
inventory: inventory,
factory: factory,
defaults: factoryDefaultFormulas,
costs: factoryAdditionalCosts,
adjustment: factoryCostAdjustmentFactor,
tracking: factoryUnitTracking,
stores: appStoresSnapshot,
entities: entities,
transactions: transactions,
expenses: await sqliteStore.get('expenses', []),
returns: returns,
settings: await sqliteStore.get('settings', defaultSettings),
deleted: Array.from(deletedRecordIds),
...(await collectAuxBackupFields(sqliteStore)),
_meta: { encryptedFor: currentUser.email, encryptedUid: currentUser.uid, createdAt: Date.now(), version: 4 }
};
const encPassword = await promptVerifiedBackupPassword({ inputId: 'enc_local_bkp_pwd' });
if (!encPassword) {
return;
}
try {
const encryptedBlob = await CryptoEngine.encrypt(data, currentUser.email, encPassword, currentUser.uid);
const timestamp = localDateStr();
_triggerFileDownload(encryptedBlob, `NaswarDealers_SecureBackup_${timestamp}.gznd`);
window.showGlassAlert('Encrypted backup saved! Only your account and credentials can restore this file.', { tone: 'success', title: 'Backup Saved' });
} catch(encErr) {
console.error('Encryption failed:', _safeErr(encErr));
window.notifyBlocking('Encryption failed: ' + encErr.message, 'error', 'Something went wrong');
}
}

Object.assign(window, { triggerLocalBackup });

export const __screenHtml = "<div id=\"backup-restore-screen\" class=\"standalone-screen d-none\">\n  <div class=\"shell-bar screen-topbar\">\n    <h2 class=\"screen-title\">Backup &amp; Restore</h2>\n  </div>\n  <div class=\"screen-body\">\n    <p class=\"settings-group-label\">Backup</p>\n    <div class=\"card settings-list-item\" onclick=\"triggerLocalBackup()\">\n      <div class=\"settings-list-item-icon st-background__fbe8aa\">\n        <svg width=\"18\" height=\"18\" viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M10 27A6.5 6.5 0 0 1 9.2 14.05 9 9 0 0 1 26.6 12.5 7.2 7.2 0 0 1 26 27Z\" fill=\"var(--accent)\" fill-opacity=\"0.14\" stroke=\"var(--accent)\" stroke-width=\"1.7\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M18 31V17.5M12.8 22.2L18 17 23.2 22.2\" stroke=\"var(--accent-gold)\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/><path class=\"ic-sp\" d=\"M31 3.2Q31 6 33.8 6Q31 6 31 8.8Q31 6 28.2 6Q31 6 31 3.2Z\" fill=\"var(--accent-gold)\"/></svg>\n      </div>\n      <div class=\"settings-list-item-info\">\n        <p class=\"settings-list-item-title\">Backup to Phone</p>\n        <p class=\"settings-list-item-desc\">Save a local copy of all data to your device</p>\n      </div>\n      <svg class=\"settings-list-item-chevron\" width=\"16\" height=\"16\" viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"18\" cy=\"18\" r=\"15\" fill=\"currentColor\" fill-opacity=\".1\"/><path d=\"M15 11.5L21.5 18L15 24.5\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>\n    </div>\n    <p class=\"settings-group-label\">Restore</p>\n    <div class=\"card settings-list-item\" onclick=\"document.getElementById('restoreInput').click()\">\n      <div class=\"settings-list-item-icon st-background__79f351\">\n        <svg width=\"18\" height=\"18\" viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M10 27A6.5 6.5 0 0 1 9.2 14.05 9 9 0 0 1 26.6 12.5 7.2 7.2 0 0 1 26 27Z\" fill=\"var(--warning)\" fill-opacity=\"0.14\" stroke=\"var(--warning)\" stroke-width=\"1.7\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M18 17V31M12.8 25.8L18 31 23.2 25.8\" stroke=\"var(--warning)\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/><path class=\"ic-sp\" d=\"M31 3.2Q31 6 33.8 6Q31 6 31 8.8Q31 6 28.2 6Q31 6 31 3.2Z\" fill=\"var(--warning)\"/></svg>\n      </div>\n      <div class=\"settings-list-item-info\">\n        <p class=\"settings-list-item-title\">Restore from Phone</p>\n        <p class=\"settings-list-item-desc\">Load a previously saved backup file</p>\n      </div>\n      <svg class=\"settings-list-item-chevron\" width=\"16\" height=\"16\" viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"18\" cy=\"18\" r=\"15\" fill=\"currentColor\" fill-opacity=\".1\"/><path d=\"M15 11.5L21.5 18L15 24.5\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>\n    </div>\n  </div>\n</div>";
export const __screenCss = "\n";
