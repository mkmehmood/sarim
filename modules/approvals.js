import { _safeErr, appMode, currentUser, dataRootRef, ensureArray, esc, firebaseDB, fmtAmt, sqliteStore } from './business.js';
import { APP_CONFIG } from './constants.js';
import { showToast } from './customers.js';
import { fmtNum } from './finance.js';
import { DeltaSync, UUIDSyncRegistry, getStoreLabel } from './utilities-sales.js';
import { formatDisplayDateTime } from './utilities-payments.js';
import { getSQLiteKey } from './sync.js';
import {
  bulkSheetModel, buildPendingDoc, describeSubmitter, groupMembers, groupPending, ledgerRow, ledgerSheet,
  isGatedCollection, pendingSummaryLine, resolutionNotice, summarizePending,
} from './approvals-core.js';
import { ledgerListHtml, ledgerSheetHtml } from './approvals-ledger.js';
import { notifyAdminsPush, registerAdminPush } from './push.js';

let _pending = [];
let _firstSnapshot = true;
let _lastToastAt = 0;
const _busy = new Set();

export function isGatedSession() {
  return !!currentUser && appMode !== 'admin' && !!window._workspaceOwnerUid;
}

export function gates(collection) {
  return isGatedSession() && isGatedCollection(collection);
}

function _submitter() {
  const email = String((currentUser && currentUser.email) || '').toLowerCase();
  return {
    uid: currentUser.uid,
    name: window._assignedManagerName || (currentUser && currentUser.displayName) || email.split('@')[0],
    email,
  };
}

function _markSubmitted(collection, docId) {
  if (typeof UUIDSyncRegistry !== 'undefined') UUIDSyncRegistry.markUploaded(collection, docId);
  else DeltaSync.markUploaded(collection, docId);
}

export function pendingWrite(userRef, collection, docId, action, data) {
  const doc = buildPendingDoc({
    collection, docId, action, data, who: _submitter(),
    now: firebase.firestore.FieldValue.serverTimestamp(),
    isEdit: DeltaSync.wasDownloaded(collection, docId),
  });
  return { ref: userRef.collection('pending').doc(doc.id), doc };
}

function _announceSubmitted() {
  const now = Date.now();
  if (now - _lastToastAt < 8000) return;
  _lastToastAt = now;
  showToast('Sent to the admin for approval', 'info', 2500);
}

export async function submitPending(collection, docId, action, data) {
  const { ref, doc } = pendingWrite(dataRootRef(), collection, docId, action, data);
  await ref.set(doc);
  _markSubmitted(collection, docId);
  notifyAdminsPush(doc.id).catch(() => {});
  _announceSubmitted();
  return true;
}

export function submitPendingBatch(batch, userRef, collection, docId, action, data) {
  const { ref, doc } = pendingWrite(userRef, collection, docId, action, data);
  batch.set(ref, doc);
  notifyAdminsPush(doc.id).catch(() => {});
  return doc;
}

function _bumpUi() {
  if (typeof window.refreshAllDisplays === 'function') window.refreshAllDisplays().catch(() => {});
}

export async function revertLocal(p) {
  const key = getSQLiteKey(p.collection);
  let cloud = null;
  try {
    const snap = await dataRootRef().collection(p.collection).doc(p.docId).get();
    if (snap.exists) cloud = { id: p.docId, ...snap.data() };
  } catch (e) { console.warn('[approvals] could not read the approved copy:', _safeErr(e)); return false; }
  const arr = ensureArray(await sqliteStore.get(key)).filter(r => !(r && String(r.id) === p.docId));
  if (cloud) arr.push(cloud);
  await sqliteStore.set(key, arr);
  const dels = ensureArray(await sqliteStore.get('deletions')).filter(r => !(r && (String(r.id) === p.docId || String(r.recordId) === p.docId)));
  await sqliteStore.set('deletions', dels);
  const deleted = ensureArray(await sqliteStore.get('deleted')).filter(id => String(id) !== p.docId);
  await sqliteStore.set('deleted', deleted);
  _bumpUi();
  return true;
}

