async function loadDeviceList() {
const container = document.getElementById('device-list-container');
if (!container) return;
if (!firebaseDB || !currentUser) {
container.innerHTML = `
<div class="u-empty-state-sm" >
Please log in to view devices
</div>
`;
return;
}
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const devicesSnap = await userRef.collection('devices').get();
if (devicesSnap.empty) {
container.innerHTML = `
<div class="u-empty-state-sm" >
No devices registered yet
</div>
`;
return;
}
const currentDeviceId = await getDeviceId();
const now = Date.now();
let accountEmail = currentUser.email || 'Unknown';
try {
const accountInfoSnap = await userRef.collection('account').doc('info').get();
if (accountInfoSnap.exists) {
const accountData = accountInfoSnap.data();
accountEmail = accountData.email || accountEmail;
}
} catch (e) {
console.error('An unexpected error occurred.', e);
showToast('An unexpected error occurred.', 'error');
}
const seenIds = new Set();
const uniqueDocs = devicesSnap.docs.filter(doc => {
const id = doc.data().deviceId;
if (!id || id === 'default_device' || doc.id === 'default_device') return false;
if (seenIds.has(id)) return false;
seenIds.add(id);
return true;
});
if (uniqueDocs.length === 0) {
container.innerHTML = `
<div class="u-empty-state-sm" >
No devices registered yet
</div>
`;
return;
}
let html = `
<div style="margin-bottom: 15px; padding: 10px; background: rgba(0, 122, 255, 0.1); border-radius: 8px; border: 1px solid rgba(0, 122, 255, 0.3);">
<div style="font-size: 0.75rem; color: var(--accent); font-weight: 600;">
Account: ${accountEmail}
</div>
<div class="u-field-hint-xxs" >
Total Devices: ${uniqueDocs.length} • Online: ${uniqueDocs.filter(d => {
const ls = d.data().lastSeen?.toMillis() || 0;
return (now - ls) < 60000;
}).length}
</div>
</div>
`;
uniqueDocs.forEach(doc => {
const device = doc.data();
const isCurrentDevice = device.deviceId === currentDeviceId;
const lastSeen = device.lastSeen?.toMillis() || 0;
const isOnline = (now - lastSeen) < 60000;
const totalCommands = device.totalCommands || 0;
const remoteAppliedMode = device.remoteAppliedMode || null;
const remoteAppliedAt = device.remoteAppliedAt || null;
const remoteAppliedBy = device.remoteAppliedBy || null;
const deviceMode = device.currentMode || 'admin';
const assignedRep = device.assignedRep || null;
const assignedManager = device.assignedManager || null;
const assignedUserTabs = Array.isArray(device.assignedUserTabs) ? device.assignedUserTabs : [];
const modeLabel = deviceMode === 'admin'
? 'ADMIN'
: deviceMode === 'userrole'
? (assignedManager || 'USER ROLE')
: deviceMode === 'production'
? (assignedManager || 'PRODUCTION')
: deviceMode === 'factory'
? (assignedManager || 'FACTORY')
: (assignedRep || 'REP');
const modeColor = deviceMode === 'admin' ? '#007aff'
: deviceMode === 'userrole' ? '#ffcc02'
: deviceMode === 'production' ? '#69f0ae'
: deviceMode === 'factory' ? '#ce93d8'
: '#ff9f0a';
const modeIcon = '';
const devBorder = isCurrentDevice ? 'var(--accent)' : 'var(--glass-border)';
const onlineColor = isOnline ? '#30d158' : '#ff453a';
const onlineDot = isOnline ? '● Online' : '○ Offline';
const shortId = device.deviceId ? device.deviceId.substring(0, 20) + '…' : 'N/A';
const thisDeviceBadge = isCurrentDevice
? '<span style="margin-left:6px;font-size:0.6rem;color:var(--accent);font-family:Geist,sans-serif;font-weight:700;">(This Device)</span>'
: '';
let cardHtml = '<div style="margin-bottom:12px;padding:14px;background:var(--glass);border-radius:14px;border:2px solid ' + devBorder + ';">';
cardHtml += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:8px;">';
cardHtml += '<div style="font-size:0.65rem;font-family:\'Geist Mono\',monospace;color:var(--text-muted);word-break:break-all;flex:1;min-width:0;line-height:1.4;">' + shortId + thisDeviceBadge + '</div>';
cardHtml += '<div style="text-align:right;flex-shrink:0;">';
cardHtml += '<div style="font-size:0.8rem;font-weight:800;color:' + modeColor + ';white-space:nowrap;">' + modeLabel + '</div>';
cardHtml += '<div style="font-size:0.6rem;color:' + onlineColor + ';margin-top:2px;">' + onlineDot + '</div>';
cardHtml += '</div>';
cardHtml += '</div>';
const lastSeenStr = lastSeen ? new Date(lastSeen).toLocaleString() : 'Never';
cardHtml += '<div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:6px;">Last seen: ' + lastSeenStr + '</div>';
const lastCmdStr = remoteAppliedAt ? new Date(remoteAppliedAt).toLocaleString() : null;
const lastCmdMode = remoteAppliedMode ? remoteAppliedMode.toUpperCase() : null;
const lastCmdBy = remoteAppliedBy || null;
if (lastCmdMode || totalCommands > 0) {
cardHtml += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:11px;padding:7px 10px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid var(--glass-border);">';
cardHtml += '<span style="font-size:0.6rem;color:var(--text-muted);flex-shrink:0;">Commands:</span>';
if (totalCommands > 0) {
cardHtml += '<span style="font-size:0.62rem;font-weight:700;color:var(--accent);background:var(--accent-dim);padding:2px 7px;border-radius:99px;">' + totalCommands + ' sent</span>';
}
if (lastCmdMode) {
cardHtml += '<span style="font-size:0.62rem;font-weight:700;color:var(--text-main);">→ ' + lastCmdMode + '</span>';
}
if (lastCmdBy) {
cardHtml += '<span style="font-size:0.6rem;color:var(--text-muted);">by ' + esc(lastCmdBy) + '</span>';
}
if (lastCmdStr) {
cardHtml += '<span style="font-size:0.58rem;color:var(--text-secondary);margin-left:auto;">' + lastCmdStr + '</span>';
}
cardHtml += '</div>';
} else {
cardHtml += '<div style="margin-bottom:11px;padding:7px 10px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--glass-border);font-size:0.6rem;color:var(--text-secondary);">No commands sent yet</div>';
}
if (!isCurrentDevice) {
const isAdmin = deviceMode === 'admin';
const adminBg = isAdmin ? 'rgba(0,122,255,0.18)' : 'rgba(0,122,255,0.08)';
const adminBord = isAdmin ? '2px solid rgba(0,122,255,0.55)' : '1px solid rgba(0,122,255,0.25)';
const adminFw = isAdmin ? '800' : '600';
const adminTick = isAdmin ? '✓ ' : '';
cardHtml += '<button onclick="remoteControlDevice(\'' + device.deviceId + '\', \'admin\')"';
cardHtml += ' style="width:100%;padding:9px;background:' + adminBg + ';border:' + adminBord + ';border-radius:99px;color:#007aff;cursor:pointer;font-size:0.72rem;font-weight:' + adminFw + ';margin-bottom:10px;">' + adminTick + 'Admin Mode</button>';
if (salesRepsList.length > 0) {
cardHtml += '<div style="font-size:0.6rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">Sales Representatives</div>';
cardHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:5px;margin-bottom:10px;">';
const repColors = [
{bg:'48,209,88',hex:'#30d158'},{bg:'255,159,10',hex:'#ff9f0a'},
{bg:'191,90,242',hex:'#bf5af2'},{bg:'255,69,58',hex:'#ff453a'},{bg:'90,200,250',hex:'#5ac8fa'}
];
for (let ri = 0; ri < salesRepsList.length; ri++) {
const rep = salesRepsList[ri];
const c = repColors[ri % repColors.length];
const repLocked = deviceMode === 'rep' && assignedRep === rep;
const repBg = 'rgba(' + c.bg + ',' + (repLocked ? '0.22' : '0.08') + ')';
const repBord = (repLocked ? '2' : '1') + 'px solid rgba(' + c.bg + ',' + (repLocked ? '0.65' : '0.28') + ')';
const repFw = repLocked ? '800' : '600';
const repTick = repLocked ? '✓ ' : '';
cardHtml += '<button onclick="remoteControlDevice(\'' + device.deviceId + '\', \'rep\', \'' + rep + '\')"';
cardHtml += ' style="padding:8px 5px;background:' + repBg + ';border:' + repBord + ';border-radius:99px;color:' + c.hex + ';cursor:pointer;font-size:0.68rem;font-weight:' + repFw + ';text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">';
cardHtml += repTick + rep + '</button>';
}
cardHtml += '</div>';
}
if (userRolesList.length > 0) {
cardHtml += '<div style="font-size:0.6rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">User Roles</div>';
cardHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:5px;margin-bottom:10px;">';
for (let ui = 0; ui < userRolesList.length; ui++) {
const user = userRolesList[ui];
const userLocked = deviceMode === 'userrole' && device.assignedManager === user.name;
const userBg = 'rgba(255,204,2,' + (userLocked ? '0.22' : '0.08') + ')';
const userBord = (userLocked ? '2' : '1') + 'px solid rgba(255,204,2,' + (userLocked ? '0.65' : '0.28') + ')';
const userFw = userLocked ? '800' : '600';
const userTick = userLocked ? '✓ ' : '';
const lookupKey = '_devTabsCache';
if (!window[lookupKey]) window[lookupKey] = {};
window[lookupKey][device.deviceId + '_' + ui] = user.tabs || [];
cardHtml += '<button onclick="remoteControlDevice(\'' + device.deviceId + '\', \'userrole\', \'' + user.name + '\', (window._devTabsCache||{})[\'' + device.deviceId + '_' + ui + '\'])"';
cardHtml += ' style="padding:8px 5px;background:' + userBg + ';border:' + userBord + ';border-radius:99px;color:#ffcc02;cursor:pointer;font-size:0.68rem;font-weight:' + userFw + ';text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">';
cardHtml += userTick + user.name + '</button>';
}
cardHtml += '</div>';
}
cardHtml += '<button onclick="removeDevice(\'' + device.deviceId + '\')"';
cardHtml += ' style="width:100%;padding:7px;background:rgba(255,69,58,0.07);border:1px solid rgba(255,69,58,0.28);border-radius:99px;color:#ff453a;cursor:pointer;font-size:0.65rem;">Remove Device</button>';
} else {
const thisDeviceModeColor = modeColor;
cardHtml += '<div style="padding:8px 10px;background:rgba(0,122,255,0.05);border:1px solid rgba(0,122,255,0.2);border-radius:8px;color:var(--text-muted);text-align:center;font-size:0.7rem;">This Device — <span style="color:' + thisDeviceModeColor + ';font-weight:700;">' + modeLabel + '</span></div>';
}
cardHtml += '</div>';
html += cardHtml;
});
container.innerHTML = html;
} catch (error) {
console.error('An unexpected error occurred.', error);
showToast('An unexpected error occurred.', 'error');
container.innerHTML = `
<div style="text-align: center; padding: 20px; color: #ff453a;">
Error loading devices: ${esc(error.message)}
</div>
`;
}
}
async function refreshDeviceList() {
const container = document.getElementById('device-list-container');
if (container) {
container.innerHTML = `
<div class="u-empty-state-sm" >
Refreshing...
</div>
`;
}
await loadDeviceList();
showToast(' Device list refreshed', 'success', 2000);
}
async function remoteControlDevice(deviceId, targetMode, repName = null, userTabs = null) {
if (!firebaseDB || !currentUser) {
showToast('Not logged in', 'error', 3000);
return;
}
let _rcTitle, _rcMsg, _rcConfirm;
if (targetMode === 'admin') {
_rcTitle = 'Unlock to Admin Mode';
_rcMsg = 'Unlock this device to full Admin mode?\n\nAll tabs and admin features will become accessible.';
_rcConfirm = 'Unlock to Admin';
} else if (targetMode === 'rep' && repName) {
_rcTitle = 'Lock Device — Sales Rep';
_rcMsg = `Lock this device to Sales Rep mode for ${repName}?\n\nThe device will only show the Rep Sales tab. All admin features, tabs and controls will be hidden until unlocked remotely.`;
_rcConfirm = `Lock to ${repName}`;
} else if (targetMode === 'userrole' && repName) {
const tabLabels = { prod: 'Production', factory: 'Factory', sales: 'Sales', payments: 'Payments' };
const tabList = Array.isArray(userTabs) ? userTabs.map(t => tabLabels[t] || t).join(', ') : 'assigned tabs';
_rcTitle = 'Lock Device — User Role';
_rcMsg = `Lock this device to User Role for ${repName}?\n\nAssigned tabs: ${tabList}\n\nOnly the assigned sections will be visible. All other tabs, analytics and admin controls will be hidden.`;
_rcConfirm = `Lock to ${repName}`;
} else {
_rcTitle = 'Switch Device Mode';
_rcMsg = `Switch this device to ${targetMode.toUpperCase()} mode?`;
_rcConfirm = 'Confirm';
}
const confirmed = await showGlassConfirm(_rcMsg, {
title: _rcTitle,
confirmText: _rcConfirm,
cancelText: 'Cancel',
danger: targetMode !== 'admin'
});
if (!confirmed) return;
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const commandTimestamp = firebase.firestore.FieldValue.serverTimestamp();
const deviceRef = userRef.collection('devices').doc(deviceId);
const updateData = {
targetMode: targetMode,
targetModeTimestamp: commandTimestamp,
commandSource: 'remote_admin',
lastControlled: commandTimestamp,
controlledBy: currentUser.email || 'Admin',
currentMode: targetMode,
assignedRep: targetMode === 'rep' ? (repName || null) : null,
assignedManager: targetMode === 'userrole' ? (repName || null) : null,
assignedUserTabs: targetMode === 'userrole' ? (userTabs || []) : null,
assignedRoleType: targetMode,
assignedRoleName: repName || null,
lockedAt: repName ? commandTimestamp : null,
lockedBy: repName ? (currentUser.email || 'Admin') : null,
};
await deviceRef.set(updateData, { merge: true });
const successMsg = targetMode === 'admin'
? '✓ Device unlocked to Admin mode'
: targetMode === 'rep' ? `✓ Device locked to Sales Rep: ${repName}`
: targetMode === 'userrole' ? `✓ Device locked to User: ${repName}`
: `✓ Command sent: ${targetMode}`;
showToast(successMsg, 'success', 3500);
setTimeout(loadDeviceList, 2000);
} catch (error) {
showToast('Failed to control device: ' + error.message, 'error', 4000);
}
}
async function removeDevice(deviceId) {
if (!firebaseDB || !currentUser) {
showToast('Not logged in', 'error', 3000);
return;
}
const _rdMsg = `Remove this device from the trusted list?\n\nThe device will no longer be able to sync data or receive remote commands. It will need to be re-approved if the user tries to reconnect.\n\nThis does not delete any data already on the device.`;
if (!(await showGlassConfirm(_rdMsg, { title: 'Remove Trusted Device', confirmText: 'Remove', danger: true }))) {
return;
}
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const deviceRef = userRef.collection('devices').doc(deviceId);
await deviceRef.delete();
showToast('Device removed', 'success', 3000);
await loadDeviceList();
} catch (error) {
showToast('Failed to remove device: ' + error.message, 'error', 3000);
}
}
window.loadDeviceList = loadDeviceList;
window.refreshDeviceList = refreshDeviceList;
window.remoteControlDevice = remoteControlDevice;
window.removeDevice = removeDevice;
window.getDeviceId = getDeviceId;
window.getDeviceName = getDeviceName;
window.registerDevice = registerDevice;
async function restoreDeviceModeOnLogin(uid) {
if (!firebaseDB) return;
try {
const deviceId = await getDeviceId();
const userRef = firebaseDB.collection('users').doc(uid);
const deviceRef = userRef.collection('devices').doc(deviceId);
const deviceDoc = await deviceRef.get();
if (!deviceDoc.exists) {
return;
}
const data = deviceDoc.data();
const cloudMode = data.currentMode || 'admin';
const cloudTimestamp = data.appMode_timestamp || 0;
const localTimestamp = (await idb.get('appMode_timestamp')) || 0;
if (cloudMode && cloudTimestamp > localTimestamp && cloudMode !== appMode) {
const previousMode = appMode;
appMode = cloudMode;
const modeBatch = [
['appMode', appMode],
['appMode_timestamp', cloudTimestamp]
];
if (cloudMode === 'rep' && data.assignedRep) {
currentRepProfile = data.assignedRep;
modeBatch.push(['repProfile', currentRepProfile]);
modeBatch.push(['repProfile_timestamp', data.repProfile_timestamp || cloudTimestamp]);
} else if (cloudMode === 'userrole' && data.assignedManager) {
window._assignedManagerName = data.assignedManager;
window._assignedUserTabs = Array.isArray(data.assignedUserTabs) ? data.assignedUserTabs : [];
modeBatch.push(['assignedManager', data.assignedManager]);
modeBatch.push(['assignedUserTabs', window._assignedUserTabs]);
} else if ((cloudMode === 'production' || cloudMode === 'factory') && data.assignedManager) {
window._assignedManagerName = data.assignedManager;
modeBatch.push(['assignedManager', data.assignedManager]);
}
await idb.setBatch(modeBatch);
const modeLabel = appMode === 'rep' ? 'Rep Mode' : appMode === 'userrole' ? 'User Role Mode' : appMode === 'production' ? 'Production Mode' : appMode === 'factory' ? 'Factory Mode' : 'Admin Mode';
const isRemote = !!data.remoteAppliedMode;
showToast(isRemote
? `Restoring remotely assigned ${modeLabel}...`
: `Switching to ${modeLabel}...`, 'info', 2000);
setTimeout(() => { window.location.reload(); }, 1500);
} else {
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
window.restoreDeviceModeOnLogin = restoreDeviceModeOnLogin;
async function listenForDeviceCommands() {
if (!firebaseDB || !currentUser) return;
try {
const deviceId = await getDeviceId();
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const deviceRef = userRef.collection('devices').doc(deviceId);
const unsubscribe = deviceRef.onSnapshot((doc) => {
if (!doc.exists) return;
const data = doc.data();
if (data.targetMode && data.targetModeTimestamp) {
const targetMode = data.targetMode;
let resolvedName = null;
const roleType = data.assignedRoleType || targetMode;
if (roleType === 'rep') {
resolvedName = data.assignedRoleName || data.assignedRep || null;
} else if (roleType === 'userrole' || roleType === 'production' || roleType === 'factory') {
resolvedName = data.assignedRoleName || data.assignedManager || null;
}
const effectiveMode = data.assignedRoleType || targetMode;
const resolvedUserTabs = Array.isArray(data.assignedUserTabs) ? data.assignedUserTabs : [];
const commandTimestamp = data.targetModeTimestamp.toMillis
? data.targetModeTimestamp.toMillis()
: data.targetModeTimestamp;
const lastProcessed = window.lastProcessedCommandTimestamp || 0;
if (commandTimestamp > lastProcessed) {
applyRemoteModeChange(effectiveMode, data.commandSource || 'remote', resolvedName, resolvedUserTabs);
window.lastProcessedCommandTimestamp = commandTimestamp;
}
}
}, (error) => {
console.warn('Device command listener error:', error);
});
window.deviceCommandsUnsubscribe = unsubscribe;
} catch (error) {
console.error('listenForDeviceCommands failed:', error);
}
}
async function applyRemoteModeChange(targetMode, source, repName = null, userTabs = null) {
const previousMode = appMode;
const previousManager = window._assignedManagerName || null;
const previousTabs = JSON.stringify(window._assignedUserTabs || []);
if (previousMode === targetMode) {
if (targetMode === 'admin') return;
if (targetMode === 'rep' && currentRepProfile === repName) return;
if (targetMode === 'userrole' && previousManager === repName && previousTabs === JSON.stringify(userTabs || [])) return;
}
appMode = targetMode;
const nowMs = Date.now();
const batchData = [['appMode', appMode], ['appMode_timestamp', nowMs]];
if (targetMode === 'rep' && repName) {
currentRepProfile = repName;
batchData.push(['repProfile', repName], ['repProfile_timestamp', nowMs]);
if (!salesRepsList.includes(repName)) {
salesRepsList.push(repName);
batchData.push(['sales_reps_list', salesRepsList]);
if (typeof renderAllRepUI === 'function') renderAllRepUI();
}
} else if (targetMode === 'userrole') {
window._assignedManagerName = repName || null;
window._assignedUserTabs = Array.isArray(userTabs) ? userTabs : [];
batchData.push(['assignedManager', repName || null], ['assignedUserTabs', window._assignedUserTabs]);
} else if (targetMode === 'production' || targetMode === 'factory') {
window._assignedManagerName = repName || null;
batchData.push(['assignedManager', repName || null]);
} else if (targetMode === 'admin') {
window._assignedManagerName = null;
window._assignedUserTabs = [];
batchData.push(['assignedManager', null], ['assignedUserTabs', []]);
}
await idb.setBatch(batchData);
if (firebaseDB && currentUser) {
try {
const deviceId = await getDeviceId();
const deviceRef = firebaseDB.collection('users').doc(currentUser.uid)
.collection('devices').doc(deviceId);
const payload = {
currentMode: targetMode, appMode_timestamp: nowMs,
remoteAppliedMode: targetMode, remoteAppliedAt: nowMs, remoteAppliedBy: source || 'remote',
assignedRoleType: targetMode, assignedRoleName: repName || null,
assignedRep: targetMode === 'rep' ? (repName || null) : null,
assignedManager: targetMode === 'userrole' ? (repName || null) : null,
assignedUserTabs: targetMode === 'userrole' ? (window._assignedUserTabs || []) : null,
};
if (targetMode === 'rep') payload.repProfile_timestamp = nowMs;
await deviceRef.set(payload, { merge: true });
} catch (e) { console.error('Firebase write failed:', e); }
}
if (targetMode === 'rep') {
if (typeof lockToRepMode === 'function') lockToRepMode();
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
showToast(repName ? `Locked to Rep: ${repName}` : 'Device locked to Rep Sales mode', 'info', 4000);
} else if (targetMode === 'userrole') {
if (typeof lockToUserRoleMode === 'function') lockToUserRoleMode();
showToast(repName ? `Locked to User: ${repName}` : 'Device locked to User Role mode', 'info', 4000);
} else if (targetMode === 'production') {
if (typeof lockToProductionMode === 'function') lockToProductionMode();
showToast(repName ? `Locked to Production: ${repName}` : 'Device locked to Production mode', 'info', 4000);
} else if (targetMode === 'factory') {
if (typeof lockToFactoryMode === 'function') lockToFactoryMode();
showToast(repName ? `Locked to Factory: ${repName}` : 'Device locked to Factory mode', 'info', 4000);
} else if (targetMode === 'admin') {
if (typeof unlockToAdminMode === 'function') unlockToAdminMode();
if (typeof notifyDataChange === 'function') notifyDataChange('all');
showToast('Device unlocked to Admin mode', 'info', 4000);
}
}
window.listenForDeviceCommands = listenForDeviceCommands;
function listenForTeamChanges() {
if (window._teamUnsubscribe) {
try { window._teamUnsubscribe(); } catch(e) {}
window._teamUnsubscribe = null;
}
}
window.listenForTeamChanges = listenForTeamChanges;
window.applyRemoteModeChange = applyRemoteModeChange;
async function verifyTimestampConsistency() {
const report = {
collections: {},
settings: {},
issues: [],
summary: {
totalRecords: 0,
recordsWithTimestamps: 0,
recordsWithoutTimestamps: 0,
recordsWithInconsistentTimestamps: 0
}
};
const checkTimestamps = (item, collectionName) => {
const timestamps = {
timestamp: item.timestamp,
createdAt: item.createdAt,
updatedAt: item.updatedAt
};
const hasAnyTimestamp = timestamps.timestamp || timestamps.createdAt || timestamps.updatedAt;
if (!hasAnyTimestamp) {
report.issues.push({
type: 'MISSING_TIMESTAMPS',
collection: collectionName,
id: item.id,
message: 'Record has no timestamps at all'
});
report.summary.recordsWithoutTimestamps++;
} else {
report.summary.recordsWithTimestamps++;
const times = Object.values(timestamps).filter(t => t).map(t => {
return typeof t === 'number' ? t : new Date(t).getTime();
});
if (times.length > 1) {
const minTime = Math.min(...times);
const maxTime = Math.max(...times);
const diff = maxTime - minTime;
if (diff > 86400000) {
report.issues.push({
type: 'INCONSISTENT_TIMESTAMPS',
collection: collectionName,
id: item.id,
timestamps: timestamps,
difference: `${Math.round(diff / 1000 / 60 / 60)} hours`,
message: 'Timestamps differ by more than 1 day'
});
report.summary.recordsWithInconsistentTimestamps++;
}
}
}
return timestamps;
};
const collections = [
{ name: 'mfg_pro_pkr', label: 'Production' },
{ name: 'noman_history', label: 'Calculator History' },
{ name: 'customer_sales', label: 'Customer Sales' },
{ name: 'rep_sales', label: 'Rep Sales' },
{ name: 'rep_customers', label: 'Rep Customers' },
{ name: 'factory_inventory_data', label: 'Factory Inventory' },
{ name: 'factory_production_history', label: 'Factory History' },
{ name: 'stock_returns', label: 'Stock Returns' },
{ name: 'payment_transactions', label: 'Payment Transactions' },
{ name: 'payment_entities', label: 'Payment Entities' },
{ name: 'expenses', label: 'Expenses' }
];
for (const collection of collections) {
const data = await idb.get(collection.name, []);
report.collections[collection.name] = {
label: collection.label,
count: data.length,
withTimestamps: 0,
withoutTimestamps: 0
};
report.summary.totalRecords += data.length;
data.forEach(item => {
const timestamps = checkTimestamps(item, collection.name);
if (timestamps.timestamp || timestamps.createdAt || timestamps.updatedAt) {
report.collections[collection.name].withTimestamps++;
} else {
report.collections[collection.name].withoutTimestamps++;
}
});
}
const settingsKeys = [
'factory_default_formulas',
'factory_additional_costs',
'factory_cost_adjustment_factor',
'factory_sale_prices',
'factory_unit_tracking',
'naswar_default_settings'
];
for (const key of settingsKeys) {
const timestamp = await idb.get(`${key}_timestamp`);
report.settings[key] = {
hasTimestamp: !!timestamp,
timestamp: timestamp,
date: timestamp ? new Date(timestamp).toLocaleString() : 'N/A'
};
if (!timestamp) {
report.issues.push({
type: 'MISSING_SETTING_TIMESTAMP',
setting: key,
message: 'Setting does not have a timestamp'
});
}
}
Object.entries(report.collections).forEach(([name, data]) => {
});
Object.entries(report.settings).forEach(([name, data]) => {
});
if (report.issues.length > 0) {
report.issues.forEach((issue, index) => {
});
} else {
}
return report;
}
async function deduplicateAllData() {
const _ddMsg = `Run a full deduplication scan?\n\nThis will:\n • Scan all records across every collection\n • Remove exact duplicate entries (keeping the newest version)\n • Sync cleaned data to the cloud\n\n\u26a0 This operation may take 30–60 seconds depending on data volume. Do not close the app while it runs.\n\nThis cannot be undone — but your data will only be improved, not deleted.`;
if (!(await showGlassConfirm(_ddMsg, { title: 'Deduplicate All Data', confirmText: 'Run Cleanup', cancelText: 'Cancel', danger: true }))) {
return;
}
showToast('Scanning for duplicates and old IDs...', 'info');
const results = {
collections: {},
totalDuplicates: 0,
totalRecordsBefore: 0,
totalRecordsAfter: 0
};
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
const deduplicateArray = (array) => {
if (!Array.isArray(array) || array.length === 0) {
return { cleaned: array, duplicates: 0 };
}
const seen = new Map();
let duplicatesRemoved = 0;
array.forEach(item => {
if (!item || !item.id) return;
if (!validateUUID(item.id)) item.id = generateUUID();
if (seen.has(item.id)) {
duplicatesRemoved++;
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
return {
cleaned: Array.from(seen.values()),
duplicates: duplicatesRemoved
};
};
const collections = [
{ key: 'mfg_pro_pkr', label: 'Production', variable: 'db' },
{ key: 'noman_history', label: 'Calculator History', variable: null },
{ key: 'customer_sales', label: 'Customer Sales', variable: 'customerSales' },
{ key: 'rep_sales', label: 'Rep Sales', variable: 'repSales' },
{ key: 'rep_customers', label: 'Rep Customers', variable: 'repCustomers' },
{ key: 'factory_inventory_data', label: 'Factory Inventory', variable: 'factoryInventoryData' },
{ key: 'factory_production_history', label: 'Factory History', variable: 'factoryProductionHistory' },
{ key: 'stock_returns', label: 'Stock Returns', variable: 'stockReturns' },
{ key: 'payment_transactions', label: 'Payment Transactions', variable: 'paymentTransactions' },
{ key: 'payment_entities', label: 'Payment Entities', variable: 'paymentEntities' },
{ key: 'expenses', label: 'Expenses', variable: 'expenseRecords' }
];
for (const collection of collections) {
const data = await idb.get(collection.key, []);
const before = data.length;
results.totalRecordsBefore += before;
const { cleaned, duplicates } = deduplicateArray(data);
const after = cleaned.length;
results.totalRecordsAfter += after;
results.collections[collection.key] = {
label: collection.label,
before: before,
after: after,
duplicates: duplicates
};
results.totalDuplicates += duplicates;
if (duplicates > 0) {
await idb.set(collection.key, cleaned);
if (collection.variable === 'db') db = cleaned;
else if (collection.variable === 'customerSales') customerSales = cleaned;
else if (collection.variable === 'repSales') repSales = cleaned;
else if (collection.variable === 'repCustomers') repCustomers = cleaned;
else if (collection.variable === 'factoryInventoryData') factoryInventoryData = cleaned;
else if (collection.variable === 'factoryProductionHistory') factoryProductionHistory = cleaned;
else if (collection.variable === 'stockReturns') stockReturns = cleaned;
else if (collection.variable === 'paymentTransactions') paymentTransactions = cleaned;
else if (collection.variable === 'paymentEntities') paymentEntities = cleaned;
else if (collection.variable === 'expenseRecords') expenseRecords = cleaned;
}
}
if (results.totalDuplicates > 0) {
showToast(` Removed ${results.totalDuplicates} duplicates!`, 'success');
await refreshAllDisplays();
if (firebaseDB && currentUser) {
showToast('Syncing cleaned data to cloud...', 'info');
await performOneClickSync(true);
}
showToast(` Done! ${results.totalDuplicates} duplicates removed. Data synced to cloud.`, 'success', 5000);
} else {
showToast(' No duplicates found! Data is clean.', 'success');
}
return results;
}
window.showDeltaSyncDetails = showDeltaSyncDetails;
window.verifyTimestampConsistency = verifyTimestampConsistency;
window.deduplicateAllData = deduplicateAllData;
async function verifyCompleteTimestampConsistency() {
const report = {
tabs: {},
indexedDB: {},
deltaSync: {},
compatibility: {},
issues: [],
summary: {
totalRecords: 0,
recordsWithValidTimestamps: 0,
recordsWithIssues: 0,
deltaSyncCompatible: true,
firestoreCompatible: true
}
};
const tabs = [
{ name: 'Production', idbKey: 'mfg_pro_pkr', variable: 'db', tab: 'prod' },
{ name: 'Sales', idbKey: 'customer_sales', variable: 'customerSales', tab: 'sales' },
{ name: 'Calculator', idbKey: 'noman_history', variable: null, tab: 'calc' },
{ name: 'Factory', idbKeys: ['factory_inventory_data', 'factory_production_history'], tab: 'factory' },
{ name: 'Payments', idbKeys: ['payment_transactions', 'payment_entities'], tab: 'payments' },
{ name: 'Rep Sales', idbKey: 'rep_sales', variable: 'repSales', tab: 'rep' }
];
for (const tab of tabs) {
const tabReport = {
name: tab.name,
collections: {},
totalRecords: 0,
validTimestamps: 0,
issues: 0
};
const keys = tab.idbKeys || [tab.idbKey];
for (const key of keys) {
const data = await idb.get(key, []);
tabReport.totalRecords += data.length;
let valid = 0;
let invalid = 0;
for (const record of data) {
if (!record) continue;
const ts = record.updatedAt || record.timestamp || record.createdAt;
if (ts) {
const extracted = extractTimestampValue(record);
if (extracted > 0) {
valid++;
} else {
invalid++;
report.issues.push({
type: 'INVALID_TIMESTAMP',
tab: tab.name,
collection: key,
id: record.id,
timestamp: ts
});
}
} else {
invalid++;
}
}
tabReport.collections[key] = {
total: data.length,
valid: valid,
invalid: invalid
};
tabReport.validTimestamps += valid;
tabReport.issues += invalid;
}
report.tabs[tab.name] = tabReport;
report.summary.totalRecords += tabReport.totalRecords;
report.summary.recordsWithValidTimestamps += tabReport.validTimestamps;
report.summary.recordsWithIssues += tabReport.issues;
}
const idbCollections = [
'mfg_pro_pkr', 'noman_history', 'customer_sales', 'rep_sales', 'rep_customers',
'factory_inventory_data', 'factory_production_history', 'stock_returns',
'payment_transactions', 'payment_entities', 'expenses'
];
for (const collectionName of idbCollections) {
const data = await idb.get(collectionName, []);
if (data.length === 0) {
report.indexedDB[collectionName] = { status: 'empty', count: 0 };
continue;
}
const formats = {
number: 0,
string: 0,
date: 0,
firestore: 0,
dict: 0,
missing: 0,
invalid: 0
};
for (const record of data) {
const ts = record.updatedAt || record.timestamp || record.createdAt;
if (!ts) {
formats.missing++;
} else if (typeof ts === 'number') {
formats.number++;
} else if (typeof ts === 'string') {
formats.string++;
} else if (ts instanceof Date) {
formats.date++;
} else if (ts && typeof ts.toMillis === 'function') {
formats.firestore++;
} else if (ts && typeof ts === 'object' && (ts.seconds || ts._seconds)) {
formats.dict++;
} else {
formats.invalid++;
}
}
report.indexedDB[collectionName] = {
status: 'ok',
count: data.length,
formats: formats
};
const validCount = formats.number + formats.string + formats.date + formats.firestore + formats.dict;
}
const deltaSyncCollections = [
{ name: 'production', idbKey: 'mfg_pro_pkr' },
{ name: 'sales', idbKey: 'customer_sales' },
{ name: 'calculator_history', idbKey: 'noman_history' },
{ name: 'rep_sales', idbKey: 'rep_sales' },
{ name: 'rep_customers', idbKey: 'rep_customers' },
{ name: 'transactions', idbKey: 'payment_transactions' },
{ name: 'entities', idbKey: 'payment_entities' },
{ name: 'inventory', idbKey: 'factory_inventory_data' },
{ name: 'factory_history', idbKey: 'factory_production_history' },
{ name: 'returns', idbKey: 'stock_returns' },
{ name: 'expenses', idbKey: 'expenses' }
];
for (const collection of deltaSyncCollections) {
const data = await idb.get(collection.idbKey, []);
if (data.length === 0) {
report.deltaSync[collection.name] = { status: 'empty', compatible: true };
continue;
}
let deltaSyncWorking = 0;
let deltaSyncFailing = 0;
for (const record of data) {
const itemTime = record.updatedAt || record.timestamp || record.createdAt || 0;
const itemTimestamp = typeof itemTime === 'number' ? itemTime :
typeof itemTime === 'string' ? new Date(itemTime).getTime() :
itemTime?.toMillis ? itemTime.toMillis() : 0;
if (itemTimestamp > 0) {
deltaSyncWorking++;
} else {
deltaSyncFailing++;
}
}
const compatible = deltaSyncFailing === 0;
report.deltaSync[collection.name] = {
status: compatible ? 'compatible' : 'issues',
compatible: compatible,
total: data.length,
working: deltaSyncWorking,
failing: deltaSyncFailing
};
if (!compatible) {
report.summary.deltaSyncCompatible = false;
}
const statusIcon = compatible ? '' : '';
}
for (const collectionName of idbCollections) {
const data = await idb.get(collectionName, []);
if (data.length === 0) {
report.compatibility[collectionName] = { firestore: 'empty' };
continue;
}
let canSerialize = 0;
let cannotSerialize = 0;
for (const record of data.slice(0, 10)) {
try {
const ts = record.updatedAt || record.timestamp || record.createdAt;
if (typeof ts === 'number' || typeof ts === 'string' || ts instanceof Date) {
canSerialize++;
} else if (ts && typeof ts === 'object') {
canSerialize++;
} else {
cannotSerialize++;
}
} catch (e) {
cannotSerialize++;
}
}
const compatible = cannotSerialize === 0;
report.compatibility[collectionName] = {
firestore: compatible ? 'compatible' : 'issues',
sampled: Math.min(10, data.length),
compatible: canSerialize,
incompatible: cannotSerialize
};
if (!compatible) {
report.summary.firestoreCompatible = false;
}
}
const testRecords = [
{ id: 'test-1', updatedAt: Date.now(), name: 'Number timestamp' },
{ id: 'test-2', timestamp: new Date().toISOString(), name: 'ISO string' },
{ id: 'test-3', createdAt: new Date(), name: 'Date object' },
{ id: 'test-4', updatedAt: { seconds: Math.floor(Date.now()/1000) }, name: 'Dict timestamp' }
];
let extractionWorks = true;
for (const record of testRecords) {
const extracted = extractTimestampValue(record);
if (extracted === 0) {
extractionWorks = false;
}
}
if (extractionWorks) {
}
const testDuplicates = [
{ id: 'dup-1', timestamp: 1000, value: 'old' },
{ id: 'dup-1', timestamp: 2000, value: 'new' }
];
if (report.issues.length > 0) {
report.issues.slice(0, 5).forEach((issue, i) => {
});
if (report.issues.length > 5) {
}
} else {
}
return report;
}
function extractTimestampValue(record) {
if (!record) return 0;
let ts = record.updatedAt || record.timestamp || record.createdAt || 0;
if (typeof ts === 'number') return ts;
if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
if (ts && typeof ts === 'object') {
if (typeof ts.seconds === 'number') return ts.seconds * 1000;
if (typeof ts._seconds === 'number') return ts._seconds * 1000;
}
if (ts instanceof Date) return ts.getTime();
if (typeof ts === 'string') {
try {
const date = new Date(ts.replace('Z', '+00:00'));
const time = date.getTime();
if (!isNaN(time)) return time;
} catch (e) {}
}
return 0;
}
window.verifyCompleteTimestampConsistency = verifyCompleteTimestampConsistency;
async function runUnifiedCleanup() {
const _ucMsg = `Run a comprehensive cleanup and verification pass?\n\nThis will:\n • Remove duplicate records across all collections\n • Verify and fix corrupted timestamps\n • Check record integrity and flag anomalies\n • Sync the cleaned dataset to cloud\n\n\u23f1 Estimated time: 2–3 minutes. Do not close the app during this process.\n\nYour data will only be improved — no valid records are deleted.`;
if (!(await showGlassConfirm(_ucMsg, { title: 'Unified Cleanup & Verification', confirmText: 'Run Full Cleanup', cancelText: 'Cancel', danger: true }))) {
return;
}
showToast(' Starting cleanup...', 'info', 3000);
try {
showToast(' Cleaning ...', 'info', 3000);
const dedupResults = {
collections: {},
totalDuplicates: 0,
totalRecordsBefore: 0,
totalRecordsAfter: 0
};
const getTimestampValue = (record) => {
if (!record) return 0;
let ts = record.updatedAt || record.timestamp || record.createdAt || 0;
if (typeof ts === 'number') return ts;
if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
if (ts && typeof ts === 'object') {
if (typeof ts.seconds === 'number') return ts.seconds * 1000;
if (typeof ts._seconds === 'number') return ts._seconds * 1000;
}
if (ts instanceof Date) return ts.getTime();
if (typeof ts === 'string') {
try {
const date = new Date(ts.replace('Z', '+00:00'));
const time = date.getTime();
if (!isNaN(time)) return time;
} catch (e) {}
}
return 0;
};
const deduplicateArray = (array) => {
if (!Array.isArray(array) || array.length === 0) {
return { cleaned: array, duplicates: 0 };
}
const seen = new Map();
let duplicatesRemoved = 0;
array.forEach(item => {
if (!item || !item.id) return;
if (!validateUUID(item.id)) item.id = generateUUID();
if (seen.has(item.id)) {
duplicatesRemoved++;
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
return {
cleaned: Array.from(seen.values()),
duplicates: duplicatesRemoved
};
};
const collections = [
{ key: 'mfg_pro_pkr', label: 'Production', variable: 'db' },
{ key: 'noman_history', label: 'Calculator History', variable: null },
{ key: 'customer_sales', label: 'Customer Sales', variable: 'customerSales' },
{ key: 'rep_sales', label: 'Rep Sales', variable: 'repSales' },
{ key: 'rep_customers', label: 'Rep Customers', variable: 'repCustomers' },
{ key: 'factory_inventory_data', label: 'Factory Inventory', variable: 'factoryInventoryData' },
{ key: 'factory_production_history', label: 'Factory History', variable: 'factoryProductionHistory' },
{ key: 'stock_returns', label: 'Stock Returns', variable: 'stockReturns' },
{ key: 'payment_transactions', label: 'Payment Transactions', variable: 'paymentTransactions' },
{ key: 'payment_entities', label: 'Payment Entities', variable: 'paymentEntities' },
{ key: 'expenses', label: 'Expenses', variable: 'expenseRecords' }
];
for (const collection of collections) {
const data = await idb.get(collection.key, []);
const before = data.length;
dedupResults.totalRecordsBefore += before;
const { cleaned, duplicates } = deduplicateArray(data);
const after = cleaned.length;
dedupResults.totalRecordsAfter += after;
dedupResults.collections[collection.key] = {
label: collection.label,
before: before,
after: after,
duplicates: duplicates
};
dedupResults.totalDuplicates += duplicates;
if (duplicates > 0) {
await idb.set(collection.key, cleaned);
if (collection.variable === 'db') db = cleaned;
else if (collection.variable === 'customerSales') customerSales = cleaned;
else if (collection.variable === 'repSales') repSales = cleaned;
else if (collection.variable === 'repCustomers') repCustomers = cleaned;
else if (collection.variable === 'factoryInventoryData') factoryInventoryData = cleaned;
else if (collection.variable === 'factoryProductionHistory') factoryProductionHistory = cleaned;
else if (collection.variable === 'stockReturns') stockReturns = cleaned;
else if (collection.variable === 'paymentTransactions') paymentTransactions = cleaned;
else if (collection.variable === 'paymentEntities') paymentEntities = cleaned;
else if (collection.variable === 'expenseRecords') expenseRecords = cleaned;
}
}
showToast(' Verifying ...', 'info', 3000);
await verifyTimestampConsistency();
showToast('Full system scan...', 'info', 3000);
const verificationReport = await verifyCompleteTimestampConsistency();
showToast('Syncing to cloud...', 'info', 3000);
if (firebaseDB && currentUser) {
try {
await refreshAllDisplays();
await performOneClickSync(true);
} catch (syncError) {
console.error('Sync failed. Check your connection.', syncError);
showToast('Sync failed. Check your connection.', 'error');
}
} else {
}
const summary = ` Unified Cleanup Complete!
Duplicates Removed: ${dedupResults.totalDuplicates}
Total Records: ${verificationReport.summary.totalRecords}
Issues Found: ${verificationReport.summary.recordsWithIssues}
Delta Sync: ${verificationReport.summary.deltaSyncCompatible ? '' : ''}
Firestore: ${verificationReport.summary.firestoreCompatible ? '' : ''}
${firebaseDB && currentUser ? ' Synced to cloud' : ' Cloud sync skipped'}
Check console (F12) for detailed report.`;
showToast(' cleanup complete!', 'success', 3000);
} catch (error) {
showToast(' Cleanup failed: ' + error.message, 'error', 5000);
showToast(' Unified cleanup error: ' + error.message, 'error', 5000);
}
}
window.runUnifiedCleanup = runUnifiedCleanup;
