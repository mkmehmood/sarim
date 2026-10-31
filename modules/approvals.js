import { _safeErr, appMode, currentUser, dataRootRef, ensureArray, esc, firebaseDB, fmtAmt, sqliteStore } from './business.js';
import { APP_CONFIG } from './constants.js';
import { showGlassConfirm, showToast } from './customers.js';
import { formatDateTime } from './date-format.js';
import { DeltaSync, UUIDSyncRegistry } from './utilities-sales.js';
import { getSQLiteKey } from './sync.js';
import {
  approveConfirm, bulkConfirm, buildPendingDoc, describeSubmitter, discardConfirm, groupBySubmitter,
  isGatedCollection, pendingSummaryLine, resolutionNotice, summarizePending,
} from './approvals-core.js';

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
  _announceSubmitted();
  return true;
}

export function submitPendingBatch(batch, userRef, collection, docId, action, data) {
  const { ref, doc } = pendingWrite(userRef, collection, docId, action, data);
  batch.set(ref, doc);
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
  return userRef.collection('pending').where('status', '==', 'pending').onSnapshot((snap) => {
    if (snap.metadata.fromCache) return;
    _pending = snap.docs.map(d => d.data()).sort((a, b) => _ms(a.submittedAt) - _ms(b.submittedAt));
    _updateBadge();
    renderApprovals();
    const added = snap.docChanges().filter(c => c.type === 'added');
    if (!_firstSnapshot && added.length && typeof window.sendDeviceNotification === 'function') {
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

export async function approveOne(p) {
  const userRef = dataRootRef();
  const FV = firebase.firestore.FieldValue;
  const batch = firebaseDB.batch();
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
  await batch.commit();
  if (p.action !== 'delete') await _upsertLocal(p);
}

export async function discardOne(p) {
  await dataRootRef().collection('pending').doc(p.id).set(
    { status: 'discarded', decidedBy: _decider(), decidedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

function _find(id) {
  return _pending.find(p => p.id === id);
}

async function _runOne(id, kind) {
  const p = _find(id);
  if (!p || _busy.has(id)) return;
  if (!navigator.onLine) { window.notifyBlocking('Internet is required to approve or discard actions.', 'warning', 'No Internet'); return; }
  const c = kind === 'approve' ? approveConfirm(p, fmtAmt) : discardConfirm(p, fmtAmt);
  const ok = await showGlassConfirm(c.message, { title: c.title, confirmText: c.confirmText, cancelText: 'Cancel', danger: c.danger });
  if (!ok) return;
  _busy.add(id);
  try {
    if (kind === 'approve') await approveOne(p); else await discardOne(p);
    _pending = _pending.filter(x => x.id !== id);
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

export function approvePending(id) { return _runOne(id, 'approve'); }
export function discardPending(id) { return _runOne(id, 'discard'); }

async function _runAll(kind) {
  const items = [..._pending];
  if (!items.length) return;
  if (!navigator.onLine) { window.notifyBlocking('Internet is required to approve or discard actions.', 'warning', 'No Internet'); return; }
  const c = bulkConfirm(kind, items);
  const ok = await showGlassConfirm(c.message, { title: c.title, confirmText: c.confirmText, cancelText: 'Cancel', danger: c.danger });
  if (!ok) return;
  let done = 0;
  const failed = [];
  for (const p of items) {
    try { if (kind === 'approve') await approveOne(p); else await discardOne(p); done++; _pending = _pending.filter(x => x.id !== p.id); }
    catch (e) { failed.push(p); console.error('[approvals] bulk decision failed:', _safeErr(e)); }
  }
  _updateBadge();
  renderApprovals();
  if (kind === 'approve') _bumpUi();
  if (failed.length) window.notifyBlocking(`${done} done, ${failed.length} could not be saved. They are still waiting; try again.`, 'warning', 'Some Not Saved');
  else showToast(`${kind === 'approve' ? 'Approved' : 'Discarded'} ${done}`, 'success', 2200);
}

export function approveAllPending() { return _runAll('approve'); }
export function discardAllPending() { return _runAll('discard'); }

export function renderApprovals() {
  const list = document.getElementById('approvals-list');
  const summary = document.getElementById('approvals-summary');
  const bulk = document.getElementById('approvals-bulk');
  if (summary) summary.textContent = pendingSummaryLine(_pending);
  if (bulk) bulk.classList.toggle('d-none', _pending.length === 0);
  if (!list) return;
  if (_pending.length === 0) { list.innerHTML = '<div class="u-ed93e92">All caught up.</div>'; return; }
  list.innerHTML = groupBySubmitter(_pending).map(g =>
    `<div class="acct-sub">${esc(g.name)} · ${g.items.length}</div>` + g.items.map((p) => {
      const s = summarizePending(p, fmtAmt);
      const when = _ms(p.submittedAt) ? formatDateTime(_ms(p.submittedAt)) : '';
      return '<div class="acct-row">' +
        `<div class="acct-head"><div class="acct-id"><div class="acct-name">${esc(s.title)}</div><div class="acct-sub">${esc(s.body)}${when ? ' · ' + esc(when) : ''}</div></div></div>` +
        '<div class="acct-actions">' +
        `<button type="button" class="btn btn-theme acct-action acct-remove" data-id="${esc(p.id)}" onclick="discardPending(this.dataset.id)">Discard</button>` +
        `<button type="button" class="btn btn-theme acct-action acct-reinstate" data-id="${esc(p.id)}" onclick="approvePending(this.dataset.id)">Approve</button>` +
        '</div></div>';
    }).join('')
  ).join('');
}

export function stopApprovalState() {
  _pending = [];
  _updateBadge();
}

window.approvePending = approvePending;
window.discardPending = discardPending;
window.approveAllPending = approveAllPending;
window.discardAllPending = discardAllPending;
window.renderApprovals = renderApprovals;
window.isGatedSession = isGatedSession;
window.submitPending = submitPending;
window.gatesCollection = gates;
