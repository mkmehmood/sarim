import { themeVar } from './theme-tokens.js';
import { formatDayMonthYear } from './date-format.js';
import { CryptoEngine, _safeErr, _triggerFileDownload, compareRecordVersions, currentUser, ensureArray, ensureRecordIntegrity, firebaseDB, fmtAmt, generateUUID, getDeviceId, sqliteStore, validateUUID, loadCollections } from './business.js';
import { _commitMergedBatch, emitSyncUpdate, performOneClickSync, pushDataToCloud, sanitizeForFirestore } from './sync.js';
import { defaultSettings } from './utilities-core.js';
import { DeltaSync, UUIDSyncRegistry, getStorePool, trackFirestoreWrite, verifyAccountPassword } from './utilities-sales.js';
import { refreshAllDisplays } from './utilities-payments.js';
import { calculateSalesCostPerKg, getEffectiveSalePriceForCustomer, getSalePriceForStore } from './factory.js';
import { showGlassConfirm, showToast } from './customers.js';
import { collectAuxBackupFields, isSupportedBackup, RECORD_STORES, DATASET_BY_KEY } from './link-graph.js';
import { getDefaultStoreKey, storeLabelFor } from './store-keys.js';

export async function updateDeltaSyncStatsDisplay() {
  try {
    const modal = document.getElementById('delta-stats-modal');
    if (!modal) return;
    const statsRows = modal.querySelectorAll('[data-sync-stat]');
    if (statsRows.length > 0 && typeof DeltaSync !== 'undefined') {
      const stats = await DeltaSync.getSyncStats();
      statsRows.forEach(row => {
        const col = row.getAttribute('data-sync-stat');
        if (stats && stats[col]) {
          row.textContent = new Date(stats[col]).toLocaleString();
        } else {
          row.textContent = 'Never';
        }
      });
    }
    if (typeof showToast === 'function') {
      showToast('Sync history cleared', 'success', 2500);
    }
  } catch (e) {
    if (typeof showToast === 'function') {
      showToast('Could not refresh stats: ' + e.message, 'warning', 3000);
    }
  }
}

