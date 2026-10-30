import { accessForAccount, normalizeRole, roleLabel, sameAccess } from './account-roles.js';
import { clearAccountCache, loadAccount, writeAccountCache } from './data-owner.js';
import { _safeErr, currentRepProfile, firebaseDB, salesRepsList, sqliteStore } from './business.js';
import { showToast } from './customers.js';

export function currentAccess() {
  const mode = window.appMode || 'admin';
  const name = mode === 'rep'
    ? (currentRepProfile || null)
    : mode === 'admin' ? null : (window._assignedManagerName || null);
  const tabs = mode === 'userrole' ? (window._assignedUserTabs || []) : [];
  return { mode, name, tabs };
}

export function accessToStoreEntries(access, ts) {
  const named = access.mode === 'userrole' || access.mode === 'production' || access.mode === 'factory';
  return [
    ['appMode', access.mode],
    ['appMode_timestamp', ts],
    ['repProfile', access.mode === 'rep' ? access.name : null],
    ['assignedManager', named ? access.name : null],
    ['assignedUserTabs', access.mode === 'userrole' ? access.tabs : []],
  ];
}

export async function applyAccountAccess(access, { announce = true } = {}) {
  if (!access || sameAccess(currentAccess(), access)) return false;
  const ts = Date.now();
  const entries = accessToStoreEntries(access, ts);
  if (access.mode === 'rep' && access.name && !salesRepsList.includes(access.name)) {
    salesRepsList.push(access.name);
    entries.push(['reps', salesRepsList]);
  }
  await sqliteStore.setBatch(entries);
  if (announce) showToast(`Applying ${roleLabel(access.role)} access…`, 'info', 2000);
  setTimeout(() => { window.location.reload(); }, 1200);
  return true;
}

export async function resolveSessionAccount(user) {
  const db = (typeof firebaseDB !== 'undefined' && firebaseDB) ? firebaseDB : null;
  const account = await loadAccount(db, user);
  window._account = account || null;
  return account;
}

export async function applySessionAccess(account) {
  if (!account) return false;
  if (account.approved === false && !account.fromCache) return false;
  return applyAccountAccess(accessForAccount(account));
}

export function watchOwnAccount(db, user, { onRevoked, sessionStart } = {}) {
  let revoked = false;
  return db.collection('users').doc(user.uid).onSnapshot(async (snap) => {
    if (!snap.exists || snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
    const d = snap.data() || {};
    const startedAt = typeof sessionStart === 'function' ? await sessionStart() : (sessionStart || 0);
    const forced = d.forceLogout && d.forceLogout.at && d.forceLogout.at > startedAt;
    if (d.approved === false || forced) {
      if (revoked) return;
      revoked = true;
      showToast(d.approved === false ? 'Your account has been suspended. Signing out…' : 'Your account access has been revoked. Signing out…', 'error', 5000);
      if (typeof onRevoked === 'function') setTimeout(() => { Promise.resolve(onRevoked()).catch(() => {}); }, 1500);
      return;
    }
    const account = {
      uid: user.uid,
      email: user.email || d.email || '',
      role: d.role || null,
      name: d.name || d.displayName || '',
      ownerUid: typeof d.ownerUid === 'string' && d.ownerUid ? d.ownerUid : user.uid,
      approved: true,
      exists: true,
    };
    writeAccountCache(account);
    window._account = account;
    if (normalizeRole(account.role)) await applyAccountAccess(accessForAccount(account));
  }, (e) => console.warn('[Auth] account watch error:', e && e.code, _safeErr(e)));
}

export function clearSessionAccount() {
  clearAccountCache();
  window._account = null;
}
