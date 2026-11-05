import { _safeErr, firebaseDB } from './business.js';
import { showToast } from './customers.js';
import { deriveSession, isLegacyAccount, normalizeRoles, readRolesCache, resolveOwnerUid, structureKey, writeRolesCache } from './roles.js';

const SESSION_FETCH_TIMEOUT_MS = 8000;
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
window.applyAccountSession = applyAccountSession;
window.syncAccountSession = syncAccountSession;
window.accountInfoFromDoc = accountInfoFromDoc;
