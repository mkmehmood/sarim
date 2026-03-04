async function showDeltaSyncDetails() {
if (!firebaseDB || !currentUser) {
showToast('Please log in to view Firestore structure', 'warning', 3000);
return;
}
const statsInitialized = await initializeSyncStatsIfNeeded();
if (statsInitialized) {
}
const loadingModal = document.createElement('div');
loadingModal.id = 'delta-stats-modal';
loadingModal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
loadingModal.innerHTML = `
<div style="background: var(--glass); padding: 40px; border-radius: 100px; text-align: center;">
<div style="margin-bottom: 15px; font-size: 4rem; line-height: 1;">🐦‍🔥</div>
<div style="color: var(--text); font-size: 1rem;">Loading Firestore</div>
</div>
`;
document.body.appendChild(loadingModal);
try {
const userRef = firebaseDB.collection('users').doc(currentUser.uid);
const [
productionSnap, salesSnap, calcHistorySnap, repSalesSnap, repCustomersSnap,
salesCustomersSnap,
transactionsSnap, entitiesSnap, inventorySnap, factoryHistorySnap,
returnsSnap, expensesSnap, deletionsSnap,
settingsDoc, factorySettingsDoc, expenseCategoriesDoc, teamDoc
] = await Promise.all([
userRef.collection('production').get(),
userRef.collection('sales').get(),
userRef.collection('calculator_history').get(),
userRef.collection('rep_sales').get(),
userRef.collection('rep_customers').get(),
userRef.collection('sales_customers').get(),
userRef.collection('transactions').get(),
userRef.collection('entities').get(),
userRef.collection('inventory').get(),
userRef.collection('factory_history').get(),
userRef.collection('returns').get(),
userRef.collection('expenses').get(),
userRef.collection('deletions').get(),
userRef.collection('settings').doc('config').get(),
userRef.collection('factorySettings').doc('config').get(),
userRef.collection('expenseCategories').doc('categories').get(),
userRef.collection('settings').doc('team').get()
]);
const stats = await DeltaSync.getSyncStats();
const collections = [
{ name: 'production', snap: productionSnap, icon: '', description: 'Production records (db)' },
{ name: 'sales', snap: salesSnap, icon: '', description: 'Customer sales (customerSales)' },
{ name: 'rep_sales', snap: repSalesSnap, icon: '', description: 'Representative sales (repSales)' },
{ name: 'rep_customers', snap: repCustomersSnap, icon: '', description: 'Rep customers with contacts (repCustomers)' },
{ name: 'sales_customers', snap: salesCustomersSnap, icon: '', description: 'Sales customers with contacts (salesCustomers)' },
{ name: 'calculator_history', snap: calcHistorySnap, icon: '', description: 'Calculator history (salesHistory)' },
{ name: 'transactions', snap: transactionsSnap, icon: '', description: 'Payment transactions (paymentTransactions)' },
{ name: 'entities', snap: entitiesSnap, icon: '', description: 'Payment entities (paymentEntities)' },
{ name: 'inventory', snap: inventorySnap, icon: '', description: 'Factory inventory (factoryInventoryData)' },
{ name: 'factory_history', snap: factoryHistorySnap,icon: '', description: 'Factory history (factoryProductionHistory)' },
{ name: 'returns', snap: returnsSnap, icon: '', description: 'Stock returns (stockReturns)' },
{ name: 'expenses', snap: expensesSnap, icon: '', description: 'Expense records (expenseRecords)' },
{ name: 'deletions', snap: deletionsSnap, icon: '', description: 'Tombstones (deletedRecordIds)' }
];
const documents = [
{
name: 'settings/config',
doc: settingsDoc,
icon: '',
description: 'App settings (defaultSettings, last_synced)',
keys: ['naswar_default_settings', 'last_synced', 'initialized_at', 'version']
},
{
name: 'settings/team',
doc: teamDoc,
icon: '',
description: 'Team lists (salesRepsList, userRolesList)',
keys: ['sales_reps', 'user_roles', 'updated_at']
},
{
name: 'factorySettings/config',
doc: factorySettingsDoc,
icon: '',
description: 'Factory formulas & costs (factoryDefaultFormulas, factoryAdditionalCosts, factoryUnitTracking)',
keys: ['default_formulas', 'additional_costs', 'cost_adjustment_factor', 'sale_prices', 'unit_tracking']
},
{
name: 'expenseCategories/categories',
doc: expenseCategoriesDoc,
icon: '',
description: 'Expense categories (expenseCategories)',
keys: ['categories']
}
];
let html = `
<div style="background: var(--glass); padding: 20px; border-radius: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto;">
<h3 style="margin: 0 0 15px 0; color: var(--accent); display:flex; align-items:center; gap:8px;"> Firestore Database Structure</h3>
<div style="margin-bottom: 20px; padding: 12px; background: var(--input-bg); border-radius: 16px; border-left: 3px solid var(--accent);">
<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Database Path:</div>
<div style="font-size: 0.8rem; color: var(--accent); font-family: 'Geist Mono', 'Courier New', monospace;">
users/${currentUser.uid}/
</div>
</div>
<div id="device-manager-section" style="margin-bottom: 20px; padding: 15px; background: var(--input-bg); border-radius: 16px; border: 2px solid var(--accent);">
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
<h4 style="margin: 0; color: var(--accent); font-size: 0.9rem; display:flex; align-items:center; gap:6px;"> Connected Devices</h4>
<button onclick="refreshDeviceList()" style="padding: 5px 10px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 12px; color: var(--text); cursor: pointer; font-size: 0.7rem; display:flex; align-items:center; gap:4px;">
Refresh
</button>
</div>
<div id="device-list-container" style="max-height: 300px; overflow-y: auto;">
<div class="u-empty-state-sm" >
Loading devices...
</div>
</div>
</div>
<div class="u-mb-20" >
<h4 style="margin: 0 0 10px 0; color: var(--text); font-size: 0.9rem;"> Collections (${collections.length})</h4>
`;
let totalDocs = 0;
const actualReads = firestoreStats.reads || 0;
const actualWrites = firestoreStats.writes || 0;
collections.forEach(col => {
const count = col.snap.size;
totalDocs += count;
const stat = stats[col.name] || { syncCount: 0, totalReads: 0, totalWrites: 0, lastSync: null };
const lastSync = stat.lastSync ? new Date(stat.lastSync).toLocaleString() : 'Never';
const hasListener = col.name !== 'deletions';
html += `
<div style="margin-bottom: 10px; padding: 12px; background: var(--input-bg); border-radius: 16px; border: 1px solid var(--glass-border);">
<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
<div>
<div style="font-weight: 600; font-size: 0.85rem; color: var(--text);">
${col.icon} ${col.name}
</div>
<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
${col.description}
</div>
</div>
<div style="text-align: right;">
<div style="font-size: 0.75rem; font-weight: 600; color: var(--accent);">
${count} docs
</div>
${hasListener ? '<div style="font-size: 0.65rem; color: #30d158;">● Live</div>' : '<div style="font-size: 0.65rem; color: var(--text-muted);">○ Polling</div>'}
</div>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.65rem; color: var(--text-muted);">
<div>Syncs: ${stat.syncCount || 0}</div>
<div>Last: ${lastSync}</div>
</div>
</div>
`;
});
html += `
</div>
<div class="u-mb-20" >
<h4 style="margin: 0 0 10px 0; color: var(--text); font-size: 0.9rem;"> Configuration Documents (${documents.length})</h4>
`;
documents.forEach(docInfo => {
const exists = docInfo.doc.exists;
const data = exists ? docInfo.doc.data() : null;
const hasListener = true;
html += `
<div style="margin-bottom: 10px; padding: 12px; background: var(--input-bg); border-radius: 16px; border: 1px solid var(--glass-border);">
<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
<div>
<div style="font-weight: 600; font-size: 0.85rem; color: var(--text);">
${docInfo.icon} ${docInfo.name}
</div>
<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
${docInfo.description}
</div>
</div>
<div style="text-align: right;">
<div style="font-size: 0.75rem; font-weight: 600; color: ${exists ? 'var(--accent)' : '#ff453a'};">
${exists ? ' Exists' : ' Missing'}
</div>
${hasListener ? '<div style="font-size: 0.65rem; color: #30d158;">● Live</div>' : ''}
</div>
</div>
`;
if (exists && data) {
html += `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">`;
html += `<div style="font-weight: 600; margin-bottom: 4px;">Fields:</div>`;
docInfo.keys.forEach(key => {
const hasKey = key in data;
const value = data[key];
let valueStr = '';
if (typeof value === 'object' && value !== null) {
if (Array.isArray(value)) {
valueStr = `Array(${value.length})`;
} else {
valueStr = `Object(${Object.keys(value).length} keys)`;
}
} else if (typeof value === 'string') {
valueStr = value.length > 30 ? value.substring(0, 30) + '...' : value;
} else {
valueStr = String(value);
}
html += `
<div style="padding: 2px 0; display: flex; justify-content: space-between;">
<span style="color: ${hasKey ? 'var(--text)' : '#ff453a'};">
${hasKey ? '' : ''} ${key}
</span>
${hasKey ? `<span style="color: var(--text-muted); font-family: 'Geist Mono', 'Courier New', monospace; font-size: 0.65rem;">${valueStr}</span>` : ''}
</div>
`;
});
html += `</div>`;
}
html += `</div>`;
});
html += `
</div>
<div style="padding: 15px; background: var(--input-bg); border-radius: 16px; border: 2px solid var(--accent); margin-bottom: 15px;">
<h4 style="margin: 0 0 10px 0; color: var(--accent); font-size: 0.85rem;">Firestore Usage Summary</h4>
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 0.75rem;">
<div>
<div style="color: var(--text-muted); font-size: 0.65rem;">Total Documents</div>
<div style="color: var(--text); font-weight: 600; font-size: 1rem;">${totalDocs}</div>
</div>
<div>
<div style="color: var(--text-muted); font-size: 0.65rem;">Firestore Reads</div>
<div style="color: #30d158; font-weight: 600; font-size: 1rem;">${actualReads}</div>
</div>
<div>
<div style="color: var(--text-muted); font-size: 0.65rem;">Firestore Writes</div>
<div style="color: #007aff; font-weight: 600; font-size: 1rem;">${actualWrites}</div>
</div>
</div>
<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-border); font-size: 0.65rem; color: var(--text-muted);">
<div class="u-row-between" >
<span style="display:flex;align-items:center;gap:4px;">Tracking Period:</span>
<span style="color: var(--text);">${(() => {
const hours = Math.floor((Date.now() - firestoreStats.lastReset) / (1000 * 60 * 60));
if (hours < 1) return 'Less than 1 hour';
if (hours === 1) return '1 hour';
if (hours < 24) return hours + ' hours';
const days = Math.floor(hours / 24);
return days + (days === 1 ? ' day' : ' days');
})()}</span>
</div>
<div style="margin-top: 5px; font-size: 0.6rem; color: var(--text-muted);">
ℹ Stats auto-reset every 24 hours • Reads & writes tracked from actual Firestore operations
</div>
</div>
</div>
<div style="padding: 12px; background: rgba(48, 209, 88, 0.1); border-radius: 16px; border: 1px solid rgba(48, 209, 88, 0.3); margin-bottom: 15px;">
<div style="font-size: 0.75rem; color: #30d158; font-weight: 600; margin-bottom: 5px;">
Active Realtime Listeners
</div>
<div style="font-size: 0.7rem; color: var(--text);">
${collections.filter(c => c.name !== 'deletions').length} collection listeners + 4 document listeners active
</div>
<div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 5px;">
Updates sync automatically in background when data changes in Firestore
</div>
</div>
<button onclick="(async()=>{ await DeltaSync.clearAllTimestamps(); await updateDeltaSyncStatsDisplay(); document.getElementById('delta-stats-modal').remove(); })()"
style="width: 100%; padding: 10px; margin-bottom: 10px; background: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.3); border-radius: 16px; color: #ff453a; cursor: pointer; font-size: 0.75rem;">
Reset Sync History
</button>
<button onclick="(async()=>{ document.getElementById('delta-stats-modal').remove(); setTimeout(() => showCloseFinancialYearDialog(), 300); })()"
style="width: 100%; padding: 10px; margin-bottom: 10px; background: rgba(175, 82, 222, 0.1); border: 1px solid rgba(175, 82, 222, 0.3); border-radius: 16px; color: #af52de; cursor: pointer; font-size: 0.75rem;">
Close Financial Year
</button>
<button onclick="document.getElementById('delta-stats-modal').remove();"
style="width: 100%; padding: 10px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 16px; color: var(--text); cursor: pointer; font-size: 0.75rem;">
Close
</button>
</div>
`;
loadingModal.innerHTML = html;
setTimeout(() => {
if (typeof loadDeviceList === 'function') {
loadDeviceList();
}
}, 500);
} catch (error) {
console.error('An unexpected error occurred.', error);
showToast('An unexpected error occurred.', 'error');
loadingModal.innerHTML = `
<div style="background: var(--glass); padding: 40px; border-radius: 20px; text-align: center; max-width: 400px;">
<div class="u-mb-15" ></div>
<div style="color: var(--text); font-size: 1rem; margin-bottom: 20px;">
Error loading database structure
</div>
<button onclick="document.getElementById('delta-stats-modal').remove();"
style="padding: 10px 20px; background: var(--accent); border: none; border-radius: 16px; color: white; cursor: pointer;">
Close
</button>
</div>
`;
}
}
let closeYearInProgress = false;
let closeYearAbortController = null;
let _fyVerifiedPassword = null; 

