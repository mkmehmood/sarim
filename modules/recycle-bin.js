// Recycle Bin: render, recover, delete-forever.
// Built on the link-aware planners in link-graph.js / link-guards.js:
//   - records deleted together (same _deletionGroup) recover together, parents first
//   - every recovered record gets a NEW id; all inbound/outbound links are re-pointed
//     (applyRecoveryLinks), and a recovered partial payment is re-added to its parent sale
//   - records whose deletion already reversed side effects (calculator entries, transfers,
//     returns) are blocked from recovery, as are partial payments whose parent is gone.

import { sqliteStore, ensureArray, generateUUID, validateUUID, getTimestamp, esc, fmtAmt, firebaseDB, currentUser } from './business.js';
import { unifiedSave } from './sync.js';
import { notifyDataChange, triggerAutoSync, OfflineQueue, _reconcileSupplierLinkAfterRecovery, _refreshSupplierLinkViews } from './utilities-core.js';
import { COLLECTION_TO_KEY, GROUP_FIELD, DELETE_ORIGIN_FIELD, orderForRestore, findGroupMembers } from './link-graph.js';
import { deleteProdPhotos } from './prod-photos.js';
import {
  getRecoverBlockReason, getRecoverLinkBlockReason, applyRecoveryLinks,
  applyRenameOnRecovery, findLiveSameNameRecord,
} from './link-guards.js';
import { showToast, showGlassConfirm } from './customers.js';

const EXPIRY_MS = 90 * 24 * 3600 * 1000; // bin entries expire after 90 days

const COLLECTION_LABEL = {
  sales: 'Sale', rep_sales: 'Rep Sale', calculator_history: 'Calculator Record',
  transactions: 'Payment', payment_transactions: 'Payment', expenses: 'Expense',
  production: 'Production', returns: 'Stock Return', factory_history: 'Factory Batch',
  inventory: 'Raw Material', entities: 'Entity', sales_customers: 'Customer',
  rep_customers: 'Rep Customer',
};

const TAB_COLLECTIONS = {
  tab_sales:      ['sales', 'sales_customers'],
  tab_rep:        ['rep_sales', 'rep_customers'],
  tab_production: ['production', 'returns'],
  tab_calculator: ['calculator_history'],
  tab_factory:    ['factory_history', 'inventory'],
  tab_payments:   ['transactions', 'payment_transactions', 'expenses', 'entities'],
};

function _tombId(t) { return String(t.recordId || t.id || ''); }
function _tombCollection(t) { return t.collection || t.recordType || 'unknown'; }

function _displayName(t) {
  const s = t.snapshot || {};
  return t.displayName || s.customerName || s.entityName || s.name || s.seller || s.repName || 'Record';
}

