import { _safeErr, _set_salesRepsList, currentUser, dataRootRef, dataRootUid, esc, firebaseDB, salesRepsList } from './business.js';
import { confirmGuard } from './confirm-guard.js';
import { showGlassConfirm, showToast } from './customers.js';
import { firebaseConfig } from './utilities-sales.js';
import {
  ROLE_KEYS, ROLE_LABELS, canAdoptAccount, cleanRoles, deriveSession, isLegacyAccount, normalizeRoles,
  readRolesCache, resolveOwnerUid, structureKey, toggleRole, writeRolesCache,
} from './roles.js';

const MIN_PASSWORD = 8;
const SESSION_FETCH_TIMEOUT_MS = 8000;
const _newRoles = new Set();
let _accounts = [];

export function _accountsIndexRef() {
  return dataRootRef().collection('settings').doc('accounts');
}

export async function _readAccountsIndex() {
  const snap = await _accountsIndexRef().get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  return Array.isArray(data.accounts) ? data.accounts : [];
}

export async function _writeAccountsIndex(accounts) {
  await _accountsIndexRef().set({ accounts, updatedAt: Date.now() }, { merge: false });
}

async function _patchAccountsIndex(uid, entry) {
  const list = await _readAccountsIndex().catch(() => []);
  const rest = list.filter(a => a.uid !== uid);
  await _writeAccountsIndex(entry ? [...rest, entry] : rest);
}

function _entryFromDoc(uid, d) {
  return {
    uid,
    email: d.email || '',
    name: d.displayName || d.name || '',
    roles: normalizeRoles(d),
    approved: d.approved !== false,
    ownerUid: d.ownerUid || '',
    createdAt: d.createdAt || 0,
    createdBy: d.createdBy || '',
  };
}

function _repKey(name) {
  return String(name || '').trim().toUpperCase();
}

export async function ensureRepInList(name) {
  const rep = _repKey(name);
  if (!rep) return false;
  const list = Array.isArray(salesRepsList) ? salesRepsList : [];
  if (list.some(r => _repKey(r) === rep)) return false;
  _set_salesRepsList([...list, rep]);
  if (typeof window.saveSalesRepsList === 'function') await window.saveSalesRepsList();
  return true;
}

function _roleButtons(activeRoles, attrs, handler) {
  const active = new Set(activeRoles);
  return ROLE_KEYS.map(role =>
    `<button type="button" class="toggle-opt acct-role-btn${active.has(role) ? ' active' : ''}" ${attrs} data-role="${role}" onclick="${handler}">${ROLE_LABELS[role]}</button>`
  ).join('');
}

export function renderNewAccountRoles() {
  ROLE_KEYS.forEach(role => {
    const btn = document.getElementById('acct-role-' + role);
    if (btn) btn.classList.toggle('active', _newRoles.has(role));
  });
}

export function toggleNewAccountRole(role) {
  if (!ROLE_KEYS.includes(role)) return;
  if (_newRoles.has(role)) _newRoles.delete(role); else _newRoles.add(role);
  renderNewAccountRoles();
}

function _setMsg(text, tone) {
  const el = document.getElementById('acct-add-msg');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('acct-msg-ok', 'acct-msg-err', 'acct-msg-info');
  if (tone) el.classList.add('acct-msg-' + tone);
}

export function adminAddAccount(...a) {
  return confirmGuard('adminAddAccount', () => _adminAddAccountRaw(...a), {
    label: 'Account', late: true, verb: 'Add',
    fields: [['acct-new-email', 'Email'], ['acct-new-name', 'Name'], [() => cleanRoles([..._newRoles]).map(r => ROLE_LABELS[r]).join(', '), 'Roles']],
  });
}

