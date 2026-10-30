export const ACCOUNT_ROLES = ['admin', 'rep', 'production', 'factory', 'payments', 'sales'];

const LABELS = { admin: 'Admin', rep: 'Rep', production: 'Production', factory: 'Factory', payments: 'Payments', sales: 'Sales' };
const CACHE_KEY = '_gznd_account_role';

export function roleLabel(role) {
  return LABELS[role] || 'Admin';
}

export function normalizeRole(profile) {
  const r = profile && typeof profile.role === 'string' ? profile.role.trim().toLowerCase() : '';
  return ACCOUNT_ROLES.includes(r) ? r : 'admin';
}

export function accountName(profile) {
  const n = profile && typeof profile.name === 'string' ? profile.name.trim() : '';
  if (n) return n.toUpperCase();
  const email = profile && typeof profile.email === 'string' ? profile.email : '';
  return (email.split('@')[0] || 'USER').toUpperCase();
}

export function roleToMode(profile) {
  const role = normalizeRole(profile);
  const name = accountName(profile);
  if (role === 'rep') return { mode: 'rep', name, tabs: [] };
  if (role === 'production') return { mode: 'production', name, tabs: [] };
  if (role === 'factory') return { mode: 'factory', name, tabs: [] };
  if (role === 'payments' || role === 'sales') return { mode: 'userrole', name, tabs: [role] };
  return { mode: 'admin', name: null, tabs: [] };
}

export function isAccountSuspended(profile) {
  return !!profile && profile.approved === false;
}

export function cacheAccountRole(uid, profile) {
  if (!uid) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, role: normalizeRole(profile), name: accountName(profile), email: profile && profile.email || '' })); } catch (_) {}
}

export function readCachedAccountRole(uid, email) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!raw || !ACCOUNT_ROLES.includes(raw.role)) return null;
    const sameEmail = !!email && !!raw.email && String(raw.email).toLowerCase() === String(email).toLowerCase();
    if (raw.uid !== uid && !sameEmail) return null;
    return { role: raw.role, name: raw.name, email: raw.email };
  } catch (_) { return null; }
}

export function clearCachedAccountRole() {
  try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
}

export function sameMode(a, b) {
  if (!a || !b || a.mode !== b.mode) return false;
  if ((a.name || null) !== (b.name || null)) return false;
  return JSON.stringify(a.tabs || []) === JSON.stringify(b.tabs || []);
}