function _displayAmount(t) {
  const s = t.snapshot || {};
  const v = t.displayAmount ?? s.totalValue ?? s.amount ?? s.totalCost ?? s.net ?? null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function _displayDate(t) {
  const s = t.snapshot || {};
  if (s.date) return s.date;
  const ts = t.deletedAt || t.tombstoned_at;
  return ts ? new Date(ts).toLocaleDateString() : '';
}

async function _loadTombstones() {
  return ensureArray(await sqliteStore.get('deletion_records'));
}

// Remove bin entries older than 90 days (the cloud tombstone in deleted_records stays,
// so other devices still apply the delete — only the recoverable snapshot is gone).
// Production photos are kept while the entry sits in the bin (so recovering still shows them) and are
// removed once the entry is gone for good.
async function _dropProdPhotos(tombs) {
  for (const t of tombs || []) {
    try {
      if ((t.collection || t.recordType) === 'production' && t.snapshot && Array.isArray(t.snapshot.photoKeys) && t.snapshot.photoKeys.length) {
        await deleteProdPhotos(t.snapshot);
      }
    } catch (e) { console.warn('[RecycleBin] photo cleanup failed', e && e.message); }
  }
}

async function _purgeExpired(tombs) {
  const now = Date.now();
  const keep = [];
  const gone = [];
  let changed = false;
  for (const t of tombs) {
    const ts = t.deletedAt || t.tombstoned_at || 0;
    if (ts && now - ts > EXPIRY_MS) { changed = true; gone.push(t); continue; }
    keep.push(t);
  }
  if (changed) { await _dropProdPhotos(gone); await sqliteStore.set('deletion_records', keep); }
  return keep;
}

// After a successful recover: the old id is no longer deleted and any queued cloud
// delete for it is stale.
async function _purgeAfterRecover(oldId, collection, newId) {
  const sid = String(oldId);
  // Also removes the CLOUD tombstone (users/<uid>/deletions/<id>) — otherwise the sync listener brings
  // the recovered record back into the bin as a ghost on the next sync.
  if (typeof window !== 'undefined' && typeof window.purgeRecoveredId === 'function') {
    try { await window.purgeRecoveredId(sid, collection, null, newId); return; }
    catch (e) { console.warn('[RecycleBin] cloud purge failed, falling back to local purge', e && e.message); }
  }
  const tombs = ensureArray(await sqliteStore.get('deletion_records'))
    .filter(r => String(r.id) !== sid && String(r.recordId) !== sid);
  await sqliteStore.set('deletion_records', tombs);
  const deletedIds = new Set(ensureArray(await sqliteStore.get('deleted_records')));
  deletedIds.delete(sid);
  await sqliteStore.set('deleted_records', Array.from(deletedIds));
  await _pruneStaleQueueOps(sid);
}

async function _pruneStaleQueueOps(sid) {
  try {
    if (typeof OfflineQueue === 'undefined' || !OfflineQueue) return;
    const isStale = (item) => {
      const op = (item && item.operation) || {};
      return (op.action === 'delete' && op.docId === sid) ||
             (op.action === 'set' && op.docId === sid && (op.data === null || op.data === undefined));
    };
    const before = (OfflineQueue.queue || []).length;
    OfflineQueue.queue = (OfflineQueue.queue || []).filter(i => !isStale(i));
    if (OfflineQueue.queue.length !== before && OfflineQueue.saveQueue) await OfflineQueue.saveQueue();
    if (Array.isArray(OfflineQueue.deadLetterQueue)) {
      const dBefore = OfflineQueue.deadLetterQueue.length;
      OfflineQueue.deadLetterQueue = OfflineQueue.deadLetterQueue.filter(i => !isStale(i));
      if (OfflineQueue.deadLetterQueue.length !== dBefore && OfflineQueue.saveDeadLetterQueue) {
        await OfflineQueue.saveDeadLetterQueue();
      }
    }
  } catch (e) { console.warn('[RecycleBin] queue prune failed:', e && e.message); }
}

// -------------------------------------------------------------------------------------------------------------
// Recover
// -------------------------------------------------------------------------------------------------------------

function _cleanSnapshot(snapshot) {
  const clean = { ...snapshot };
  delete clean.deletedAt;
  delete clean.tombstoned_at;
  delete clean.deleted_by;
  delete clean.deletion_version;
  delete clean.recoveredAt;
  delete clean._placeholder;
  delete clean.isDeleted;
  delete clean.softDeleted;
  delete clean.originalId;
  delete clean[GROUP_FIELD];
  delete clean[DELETE_ORIGIN_FIELD];
  const now = getTimestamp();
  clean.updatedAt = now;
  clean.recoveredAt = now;
  clean.syncedAt = new Date().toISOString();
  return clean;
}

// Expense / payment photos live outside the record (person_photos). Deleting stashed them on the
// tombstone; put them back under the NEW id so the picture is not lost by recovering.
async function _restorePhotos(collection, oldId, newId, clean, tomb) {
  if (!['expenses', 'transactions', 'payment_transactions'].includes(collection)) return;
  try {
    const ph = (await sqliteStore.get('person_photos')) || {};
    const ts = (await sqliteStore.get('person_photos_timestamps')) || {};
    const dirty = (await sqliteStore.get('person_photos_dirty_keys')) || [];
    const stash = (tomb && tomb._photos) || {};
    const now = Date.now();
    const put = (key, data) => {
      if (!data) return;
      ph[key] = data; ts[key] = now;
      if (!dirty.includes(key)) dirty.push(key);
    };
    const ownOld = 'expense:' + oldId;
    const own = stash[ownOld] || (tomb && tomb._photoDataUrl) || ph[ownOld] || null;
    if (own) {
      put('expense:' + newId, own);
      delete ph[ownOld]; delete ts[ownOld];
      if (!dirty.includes(ownOld)) dirty.push(ownOld);
    }
    if (clean && clean.expenseId) {
      const linkedKey = 'expense:' + clean.expenseId;
      const linked = stash['expense:' + (tomb && tomb.snapshot && tomb.snapshot.expenseId)] || stash[linkedKey] || ph[linkedKey] || null;
      if (linked && !ph[linkedKey]) put(linkedKey, linked);
    }
    await sqliteStore.set('person_photos', ph);
    await sqliteStore.set('person_photos_timestamps', ts);
    await sqliteStore.set('person_photos_dirty_keys', dirty);
    await sqliteStore.set('person_photos_timestamp', now);
  } catch (e) { console.warn('[RecycleBin] photo restore failed', e && e.message); }
}

// Recover one tombstone — together with every record deleted in the same operation.
export async function recoverDeletedRecord(deletedId) {
  if (!deletedId) return;
  const sid = String(deletedId);
  const all = await _loadTombstones();
  const tomb = all.find(r => String(r.id) === sid || String(r.recordId) === sid);
  if (!tomb) { showToast('Record not found in recycle bin', 'warning'); return; }

  const members = findGroupMembers(tomb, all);
  const groupIds = new Set(members.map(_tombId));

  if (members.some(m => !m.snapshot)) {
    showToast('This record cannot be recovered because its data was not stored. You can only delete it forever.', 'warning', 6000);
    return;
  }

  // Block checks BEFORE touching anything. ctx makes the stock/material checks cumulative across the group.
  const ctx = { stockUsed: new Map(), unitsUsed: new Map(), inv: null };
  for (const m of orderForRestore(members)) {
    const collection = _tombCollection(m);
    const hard = getRecoverBlockReason(collection, m.snapshot);
    if (hard) { showToast(hard, 'warning', 7000); return; }
    // A partial payment whose parent sale is recovered in the same group is fine — skip the orphan check.
    const s = m.snapshot || {};
    const parentInGroup = s.relatedSaleId && groupIds.has(String(s.relatedSaleId));
    if (!parentInGroup) {
      const link = await getRecoverLinkBlockReason(collection, s, ctx);
      if (link) { showToast(link, 'warning', 7000); return; }
    }
  }

  const label = members.length > 1 ? `${members.length} linked records` : `"${_displayName(tomb)}"`;
  const ok = await showGlassConfirm(
    `Recover ${label}?\n\nEach record gets a new ID and all linked records (payments, calculator entries, expenses) are re-connected automatically.`,
    { title: 'Recover from Recycle Bin', confirmText: 'Recover', cancelText: 'Cancel' }
  );
  if (!ok) return;

  try {
    const ordered = orderForRestore(members); // parents before children
    const touchedTypes = new Set();
    for (const m of ordered) {
      const collection = _tombCollection(m);
      const key = COLLECTION_TO_KEY[collection];
      if (!key) { console.warn('[RecycleBin] no store key for collection', collection); continue; }
      const oldId = _tombId(m);
      let newId = generateUUID('recovered');
      if (!validateUUID(newId)) newId = generateUUID('recovered');
      const clean = _cleanSnapshot(m.snapshot);
      clean.id = newId;

      // Customer renamed while this record sat in the bin: bring it back under the new name.
      await applyRenameOnRecovery(collection, clean);
      // A same-name contact/entity is already live: reuse it instead of creating a duplicate.
      const dupe = await findLiveSameNameRecord(collection, clean);
      if (dupe) {
        await applyRecoveryLinks(collection, oldId, dupe.id, null);
        await _purgeAfterRecover(oldId, collection, dupe.id);
        touchedTypes.add(key);
        continue;
      }

      // Re-point every link (other records -> new id, this record -> earlier-recovered parents),
      // and re-attach a partial payment to its parent sale.
      await applyRecoveryLinks(collection, oldId, newId, clean);

      const arr = ensureArray(await sqliteStore.get(key)).filter(r => r && String(r.id) !== oldId && String(r.id) !== String(newId));
      arr.push(clean);
      await unifiedSave(key, arr, clean);
      await _restorePhotos(collection, oldId, newId, clean, m);
      if ((collection === 'transactions' || collection === 'payment_transactions') && clean.isPayable) {
        try { await _reconcileSupplierLinkAfterRecovery(clean); await _refreshSupplierLinkViews(); }
        catch (e) { console.warn('[RecycleBin] supplier link reconcile failed', e && e.message); }
      }
      await _purgeAfterRecover(oldId, collection, newId);
      touchedTypes.add(key);
    }
    // Production, returns, batches and materials all feed the factory unit totals: refresh them.
    const _factoryKeys = ['mfg_pro_pkr', 'factory_production_history', 'stock_returns', 'factory_inventory_data'];
    if (_factoryKeys.some(k => touchedTypes.has(k)) && typeof window.syncFactoryProductionStats === 'function') {
      try { await window.syncFactoryProductionStats(); } catch (e) { console.warn('[RecycleBin] factory stats refresh failed', e && e.message); }
    }
    notifyDataChange('all');
    triggerAutoSync();
    showToast(members.length > 1 ? `${members.length} linked records recovered` : 'Record recovered', 'success');
  } catch (e) {
    console.error('[RecycleBin] recover failed:', e);
    showToast('Recover failed: ' + ((e && e.message) || 'unknown error'), 'error', 5000);
  }
  await renderRecycleBin(document.getElementById('recycleBinFilter')?.value || 'all');
}

// -------------------------------------------------------------------------------------------------------------
// Delete forever / empty bin
// -------------------------------------------------------------------------------------------------------------

// Erase the recoverable snapshot locally AND in the cloud. The cloud `deletions` doc is what the sync
// re-downloads on every app start, so leaving it behind makes erased entries reappear after a restart.
// Erased ids are remembered in `erased_deletion_ids` until the cloud delete is confirmed, so a sync that
// runs before (or without) the cloud delete can never resurrect them.
async function _eraseTombstones(ids) {
  const idSet = new Set(ids.map(String).filter(Boolean));
  const tombs = ensureArray(await sqliteStore.get('deletion_records'))
    .filter(r => !idSet.has(String(r.id)) && !idSet.has(String(r.recordId)));
  await sqliteStore.set('deletion_records', tombs);
  const erased = new Set(ensureArray(await sqliteStore.get('erased_deletion_ids')).map(String));
  idSet.forEach(i => erased.add(i));
  await sqliteStore.set('erased_deletion_ids', Array.from(erased));
  await flushErasedTombstones();
}

// Push pending erasures to Firestore. Safe to call any time (offline / signed out = no-op, retried on
// the next sync because the ids stay in `erased_deletion_ids`).
export async function flushErasedTombstones() {
  try {
    const pending = ensureArray(await sqliteStore.get('erased_deletion_ids')).map(String);
    if (!pending.length) return;
    if (!firebaseDB || !currentUser) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof window !== 'undefined' && window._firestoreNetworkDisabled) return;
    const userRef = firebaseDB.collection('users').doc(currentUser.uid);
    const done = new Set();
    for (let i = 0; i < pending.length; i += 400) {
      const chunk = pending.slice(i, i + 400);
      try {
        const batch = firebaseDB.batch();
        chunk.forEach(id => batch.delete(userRef.collection('deletions').doc(id)));
        await batch.commit();
        chunk.forEach(id => done.add(id));
      } catch (e) { console.warn('[RecycleBin] cloud erase failed, will retry on next sync', e && e.message); }
    }
    if (done.size) {
      const left = ensureArray(await sqliteStore.get('erased_deletion_ids')).map(String).filter(id => !done.has(id));
      await sqliteStore.set('erased_deletion_ids', left);
    }
  } catch (e) { console.warn('[RecycleBin] flushErasedTombstones failed', e && e.message); }
}
if (typeof window !== 'undefined') window.flushErasedTombstones = flushErasedTombstones;