let pendingFirestoreYearClose = false;

function _storeCodeToLabel(c) {
  if (c === 'STORE_A') return 'ZUBAIR';
  if (c === 'STORE_B') return 'MAHMOOD';
  if (c === 'STORE_C') return 'ASAAN';
  return c;
}
async function showCloseFinancialYearDialog() {
if (closeYearInProgress) {
showToast('Close Financial Year is already in progress', 'warning');
return;
}
const summary = await generateCloseYearSummary();
const modal = document.createElement('div');
modal.id = 'close-year-modal';
modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:100000;overflow-y:auto;padding:12px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
modal.innerHTML = `
<div style="background:var(--glass);border-radius:20px;max-width:580px;width:100%;max-height:96vh;overflow-y:auto;border:1px solid var(--glass-border);box-shadow:0 32px 80px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.04);scrollbar-width:thin;">


  <div style="padding:18px 20px 14px;display:flex;align-items:center;gap:13px;border-bottom:1px solid var(--glass-border);position:sticky;top:0;background:var(--glass);z-index:2;border-radius:20px 20px 0 0;">
    <div style="flex-shrink:0;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,rgba(255,69,58,0.18),rgba(255,69,58,0.06));border:1px solid rgba(255,69,58,0.28);display:flex;align-items:center;justify-content:center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff453a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <h2 style="margin:0;color:var(--text-main);font-size:1.05rem;font-weight:800;font-family:'Bricolage Grotesque',system-ui,sans-serif;letter-spacing:-0.02em;">Close Financial Year</h2>
        <span id="cy-phase-badge" style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:2px 10px;border-radius:999px;background:rgba(37,99,235,0.12);color:var(--accent);border:1px solid rgba(37,99,235,0.22);transition:all 0.4s ease;">PREVIEW</span>
      </div>
      <p style="margin:3px 0 0;color:var(--text-muted);font-size:0.75rem;line-height:1.4;" id="cy-panel-subtitle">Compact all records into opening balances — backup created automatically</p>
    </div>
  </div>


  <div style="padding:14px 16px 0;">
    <div id="cy-preview-grid" style="display:grid;gap:6px;">
      ${summary.rowsHtml}
    </div>
  </div>


  <div id="close-year-progress-container" style="display:none;padding:14px 16px 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
      <span style="font-size:0.78rem;color:var(--text-muted);">Processing: <span id="close-year-stage" style="color:var(--accent);font-weight:700;">Initializing...</span></span>
      <span id="cy-progress-pct" style="font-size:0.75rem;font-weight:800;color:var(--accent);font-family:'Geist Mono',monospace;">0%</span>
    </div>
    <div style="width:100%;height:6px;background:var(--input-bg);border-radius:99px;overflow:hidden;">
      <div id="close-year-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-emerald));transition:width 0.4s cubic-bezier(.4,0,.2,1);border-radius:99px;box-shadow:0 0 6px rgba(52,217,116,0.4);"></div>
    </div>
  </div>


  <div id="close-year-input-section" style="padding:14px 16px 16px;">
    <div style="background:linear-gradient(135deg,rgba(255,69,58,0.07),rgba(255,69,58,0.02));border:1px solid rgba(255,69,58,0.18);border-radius:12px;padding:12px 14px;margin-bottom:11px;">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff6b63" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <p style="margin:0 0 3px;color:#ff6b63;font-size:0.8rem;font-weight:700;">Irreversible — original records will be removed</p>
          <p style="margin:0;color:var(--text-muted);font-size:0.74rem;line-height:1.5;">Enter your account password to encrypt the backup and confirm this action.</p>
        </div>
      </div>
      <div style="position:relative;">
        <input type="password" id="close-year-confirm-input" placeholder="Account password"
          autocomplete="current-password"
          style="width:100%;padding:10px 40px 10px 12px;background:var(--input-bg);border:1.5px solid var(--glass-border);border-radius:9px;color:var(--text-main);font-size:0.9rem;box-sizing:border-box;transition:border-color 0.2s;outline:none;"
          oninput="validateCloseYearInput(this.value)"
          onfocus="this.style.borderColor='rgba(255,69,58,0.45)'"
          onblur="this.style.borderColor='var(--glass-border)'"
          onkeydown="if(event.key==='Enter'&&!document.getElementById('close-year-confirm-btn').disabled){verifyAndExecuteCloseYear();}">
        <button type="button" tabindex="-1"
          onclick="(function(btn){const inp=document.getElementById('close-year-confirm-input');inp.type=inp.type==='password'?'text':'password';btn.querySelector('svg').style.opacity=inp.type==='text'?'1':'0.45';})(this)"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:2px;color:var(--text-muted);line-height:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.45;transition:opacity 0.2s;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>
    <div id="close-year-pwd-error" style="font-size:0.74rem;color:var(--danger);min-height:16px;margin-bottom:6px;padding-left:2px;display:none;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
      <button id="close-year-confirm-btn" disabled
        style="padding:12px;background:linear-gradient(135deg,#ff453a,#e02d22);border:none;border-radius:11px;color:white;font-weight:800;cursor:not-allowed;font-size:0.88rem;opacity:0.38;transition:all 0.2s;letter-spacing:0.02em;"
        onmouseover="if(!this.disabled){this.style.transform='translateY(-1px)';this.style.boxShadow='0 5px 18px rgba(255,69,58,0.38)';}"
        onmouseout="if(!this.disabled){this.style.transform='';this.style.boxShadow='0 3px 10px rgba(255,69,58,0.2)';}">
        Close Financial Year
      </button>
      <button onclick="closeCloseYearDialog()"
        style="padding:12px;background:var(--input-bg);border:1px solid var(--glass-border);border-radius:11px;color:var(--text-main);cursor:pointer;font-size:0.88rem;font-weight:600;transition:all 0.2s;"
        onmouseover="this.style.borderColor='var(--glass-border-strong)';this.style.background='var(--glass-raised)';"
        onmouseout="this.style.borderColor='var(--glass-border)';this.style.background='var(--input-bg)';">
        Cancel
      </button>
    </div>
  </div>

  <div id="close-year-complete" style="display:none;padding:0 16px 16px;"></div>
</div>
`;
document.body.appendChild(modal);
document.getElementById('close-year-confirm-input').focus();
}
function validateCloseYearInput(value) {
const confirmBtn = document.getElementById('close-year-confirm-btn');
const errEl = document.getElementById('close-year-pwd-error');
if (!confirmBtn) return;
if (value.trim().length > 0) {
  confirmBtn.disabled = false;
  confirmBtn.style.opacity = '1';
  confirmBtn.style.cursor = 'pointer';
  confirmBtn.style.boxShadow = '0 3px 10px rgba(255,69,58,0.2)';
  confirmBtn.onclick = verifyAndExecuteCloseYear;
} else {
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.38';
  confirmBtn.style.cursor = 'not-allowed';
  confirmBtn.style.boxShadow = 'none';
  confirmBtn.onclick = null;
}
if (errEl) errEl.style.display = 'none';
}
async function verifyAndExecuteCloseYear() {
const confirmBtn = document.getElementById('close-year-confirm-btn');
const inp = document.getElementById('close-year-confirm-input');
const errEl = document.getElementById('close-year-pwd-error');
const pwd = inp ? inp.value : '';
if (!pwd) return;

if (confirmBtn) {
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.6';
  confirmBtn.textContent = 'Verifying…';
}
if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
const valid = await verifyAccountPassword(pwd);
if (!valid) {

  if (errEl) { errEl.textContent = '✕ Incorrect password — please try again.'; errEl.style.display = 'block'; }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.textContent = 'Close Financial Year';
    confirmBtn.onclick = verifyAndExecuteCloseYear;
  }
  if (inp) { inp.value = ''; inp.focus(); }
  validateCloseYearInput(''); 
  return;
}