async function _resolveOwn(doc) {
  const p = doc.data();
  if (p.status !== 'approved' && p.status !== 'discarded') return;
  if (p.status === 'discarded') {
    const ok = await revertLocal(p);
    if (!ok) return;
  }
  const note = resolutionNotice(p, p.status, fmtAmt);
  showToast(`${note.title}: ${summarizePending(p, fmtAmt).body}`, p.status === 'approved' ? 'success' : 'warning', 3500);
  await doc.ref.delete().catch(() => {});
}

export function watchOwnPending(userRef) {
  return userRef.collection('pending').where('submittedBy.uid', '==', currentUser.uid).onSnapshot((snap) => {
    if (snap.metadata.fromCache) return;
    snap.docChanges().forEach((ch) => { if (ch.type !== 'removed') _resolveOwn(ch.doc).catch(e => console.warn('[approvals] resolve failed:', _safeErr(e))); });
  }, (e) => console.warn('[approvals] own pending listener:', _safeErr(e)));
}

function _updateBadge() {
  const n = _pending.length;
  document.querySelectorAll('[data-approvals-count]').forEach((el) => {
    el.textContent = n > 0 ? String(n) : '';
    el.classList.toggle('d-none', n === 0);
  });
}

export function watchPendingApprovals(userRef) {
  _firstSnapshot = true;
  registerAdminPush().catch(() => {});
  return userRef.collection('pending').where('status', '==', 'pending').onSnapshot((snap) => {
    if (snap.metadata.fromCache) return;
    _pending = snap.docs.map(d => d.data()).sort((a, b) => _ms(a.submittedAt) - _ms(b.submittedAt));
    _updateBadge();
    renderApprovals();
    _enrichDeletes().catch(() => {});
    const added = snap.docChanges().filter(c => c.type === 'added');
    if (!_firstSnapshot && added.length && typeof window.sendDeviceNotification === 'function' && !(window._pushActive && document.hidden)) {
      added.forEach((c) => {
        const p = c.doc.data();
        const s = summarizePending(p, fmtAmt);
        window.sendDeviceNotification('Approval needed', `${describeSubmitter(p)}: ${s.title} — ${s.body}`, 'approval-' + p.id, { key: 'approval-needed' }).catch(() => {});
      });
    }
    _firstSnapshot = false;
  }, (e) => console.warn('[approvals] pending listener:', _safeErr(e)));
}

function _ms(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return Number(ts) || 0;
}

function _decider() {
  return { uid: currentUser.uid, name: window._assignedManagerName || (currentUser.displayName) || String(currentUser.email || '').split('@')[0] };
}

async function _upsertLocal(p) {
  const key = getSQLiteKey(p.collection);
  const arr = ensureArray(await sqliteStore.get(key));
  const rec = { ...p.data, id: p.docId };
  const i = arr.findIndex(r => r && String(r.id) === p.docId);
  if (i >= 0) arr[i] = { ...arr[i], ...rec }; else arr.push(rec);
  await sqliteStore.set(key, arr);
  _markSubmitted(p.collection, p.docId);
}

const _cloudCache = new Map();

function _ctx() {
  return { fmt: fmtAmt, num: fmtNum, store: getStoreLabel, when: (d, t) => (d ? formatDisplayDateTime(d, t || null) : '') };
}

async function _enrichDeletes() {
  const need = _pending.filter(p => p.action === 'delete' && !p._cloud && !_cloudCache.has(p.id));
  if (!need.length) return;
  await Promise.all(need.map(async (p) => {
    try {
      const snap = await dataRootRef().collection(p.collection).doc(p.docId).get();
      _cloudCache.set(p.id, snap.exists ? snap.data() : {});
    } catch (_) { _cloudCache.set(p.id, {}); }
  }));
  _pending.forEach((p) => { if (_cloudCache.has(p.id) && Object.keys(_cloudCache.get(p.id)).length) p._cloud = _cloudCache.get(p.id); });
  renderApprovals();
}