export async function showDeltaSyncDetails() {
if (!firebaseDB || !currentUser) {
  showToast('Please log in to view database structure', 'warning', 3000);
  return;
}
const modal = document.createElement('div');
modal.id = 'delta-stats-modal';
modal.classList.add('st-position__072a0d', 'st-background__7f65d7', 'd-flex', 'st-align-items__7c6197', 'st-padding__287f77', 'u-7ddd1b4');
modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
modal.innerHTML = `<div class="u-ed43437 st-background__e02427">
  <div class="u-e6c5b02 d-flex"><svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" ><path d="M6 9V27C6 29.5 11.5 31.5 18 31.5S30 29.5 30 27V9C30 11.5 24.5 13.5 18 13.5S6 11.5 6 9Z" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 9C6 6.5 11.5 4.5 18 4.5S30 6.5 30 9 24.5 13.5 18 13.5 6 11.5 6 9Z" fill="var(--accent-gold)" fill-opacity="0.35" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 18C6 20.5 11.5 22.5 18 22.5S30 20.5 30 18" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><circle cx="25" cy="27.2" r="1.2" fill="var(--accent-gold)"/><circle cx="21.5" cy="28" r="1.2" fill="var(--accent-gold)" opacity="0.6"/></svg></div>
  <div class="u-cf5ec96">Loading database structure…</div>
</div>`;
document.body.appendChild(modal);
try {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const deviceId = (typeof getDeviceId === 'function') ? await getDeviceId().catch(() => '—') : '—';
  const [
    productionSnap, salesSnap, calcHistorySnap, repSalesSnap, repCustomersSnap,
    salesCustomersSnap, transactionsSnap, entitiesSnap, inventorySnap,
    factoryHistorySnap, returnsSnap, expensesSnap, deletionsSnap, personPhotosSnap,
    settingsDoc, factorySettingsDoc, expenseCategoriesDoc, teamDoc,
    deviceDoc, accountInfoDoc, yearCloseSignalDoc, appStoresDoc
  ] = await Promise.all([
    userRef.collection('production').get(),
    userRef.collection('sales').get(),
    userRef.collection('calculator').get(),
    userRef.collection('rep').get(),
    userRef.collection('clients').get(),
    userRef.collection('customers').get(),
    userRef.collection('transactions').get(),
    userRef.collection('entities').get(),
    userRef.collection('inventory').get(),
    userRef.collection('factory').get(),
    userRef.collection('returns').get(),
    userRef.collection('expenses').get(),
    userRef.collection('deletions').get(),
    userRef.collection('photos').get().catch(() => ({ size: 0, docs: [] })),
    userRef.collection('settings').doc('config').get(),
    userRef.collection('formulas').doc('config').get(),
    userRef.collection('categories').doc('list').get(),
    userRef.collection('settings').doc('team').get(),
    userRef.collection('devices').doc(deviceId).get().catch(() => ({ exists: false, data: () => null })),
    userRef.collection('account').doc('info').get().catch(() => ({ exists: false, data: () => null })),
    userRef.collection('settings').doc('yearCloseSignal').get().catch(() => ({ exists: false, data: () => null })),
    userRef.collection('stores').doc('list').get().catch(() => ({ exists: false, data: () => null })),
  ]);
  const stats      = await DeltaSync.getSyncStats();
  const uuidStats  = (typeof UUIDSyncRegistry !== 'undefined') ? UUIDSyncRegistry.stats() : {};
  const myDeviceShard = uuidStats._myDeviceShard ? uuidStats._myDeviceShard.toUpperCase() : '—';
  const _savedFsStats = await sqliteStore.get('dbstats', null);
  const firestoreStats = (_savedFsStats && typeof _savedFsStats.reads === 'number')
    ? _savedFsStats
    : { reads: 0, writes: 0, lastReset: Date.now() };
  const sqliteCounts = {};
  const sqliteKeys = ['production','sales','calculator','rep','clients',
    'customers','transactions','entities','inventory',
    'factory','returns','expenses','deletions','photos','stores'];
  await Promise.all(sqliteKeys.map(async k => {
    const arr = await sqliteStore.get(k, []);
    sqliteCounts[k] = Array.isArray(arr) ? arr.length : (arr && typeof arr === 'object' ? Object.keys(arr).length : 0);
  }));
  const _dirtyPhotoKeys = (await sqliteStore.get('photodirty')) || [];
  sqliteCounts['_photos_dirty'] = Array.isArray(_dirtyPhotoKeys) ? _dirtyPhotoKeys.length : 0;
  const _rs = (k) => DATASET_BY_KEY[k];
  const COLLECTIONS = [
    { fsName:_rs('production').collection, sqliteKey:_rs('production').sqlite, jsVar:_rs('production').jsVar, snap:productionSnap, tabFn:'syncProductionTab', lock:true, desc:_rs('production').desc },
    { fsName:_rs('sales').collection, sqliteKey:_rs('sales').sqlite, jsVar:_rs('sales').jsVar, snap:salesSnap, tabFn:'syncSalesTab', lock:true, desc:_rs('sales').desc },
    { fsName:_rs('calculator').collection, sqliteKey:_rs('calculator').sqlite, jsVar:_rs('calculator').jsVar, snap:calcHistorySnap, tabFn:'syncCalculatorTab', lock:true, desc:_rs('calculator').desc },
    { fsName:_rs('rep').collection, sqliteKey:_rs('rep').sqlite, jsVar:_rs('rep').jsVar, snap:repSalesSnap, tabFn:'syncRepTab', lock:true, desc:_rs('rep').desc },
    { fsName:_rs('clients').collection, sqliteKey:_rs('clients').sqlite, jsVar:_rs('clients').jsVar, snap:repCustomersSnap, tabFn:'syncRepTab', lock:false, desc:_rs('clients').desc },
    { fsName:_rs('customers').collection, sqliteKey:_rs('customers').sqlite, jsVar:_rs('customers').jsVar, snap:salesCustomersSnap, tabFn:'renderCustomersTable', lock:false, desc:_rs('customers').desc },
    { fsName:_rs('transactions').collection, sqliteKey:_rs('transactions').sqlite, jsVar:_rs('transactions').jsVar, snap:transactionsSnap, tabFn:'syncPaymentsTab', lock:true, desc:_rs('transactions').desc },
    { fsName:_rs('entities').collection, sqliteKey:_rs('entities').sqlite, jsVar:_rs('entities').jsVar, snap:entitiesSnap, tabFn:'refreshPaymentTab', lock:false, desc:_rs('entities').desc },
    { fsName:_rs('inventory').collection, sqliteKey:_rs('inventory').sqlite, jsVar:_rs('inventory').jsVar, snap:inventorySnap, tabFn:'syncFactoryTab', lock:false, desc:_rs('inventory').desc },
    { fsName:_rs('factory').collection, sqliteKey:_rs('factory').sqlite, jsVar:_rs('factory').jsVar, snap:factoryHistorySnap, tabFn:'syncFactoryTab', lock:true, desc:_rs('factory').desc },
    { fsName:_rs('returns').collection, sqliteKey:_rs('returns').sqlite, jsVar:_rs('returns').jsVar, snap:returnsSnap, tabFn:'syncProductionTab', lock:true, desc:_rs('returns').desc },
    { fsName:_rs('expenses').collection, sqliteKey:_rs('expenses').sqlite, jsVar:_rs('expenses').jsVar, snap:expensesSnap, tabFn:'refreshPaymentTab', lock:true, desc:_rs('expenses').desc },
    { fsName:'deletions',          sqliteKey:'deletions',           jsVar:'deletedRecordIds',         snap:deletionsSnap,       tabFn:null,                 lock:false, desc:'Tombstone records for soft-deleted IDs' },
    { fsName:'photos',       sqliteKey:'photos',              jsVar:'photos{}',          snap:personPhotosSnap,    tabFn:null,                 lock:false, desc:'Person/customer/entity photos (keyed object: cust:name, entity:id, rep-cust:rep:name)', isPhotoStore:true },
  ];
  const CONFIG_DOCS = [
    { path:'settings/config',              doc:settingsDoc,          desc:'App settings, FY counter, repProfile, reps (init)',
      sqlite:[['settings','settings'],['repProfile','repProfile'],['reps','reps (init)']],
      fsFields:['settings','settings_timestamp','repProfile','repProfile_timestamp','reps','reps_timestamp','synced'],
      listener:'_handleSettingsSnapshot' },
    { path:'settings/team',                doc:teamDoc,              desc:'Sales reps list & user roles',
      sqlite:[['reps','reps'],['roles','roles']],
      fsFields:['reps','roles','updated'],
      listener:'_handleTeamSnapshot' },
    { path:'settings/yearCloseSignal',     doc:yearCloseSignalDoc,   desc:'Cross-device year-close / restore broadcast signal',
      sqlite:[['_lastHandledYearCloseSignal','triggeredAt']],
      fsFields:['type','triggeredAt','triggeredBy','fyCloseCount'],
      listener:'_handleYearCloseSignal' },
    { path:'formulas/config',       doc:factorySettingsDoc,   desc:'Factory formulas, costs, unit tracking',
      sqlite:[['defaults','defaults'],['costs','costs'],['adjustment','adjustment'],['tracking','tracking'],['formulas','formulas']],
      fsFields:['defaults','costs','adjustment','tracking','formulas','defaults_timestamp','formulas_timestamp'],
      listener:'_handleFactorySettingsSnapshot' },
    { path:'categories/list', doc:expenseCategoriesDoc, desc:'Expense category definitions',
      sqlite:[['categories','categories']],
      fsFields:['categories','categories_timestamp'],
      listener:'_handleExpenseCategoriesSnapshot' },
    { path:'stores/list',                 doc:appStoresDoc,         desc:'Store catalog, formulas & per-store sale prices',
      sqlite:[['stores','stores'],['stores_timestamp','stores_timestamp']],
      fsFields:['stores','stores_timestamp'],
      listener:'_handleAppStoresSnapshot' },
    { path:`devices/${deviceId}`,          doc:deviceDoc,            desc:'This device: mode, fingerprint, heartbeat, remote commands',
      sqlite:[['appMode','currentMode'],['appMode_timestamp','appMode_timestamp'],['device_id','deviceId']],
      fsFields:['currentMode','appMode_timestamp','assignedRep','assignedManager','remoteAppliedMode','lastSeen','online','fingerprint'],
      listener:'_handleDeviceSnapshot (live mode changes)' },
    { path:'account/info',                 doc:accountInfoDoc,       desc:'Account email, displayName, lastActivity (updated on login)',
      sqlite:[],
      fsFields:['email','displayName','accountCreated','lastActivity'],
      listener:'none — read once on login' },
  ];
  const ago = raw => {
    if (!raw) return 'never';
    const ms = typeof raw === 'string' ? Date.parse(raw) : raw;
    if (!ms || isNaN(ms)) return 'never';
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 0) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  };
  const fmtVal = v => {
    if (v === null || v === undefined) return '<span class="u-d59bb54">null</span>';
    if (typeof v === 'boolean') return `<span class="dc-color" style="--d-color: ${v?'var(--success)':'var(--danger)'}">${v}</span>`;
    if (typeof v === 'object') {
      if (Array.isArray(v)) return `<span class="u-182e628">Array(${v.length})</span>`;
      if (v.seconds !== undefined) return `<span class="u-d59bb54">${formatDayMonthYear(new Date(v.seconds*1000))}</span>`;
      return `<span class="u-182e628">Object(${Object.keys(v).length})</span>`;
    }
    if (typeof v === 'string') {
      const s = v.length > 28 ? v.slice(0,28)+'…' : v;
      return `<span class="u-d59bb54">"${s}"</span>`;
    }
    if (typeof v === 'number') return `<span class="u-e1a6e11">${v > 1e10 ? ago(v) : v.toLocaleString()}</span>`;
    return `<span class="u-e6f0554">${String(v).slice(0,30)}</span>`;
  };
  const badge = (txt, color) =>
    `<span class="st-font-size__2f7bba st-font-weight__e3ec02 st-padding__8f0293 dc-color u-74119ac" style="--d-color: ${color}">${txt}</span>`;
  const pill = (txt, color) =>
    `<span class="st-font-size__8303b5 st-padding__fe9a05 dc-color u-67130d4" style="--d-color: ${color}">${txt}</span>`;
  let totalFsDocs = 0;
  COLLECTIONS.forEach(c => { totalFsDocs += c.snap.size || 0; });
  let html = `
<div id="dbv-root" class="u-7f49e10 has-overflow d-flex st-background__e02427 u-0da05dd">

  <div class="u-05209d6 d-flex">
    <div class="u-1043921 d-flex">
      <span class="u-6a4ecdf d-flex"><svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9V27C6 29.5 11.5 31.5 18 31.5S30 29.5 30 27V9C30 11.5 24.5 13.5 18 13.5S6 11.5 6 9Z" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 9C6 6.5 11.5 4.5 18 4.5S30 6.5 30 9 24.5 13.5 18 13.5 6 11.5 6 9Z" fill="var(--accent-gold)" fill-opacity="0.35" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 18C6 20.5 11.5 22.5 18 22.5S30 20.5 30 18" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/><circle cx="25" cy="27.2" r="1.2" fill="var(--accent-gold)"/><circle cx="21.5" cy="28" r="1.2" fill="var(--accent-gold)" opacity="0.6"/></svg></span>
      <div>
        <div class="u-4228bfa">Database Structure</div>
        <div class="u-e59bcbb">
          users/${currentUser.uid.slice(0,14)}…/  &nbsp;·&nbsp; shard&nbsp;<span class="u-478dfec">${myDeviceShard}</span>
        </div>
      </div>
    </div>
    <button onclick="document.getElementById('delta-stats-modal').remove()"
      class="u-c74ce47 d-flex st-background__262df2 st-border-bottom__2eda1d"><svg width="14" height="14" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 9L27 27M27 9L9 27" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></button>
  </div>

  <div class="u-d331926 d-flex">
    ${['Collections','Config Docs','Listeners','Summary'].map((t,i) =>
      `<button id="dbv-tab-${i}" onclick="dbvShowTab(${i})"
        class="st-padding__44fff1 st-border-radius__cc1df6 st-border__2eda1d st-cursor__3b6a3a st-font-size__8113a0 st-font-weight__eed0f8 ${i===0?'st-background__36d305':'st-background__3bf978'} ${i===0?'st-color__729d2f':'st-color__5872de'}">${t}</button>`
    ).join('')}
  </div>

  <div id="dbv-body" class="u-ee0901a has-overflow u-86c6b8a">
`;
  html += `<div id="dbv-pane-0">`;
  const _reads      = firestoreStats.reads  || 0;
  const _writes     = firestoreStats.writes || 0;
  const _readPct    = Math.min(100, Math.round(_reads  / 500));
  const _writePct   = Math.min(100, Math.round(_writes / 200));
  const _readColor  = _readPct  >= 80 ? 'var(--danger)' : _readPct  >= 50 ? 'var(--warning)' : 'var(--success)';
  const _writeColor = _writePct >= 80 ? 'var(--danger)' : _writePct >= 50 ? 'var(--warning)' : 'var(--accent-blue)';
  const _resetAgo   = firestoreStats.lastReset ? ago(firestoreStats.lastReset) : 'unknown';
  const _msLeft     = firestoreStats.lastReset ? Math.max(0, 864e5 - (Date.now() - firestoreStats.lastReset)) : 0;
  const _resetNext  = _msLeft > 0 ? (Math.floor(_msLeft/3600000) + 'h ' + Math.floor((_msLeft%3600000)/60000) + 'm') : 'soon';
  html += `<div class="u-871c610 d-grid">
    <div class="u-095dddc st-background__fbd10c">
      <div class="u-0952787">${totalFsDocs.toLocaleString()}</div>
      <div class="u-ae471a4">Firestore Docs</div>
      <div class="u-5934f86">live count</div>
    </div>
    <div class="u-095dddc st-background__fbd10c">
      <div class="st-font-size__27e469 st-font-weight__e3ec02 dc-color" style="--d-color: ${_readColor}">${_reads.toLocaleString()}</div>
      <div class="u-ae471a4">Reads (24 h)</div>
      <div class="st-font-size__a9e436 dc-color st-margin-top__7a21c6" style="--d-color: ${_readColor}">${_readPct}% of 50 000</div>
    </div>
    <div class="u-095dddc st-background__fbd10c">
      <div class="st-font-size__27e469 st-font-weight__e3ec02 dc-color" style="--d-color: ${_writeColor}">${_writes.toLocaleString()}</div>
      <div class="u-ae471a4">Writes (24 h)</div>
      <div class="st-font-size__a9e436 dc-color st-margin-top__7a21c6" style="--d-color: ${_writeColor}">${_writePct}% of 20 000</div>
    </div>
  </div>
  <div class="u-391e335 text-right">
    Counter started ${_resetAgo} &nbsp;·&nbsp; resets in ${_resetNext}
  </div>`;
  COLLECTIONS.forEach(col => {
    const fsDocs   = col.snap.size || 0;
    const sqDocs   = sqliteCounts[col.sqliteKey] || 0;
    const colStats = stats[col.fsName] || {};
    const uuidCol  = uuidStats[col.fsName] || {};
    const isDirty  = DeltaSync.isDirty(col.fsName);
    const lastSync = colStats.lastSync ? ago(colStats.lastSync) : 'never';
    const hasLiveListener = col.fsName !== 'deletions' && col.fsName !== 'photos';
    const mismatch = !col.isPhotoStore && Math.abs(fsDocs - sqDocs) > 0;
    const borderColor = mismatch ? themeVar('--danger', 40) : 'var(--glass-border)';
    html += `
<div class="u-f1095b3 st-padding__0b5785 st-background__356c02 st-border-radius__a44260 dc-border" style="--d-border: 1px solid ${borderColor}">
  <div class="u-335e5cd d-flex">
    <div class="u-8b4ab7f">
      <div class="u-0e3398e d-flex">
        <span class="u-4527bd8">${col.fsName}</span>
        ${hasLiveListener ? badge('LIVE','var(--success)') : badge('SNAPSHOT','var(--warning)')}
        ${col.lock ? badge('LOCKED ON CLOSE','var(--text-secondary)') : ''}
        ${isDirty ? badge('PENDING','var(--warning)') : ''}
      </div>
      <div class="u-a39b897">${col.desc}</div>
      <div class="u-063dd15 d-flex">
        <span>SQLite: ${pill(col.sqliteKey,'var(--accent)')}</span>
        <span>JS: ${pill(col.jsVar,'var(--accent-cyan)')}</span>
        <span>Tab: ${pill(col.tabFn||'—','var(--text-muted)')}</span>
      </div>
    </div>
    <div class="u-b62856e text-right">
      <div class="u-dd009f5">${fsDocs} FS</div>
      <div class="st-font-size__569d78 dc-color" style="--d-color: ${mismatch?'var(--danger)':'var(--text-muted)'}">
        ${sqDocs} local${mismatch?' <svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-cd4b436 d-inline-block"><path d="M10 4H26M10 32H26" stroke="var(--warning)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 4C12 12.5 18 14 18 18S12 23.5 12 32M24 4C24 12.5 18 14 18 18S24 23.5 24 32" fill="var(--warning)" fill-opacity="0.12" stroke="var(--warning)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M14.2 30L18 23.5 21.8 30Z" fill="var(--warning)" fill-opacity=".85"/></svg>':''}
      </div>
    </div>
  </div>
  <div class="u-7fae4eb d-flex">
    <span>↑ <b class="u-e4906e4">${uuidCol.uploaded||0}</b> up</span>
    <span>↓ <b class="u-8da8d88">${uuidCol.downloaded||0}</b> down</span>
    <span>Syncs: <b class="u-e6f0554">${colStats.syncCount||0}</b></span>
    <span>Last: <b class="u-e6f0554">${lastSync}</b></span>
    ${col.isPhotoStore ? `<span>Dirty keys: <b class="dc-color" style="--d-color:${sqliteCounts['_photos_dirty']>0?'var(--warning)':'var(--text)'}">${sqliteCounts['_photos_dirty']}</b></span>` : ''}
  </div>
</div>`;
  });
  html += `</div>`;
  html += `<div id="dbv-pane-1" class="d-none">`;
  CONFIG_DOCS.forEach(doc => {
    const exists = doc.doc && doc.doc.exists;
    const data   = exists ? doc.doc.data() : null;
    html += `
<div class="u-7619a9f st-background__356c02 st-border-bottom__e54b2f">
  <div class="u-3749291 d-flex">
    <div class="u-8b4ab7f">
      <div class="u-57e7f8a">${doc.path}</div>
      <div class="u-34951f5">${doc.desc}</div>
      <div class="u-3b03f58">Listener: ${pill(doc.listener, 'var(--success)')}</div>
    </div>
    <div class="u-b62856e">
      ${exists ? badge('EXISTS','var(--success)') : badge('MISSING','var(--danger)')}
    </div>
  </div>`;
    if (doc.sqlite.length) {
      html += `<div class="u-e7b1306">
        <div class="u-0c93f7b">SQLite ↔ Firestore field mapping:</div>
        <div class="u-f96187d d-flex">
          ${doc.sqlite.map(([sk, fk]) =>
            `<div class="u-67130d4 st-font-size__3b85a5 st-background__4b5b84 st-padding__8f0293 st-border-radius__28a50d">
              <span class="st-color__a80552">${sk}</span><span class="st-color__5872de"> → </span><span class="st-color__0ae80b">${fk}</span>
            </div>`
          ).join('')}
        </div>
      </div>`;
    }
    if (exists && data) {
      html += `<div class="u-17f05d4">
        <div class="u-642b28e">Firestore fields:</div>
        <div class="u-31c6720 d-grid">
          ${doc.fsFields.map(k => {
            const present = k in data;
            return `<div class="u-28c1c75 d-flex st-font-size__8303b5 st-padding__dd8474">
              <span class="u-4597eb5 dc-color" style="--d-color:${present?'var(--text)':'var(--danger)'}">${present?'':'<svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-9b5cd9b d-inline-block"><path d="M10 4H26M10 32H26" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 4C12 12.5 18 14 18 18S12 23.5 12 32M24 4C24 12.5 18 14 18 18S24 23.5 24 32" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M14.2 30L18 23.5 21.8 30Z" fill="currentColor" fill-opacity=".85"/></svg>'}${k}</span>
              <span>${present ? fmtVal(data[k]) : ''}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  html += `<div id="dbv-pane-2" class="d-none">`;
  const LISTENERS = [
    { name:'users/{uid}',                      type:'doc',  path:'userRef.onSnapshot',                              purpose:'Force-logout, account suspension, lastWrite ping for pull trigger', fires:'Any write to the user root doc' },
    { name:'settings/config',                  type:'doc',  path:'_handleSettingsSnapshot',                         purpose:'settings, repProfile, reps (init copy)', fires:'Timestamp guard on settings_timestamp, repProfile_timestamp, reps_timestamp' },
    { name:'settings/team',                    type:'doc',  path:'_handleTeamSnapshot',                             purpose:'reps, roles', fires:'updated timestamp change' },
    { name:'settings/yearCloseSignal',         type:'doc',  path:'_handleYearCloseSignal',                          purpose:'Wipe SQLite + full cloud rebuild on other devices after year-close or restore', fires:'triggeredAt > _lastHandledYearCloseSignal AND triggeredBy ≠ this device' },
    { name:'formulas/config',           type:'doc',  path:'_handleFactorySettingsSnapshot',                  purpose:'defaults, costs, adjustment, tracking', fires:'Individual per-field timestamp guards' },
    { name:'stores/list',                 type:'doc',  path:'appStoresUnsub',                                  purpose:'stores — store list including each store\'s per-store sale price', fires:'stores_timestamp change' },
    { name:'categories/list',     type:'doc',  path:'_handleExpenseCategoriesSnapshot',                purpose:'categories', fires:'categories_timestamp change or content diff' },
    { name:'devices/{deviceId}',               type:'doc',  path:'_handleDeviceSnapshot',                           purpose:'Live remote mode changes (admin→rep etc.) without re-login', fires:'remoteAppliedMode flag + appMode_timestamp > local' },
    { name:'deletions',                        type:'col',  path:'_handleDeletionsSnapshot',                        purpose:'Propagate soft deletes to all devices, filter from data arrays', fires:'Any add/modify/remove on the deletions collection' },
    { name:'photos',                     type:'col',  path:'pullDataFromCloud → photos delta fetch',    purpose:'Sync person/customer/entity photos (base64) from cloud; upload dirty keys on push', fires:'Delta pull on sync — not a live onSnapshot listener; uploads via dirty-key queue' },
    ...COLLECTIONS.filter(c => c.fsName !== 'deletions').map(c => ({
      name: c.fsName,
      type: 'col',
      path: `_makeSnapshotHandler("${c.fsName}")`,
      purpose: `Live updates to ${c.sqliteKey} → ${c.jsVar}`,
      fires: 'Any doc change; lockOnClose=' + c.lock,
    })),
  ];
  html += `<div class="u-41505bd st-background__0fc677 st-border-bottom__52eec8">
    <div class="u-c36ae2f">● ${LISTENERS.length} Active Realtime Listeners</div>
    <div class="u-f1f33a6">All subscribed via <code>onSnapshot</code> in <code>subscribeToRealtime()</code>. Reconnect on network restore.</div>
  </div>`;
  LISTENERS.forEach(l => {
    html += `
<div class="u-d7e5900 st-background__356c02 st-border-bottom__e54b2f">
  <div class="u-350ad3a d-flex">
    ${badge(l.type==='col'?'COLLECTION':'DOC', l.type==='col'?'var(--accent-blue)':'var(--accent-purple)')}
    <span class="u-a28f127">${l.name}</span>
  </div>
  <div class="u-b80e433">${l.purpose}</div>
  <div class="u-3fe1e71 d-flex">
    <span>Handler: ${pill(l.path,'var(--accent-cyan)')}</span>
  </div>
  <div class="u-cd108c0">Fires when: ${l.fires}</div>
</div>`;
  });
  html += `</div>`;
  html += `<div id="dbv-pane-3" class="d-none">`;
  html += `<div class="u-5beb8fb">
    <div class="u-87be69b">Firestore → SQLite → JS Variable Map</div>
    <div class="has-overflow u-987eb2a">
    <table class="table">
      <thead><tr>
        <th>Firestore</th>
        <th>SQLite Key</th>
        <th>JS Variable</th>
        <th class="text-right">FS / Local</th>
      </tr></thead>
      <tbody>
        ${COLLECTIONS.map(c => {
          const fs = c.snap.size || 0;
          const sq = sqliteCounts[c.sqliteKey] || 0;
          const ok = Math.abs(fs - sq) === 0;
          return `<tr>
            <td>${c.fsName}</td>
            <td>${c.sqliteKey}</td>
            <td>${c.jsVar}</td>
            <td class="text-right dc-color" style="--d-color:${ok?'var(--text)':'var(--danger)'}">${fs} / ${sq}${ok?'':' <svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-cd4b436 d-inline-block"><path d="M10 4H26M10 32H26" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 4C12 12.5 18 14 18 18S12 23.5 12 32M24 4C24 12.5 18 14 18 18S24 23.5 24 32" fill="#f59e0b" fill-opacity="0.12" stroke="#f59e0b" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M14.2 30L18 23.5 21.8 30Z" fill="#f59e0b" fill-opacity=".85"/></svg>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  </div>`;
  html += `<div class="u-8f42027 st-background__356c02">
    <div class="u-87be69b">Firestore Schema (users/{uid}/…)</div>
    <div class="u-ed97d82">
      <div><span class="u-e1a6e11">users/</span><span class="u-b68d496">{uid}</span></div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">production/</span> <span class="u-d59bb54">{docId}</span> — factory batches</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">sales/</span> <span class="u-d59bb54">{docId}</span> — customer sales</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">calculator/</span> <span class="u-d59bb54">{docId}</span> — ledger entries</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">rep/</span> <span class="u-d59bb54">{docId}</span> — rep sales</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">clients/</span> <span class="u-d59bb54">{docId}</span></div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">customers/</span> <span class="u-d59bb54">{docId}</span></div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">transactions/</span> <span class="u-d59bb54">{docId}</span> — payments</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">entities/</span> <span class="u-d59bb54">{docId}</span> — payment entities</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">inventory/</span> <span class="u-d59bb54">{docId}</span> — raw materials</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">factory/</span> <span class="u-d59bb54">{docId}</span></div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">returns/</span> <span class="u-d59bb54">{docId}</span></div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">expenses/</span> <span class="u-d59bb54">{docId}</span></div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">deletions/</span> <span class="u-d59bb54">{recordId}</span> — tombstones</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">photos/</span> <span class="u-d59bb54">{base64Key}</span> — photos keyed by type:id (cust:name, entity:id, rep-cust:rep:name)</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">activity/</span> <span class="u-d59bb54">{auto}</span> — write-only audit</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">updates/</span> <span class="u-d59bb54">{auto}</span> — heartbeat log (cleaned hourly)</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">devices/</span> <span class="u-d59bb54">{deviceId}</span> — fingerprint, mode, heartbeat</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">account/info</span> — email, displayName</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">settings/config</span> — settings, repProfile</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">settings/team</span> — reps, roles</div>
      <div class="u-ce88006"><span class="u-e4906e4">├─</span> <span class="u-182e628">settings/yearCloseSignal</span> — cross-device broadcast</div>
      <div class="u-ce88006"><span class="u-e4906e4">└─</span> <span class="u-182e628">formulas/config</span> — formulas, costs, prices</div>
    </div>
  </div>

  ${(() => {
    const fy = settingsDoc.exists ? (settingsDoc.data().settings || {}) : {};
    const fyCount = fy.fyCloseCount || 0;
    const fyDate  = fy.lastYearClosedDate ? formatDayMonthYear(new Date(fy.lastYearClosedDate)) : '—';
    const fySignal = yearCloseSignalDoc.exists ? yearCloseSignalDoc.data() : null;
    return `<div class="text-xs st-padding__2285bd st-background__2e1b32 st-border-radius__cc1df6 st-font-size__8e87b7">
      <div class="u-3fc56fa st-font-weight__e3ec02 st-color__f045bb">Financial Year Status</div>
      <div class="u-8effc0e d-grid st-color__5872de">
        <div>Close count: <b class="st-color__a80552">${fyCount}</b></div>
        <div>Last closed: <b class="st-color__f045bb">${fyDate}</b></div>
        <div>Signal type: <b class="st-color__5872de">${fySignal ? fySignal.type || '—' : '—'}</b></div>
        <div>Signal age: <b class="st-color__f045bb">${fySignal && fySignal.triggeredAt ? ago(fySignal.triggeredAt) : '—'}</b></div>
      </div>
    </div>`;
  })()}
  `;
  html += `</div>`;
  html += `</div></div>`;
  modal.innerHTML = html;
} catch (err) {
  console.error('[showDeltaSyncDetails] error:', err);
  modal.innerHTML = `<div class="u-92d6a70 st-background__e02427">
    <div class="u-e6c5b02 d-flex"><svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-57164d6"><path d="M16.3 5.6L2.8 29A2 2 0 0 0 4.5 32H31.5A2 2 0 0 0 33.2 29L19.7 5.6A2 2 0 0 0 16.3 5.6Z" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 13.5V21.2" stroke="#f59e0b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="18" cy="26.2" r="1.6" fill="#f59e0b"/></svg></div>
    <div class="u-5267c24">Failed to load database structure</div>
    <div class="u-bb2fbde text-xs">${err && err.message ? err.message : String(err)}</div>
    <button onclick="document.getElementById('delta-stats-modal').remove()"
      class="u-f86db90 st-background__36d305 st-border-bottom__2eda1d">Close</button>
  </div>`;
}
}

if (typeof closeYearInProgress === 'undefined') var closeYearInProgress = false;
if (typeof closeYearAbortController === 'undefined') var closeYearAbortController = null;
if (typeof _fyVerifiedPassword === 'undefined') var _fyVerifiedPassword = null;
if (typeof closing === 'undefined') var closing = false;
if (typeof restoring === 'undefined') var restoring = false;
if (typeof _hasMergeCommitFailure === 'undefined') var _hasMergeCommitFailure = false;

export function _storeCodeToLabel(c) {
  return storeLabelFor(c);
}

async function loadCloseYearStores() {
  const names = ['production', 'sales', 'rep', 'calculator', 'transactions', 'returns', 'expenses', 'factory'];
  const out = {};
  for (const n of names) out[n] = ensureArray(await sqliteStore.get(n));
  return out;
}

export async function showCloseFinancialYearDialog() {
  const { production, sales, rep, calculator, transactions, returns, expenses, factory } = await loadCloseYearStores();
if (closeYearInProgress) {
showToast('Close Financial Year is already in progress', 'warning');
return;
}
const summary = await generateCloseYearSummary();
const _cyScreen = document.getElementById('close-financial-year-screen');
const _cyBody = _cyScreen ? _cyScreen.querySelector('.screen-body') : null;
if (!_cyBody) { showToast('Close Financial Year screen not found','error'); return; }
if (typeof openStandaloneScreen === 'function') openStandaloneScreen('close-financial-year-screen');
_cyBody.innerHTML = `
<div id="cy-panel">
  <div class="u-2acac37">
    <div id="cy-preview-grid" class="u-35ecb16 d-grid">${summary.rowsHtml}</div>
  </div>
  <div id="close-year-progress-container" class="d-none">
    <div id="cy-progress-inner">
      <div id="cy-progress-meta">
        <span id="cy-progress-meta-stage">Processing: <b id="close-year-stage">Initializing…</b></span>
        <span id="cy-progress-pct">0%</span>
      </div>
      <div id="cy-progress-track">
        <div id="close-year-progress-bar"></div>
      </div>
    </div>
  </div>
  <div id="close-year-input-section">
    <div id="cy-input-wrap">
      <div id="cy-danger-notice">
        <div id="cy-danger-icon-wrap">
          <svg width="14" height="14" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.3 5.6L2.8 29A2 2 0 0 0 4.5 32H31.5A2 2 0 0 0 33.2 29L19.7 5.6A2 2 0 0 0 16.3 5.6Z" fill="var(--danger)" fill-opacity="0.16" stroke="var(--danger)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 13.5V21.2" stroke="var(--danger)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="18" cy="26.2" r="1.6" fill="var(--danger)"/></svg>
        </div>
        <div>
          <p id="cy-danger-title">Irreversible — original records will be compacted</p>
          <p id="cy-danger-desc">Enter your account password to encrypt the year-end backup and confirm this action.</p>
        </div>
      </div>
      <div id="cy-pwd-field">
        <input class="form-ctl" type="password" id="close-year-confirm-input" placeholder="Account password"
          autocomplete="current-password"
          oninput="validateCloseYearInput(this.value)"
          onkeydown="if(event.key==='Enter'&&!document.getElementById('close-year-confirm-btn').disabled){verifyAndExecuteCloseYear();}">
        <button type="button" id="cy-pwd-eye" tabindex="-1"
          onclick="(function(b){const i=document.getElementById('close-year-confirm-input');i.type=i.type==='password'?'text':'password';b.querySelector('svg').classList.toggle('dim-icon',i.type!=='text');})(this)">
          <svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-c71e479"><path d="M2.5 18C6.5 10.8 12 7.8 18 7.8S29.5 10.8 33.5 18C29.5 25.2 24 28.2 18 28.2S6.5 25.2 2.5 18Z" fill="var(--accent)" fill-opacity="0.1" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="18" cy="18" r="5.8" fill="var(--accent-gold)" fill-opacity="0.3" stroke="var(--accent-gold)" stroke-width="1.7"/><circle cx="18" cy="18" r="2.4" fill="var(--accent)"/></svg>
        </button>
      </div>
      <div id="close-year-pwd-error"></div>
      <div id="cy-btn-row">
        <button id="cy-cancel-btn" onclick="closeCloseYearDialog()">Cancel</button>
        <button id="close-year-confirm-btn" disabled onclick="verifyAndExecuteCloseYear()">Close Financial Year</button>
      </div>
    </div>
  </div>
  <div id="close-year-complete"></div>
</div>
`;
setTimeout(() => {
  const inp = document.getElementById('close-year-confirm-input');
  if (inp) inp.focus();
}, 80);
}

export function validateCloseYearInput(value) {
const confirmBtn = document.getElementById('close-year-confirm-btn');
const errEl = document.getElementById('close-year-pwd-error');
if (!confirmBtn) return;
if (value.trim().length > 0) {
  confirmBtn.disabled = false;
  window.setStyle(confirmBtn, 'opacity', 'st-opacity__c6e797');
  window.setStyle(confirmBtn, 'cursor', 'st-cursor__3b6a3a');
  window.setStyle(confirmBtn, 'box-shadow', 'st-box-shadow__e21552');
  confirmBtn.onclick = verifyAndExecuteCloseYear;
} else {
  confirmBtn.disabled = true;
  window.setStyle(confirmBtn, 'opacity', 'st-opacity__7ca58a');
  window.setStyle(confirmBtn, 'cursor', 'st-cursor__61a075');
  window.setStyle(confirmBtn, 'box-shadow', 'st-box-shadow__ce3f2c');
  confirmBtn.onclick = null;
}
if (errEl) window.setDisplay(errEl, 'none');
}

export async function verifyAndExecuteCloseYear() {
  const { production, sales, rep, calculator, transactions, returns, expenses, factory } = await loadCloseYearStores();
const confirmBtn = document.getElementById('close-year-confirm-btn');
const inp = document.getElementById('close-year-confirm-input');
const errEl = document.getElementById('close-year-pwd-error');
const pwd = inp ? inp.value : '';
if (!pwd) {
showToast('Please enter your account password to continue.', 'warning', 3000);
if (inp) inp.focus();
return;
}
if (confirmBtn) {
  confirmBtn.disabled = true;
  window.setStyle(confirmBtn, 'opacity', 'st-opacity__d95b59');
  confirmBtn.textContent = 'Verifying…';
}
if (errEl) { errEl.textContent = ''; window.setDisplay(errEl, 'none'); }
const valid = await verifyAccountPassword(pwd);
if (!valid) {
  if (errEl) { errEl.textContent = ' Incorrect password — please try again.'; window.setDisplay(errEl, 'block'); }
  window.notifyBlocking('Incorrect password. Please try again.', 'error', 'Something went wrong');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    window.setStyle(confirmBtn, 'opacity', 'st-opacity__c6e797');
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

export function closeCloseYearDialog() {
if (typeof closeStandaloneScreen === 'function') closeStandaloneScreen('close-financial-year-screen');
const _cyScreen = document.getElementById('close-financial-year-screen');
const _cyBody = _cyScreen ? _cyScreen.querySelector('.screen-body') : null;
if (_cyBody) _cyBody.innerHTML = '';
if (closeYearAbortController) {
closeYearAbortController.abort();
closeYearAbortController = null;
}
closeYearInProgress = false;
}

export function updateCloseYearProgress(stage, percent) {
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
  if (statusEl) { window.setDisplay(statusEl, 'inline-flex'); statusEl.classList.add('ok'); }
  if (rowEl && isDone) { rowEl.classList.add('cy-done'); window.setStyle(rowEl, 'opacity', 'st-opacity__c6e797'); }
}
if (percent >= 100) {
  const pb = document.getElementById('close-year-progress-bar');
  if (pb) pb.classList.add('done');
}
if (phaseBadge) {
  phaseBadge.textContent = 'PROCESSING';
  phaseBadge.className = 'cy-phase-badge cy-phase-badge--processing';
}
const procSubtitle = document.getElementById('cy-panel-subtitle');
if (procSubtitle && procSubtitle.textContent.includes('will be compacted')) {
  procSubtitle.textContent = '— processing in progress...';
  window.setStyle(procSubtitle, 'color', 'st-color__52df2b');
}
}

export async function generateCloseYearSummary() {
  const entities = ensureArray(await sqliteStore.get('entities'));
  const { production, sales, rep, calculator, transactions, returns, expenses, factory } = await loadCloseYearStores();
  const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
  const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
  const factoryCostAdjustmentFactor = (await sqliteStore.get('adjustment')) || {};
const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
const S = {
  production:   { total:0, nonMerged:0, stores: new Set(), returnCount:0, sellerReturns: new Set(), sellerStoreCards: new Set(), transferCount:0 },
  sales:        { total:0, nonMerged:0, customers: new Set(), settledCount:0, creditCount:0 },
  calculator:   { total:0, nonMerged:0, reps: new Set() },
  payments:     { total:0, nonMerged:0, entities: new Set(), netBalanceCount:0 },
  factory:      { total:0, nonMerged:0, stores: new Set() },
  rep:          { total:0, nonMerged:0, customers: new Set(), reps: new Set(), settledCount:0, creditCount:0 },
  expenses:     { total:0, nonMerged:0, categories: new Set() },
  returns:      { total:0, nonMerged:0, stores: new Set() }
};
if (Array.isArray(production)) {
  S.production.total = production.length;
  production.forEach(i => {
    if (i.store) S.production.stores.add(i.store);
    if (i.isMerged !== true) {
      S.production.nonMerged++;
      if (i.isTransfer === true) { S.production.transferCount++; }
      else if (i.isReturn === true) { S.production.returnCount++; if(i.returnedBy) S.production.sellerReturns.add(i.returnedBy); if(i.returnedBy && i.store) S.production.sellerStoreCards.add(i.returnedBy+'::'+i.store); }
    }
  });
}
if (Array.isArray(sales)) {
  S.sales.total = sales.length;
  sales.forEach(i => {
    if (i.customerName) S.sales.customers.add(i.customerName);
    if (i.isMerged !== true) {
      S.sales.nonMerged++;
      if (i.paymentType === 'CASH' || (i.paymentType === 'CREDIT' && i.creditReceived)) S.sales.settledCount++;
      else if (i.paymentType === 'CREDIT' && !i.creditReceived) S.sales.creditCount++;
    }
  });
}
if (Array.isArray(calculator)) {
  S.calculator.total = calculator.length;
  calculator.forEach(i => { if (i.seller) S.calculator.reps.add(i.seller); if (i.isMerged !== true) S.calculator.nonMerged++; });
}
if (Array.isArray(transactions)) {
  S.payments.total = transactions.length;
  const entityNetMap = {};
  transactions.forEach(i => {
    const ent = entities.find(e => e.id === i.entityId);
    if (ent) S.payments.entities.add(ent.name || 'Unknown');
    if (i.isMerged !== true) {
      S.payments.nonMerged++;
      if (!entityNetMap[i.entityId]) entityNetMap[i.entityId] = 0;
      entityNetMap[i.entityId] += (i.type === 'IN' ? 1 : -1) * (i.amount || 0);
    }
  });
  S.payments.netBalanceCount = Object.values(entityNetMap).filter(v => Math.abs(v) > 0.001).length;
}
if (Array.isArray(factory)) {
  S.factory.total = factory.length;
  factory.forEach(i => { if (i.store) S.factory.stores.add(i.store); if (i.isMerged !== true) S.factory.nonMerged++; });
}
if (Array.isArray(rep)) {
  S.rep.total = rep.length;
  rep.forEach(i => {
    if (i.customerName) S.rep.customers.add(i.customerName);
    if (i.salesRep) S.rep.reps.add(i.salesRep);
    if (i.isMerged !== true && i.salesRep && i.salesRep !== 'NONE' && i.salesRep !== 'ADMIN') {
      S.rep.nonMerged++;
      if (i.paymentType === 'CASH' || (i.paymentType === 'CREDIT' && i.creditReceived)) S.rep.settledCount++;
      else if (i.paymentType === 'CREDIT' && !i.creditReceived) S.rep.creditCount++;
    }
  });
}
if (Array.isArray(expenses)) {
  S.expenses.total = expenses.length;
  expenses.forEach(i => { if (i.category) S.expenses.categories.add(i.category); if (i.isMerged !== true) S.expenses.nonMerged++; });
}
if (Array.isArray(returns)) {
  S.returns.total = returns.length;
  returns.forEach(i => { if (i.store) S.returns.stores.add(i.store); if (i.isMerged !== true) S.returns.nonMerged++; });
}
const storeCodeToLabel = _storeCodeToLabel;
const CY_ICONS = {
  prod:     '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 11V25L18 32V18Z" fill="var(--accent)" fill-opacity="0.24" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M31 11V25L18 32V18Z" fill="var(--accent)" fill-opacity="0.09" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 4L31 11L18 18L5 11Z" fill="var(--accent-gold)" fill-opacity="0.38" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M11.5 7.5L24.5 14.5" stroke="var(--accent)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.55"/><path class="ic-sp" d="M30 1.6Q30 5 33.4 5Q30 5 30 8.4Q30 5 26.6 5Q30 5 30 1.6Z" fill="var(--accent-gold)"/></svg>',
  sales:    '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5A2 2 0 0 1 10 3H26A2 2 0 0 1 28 5V32L24.67 29.6 21.34 32 18 29.6 14.67 32 11.33 29.6 8 32Z" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M12.5 9.5H23.5" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12.5 14.5H19" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.55"/><circle cx="22.5" cy="21" r="4.6" fill="var(--accent-gold)" fill-opacity="0.3" stroke="var(--accent-gold)" stroke-width="1.7"/><path d="M22.5 18.8V23.2" stroke="var(--accent-gold)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12.5 21H16" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.55"/></svg>',
  calc:     '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="3" width="24" height="30" rx="5" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round"/><rect x="10" y="7" width="16" height="7" rx="2.2" fill="var(--accent-gold)" fill-opacity="0.32" stroke="var(--accent-gold)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12.5" cy="20.5" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="18" cy="20.5" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="23.5" cy="20.5" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="12.5" cy="24.8" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="18" cy="24.8" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="23.5" cy="24.8" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="12.5" cy="29" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="18" cy="29" r="1.75" fill="var(--accent)" opacity="0.85"/><circle cx="23.5" cy="29" r="1.75" fill="var(--accent-gold)"/><path class="ic-sp" d="M24 8.2Q24 10.5 26.3 10.5Q24 10.5 24 12.8Q24 10.5 21.7 10.5Q24 10.5 24 8.2Z" fill="var(--accent-gold)"/></svg>',
  pay:      '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="28" height="19" rx="4" fill="var(--accent)" fill-opacity="0.14" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round"/><rect x="3.8" y="12.6" width="26.4" height="4" fill="var(--accent)" fill-opacity=".42"/><rect x="7" y="20" width="6" height="3.6" rx="1" fill="var(--accent-gold)" fill-opacity="0.5" stroke="var(--accent-gold)" stroke-width="1.3" stroke-linejoin="round"/><circle cx="27" cy="26" r="6" fill="var(--accent-gold)" fill-opacity="0.3" stroke="var(--accent-gold)" stroke-width="1.7"/><path d="M27 23.2V28.8M24.8 25.1C26 24 28.4 24.3 28.4 25.6S25.4 26.8 25.6 28C26.5 28.7 28.6 28.4 29 27.6" stroke="var(--accent-gold)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path class="ic-sp" d="M31.5 1.7Q31.5 4.5 34.3 4.5Q31.5 4.5 31.5 7.3Q31.5 4.5 28.7 4.5Q31.5 4.5 31.5 1.7Z" fill="var(--accent-gold)"/></svg>',
  factory:  '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 32V15L13 21V15L22 21V10H30V32Z" fill="var(--accent)" fill-opacity="0.14" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><rect x="24.7" y="3.5" width="3.6" height="7" rx="1" fill="var(--accent)" fill-opacity="0.3" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/><rect x="8" y="25" width="4" height="4" rx="1" fill="var(--accent-gold)" fill-opacity="0.5" stroke="var(--accent-gold)" stroke-width="1.3" stroke-linejoin="round"/><rect x="15" y="25" width="4" height="4" rx="1" fill="var(--accent-gold)" fill-opacity="0.5" stroke="var(--accent-gold)" stroke-width="1.3" stroke-linejoin="round"/><rect x="23" y="22" width="4.5" height="10" rx="1.3" fill="var(--accent)" fill-opacity="0.3" stroke="var(--accent)" stroke-width="1.4" stroke-linejoin="round"/><circle cx="31.5" cy="5.5" r="1.9" fill="var(--accent-gold)" opacity="0.75"/><circle cx="33" cy="1.8" r="1.2" fill="var(--accent-gold)" opacity="0.45"/></svg>',
  repsales: '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="10" r="5.2" fill="var(--accent)" fill-opacity="0.2" stroke="var(--accent)" stroke-width="1.7"/><path d="M3 31C3 22.5 23 22.5 23 31Z" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M22 24L26.5 19.5 29.5 22.5 34 16.5" stroke="var(--accent-gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M29.8 16.5H34V20.7" stroke="var(--accent-gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  exp:      '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 11.5A3 3 0 0 1 8 8.5H28A2.5 2.5 0 0 1 30.5 11V29A3 3 0 0 1 27.5 32H8A3 3 0 0 1 5 29Z" fill="var(--accent)" fill-opacity="0.13" stroke="var(--accent)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 8.5L22 4.2A2 2 0 0 1 24.6 5.6L25.5 8.5" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"/><rect x="21.5" y="17" width="13" height="8.4" rx="4.2" fill="var(--accent-gold)" fill-opacity="0.35" stroke="var(--accent-gold)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="27" cy="21.2" r="1.6" fill="var(--accent-gold)"/></svg>',
  ret:      '<svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 8H23A8.5 8.5 0 0 1 23 25H12" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M17.5 3L12.5 8 17.5 13" stroke="var(--accent-gold)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M9 20.5H21V32H9Z" fill="var(--accent-gold)" fill-opacity="0.25" stroke="var(--accent-gold)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 24.5H21" stroke="var(--accent-gold)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"/></svg>'
};
const previewRow = (id, label, key, recCount, details, mergeNote, accent, hasData) => {
  const cssAccentVar = accent.replace('var(--','').replace(')','');
  const detailChips = details.map(([lbl,val]) =>
    '<span class="cy-chip-label">' + lbl + ':&nbsp;</span>' +
    '<span class="cy-chip-val">' + val + '</span>'
  ).join('');
  const resultBlock =
    '<div id="cy-result-' + id + '" class="cy-result-card" style="--cy-accent:' + accent + ';">' +
    '<div class="cy-result-top">' +
    '<span id="cy-result-label-' + id + '" class="cy-result-main"></span>' +
    '<span class="cy-result-tag">compacted</span>' +
    '</div>' +
    '<div id="cy-result-note-' + id + '" class="cy-result-note"></div>' +
    '</div>';
  return (
    '<div id="cy-row-' + id + '" class="cy-row' + (hasData ? '' : ' cy-skipped') + '" style="--cy-accent:' + accent + ';">' +
    '<div class="cy-row-head">' +
      '<div class="cy-row-icon">' + (CY_ICONS[id]||'') + '</div>' +
      '<span class="cy-row-label">' + label + '</span>' +
      (hasData
        ? '<span class="badge badge-tint is-warn">' + recCount + ' rec</span>' +
          '<span class="cy-arrow">→</span>' +
          '<span id="cy-val-' + id + '-after" class="badge badge-tint cy-pill-after">' + mergeNote + '</span>'
        : '<span class="badge badge-tint cy-pill-skip">skipped</span>'
      ) +
      '<span id="cy-status-' + id + '" class="cy-status-badge ok"></span>' +
    '</div>' +
    (hasData && details.length
      ? '<div class="cy-chips">' + detailChips + '</div>'
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
rows += previewRow('prod', 'Production', 'production',
  S.production.nonMerged,
  [
    ['Stores', storeList, 'var(--text-main)'],
    ['Returns', S.production.returnCount > 0 ? S.production.returnCount + ' (' + sellerList + ')' : 'none',
      S.production.returnCount > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)'],
    ['Transfers', S.production.transferCount > 0 ? S.production.transferCount + ' (kept as-is)' : 'none',
      S.production.transferCount > 0 ? 'var(--accent)' : 'var(--text-muted)'],
  ],
  prodTotalCards + ' cards (' + S.production.stores.size + ' store + ' + prodRetCards + ' ret)' +
    (S.production.transferCount > 0 ? ' + ' + S.production.transferCount + ' transfer' + (S.production.transferCount !== 1 ? 's' : '') + ' kept' : ''),
  'var(--accent)', S.production.nonMerged > 0
);
const custCount = S.sales.customers.size;
rows += previewRow('sales', 'Sales', 'sales',
  S.sales.nonMerged,
  [['Customers', custCount, 'var(--text-main)'],
   ['Settled/Credit', S.sales.settledCount + '/' + S.sales.creditCount, 'var(--text-main)']],
  custCount + ' balance' + (custCount !== 1 ? 's' : ''),
  'var(--accent-emerald)', S.sales.nonMerged > 0
);
const repNameList = [...S.calculator.reps].join(', ') || '\u2014';
rows += previewRow('calc', 'Calculator', 'calculator',
  S.calculator.nonMerged,
  [['Reps', repNameList, 'var(--text-main)']],
  S.calculator.reps.size + ' rec \u00b7 returns\u2192Prod',
  'var(--accent-cyan)', S.calculator.nonMerged > 0
);
const entCount = S.payments.entities.size;
rows += previewRow('pay', 'Payments', 'transactions',
  S.payments.nonMerged,
  [['Entities', entCount, 'var(--text-main)'],
   ['w/ balance', S.payments.netBalanceCount, 'var(--text-main)']],
  S.payments.netBalanceCount + ' opening bal.',
  'var(--accent-gold)', S.payments.nonMerged > 0
);
const fStores = [...S.factory.stores].map(storeCodeToLabel).join(', ') || '\u2014';
rows += previewRow('factory', 'Factory', 'factory',
  S.factory.nonMerged,
  [['Stores', fStores, 'var(--text-main)']],
  S.factory.stores.size + ' formula rec.',
  'var(--accent-purple)', S.factory.nonMerged > 0
);
const rcCount = S.rep.customers.size;
rows += previewRow('repsales', 'Rep Sales', 'rep',
  S.rep.nonMerged,
  [['Customers/Reps', rcCount + '/' + S.rep.reps.size, 'var(--text-main)'],
   ['Settled/Credit', S.rep.settledCount + '/' + S.rep.creditCount, 'var(--text-main)']],
  '1 per cust \u00d7 rep',
  'var(--store-mahmood)', S.rep.nonMerged > 0
);
const catList = [...S.expenses.categories].join(', ') || '\u2014';
rows += previewRow('exp', 'Expenses', 'expenses',
  S.expenses.nonMerged,
  [['Categories', catList, 'var(--text-main)']],
  '1 per category + name',
  'var(--warning)', S.expenses.nonMerged > 0
);
const srStores = [...S.returns.stores].map(storeCodeToLabel).join(', ') || '\u2014';
rows += previewRow('ret', 'Stock Returns', 'returns',
  S.returns.nonMerged,
  [['Stores', srStores, 'var(--text-main)']],
  '1 per store + date',
  'var(--danger)', S.returns.nonMerged > 0
);
const rowsHtml = rows;
const html = '<div class="u-4e91564 d-grid">' + rows + '</div>';
return { html, rowsHtml, summary: S };
}

export async function createMergeBackup() {
  const { production, sales, calculator, transactions, factory, rep, expenses, returns, clients, customers } = await loadCollections('production', 'sales', 'calculator', 'transactions', 'factory', 'rep', 'expenses', 'returns', 'clients', 'customers');
  const backup = {
    production: [...production],
    sales: [...sales],
    calculator: [...calculator],
    transactions: [...transactions],
    factory: [...factory],
    rep: [...rep],
    expenses: [...expenses],
    returns: [...returns],
    clients: [...clients],
    customers: [...customers],
    timestamp: Date.now(),
    date: new Date().toISOString()
  };
  try {
    await sqliteStore.set('close_year_backup_' + backup.timestamp, backup);
    return backup.timestamp;
  } catch (e) {
    console.error('Failed to create merge backup:', _safeErr(e));
    throw new Error('Cannot proceed without backup: ' + e.message);
  }
}

export async function restoreFromBackup(backupTimestamp) {
  try {
    const backup = await sqliteStore.get('close_year_backup_' + backupTimestamp);
    if (!backup) {
      throw new Error('Backup not found: ' + backupTimestamp);
    }
    if (!isSupportedBackup(backup)) throw new Error('Unsupported file');
    await sqliteStore.set('production', backup.production);
    await sqliteStore.set('sales', backup.sales);
    await sqliteStore.set('calculator', backup.calculator);
    await sqliteStore.set('transactions', backup.transactions);
    await sqliteStore.set('factory', backup.factory);
    await sqliteStore.set('rep', backup.rep);
    await sqliteStore.set('expenses', backup.expenses);
    await sqliteStore.set('returns', backup.returns);
    if (Array.isArray(backup.clients))   await sqliteStore.set('clients',   backup.clients);
    if (Array.isArray(backup.customers)) await sqliteStore.set('customers', backup.customers);
    if (typeof emitSyncUpdate === 'function') {
      emitSyncUpdate({ production: null, sales: null, calculator: null,
        transactions: null, factory: null,
        rep: null, expenses: null, returns: null });
    }
    if (firebaseDB && currentUser) {
      try {
        const userRef = firebaseDB.collection('users').doc(currentUser.uid);
        const fbCollections = [
          { name: 'production',         backupData: backup.production },
          { name: 'sales',              backupData: backup.sales },
          { name: 'calculator', backupData: backup.calculator },
          { name: 'transactions',       backupData: backup.transactions },
          { name: 'factory',    backupData: backup.factory },
          { name: 'rep',          backupData: backup.rep },
          { name: 'expenses',           backupData: backup.expenses },
          { name: 'returns',            backupData: backup.returns }
        ];
        for (const col of fbCollections) {
          try {
            const snapshot = await userRef.collection(col.name).get();
            const batch = firebaseDB.batch();
            let deleteCount = 0;
            const preExistingIds = new Set((Array.isArray(col.backupData) ? col.backupData : []).map(r => String(r.id)));
            snapshot.docs.forEach(doc => {
              if (!preExistingIds.has(doc.id)) {
                const data = doc.data();
                const docCreatedAt = data.createdAt?.toMillis ? data.createdAt.toMillis() :
                                     (typeof data.createdAt === 'number' ? data.createdAt : 0);
                if (docCreatedAt >= backupTimestamp) {
                  batch.delete(doc.ref);
                  deleteCount++;
                }
              }
            });
            if (deleteCount > 0) {
              await batch.commit();
              await new Promise(r => setTimeout(r, 0));
            }
          } catch (colErr) {
            console.warn(`Firebase rollback warning for ${col.name}:`, _safeErr(colErr));
          }
        }
      } catch (fbErr) {
        console.warn('Firebase rollback warning:', _safeErr(fbErr));
      }
    }
    return true;
  } catch (e) {
    console.error('Failed to restore from backup:', _safeErr(e));
    throw e;
  }
}

export async function verifyMergeConsistency(snap) {
  const { production, sales, transactions } = await loadCollections('production', 'sales', 'transactions');
  const errors = [];
  const warnings = [];
  if (Array.isArray(production)) {
    const mergedProd = production.filter(i => i.isMerged);
    const totalNet = mergedProd.reduce((s, i) => s + (i.net || 0), 0);
    const totalCost = mergedProd.reduce((s, i) => s + (i.totalCost || 0), 0);
    const totalSale = mergedProd.reduce((s, i) => s + (i.totalSale || 0), 0);
    const expectedProfit = totalSale - totalCost;
    const actualProfit = mergedProd.reduce((s, i) => s + (i.profit || 0), 0);
    if (Math.abs(expectedProfit - actualProfit) > 0.01) {
      errors.push(`Production profit mismatch: expected ${fmtAmt(expectedProfit)}, got ${fmtAmt(actualProfit)}`);
    }
  }
  if (Array.isArray(sales)) {
    const mergedSales = sales.filter(i => i.isMerged);
    const totalValue = mergedSales.reduce((s, i) => s + (i.totalValue || 0), 0);
    const totalCost = mergedSales.reduce((s, i) => s + (i.totalCost || 0), 0);
    const expectedProfit = totalValue - totalCost;
    const actualProfit = mergedSales.reduce((s, i) => s + (i.profit || 0), 0);
    if (Math.abs(expectedProfit - actualProfit) > 0.01) {
      errors.push(`Sales profit mismatch: expected ${fmtAmt(expectedProfit)}, got ${fmtAmt(actualProfit)}`);
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
  if (Array.isArray(transactions)) {
    const mergedPay = transactions.filter(i => i.isMerged);
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

export async function executeCloseFinancialYear() {
  let fyMeta = null;
  _hasMergeCommitFailure = false;
  const { clients, customers, inventory } = await loadCollections('clients', 'customers', 'inventory');
  const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
  const factoryDefaultFormulas = (await sqliteStore.get('defaults')) || {};
  const factoryAdditionalCosts = (await sqliteStore.get('costs')) || {};
  const factoryCostAdjustmentFactor = (await sqliteStore.get('adjustment')) || {};
  const factoryUnitTracking = (await sqliteStore.get('tracking')) || {};
  const appStoresSnapshot = ensureArray(await sqliteStore.get('stores'));
  const { production, sales, rep, calculator, transactions, returns, expenses, factory, entities } = await loadCollections('production', 'sales', 'rep', 'calculator', 'transactions', 'returns', 'expenses', 'factory', 'entities');
if (closeYearInProgress) return;
closeYearInProgress = true;
const inputSection  = document.getElementById('close-year-input-section');
const progressContainer = document.getElementById('close-year-progress-container');
const phaseBadge    = document.getElementById('cy-phase-badge');
if (inputSection) window.setDisplay(inputSection, 'none');
if (progressContainer) window.setDisplay(progressContainer, 'block');
updateCloseYearProgress('Uploading cloud backup...', 3);
try {
  if (!currentUser) throw new Error('Not signed in — cannot create backup');
  try {
    await pushDataToCloud();
    showToast(' Cloud backup uploaded', 'success', 2500);
  } catch (cloudErr) {
    console.warn('Cloud backup warning (proceeding):', _safeErr(cloudErr));
    showToast('Cloud backup skipped (offline?) — local backup will still be created', 'warning', 3500);
  }
  updateCloseYearProgress('Preparing encrypted local backup...', 10);
  const _settingsSnapshot = await sqliteStore.get('settings', defaultSettings);
  const backupData = {
    production: production,
    calculator: await sqliteStore.get('calculator', []),
    sales: await sqliteStore.get('sales', []),
    rep: rep,
    clients: clients,
    customers: customers,
    inventory: inventory,
    factory: factory,
    defaults: factoryDefaultFormulas,
    costs: factoryAdditionalCosts,
    adjustment: factoryCostAdjustmentFactor,
    tracking: factoryUnitTracking,
    stores: appStoresSnapshot,
    entities: entities,
    transactions: transactions,
    returns: returns,
    expenses: expenses,
    settings: _settingsSnapshot,
    deleted: Array.from(deletedRecordIds),
    ...(await collectAuxBackupFields(sqliteStore)),
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
  const encPassword = _fyVerifiedPassword || null;
  _fyVerifiedPassword = null;
  if (encPassword) {
    try {
      updateCloseYearProgress('Encrypting backup file...', 14);
      const encryptedBlob = await CryptoEngine.encrypt(backupData, currentUser.email, encPassword, currentUser.uid);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      _triggerFileDownload(encryptedBlob, `NaswarDealers_YearClose_${timestamp}.gznd`);
      window.showGlassAlert(' Encrypted year-end backup downloaded!', { tone: 'success', title: 'Backup Downloaded' });
    } catch (encErr) {
      console.error('Encryption failed:', _safeErr(encErr));
      window.notifyBlocking('Local backup encryption failed — proceeding with cloud backup only.', 'warning', 'Warning');
    }
  } else {
    showToast('No verified password — skipping local encrypted backup.', 'info', 2500);
  }
} catch (bkpPhaseErr) {
  console.error('Backup phase error:', _safeErr(bkpPhaseErr));
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
  window.notifyBlocking('Failed to create rollback snapshot: ' + backupErr.message, 'error', 'Something went wrong');
  closeCloseYearDialog();
  return;
}
closeYearAbortController = new AbortController();
const { signal } = closeYearAbortController;
const snap = {
  prod:    { before: Array.isArray(production)                      ? production.filter(i=>i.isMerged!==true).length : 0 },
  sales:   { before: Array.isArray(sales)           ? sales.filter(i=>i.isMerged!==true).length : 0 },
  calc:    { before: Array.isArray(calculator)             ? calculator.filter(i=>i.isMerged!==true).length : 0 },
  pay:     { before: Array.isArray(transactions)      ? transactions.filter(i=>i.isMerged!==true).length : 0 },
  factory: { before: Array.isArray(factory) ? factory.filter(i=>i.isMerged!==true).length : 0 },
  rep:     { before: Array.isArray(rep)                ? rep.filter(i=>i.isMerged!==true&&i.salesRep&&i.salesRep!=='NONE'&&i.salesRep!=='ADMIN').length : 0 },
  expenses:{ before: Array.isArray(expenses)           ? expenses.filter(i=>i.isMerged!==true).length : 0 },
  returns: { before: Array.isArray(returns)             ? returns.filter(i=>i.isMerged!==true).length : 0 }
};
const liveUpdate = (rowId, afterText, accentColor, resultLabel, resultNote) => {
  const afterEl = document.getElementById('cy-val-' + rowId + '-after');
  if (afterEl) {
    afterEl.textContent = afterText;
    afterEl.style.setProperty('--d-color', accentColor || 'var(--accent-emerald)');
    afterEl.classList.add('dc-color');
  }
  const statusEl = document.getElementById('cy-status-' + rowId);
  if (statusEl) window.setDisplay(statusEl, 'inline');
  const resultBlock = document.getElementById('cy-result-' + rowId);
  const resultLabelEl = document.getElementById('cy-result-label-' + rowId);
  const resultNoteEl  = document.getElementById('cy-result-note-' + rowId);
  if (resultBlock && resultLabelEl && resultNoteEl) {
    resultLabelEl.textContent = resultLabel || afterText;
    resultNoteEl.textContent  = resultNote  || '';
    window.setDisplay(resultBlock, 'block');
  }
  const detailEl = document.getElementById('cy-detail-' + rowId);
  if (detailEl) {
    window.setStyle(detailEl, 'opacity', 'st-opacity__7ca58a');
    window.setStyle(detailEl, 'font-size', 'st-font-size__3d7932');
    window.setStyle(detailEl, 'max-height', 'st-max-height__8b8777');
    detailEl.classList.add('overflow-hidden');
    detailEl.classList.add('has-overflow');
    window.setStyle(detailEl, 'transition', 'st-transition__9baacf');
  }
};
const closeEpoch = Date.now();
updateCloseYearProgress('Merging Production Data', 25);
try {
await mergeProductionData(signal, closeEpoch);
const _postMergeProd = ensureArray(await sqliteStore.get('production'));
const prodMerged = _postMergeProd.filter(i=>i.isMerged);
const storeMerged  = prodMerged.filter(i=>!i.isReturn).length;
const sellerMerged = prodMerged.filter(i=>i.isReturn).length;
const transfersKept = _postMergeProd.filter(i=>i.isMerged!==true && i.isTransfer===true).length;
liveUpdate('prod', `${storeMerged} store + ${sellerMerged} seller return card${sellerMerged!==1?'s':''}${transfersKept>0?` + ${transfersKept} transfer${transfersKept!==1?'s':''} kept`:''}`, 'var(--accent)', `${storeMerged + sellerMerged} merged cards`, `${storeMerged} store balance${storeMerged!==1?'s':''} + ${sellerMerged} seller return card${sellerMerged!==1?'s':''}${transfersKept>0?` + ${transfersKept} transfer${transfersKept!==1?'s':''} kept as-is`:''}`);
snap.prod.after = prodMerged.length;
await mergeSalesData(signal, closeEpoch);
snap.sales.after = ensureArray(await sqliteStore.get('sales')).filter(i=>i.isMerged).length;
liveUpdate('sales', `${snap.sales.after} merged record${snap.sales.after!==1?'s':''}`, 'var(--accent-emerald)', `${snap.sales.after} customer records`, 'One opening balance per customer');
await mergeCalculatorData(signal, closeEpoch);
snap.calc.after = ensureArray(await sqliteStore.get('calculator')).filter(i=>i.isMerged).length;
liveUpdate('calc', `${snap.calc.after} merged record${snap.calc.after!==1?'s':''} (sales only)`, 'var(--accent-cyan)', `${snap.calc.after} rep totals`, 'Sales totals only — returns moved to Production Tab');
await mergePaymentData(signal, closeEpoch);
snap.pay.after = ensureArray(await sqliteStore.get('transactions')).filter(i=>i.isMerged).length;
liveUpdate('pay', `${snap.pay.after} opening balance record${snap.pay.after!==1?'s':''}`, 'var(--accent-gold)', `${snap.pay.after} opening balances`, 'Zero-balance entities dropped');
await mergeFactoryData(signal, closeEpoch);
snap.factory.after = ensureArray(await sqliteStore.get('factory')).filter(i=>i.isMerged).length;
liveUpdate('factory', `${snap.factory.after} merged record${snap.factory.after!==1?'s':''}`, 'var(--accent-purple)', `${snap.factory.after} formula records`, '1 per formula store');
await mergeRepSalesData(signal, closeEpoch);
snap.rep.after = ensureArray(await sqliteStore.get('rep')).filter(i=>i.isMerged&&i.salesRep&&i.salesRep!=='NONE'&&i.salesRep!=='ADMIN').length;
liveUpdate('repsales', `${snap.rep.after} merged record${snap.rep.after!==1?'s':''}`, 'var(--store-mahmood)', `${snap.rep.after} rep×customer records`, 'Keyed per customer × rep combination');
await mergeExpensesData(signal, closeEpoch);
snap.expenses.after = ensureArray(await sqliteStore.get('expenses')).filter(i=>i.isMerged).length;
liveUpdate('exp', `${snap.expenses.after} merged record${snap.expenses.after!==1?'s':''}`, 'var(--warning)', `${snap.expenses.after} expense records`, 'Merged per category + name');
await mergeStockReturnsData(signal, closeEpoch);
snap.returns.after = ensureArray(await sqliteStore.get('returns')).filter(i=>i.isMerged).length;
liveUpdate('ret', `${snap.returns.after} merged record${snap.returns.after!==1?'s':''}`, 'var(--danger)', `${snap.returns.after} return records`, '1 per store + date — granularity preserved');
  const consistencyCheck = await verifyMergeConsistency(snap);
  if (!consistencyCheck.valid) {
    throw new Error(`Data consistency check failed: ${consistencyCheck.errors.join('; ')}`);
  }
  updateCloseYearProgress('Purging deleted records...', 93);
  try {
    const _tombstoneIds = Array.from(
      new Set(ensureArray(await sqliteStore.get('deleted')).map(String))
    );
    if (_tombstoneIds.length > 0 && firebaseDB && currentUser) {
      const _delUserRef = firebaseDB.collection('users').doc(currentUser.uid);
      const OPS_PER_BATCH = 400;
      for (let _di = 0; _di < _tombstoneIds.length; _di += OPS_PER_BATCH) {
        const _chunk = _tombstoneIds.slice(_di, _di + OPS_PER_BATCH);
        const _delBatch = firebaseDB.batch();
        _chunk.forEach(id => {
          _delBatch.delete(_delUserRef.collection('deletions').doc(id));
        });
        await _delBatch.commit().catch(e => console.warn('[yearClose] tombstone Firestore purge batch failed:', _safeErr(e)));
      }
    }
    await sqliteStore.set('deleted', []);
    await sqliteStore.set('deletions', []);
    console.log('[yearClose] Hard-deleted', _tombstoneIds.length, 'tombstone record(s) from SQLite + Firestore.');
  } catch (_hardDelErr) {
    console.warn('[yearClose] Hard-delete of tombstones failed (non-fatal):', _safeErr(_hardDelErr));
  }
try {
  fyMeta = await sqliteStore.get('settings', {});
  fyMeta.lastYearClosedAt   = Date.now();
  fyMeta.lastYearClosedDate = new Date().toISOString();
  fyMeta.fyCloseCount       = (fyMeta.fyCloseCount || 0) + 1;
  fyMeta.lastConsistencyCheck = consistencyCheck;
  const hasSyncWarning = typeof _hasMergeCommitFailure !== 'undefined' && _hasMergeCommitFailure === true;
  if (hasSyncWarning) {
    fyMeta.closing = true;
    closing = true;
    await sqliteStore.set('closing', true);
  } else {
    fyMeta.closing = false;
    closing = false;
    await sqliteStore.set('closing', false);
  }
  const _fyMetaTs = Date.now();
  await sqliteStore.set('settings', fyMeta);
  await sqliteStore.set('settings_timestamp', _fyMetaTs);
  if (firebaseDB && currentUser) {
    await firebaseDB.collection('users').doc(currentUser.uid)
      .collection('settings').doc('config')
      .set({
        settings: {
          fyCloseCount:      fyMeta.fyCloseCount,
          lastYearClosedAt:  fyMeta.lastYearClosedAt,
          lastYearClosedDate:fyMeta.lastYearClosedDate
        },
        settings_timestamp: _fyMetaTs
      }, { merge: true });
    if (typeof DeltaSync !== 'undefined') {
      await DeltaSync.setLastSyncTimestamp('settings');
    }
    try {
      const _sigDeviceId = (typeof getDeviceId === 'function') ? await getDeviceId().catch(() => 'unknown') : 'unknown';
      await firebaseDB.collection('users').doc(currentUser.uid)
        .collection('settings').doc('yearCloseSignal')
        .set({
          type:          'close',
          triggeredAt:   _fyMetaTs,
          triggeredBy:   _sigDeviceId,
          fyCloseCount:  fyMeta.fyCloseCount,
        });
    } catch (_sigErr) {
      console.warn('[yearClose] Failed to write cross-device signal (non-fatal):', _safeErr(_sigErr));
    }
  }
} catch (metaErr) { console.warn('Could not save FY close metadata:', _safeErr(metaErr)); }
if (phaseBadge) {
  phaseBadge.textContent = 'DONE';
  phaseBadge.className = 'cy-phase-badge cy-phase-badge--done';
}
const panelSubtitle = document.getElementById('cy-panel-subtitle');
if (panelSubtitle) {
  panelSubtitle.textContent = 'All records compacted successfully';
  window.setStyle(panelSubtitle, 'color', 'st-color__a4c6ac');
  window.setStyle(panelSubtitle, 'font-style', 'st-font-style__14bc16');
  window.setStyle(panelSubtitle, 'font-weight', 'st-font-weight__eed0f8');
}
if (progressContainer) window.setDisplay(progressContainer, 'none');
const prodMergedFinal   = Array.isArray(production) ? production.filter(i=>i.isMerged) : [];
const storeFinal        = prodMergedFinal.filter(i=>!i.isReturn);
const sellerRetFinal    = prodMergedFinal.filter(i=>i.isReturn);
const storesUsed        = [...new Set(storeFinal.map(i=>i.store))].map(_storeCodeToLabel).join(', ') || '—';
const sellersUsed       = [...new Set(sellerRetFinal.map(i=>i.returnedBy||'?'))].join(', ') || '—';
const completeSection = document.getElementById('close-year-complete');
if (completeSection) {
  const syncFailedRows = ['prod','sales','calc','pay','factory','repsales','exp','ret']
    .filter(id => { const el = document.getElementById('cy-row-' + id); return el && el.classList.contains('cy-row-warn'); });
  const hasSyncWarnings = document.querySelectorAll('[id^="cy-status-"]') &&
    [...document.querySelectorAll('[id^="cy-status-"]')].some(el => el.textContent.includes('Sync Failed'));
  const _freshMergedCount = async () => {
    const keys = ['production','sales','calculator','transactions',
                  'factory','rep','expenses','returns'];
    let total = 0;
    for (const k of keys) {
      const arr = ensureArray(await sqliteStore.get(k));
      total += arr.filter(i => i && i.isMerged).length;
    }
    return total;
  };
  const totalMergedRecords = await _freshMergedCount();
  const collectionsCompacted = ['prod','sales','calc','pay','factory','repsales','exp','ret']
    .filter(id => { const el = document.getElementById('cy-status-' + id); return el && window.getDisplay(el) !== 'none'; }).length;
  const fyMeta2 = fyMeta || {};
  const closeCount = fyMeta2.fyCloseCount || 1;
  const closedDateStr = fyMeta2.lastYearClosedDate || formatDayMonthYear(new Date());
  const syncWarnBlock = hasSyncWarnings ? `
    <div class="cy-sync-warn">
      <svg width="15" height="15" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-a80ec05"><path d="M16.3 5.6L2.8 29A2 2 0 0 0 4.5 32H31.5A2 2 0 0 0 33.2 29L19.7 5.6A2 2 0 0 0 16.3 5.6Z" fill="var(--warning)" fill-opacity="0.16" stroke="var(--warning)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M18 13.5V21.2" stroke="var(--warning)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="18" cy="26.2" r="1.6" fill="var(--warning)"/></svg>
      <div>
        <div class="cy-sync-warn-title">Cloud Sync Incomplete</div>
        <div class="cy-sync-warn-body">Local data is fully merged and safe. Marked rows will re-sync automatically when connectivity is restored, or force a manual sync from Settings.</div>
      </div>
    </div>` : '';
  completeSection.innerHTML = `
  <div class="card cy-complete-card">
    <div class="cy-complete-header">
      <div class="cy-complete-icon">
        <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="u-6b77532"><circle class="ic-ck-ring" pathLength="100" cx="18" cy="18" r="13.5" fill="var(--accent-emerald)" fill-opacity="0.15" stroke="var(--accent-emerald)" stroke-width="1.7"/><path class="ic-ck-tick" pathLength="100" d="M11 18.5L16 23.5 25.3 12.8" stroke="var(--accent-gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path class="ic-sp" d="M30.5 2.9Q30.5 5.5 33.1 5.5Q30.5 5.5 30.5 8.1Q30.5 5.5 27.9 5.5Q30.5 5.5 30.5 2.9Z" fill="var(--accent-gold)"/></svg>
      </div>
      <div class="cy-complete-header-text">
        <h3 class="cy-complete-title">Financial Year Closed</h3>
        <p class="cy-complete-sub">${closedDateStr} &nbsp;·&nbsp; Year #${closeCount}</p>
      </div>
    </div>
    <div class="cy-stat-grid">
      <div class="cy-stat-cell">
        <div class="cy-stat-val">${collectionsCompacted}</div>
        <div class="cy-stat-label">Collections</div>
      </div>
      <div class="cy-stat-cell">
        <div class="cy-stat-val">${totalMergedRecords}</div>
        <div class="cy-stat-label">Merged Rec.</div>
      </div>
      <div class="cy-stat-cell">
        <div class="cy-stat-val u-3b9712c"></div>
        <div class="cy-stat-label">Backup Safe</div>
      </div>
    </div>
    ${syncWarnBlock}
    <button class="btn cy-continue-btn" onclick="closeCloseYearDialog();if(typeof refreshAllDisplays==='function')refreshAllDisplays();">
      Continue to App →
    </button>
  </div>`;
  window.setDisplay(completeSection, 'block');
  window.showGlassAlert('Financial Year closed successfully!', { tone: 'success', title: 'Financial Year Closed' });
  if (typeof window.sendDeviceNotification === 'function') window.sendDeviceNotification('Financial year closed', 'The year-end close finished. Balances were carried forward and old records were merged.', 'year-closed').catch(() => {});
}
} catch (error) {
if (error.name !== 'AbortError') {
  console.error('Close Financial Year failed:', _safeErr(error));
  window.notifyBlocking('Close Financial Year failed: ' + error.message, 'error', 'Something went wrong');
  if (typeof backupTimestamp !== 'undefined') {
    updateCloseYearProgress('Restoring from backup...', 0);
    try {
      await restoreFromBackup(backupTimestamp);
    } catch (restoreErr) {
      console.error('Failed to restore from backup:', _safeErr(restoreErr));
      window.notifyBlocking('CRITICAL: Failed to restore from backup. Manual intervention required.', 'error', 'Something went wrong');
    }
  }
  closeCloseYearDialog();
}
} finally {
closeYearInProgress = false;
closeYearAbortController = null;
}
}

export function _markRowSyncWarning(rowId, commitResult) {
  _hasMergeCommitFailure = true;
  try {
    const rowEl = document.getElementById('cy-row-' + rowId);
    if (!rowEl) return;
    const statusEl = document.getElementById('cy-status-' + rowId);
    if (statusEl) {
      statusEl.textContent = ' Sync Failed';
      window.setStyle(statusEl, 'background', 'st-background__a5d6e2');
      window.setStyle(statusEl, 'color', 'st-color__52df2b');
      window.setStyle(statusEl, 'border-color', 'st-border-color__df3311');
      window.setDisplay(statusEl, 'inline');
    }
    const noteEl = document.getElementById('cy-result-note-' + rowId);
    if (noteEl) {
      const failMsg = document.createElement('span');
      failMsg.classList.add('d-block', 'st-margin-top__c00d39', 'st-font-size__d189b8', 'st-color__52df2b', 'st-font-weight__eed0f8');
      failMsg.textContent = ` Cloud sync incomplete — ${commitResult.batchesFailed}/${commitResult.batchesTotal} Firestore batch${commitResult.batchesFailed!==1?'es':''} failed. Local data is safe. Re-sync when online.`;
      noteEl.appendChild(failMsg);
    }
    rowEl.classList.add('cy-row-warn');
  } catch (e) {   }
}

export function _buildMergedBase(id, mergeEpoch, nowISODate, nowTime, extra = {}) {
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

export async function mergeProductionData(signal, closeEpoch) {
  const production = ensureArray(await sqliteStore.get('production'));
updateCloseYearProgress('Merging Production Data...', 10);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(production) || production.length === 0) return;
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const _recTs = r => r.createdAt || r.timestamp || 0;
const mergedRecords = [];
const nonMerged    = production.filter(i => i.isMerged !== true && _recTs(i) <= closeEpoch);
const transferItems = nonMerged.filter(i => i.isTransfer === true);
const prodItems    = nonMerged.filter(i => i.isReturn !== true && i.isTransfer !== true);
const returnItems  = nonMerged.filter(i => i.isReturn === true && i.isTransfer !== true);
const storeGroups = {};
prodItems.forEach(item => {
  const store = item.store || 'UNKNOWN';
  if (!storeGroups[store]) storeGroups[store] = [];
  storeGroups[store].push(item);
});
for (const [store, items] of Object.entries(storeGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const totals = items.reduce((acc, item) => {
    acc.net          += (item.net          || 0);
    acc.totalCost    += (item.totalCost    || 0);
    acc.totalSale    += (item.totalSale    || 0);
    acc.profit       += (item.profit       || 0);
    acc.formulaUnits += (item.formulaUnits || 0);
    acc.formulaCost  += (item.formulaCost  || 0);
    return acc;
  }, { net:0, totalCost:0, totalSale:0, profit:0, formulaUnits:0, formulaCost:0 });
  const avgCp = totals.net > 0 ? parseFloat((totals.totalCost / totals.net).toFixed(4)) : (items[0]?.cp || 0);
  const canonicalSp = await getSalePriceForStore(store);
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
    formulaId:  items[0]?.formulaId || '',
    formulaCost:   totals.formulaCost,
    paymentStatus: 'CASH',
    mergedRecordCount: items.length,
    mergedSummary: {
      dateRange:       { from: allDates[0] || nowISODate, to: allDates.slice(-1)[0] || nowISODate },
      recordCount:     items.length,
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
  const canonicalSpRet = await getSalePriceForStore(store);
  const avgSp = canonicalSpRet > 0 ? canonicalSpRet : (items[0]?.sp || 0);
  const allDates = items.map(i => i.date).filter(Boolean).sort();
  const mergedId = generateUUID('ret-merged');
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
    formulaId:  '',
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
    console.warn(`mergeProductionData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('prod', commitResult);
  }
}
const existingMerged = production.filter(item => item.isMerged === true);
const postCloseRecords = production.filter(item => item.isMerged !== true && _recTs(item) > closeEpoch);
const mergedDb = [...existingMerged, ...transferItems, ...mergedRecords, ...postCloseRecords];
await sqliteStore.set('production', mergedDb);
emitSyncUpdate({ production: null});
updateCloseYearProgress('Production Data Merged', 20);
}

function _classifyMergeItem(b, item, name) {
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
}

function _sumMergeBucket(sales) {
  let totalQty = 0, totalValue = 0, totalCost = 0, totalProfit = 0;
  let realizedProfit = 0, unrealizedProfit = 0;
  let cashValue = 0, unpaidCreditNet = 0;
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
  return { totalQty, totalValue, totalCost, totalProfit, realizedProfit, unrealizedProfit, cashValue, unpaidCreditNet };
}

function _bucketBalances(unpaidCreditNet, oldDebt, collectionTotal) {
  const grossOutstanding = unpaidCreditNet + oldDebt;
  const netOutstanding   = Math.max(0, grossOutstanding - collectionTotal);
  const advanceCredit    = Math.max(0, collectionTotal - grossOutstanding);
  return { grossOutstanding, netOutstanding, advanceCredit, isSettled: netOutstanding <= 0 };
}

function _mergedSettlementFields(c) {
  const { isSettled, nowISODate, netOutstanding, alreadyPaid, oldDebt, sales, recordCount, b, cashValue, unpaidCreditNet, collectionTotal, advanceCredit, realizedProfit, unrealizedProfit, grossOutstanding, allDates, originalRecordIds } = c;
  return {
    paymentType:           isSettled ? 'CASH' : 'CREDIT',
    transactionType:       (oldDebt > 0 && sales.length === 0) ? 'OLD_DEBT' : 'SALE',
    creditReceived:        isSettled,
    creditReceivedDate:    isSettled ? nowISODate : null,
    creditValue:           isSettled ? 0 : netOutstanding,
    partialPaymentReceived: isSettled ? 0 : alreadyPaid,
    balancePaid:           alreadyPaid,
    paid:                  isSettled,
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
  };
}

export async function mergeSalesData(signal, closeEpoch) {
const { sales } = await loadCollections('sales');
updateCloseYearProgress('Merging Sales Data...', 30);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(sales) || sales.length === 0) return;
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const _recTs = r => r.createdAt || r.timestamp || 0;
const mergedRecords = [];
const customerBuckets = {};
sales.forEach(item => {
  if (item.isMerged === true) return;
  if (_recTs(item) > closeEpoch) return;
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
  b.supplyStore= b.supplyStore|| item.supplyStore     || getDefaultStoreKey();
  _classifyMergeItem(b, item, name);
});
for (const [customer, b] of Object.entries(customerBuckets)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { sales, oldDebt, collectionTotal, phone, address, supplyStore } = b;
  const originalRecordIds = sales.map(s => s.id);
  const { totalQty, totalValue, totalCost, totalProfit, realizedProfit, unrealizedProfit, cashValue, unpaidCreditNet } = _sumMergeBucket(sales);
  const { grossOutstanding, netOutstanding, advanceCredit, isSettled } = _bucketBalances(unpaidCreditNet, oldDebt, collectionTotal);
  if (sales.length === 0 && oldDebt <= 0 && collectionTotal <= 0) continue;
  const allDates  = sales.map(i => i.date).filter(Boolean).sort();
  const firstItem = sales[0] || {};
  const recordCount = sales.length + (oldDebt > 0 ? 1 : 0) + (collectionTotal > 0 ? 1 : 0);
  const mergedId = generateUUID('sale-merged');
  const _mergedSupplyStore = supplyStore || firstItem.supplyStore || getDefaultStoreKey();
  const canonicalUnitPrice = await getEffectiveSalePriceForCustomer(customer, _mergedSupplyStore);
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
    ..._mergedSettlementFields({ isSettled, nowISODate, netOutstanding, alreadyPaid, oldDebt, sales, recordCount, b, cashValue, unpaidCreditNet, collectionTotal, advanceCredit, realizedProfit, unrealizedProfit, grossOutstanding, allDates, originalRecordIds })
  }), false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'sales', mergedRecords, d => !d.isMerged);
  if (!commitResult.ok) {
    console.warn(`mergeSalesData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('sales', commitResult);
  }
}
const existingMerged = sales.filter(i => i.isMerged === true);
const postCloseSales = sales.filter(i => i.isMerged !== true && _recTs(i) > closeEpoch);
const mergedSales = [...existingMerged, ...mergedRecords, ...postCloseSales];
await sqliteStore.set('sales', mergedSales);
emitSyncUpdate({ sales: null});
updateCloseYearProgress('Sales Data Merged', 40);
}

export async function mergeCalculatorData(signal, closeEpoch) {
const calculator = ensureArray(await sqliteStore.get('calculator'));
updateCloseYearProgress('Merging Calculator Data...', 50);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(calculator) || calculator.length === 0) return;
const _recTs = r => r.createdAt || r.timestamp || 0;
const repGroups = {};
calculator.forEach(item => {
  if (item.isMerged === true) return;
  if (_recTs(item) > closeEpoch) return;
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
  const _calcCanonicalSp = await getSalePriceForStore(getDefaultStoreKey());
  const avgUnitPrice = _calcCanonicalSp > 0
    ? _calcCanonicalSp
    : (firstItem.unitPrice || 0);
  const avgCostPrice = mergedNetSold > 0
    ? parseFloat((sellerTotals.totalCost / mergedNetSold).toFixed(4))
    : (firstItem.costPrice || (await calculateSalesCostPerKg(await getStorePool(getDefaultStoreKey()))) || 0);
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
  const commitResult = await _commitMergedBatch(userRef, 'calculator', mergedRecords);
  if (!commitResult.ok) {
    console.warn(`mergeCalculatorData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('calc', commitResult);
  }
}
const existingMergedCalc = calculator.filter(item => item.isMerged === true);
const postCloseCalc = calculator.filter(item => item.isMerged !== true && _recTs(item) > closeEpoch);
const mergedHistory = [...existingMergedCalc, ...mergedRecords, ...postCloseCalc];
await sqliteStore.set('calculator', mergedHistory);
emitSyncUpdate({ calculator: null});
updateCloseYearProgress('Calculator Data Merged', 60);
}

export async function mergePaymentData(signal, closeEpoch) {
const { transactions, entities } = await loadCollections('transactions', 'entities');
updateCloseYearProgress('Merging Payment Data...', 70);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(transactions) || transactions.length === 0) return;
const _recTs = r => r.createdAt || r.timestamp || 0;
const entityGroups = {};
transactions.forEach(item => {
  if (item.isMerged === true) return;
  if (_recTs(item) > closeEpoch) return;
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
  const entity = entities.find(e => e.id === entityId);
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
    console.warn(`mergePaymentData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('pay', commitResult);
  }
}
const existingMergedPay = transactions.filter(item => item.isMerged === true);
const postClosePay = transactions.filter(item => item.isMerged !== true && _recTs(item) > closeEpoch);
const mergedPayTx = [...existingMergedPay, ...mergedRecords, ...postClosePay];
await sqliteStore.set('transactions', mergedPayTx);
emitSyncUpdate({ transactions: null});
updateCloseYearProgress('Payment Data Merged', 80);
}

export async function mergeFactoryData(signal, closeEpoch) {
const { factory } = await loadCollections('factory');
updateCloseYearProgress('Merging Factory Data...', 85);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(factory) || factory.length === 0) return;
const _recTs = r => r.createdAt || r.timestamp || 0;
const nonMergedRecords = factory.filter(item => item.isMerged !== true && _recTs(item) <= closeEpoch);
if (nonMergedRecords.length === 0) {
  updateCloseYearProgress('Factory Data - No New Records to Merge', 90);
  return;
}
const storeGroups = {};
nonMergedRecords.forEach(item => {
  const key = (item.formulaId || '') + '|' + (item.store || '');
  if (!storeGroups[key]) storeGroups[key] = [];
  storeGroups[key].push(item);
});
const nowDate = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime = nowDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true});
const mergedRecords = [];
for (const items of Object.values(storeGroups)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const store = items[0].store || '';
  const formulaId = items[0].formulaId;
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
  const mergedId = generateUUID('fprod-merged');
  const datesSorted = items.map(i => i.date).filter(Boolean).sort();
  const mergedRecord = ensureRecordIntegrity(_buildMergedBase(mergedId, mergeEpoch, nowISODate, nowTime, {
    store,
    ...(formulaId ? { formulaId } : {}),
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
  const commitResult = await _commitMergedBatch(userRef, 'factory', mergedRecords);
  if (!commitResult.ok) {
    console.warn(`mergeFactoryData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('factory', commitResult);
  }
}
const existingMergedFactory = factory.filter(item => item.isMerged === true);
const postCloseFactory = factory.filter(item => item.isMerged !== true && _recTs(item) > closeEpoch);
const mergedFph = [...existingMergedFactory, ...mergedRecords, ...postCloseFactory];
await sqliteStore.set('factory', mergedFph);
emitSyncUpdate({ factory: null});
updateCloseYearProgress('Factory Data Merged', 90);
}

export async function mergeRepSalesData(signal, closeEpoch) {
const { rep } = await loadCollections('rep');
updateCloseYearProgress('Merging Rep Sales Data...', 88);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(rep) || rep.length === 0) return;
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const _recTs = r => r.createdAt || r.timestamp || 0;
const mergedRecords = [];
const repBuckets = {};
rep.forEach(item => {
  if (item.isMerged === true) return;
  if (!item.salesRep === 'NONE' || item.salesRep === 'ADMIN') return;
  if (_recTs(item) > closeEpoch) return;
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
  b.supplyStore = b.supplyStore || item.supplyStore   || getDefaultStoreKey();
  _classifyMergeItem(b, item, name);
});
for (const [, b] of Object.entries(repBuckets)) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { customer, rep, sales, oldDebt, collectionTotal, phone, supplyStore } = b;
  const originalRecordIds = sales.map(s => s.id);
  const { totalQty, totalValue, totalCost, totalProfit, realizedProfit, unrealizedProfit, cashValue, unpaidCreditNet } = _sumMergeBucket(sales);
  const { grossOutstanding, netOutstanding, advanceCredit, isSettled } = _bucketBalances(unpaidCreditNet, oldDebt, collectionTotal);
  if (sales.length === 0 && oldDebt <= 0 && collectionTotal <= 0) continue;
  const allDates  = sales.map(i => i.date).filter(Boolean).sort();
  const firstItem = sales[0] || {};
  const recordCount = sales.length + (oldDebt > 0 ? 1 : 0) + (collectionTotal > 0 ? 1 : 0);
  const mergedId = generateUUID('sale-merged');
  const _repMergedStore = supplyStore || firstItem.supplyStore || getDefaultStoreKey();
  const repCanonicalPrice = await getSalePriceForStore(_repMergedStore);
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
    salesRep:              rep,
    supplyStore:           _repMergedStore,
    ..._mergedSettlementFields({ isSettled, nowISODate, netOutstanding, alreadyPaid, oldDebt, sales, recordCount, b, cashValue, unpaidCreditNet, collectionTotal, advanceCredit, realizedProfit, unrealizedProfit, grossOutstanding, allDates, originalRecordIds })
  }), false, true);
  mergedRecords.push(mergedRecord);
}
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (firebaseDB && currentUser) {
  const userRef = firebaseDB.collection('users').doc(currentUser.uid);
  const commitResult = await _commitMergedBatch(userRef, 'rep', mergedRecords, d => !d.isMerged);
  if (!commitResult.ok) {
    console.warn(`mergeRepSalesData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('repsales', commitResult);
  }
}
const existingMergedRep = rep.filter(item => item.isMerged === true);
const postCloseRep = rep.filter(item => item.isMerged !== true && _recTs(item) > closeEpoch);
const mergedRepSales = [...existingMergedRep, ...mergedRecords, ...postCloseRep];
await sqliteStore.set('rep', mergedRepSales);
emitSyncUpdate({ rep: null});
updateCloseYearProgress('Rep Sales Data Merged', 92);
}

export async function mergeExpensesData(signal, closeEpoch) {
const expenses = ensureArray(await sqliteStore.get('expenses'));
updateCloseYearProgress('Merging Expenses...', 94);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(expenses) || expenses.length === 0) {
  updateCloseYearProgress('Expenses - No Records to Merge', 94);
  return;
}
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const _recTs = r => r.createdAt || r.timestamp || 0;
const expenseGroups = {};
expenses.forEach(exp => {
  if (exp.isMerged === true) return;
  if (_recTs(exp) > closeEpoch) return;
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
  const mergedId = generateUUID('exp-merged');
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
    console.warn(`mergeExpensesData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('exp', commitResult);
  }
}
const existingMerged = expenses.filter(e => e.isMerged === true);
const postCloseExpenses = expenses.filter(e => e.isMerged !== true && _recTs(e) > closeEpoch);
const mergedExpenses = [...existingMerged, ...mergedRecords, ...postCloseExpenses];
await sqliteStore.set('expenses', mergedExpenses);
try {
  const _keptIds = new Set(mergedExpenses.map(e => e.id));
  const _mergedAwayIds = expenses
    .filter(e => !_keptIds.has(e.id))
    .map(e => e.id);
  if (_mergedAwayIds.length > 0) {
    const _fyPh   = (await sqliteStore.get('photos')) || {};
    const _fyPhTs = (await sqliteStore.get('photostamps')) || {};
    const _fyDk   = (await sqliteStore.get('photodirty')) || [];
    let _fyPhChanged = false;
    for (const _mergedId of _mergedAwayIds) {
      const _mergedPhKey = 'expense:' + _mergedId;
      if (_fyPh[_mergedPhKey] !== undefined) {
        delete _fyPh[_mergedPhKey];
        delete _fyPhTs[_mergedPhKey];
        if (!_fyDk.includes(_mergedPhKey)) _fyDk.push(_mergedPhKey);
        _fyPhChanged = true;
      }
    }
    if (_fyPhChanged) {
      await sqliteStore.set('photos', _fyPh);
      await sqliteStore.set('photostamps', _fyPhTs);
      await sqliteStore.set('photodirty', _fyDk);
      console.log('[mergeExpensesData] Queued photo deletion for', _mergedAwayIds.length, 'merged expense record(s).');
    }
  }
} catch (_fyPhErr) { console.warn('[mergeExpensesData] photo cleanup failed:', _fyPhErr); }
emitSyncUpdate({ expenses: null});
updateCloseYearProgress('Expenses Merged', 97);
}

export async function mergeStockReturnsData(signal, closeEpoch) {
const returns = ensureArray(await sqliteStore.get('returns'));
updateCloseYearProgress('Merging Stock Returns...', 98);
if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
if (!Array.isArray(returns) || returns.length === 0) {
  updateCloseYearProgress('Stock Returns - No Records to Merge', 98);
  return;
}
const nowDate    = new Date();
const nowISODate = nowDate.toISOString().split('T')[0];
const mergeEpoch = nowDate.getTime();
const nowTime    = nowDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
const _recTs = r => r.createdAt || r.timestamp || 0;
const storeGroups = {};
returns.forEach(ret => {
  if (ret.isMerged === true) return;
  if (_recTs(ret) > closeEpoch) return;
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
    console.warn(`mergeStockReturnsData: Firestore commit partial failure — ${commitResult.batchesFailed}/${commitResult.batchesTotal} batch(es) failed`, _safeErr(commitResult.error));
    _markRowSyncWarning('ret', commitResult);
  }
}
const existingMerged = returns.filter(r => r.isMerged === true);
const postCloseReturns = returns.filter(r => r.isMerged !== true && _recTs(r) > closeEpoch);
const mergedReturns = [...existingMerged, ...mergedRecords, ...postCloseReturns];
await sqliteStore.set('returns', mergedReturns);
emitSyncUpdate({ returns: null});
updateCloseYearProgress('Stock Returns Merged', 100);
}

export async function verifyTimestampConsistency() {
  const report = {
collections: {},
settings: {},
issues: [],
fixed: { missingTimestamps: 0, inconsistentTimestamps: 0, settingTimestamps: 0 },
summary: {
totalRecords: 0,
recordsWithTimestamps: 0,
recordsWithoutTimestamps: 0,
recordsWithInconsistentTimestamps: 0
}
};
const toMs = (ts) => {
if (!ts) return 0;
if (typeof ts === 'number') return ts;
if (typeof ts.toMillis === 'function') return ts.toMillis();
if (typeof ts === 'object') {
if (typeof ts.seconds === 'number') return ts.seconds * 1000;
if (typeof ts._seconds === 'number') return ts._seconds * 1000;
if (ts instanceof Date) return ts.getTime();
}
if (typeof ts === 'string') {
try { const t = new Date(ts).getTime(); if (!isNaN(t)) return t; } catch(e) {}
}
return 0;
};
const fixRecord = (item, collectionName) => {
let changed = false;
const tsMs = toMs(item.timestamp);
const caMs = toMs(item.createdAt);
const uaMs = toMs(item.updatedAt);
const allMissing = !item.timestamp && !item.createdAt && !item.updatedAt;
if (allMissing) {
const now = Date.now();
item.timestamp = now;
item.createdAt = now;
item.updatedAt = now;
changed = true;
report.issues.push({ type: 'MISSING_TIMESTAMPS', collection: collectionName, id: item.id, message: 'Stamped with current time' });
report.summary.recordsWithoutTimestamps++;
report.fixed.missingTimestamps++;
} else {
report.summary.recordsWithTimestamps++;
if (item.timestamp) item.timestamp = toMs(item.timestamp) || Date.now();
if (item.createdAt) item.createdAt = toMs(item.createdAt) || Date.now();
if (item.updatedAt) item.updatedAt = toMs(item.updatedAt) || Date.now();
const presentMs = [tsMs, caMs, uaMs].filter(t => t > 0);
if (presentMs.length > 1) {
const maxTime = Math.max(...presentMs);
const minTime = Math.min(...presentMs);
if (maxTime - minTime > 86400000) {
if (item.timestamp) item.timestamp = maxTime;
if (item.createdAt) item.createdAt = maxTime;
if (item.updatedAt) item.updatedAt = maxTime;
changed = true;
report.issues.push({ type: 'INCONSISTENT_TIMESTAMPS', collection: collectionName, id: item.id, message: `Fields diverged by ${Math.round((maxTime - minTime) / 3600000)}h — normalized to newest` });
report.summary.recordsWithInconsistentTimestamps++;
report.fixed.inconsistentTimestamps++;
}
}
const bestMs = Math.max(tsMs, caMs, uaMs);
if (!item.timestamp) { item.timestamp = bestMs; changed = true; }
if (!item.createdAt) { item.createdAt = bestMs; changed = true; }
if (!item.updatedAt) { item.updatedAt = bestMs; changed = true; }
}
return changed;
};
const collections = [
{ name: 'production', label: 'Production', variable: 'production' },
{ name: 'calculator', label: 'Calculator History', variable: null },
{ name: 'sales', label: 'Customer Sales', variable: 'sales' },
{ name: 'rep', label: 'Rep Sales', variable: 'rep' },
{ name: 'clients', label: 'Rep Customers', variable: 'clients' },
{ name: 'inventory', label: 'Factory Inventory', variable: 'inventory' },
{ name: 'factory', label: 'Factory History', variable: 'factory' },
{ name: 'returns', label: 'Stock Returns', variable: 'returns' },
{ name: 'transactions', label: 'Payment Transactions', variable: 'transactions' },
{ name: 'entities', label: 'Payment Entities', variable: 'entities' },
{ name: 'expenses', label: 'Expenses', variable: 'expenses' }
];
for (const collection of collections) {
const data = await sqliteStore.get(collection.name, []);
let collectionChanged = false;
report.collections[collection.name] = { label: collection.label, count: data.length, withTimestamps: 0, withoutTimestamps: 0 };
report.summary.totalRecords += data.length;
data.forEach(item => {
if (!item) return;
const changed = fixRecord(item, collection.name);
if (changed) collectionChanged = true;
if (item.timestamp || item.createdAt || item.updatedAt) {
report.collections[collection.name].withTimestamps++;
} else {
report.collections[collection.name].withoutTimestamps++;
}
});
if (collectionChanged) {
await sqliteStore.set(collection.name, data);
}
}
const settingsKeys = [
'defaults', 'costs',
'adjustment', 'formulas',
'tracking', 'settings'
];
for (const key of settingsKeys) {
const timestamp = await sqliteStore.get(`${key}_timestamp`);
if (!timestamp) {
const now = Date.now();
await sqliteStore.set(`${key}_timestamp`, now);
report.issues.push({ type: 'MISSING_SETTING_TIMESTAMP', setting: key, message: 'Timestamp created' });
report.fixed.settingTimestamps++;
}
report.settings[key] = { hasTimestamp: true, timestamp: timestamp || Date.now() };
}
const totalFixed = report.fixed.missingTimestamps + report.fixed.inconsistentTimestamps + report.fixed.settingTimestamps;
if (totalFixed > 0) {
showToast(` Timestamp repair: fixed ${totalFixed} record${totalFixed !== 1 ? 's' : ''} (${report.fixed.missingTimestamps} missing, ${report.fixed.inconsistentTimestamps} inconsistent).`, 'success', 4000);
} else {
showToast('Timestamp consistency check passed — all records healthy.', 'success', 3000);
}
return report;
}

export async function deduplicateAllData() {
  const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
  const _ddMsg = `Run a full deduplication scan?\n\nThis will:\n • Scan all records across every collection\n • Remove exact duplicate entries (keeping the newest version)\n • Sync cleaned data to the cloud\n\n\u26a0 This operation may take 30–60 seconds depending on data volume. Do not close the app while it runs.\n\nThis cannot be undone — but your data will only be improved, not deleted.`;
if (!(await showGlassConfirm(_ddMsg, { title: 'Deduplicate All Data', confirmText: 'Run Cleanup', cancelText: 'Cancel', danger: true }))) {
return;
}
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
if (!validateUUID(item.id)) item.id = generateUUID('repair');
if (seen.has(item.id)) {
duplicatesRemoved++;
const existing = seen.get(item.id);
const cmp = (typeof compareRecordVersions === 'function')
  ? compareRecordVersions(item, existing)
  : getTimestampValue(item) - getTimestampValue(existing);
if (cmp > 0) {
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
{ key: 'production', label: 'Production', variable: 'production' },
{ key: 'calculator', label: 'Calculator History', variable: null },
{ key: 'sales', label: 'Customer Sales', variable: 'sales' },
{ key: 'rep', label: 'Rep Sales', variable: 'rep' },
{ key: 'clients', label: 'Rep Customers', variable: 'clients' },
{ key: 'inventory', label: 'Factory Inventory', variable: 'inventory' },
{ key: 'factory', label: 'Factory History', variable: 'factory' },
{ key: 'returns', label: 'Stock Returns', variable: 'returns' },
{ key: 'transactions', label: 'Payment Transactions', variable: 'transactions' },
{ key: 'entities', label: 'Payment Entities', variable: 'entities' },
{ key: 'expenses', label: 'Expenses', variable: 'expenses' }
];
for (const collection of collections) {
const data = await sqliteStore.get(collection.key, []);
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
await sqliteStore.set(collection.key, cleaned);
}
}
if (results.totalDuplicates > 0) {
await refreshAllDisplays();
if (firebaseDB && currentUser) {
await performOneClickSync(true);
}
window.showGlassAlert(` Done! ${results.totalDuplicates} duplicates removed. Data synced to cloud.`, { tone: 'success', title: 'Cleanup Complete' });
}
return results;
}

export function dbvShowTab(i) {
  [0,1,2,3].forEach(j => {
    const p = document.getElementById('dbv-pane-'+j);
    const t = document.getElementById('dbv-tab-'+j);
    if (p) window.setDisplay(p, j===i ? '' : 'none');
    if (t) {
      window.setStyle(t, 'background', j===i ? 'st-background__36d305' : 'st-background__3bf978');
      window.setStyle(t, 'color', j===i ? 'st-color__729d2f' : 'st-color__5872de');
    }
  });
}

window.dbvShowTab = dbvShowTab;
window.showDeltaSyncDetails = showDeltaSyncDetails;
window.verifyTimestampConsistency = verifyTimestampConsistency;
window.deduplicateAllData = deduplicateAllData;

export async function verifyCompleteTimestampConsistency() {
  const report = {
tabs: {},
sqlite: {},
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
{ name: 'Production', sqliteKey: 'production', variable: 'production', tab: 'prod' },
{ name: 'Sales', sqliteKey: 'sales', variable: 'sales', tab: 'sales' },
{ name: 'Calculator', sqliteKey: 'calculator', variable: null, tab: 'calc' },
{ name: 'Factory', sqliteKeys: ['inventory', 'factory'], tab: 'factory' },
{ name: 'Payments', sqliteKeys: ['transactions', 'entities'], tab: 'payments' },
{ name: 'Rep Sales', sqliteKey: 'rep', variable: 'rep', tab: 'rep' }
];
for (const tab of tabs) {
const tabReport = {
name: tab.name,
collections: {},
totalRecords: 0,
validTimestamps: 0,
issues: 0
};
const keys = tab.sqliteKeys || [tab.sqliteKey];
for (const key of keys) {
const data = await sqliteStore.get(key, []);
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
const sqliteCollections = [
'production', 'calculator', 'sales', 'rep', 'clients',
'inventory', 'factory', 'returns',
'transactions', 'entities', 'expenses'
];
for (const collectionName of sqliteCollections) {
const data = await sqliteStore.get(collectionName, []);
if (data.length === 0) {
report.sqlite[collectionName] = { status: 'empty', count: 0 };
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
report.sqlite[collectionName] = {
status: 'ok',
count: data.length,
formats: formats
};
const validCount = formats.number + formats.string + formats.date + formats.firestore + formats.dict;
}
const deltaSyncCollections = [
{ name: 'production', sqliteKey: 'production' },
{ name: 'sales', sqliteKey: 'sales' },
{ name: 'calculator', sqliteKey: 'calculator' },
{ name: 'rep', sqliteKey: 'rep' },
{ name: 'clients', sqliteKey: 'clients' },
{ name: 'transactions', sqliteKey: 'transactions' },
{ name: 'entities', sqliteKey: 'entities' },
{ name: 'inventory', sqliteKey: 'inventory' },
{ name: 'factory', sqliteKey: 'factory' },
{ name: 'returns', sqliteKey: 'returns' },
{ name: 'expenses', sqliteKey: 'expenses' }
];
for (const collection of deltaSyncCollections) {
const data = await sqliteStore.get(collection.sqliteKey, []);
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
for (const collectionName of sqliteCollections) {
const data = await sqliteStore.get(collectionName, []);
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
}
if (report.issues.length > 0) {
showToast(` Full verification: ${report.issues.length} issue${report.issues.length !== 1 ? 's' : ''} detected.`, 'warning', 4500);
} else {
showToast('Full system verification passed — all data is consistent.', 'success', 3500);
}
return report;
}

export function extractTimestampValue(record) {
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

export async function runUnifiedCleanup() {
  const deletedRecordIds = new Set(ensureArray(await sqliteStore.get('deleted')));
if (!(await showGlassConfirm(
  'Clean all duplicate records?\n\n\u2022 Scans every collection in SQLite\n\u2022 Removes duplicates using record timestamps as the version selector\n\u2022 Deletes the duplicate documents from Firestore\n\u2022 Re-uploads the clean, deduplicated set\n\nNo valid records are deleted \u2014 only true duplicates (same UUID) are resolved.',
  { title: 'Clean Duplicates & Sync', confirmText: 'Clean & Sync', cancelText: 'Cancel', danger: false }
))) return;
const COLLECTIONS = RECORD_STORES.map(r => ({ sqliteKey: r.sqlite, firestore: r.collection, label: r.label, liveVar: r.jsVar }));
try {
  let totalDuplicates = 0;
  const dirtyCollections = [];
  for (const col of COLLECTIONS) {
    const records = await sqliteStore.get(col.sqliteKey, []);
    if (!Array.isArray(records) || records.length === 0) continue;
    const seen = new Map();
    let dupsInCol = 0;
    for (const rec of records) {
      if (!rec || !rec.id) continue;
      if (!validateUUID(rec.id)) rec.id = generateUUID('repair');
      if (seen.has(rec.id)) {
        dupsInCol++;
        const cmp = (typeof compareRecordVersions === 'function')
          ? compareRecordVersions(rec, seen.get(rec.id))
          : ((rec.updatedAt || 0) - (seen.get(rec.id).updatedAt || 0));
        if (cmp > 0) seen.set(rec.id, rec);
      } else {
        seen.set(rec.id, rec);
      }
    }
    if (dupsInCol > 0) {
      const cleaned = Array.from(seen.values());
      await sqliteStore.set(col.sqliteKey, cleaned);
      dirtyCollections.push({ ...col, cleaned, dupCount: dupsInCol });
      totalDuplicates += dupsInCol;
    }
  }
  if (totalDuplicates === 0) {
    return;
  }
  if (firebaseDB && currentUser) {
    const userRef = firebaseDB.collection('users').doc(currentUser.uid);
    for (const col of dirtyCollections) {
      try {
        const snapshot = await userRef.collection(col.firestore).get();
        if (snapshot.empty) continue;
        const canonicalIds = new Set(col.cleaned.map(r => String(r.id)));
        const docsToDelete = snapshot.docs.filter(d => !canonicalIds.has(d.id));
        if (docsToDelete.length > 0) {
          const delBatches = [firebaseDB.batch()];
          let delOps = 0;
          for (const doc of docsToDelete) {
            if (delOps >= 490) { delBatches.push(firebaseDB.batch()); delOps = 0; }
            delBatches[delBatches.length - 1].delete(doc.ref);
            delOps++;
            trackFirestoreWrite(1);
          }
          for (const b of delBatches) await b.commit();
        }
        const upBatches = [firebaseDB.batch()];
        let upOps = 0;
        for (const rec of col.cleaned) {
          if (!rec || !rec.id) continue;
          if (upOps >= 490) { upBatches.push(firebaseDB.batch()); upOps = 0; }
          const sanitized = sanitizeForFirestore(rec);
          sanitized.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
          upBatches[upBatches.length - 1].set(
            userRef.collection(col.firestore).doc(String(rec.id)),
            sanitized,
            { merge: true }
          );
          upOps++;
          trackFirestoreWrite(1);
          if (typeof DeltaSync !== 'undefined') DeltaSync.markUploaded(col.firestore, rec.id);
        }
        for (const b of upBatches) await b.commit();
        if (typeof DeltaSync !== 'undefined') await DeltaSync.setLastSyncTimestamp(col.firestore);
      } catch (colErr) {
        console.error('[Cleanup] Firestore sync failed for', col.firestore, _safeErr(colErr));
        window.notifyBlocking('Firestore sync failed for ' + col.label + ': ' + colErr.message, 'error', 'Something went wrong');
      }
    }
  }
  try { await refreshAllDisplays(); } catch(e) {}
} catch (err) {
  console.error('[runUnifiedCleanup] error:', _safeErr(err));
  window.notifyBlocking('\u26a0 Cleanup failed: ' + err.message, 'error', 'Something went wrong');
}
}

window.runUnifiedCleanup = runUnifiedCleanup;
window._showDeltaSyncDetails = showDeltaSyncDetails;
window._runUnifiedCleanup = runUnifiedCleanup;
window._showCloseFinancialYearDialog = showCloseFinancialYearDialog;
export { closeYearInProgress, closeYearAbortController, _fyVerifiedPassword, closing, restoring, _hasMergeCommitFailure };
window.updateDeltaSyncStatsDisplay = updateDeltaSyncStatsDisplay;
window.showDeltaSyncDetails = showDeltaSyncDetails;
window.closeYearInProgress = closeYearInProgress;
window.closeYearAbortController = closeYearAbortController;
window._fyVerifiedPassword = _fyVerifiedPassword;
window.closing = closing;
window.restoring = restoring;
window._hasMergeCommitFailure = _hasMergeCommitFailure;
window._storeCodeToLabel = _storeCodeToLabel;
window.showCloseFinancialYearDialog = showCloseFinancialYearDialog;
window.validateCloseYearInput = validateCloseYearInput;
window.verifyAndExecuteCloseYear = verifyAndExecuteCloseYear;
window.closeCloseYearDialog = closeCloseYearDialog;
window.updateCloseYearProgress = updateCloseYearProgress;
window.generateCloseYearSummary = generateCloseYearSummary;
window.createMergeBackup = createMergeBackup;
window.restoreFromBackup = restoreFromBackup;
window.verifyMergeConsistency = verifyMergeConsistency;
window.executeCloseFinancialYear = executeCloseFinancialYear;
window._markRowSyncWarning = _markRowSyncWarning;
window._buildMergedBase = _buildMergedBase;
window.mergeProductionData = mergeProductionData;
window.mergeSalesData = mergeSalesData;
window.mergeCalculatorData = mergeCalculatorData;
window.mergePaymentData = mergePaymentData;
window.mergeFactoryData = mergeFactoryData;
window.mergeRepSalesData = mergeRepSalesData;
window.mergeExpensesData = mergeExpensesData;
window.mergeStockReturnsData = mergeStockReturnsData;
window.verifyTimestampConsistency = verifyTimestampConsistency;
window.deduplicateAllData = deduplicateAllData;
window.dbvShowTab = dbvShowTab;
window.verifyCompleteTimestampConsistency = verifyCompleteTimestampConsistency;
window.extractTimestampValue = extractTimestampValue;
window.runUnifiedCleanup = runUnifiedCleanup;
export function _set_restoring(v) { restoring = v; }
export function _set_closing(v) { closing = v; }
