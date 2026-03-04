async function loadSalesRepsList() {
const stored = await idb.get('sales_reps_list', null);
if (Array.isArray(stored) && stored.length > 0) {
salesRepsList = stored;
} else {
salesRepsList = ['NORAN SHAH', 'NOMAN SHAH'];
await idb.set('sales_reps_list', salesRepsList);
}
const storedUserRoles = await idb.get('user_roles_list', null);
if (Array.isArray(storedUserRoles)) userRolesList = storedUserRoles;
if (firebaseDB && currentUser) {
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const teamDoc = await userRef.collection('settings').doc('team').get();
if (teamDoc.exists) {
const teamData = teamDoc.data();
const cloudTs = teamData.updated_at || 0;
const localTs = (await idb.get('team_list_timestamp')) || 0;
if (cloudTs >= localTs) {
if (Array.isArray(teamData.sales_reps) && teamData.sales_reps.length > 0) {
salesRepsList = teamData.sales_reps;
await idb.set('sales_reps_list', salesRepsList);
}
if (Array.isArray(teamData.user_roles)) {
userRolesList = teamData.user_roles;
await idb.set('user_roles_list', userRolesList);
}
if (cloudTs > localTs) await idb.set('team_list_timestamp', cloudTs);
}
}
} catch(e) { console.warn('Could not fetch team list from Firestore on startup:', e); }
}
renderAllRepUI();
}
async function saveSalesRepsList() {
await idb.set('sales_reps_list', salesRepsList);
if (firebaseDB && currentUser) {
try {
const nowMs = Date.now();
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
await userRef.collection('settings').doc('team').set({
sales_reps: salesRepsList,
user_roles: userRolesList,
updated_at: nowMs
}, { merge: true });
await idb.set('team_list_timestamp', nowMs);
} catch(e) { console.warn('Could not sync sales reps to Firestore', e); }
}
renderAllRepUI();
}
async function saveProductionManagersList() {
await saveUserRolesList();
}
async function saveFactoryManagersList() {
await saveUserRolesList();
}
async function saveUserRolesList() {
await idb.set('user_roles_list', userRolesList);
if (firebaseDB && currentUser) {
try {
const nowMs = Date.now();
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
await userRef.collection('settings').doc('team').set({
sales_reps: salesRepsList,
user_roles: userRolesList,
updated_at: nowMs
}, { merge: true });
await idb.set('team_list_timestamp', nowMs);
} catch(e) { console.warn('Could not sync user roles to Firestore', e); }
}
}
function renderAllRepUI() {
const adminSel = document.getElementById('admin-rep-selector');
if (adminSel) {
const prev = adminSel.value;
adminSel.innerHTML = salesRepsList.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
if (salesRepsList.includes(prev)) adminSel.value = prev;
else if (salesRepsList.includes(currentRepProfile)) adminSel.value = currentRepProfile;
else if (salesRepsList.length > 0) { adminSel.value = salesRepsList[0]; currentRepProfile = salesRepsList[0]; }
}
const sellerSel = document.getElementById('sellerSelect');
if (sellerSel) {
const prev2 = sellerSel.value;
sellerSel.innerHTML = salesRepsList.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('') +
'<option value="COMBINED">COMPARISON</option>';
if (salesRepsList.includes(prev2) || prev2 === 'COMBINED') sellerSel.value = prev2;
}
const toggleGroup = document.getElementById('sales-rep-toggle-group');
if (toggleGroup) {
const currentVal = document.getElementById('sales-rep-value')?.value || 'NONE';
toggleGroup.innerHTML = `<button id="btn-rep-none" class="toggle-opt${currentVal === 'NONE' ? ' active' : ''}" onclick="selectSalesRep(this,'NONE')">Direct</button>` +
salesRepsList.map((r, i) => {
const firstName = r.split(' ')[0];
const shortName = firstName.charAt(0) + firstName.slice(1).toLowerCase();
return `<button id="btn-rep-dyn-${i}" class="toggle-opt${currentVal === r ? ' active' : ''}" onclick="selectSalesRep(this,'${esc(r)}')">${esc(shortName)}</button>`;
}).join('');
}
renderManageRepsList();
}
function renderManageRepsList() {
const list = document.getElementById('manage-reps-list');
if (!list) return;
if (salesRepsList.length === 0) {
list.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:12px;">No representatives added yet.</div>';
return;
}
list.innerHTML = salesRepsList.map((rep, i) => `
<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 18px; background:var(--glass-raised); border:1px solid var(--glass-border); border-radius:9999px; ${i === 0 ? 'border-left:3px solid var(--accent);' : ''}">
<div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
<span style="font-size:0.85rem; font-weight:800; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(rep)}</span>
<span style="font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:${i === 0 ? 'var(--accent)' : 'var(--text-muted)'}; flex-shrink:0;">${i === 0 ? '● Default' : `#${i + 1}`}</span>
</div>
<button class="btn-theme" onclick="removeSalesRep(${i})" title="Remove ${esc(rep)}" style="flex-shrink:0; color:var(--danger); border-color:rgba(239,68,68,0.4); font-size:0.8rem;">✕</button>
</div>
`).join('');
}
let _newUserRoleSelectedTabs = new Set();
function toggleUserRoleTabAccess(tabKey) {
if (_newUserRoleSelectedTabs.has(tabKey)) {
_newUserRoleSelectedTabs.delete(tabKey);
} else {
_newUserRoleSelectedTabs.add(tabKey);
}
['factory','prod','payments','sales'].forEach(t => {
const btn = document.getElementById('userrole-tab-' + t);
if (btn) btn.classList.toggle('active', _newUserRoleSelectedTabs.has(t));
});
const hint = document.getElementById('userrole-access-hint');
if (hint) {
hint.textContent = _newUserRoleSelectedTabs.size === 0
? 'Select one or more tabs to assign'
: 'Access: ' + [..._newUserRoleSelectedTabs].map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
}
}
function renderUserRoleList() {
const list = document.getElementById('manage-userrole-list');
if (!list) return;
if (userRolesList.length === 0) {
list.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:12px;">No users added yet.</div>';
return;
}
const TAB_COLORS = { factory: 'var(--accent-purple)', prod: 'var(--accent-emerald)', payments: 'var(--accent-cyan)', sales: 'var(--accent-gold)' };
list.innerHTML = userRolesList.map((user, i) => {
const tabs = Array.isArray(user.tabs) ? user.tabs : [];
const tabBadges = tabs.map(t => `<span style="font-size:0.58rem;padding:2px 7px;border-radius:9999px;background:${TAB_COLORS[t]||'var(--accent)'}22;color:${TAB_COLORS[t]||'var(--accent)'};border:1px solid ${TAB_COLORS[t]||'var(--accent)'}55;font-weight:700;text-transform:uppercase;">${t}</span>`).join('');
return `
<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; background:var(--glass-raised); border:1px solid var(--glass-border); border-radius:var(--radius-lg); margin-bottom:8px;">
<div style="flex:1; min-width:0;">
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
<span style="font-size:0.85rem; font-weight:800; color:var(--text-main);">${esc(user.name)}</span>
</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;">${tabBadges || '<span style="font-size:0.65rem;color:var(--text-secondary);">No tabs assigned</span>'}</div>
</div>
<button class="btn-theme" onclick="removeUserRole(${i})" title="Remove ${esc(user.name)}" style="flex-shrink:0; color:var(--danger); border-color:rgba(239,68,68,0.4); font-size:0.8rem;">✕</button>
</div>`;
}).join('');
}
function switchManageTeamTab(tab) {
['rep', 'userrole'].forEach(t => {
const btn = document.getElementById('team-tab-' + t);
const panel = document.getElementById('team-panel-' + t);
if (btn) btn.classList.toggle('active', t === tab);
if (panel) panel.style.display = t === tab ? '' : 'none';
});
if (tab === 'userrole') renderUserRoleList();
if (tab === 'rep') renderManageRepsList();
}
async function addNewUserRole() {
const input = document.getElementById('new-userrole-name-input');
if (!input) return;
const name = input.value.trim().toUpperCase();
if (!name) { showToast('Please enter a name', 'warning'); return; }
if (_newUserRoleSelectedTabs.size === 0) { showToast('Please select at least one tab', 'warning'); return; }
if (userRolesList.some(u => u.name === name)) { showToast('User already exists', 'warning'); return; }
userRolesList.push({ name, tabs: [..._newUserRoleSelectedTabs] });
await saveUserRolesList();
input.value = '';
_newUserRoleSelectedTabs.clear();
['factory','prod','payments','sales'].forEach(t => {
const btn = document.getElementById('userrole-tab-' + t);
if (btn) btn.classList.remove('active');
});
const hint = document.getElementById('userrole-access-hint');
if (hint) hint.textContent = 'Select one or more tabs to assign';
renderUserRoleList();
showToast(`${name} added as User`, 'success');
}
async function removeUserRole(index) {
const user = userRolesList[index];
if (!user) return;
const _rMsg = `Remove ${esc(user.name)} from the team?\n\nThey will lose access to their assigned sections. This does not delete any recorded data.`;
const confirmed = await showGlassConfirm(_rMsg, { title: 'Remove User', confirmText: 'Remove', cancelText: 'Cancel', danger: true });
if (!confirmed) return;
userRolesList.splice(index, 1);
await saveUserRolesList();
renderUserRoleList();
showToast(`${esc(user.name)} removed`, 'info');
}
async function addNewSalesRep() {
const input = document.getElementById('new-rep-name-input');
if (!input) return;
const name = input.value.trim().toUpperCase();
if (!name) { showToast('Please enter a name', 'warning'); return; }
if (salesRepsList.includes(name)) { showToast('Rep already exists', 'warning'); return; }
salesRepsList.push(name);
await saveSalesRepsList();
input.value = '';
showToast(`${name} added`, 'success');
}
async function removeSalesRep(index) {
if (salesRepsList.length <= 1) { showToast('Must have at least one representative', 'warning'); return; }
const name = salesRepsList[index];
const _rsrSales = (typeof repSales !== 'undefined' ? repSales : []).filter(s => s.salesRep === name).length;
let _rsrMsg = `Remove ${name} from the sales team?`;
_rsrMsg += `\n\nThey will no longer appear as an available rep in the app.`;
if (_rsrSales > 0) _rsrMsg += `\n\n⚠ ${name} has ${_rsrSales} recorded sale${_rsrSales !== 1 ? 's' : ''} in the system. Those records will be kept, but you will no longer be able to add new sales under this name.`;
if (typeof currentRepProfile !== 'undefined' && currentRepProfile === name) _rsrMsg += `\n\n⚠ This rep is currently active on this device. The device will switch to the next available rep.`;
_rsrMsg += `\n\nThis does not delete any of their existing sales data.`;
const confirmed = await showGlassConfirm(_rsrMsg, {
title: `Remove ${name}`,
confirmText: 'Remove',
cancelText: 'Cancel',
danger: true
});
if (!confirmed) return;
salesRepsList.splice(index, 1);
if (currentRepProfile === name) {
currentRepProfile = salesRepsList[0];
await idb.set('repProfile', currentRepProfile);
}
await saveSalesRepsList();
showToast(`${name} removed`, 'info');
}
function openManageRepsModal() {
renderManageRepsList();
const modal = document.getElementById('manage-reps-modal');
if (!modal) return;
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
modal.classList.add('open');
}
function closeManageRepsModal() {
const modal = document.getElementById('manage-reps-modal');
if (!modal) return;
modal.classList.remove('open');
document.body.style.overflow = '';
document.documentElement.style.overflow = '';
}
document.addEventListener('click', function(e) {
const modal = document.getElementById('manage-reps-modal');
if (!modal || !modal.classList.contains('open')) return;
const card = document.getElementById('manage-reps-card');
if (card && card.contains(e.target)) return;
closeManageRepsModal();
}, true);
document.addEventListener('click', function(e) {
const overlayCloseFns = {
'factorySettingsOverlay': () => closeFactorySettings(),
'factoryInventoryOverlay': () => closeFactoryInventoryModal(),
'entityManagementOverlay': () => closeEntityManagement(),
'entityDetailsOverlay': () => closeEntityDetailsOverlay(),
'expenseDetailsOverlay': () => closeExpenseDetailsOverlay(),
'customerManagementOverlay': () => closeCustomerManagement(),
'customerEditOverlay': () => closeCustomerEditModal(),
'repCustomerManagementOverlay': () => closeRepCustomerManagement(),
'repCustomerEditOverlay': () => closeRepCustomerEditModal(),
'dataMenuOverlay': () => closeDataMenu(),
'entityTransactionsOverlay': () => closeEntityTransactions(),
};
for (const [id, closeFn] of Object.entries(overlayCloseFns)) {
const overlay = document.getElementById(id);
if (!overlay || overlay.style.display === 'none' || overlay.style.display === '') continue;
const card = overlay.querySelector('.factory-overlay-card');
if (card && card.contains(e.target)) continue;
closeFn();
}
}, true);
document.addEventListener('DOMContentLoaded', function() {
loadSalesRepsList();
setTimeout(() => {
if (typeof generateUUID === 'function') {
const saleIdEl = document.getElementById('new-sale-id-display');
if (saleIdEl) { const id = generateUUID(); saleIdEl.textContent = 'ID: ' + id.split('-').slice(0,2).join('-') + '…'; saleIdEl.title = id; }
const expIdEl = document.getElementById('expense-id-display');
if (expIdEl) { const id2 = generateUUID('exp'); expIdEl.textContent = 'ID: ' + id2.split('-').slice(0,2).join('-') + '…'; expIdEl.title = id2; }
}
}, 400);
});
window.loadSalesRepsList = loadSalesRepsList;
window.saveSalesRepsList = saveSalesRepsList;
window.renderAllRepUI = renderAllRepUI;
window.addNewSalesRep = addNewSalesRep;
window.removeSalesRep = removeSalesRep;
window.openManageRepsModal = openManageRepsModal;
window.closeManageRepsModal = closeManageRepsModal;
window.switchManageTeamTab = switchManageTeamTab;
window.addNewUserRole = addNewUserRole;
window.removeUserRole = removeUserRole;
window.toggleUserRoleTabAccess = toggleUserRoleTabAccess;
window.renderUserRoleList = renderUserRoleList;
window.saveUserRolesList = saveUserRolesList;
window.lockToUserRoleMode = lockToUserRoleMode;
function phoneActionHTML(phone, opts = {}) {
const raw = (phone || '').toString().trim();
const empty = !raw || raw === '-' || raw === 'N/A' || raw === 'No Phone' || raw === 'No contact';
if (empty) return raw || (opts.dash ? '-' : '');
const digitCount = (raw.match(/\d/g) || []).length;
const looksLikePhone = digitCount >= 7 && /^[\d\s\-+(). ]+$/.test(raw);
if (!looksLikePhone) return esc(raw);
const clean = raw.replace(/[\s\-().]/g, '');
const wa = clean.startsWith('0') ? '92' + clean.slice(1) : clean;
return `<a href="tel:${clean}" title="Tap to call · Long-press for WhatsApp" style="color:inherit;text-decoration:none;cursor:pointer;border-bottom:1px dotted currentColor;touch-action:manipulation;-webkit-touch-callout:default;" oncontextmenu="event.preventDefault();window.open('https://wa.me/${wa}','_blank')">${esc(raw)}</a>`;
}
window.phoneActionHTML = phoneActionHTML;
window.initDatabase = async function(silent = false) {
const result = await initializeCompleteFirestoreDatabase(silent);
return result;
};
window.checkDatabase = async function() {
const isComplete = await isCompleteDatabaseInitialized();
return isComplete;
};
window.safeInitDatabase = async function(silent = false) {
const result = await safeInitializeCompleteDatabase(silent);
return result;
};
window.analyzeBackupFile = function(file) {
if (!file) {
return;
}
const reader = new FileReader();
reader.onload = (e) => {
try {
const data = JSON.parse(e.target.result);
const reportLines = [];
const meta = data.backupMetadata;
reportLines.push({ type: 'section', label: 'Backup Metadata' });
if (meta) {
const createdAt = meta.timestamp
? new Date(meta.timestamp).toLocaleString()
: (meta.date || 'Unknown');
reportLines.push({ type: 'row', label: 'Created', value: createdAt });
reportLines.push({ type: 'row', label: 'Version', value: meta.version || 'Unknown' });
reportLines.push({ type: 'row', label: 'Device', value: meta.deviceInfo ? meta.deviceInfo.substring(0, 60) : 'Unknown' });
} else {
reportLines.push({ type: 'warning', label: 'No backup metadata found.' });
}
reportLines.push({ type: 'section', label: 'Collection Summary' });
const collections = [
['mfg', 'Production'],
['sales', 'Calculator History'],
['customerSales', 'Customer Sales'],
['repSales', 'Rep Sales'],
['repCustomers', 'Rep Customers'],
['salesCustomers', 'Sales Customers'],
['paymentTransactions', 'Payment Transactions'],
['paymentEntities', 'Payment Entities'],
['factoryInventoryData', 'Factory Inventory'],
['factoryProductionHistory', 'Factory History'],
['stockReturns', 'Stock Returns'],
['expenses', 'Expenses'],
];
let totalIssues = 0;
for (const [key, label] of collections) {
if (!data[key] || !Array.isArray(data[key])) {
reportLines.push({ type: 'row', label, value: 'Not present', muted: true });
continue;
}
const records = data[key];
if (records.length === 0) {
reportLines.push({ type: 'row', label, value: '0 records', muted: true });
continue;
}
const ids = records.map(r => r.id).filter(Boolean);
const uniqueIds = new Set(ids);
const duplicates = ids.length - uniqueIds.size;
const missingIds = records.length - ids.length;
let statusParts = [`${records.length} records`];
let hasIssue = false;
if (duplicates > 0) { statusParts.push(`⚠ ${duplicates} duplicate IDs`); totalIssues += duplicates; hasIssue = true; }
if (missingIds > 0) { statusParts.push(`⚠ ${missingIds} missing IDs`); totalIssues += missingIds; hasIssue = true; }
reportLines.push({
type: 'row',
label,
value: statusParts.join(' · '),
issue: hasIssue
});
}
reportLines.push({ type: 'section', label: 'Settings & Formulas' });
const settingsKeys = [
['factoryDefaultFormulas', 'Factory Default Formulas'],
['factoryAdditionalCosts', 'Additional Costs'],
['factoryCostAdjustmentFactor', 'Cost Adjustment Factor'],
['factorySalePrices', 'Sale Prices'],
['factoryUnitTracking', 'Unit Tracking'],
['settings', 'App Settings (naswar)'],
];
for (const [key, label] of settingsKeys) {
const present = data[key] !== undefined && data[key] !== null;
reportLines.push({ type: 'row', label, value: present ? 'Present ✓' : 'Not present', muted: !present });
}
const tombstoneCount = Array.isArray(data.deleted_records) ? data.deleted_records.length : 0;
reportLines.push({ type: 'section', label: 'Deleted Records (Tombstones)' });
reportLines.push({ type: 'row', label: 'Tombstone count', value: String(tombstoneCount) });
const verdict = totalIssues > 0
? { icon: '', color: '#f59e0b', text: `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found — restore will auto-clean on import` }
: { icon: '', color: '#10b981', text: 'File looks healthy — no duplicates or format issues detected' };
const existing = document.getElementById('backup-analysis-modal');
if (existing) existing.remove();
const modal = document.createElement('div');
modal.id = 'backup-analysis-modal';
modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px;';
const rowsHtml = reportLines.map(line => {
if (line.type === 'section') {
return `<div style="font-size:0.65rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;margin:14px 0 6px 0;padding-top:10px;border-top:1px solid var(--glass-border);">${esc(line.label)}</div>`;
}
if (line.type === 'warning') {
return `<div style="font-size:0.72rem;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:8px 10px;margin:4px 0;">⚠ ${esc(line.label)}</div>`;
}
const valueColor = line.issue ? '#f59e0b' : (line.muted ? 'var(--text-muted)' : 'var(--text-main)');
return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:0.72rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
<span style="color:var(--text-muted);flex-shrink:0;">${esc(line.label)}</span>
<span style="color:${valueColor};text-align:right;font-weight:${line.issue ? '600' : '400'};">${esc(line.value)}</span>
</div>`;
}).join('');
modal.innerHTML = `
<div style="background:var(--glass);border:1px solid var(--glass-border);padding:24px;border-radius:24px;max-width:480px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
<h3 style="margin:0 0 4px 0;color:var(--text-main);font-size:1rem;display:flex;align-items:center;gap:8px;">
Backup File Analysis
</h3>
<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:16px;">${esc(file.name)} · ${(file.size / 1024).toFixed(1)} KB</div>
<div style="background:var(--input-bg);border-radius:14px;padding:14px;margin-bottom:16px;">
${rowsHtml}
</div>
<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid;background:${verdict.color}18;border-color:${verdict.color}44;margin-bottom:16px;">
<span style="font-size:1.2rem;">${esc(verdict.icon)}</span>
<span style="font-size:0.75rem;color:${verdict.color};font-weight:600;">${esc(verdict.text)}</span>
</div>
<div style="display:flex;gap:10px;">
<button onclick="document.getElementById('backup-analysis-modal').remove(); document.getElementById('restoreInput').click();"
style="flex:1;padding:12px;background:var(--accent);border:none;border-radius:14px;color:white;cursor:pointer;font-size:0.82rem;font-weight:600;">
Restore This File
</button>
<button onclick="document.getElementById('backup-analysis-modal').remove();"
style="flex:1;padding:12px;background:var(--glass);border:1px solid var(--glass-border);border-radius:14px;color:var(--text-main);cursor:pointer;font-size:0.82rem;">
Close
</button>
</div>
</div>
`;
document.body.appendChild(modal);
modal.addEventListener('click', (ev) => {
if (ev.target === modal) modal.remove();
});
} catch (error) {
console.error('analyzeBackupFile error:', error);
showToast('Could not parse backup file: ' + error.message, 'error');
}
};
reader.readAsText(file);
};