function _writeApproval(batch, userRef, p) {
  const FV = firebase.firestore.FieldValue;
  const target = userRef.collection(p.collection).doc(p.docId);
  if (p.action === 'delete') {
    batch.delete(target);
    batch.set(userRef.collection('deletions').doc(p.docId), {
      id: p.docId, recordId: p.docId, collection: p.collection, recordType: p.collection,
      deletedAt: FV.serverTimestamp(),
      expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + APP_CONFIG.TOMBSTONE_EXPIRY_MS),
    }, { merge: true });
  } else {
    batch.set(target, { ...p.data, id: p.docId, approvedBy: _decider().name, updatedAt: FV.serverTimestamp() }, { merge: true });
    batch.delete(userRef.collection('deletions').doc(p.docId));
  }
  batch.set(userRef.collection('pending').doc(p.id), { status: 'approved', decidedBy: _decider(), decidedAt: FV.serverTimestamp() }, { merge: true });
}

export async function approveMany(list) {
  const userRef = dataRootRef();
  const batch = firebaseDB.batch();
  list.forEach(p => _writeApproval(batch, userRef, p));
  await batch.commit();
  for (const p of list) { if (p.action !== 'delete') await _upsertLocal(p); }
}

export async function discardMany(list) {
  const userRef = dataRootRef();
  const FV = firebase.firestore.FieldValue;
  const batch = firebaseDB.batch();
  list.forEach(p => batch.set(userRef.collection('pending').doc(p.id), { status: 'discarded', decidedBy: _decider(), decidedAt: FV.serverTimestamp() }, { merge: true }));
  await batch.commit();
}

export function approveOne(p) { return approveMany([p]); }
export function discardOne(p) { return discardMany([p]); }

function _groups(day) {
  const all = groupPending(_pending);
  if (!day) return all;
  const ctx = _ctx();
  return all.filter(g => ledgerRow(g, ctx).dkey === day);
}

function _group(id) {
  return _groups().find(g => g.id === id);
}

function _openSheet(html) {
  const sheet = document.getElementById('cm-sheet');
  const back = document.getElementById('cm-sheet-backdrop');
  if (!sheet || !back) return false;
  sheet.innerHTML = html;
  back.classList.add('is-open');
  sheet.classList.add('is-open');
  return true;
}

export function openApprovalSheet(id) {
  const g = _group(id);
  if (!g) return;
  const m = ledgerSheet(g, _ctx());
  const delWord = g.main.action === 'delete' ? 'Approve Delete' : 'Approve';
  _openSheet(ledgerSheetHtml(m,
    `<button type="button" class="btn btn-danger" data-id="${esc(g.id)}" onclick="decideApproval('discard',this.dataset.id)">Discard</button>` +
    `<button type="button" class="btn btn-main u-mt-8" data-id="${esc(g.id)}" onclick="decideApproval('approve',this.dataset.id)">${delWord}</button>`));
}

export function openBulkSheet(kind, day) {
  const groups = _groups(day);
  if (!groups.length) return;
  const m = bulkSheetModel(kind, groups);
  const confirm = kind === 'approve'
    ? `<button type="button" class="btn btn-main u-mt-8" data-day="${esc(day || '')}" onclick="decideAllApprovals('approve',this.dataset.day)">${esc(m.confirmText)}</button>`
    : `<button type="button" class="btn btn-danger" data-day="${esc(day || '')}" onclick="decideAllApprovals('discard',this.dataset.day)">${esc(m.confirmText)}</button>`;
  _openSheet(ledgerSheetHtml({ title: m.title, amtText: '', rIn: false, lines: m.lines, typeLine: '', sectionLines: [], stripLabel: 'Waiting for approval', stripText: m.submittedLine, note: m.note },
    `<button type="button" class="btn btn-theme" onclick="closeCustomerTxnSheet()">Cancel</button>${confirm}`));
}