async function _adminAddAccountRaw() {
  const emailEl = document.getElementById('acct-new-email');
  const passEl = document.getElementById('acct-new-password');
  const nameEl = document.getElementById('acct-new-name');
  const btn = document.getElementById('acct-add-btn');
  if (!emailEl || !passEl || !nameEl) return;
  const email = emailEl.value.trim().toLowerCase();
  const password = passEl.value;
  const name = nameEl.value.trim();
  const roles = cleanRoles([..._newRoles]);
  if (!email) { _setMsg('Enter an email address.', 'err'); return; }
  if (password.length < MIN_PASSWORD) { _setMsg(`Password must be at least ${MIN_PASSWORD} characters.`, 'err'); return; }
  if (!name) { _setMsg('Enter a name.', 'err'); return; }
  if (roles.length === 0) { _setMsg('Select at least one role.', 'err'); return; }
  if (!navigator.onLine) { _setMsg('Internet required to create accounts.', 'err'); return; }
  if (!currentUser || !firebaseDB) { _setMsg('Sign in again to manage accounts.', 'err'); return; }
  if (!(await window.gcCommit({}))) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  _setMsg('Saving account...', 'info');
  const wsUid = dataRootUid();
  let secondaryAuth = null;
  try {
    const secondaryApp = firebase.apps.find(a => a.name === '_adminCreate') || firebase.initializeApp(firebaseConfig, '_adminCreate');
    secondaryAuth = secondaryApp.auth();
    let uid;
    let adopted = false;
    try {
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      uid = cred.user.uid;
    } catch (err) {
      if ((err && err.code) !== 'auth/email-already-in-use') throw err;
      try {
        const cred = await secondaryAuth.signInWithEmailAndPassword(email, password);
        uid = cred.user.uid;
        adopted = true;
      } catch (_signInErr) {
        _setMsg('This email is already registered and the password does not match its existing login.', 'err');
        return;
      }
    }
    await secondaryAuth.signOut().catch(() => {});
    let existing = null;
    if (adopted) {
      const snap = await firebaseDB.collection('users').doc(uid).get().catch(() => null);
      existing = snap && snap.exists ? snap.data() : null;
      const known = new Set((await _readAccountsIndex().catch(() => [])).map(x => x.uid));
      const verdict = canAdoptAccount(existing, uid, wsUid, known);
      if (!verdict.ok) { _setMsg('This login belongs to another workspace and cannot be added here.', 'err'); return; }
    }
    const isOwnerAcct = uid === wsUid || uid === currentUser.uid;
    if (isOwnerAcct && !roles.includes('admin')) { _setMsg('Your own account must keep the Admin role.', 'err'); return; }
    const FV = firebase.firestore.FieldValue;
    const payload = { email, displayName: name, roles, approved: true, role: FV.delete() };
    if (!isOwnerAcct) payload.ownerUid = wsUid;
    if (!adopted || !existing) { payload.createdAt = Date.now(); payload.createdBy = currentUser.email; }
    await firebaseDB.collection('users').doc(uid).set(payload, { merge: true });
    await _patchAccountsIndex(uid, {
      uid, email, name, roles, approved: true, ownerUid: isOwnerAcct ? '' : wsUid,
      createdAt: (existing && existing.createdAt) || Date.now(), createdBy: (existing && existing.createdBy) || currentUser.email,
    });
    if (roles.includes('rep')) await ensureRepInList(name);
    emailEl.value = '';
    passEl.value = '';
    nameEl.value = '';
    _newRoles.clear();
    renderNewAccountRoles();
    _setMsg(adopted ? 'Existing login added to your workspace.' : 'Account created successfully.', 'ok');
    showToast((adopted ? 'Account updated: ' : 'Account created: ') + email, 'success');
    await loadAccountsList();
  } catch (err) {
    const code = (err && err.code) || '';
    if (code === 'auth/invalid-email') _setMsg('Invalid email address.', 'err');
    else if (code === 'auth/weak-password') _setMsg('Password too weak.', 'err');
    else if (code === 'permission-denied') _setMsg('Permission denied. Only an active Admin can manage accounts.', 'err');
    else _setMsg('Failed: ' + ((err && err.message) || code), 'err');
    console.error('adminAddAccount error:', _safeErr(err));
  } finally {
    if (secondaryAuth) secondaryAuth.signOut().catch(() => {});
    if (btn) { btn.disabled = false; btn.textContent = 'Add Account'; }
  }
}

export function unlinkedReps(reps, accounts) {
  const linked = new Set(accounts.filter(a => a.roles.includes('rep')).map(a => _repKey(a.name || String(a.email || '').split('@')[0])));
  const seen = new Set();
  return (Array.isArray(reps) ? reps : []).map(_repKey).filter(r => r && !linked.has(r) && !seen.has(r) && seen.add(r));
}