_fyVerifiedPassword = pwd;
executeCloseFinancialYear();
}
function closeCloseYearDialog() {
const modal = document.getElementById('close-year-modal');
if (modal) {
modal.remove();
}
if (closeYearAbortController) {
closeYearAbortController.abort();
closeYearAbortController = null;
}
closeYearInProgress = false;
}
function updateCloseYearProgress(stage, percent) {
const stageEl = document.getElementById('close-year-stage');
const progressBar = document.getElementById('close-year-progress-bar');
const pctEl = document.getElementById('cy-progress-pct');
const phaseBadge = document.getElementById('cy-phase-badge');
if (stageEl) stageEl.textContent = stage;
if (progressBar) progressBar.style.width = percent + '%';
if (pctEl) pctEl.textContent = percent + '%';

const stageMap = {
  'Merging Production Data':   'prod',
  'Production Data Merged':    'prod',
  'Merging Sales Data':        'sales',
  'Sales Data Merged':         'sales',
  'Merging Calculator Data':   'calc',
  'Calculator Data Merged':    'calc',
  'Merging Payment Data':      'pay',
  'Payment Data Merged':       'pay',
  'Merging Factory Data':      'factory',
  'Factory Data Merged':       'factory',
  'Merging Rep Sales Data':    'repsales',
  'Rep Sales Data Merged':     'repsales',
  'Merging Expenses':          'exp',
  'Expenses Merged':           'exp',
  'Merging Stock Returns':     'ret',
  'Stock Returns Merged':      'ret'
};
const rowId = Object.entries(stageMap).find(([k])=>stage.includes(k.replace(' Data','').replace(' Merged','').trim()))?.[1];
if (rowId) {
  const isDone = stage.includes('Merged') || stage.includes('No New') || stage.includes('No Records');
  const statusEl = document.getElementById('cy-status-' + rowId);
  const rowEl    = document.getElementById('cy-row-'    + rowId);
  if (statusEl) statusEl.style.display = 'inline';
  if (rowEl && isDone) rowEl.style.opacity = '1';
}
if (phaseBadge) {
  phaseBadge.textContent = 'PROCESSING';
  phaseBadge.style.background = 'rgba(255,179,0,0.15)';
  phaseBadge.style.color = 'var(--warning)';
  phaseBadge.style.borderColor = 'rgba(255,179,0,0.3)';
}

const procSubtitle = document.getElementById('cy-panel-subtitle');
if (procSubtitle && procSubtitle.textContent.includes('will be compacted')) {
  procSubtitle.textContent = '— processing in progress...';
  procSubtitle.style.color = 'var(--warning)';
}
}
async function generateCloseYearSummary() {
const S = {
  production:   { total:0, nonMerged:0, stores: new Set(), returnCount:0, sellerReturns: new Set(), sellerStoreCards: new Set() },
  sales:        { total:0, nonMerged:0, customers: new Set(), settledCount:0, creditCount:0 },
  calculator:   { total:0, nonMerged:0, reps: new Set() },
  payments:     { total:0, nonMerged:0, entities: new Set(), netBalanceCount:0 },
  factory:      { total:0, nonMerged:0, stores: new Set() },
  repSales:     { total:0, nonMerged:0, customers: new Set(), reps: new Set(), settledCount:0, creditCount:0 },
  expenses:     { total:0, nonMerged:0, categories: new Set() },
  stockReturns: { total:0, nonMerged:0, stores: new Set() }
};
if (Array.isArray(db)) {
  S.production.total = db.length;
  db.forEach(i => {
    if (i.store) S.production.stores.add(i.store);
    if (i.isMerged !== true) {
      S.production.nonMerged++;
      if (i.isReturn === true) { S.production.returnCount++; if(i.returnedBy) S.production.sellerReturns.add(i.returnedBy); if(i.returnedBy && i.store) S.production.sellerStoreCards.add(i.returnedBy+'::'+i.store); }
    }
  });
}
if (Array.isArray(customerSales)) {
  S.sales.total = customerSales.length;
  customerSales.forEach(i => {
    if (i.customerName) S.sales.customers.add(i.customerName);
    if (i.isMerged !== true && isDirectSale(i)) {
      S.sales.nonMerged++;
      if (i.paymentType === 'CASH' || (i.paymentType === 'CREDIT' && i.creditReceived)) S.sales.settledCount++;
      else if (i.paymentType === 'CREDIT' && !i.creditReceived) S.sales.creditCount++;
    }
  });
}
if (Array.isArray(salesHistory)) {
  S.calculator.total = salesHistory.length;
  salesHistory.forEach(i => { if (i.seller) S.calculator.reps.add(i.seller); if (i.isMerged !== true) S.calculator.nonMerged++; });
}
if (Array.isArray(paymentTransactions)) {
  S.payments.total = paymentTransactions.length;
  const entityNetMap = {};
  paymentTransactions.forEach(i => {
    const ent = paymentEntities.find(e => e.id === i.entityId);
    if (ent) S.payments.entities.add(ent.name || 'Unknown');
    if (i.isMerged !== true) {
      S.payments.nonMerged++;
      if (!entityNetMap[i.entityId]) entityNetMap[i.entityId] = 0;
      entityNetMap[i.entityId] += (i.type === 'IN' ? 1 : -1) * (i.amount || 0);
    }
  });
  S.payments.netBalanceCount = Object.values(entityNetMap).filter(v => Math.abs(v) > 0.001).length;
}
if (Array.isArray(factoryProductionHistory)) {
  S.factory.total = factoryProductionHistory.length;
  factoryProductionHistory.forEach(i => { if (i.store) S.factory.stores.add(i.store); if (i.isMerged !== true) S.factory.nonMerged++; });
}
if (Array.isArray(repSales)) {
  S.repSales.total = repSales.length;
  repSales.forEach(i => {
    if (i.customerName) S.repSales.customers.add(i.customerName);
    if (i.salesRep) S.repSales.reps.add(i.salesRep);
    if (i.isMerged !== true && isRepSale(i)) {
      S.repSales.nonMerged++;
      if (i.paymentType === 'CASH' || (i.paymentType === 'CREDIT' && i.creditReceived)) S.repSales.settledCount++;
      else if (i.paymentType === 'CREDIT' && !i.creditReceived) S.repSales.creditCount++;
    }
  });
}
if (Array.isArray(expenseRecords)) {
  S.expenses.total = expenseRecords.length;
  expenseRecords.forEach(i => { if (i.category) S.expenses.categories.add(i.category); if (i.isMerged !== true) S.expenses.nonMerged++; });
}
if (Array.isArray(stockReturns)) {
  S.stockReturns.total = stockReturns.length;
  stockReturns.forEach(i => { if (i.store) S.stockReturns.stores.add(i.store); if (i.isMerged !== true) S.stockReturns.nonMerged++; });
}

const storeCodeToLabel = _storeCodeToLabel;
const CY_ICONS = {
  prod:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  sales:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  calc:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>',
  pay:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  factory:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>',
  repsales: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  exp:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  ret:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.9L1 10"/></svg>'
};
const previewRow = (id, label, key, recCount, details, mergeNote, accent, hasData) => {
  const detailChips = details.map(([lbl,val,vc]) =>
    '<span style="font-size:0.72rem;color:var(--text-muted);">' + lbl + ':&nbsp;</span>' +
    '<span style="font-size:0.72rem;font-weight:700;color:' + (vc||'var(--text-main)') + ';margin-right:10px;">' + val + '</span>'
  ).join('');
  const resultBlock =
    '<div id="cy-result-' + id + '" style="display:none;margin-top:6px;padding:6px 10px;border-radius:8px;' +
    'background:' + accent + '12;border:1px solid ' + accent + '30;animation:cy-fade-in 0.35s ease;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">' +
    '<span id="cy-result-label-' + id + '" style="font-size:0.75rem;font-weight:700;color:' + accent + ';"></span>' +
    '<span style="font-size:0.66rem;color:var(--text-muted);">merged</span>' +
    '</div><div id="cy-result-note-' + id + '" style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;line-height:1.4;"></div>' +
    '</div>';
  return (
    '<div id="cy-row-' + id + '" style="' +
      'border-left:3px solid ' + (hasData ? accent : 'var(--glass-border)') + ';' +
      'border-radius:0 10px 10px 0;background:var(--glass-raised);padding:9px 12px;' +
      (hasData ? '' : 'opacity:0.35;') + 'transition:all 0.3s ease;">' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="flex-shrink:0;color:' + (hasData?accent:'var(--text-muted)') + ';">' + (CY_ICONS[id]||'') + '</span>' +
      '<span style="font-size:0.82rem;font-weight:700;color:' + (hasData?accent:'var(--text-secondary)') + ';flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</span>' +
      (hasData
        ? '<span style="font-size:0.7rem;font-weight:700;color:var(--warning);background:rgba(255,179,0,0.1);border:1px solid rgba(255,179,0,0.2);border-radius:5px;padding:2px 7px;flex-shrink:0;">' + recCount + ' rec</span>' +
          '<span style="font-size:0.68rem;color:var(--text-muted);">→</span>' +
          '<span id="cy-val-' + id + '-after" style="font-size:0.7rem;font-weight:700;color:' + accent + ';background:' + accent + '12;border:1px solid ' + accent + '22;border-radius:5px;padding:2px 7px;flex-shrink:0;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + mergeNote + '</span>'
        : '<span style="font-size:0.7rem;color:var(--text-muted);font-style:italic;">skipped</span>'
      ) +
      '<span id="cy-status-' + id + '" style="display:none;font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:2px 8px;border-radius:999px;background:rgba(52,217,116,0.15);color:var(--accent-emerald);border:1px solid rgba(52,217,116,0.28);flex-shrink:0;">✓</span>' +
    '</div>' +
    (hasData && details.length
      ? '<div style="margin-top:4px;padding-left:23px;display:flex;flex-wrap:wrap;align-items:center;line-height:1.8;">' + detailChips + '</div>'
      : '') +
    resultBlock +
    '</div>'
  );
};

let rows = '';
const storeList  = [...S.production.stores].map(storeCodeToLabel).join(', ') || '\u2014';
const sellerList = [...S.production.sellerReturns].join(', ') || 'none';
const prodRetCards   = S.production.sellerStoreCards.size || S.production.sellerReturns.size;
const prodTotalCards = S.production.stores.size + prodRetCards;
rows += previewRow('prod', 'Production', 'mfg_pro_pkr',
  S.production.nonMerged,
  [
    ['Stores', storeList, 'var(--text-main)'],
    ['Returns', S.production.returnCount > 0 ? S.production.returnCount + ' (' + sellerList + ')' : 'none',
      S.production.returnCount > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)'],
  ],
  prodTotalCards + ' cards (' + S.production.stores.size + ' store + ' + prodRetCards + ' ret)',
  'var(--accent)', S.production.nonMerged > 0
);

const custCount = S.sales.customers.size;
rows += previewRow('sales', 'Sales', 'customer_sales',
  S.sales.nonMerged,
  [['Customers', custCount, 'var(--text-main)'],
   ['Settled/Credit', S.sales.settledCount + '/' + S.sales.creditCount, 'var(--text-main)']],
  custCount + ' balance' + (custCount !== 1 ? 's' : ''),
  'var(--accent-emerald)', S.sales.nonMerged > 0
);

const repNameList = [...S.calculator.reps].join(', ') || '\u2014';
rows += previewRow('calc', 'Calculator', 'noman_history',
  S.calculator.nonMerged,
  [['Reps', repNameList, 'var(--text-main)']],
  S.calculator.reps.size + ' rec \u00b7 returns\u2192Prod',
  'var(--accent-cyan)', S.calculator.nonMerged > 0
);

const entCount = S.payments.entities.size;
rows += previewRow('pay', 'Payments', 'payment_transactions',
  S.payments.nonMerged,
  [['Entities', entCount, 'var(--text-main)'],
   ['w/ balance', S.payments.netBalanceCount, 'var(--text-main)']],
  S.payments.netBalanceCount + ' opening bal.',
  'var(--accent-gold)', S.payments.nonMerged > 0
);

const fStores = [...S.factory.stores].map(storeCodeToLabel).join(', ') || '\u2014';
rows += previewRow('factory', 'Factory', 'factory_production_history',
  S.factory.nonMerged,
  [['Stores', fStores, 'var(--text-main)']],
  S.factory.stores.size + ' formula rec.',
  'var(--accent-purple)', S.factory.nonMerged > 0
);

const rcCount = S.repSales.customers.size;
rows += previewRow('repsales', 'Rep Sales', 'rep_sales',
  S.repSales.nonMerged,
  [['Customers/Reps', rcCount + '/' + S.repSales.reps.size, 'var(--text-main)'],
   ['Settled/Credit', S.repSales.settledCount + '/' + S.repSales.creditCount, 'var(--text-main)']],
  '1 per cust \u00d7 rep',
  'var(--store-b)', S.repSales.nonMerged > 0
);

const catList = [...S.expenses.categories].join(', ') || '\u2014';
rows += previewRow('exp', 'Expenses', 'expenses',
  S.expenses.nonMerged,
  [['Categories', catList, 'var(--text-main)']],
  '1 per category + name',
  'var(--warning)', S.expenses.nonMerged > 0
);

const srStores = [...S.stockReturns.stores].map(storeCodeToLabel).join(', ') || '\u2014';
rows += previewRow('ret', 'Stock Returns', 'stock_returns',
  S.stockReturns.nonMerged,
  [['Stores', srStores, 'var(--text-main)']],
  '1 per store + date',
  'var(--danger)', S.stockReturns.nonMerged > 0
);

const rowsHtml = rows;
const html = '<div style="display:grid;gap:4px;">' + rows + '</div>';
return { html, rowsHtml, summary: S };
}

