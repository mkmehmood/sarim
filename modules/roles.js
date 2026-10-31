export const ROLE_KEYS = ['admin', 'rep', 'production', 'factory', 'payments', 'sales'];

export const ROLE_LABELS = {
  admin: 'Admin',
  rep: 'Rep',
  production: 'Production',
  factory: 'Factory',
  payments: 'Payments',
  sales: 'Sales',
};

const ROLE_TAB = { rep: 'rep', production: 'prod', factory: 'factory', payments: 'payments', sales: 'sales' };
const TAB_ORDER = ['prod', 'factory', 'sales', 'payments', 'rep'];
const MONEY_TABS = ['payments', 'sales'];

export function cleanRoles(list) {
  const src = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const raw of src) {
    const key = String(raw || '').trim().toLowerCase();
    if (ROLE_KEYS.includes(key) && !seen.has(key)) { seen.add(key); out.push(key); }
  }
  return ROLE_KEYS.filter(k => seen.has(k));
}

export function normalizeRoles(userDoc) {
  const d = userDoc && typeof userDoc === 'object' ? userDoc : {};
  if (Array.isArray(d.roles)) return cleanRoles(d.roles);
  return cleanRoles([d.role]);
}

export function hasRole(roles, name) {
  return cleanRoles(roles).includes(name);
}

export function toggleRole(roles, name) {
  const cur = cleanRoles(roles);
  return cleanRoles(cur.includes(name) ? cur.filter(r => r !== name) : [...cur, name]);
}

export function tabsForRoles(roles) {
  const cur = cleanRoles(roles);
  const tabs = new Set(cur.map(r => ROLE_TAB[r]).filter(Boolean));
  return TAB_ORDER.filter(t => tabs.has(t));
}

export function rolesRestrictMoney(roles) {
  const cur = cleanRoles(roles);
  if (cur.includes('admin')) return false;
  return tabsForRoles(cur).some(t => MONEY_TABS.includes(t));
}

export function deriveSession(roles) {
  const cur = cleanRoles(roles);
  if (cur.includes('admin')) return { mode: 'admin', tabs: [], roles: cur };
  const tabs = tabsForRoles(cur);
  if (cur.length === 1 && cur[0] === 'rep') return { mode: 'rep', tabs, roles: cur };
  if (cur.length === 1 && cur[0] === 'production') return { mode: 'production', tabs, roles: cur };
  if (cur.length === 1 && cur[0] === 'factory') return { mode: 'factory', tabs, roles: cur };
  return { mode: 'userrole', tabs, roles: cur };
}

export function isWorkspaceMember(userDoc, uid) {
  const owner = userDoc && typeof userDoc.ownerUid === 'string' ? userDoc.ownerUid : '';
  return !!owner && owner !== uid;
}

export function resolveOwnerUid(userDoc, uid) {
  return isWorkspaceMember(userDoc, uid) ? userDoc.ownerUid : null;
}

export function isLegacyAccount(userDoc, uid) {
  return normalizeRoles(userDoc).length === 0 && !isWorkspaceMember(userDoc, uid);
}

export function canAdoptAccount(userDoc, uid, workspaceUid, knownUids) {
  if (!userDoc) return { ok: true };
  if (uid === workspaceUid) return { ok: true };
  if (typeof userDoc.ownerUid === 'string' && userDoc.ownerUid) {
    return userDoc.ownerUid === workspaceUid ? { ok: true } : { ok: false, reason: 'external' };
  }
  const known = knownUids instanceof Set ? knownUids : new Set(knownUids || []);
  if (known.has(uid)) return { ok: true };
  return { ok: false, reason: 'external' };
}

export function structureKey(session, ownerUid) {
  return `${session.mode}|${session.tabs.join(',')}|${ownerUid || ''}`;
}

const CACHE_KEY = '_gznd_roles_cache';

export function readRolesCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || typeof c !== 'object' || !Array.isArray(c.roles)) return null;
    return { ...c, roles: cleanRoles(c.roles), ownerUid: c.ownerUid || null, legacy: !!c.legacy };
  } catch (_) { return null; }
}

export function writeRolesCache(info) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      uid: info.uid || '', email: String(info.email || '').toLowerCase(), name: info.name || '',
      roles: cleanRoles(info.roles), ownerUid: info.ownerUid || null, legacy: !!info.legacy, ts: Date.now(),
    }));
  } catch (_) { }
}

export function clearRolesCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (_) { }
}