export function renderExistingReps() {
  const box = document.getElementById('acct-existing-reps');
  if (!box) return;
  const pending = unlinkedReps(salesRepsList, _accounts);
  if (pending.length === 0) { box.classList.add('d-none'); box.replaceChildren(); return; }
  box.classList.remove('d-none');
  box.innerHTML = '<div class="acct-sub">Existing reps without a login. Tap a name to create or adopt their account; the name is kept exactly so their sales history stays theirs.</div>' +
    '<div class="acct-roles">' + pending.map(name =>
      `<button type="button" class="toggle-opt acct-role-btn" data-rep="${esc(name)}" onclick="prefillRepAccount(this.dataset.rep)">${esc(name)}</button>`
    ).join('') + '</div>';
}

export function prefillRepAccount(name) {
  const nameEl = document.getElementById('acct-new-name');
  const emailEl = document.getElementById('acct-new-email');
  if (!nameEl) return;
  nameEl.value = _repKey(name);
  _newRoles.clear();
  _newRoles.add('rep');
  renderNewAccountRoles();
  if (emailEl) emailEl.focus();
  _setMsg('Enter the rep\'s email and password. If the email already has a login, use its current password to adopt it.', 'info');
}

function _protectedUid(uid) {
  return !!currentUser && (uid === currentUser.uid || uid === dataRootUid());
}

export function renderAccountsList() {
  const listEl = document.getElementById('manage-accounts-list');
  if (!listEl) return;
  renderExistingReps();
  if (_accounts.length === 0) {
    listEl.innerHTML = '<div class="u-ed93e92">No accounts found.</div>';
    return;
  }
  listEl.innerHTML = _accounts.map(acct => {
    const isMe = !!currentUser && acct.uid === currentUser.uid;
    const isOwner = acct.uid === dataRootUid();
    const approved = acct.approved !== false;
    const uidAttr = `data-uid="${esc(acct.uid)}"`;
    const title = esc(acct.name || acct.email || acct.uid);
    const tag = isMe ? ' <em class="acct-tag">(you)</em>' : (isOwner ? ' <em class="acct-tag">(owner)</em>' : '');
    const actions = _protectedUid(acct.uid) ? '' : [
      `<button type="button" class="btn btn-theme acct-action ${approved ? 'acct-suspend' : 'acct-reinstate'}" ${uidAttr} data-email="${esc(acct.email || '')}" data-approved="${approved}" onclick="adminToggleApproval(this.dataset.uid,this.dataset.email,this.dataset.approved==='true')">${approved ? 'Suspend' : 'Reinstate'}</button>`,
      `<button type="button" class="btn btn-theme acct-action acct-remove" ${uidAttr} data-email="${esc(acct.email || '')}" onclick="adminRemoveAccount(this.dataset.uid,this.dataset.email)">Remove</button>`,
    ].join('');
    return `<div class="acct-row${approved ? '' : ' is-suspended'}">` +
      '<div class="acct-head">' +
      `<span class="acct-dot${approved ? '' : ' off'}"></span>` +
      `<div class="acct-id"><div class="acct-name">${title}${tag}</div>` +
      `<div class="acct-sub">${esc(acct.email || '')}${approved ? '' : ' · Suspended'}</div></div>` +
      '</div>' +
      `<div class="acct-roles">${_roleButtons(acct.roles, uidAttr, 'adminSetAccountRole(this.dataset.uid,this.dataset.role)')}</div>` +
      (actions ? `<div class="acct-actions">${actions}</div>` : '') +
      '</div>';
  }).join('');
}