async function createMergeBackup() {
  const backup = {
    db: Array.isArray(db) ? [...db] : [],
    customerSales: Array.isArray(customerSales) ? [...customerSales] : [],
    salesHistory: Array.isArray(salesHistory) ? [...salesHistory] : [],
    paymentTransactions: Array.isArray(paymentTransactions) ? [...paymentTransactions] : [],
    factoryProductionHistory: Array.isArray(factoryProductionHistory) ? [...factoryProductionHistory] : [],
    repSales: Array.isArray(repSales) ? [...repSales] : [],
    expenseRecords: Array.isArray(expenseRecords) ? [...expenseRecords] : [],
    stockReturns: Array.isArray(stockReturns) ? [...stockReturns] : [],
    timestamp: Date.now(),
    date: new Date().toISOString()
  };

  try {
    await idb.set('close_year_backup_' + backup.timestamp, backup);

    return backup.timestamp;
  } catch (e) {
    console.error('Failed to create merge backup:', e);
    throw new Error('Cannot proceed without backup: ' + e.message);
  }
}

async function restoreFromBackup(backupTimestamp) {
  try {
    const backup = await idb.get('close_year_backup_' + backupTimestamp);
    if (!backup) {
      throw new Error('Backup not found: ' + backupTimestamp);
    }

    db = backup.db;
    customerSales = backup.customerSales;
    salesHistory = backup.salesHistory;
    paymentTransactions = backup.paymentTransactions;
    factoryProductionHistory = backup.factoryProductionHistory;
    repSales = backup.repSales;
    expenseRecords = backup.expenseRecords;
    stockReturns = backup.stockReturns;


    await idb.set('mfg_pro_pkr', db);
    await idb.set('customer_sales', customerSales);
    await idb.set('noman_history', salesHistory);
    await idb.set('payment_transactions', paymentTransactions);
    await idb.set('factory_production_history', factoryProductionHistory);
    await idb.set('rep_sales', repSales);
    await idb.set('expenses', expenseRecords);
    await idb.set('stock_returns', stockReturns);


    if (firebaseDB && currentUser) {
      try {
        const userRef = firebaseDB.collection('users').doc(currentUser.uid);
        const collections = [
          { name: 'production', local: db },
          { name: 'sales', local: customerSales },
          { name: 'calculator_history', local: salesHistory },
          { name: 'transactions', local: paymentTransactions },
          { name: 'factory_history', local: factoryProductionHistory },
          { name: 'rep_sales', local: repSales },
          { name: 'expenses', local: expenseRecords },
          { name: 'returns', local: stockReturns }
        ];

        for (const col of collections) {
          try {

            const snapshot = await userRef.collection(col.name).get();
            const batch = firebaseDB.batch();
            let deleteCount = 0;

            snapshot.docs.forEach(doc => {
              const data = doc.data();

              const docCreatedAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : 
                                   (typeof data.createdAt === 'number' ? data.createdAt : 0);
              if (docCreatedAt >= backupTimestamp) {
                batch.delete(doc.ref);
                deleteCount++;
              }
            });

            if (deleteCount > 0) {
              await batch.commit();

            }
          } catch (colErr) {
            console.warn(`Firebase rollback warning for ${col.name}:`, colErr);
          }
        }
      } catch (fbErr) {
        console.warn('Firebase rollback warning:', fbErr);

      }
    }


    return true;
  } catch (e) {
    console.error('Failed to restore from backup:', e);
    throw e;
  }
}