export async function deleteForever(deletedId) {
  if (!deletedId) return;
  const sid = String(deletedId);
  const all = await _loadTombstones();
  const tomb = all.find(r => String(r.id) === sid || String(r.recordId) === sid);
  if (!tomb) { showToast('Record not found in recycle bin', 'warning'); return; }
  const members = findGroupMembers(tomb, all);
  const ok = await showGlassConfirm(
    members.length > 1
      ? `Permanently erase these ${members.length} linked records? This cannot be undone.`
      : `Permanently erase "${_displayName(tomb)}"? This cannot be undone.`,
    { title: 'Delete Forever', confirmText: 'Delete Forever', cancelText: 'Cancel', danger: true }
  );
  if (!ok) return;
  await _dropProdPhotos(members);
  await _eraseTombstones(members.map(_tombId).concat(members.map(t => String(t.id || ''))));
  showToast(members.length > 1 ? `${members.length} records erased permanently` : 'Record erased permanently', 'success');
  await renderRecycleBin(document.getElementById('recycleBinFilter')?.value || 'all');
}

export async function emptyRecycleBin() {
  const tombs = await _loadTombstones();
  if (tombs.length === 0) { showToast('Recycle bin is already empty', 'info'); return; }
  const ok = await showGlassConfirm(
    `Permanently erase all ${tombs.length} record${tombs.length !== 1 ? 's' : ''} in the recycle bin? This cannot be undone.`,
    { title: 'Empty Recycle Bin', confirmText: 'Empty Bin', cancelText: 'Cancel', danger: true }
  );
  if (!ok) return;
  await _dropProdPhotos(tombs);
  await _eraseTombstones(tombs.map(_tombId).concat(tombs.map(t => String(t.id || ''))));
  await sqliteStore.set('deletion_records', []);
  showToast('Recycle bin emptied', 'success');
  await renderRecycleBin('all');
}