export async function loadAccountsList() {
  const listEl = document.getElementById('manage-accounts-list');
  renderNewAccountRoles();
  if (!listEl) return;
  if (!navigator.onLine) {
    listEl.innerHTML = '<div class="u-ed93e92">Internet required to load accounts.</div>';
    return;
  }
  listEl.innerHTML = '<div class="u-ed93e92">Loading...</div>';
  try {
    const wsUid = dataRootUid();
    const users = firebaseDB.collection('users');
    const [ownerSnap, meSnap, indexed, owned] = await Promise.all([
      users.doc(wsUid).get().catch(() => null),
      users.doc(currentUser.uid).get().catch(() => null),
      _readAccountsIndex().catch(() => []),
      users.where('ownerUid', '==', wsUid).get().catch(() => null),
    ]);
    const byUid = new Map();
    indexed.forEach(a => { if (a && a.uid) byUid.set(a.uid, { ..._entryFromDoc(a.uid, a), approved: a.approved !== false }); });
    const live = new Set();
    const take = (snap) => { if (snap && snap.exists) { byUid.set(snap.id, _entryFromDoc(snap.id, snap.data() || {})); live.add(snap.id); } };
    take(ownerSnap);
    take(meSnap);
    if (owned) owned.docs.forEach(take);
    const stale = [...byUid.keys()].filter(uid => !live.has(uid));
    const refreshed = await Promise.all(stale.map(uid => users.doc(uid).get().catch(() => null)));
    refreshed.forEach((snap, i) => {
      if (snap && snap.exists) byUid.set(snap.id, _entryFromDoc(snap.id, snap.data() || {}));
      else if (snap && !snap.exists) byUid.delete(stale[i]);
    });
    _accounts = [...byUid.values()].sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    renderAccountsList();
  } catch (err) {
    listEl.innerHTML = '<div class="u-e135e79">Failed to load: ' + esc((err && err.message) || '') + '</div>';
    console.error('loadAccountsList:', _safeErr(err));
  }
}

export async function adminSetAccountRole(uid, role) {
  const acct = _accounts.find(a => a.uid === uid);
  if (!acct || !ROLE_KEYS.includes(role)) return;
  const next = toggleRole(acct.roles, role);
  if (_protectedUid(uid) && !next.includes('admin')) {
    window.notifyBlocking('The Admin role cannot be removed from your own account or the workspace owner.', 'warning', 'Warning');
    return;
  }
  if (!navigator.onLine) { window.notifyBlocking('Internet required to change roles.', 'warning', 'Warning'); return; }
  const previous = acct.roles;
  acct.roles = next;
  renderAccountsList();
  try {
    await firebaseDB.collection('users').doc(uid).set({ roles: next, role: firebase.firestore.FieldValue.delete() }, { merge: true });
    await _patchAccountsIndex(uid, { ...acct, roles: next });
    if (next.includes('rep') && !previous.includes('rep')) await ensureRepInList(acct.name || (acct.email || '').split('@')[0]);
  } catch (err) {
    acct.roles = previous;
    renderAccountsList();
    window.notifyBlocking('Failed to update roles.', 'error', 'Something went wrong');
    console.error('adminSetAccountRole:', _safeErr(err));
  }
}

export async function adminToggleApproval(uid, email, currentlyApproved) {
  if (_protectedUid(uid)) { window.notifyBlocking('You cannot suspend your own account or the workspace owner.', 'warning', 'Warning'); return; }
  const confirmed = await showGlassConfirm(
    (currentlyApproved ? 'Suspend' : 'Reinstate') + ' the account for ' + email + '?' +
    (currentlyApproved ? '\n\nThey will be signed out immediately.' : '\n\nThey will be able to sign in again.'),
    {
      title: currentlyApproved ? 'Suspend Account' : 'Reinstate Account',
      confirmText: currentlyApproved ? 'Suspend' : 'Reinstate', cancelText: 'Cancel', danger: currentlyApproved,
    }
  );
  if (!confirmed) return;
  try {
    const update = { approved: !currentlyApproved };
    if (currentlyApproved) update.forceLogout = { at: Date.now(), by: currentUser.email };
    await firebaseDB.collection('users').doc(uid).set(update, { merge: true });
    const acct = _accounts.find(a => a.uid === uid);
    if (acct) { acct.approved = !currentlyApproved; await _patchAccountsIndex(uid, { ...acct }); }
    renderAccountsList();
  } catch (err) {
    window.notifyBlocking('Failed to update account.', 'error', 'Something went wrong');
    console.error('adminToggleApproval:', _safeErr(err));
  }
}