async function verifyMergeConsistency(snap) {
  const errors = [];
  const warnings = [];


  if (Array.isArray(db)) {
    const mergedProd = db.filter(i => i.isMerged);
    const totalNet = mergedProd.reduce((s, i) => s + (i.net || 0), 0);
    const totalCost = mergedProd.reduce((s, i) => s + (i.totalCost || 0), 0);
    const totalSale = mergedProd.reduce((s, i) => s + (i.totalSale || 0), 0);
    const expectedProfit = totalSale - totalCost;
    const actualProfit = mergedProd.reduce((s, i) => s + (i.profit || 0), 0);

    if (Math.abs(expectedProfit - actualProfit) > 0.01) {
      errors.push(`Production profit mismatch: expected ${expectedProfit.toFixed(2)}, got ${actualProfit.toFixed(2)}`);
    }
  }


  if (Array.isArray(customerSales)) {
    const mergedSales = customerSales.filter(i => i.isMerged && isDirectSale(i));
    const totalValue = mergedSales.reduce((s, i) => s + (i.totalValue || 0), 0);
    const totalCost = mergedSales.reduce((s, i) => s + (i.totalCost || 0), 0);
    const expectedProfit = totalValue - totalCost;
    const actualProfit = mergedSales.reduce((s, i) => s + (i.profit || 0), 0);

    if (Math.abs(expectedProfit - actualProfit) > 0.01) {
      errors.push(`Sales profit mismatch: expected ${expectedProfit.toFixed(2)}, got ${actualProfit.toFixed(2)}`);
    }


    mergedSales.forEach(sale => {
      if (sale.paymentType === 'CREDIT' && !sale.creditReceived) {
        const expectedCredit = (sale.totalValue || 0) - (sale.partialPaymentReceived || 0);
        if (Math.abs(expectedCredit - (sale.creditValue || 0)) > 0.01) {
          warnings.push(`Credit value mismatch for ${sale.customerName}`);
        }
      }
    });
  }


  if (Array.isArray(paymentTransactions)) {
    const mergedPay = paymentTransactions.filter(i => i.isMerged);
    mergedPay.forEach(pay => {
      if (pay.mergedSummary) {
        const expectedNet = (pay.mergedSummary.originalIn || 0) - (pay.mergedSummary.originalOut || 0);
        const actualAmount = (pay.type === 'IN' ? 1 : -1) * (pay.amount || 0);
        if (Math.abs(expectedNet - actualAmount) > 0.01) {
          errors.push(`Payment balance mismatch for ${pay.entityName}`);
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    timestamp: Date.now()
  };
}

async function executeCloseFinancialYear() {
if (closeYearInProgress) return;
closeYearInProgress = true;

const inputSection  = document.getElementById('close-year-input-section');
const progressContainer = document.getElementById('close-year-progress-container');
const phaseBadge    = document.getElementById('cy-phase-badge');
if (inputSection) inputSection.style.display = 'none';
if (progressContainer) progressContainer.style.display = 'block';

updateCloseYearProgress('Uploading cloud backup...', 3);
try {
  if (!currentUser) throw new Error('Not signed in — cannot create backup');


  try {
    await pushDataToCloud();
    showToast('☁️ Cloud backup uploaded', 'success', 2500);
  } catch (cloudErr) {
    console.warn('Cloud backup warning (proceeding):', cloudErr);
    showToast('Cloud backup skipped (offline?) — local backup will still be created', 'warning', 3500);
  }


  updateCloseYearProgress('Preparing encrypted local backup...', 10);

  

  const _settingsSnapshot = await idb.get('naswar_default_settings', defaultSettings);
  const backupData = {
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
    settings: _settingsSnapshot,
    deleted_records: Array.from(deletedRecordIds),
    _meta: {
      encryptedFor:        currentUser.email,
      createdAt:           Date.now(),
      version:             2,
      source:              'financial_year_close',
      isYearCloseBackup:   true,

      fyCloseSnapshot: {
        fyCloseCount:      (_settingsSnapshot.fyCloseCount      || 0),
        lastYearClosedAt:  (_settingsSnapshot.lastYearClosedAt  || null),
        lastYearClosedDate:(_settingsSnapshot.lastYearClosedDate || null),
        capturedAt:        Date.now()
      }
    }
  };


  

  let encPassword = null;
  try {
    encPassword = _fyVerifiedPassword || null;
  } finally {
    _fyVerifiedPassword = null; 
  }


  if (encPassword) {
    try {
      updateCloseYearProgress('Encrypting backup file...', 14);
      const encryptedBlob = await CryptoEngine.encrypt(backupData, currentUser.email, encPassword);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(encryptedBlob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `NaswarDealers_YearClose_${timestamp}.gznd`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast('🔐 Encrypted year-end backup downloaded!', 'success', 4000);
    } catch (encErr) {
      console.error('Encryption failed:', encErr);
      showToast('Local backup encryption failed — proceeding with cloud backup only.', 'warning', 4000);
    }
  } else {
    showToast('No verified password — skipping local encrypted backup.', 'info', 2500);
  }
} catch (bkpPhaseErr) {
  console.error('Backup phase error:', bkpPhaseErr);
  const proceed = await showGlassConfirm(
    'Backup could not be completed.\n\nDo you want to proceed with closing the financial year anyway?\n\n\u26a0\ufe0f This is irreversible — proceed only if you have an existing backup.',
    { title: 'Backup Failed', confirmText: 'Proceed Anyway', cancelText: 'Abort' }
  );
  if (!proceed) {
    closeYearInProgress = false;
    closeCloseYearDialog();
    return;
  }
}

updateCloseYearProgress('Creating rollback snapshot...', 20);
let backupTimestamp;
try {
  backupTimestamp = await createMergeBackup();
} catch (backupErr) {
  closeYearInProgress = false;
  showToast('Failed to create rollback snapshot: ' + backupErr.message, 'error');
  closeCloseYearDialog();
  return;
}
closeYearAbortController = new AbortController();
const { signal } = closeYearAbortController;

const snap = {
  prod:    { before: Array.isArray(db)                      ? db.filter(i=>i.isMerged!==true).length : 0 },
  sales:   { before: Array.isArray(customerSales)           ? customerSales.filter(i=>i.isMerged!==true&&isDirectSale(i)).length : 0 },
  calc:    { before: Array.isArray(salesHistory)             ? salesHistory.filter(i=>i.isMerged!==true).length : 0 },
  pay:     { before: Array.isArray(paymentTransactions)      ? paymentTransactions.filter(i=>i.isMerged!==true).length : 0 },
  factory: { before: Array.isArray(factoryProductionHistory) ? factoryProductionHistory.filter(i=>i.isMerged!==true).length : 0 },
  repSales:{ before: Array.isArray(repSales)                ? repSales.filter(i=>i.isMerged!==true&&isRepSale(i)).length : 0 },
  expenses:{ before: Array.isArray(expenseRecords)           ? expenseRecords.filter(i=>i.isMerged!==true).length : 0 },
  returns: { before: Array.isArray(stockReturns)             ? stockReturns.filter(i=>i.isMerged!==true).length : 0 }
};

const liveUpdate = (rowId, afterText, accentColor, resultLabel, resultNote) => {
  const afterEl = document.getElementById('cy-val-' + rowId + '-after');
  if (afterEl) {
    afterEl.textContent = afterText;
    afterEl.style.color = accentColor || 'var(--accent-emerald)';
  }
  const statusEl = document.getElementById('cy-status-' + rowId);
  if (statusEl) statusEl.style.display = 'inline';

  const resultBlock = document.getElementById('cy-result-' + rowId);
  const resultLabelEl = document.getElementById('cy-result-label-' + rowId);
  const resultNoteEl  = document.getElementById('cy-result-note-' + rowId);
  if (resultBlock && resultLabelEl && resultNoteEl) {
    resultLabelEl.textContent = resultLabel || afterText;
    resultNoteEl.textContent  = resultNote  || '';
    resultBlock.style.display = 'block';
  }

  const detailEl = document.getElementById('cy-detail-' + rowId);
  if (detailEl) {
    detailEl.style.opacity = '0.38';
    detailEl.style.fontSize = '0';
    detailEl.style.maxHeight = '0';
    detailEl.style.overflow = 'hidden';
    detailEl.style.transition = 'all 0.35s ease';
  }
};
updateCloseYearProgress('Merging Production Data', 25);
try {
await mergeProductionData(signal);
const prodMerged = Array.isArray(db) ? db.filter(i=>i.isMerged) : [];
const storeMerged  = prodMerged.filter(i=>!i.isReturn).length;
const sellerMerged = prodMerged.filter(i=>i.isReturn).length;
liveUpdate('prod', `${storeMerged} store + ${sellerMerged} seller return card${sellerMerged!==1?'s':''}`, 'var(--accent)', `${storeMerged + sellerMerged} merged cards`, `${storeMerged} store balance${storeMerged!==1?'s':''} + ${sellerMerged} seller return card${sellerMerged!==1?'s':''}`);
snap.prod.after = prodMerged.length;
await mergeSalesData(signal);
snap.sales.after = Array.isArray(customerSales) ? customerSales.filter(i=>i.isMerged&&isDirectSale(i)).length : 0;
liveUpdate('sales', `${snap.sales.after} merged record${snap.sales.after!==1?'s':''}`, 'var(--accent-emerald)', `${snap.sales.after} customer records`, 'One opening balance per customer');
await mergeCalculatorData(signal);
snap.calc.after = Array.isArray(salesHistory) ? salesHistory.filter(i=>i.isMerged).length : 0;
liveUpdate('calc', `${snap.calc.after} merged record${snap.calc.after!==1?'s':''} (sales only)`, 'var(--accent-cyan)', `${snap.calc.after} rep totals`, 'Sales totals only — returns moved to Production Tab');
await mergePaymentData(signal);
snap.pay.after = Array.isArray(paymentTransactions) ? paymentTransactions.filter(i=>i.isMerged).length : 0;
liveUpdate('pay', `${snap.pay.after} opening balance record${snap.pay.after!==1?'s':''}`, 'var(--accent-gold)', `${snap.pay.after} opening balances`, 'Zero-balance entities dropped');
await mergeFactoryData(signal);
snap.factory.after = Array.isArray(factoryProductionHistory) ? factoryProductionHistory.filter(i=>i.isMerged).length : 0;
liveUpdate('factory', `${snap.factory.after} merged record${snap.factory.after!==1?'s':''}`, 'var(--accent-purple)', `${snap.factory.after} formula records`, '1 per formula store');
await mergeRepSalesData(signal);
snap.repSales.after = Array.isArray(repSales) ? repSales.filter(i=>i.isMerged&&isRepSale(i)).length : 0;
liveUpdate('repsales', `${snap.repSales.after} merged record${snap.repSales.after!==1?'s':''}`, 'var(--store-b)', `${snap.repSales.after} rep×customer records`, 'Keyed per customer × rep combination');
await mergeExpensesData(signal);
snap.expenses.after = Array.isArray(expenseRecords) ? expenseRecords.filter(i=>i.isMerged).length : 0;
liveUpdate('exp', `${snap.expenses.after} merged record${snap.expenses.after!==1?'s':''}`, 'var(--warning)', `${snap.expenses.after} expense records`, 'Merged per category + name');
await mergeStockReturnsData(signal);
snap.returns.after = Array.isArray(stockReturns) ? stockReturns.filter(i=>i.isMerged).length : 0;
liveUpdate('ret', `${snap.returns.after} merged record${snap.returns.after!==1?'s':''}`, 'var(--danger)', `${snap.returns.after} return records`, '1 per store + date — granularity preserved');

  const consistencyCheck = await verifyMergeConsistency(snap);
  if (!consistencyCheck.valid) {
    throw new Error(`Data consistency check failed: ${consistencyCheck.errors.join('; ')}`);
  }

try {
  const fyMeta = await idb.get('naswar_default_settings', {});
  fyMeta.lastYearClosedAt   = Date.now();
  fyMeta.lastYearClosedDate = new Date().toISOString();
  fyMeta.fyCloseCount       = (fyMeta.fyCloseCount || 0) + 1;
  fyMeta.lastConsistencyCheck = consistencyCheck;

  const hasSyncWarning = document.querySelectorAll && [...document.querySelectorAll('[id^="cy-status-"]')].some(el => el.textContent.includes('Sync Failed'));
  if (hasSyncWarning) {
    fyMeta.pendingFirestoreYearClose = true;
    pendingFirestoreYearClose = true;
    await idb.set('pendingFirestoreYearClose', true);
  } else {
    fyMeta.pendingFirestoreYearClose = false;
    pendingFirestoreYearClose = false;
    await idb.set('pendingFirestoreYearClose', false);
  }
  await idb.set('naswar_default_settings', fyMeta);
  if (firebaseDB && currentUser) {
    await firebaseDB.collection('users').doc(currentUser.uid)
      .collection('settings').doc('naswar_default_settings')
      .set({ lastYearClosedAt: fyMeta.lastYearClosedAt, lastYearClosedDate: fyMeta.lastYearClosedDate, fyCloseCount: fyMeta.fyCloseCount }, { merge: true });
  }
} catch (metaErr) { console.warn('Could not save FY close metadata:', metaErr); }
if (phaseBadge) {
  phaseBadge.textContent = 'DONE';
  phaseBadge.style.background = 'rgba(52,217,116,0.15)';
  phaseBadge.style.color = 'var(--accent-emerald)';
  phaseBadge.style.borderColor = 'rgba(52,217,116,0.3)';
}
const panelSubtitle = document.getElementById('cy-panel-subtitle');
if (panelSubtitle) {
  panelSubtitle.textContent = 'All records compacted successfully';
  panelSubtitle.style.color = 'var(--accent-emerald)';
  panelSubtitle.style.fontStyle = 'normal';
  panelSubtitle.style.fontWeight = '600';
}
if (progressContainer) progressContainer.style.display = 'none';
const prodMergedFinal   = Array.isArray(db) ? db.filter(i=>i.isMerged) : [];
const storeFinal        = prodMergedFinal.filter(i=>!i.isReturn);
const sellerRetFinal    = prodMergedFinal.filter(i=>i.isReturn);
const storesUsed        = [...new Set(storeFinal.map(i=>i.store))].map(_storeCodeToLabel).join(', ') || '—';
const sellersUsed       = [...new Set(sellerRetFinal.map(i=>i.returnedBy||'?'))].join(', ') || '—';
const completeSection = document.getElementById('close-year-complete');
if (completeSection) {

  const syncFailedRows = ['prod','sales','calc','pay','factory','repsales','exp','ret']
    .filter(id => { const el = document.getElementById('cy-row-' + id); return el && el.style.borderLeftColor && el.style.borderLeftColor.includes('warning') || (el && el.style.borderLeftColor === 'var(--warning)'); });
  const hasSyncWarnings = document.querySelectorAll('[id^="cy-status-"]') &&
    [...document.querySelectorAll('[id^="cy-status-"]')].some(el => el.textContent.includes('Sync Failed'));
  const syncAdvisory = hasSyncWarnings ? `
  <div style="display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border-radius:10px;background:rgba(255,179,0,0.08);border:1px solid rgba(255,179,0,0.3);margin-bottom:14px;">
    <span style="font-size:1rem;line-height:1.2;">⚠</span>
    <div>
      <div style="font-size:0.73rem;font-weight:700;color:var(--warning);margin-bottom:2px;">Cloud Sync Incomplete</div>
      <div style="font-size:0.68rem;color:var(--text-muted);line-height:1.45;">One or more tabs failed to sync to Firestore. Local data is fully merged and safe. Rows marked ⚠ will re-sync automatically when connectivity is restored, or you can force a manual sync from Settings.</div>
    </div>
  </div>` : '';
  completeSection.innerHTML = `
  <div style="text-align:center;padding:18px 0 14px;">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,rgba(52,217,116,0.2),rgba(52,217,116,0.08));border:1px solid rgba(52,217,116,0.35);margin-bottom:12px;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h3 style="margin:0 0 5px;color:var(--accent-emerald);font-size:1.05rem;font-weight:700;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Financial Year Closed</h3>
    <p style="color:var(--text-muted);font-size:0.75rem;margin:0 0 16px;">New financial year has begun. All data compacted successfully.</p>
  </div>
  ${syncAdvisory}
  <button onclick="closeCloseYearDialog();if(typeof refreshAllDisplays==='function')refreshAllDisplays();"
    style="width:100%;padding:13px;background:linear-gradient(135deg,var(--accent-emerald),#059669);border:none;border-radius:12px;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;letter-spacing:0.02em;">
    Continue to App →
  </button>`;
  completeSection.style.display = 'block';
}
showToast('Financial Year closed successfully!', 'success');
} catch (error) {
if (error.name === 'AbortError') {
  showToast('Close Financial Year was cancelled', 'info');
} else {
  console.error('Close Financial Year failed:', error);
  showToast('Close Financial Year failed: ' + error.message, 'error');


  if (typeof backupTimestamp !== 'undefined') {
    updateCloseYearProgress('Restoring from backup...', 0);
    try {
      await restoreFromBackup(backupTimestamp);
      showToast('Data restored from backup. No changes were committed.', 'info');
    } catch (restoreErr) {
      console.error('Failed to restore from backup:', restoreErr);
      showToast('CRITICAL: Failed to restore from backup. Manual intervention required.', 'error');
    }
  }

  closeCloseYearDialog();
}
} finally {
closeYearInProgress = false;
closeYearAbortController = null;
}
}
async function _commitMergedBatch(userRef, collectionName, mergedRecords, deleteFilter) {
const OPS_PER_BATCH = 400;
let batchesTotal = 0;
let batchesFailed = 0;
let firstError = null;
try {
  const existingSnapshot = await userRef.collection(collectionName).get();
  const deleteDocs = existingSnapshot.docs.filter(doc => {
    const d = doc.data(); return deleteFilter ? deleteFilter(d) : !d.isMerged;
  });
  const writeDocs = mergedRecords.map(record => {
    const sanitized = sanitizeForFirestore(record);

    
    sanitized.updatedAt = record.updatedAt;
    sanitized.createdAt = record.createdAt;
    sanitized.timestamp = record.timestamp;
    return { ref: userRef.collection(collectionName).doc(record.id), data: sanitized };
  });
  const allOps = [
    ...deleteDocs.map(d => ({ type: 'delete', ref: d.ref })),
    ...writeDocs.map(w => ({ type: 'set', ref: w.ref, data: w.data }))
  ];
  for (let i = 0; i < allOps.length; i += OPS_PER_BATCH) {
    batchesTotal++;
    const batch = firebaseDB.batch();
    allOps.slice(i, i + OPS_PER_BATCH).forEach(op => {
      if (op.type === 'delete') batch.delete(op.ref);
      else batch.set(op.ref, op.data);
    });
    try {
      await batch.commit();
    } catch (batchErr) {
      batchesFailed++;
      if (!firstError) firstError = batchErr;
      console.error(`_commitMergedBatch [${collectionName}] batch ${batchesTotal} failed:`, batchErr);
      throw batchErr; 
    }
  }
} catch (outerErr) {

  console.error(`_commitMergedBatch [${collectionName}] snapshot read failed:`, outerErr);
  return { ok: false, batchesTotal, batchesFailed: batchesTotal || 1, error: outerErr };
}
const ok = batchesFailed === 0;
return { ok, batchesTotal, batchesFailed, error: firstError || null };
}
function _markRowSyncWarning(rowId, commitResult) {
  try {
    const rowEl = document.getElementById('cy-row-' + rowId);
    if (!rowEl) return;

    const statusEl = document.getElementById('cy-status-' + rowId);
    if (statusEl) {
      statusEl.textContent = '⚠ Sync Failed';
      statusEl.style.background = 'rgba(255,179,0,0.15)';
      statusEl.style.color = 'var(--warning)';
      statusEl.style.borderColor = 'rgba(255,179,0,0.35)';
      statusEl.style.display = 'inline';
    }

    const noteEl = document.getElementById('cy-result-note-' + rowId);
    if (noteEl) {
      const failMsg = document.createElement('span');
      failMsg.style.cssText = 'display:block;margin-top:3px;font-size:0.63rem;color:var(--warning);font-weight:600;';
      failMsg.textContent = `⚠ Cloud sync incomplete — ${commitResult.batchesFailed}/${commitResult.batchesTotal} Firestore batch${commitResult.batchesFailed!==1?'es':''} failed. Local data is safe. Re-sync when online.`;
      noteEl.appendChild(failMsg);
    }

    rowEl.style.borderLeftColor = 'var(--warning)';
  } catch (e) {   }
}
function _buildMergedBase(id, mergeEpoch, nowISODate, nowTime, extra = {}) {
return {
  id,
  date: nowISODate,
  time: nowTime,
  createdAt: mergeEpoch,
  updatedAt: mergeEpoch,
  timestamp: mergeEpoch,
  isMerged: true,
  mergedAt: nowISODate,
  syncedAt: new Date().toISOString(),
  ...extra
};
}

const isRepSale = (item) => {
  return item.isRepModeEntry === true || 
         (item.salesRep && item.salesRep !== 'NONE' && item.salesRep !== 'ADMIN');
};

const isDirectSale = (item) => {
  return !isRepSale(item);
};
async function mergeProductionData(signal) {
updateCloseYearProgress('Merging Production Data...', 10);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(db) || db.length === 0) return;
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const mergedRecords = [];
const nonMerged    = db.filter(i => i.isMerged !== true);
const prodItems    = nonMerged.filter(i => i.isReturn !== true);
const returnItems  = nonMerged.filter(i => i.isReturn === true);
const storeGroups = {};
prodItems.forEach(item => {
  const store = item.store || 'UNKNOWN';
  if (!storeGroups[store]) storeGroups[store] = [];
  storeGroups[store].push(item);
});
for (const [store, items] of Object.entries(storeGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const totals = items.reduce((acc, item) => {
    const isCreditSale = item.paymentStatus === 'CREDIT' && !item.isReturn;
    acc.net          += (item.net          || 0);
    acc.totalCost    += (item.totalCost    || 0);

    acc.totalSale    += (item.totalSale    || 0);
    acc.profit       += (item.profit       || 0);
    acc.formulaUnits += (item.formulaUnits || 0);
    acc.formulaCost  += (item.formulaCost  || 0);
    acc.creditSaleNet+= isCreditSale ? (item.net || 0) : 0;
    return acc;
  }, { net:0, totalCost:0, totalSale:0, profit:0, formulaUnits:0, formulaCost:0, creditSaleNet:0 });
  // cp: weighted average of actual dynamic cost per kg across all production runs
  //     (each run may differ as formula costs change) — average is correct here.
  const avgCp = totals.net > 0 ? parseFloat((totals.totalCost / totals.net).toFixed(4)) : (items[0]?.cp || 0);
  // sp: the fixed canonical sale price for this store from factory settings.
  //     All items in this store group share the same fixed price — never average.
  const canonicalSp = getSalePriceForStore(store);
  const avgSp = canonicalSp > 0 ? canonicalSp : (items[0]?.sp || 0);
  const allDates = items.map(i => i.date).filter(Boolean).sort();
  const mergedId = generateUUID('prod-merged');
  const mergedRecord = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    store,
    net:           totals.net,
    cp:            avgCp,
    sp:            avgSp,
    totalCost:     totals.totalCost,
    totalSale:     totals.totalSale,
    profit:        totals.profit,
    formulaUnits:  totals.formulaUnits,
    formulaStore:  items[0]?.formulaStore || 'standard',
    formulaCost:   totals.formulaCost,
    paymentStatus: 'CASH',
    creditSaleNet: totals.creditSaleNet,  
    mergedRecordCount: items.length,
    mergedSummary: {
      dateRange:       { from: allDates[0] || nowISODate, to: allDates.slice(-1)[0] || nowISODate },
      recordCount:     items.length,
      creditSaleNet:   totals.creditSaleNet  
    }
  }), false, true);
  mergedRecords.push(mergedRecord);
}

const sellerReturnGroups = {};
const sellerReturnTotals = {}; 
returnItems.forEach(item => {
  const seller = item.returnedBy || item.seller || 'Unknown';
  const store  = item.store      || 'UNKNOWN';
  const key    = `${seller}::${store}`;
  if (!sellerReturnGroups[key]) sellerReturnGroups[key] = { seller, store, items: [] };
  sellerReturnGroups[key].items.push(item);

  
  if (!sellerReturnTotals[seller]) {
    sellerReturnTotals[seller] = { totalNet: 0, returnsByStore: {} };
  }
  sellerReturnTotals[seller].totalNet += (item.net || 0);
  sellerReturnTotals[seller].returnsByStore[store] = (sellerReturnTotals[seller].returnsByStore[store] || 0) + (item.net || 0);
});
for (const [, grp] of Object.entries(sellerReturnGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { seller, store, items } = grp;
  let totalNet = 0, totalCost = 0, totalSale = 0, totalProfit = 0;
  items.forEach(item => {
    totalNet    += (item.net       || 0);
    totalCost   += (item.totalCost || 0);
    totalSale   += (item.totalSale || 0);
    totalProfit += (item.profit    || 0);
  });
  const avgCp = totalNet > 0 ? parseFloat((totalCost / totalNet).toFixed(4)) : (items[0]?.cp || 0);
  // sp: fixed canonical sale price for this store — not a weighted average.
  const canonicalSpRet = getSalePriceForStore(store);
  const avgSp = canonicalSpRet > 0 ? canonicalSpRet : (items[0]?.sp || 0);
  const allDates = items.map(i => i.date).filter(Boolean).sort();
  const mergedId = generateUUID('prod-ret-merged');

  
  const returnsByStoreForThisSeller = sellerReturnTotals[seller]?.returnsByStore || {};

  const mergedReturn = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    store,
    net:           totalNet,
    cp:            avgCp,
    sp:            avgSp,
    totalCost:     totalCost,
    totalSale:     totalSale,
    profit:        totalProfit,
    formulaUnits:  0,
    formulaStore:  'standard',
    formulaCost:   0,
    paymentStatus: 'CASH',
    isReturn:      true,
    returnedBy:    seller,
    returnNote:    `Merged returns by ${seller} → ${store}`,
    returnsByStore: returnsByStoreForThisSeller, 
    mergedRecordCount: items.length,
    mergedSummary: {
      dateRange:   { from: allDates[0] || nowISODate, to: allDates.slice(-1)[0] || nowISODate },
      recordCount: items.length,
      store,
      seller,
      returnsByStore: returnsByStoreForThisSeller 
    }
  }), false, true);
  mergedRecords.push(mergedReturn);
}
if (Object.keys(storeGroups).length === 0 && Object.keys(sellerReturnGroups).length === 0) {
  updateCloseYearProgress('Production Data - No New Records to Merge', 20);
  return;
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'production', mergedRecords);
  if (!commitResult.ok) {
    console.warn(`mergeProductionData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('prod', commitResult);
  }
}
const existingMerged = db.filter(item => item.isMerged === true);
db = [...existingMerged, ...mergedRecords];
await idb.set('mfg_pro_pkr', db);
emitSyncUpdate({ mfg_pro_pkr: db });
updateCloseYearProgress('Production Data Merged', 20);
}
async function mergeSalesData(signal) {
updateCloseYearProgress('Merging Sales Data...', 30);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(customerSales) || customerSales.length === 0) return;
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const mergedRecords = [];
const customerBuckets = {};  
customerSales.forEach(item => {
  if (item.isMerged === true) return;
  if (isRepSale(item)) return;  
  const name = item.customerName || 'Unknown';
  if (!customerBuckets[name]) {
    customerBuckets[name] = {
      sales: [], oldDebt: 0, collectionTotal: 0, partialPaymentTotal: 0, partialPaymentsBySale: {},
      phone: '', address: '', supplyStore: ''
    };
  }
  const b = customerBuckets[name];
  b.phone      = b.phone      || item.customerPhone   || '';
  b.address    = b.address    || item.customerAddress || '';
  b.supplyStore= b.supplyStore|| item.supplyStore     || 'STORE_A';
  if (item.paymentType === 'PARTIAL_PAYMENT') {

    b.partialPaymentTotal += (item.totalValue || 0);
    const linkedKey = item.relatedSaleId || item.linkedSaleId;
    if (linkedKey) {

      
      b.partialPaymentsBySale[linkedKey] = (b.partialPaymentsBySale[linkedKey] || 0) + (item.totalValue || 0);

      if (!b.partialPaymentCustomers) b.partialPaymentCustomers = {};
      b.partialPaymentCustomers[linkedKey] = item.customerName || name;
    }
    return;
  }
  if (item.paymentType === 'COLLECTION') {

    b.collectionTotal += (item.totalValue || 0);
    return;
  }
  if (item.transactionType === 'OLD_DEBT') {

    b.oldDebt += Math.max(0, (item.totalValue || 0) - (item.partialPaymentReceived || 0));
    return;
  }

  b.sales.push(item);
});
for (const [customer, b] of Object.entries(customerBuckets)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { sales, oldDebt, collectionTotal, phone, address, supplyStore } = b;

  let totalQty   = 0, totalValue = 0, totalCost = 0, totalProfit = 0;
  let realizedProfit = 0, unrealizedProfit = 0;
  let cashValue  = 0, unpaidCreditNet = 0;

  
  const originalRecordIds = sales.map(s => s.id);
  for (const item of sales) {
    totalQty    += (item.quantity   || 0);
    totalValue  += (item.totalValue || 0);
    totalCost   += (item.totalCost  || 0);
    totalProfit += (item.profit     || 0);


    if (item.paymentType === 'CREDIT' && !item.creditReceived) {
      unrealizedProfit += (item.profit || 0);  
    } else {
      realizedProfit += (item.profit || 0);    
    }

    if (item.paymentType === 'CASH' || (item.paymentType === 'CREDIT' && item.creditReceived)) {

      cashValue += (item.totalValue || 0);
    } else if (item.paymentType === 'CREDIT' && !item.creditReceived) {

      unpaidCreditNet += Math.max(0, (item.totalValue || 0) - (item.partialPaymentReceived || 0));
    }
  }

  const grossOutstanding = unpaidCreditNet + oldDebt;

  const netOutstanding   = Math.max(0, grossOutstanding - collectionTotal);

  const advanceCredit    = Math.max(0, collectionTotal - grossOutstanding);
  const isSettled = netOutstanding <= 0;

  if (sales.length === 0 && oldDebt <= 0 && collectionTotal <= 0) continue;
  const allDates  = sales.map(i => i.date).filter(Boolean).sort();
  const firstItem = sales[0] || {};
  const recordCount = sales.length + (oldDebt > 0 ? 1 : 0) + (collectionTotal > 0 ? 1 : 0);
  const mergedId = generateUUID('sale-merged');

  

  

  
  // unitPrice: the fixed canonical sale price for the supply store from factory
  // settings — never divide totalValue/quantity (weighted average from partials).
  const _mergedSupplyStore = supplyStore || firstItem.supplyStore || 'STORE_A';
  const canonicalUnitPrice = getSalePriceForStore(_mergedSupplyStore);
  const lastUnitPrice = canonicalUnitPrice > 0
    ? canonicalUnitPrice
    : (firstItem.unitPrice || (firstItem.quantity > 0 ? firstItem.totalValue / firstItem.quantity : 0) || 0);
  const grossSaleValue  = parseFloat(totalValue.toFixed(2));
  const alreadyPaid     = isSettled ? grossSaleValue : parseFloat((grossSaleValue - netOutstanding).toFixed(2));
  const mergedRecord = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    customerName:          customer,
    customerPhone:         phone,
    customerAddress:       address,
    quantity:              totalQty,
    unitPrice:             lastUnitPrice,
    totalValue:            grossSaleValue,
    totalCost:             totalCost,
    profit:                totalProfit,
    supplyStore:           _mergedSupplyStore,
    salesRep:              'NONE',
    paymentType:           isSettled ? 'CASH' : 'CREDIT',
    transactionType:       (oldDebt > 0 && sales.length === 0) ? 'OLD_DEBT' : 'SALE',
    creditReceived:        isSettled,
    creditReceivedDate:    isSettled ? nowISODate : null,
    creditValue:           isSettled ? 0 : netOutstanding,
    partialPaymentReceived: isSettled ? 0 : alreadyPaid,
    balancePaid:           alreadyPaid,
    paid:                  isSettled,
    isRepModeEntry:        false,
    notes:                 'Combined year-end balance carried forward from financial year close',
    mergedRecordCount:     recordCount,
    mergedSummary: {
      cashSales:           cashValue,
      unpaidCredit:        unpaidCreditNet,
      oldDebt:             oldDebt,
      collectionsReceived: collectionTotal,
      partialPayments:     b.partialPaymentTotal || 0,
      partialPaymentsBySale: b.partialPaymentsBySale || {},
      advanceCreditHeld:   advanceCredit,
      realizedProfit:      realizedProfit,
      unrealizedProfit:    unrealizedProfit,
      grossOutstanding,
      netOutstanding,
      isSettled,
      dateRange: {
        from: allDates[0]           || nowISODate,
        to:   allDates.slice(-1)[0] || nowISODate
      },
      recordCount,
      originalRecordIds:   originalRecordIds  
    }
  }), false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'sales', mergedRecords, d => !d.isMerged);
  if (!commitResult.ok) {
    console.warn(`mergeSalesData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('sales', commitResult);
  }
}
const existingMerged = customerSales.filter(i => i.isMerged === true);
customerSales = [...existingMerged, ...mergedRecords];
await idb.set('customer_sales', customerSales);
emitSyncUpdate({ customer_sales: customerSales });
updateCloseYearProgress('Sales Data Merged', 40);
}
async function mergeCalculatorData(signal) {
updateCloseYearProgress('Merging Calculator Data...', 50);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(salesHistory) || salesHistory.length === 0) return;
const repGroups = {};
salesHistory.forEach(item => {
  if (item.isMerged === true) return;
  const seller = item.seller || 'Unknown';
  if (!repGroups[seller]) repGroups[seller] = [];
  repGroups[seller].push(item);
});
if (Object.keys(repGroups).length === 0) {
  updateCloseYearProgress('Calculator Data - No New Records to Merge', 60);
  return;
}
const nowDate = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime = nowDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true});
const mergedRecords = [];
for (const [seller, items] of Object.entries(repGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const firstItem = items[0] || {};
  const datesSorted = items.map(i => i.date).filter(Boolean).sort();

  const sellerTotals = items.reduce((acc, item) => {
    acc.totalSold  += (item.totalSold  || 0);
    acc.returned   += (item.returned   || 0);
    acc.netSold    = acc.totalSold - acc.returned;
    acc.creditQty  += (item.creditQty  || 0);
    acc.cashQty    += (item.cashQty    || 0);
    acc.revenue    += (item.revenue    || 0);
    acc.profit     += (item.profit     || 0);
    acc.totalCost  += (item.totalCost  || 0);
    acc.creditValue+= (item.creditValue|| 0);
    acc.prevColl   += (item.prevColl   || 0);
    acc.received   += (item.received   || 0);
    acc.totalExpected += (item.totalExpected || 0);
    if (item.returned > 0 && item.returnStore) {
      acc.returnsByStore[item.returnStore] = (acc.returnsByStore[item.returnStore] || 0) + (item.returned || 0);
    }
    return acc;
  }, { totalSold:0, returned:0, netSold:0, creditQty:0, cashQty:0, revenue:0, profit:0, totalCost:0, creditValue:0, prevColl:0, received:0, totalExpected:0, returnsByStore:{} });

  const mergedNetSold = sellerTotals.totalSold - sellerTotals.returned;
  // unitPrice: fixed canonical sale price from factory settings.
  // Calculator (seller summary) records always use STORE_A (standard price).
  // Never compute as revenue/qty — that produces a weighted average.
  const _calcCanonicalSp = getSalePriceForStore('STORE_A');
  const avgUnitPrice = _calcCanonicalSp > 0
    ? _calcCanonicalSp
    : (firstItem.unitPrice || 0);
  // costPrice: weighted average of actual cost per kg is correct here —
  // formula material costs can change over the year.
  const avgCostPrice = mergedNetSold > 0
    ? parseFloat((sellerTotals.totalCost / mergedNetSold).toFixed(4))
    : (firstItem.costPrice || calculateSalesCostPerKg('standard') || 0);
  const returnStoreEntries = Object.entries(sellerTotals.returnsByStore);
  const primaryReturnStore = returnStoreEntries.length > 0
    ? returnStoreEntries.sort((a, b) => b[1] - a[1])[0][0]
    : null;

  

  
  const primaryId = generateUUID('calc-merged');
  const primaryRecord = ensureRecordIntegrity(_buildMergedBase(primaryId, mergeEpoch, nowISODate, nowTime, {
    seller,
    unitPrice:     avgUnitPrice,
    costPrice:     avgCostPrice,
    revenue:       sellerTotals.revenue,
    profit:        sellerTotals.profit,
    totalCost:     sellerTotals.totalCost,
    totalSold:     sellerTotals.totalSold,
    returned:       sellerTotals.returned,
    returnStore:    primaryReturnStore,
    returnsByStore: sellerTotals.returnsByStore,
    creditQty:     sellerTotals.creditQty,
    cashQty:       sellerTotals.cashQty,
    creditValue:   sellerTotals.creditValue,
    prevColl:      sellerTotals.prevColl,
    totalExpected: sellerTotals.totalExpected,
    received:      sellerTotals.received,
    statusText:    'OPENING BALANCE',
    statusClass:   'result-box discrepancy-ok',
    linkedSalesIds:    [],
    linkedRepSalesIds: [],
    mergedRecordCount: items.length,
    mergedSummary: {
      dateRange:      { from: datesSorted[0] || nowISODate, to: datesSorted.slice(-1)[0] || nowISODate },
      recordCount:    items.length,
      returnsByStore: sellerTotals.returnsByStore
    }
  }), false, true);
  mergedRecords.push(primaryRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'calculator_history', mergedRecords);
  if (!commitResult.ok) {
    console.warn(`mergeCalculatorData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('calc', commitResult);
  }
}
const existingMergedCalc = salesHistory.filter(item => item.isMerged === true);
salesHistory = [...existingMergedCalc, ...mergedRecords];
await idb.set('noman_history', salesHistory);
emitSyncUpdate({ noman_history: salesHistory });
updateCloseYearProgress('Calculator Data Merged', 60);
}
async function mergePaymentData(signal) {
updateCloseYearProgress('Merging Payment Data...', 70);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(paymentTransactions) || paymentTransactions.length === 0) return;
const entityGroups = {};
paymentTransactions.forEach(item => {
  if (item.isMerged === true) return;
  const entityId = item.entityId || 'unknown';
  if (!entityGroups[entityId]) entityGroups[entityId] = [];
  entityGroups[entityId].push(item);
});
if (Object.keys(entityGroups).length === 0) {
  updateCloseYearProgress('Payment Data - No New Records to Merge', 80);
  return;
}
const nowDate = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime = nowDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true});
const mergedRecords = [];
for (const [entityId, items] of Object.entries(entityGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const entity = paymentEntities.find(e => e.id === entityId);
  const totals = items.reduce((acc, item) => {
    if (item.type === 'IN') acc.in += (item.amount || 0);
    else if (item.type === 'OUT') acc.out += (item.amount || 0);
    return acc;
  }, { in: 0, out: 0 });
  const netBalance = parseFloat((totals.in - totals.out).toFixed(2));

  const SIGNIFICANT_BALANCE_THRESHOLD = 0.01;
  if (Math.abs(netBalance) < SIGNIFICANT_BALANCE_THRESHOLD) {
    continue;  
  }
  const mergedId = generateUUID('pay-merged');
  const datesSorted = items.map(i => i.date).filter(Boolean).sort();
  const entityName = entity?.name || items[0]?.entityName || 'Unknown Entity';
  const entityType = entity?.type || items[0]?.entityType || 'payee';
  const mergedRecord = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    entityId,
    entityName,
    entityType,
    amount: Math.abs(netBalance),
    type: netBalance > 0 ? 'IN' : 'OUT',
    description: netBalance > 0
      ? `Opening balance (receivable) — carried from previous year (${items.length} txns)`
      : `Opening balance (payable) — carried from previous year (${items.length} txns)`,
    isPayable: netBalance < 0,   
    isExpense: false,
    mergedRecordCount: items.length,

    mergedSummary: {
      originalIn: totals.in,
      originalOut: totals.out,
      netBalance,
      dateRange: { from: datesSorted[0] || nowISODate, to: datesSorted.slice(-1)[0] || nowISODate },
      recordCount: items.length,

      hasSupplierMaterials: items.some(i => i.isPayable === true && i.type === 'OUT')
    }
  }), false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'transactions', mergedRecords);
  if (!commitResult.ok) {
    console.warn(`mergePaymentData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('pay', commitResult);
  }
}
const existingMergedPay = paymentTransactions.filter(item => item.isMerged === true);
paymentTransactions = [...existingMergedPay, ...mergedRecords];
await idb.set('payment_transactions', paymentTransactions);
emitSyncUpdate({ payment_transactions: paymentTransactions });
updateCloseYearProgress('Payment Data Merged', 80);
}
async function mergeFactoryData(signal) {
updateCloseYearProgress('Merging Factory Data...', 85);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(factoryProductionHistory) || factoryProductionHistory.length === 0) return;
const nonMergedRecords = factoryProductionHistory.filter(item => item.isMerged !== true);
if (nonMergedRecords.length === 0) {
  updateCloseYearProgress('Factory Data - No New Records to Merge', 90);
  return;
}
const storeGroups = {};
nonMergedRecords.forEach(item => {
  const store = item.store || 'standard';
  if (!storeGroups[store]) storeGroups[store] = [];
  storeGroups[store].push(item);
});
const nowDate = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime = nowDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true});
const mergedRecords = [];
for (const [store, items] of Object.entries(storeGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const totals = items.reduce((acc, item) => {
    acc.units += (item.units || 0);
    acc.totalCost += (item.totalCost || 0);
    acc.materialsCost += (item.materialsCost || 0);
    acc.additionalCost += (item.additionalCost || 0);
    acc.rawMaterialsUsed += (item.rawMaterialsUsed || 0);
    return acc;
  }, { units: 0, totalCost: 0, materialsCost: 0, additionalCost: 0, rawMaterialsUsed: 0 });


  const expectedTotalCost = totals.materialsCost + totals.additionalCost;
  if (Math.abs(expectedTotalCost - totals.totalCost) > 0.01) {

    const originalTotalCost = totals.totalCost;
    totals.totalCost = expectedTotalCost;
    console.warn(`Factory data auto-corrected: totalCost adjusted from ${originalTotalCost} to ${expectedTotalCost}`);
  }
  const mergedId = generateUUID('factory-merged');
  const datesSorted = items.map(i => i.date).filter(Boolean).sort();
  const mergedRecord = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    store,
    units: totals.units,
    totalCost: totals.totalCost,
    materialsCost: totals.materialsCost,
    additionalCost: totals.additionalCost,
    rawMaterialsUsed: totals.rawMaterialsUsed,
    notes: `Opening balance (${store}) — carried from previous year (${items.length} records)`,
    mergedRecordCount: items.length,
    mergedSummary: {
      dateRange: { from: datesSorted[0] || nowISODate, to: datesSorted.slice(-1)[0] || nowISODate },
      recordCount: items.length
    }
  }), false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'factory_history', mergedRecords);
  if (!commitResult.ok) {
    console.warn(`mergeFactoryData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('factory', commitResult);
  }
}
const existingMergedFactory = factoryProductionHistory.filter(item => item.isMerged === true);
factoryProductionHistory = [...existingMergedFactory, ...mergedRecords];
await idb.set('factory_production_history', factoryProductionHistory);
emitSyncUpdate({ factory_production_history: factoryProductionHistory });
updateCloseYearProgress('Factory Data Merged', 90);
}
async function mergeRepSalesData(signal) {
updateCloseYearProgress('Merging Rep Sales Data...', 88);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(repSales) || repSales.length === 0) return;
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const mergedRecords = [];
const repBuckets = {};
repSales.forEach(item => {
  if (item.isMerged === true) return;
  if (!isRepSale(item)) return;  
  const name = item.customerName || 'Unknown';
  const rep  = item.salesRep     || 'NONE';
  const key  = `${name}::${rep}`;
  if (!repBuckets[key]) {
    repBuckets[key] = {
      customer: name, rep,
      sales: [], oldDebt: 0, collectionTotal: 0, partialPaymentTotal: 0, partialPaymentsBySale: {},
      phone: '', supplyStore: ''
    };
  }
  const b = repBuckets[key];
  b.phone       = b.phone       || item.customerPhone || '';
  b.supplyStore = b.supplyStore || item.supplyStore   || 'STORE_A';
  if (item.paymentType === 'PARTIAL_PAYMENT') {

    b.partialPaymentTotal += (item.totalValue || 0);
    const linkedKey = item.relatedSaleId || item.linkedSaleId;
    if (linkedKey) {

      
      b.partialPaymentsBySale[linkedKey] = (b.partialPaymentsBySale[linkedKey] || 0) + (item.totalValue || 0);

      if (!b.partialPaymentCustomers) b.partialPaymentCustomers = {};
      b.partialPaymentCustomers[linkedKey] = item.customerName || name;
    }
    return;
  }
  if (item.paymentType === 'COLLECTION') {
    b.collectionTotal += (item.totalValue || 0);
    return;
  }
  if (item.transactionType === 'OLD_DEBT') {
    b.oldDebt += Math.max(0, (item.totalValue || 0) - (item.partialPaymentReceived || 0));
    return;
  }
  b.sales.push(item);
});
for (const [, b] of Object.entries(repBuckets)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { customer, rep, sales, oldDebt, collectionTotal, phone, supplyStore } = b;
  let totalQty = 0, totalValue = 0, totalCost = 0, totalProfit = 0;
  let realizedProfit = 0, unrealizedProfit = 0;
  let cashValue = 0, unpaidCreditNet = 0;
  const originalRecordIds = sales.map(s => s.id);
  for (const item of sales) {
    totalQty    += (item.quantity   || 0);
    totalValue  += (item.totalValue || 0);
    totalCost   += (item.totalCost  || 0);
    totalProfit += (item.profit     || 0);


    if (item.paymentType === 'CREDIT' && !item.creditReceived) {
      unrealizedProfit += (item.profit || 0);  
    } else {
      realizedProfit += (item.profit || 0);    
    }

    if (item.paymentType === 'CASH' || (item.paymentType === 'CREDIT' && item.creditReceived)) {
      cashValue += (item.totalValue || 0);
    } else if (item.paymentType === 'CREDIT' && !item.creditReceived) {
      unpaidCreditNet += Math.max(0, (item.totalValue || 0) - (item.partialPaymentReceived || 0));
    }
  }
  const grossOutstanding = unpaidCreditNet + oldDebt;
  const netOutstanding   = Math.max(0, grossOutstanding - collectionTotal);
  const advanceCredit    = Math.max(0, collectionTotal - grossOutstanding);
  const isSettled        = netOutstanding <= 0;
  if (sales.length === 0 && oldDebt <= 0 && collectionTotal <= 0) continue;
  const allDates  = sales.map(i => i.date).filter(Boolean).sort();
  const firstItem = sales[0] || {};
  const recordCount = sales.length + (oldDebt > 0 ? 1 : 0) + (collectionTotal > 0 ? 1 : 0);
  const mergedId = generateUUID('repsale-merged');

  

  

  
  // unitPrice: fixed canonical sale price for the supply store from factory
  // settings — never divide totalValue/quantity (gives averaged/partial price).
  const _repMergedStore = supplyStore || firstItem.supplyStore || 'STORE_A';
  const repCanonicalPrice = getSalePriceForStore(_repMergedStore);
  const lastUnitPrice = repCanonicalPrice > 0
    ? repCanonicalPrice
    : (firstItem.unitPrice || (firstItem.quantity > 0 ? firstItem.totalValue / firstItem.quantity : 0) || 0);
  const grossSaleValue  = parseFloat(totalValue.toFixed(2));
  const alreadyPaid     = isSettled ? grossSaleValue : parseFloat((grossSaleValue - netOutstanding).toFixed(2));
  const mergedRecord = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    customerName:          customer,
    customerPhone:         phone,
    quantity:              totalQty,
    unitPrice:             lastUnitPrice,
    totalValue:            grossSaleValue,
    totalCost:             totalCost,
    profit:                totalProfit,
    paymentType:           isSettled ? 'CASH' : 'CREDIT',
    transactionType:       (oldDebt > 0 && sales.length === 0) ? 'OLD_DEBT' : 'SALE',
    creditReceived:        isSettled,
    creditReceivedDate:    isSettled ? nowISODate : null,
    creditValue:           isSettled ? 0 : netOutstanding,
    partialPaymentReceived: isSettled ? 0 : alreadyPaid,
    balancePaid:           alreadyPaid,
    paid:                  isSettled,
    salesRep:              rep,
    supplyStore:           _repMergedStore,
    isRepModeEntry:        true,
    notes:                 'Combined year-end balance carried forward from financial year close',
    mergedRecordCount:     recordCount,
    mergedSummary: {
      cashSales:           cashValue,
      unpaidCredit:        unpaidCreditNet,
      oldDebt:             oldDebt,
      collectionsReceived: collectionTotal,
      partialPayments:     b.partialPaymentTotal || 0,
      partialPaymentsBySale: b.partialPaymentsBySale || {},
      advanceCreditHeld:   advanceCredit,
      realizedProfit:      realizedProfit,
      unrealizedProfit:    unrealizedProfit,
      grossOutstanding,
      netOutstanding,
      isSettled,
      dateRange: {
        from: allDates[0]           || nowISODate,
        to:   allDates.slice(-1)[0] || nowISODate
      },
      recordCount,
      originalRecordIds:   originalRecordIds  
    }
  }), false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'rep_sales', mergedRecords, d => !d.isMerged);
  if (!commitResult.ok) {
    console.warn(`mergeRepSalesData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('repsales', commitResult);
  }
}
const existingMergedRep = repSales.filter(item => item.isMerged === true);
repSales = [...existingMergedRep, ...mergedRecords];
await idb.set('rep_sales', repSales);
emitSyncUpdate({ rep_sales: repSales });
updateCloseYearProgress('Rep Sales Data Merged', 92);
}
async function mergeExpensesData(signal) {
updateCloseYearProgress('Merging Expenses...', 94);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(expenseRecords) || expenseRecords.length === 0) {
  updateCloseYearProgress('Expenses - No Records to Merge', 94);
  return;
}
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const expenseGroups = {};
expenseRecords.forEach(exp => {
  if (exp.isMerged === true) return;
  const cat  = exp.category || 'operating';
  const name = (exp.name    || 'Unnamed').trim();
  const key  = `${cat}||${name}`;
  if (!expenseGroups[key]) expenseGroups[key] = { category: cat, name, records: [] };
  expenseGroups[key].records.push(exp);
});
if (Object.keys(expenseGroups).length === 0) {
  updateCloseYearProgress('Expenses - No New Records to Merge', 97);
  return;
}
const mergedRecords = [];
for (const [, grp] of Object.entries(expenseGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { category, name, records } = grp;
  const totalAmount = records.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const allDates    = records.map(e => e.date).filter(Boolean).sort();
  const mergedId = generateUUID('expense-merged');
  const mergedRecord = ensureRecordIntegrity({
    ..._buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {}),
    name,
    amount:      parseFloat(totalAmount.toFixed(2)),
    category,
    description: `Year-end merged total for "${name}" (${records.length} record${records.length !== 1 ? 's' : ''})`,
    mergedRecordCount: records.length,
    mergedSummary: {
      category,
      expenseName:  name,
      totalAmount:  parseFloat(totalAmount.toFixed(2)),
      dateRange: {
        from: allDates[0]           || nowISODate,
        to:   allDates.slice(-1)[0] || nowISODate
      },
      recordCount: records.length
    }
  }, false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'expenses', mergedRecords, d => !d.isMerged);
  if (!commitResult.ok) {
    console.warn(`mergeExpensesData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('exp', commitResult);
  }
}
const existingMerged = expenseRecords.filter(e => e.isMerged === true);
expenseRecords = [...existingMerged, ...mergedRecords];
await idb.set('expenses', expenseRecords);
emitSyncUpdate({ expenses: expenseRecords });
updateCloseYearProgress('Expenses Merged', 97);
}
async function mergeStockReturnsData(signal) {
updateCloseYearProgress('Merging Stock Returns...', 98);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(stockReturns) || stockReturns.length === 0) {
  updateCloseYearProgress('Stock Returns - No Records to Merge', 98);
  return;
}
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const storeGroups = {};  
stockReturns.forEach(ret => {
  if (ret.isMerged === true) return;
  const store = ret.store || 'UNKNOWN';
  const date  = ret.date  || nowISODate;
  const key   = `${store}||${date}`;
  if (!storeGroups[key]) storeGroups[key] = { store, date, records: [], totalQty: 0 };
  storeGroups[key].records.push(ret);
  storeGroups[key].totalQty += (ret.quantity || 0);
});
if (Object.keys(storeGroups).length === 0) {
  updateCloseYearProgress('Stock Returns - No New Records to Merge', 100);
  return;
}
const mergedRecords = [];
for (const [, grp] of Object.entries(storeGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { store, date, records, totalQty } = grp;

  
  const sellerBreakdown = {};
  records.forEach(r => {
    const seller = r.seller || 'Unknown';
    if (!sellerBreakdown[seller]) {
      sellerBreakdown[seller] = { quantity: 0, recordCount: 0 };
    }
    sellerBreakdown[seller].quantity += (r.quantity || 0);
    sellerBreakdown[seller].recordCount++;
  });
  const sellers = [...new Set(records.map(r => r.seller).filter(Boolean))];
  const mergedId = generateUUID('ret-merged');

  
  const base = _buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {});
  const mergedRecord = ensureRecordIntegrity({
    ...base,
    date,          
    store,
    quantity:      parseFloat(totalQty.toFixed(4)),
    seller:        sellers.join(', ') || 'Multiple',
    mergedRecordCount: records.length,
    mergedSummary: {
      store,
      date,
      totalQuantity:       parseFloat(totalQty.toFixed(4)),
      contributingSellers: sellers,
      sellerBreakdown:     sellerBreakdown,
      recordCount:         records.length
    }
  }, false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'returns', mergedRecords, d => !d.isMerged);
  if (!commitResult.ok) {
    console.warn(`mergeStockReturnsData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, commitResult.error);
    _markRowSyncWarning('ret', commitResult);
  }
}
const existingMerged = stockReturns.filter(r => r.isMerged === true);
stockReturns = [...existingMerged, ...mergedRecords];
await idb.set('stock_returns', stockReturns);
emitSyncUpdate({ stock_returns: stockReturns });
updateCloseYearProgress('Stock Returns Merged', 100);
}
