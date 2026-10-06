// Recycle Bin: render, recover, delete-forever.
// Built on the link-aware planners in link-graph.js / link-guards.js:
//   - records deleted together (same _deletionGroup) recover together, parents first
//   - every recovered record gets a NEW id; all inbound/outbound links are re-pointed
//     (applyRecoveryLinks), and a recovered partial payment is re-added to its parent sale
//   - records whose deletion already reversed side effects (calculator entries, transfers,
//     returns) are blocked from recovery, as are partial payments whose parent is gone.

import { sqliteStore, ensureArray, generateUUID, validateUUID, getTimestamp, esc, fmtAmt } from './business.js';
import { unifiedSave } from './sync.js';
import { notifyDataChange, triggerAutoSync, OfflineQueue } from './utilities-core.js';
import { COLLECTION_TO_KEY, GROUP_FIELD, orderForRestore, findGroupMembers } from './link-graph.js';
import {
  getRecoverBlockReason, getRecoverLinkBlockReason, applyRecoveryLinks,
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
async function _purgeExpired(tombs) {
  const now = Date.now();
  const keep = [];
  let changed = false;
  for (const t of tombs) {
    const ts = t.deletedAt || t.tombstoned_at || 0;
    if (ts && now - ts > EXPIRY_MS) { changed = true; continue; }
    keep.push(t);
  }
  if (changed) await sqliteStore.set('deletion_records', keep);
  return keep;
}

// After a successful recover: the old id is no longer deleted and any queued cloud
// delete for it is stale.
async function _purgeAfterRecover(oldId) {
  const sid = String(oldId);
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
  const now = getTimestamp();
  clean.updatedAt = now;
  clean.recoveredAt = now;
  clean.syncedAt = new Date().toISOString();
  return clean;
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

  // Block checks BEFORE touching anything.
  for (const m of members) {
    const collection = _tombCollection(m);
    const hard = getRecoverBlockReason(collection, m.snapshot);
    if (hard) { showToast(hard, 'warning', 7000); return; }
    // A partial payment whose parent sale is recovered in the same group is fine — skip the orphan check.
    const s = m.snapshot || {};
    const parentInGroup = s.relatedSaleId && groupIds.has(String(s.relatedSaleId));
    if (!parentInGroup) {
      const link = await getRecoverLinkBlockReason(collection, s);
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

      // Re-point every link (other records -> new id, this record -> earlier-recovered parents),
      // and re-attach a partial payment to its parent sale.
      await applyRecoveryLinks(collection, oldId, newId, clean);

      const arr = ensureArray(await sqliteStore.get(key)).filter(r => r && String(r.id) !== oldId && String(r.id) !== String(newId));
      arr.push(clean);
      await unifiedSave(key, arr, clean);
      await _purgeAfterRecover(oldId);
      touchedTypes.add(key);
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

// Erase the recoverable snapshot. The id STAYS in deleted_records so the cloud tombstone
// is preserved and other devices still apply the deletion.
async function _eraseTombstones(ids) {
  const idSet = new Set(ids.map(String));
  const tombs = ensureArray(await sqliteStore.get('deletion_records'))
    .filter(r => !idSet.has(String(r.id)) && !idSet.has(String(r.recordId)));
  await sqliteStore.set('deletion_records', tombs);
}

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
  await _eraseTombstones(members.map(_tombId));
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