function _closeSheet() {
  if (typeof window.closeCustomerTxnSheet === 'function') window.closeCustomerTxnSheet();
}

export async function decideApproval(kind, id) {
  const g = _group(id);
  _closeSheet();
  if (!g || _busy.has(id)) return;
  if (!navigator.onLine) { window.notifyBlocking('Internet is required to approve or discard actions.', 'warning', 'No Internet'); return; }
  _busy.add(id);
  const members = groupMembers(g);
  try {
    if (kind === 'approve') await approveMany(members); else await discardMany(members);
    const done = new Set(members.map(x => x.id));
    _pending = _pending.filter(x => !done.has(x.id));
    _updateBadge();
    renderApprovals();
    if (kind === 'approve') _bumpUi();
    showToast(kind === 'approve' ? 'Approved' : 'Discarded', 'success', 1800);
  } catch (e) {
    window.notifyBlocking(kind === 'approve'
      ? 'The action could not be approved. Check your connection and try again.'
      : 'The action could not be discarded. Check your connection and try again.', 'error', kind === 'approve' ? 'Not Approved' : 'Not Discarded');
    console.error('[approvals] decision failed:', _safeErr(e));
  } finally { _busy.delete(id); }
}

export async function decideAllApprovals(kind, day) {
  const groups = _groups(day);
  _closeSheet();
  if (!groups.length) return;
  if (!navigator.onLine) { window.notifyBlocking('Internet is required to approve or discard actions.', 'warning', 'No Internet'); return; }
  let done = 0;
  let failed = 0;
  for (const g of groups) {
    const members = groupMembers(g);
    try {
      if (kind === 'approve') await approveMany(members); else await discardMany(members);
      const ids = new Set(members.map(x => x.id));
      _pending = _pending.filter(x => !ids.has(x.id));
      done++;
    } catch (e) { failed++; console.error('[approvals] bulk decision failed:', _safeErr(e)); }
  }
  _updateBadge();
  renderApprovals();
  if (kind === 'approve') _bumpUi();
  if (failed) window.notifyBlocking(`${done} done, ${failed} could not be saved. They are still waiting; try again.`, 'warning', 'Some Not Saved');
  else showToast(`${kind === 'approve' ? 'Approved' : 'Discarded'} ${done}`, 'success', 2200);
}

export function approveAllPending() { openBulkSheet('approve'); }
export function discardAllPending() { openBulkSheet('discard'); }
export function approveDayPending(day) { openBulkSheet('approve', day); }
export function discardDayPending(day) { openBulkSheet('discard', day); }

export function renderApprovals() {
  const list = document.getElementById('approvals-list');
  const summary = document.getElementById('approvals-summary');
  const bulk = document.getElementById('approvals-bulk');
  if (summary) summary.textContent = pendingSummaryLine(_pending);
  if (bulk) bulk.classList.toggle('d-none', _pending.length === 0);
  if (!list) return;
  const groups = _groups();
  if (!groups.length) { list.className = ''; list.innerHTML = '<div class="empty is-boxed"><div class="empty-title">All caught up</div><p>Nothing is waiting for approval.</p></div>'; return; }
  const ctx = _ctx();
  list.className = 'cm-list';
  list.innerHTML = ledgerListHtml(groups.map((g) => ledgerRow(g, ctx)));
}

export function stopApprovalState() {
  _pending = [];
  _updateBadge();
}

window.openApprovalSheet = openApprovalSheet;
window.decideApproval = decideApproval;
window.decideAllApprovals = decideAllApprovals;
window.approveAllPending = approveAllPending;
window.discardAllPending = discardAllPending;
window.approveDayPending = approveDayPending;
window.discardDayPending = discardDayPending;
window.renderApprovals = renderApprovals;
window.isGatedSession = isGatedSession;
window.submitPending = submitPending;
window.gatesCollection = gates;