export async function adminRemoveAccount(uid, email) {
  if (_protectedUid(uid)) { window.notifyBlocking('You cannot remove your own account or the workspace owner.', 'warning', 'Warning'); return; }
  const confirmed = await showGlassConfirm(
    'Remove ' + email + '?\n\nThey are signed out immediately and lose access. Workspace data is kept.\n\nTheir login still exists in Firebase Authentication; adding the same email again re-uses it.',
    { title: 'Remove Account', confirmText: 'Remove', cancelText: 'Cancel', danger: true }
  );
  if (!confirmed) return;
  try {
    const ref = firebaseDB.collection('users').doc(uid);
    await ref.set({ approved: false, removedAt: Date.now(), removedBy: currentUser.email, forceLogout: { at: Date.now(), by: currentUser.email } }, { merge: true });
    await ref.delete();
    await _patchAccountsIndex(uid, null);
    _accounts = _accounts.filter(a => a.uid !== uid);
    renderAccountsList();
  } catch (err) {
    window.notifyBlocking('Failed to remove account.', 'error', 'Something went wrong');
    console.error('adminRemoveAccount:', _safeErr(err));
  }
}

export function accountInfoFromDoc(data, user) {
  const d = data || {};
  const uid = user.uid;
  const fallbackName = String(user.email || '').split('@')[0];
  return {
    uid,
    email: String(user.email || '').toLowerCase(),
    name: String(d.displayName || user.displayName || fallbackName || '').trim(),
    roles: normalizeRoles(d),
    ownerUid: resolveOwnerUid(d, uid),
    legacy: isLegacyAccount(d, uid),
    approved: d.approved !== false,
  };
}

export function applyAccountSession(info) {
  window._userRoles = info.roles;
  window._workspaceOwnerUid = info.ownerUid || null;
  if (info.legacy) return info;
  const session = deriveSession(info.roles);
  const key = structureKey(session, info.ownerUid);
  const applied = window._appliedSession;
  if (applied === key) {
    window._assignedManagerName = info.name || null;
    if (typeof window.updateSystemName === 'function') window.updateSystemName();
    return info;
  }
  const freshAdmin = !applied && session.mode === 'admin' && window.appMode === 'admin';
  if (typeof window.applySessionState === 'function') window.applySessionState(session, info.name);
  if (freshAdmin) return info;
  let alreadyReloaded = false;
  try {
    alreadyReloaded = sessionStorage.getItem('_gznd_roles_reload') === key;
    sessionStorage.setItem('_gznd_roles_reload', key);
  } catch (_) { }
  if (!alreadyReloaded) {
    showToast('Your access was updated. Applying…', 'info', 2000);
    setTimeout(() => { window.location.reload(); }, 1200);
  }
  return info;
}

export async function syncAccountSession(user, preloaded) {
  if (!user || !user.uid) return null;
  let data = preloaded || null;
  if (!data && navigator.onLine && firebaseDB) {
    const deadline = Date.now() + SESSION_FETCH_TIMEOUT_MS;
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      try {
        const snap = await Promise.race([
          firebaseDB.collection('users').doc(user.uid).get(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), Math.max(1000, deadline - Date.now()))),
        ]);
        if (snap.exists) data = snap.data();
        break;
      } catch (e) {
        const transient = /offline|unavailable/i.test(String((e && (e.code || e.message)) || ''));
        if (!transient || attempt === 3 || Date.now() >= deadline) { console.warn('[accounts] could not load account doc:', _safeErr(e)); break; }
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  if (data) {
    const info = accountInfoFromDoc(data, user);
    writeRolesCache(info);
    return applyAccountSession(info);
  }
  return applyCachedAccountSession(user.email, user.uid);
}

export function applyCachedAccountSession(email, uid) {
  const cached = readRolesCache();
  if (!cached) return null;
  const sameEmail = email && cached.email === String(email).toLowerCase();
  const sameUid = uid && cached.uid === uid;
  if (!sameEmail && !sameUid) return null;
  return applyAccountSession(cached);
}

window._accountsIndexRef = _accountsIndexRef;
window._readAccountsIndex = _readAccountsIndex;
window._writeAccountsIndex = _writeAccountsIndex;
window.toggleNewAccountRole = toggleNewAccountRole;
window.adminAddAccount = adminAddAccount;
window.loadAccountsList = loadAccountsList;
window.adminSetAccountRole = adminSetAccountRole;
window.prefillRepAccount = prefillRepAccount;
window.adminToggleApproval = adminToggleApproval;
window.adminRemoveAccount = adminRemoveAccount;
window.applyAccountSession = applyAccountSession;
window.syncAccountSession = syncAccountSession;
window.accountInfoFromDoc = accountInfoFromDoc;
