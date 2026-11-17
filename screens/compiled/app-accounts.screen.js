
// ==== module: accounts.js ====
import { _safeErr, _set_salesRepsList, currentUser, dataRootRef, dataRootUid, ensureArray, esc, firebaseDB, salesRepsList, sqliteStore } from '../../modules/business.js';
import { REP_DATA_STORES, repRemovalPlan, withoutRep } from '../../modules/rep-data.js';
import { confirmGuard } from '../../modules/confirm-guard.js';
import { showGlassConfirm, showToast } from '../../modules/customers.js';
import { firebaseConfig } from '../../modules/utilities-sales.js';
import { ROLE_KEYS, ROLE_LABELS, canAdoptAccount, cleanRoles, describeRoleChange, normalizeRoles, toggleRole } from '../../modules/roles.js';

const MIN_PASSWORD = 8;
const _newRoles = new Set();
let _accounts = [];
const _roleBusy = new Set();
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
function _repNameOf(acct) {
  return acct.name || String(acct.email || '').split('@')[0];
}
async function _repRemovalPlan(acct) {
  const stores = {};
  for (const key of REP_DATA_STORES) stores[key] = ensureArray(await sqliteStore.get(key));
  return repRemovalPlan(_repNameOf(acct), stores, salesRepsList);
}
async function _dropRepFromList(acct) {
  const next = withoutRep(salesRepsList, _repNameOf(acct));
  if (next.length === (Array.isArray(salesRepsList) ? salesRepsList.length : 0)) return false;
  _set_salesRepsList(next);
  if (typeof window.saveSalesRepsList === 'function') await window.saveSalesRepsList();
  return true;
}
function _blockedRepMessage(acct, plan) {
  return `${_who(acct)} has ${plan.count} record${plan.count === 1 ? '' : 's'} as a sales rep (sales, customers or payments), so the Sales Rep role cannot be removed. Remove or reassign those records first.`;
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
export function resetAccountForm() {
  ['acct-new-email', 'acct-new-password', 'acct-new-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _newRoles.clear();
  renderNewAccountRoles();
}
export function toggleNewAccountRole(role) {
  if (!ROLE_KEYS.includes(role)) return;
  if (_newRoles.has(role)) _newRoles.delete(role); else _newRoles.add(role);
  renderNewAccountRoles();
}
function _warn(title, message) {
  window.notifyBlocking(message, 'warning', title);
}
function _fail(title, message) {
  window.notifyBlocking(message, 'error', title);
}
function _who(acct) {
  return (acct && (acct.name || acct.email)) || 'this account';
}
function _roleNames(roles) {
  return cleanRoles(roles).map(r => ROLE_LABELS[r]).join(', ') || 'none';
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
  if (!email) { _warn('Email Required', 'Enter an email address for the new account.'); return; }
  if (password.length < MIN_PASSWORD) { _warn('Password Too Short', `The password must be at least ${MIN_PASSWORD} characters.`); return; }
  if (!name) { _warn('Name Required', 'Enter the name of the person who will use this account.'); return; }
  if (roles.length === 0) { _warn('Select a Role', 'Choose at least one role. The account sees only the tabs of the roles you select.'); return; }
  if (!navigator.onLine) { _warn('No Internet', 'Internet is required to create or change accounts.'); return; }
  if (!currentUser || !firebaseDB) { _warn('Sign In Again', 'Sign in again to manage accounts.'); return; }
  if (!(await window.gcCommit({}))) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
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
        _warn('Email Already Registered', 'This email already has a login, and the password you entered does not match it. Enter that login\'s current password to add it to your workspace.');
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
      if (!verdict.ok) { _warn('Belongs to Another Workspace', 'This login is part of a different workspace, so it cannot be added here.'); return; }
      const proceed = await showGlassConfirm(
        `${email} already has a login.\n\nName: ${name}\nRoles: ${_roleNames(roles)}\n\nIt keeps its password and data and gets these roles in your workspace.`,
        { title: 'Add Existing Login', confirmText: 'Add to Workspace', cancelText: 'Cancel' }
      );
      if (!proceed) return;
    }
    const isOwnerAcct = uid === wsUid || uid === currentUser.uid;
    if (isOwnerAcct && !roles.includes('admin')) { _warn('Admin Role Required', 'Your own account must keep the Admin role.'); return; }
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
    showToast((adopted ? 'Existing login added: ' : 'Account created: ') + email + (roles.includes('rep') ? ' (added to the rep list)' : ''), 'success');
    await loadAccountsList();
  } catch (err) {
    const code = (err && err.code) || '';
    if (code === 'auth/invalid-email') _warn('Invalid Email', 'That email address is not valid.');
    else if (code === 'auth/weak-password') _warn('Weak Password', 'Choose a stronger password.');
    else if (code === 'permission-denied') _fail('Permission Denied', 'Only an active Admin of this workspace can manage accounts.');
    else _fail('Account Not Saved', (err && err.message) || code || 'Something went wrong.');
    console.error('adminAddAccount error:', _safeErr(err));
  } finally {
    if (secondaryAuth) secondaryAuth.signOut().catch(() => {});
    if (btn) { btn.disabled = false; btn.textContent = 'Add Account'; }
  }
}
function _protectedUid(uid) {
  return !!currentUser && (uid === currentUser.uid || uid === dataRootUid());
}
export function renderAccountsList() {
  const listEl = document.getElementById('manage-accounts-list');
  if (!listEl) return;
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
    _warn('Admin Role Required', 'The Admin role cannot be removed from your own account or the workspace owner.');
    return;
  }
  if (!navigator.onLine) { _warn('No Internet', 'Internet is required to change roles.'); return; }
  if (_roleBusy.has(uid)) return;
  const droppingRep = acct.roles.includes('rep') && !next.includes('rep');
  if (droppingRep) {
    const plan = await _repRemovalPlan(acct);
    if (plan.blocked) { _warn('Sales Rep Has Data', _blockedRepMessage(acct, plan)); return; }
  }
  const change = describeRoleChange({ name: _who(acct), self: !!currentUser && uid === currentUser.uid }, role, acct.roles, next);
  const ok = await showGlassConfirm(change.message, { title: change.title, confirmText: change.confirmText, cancelText: 'Cancel', danger: change.danger });
  if (!ok) return;
  _roleBusy.add(uid);
  const previous = acct.roles;
  acct.roles = next;
  renderAccountsList();
  try {
    await firebaseDB.collection('users').doc(uid).set({ roles: next, role: firebase.firestore.FieldValue.delete() }, { merge: true });
    await _patchAccountsIndex(uid, { ...acct, roles: next });
    const addedRep = next.includes('rep') && !previous.includes('rep') && await ensureRepInList(acct.name || (acct.email || '').split('@')[0]);
    const droppedRep = droppingRep && await _dropRepFromList(acct);
    showToast(`${_who(acct)}: ${_roleNames(next)}${addedRep ? ' (added to the rep list)' : ''}${droppedRep ? ' (removed from the rep list)' : ''}`, 'success', 2200);
  } catch (err) {
    acct.roles = previous;
    renderAccountsList();
    _fail('Roles Not Updated', 'The role change could not be saved. Check your connection and try again.');
    console.error('adminSetAccountRole:', _safeErr(err));
  } finally {
    _roleBusy.delete(uid);
  }
}
export async function adminToggleApproval(uid, email, currentlyApproved) {
  if (_protectedUid(uid)) { _warn('Not Allowed', 'You cannot suspend your own account or the workspace owner.'); return; }
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
    showToast(currentlyApproved ? `Suspended: ${email}` : `Reinstated: ${email}`, 'success', 2200);
  } catch (err) {
    _fail('Account Not Updated', 'The change could not be saved. Check your connection and try again.');
    console.error('adminToggleApproval:', _safeErr(err));
  }
}
export async function adminRemoveAccount(uid, email) {
  if (_protectedUid(uid)) { _warn('Not Allowed', 'You cannot remove your own account or the workspace owner.'); return; }
  const target = _accounts.find(a => a.uid === uid);
  const wasRep = !!target && target.roles.includes('rep');
  if (wasRep) {
    const plan = await _repRemovalPlan(target);
    if (plan.blocked) { _warn('Sales Rep Has Data', _blockedRepMessage(target, plan).replace('the Sales Rep role cannot be removed', 'the account cannot be removed')); return; }
  }
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
    const droppedRep = wasRep && await _dropRepFromList(target);
    showToast(`Removed: ${email}${droppedRep ? ' (removed from the rep list)' : ''}`, 'success', 2200);
  } catch (err) {
    _fail('Account Not Removed', 'The account could not be removed. Check your connection and try again.');
    console.error('adminRemoveAccount:', _safeErr(err));
  }
}
window._accountsIndexRef = _accountsIndexRef;
window._readAccountsIndex = _readAccountsIndex;
window._writeAccountsIndex = _writeAccountsIndex;
window.toggleNewAccountRole = toggleNewAccountRole;
window.resetAccountForm = resetAccountForm;
window.adminAddAccount = adminAddAccount;
window.loadAccountsList = loadAccountsList;
window.adminSetAccountRole = adminSetAccountRole;
window.adminToggleApproval = adminToggleApproval;
window.adminRemoveAccount = adminRemoveAccount;

