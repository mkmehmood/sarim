import { ACCOUNT_ROLES, accountDisplayName, isAccountRole, normalizeRole, roleLabel } from './account-roles.js';
import { canAdoptAccount, accountRowHtml } from './account-view.js';
import { dataUid } from './data-owner.js';
import { _safeErr, currentUser, esc, firebaseDB, salesRepsList } from './business.js';
import { firebaseConfig } from './utilities-sales.js';
import { saveSalesRepsList } from './utilities-payments.js';
import { showGlassConfirm, showToast } from './customers.js';
import { confirmGuard } from './confirm-guard.js';

const STATE = { newRole: null, accounts: new Map() };

export function _accountsIndexRef() {
  return firebaseDB.collection('users').doc(dataUid(currentUser)).collection('settings').doc('accounts');
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

async function _patchIndex(uid, patch) {
  const accounts = await _readAccountsIndex();
  await _writeAccountsIndex(accounts.map(a => a.uid === uid ? { ...a, ...patch } : a));
}

export function setNewAccountRole(role) {
  STATE.newRole = isAccountRole(role) ? role : null;
  ACCOUNT_ROLES.forEach(r => {
    const b = document.getElementById('acct-role-' + r);
    if (b) b.classList.toggle('active', STATE.newRole === r);
  });
}

export function adminAddAccount(...a) {
  return confirmGuard('adminAddAccount', () => _adminAddAccountRaw(...a), {
    label: 'Account', late: true, verb: 'Add',
    fields: [['acct-new-email', 'Email'], ['acct-new-name', 'Name'], [() => STATE.newRole ? roleLabel(STATE.newRole) : '', 'Role']],
  });
}

async function _addToRepList(name) {
  if (!name || salesRepsList.includes(name)) return;
  salesRepsList.push(name);
  await saveSalesRepsList();
}

async function _adminAddAccountRaw() {
  const emailEl = document.getElementById('acct-new-email');
  const passEl = document.getElementById('acct-new-password');
  const nameEl = document.getElementById('acct-new-name');
  const msgEl = document.getElementById('acct-add-msg');
  const btn = document.getElementById('acct-add-btn');
  if (!emailEl || !passEl || !nameEl || !msgEl) return;
  const email = emailEl.value.trim();
  const password = passEl.value;
  const name = nameEl.value.trim().toUpperCase();
  const role = STATE.newRole;
  const setMsg = (txt, color) => { msgEl.textContent = txt; msgEl.style.setProperty('--d-color', color || 'var(--text-muted)'); msgEl.classList.add('dc-color'); };
  if (!email) { setMsg('Enter an email address.', 'var(--danger)'); return; }
  if (password.length < 8) { setMsg('Password must be at least 8 characters.', 'var(--danger)'); return; }
  if (!name) { setMsg('Enter a name.', 'var(--danger)'); return; }
  if (!role) { setMsg('Choose a role.', 'var(--danger)'); return; }
  if (!navigator.onLine) { setMsg('Internet required to create accounts.', 'var(--danger)'); return; }
  if (!(await window.gcCommit({}))) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
  setMsg('Creating account...', 'var(--accent)');
  try {
    const owner = dataUid(currentUser);
    const secondaryApp = firebase.apps.find(a => a.name === '_adminCreate') || firebase.initializeApp(firebaseConfig, '_adminCreate');
    const secondaryAuth = secondaryApp.auth();
    let uid;
    let existing = null;
    try {
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      uid = cred.user.uid;
    } catch (err) {
      if ((err.code || '') !== 'auth/email-already-in-use') throw err;
      let cred;
      try { cred = await secondaryAuth.signInWithEmailAndPassword(email, password); }
      catch (_) { setMsg('This email is already registered and the password does not match.', 'var(--danger)'); return; }
      uid = cred.user.uid;
      try {
        const snap = await secondaryApp.firestore().collection('users').doc(uid).get();
        existing = snap.exists ? (snap.data() || {}) : null;
      } catch (_) { existing = null; }
      const verdict = canAdoptAccount(existing, { owner, adminEmail: currentUser.email });
      if (!verdict.ok) { await secondaryAuth.signOut(); setMsg(verdict.reason, 'var(--danger)'); return; }
    }
    await secondaryAuth.signOut();
    const now = Date.now();
    const profile = {
      email, name, role, approved: true, removed: false, ownerUid: owner,
      createdBy: (existing && existing.createdBy) || currentUser.email,
      createdByUid: (existing && existing.createdByUid) || owner,
      createdAt: (existing && existing.createdAt) || now,
      roleChangedAt: now, roleChangedBy: currentUser.email,
    };
    await firebaseDB.collection('users').doc(uid).set(profile, { merge: true });
    const entry = { uid, email, name, role, approved: true, createdAt: profile.createdAt, createdBy: profile.createdBy };
    const index = await _readAccountsIndex();
    await _writeAccountsIndex([...index.filter(a => a.uid !== uid), entry]);
    if (role === 'rep') await _addToRepList(name);
    emailEl.value = ''; passEl.value = ''; nameEl.value = '';
    setNewAccountRole(null);
    setMsg(existing ? 'Existing login added to this workspace.' : 'Account created successfully.', 'var(--accent-emerald)');
    showToast((existing ? 'Account added: ' : 'Account created: ') + email, 'success');
    await loadAccountsList();
  } catch (err) {
    const code = err.code || '';
    if (code === 'auth/invalid-email') setMsg('Invalid email address.', 'var(--danger)');
    else if (code === 'auth/weak-password') setMsg('Password too weak.', 'var(--danger)');
    else setMsg('Failed: ' + (err.message || code), 'var(--danger)');
    console.error('adminAddAccount error:', _safeErr(err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add Account'; }
  }
}

export async function loadAccountsList() {
  const listEl = document.getElementById('manage-accounts-list');
  if (!listEl) return;
  if (!navigator.onLine) { listEl.innerHTML = '<div class="u-ed93e92">Internet required to load accounts.</div>'; return; }
  listEl.innerHTML = '<div class="u-ed93e92">Loading...</div>';
  try {
    const owner = dataUid(currentUser);
    const index = await _readAccountsIndex().catch(() => []);
    const uids = [...new Set([owner, currentUser.uid, ...index.map(a => a.uid)])];
    const rows = await Promise.all(uids.map(async uid => {
      const fallback = index.find(a => a.uid === uid) || null;
      try {
        const snap = await firebaseDB.collection('users').doc(uid).get();
        if (snap.exists) return { uid, ...(fallback || {}), ...snap.data() };
      } catch (_) {}
      return fallback ? { ...fallback } : null;
    }));
    const accounts = rows.filter(a => a && !a.removed);
    STATE.accounts = new Map(accounts.map(a => [a.uid, a]));
    accounts.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    if (accounts.length === 0) { listEl.innerHTML = '<div class="u-ed93e92">No accounts found.</div>'; return; }
    listEl.innerHTML = accounts.map(a => accountRowHtml(a, { isMe: a.uid === currentUser.uid, isOwner: a.uid === owner && a.uid !== currentUser.uid })).join('');
  } catch (err) {
    listEl.innerHTML = '<div class="u-e135e79">Failed to load: ' + esc(err.message || '') + '</div>';
    console.error('loadAccountsList:', _safeErr(err));
  }
}

export async function setAccountRole(uid, email, role) {
  if (!isAccountRole(role)) return;
  if (uid === currentUser.uid) { window.notifyBlocking('You cannot change your own role.', 'warning', 'Warning'); return; }
  const acct = STATE.accounts.get(uid) || {};
  if ((normalizeRole(acct.role) || 'admin') === role) return;
  const name = accountDisplayName({ ...acct, email: acct.email || email });
  const confirmed = await showGlassConfirm(
    'Make ' + email + ' ' + roleLabel(role) + '?\n\nIf they are signed in, it applies right away.',
    { title: 'Change Role', confirmText: 'Change', cancelText: 'Cancel', danger: false }
  );
  if (!confirmed) return;
  try {
    const now = Date.now();
    await firebaseDB.collection('users').doc(uid).set({
      role, name, ownerUid: dataUid(currentUser), roleChangedAt: now, roleChangedBy: currentUser.email,
    }, { merge: true });
    await _patchIndex(uid, { role, name });
    if (role === 'rep') await _addToRepList(name);
    showToast(email + ' is now ' + roleLabel(role), 'success');
    await loadAccountsList();
  } catch (err) {
    window.notifyBlocking('Failed to change role.', 'error', 'Something went wrong');
    console.error('setAccountRole:', _safeErr(err));
  }
}

export async function adminToggleApproval(uid, email, currentlyApproved) {
  const confirmed = await showGlassConfirm(
    (currentlyApproved ? 'Suspend' : 'Reinstate') + ' the account for ' + email + '?' +
    (currentlyApproved ? '\n\nThey will be signed out and blocked from signing in.' : '\n\nThey will be able to sign in again.'),
    { title: currentlyApproved ? 'Suspend Account' : 'Reinstate Account', confirmText: currentlyApproved ? 'Suspend' : 'Reinstate', cancelText: 'Cancel', danger: currentlyApproved }
  );
  if (!confirmed) return;
  try {
    const patch = { approved: !currentlyApproved };
    if (currentlyApproved) patch.forceLogout = { at: Date.now(), by: currentUser.email };
    await firebaseDB.collection('users').doc(uid).set(patch, { merge: true });
    await _patchIndex(uid, { approved: !currentlyApproved });
    await loadAccountsList();
  } catch (err) {
    window.notifyBlocking('Failed to update account.', 'error', 'Something went wrong');
    console.error('adminToggleApproval:', _safeErr(err));
  }
}

export async function adminRemoveAccount(uid, email) {
  if (uid === currentUser.uid) { window.notifyBlocking('You cannot remove your own account.', 'warning', 'Warning'); return; }
  const confirmed = await showGlassConfirm(
    'Remove ' + email + '?\n\nThey will be signed out and can no longer sign in. Data they entered stays in the workspace.\n\nTo fully delete the Firebase Auth login, use the Firebase Console.',
    { title: 'Remove Account', confirmText: 'Remove', cancelText: 'Cancel', danger: true }
  );
  if (!confirmed) return;
  try {
    const now = Date.now();
    await firebaseDB.collection('users').doc(uid).set({
      approved: false, removed: true, removedAt: now, removedBy: currentUser.email,
      forceLogout: { at: now, by: currentUser.email },
    }, { merge: true });
    const index = await _readAccountsIndex();
    await _writeAccountsIndex(index.filter(a => a.uid !== uid));
    await loadAccountsList();
  } catch (err) {
    window.notifyBlocking('Failed to remove account.', 'error', 'Something went wrong');
    console.error('adminRemoveAccount:', _safeErr(err));
  }
}

window.setNewAccountRole = setNewAccountRole;
window.adminAddAccount = adminAddAccount;
window.loadAccountsList = loadAccountsList;
window.setAccountRole = setAccountRole;
window.adminToggleApproval = adminToggleApproval;
window.adminRemoveAccount = adminRemoveAccount;
