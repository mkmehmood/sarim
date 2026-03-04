const DEVICE_ID_COOKIE = 'gz_did';
const INSTALL_TOKEN_COOKIE = 'gz_itk';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 3650;
function _readCookie(name) {
try {
const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
return match ? decodeURIComponent(match[1]) : null;
} catch (e) { return null; }
}
function _writeCookie(name, value) {
try {
document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Strict`;
} catch (e) {
console.warn('An unexpected error occurred.', e);
}
}
function _generateUUID() {
if (typeof crypto !== 'undefined' && crypto.randomUUID) {
return 'inst_' + crypto.randomUUID().replace(/-/g, '');
}
return 'inst_' + 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
(Math.random() * 16 | 0).toString(16));
}
async function getDeviceId() {
let deviceId = _readCookie(DEVICE_ID_COOKIE);
if (!deviceId) {
try { deviceId = localStorage.getItem('persistent_device_id'); } catch (e) {
console.warn('Could not read device ID from localStorage', e);
}
}
if (!deviceId) {
try { deviceId = await idb.get('device_id'); } catch (e) {
console.warn('Failed to read setting.', e);
}
}
if (!deviceId && firebaseDB && currentUser) {
try {
const installToken = _readCookie(INSTALL_TOKEN_COOKIE);
if (installToken) {
const snap = await firebaseDB
.collection('users').doc(currentUser.uid)
.collection('devices')
.where('installationToken', '==', installToken)
.limit(1)
.get();
if (!snap.empty) {
deviceId = snap.docs[0].data().deviceId;
}
}
} catch (e) {
console.warn('Firebase operation failed.', e);
}
}
if (!deviceId) {
deviceId = _generateUUID();
}
_writeCookie(DEVICE_ID_COOKIE, deviceId);
try { localStorage.setItem('persistent_device_id', deviceId); } catch (e) {
console.warn('Firebase operation failed.', e);
}
try { await idb.set('device_id', deviceId); } catch (e) {
console.warn('Failed to save data locally.', e);
}
if (!_readCookie(INSTALL_TOKEN_COOKIE)) {
const token = _generateUUID();
_writeCookie(INSTALL_TOKEN_COOKIE, token);
}
return deviceId;
}
async function getDeviceFingerprint() {
const ua = navigator.userAgent;
let os = 'Unknown OS';
if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
else if (/Windows/.test(ua)) os = 'Windows';
else if (/Android (\d+\.\d+)/.test(ua)) os = 'Android ' + ua.match(/Android (\d+\.\d+)/)[1];
else if (/iPhone OS ([\d_]+)/.test(ua)) os = 'iOS ' + ua.match(/iPhone OS ([\d_]+)/)[1].replace(/_/g,'.');
else if (/iPad.*OS ([\d_]+)/.test(ua)) os = 'iPadOS ' + ua.match(/iPad.*OS ([\d_]+)/)[1].replace(/_/g,'.');
else if (/Mac OS X ([\d_]+)/.test(ua)) os = 'macOS ' + ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g,'.');
else if (/Linux/.test(ua)) os = 'Linux';
let browser = 'Unknown';
let browserVer = '';
if (/Edg\/([\d.]+)/.test(ua)) { browser = 'Edge'; browserVer = ua.match(/Edg\/([\d.]+)/)[1].split('.')[0]; }
else if (/OPR\/([\d.]+)/.test(ua)) { browser = 'Opera'; browserVer = ua.match(/OPR\/([\d.]+)/)[1].split('.')[0]; }
else if (/SamsungBrowser\/([\d.]+)/.test(ua)) { browser = 'Samsung'; browserVer = ua.match(/SamsungBrowser\/([\d.]+)/)[1].split('.')[0]; }
else if (/CriOS\/([\d.]+)/.test(ua)) { browser = 'Chrome iOS'; browserVer = ua.match(/CriOS\/([\d.]+)/)[1].split('.')[0]; }
else if (/FxiOS\/([\d.]+)/.test(ua)) { browser = 'Firefox iOS'; browserVer = ua.match(/FxiOS\/([\d.]+)/)[1].split('.')[0]; }
else if (/Chrome\/([\d.]+)/.test(ua) && !/Chromium/.test(ua)) { browser = 'Chrome'; browserVer = ua.match(/Chrome\/([\d.]+)/)[1].split('.')[0]; }
else if (/Firefox\/([\d.]+)/.test(ua)) { browser = 'Firefox'; browserVer = ua.match(/Firefox\/([\d.]+)/)[1].split('.')[0]; }
else if (/Version\/([\d.]+).*Safari/.test(ua)){ browser = 'Safari'; browserVer = ua.match(/Version\/([\d.]+)/)[1].split('.')[0]; }
else if (/Chromium\/([\d.]+)/.test(ua)) { browser = 'Chromium'; browserVer = ua.match(/Chromium\/([\d.]+)/)[1].split('.')[0]; }
const browserFull = browserVer ? `${browser} ${browserVer}` : browser;
const screenRes = `${screen.width}×${screen.height}`;
const colorDepth = screen.colorDepth || 24;
const pixelRatio = (window.devicePixelRatio || 1).toFixed(1);
const cores = navigator.hardwareConcurrency || '?';
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const lang = navigator.language || 'en';
const platform = navigator.platform || 'Unknown';
const touch = navigator.maxTouchPoints > 0 ? `Touch(${navigator.maxTouchPoints})` : 'NoTouch';
let canvasHash = 'X';
try {
const c = document.createElement('canvas');
c.width = 120; c.height = 30;
const ctx = c.getContext('2d');
ctx.textBaseline = 'top';
ctx.font = '13px Arial';
ctx.fillStyle = '#f00';
ctx.fillText('Gull&Zubair', 2, 2);
ctx.fillStyle = 'rgba(0,200,100,0.6)';
ctx.fillRect(30, 10, 60, 8);
const raw = c.toDataURL();
let h = 0;
for (let i = 0; i < raw.length; i++) {
h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
}
canvasHash = Math.abs(h).toString(36).toUpperCase().padStart(6, '0');
} catch (e) {
console.warn('Canvas fingerprint hash failed', e);
}
const stableStr = `${os}|${screenRes}|${colorDepth}|${pixelRatio}|${cores}|${tz}|${platform}|${canvasHash}`;
let stableHash = 0;
for (let i = 0; i < stableStr.length; i++) {
stableHash = ((stableHash << 5) - stableHash + stableStr.charCodeAt(i)) | 0;
}
stableHash = Math.abs(stableHash).toString(36).padStart(8, '0');
const readableName = `${os} · ${browserFull} · ${screenRes} · ${cores}c · ${tz}`;
return {
os,
browser,
browserFull,
screenRes,
colorDepth,
pixelRatio,
cores,
tz,
lang,
platform,
touch,
canvasHash,
stableHash,
readableName,
fullUserAgent: ua
};
}
async function getDeviceName() {
let deviceName = await idb.get('device_name');
if (!deviceName) {
const fp = await getDeviceFingerprint();
deviceName = fp.readableName;
await idb.set('device_name', deviceName);
}
return deviceName;
}
async function registerDevice() {
if (!firebaseDB) {
return;
}
if (!currentUser) {
return;
}
try {
const deviceId = await getDeviceId();
const fp = await getDeviceFingerprint();
const deviceName = fp.readableName;
try { await idb.set('device_name', deviceName); } catch(e) {
console.warn('Failed to save data locally.', e);
}
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const userAgent = navigator.userAgent;
const deviceType = /Mobile|Android|iPhone/.test(userAgent)
? 'mobile'
: /Tablet|iPad/.test(userAgent)
? 'tablet'
: 'desktop';
const browser = fp.browserFull;
const deviceRef = userRef.collection('devices').doc(deviceId);
const existingDoc = await deviceRef.get();
const existing = existingDoc.exists ? existingDoc.data() : {};
const persistedMode = existing.currentMode || appMode || 'admin';
const persistedRoleType = existing.assignedRoleType || persistedMode;
const persistedRoleName = existing.assignedRoleName
|| (persistedRoleType === 'rep' ? existing.assignedRep : existing.assignedManager)
|| null;
const persistedRep = persistedRoleType === 'rep' ? (persistedRoleName || currentRepProfile || null) : null;
const persistedManager = (persistedRoleType === 'production' || persistedRoleType === 'factory') ? persistedRoleName : null;
if (persistedMode !== appMode) {
appMode = persistedMode;
const idbBatch = [
['appMode', appMode],
['appMode_timestamp', existing.appMode_timestamp || Date.now()]
];
if (persistedMode === 'rep' && persistedRep) {
currentRepProfile = persistedRep;
idbBatch.push(['repProfile', persistedRep]);
} else if ((persistedMode === 'production' || persistedMode === 'factory') && persistedManager) {
window._assignedManagerName = persistedManager;
idbBatch.push(['assignedManager', persistedManager]);
}
await idb.setBatch(idbBatch);
}
await deviceRef.set({
deviceId: deviceId,
deviceName: deviceName,
deviceType: deviceType,
browser: browser,
platform: fp.platform,
userAgent: fp.fullUserAgent,
fingerprint: {
os: fp.os,
browser: fp.browserFull,
screenRes: fp.screenRes,
colorDepth: fp.colorDepth,
pixelRatio: fp.pixelRatio,
cpuCores: fp.cores,
timezone: fp.tz,
language: fp.lang,
touch: fp.touch,
canvasHash: fp.canvasHash,
stableHash: fp.stableHash
},
online: true,
lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
currentMode: persistedMode,
assignedRoleType: persistedRoleType,
assignedRoleName: persistedRoleName,
assignedRep: persistedMode === 'rep' ? persistedRep : null,
assignedManager: (persistedMode === 'production' || persistedMode === 'factory') ? persistedManager : null,
installationToken: _readCookie(INSTALL_TOKEN_COOKIE) || null,
capabilities: {
canSync: true,
canReceiveCommands: true,
supportsBiometric: false,
supportsNotifications: 'Notification' in window
},
lastSyncTimestamp: existing.lastSyncTimestamp || null,
dataUsage: existing.dataUsage || { reads: 0, writes: 0, deletes: 0 }
}, { merge: true });
const accountInfoRef = userRef.collection('account').doc('info');
await accountInfoRef.set({
email: currentUser.email || 'unknown@example.com',
displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
accountCreated: firebase.firestore.FieldValue.serverTimestamp()
}, { merge: true });
const preferencesRef = userRef.collection('account').doc('preferences');
await preferencesRef.set({
defaultRepProfile: currentRepProfile || salesRepsList[0] || 'NORAN SHAH',
timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
language: navigator.language || 'en',
theme: document.documentElement.getAttribute('data-theme') || 'dark'
}, { merge: true });
startDeviceHeartbeat(deviceRef);
await listenForDeviceCommands();
listenForTeamChanges();
await logDeviceActivity('device_registered', {
deviceId: deviceId,
deviceName: deviceName,
deviceType: deviceType,
browser: browser
});
} catch (error) {
console.warn('Device command listener failed.', error);
}
}
function startDeviceHeartbeat(deviceRef) {
if (window.deviceHeartbeatInterval) {
clearInterval(window.deviceHeartbeatInterval);
}
window.deviceHeartbeatInterval = setInterval(async () => {
if (document.hidden) return;
if (firebaseDB && currentUser) {
try {
const _isRepMode = appMode === 'rep';
const _isUserRole = appMode === 'userrole';
const _isMgrMode = appMode === 'production' || appMode === 'factory';
await deviceRef.update({
lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
online: true,
currentMode: appMode,
assignedRoleType: appMode,
assignedRoleName: _isRepMode ? (currentRepProfile || null) : (_isUserRole || _isMgrMode) ? (window._assignedManagerName || null) : null,
assignedRep: _isRepMode ? (currentRepProfile || null) : null,
assignedManager: (_isUserRole || _isMgrMode) ? (window._assignedManagerName || null) : null,
assignedUserTabs: _isUserRole ? (window._assignedUserTabs || []) : null,
});
} catch (error) {
console.warn('Heartbeat update failed.', error);
}
}
}, 300000);
}
async function logDeviceActivity(activityType, details = {}) {
if (!firebaseDB || !currentUser) return;
const LOGGABLE_EVENTS = new Set([
'device_registered',
'account_initialized',
'restore_completed',
'backup_completed',
'auth_login',
'auth_logout',
'sync_error',
'data_error',
'factory_formula_saved',
]);
if (!LOGGABLE_EVENTS.has(activityType)) {
return;
}
try {
const deviceId = await getDeviceId();
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const activityRef = userRef.collection('activityLog').doc();
await activityRef.set({
timestamp: firebase.firestore.FieldValue.serverTimestamp(),
deviceId: deviceId,
activityType: activityType,
details: details,
userId: currentUser.uid
});
} catch (error) {
console.warn('Firebase operation failed.', error);
}
}
window.logDeviceActivity = logDeviceActivity;
async function initializeDeviceListeners() {
try {
await listenForDeviceCommands();
listenForTeamChanges();
} catch (error) {
console.error('Device command listener failed.', error);
showToast('Device command listener failed.', 'error');
}
await cleanupOldDeletions();
}
window.initializeDeviceListeners = initializeDeviceListeners;
let db = [];
let salesHistory = [];
let customerSales = [];
let repSales = [];
let repCustomers = [];
let salesCustomers = [];
let stockReturns = [];
let expenseRecords = [];
let expenseCategories = [];
let deletedRecordIds = new Set();
let deletionRecordsArray = [];
let deletionRecords = deletionRecordsArray;
let appMode = 'admin';
let currentRepProfile = 'NORAN SHAH';
let salesRepsList = ['NORAN SHAH', 'NOMAN SHAH'];
let userRolesList = [];
let factoryInventoryData = [];
let factoryProductionHistory = [];
let factoryDefaultFormulas = { standard: [], asaan: [] };
let factoryAdditionalCosts = { standard: 0, asaan: 0 };
let factorySalePrices = { standard: 0, asaan: 0 };
let factoryCostAdjustmentFactor = { standard: 1, asaan: 1 };
let factoryUnitTracking = {
standard: {
produced: 0,
consumed: 0,
available: 0,
unitCostHistory: []
},
asaan: {
produced: 0,
consumed: 0,
available: 0,
unitCostHistory: []
}
};