export const __screenHtml = "<div id=\"app-accounts-screen\" class=\"standalone-screen d-none\">\n  <div class=\"shell-bar screen-topbar\">\n    <h2 class=\"screen-title\">App Accounts</h2>\n  </div>\n  <div class=\"screen-body\">\n    <div class=\"u-a0d4a03\">\n      <label class=\"u-5250855 d-block\">Add Account</label>\n      <div class=\"grid-inputs u-39ae4db\">\n        <div class=\"field\"><label>Email</label><input class=\"form-ctl\" type=\"email\" id=\"acct-new-email\" placeholder=\"user@example.com\" autocomplete=\"off\"></div>\n        <div class=\"field\"><label>Password</label><input class=\"form-ctl\" type=\"password\" id=\"acct-new-password\" placeholder=\"min 8 characters\" autocomplete=\"new-password\"></div>\n        <div class=\"field\"><label>Name</label><input class=\"form-ctl\" type=\"text\" id=\"acct-new-name\" placeholder=\"full name\" autocomplete=\"off\"></div>\n      </div>\n      <div class=\"u-39ae4db\">\n        <label class=\"u-6068d65 d-block\">Roles</label>\n        <div class=\"acct-roles\"><button type=\"button\" id=\"acct-role-admin\" class=\"toggle-opt acct-role-btn\" onclick=\"toggleNewAccountRole('admin')\">Admin</button><button type=\"button\" id=\"acct-role-rep\" class=\"toggle-opt acct-role-btn\" onclick=\"toggleNewAccountRole('rep')\">Rep</button><button type=\"button\" id=\"acct-role-production\" class=\"toggle-opt acct-role-btn\" onclick=\"toggleNewAccountRole('production')\">Production</button><button type=\"button\" id=\"acct-role-factory\" class=\"toggle-opt acct-role-btn\" onclick=\"toggleNewAccountRole('factory')\">Factory</button><button type=\"button\" id=\"acct-role-payments\" class=\"toggle-opt acct-role-btn\" onclick=\"toggleNewAccountRole('payments')\">Payments</button><button type=\"button\" id=\"acct-role-sales\" class=\"toggle-opt acct-role-btn\" onclick=\"toggleNewAccountRole('sales')\">Sales</button></div>\n      </div>\n      <button class=\"btn btn-main u-h-42 u-fs-md2 u-fw-700\" onclick=\"adminAddAccount()\" id=\"acct-add-btn\">Add Account</button>\n    </div>\n    <div class=\"u-3e0b028\">\n      <div class=\"u-79e0958 d-flex\">\n        <label class=\"u-540eca8\">Registered Accounts</label>\n        <button class=\"btn btn-theme u-f984b84 text-xs\" onclick=\"loadAccountsList()\">&#8635; Refresh</button>\n      </div>\n      <div id=\"manage-accounts-list\"><div class=\"u-ed93e92\">Loading...</div></div>\n    </div>\n  </div>\n</div>";
export const __screenCss = "\n";