// -------------------------------------------------------------------------------------------------------------
// Render
// -------------------------------------------------------------------------------------------------------------

export async function renderRecycleBin(filter = 'all') {
  const listEl = document.getElementById('recycleBinList');
  const statsEl = document.getElementById('recycleBinStats');
  if (!listEl) return;

  let tombs = await _purgeExpired(await _loadTombstones());
  const totalCount = tombs.length;
  if (filter && filter !== 'all' && TAB_COLLECTIONS[filter]) {
    const allowed = new Set(TAB_COLLECTIONS[filter]);
    tombs = tombs.filter(t => allowed.has(_tombCollection(t)));
  }

  if (statsEl) {
    statsEl.textContent = filter === 'all'
      ? `${totalCount} record${totalCount !== 1 ? 's' : ''} in bin`
      : `${tombs.length} of ${totalCount} record${totalCount !== 1 ? 's' : ''}`;
  }

  if (tombs.length === 0) {
    listEl.innerHTML = '<div class="u-empty-state-md" style="text-align:center;padding:32px 12px;color:var(--text-muted);">Recycle bin is empty</div>';
    return;
  }

  // Collapse deletion groups into a single card.
  const seenGroups = new Set();
  const cards = [];
  const sorted = tombs.slice().sort((a, b) => (b.deletedAt || b.tombstoned_at || 0) - (a.deletedAt || a.tombstoned_at || 0));
  for (const t of sorted) {
    const gid = t.snapshot && t.snapshot[GROUP_FIELD];
    if (gid) {
      if (seenGroups.has(gid)) continue;
      seenGroups.add(gid);
      cards.push({ group: findGroupMembers(t, tombs), lead: t });
    } else {
      cards.push({ group: [t], lead: t });
    }
  }

  listEl.innerHTML = cards.map(({ group, lead }) => {
    const id = esc(_tombId(lead));
    const label = COLLECTION_LABEL[_tombCollection(lead)] || _tombCollection(lead);
    const amount = _displayAmount(lead);
    const grouped = group.length > 1;
    const names = group.map(_displayName).slice(0, 3).map(esc).join(', ');
    const deletedTs = lead.deletedAt || lead.tombstoned_at;
    const deletedStr = deletedTs ? new Date(deletedTs).toLocaleString() : '';
    const noSnapshot = !lead.snapshot;
    return `
    <div class="settings-list-item" style="flex-direction:column;align-items:stretch;gap:0;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:0.85rem;color:var(--text-main);">
            ${grouped ? `${group.length} linked records` : esc(_displayName(lead))}
            <span style="font-size:0.62rem;font-weight:600;color:var(--text-muted);border:1px solid var(--glass-border);border-radius:999px;padding:1px 7px;margin-left:6px;">${esc(label)}</span>
          </div>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">
            ${grouped ? names + (group.length > 3 ? ', …' : '') + ' · ' : ''}${esc(_displayDate(lead))}${amount !== null ? ' · ' + fmtAmt(amount) : ''}
          </div>
          ${deletedStr ? `<div style="font-size:0.62rem;color:var(--text-secondary);margin-top:2px;">Deleted ${esc(deletedStr)}</div>` : ''}
          ${noSnapshot ? '<div style="font-size:0.62rem;color:var(--warning);margin-top:2px;">Data snapshot missing — recover not possible</div>' : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${noSnapshot ? '' : `<button onclick="(async()=>{await recoverDeletedRecord('${id}')})()" style="background:rgba(29,233,182,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:8px;padding:5px 10px;font-size:0.7rem;font-weight:700;cursor:pointer;">Recover</button>`}
          <button onclick="(async()=>{await deleteForever('${id}')})()" style="background:rgba(239,68,68,0.1);border:1px solid var(--danger);color:var(--danger);border-radius:8px;padding:5px 10px;font-size:0.7rem;font-weight:700;cursor:pointer;">Delete Forever</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

Object.assign(window, {
  renderRecycleBin, recoverDeletedRecord, deleteForever, emptyRecycleBin,
});
