export const ACCOUNT_ROLES = ['admin', 'rep', 'production', 'factory', 'payments', 'sales'];

export const ROLE_LABELS = {
  admin: 'Admin',
  rep: 'Rep',
  production: 'Production',
  factory: 'Factory',
  payments: 'Payments',
  sales: 'Sales',
};

export function normalizeRole(role) {
  const r = String(role == null ? '' : role).trim().toLowerCase();
  if (!r || r === 'user') return 'admin';
  return ACCOUNT_ROLES.includes(r) ? r : null;
}

export function isAccountRole(role) {
  return typeof role === 'string' && ACCOUNT_ROLES.includes(role);
}

export function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || 'Unknown';
}

export function accountDisplayName(account) {
  const name = account && typeof account.name === 'string' ? account.name.trim() : '';
  if (name) return name.toUpperCase();
  const email = account && typeof account.email === 'string' ? account.email : '';
  return (email.split('@')[0] || 'USER').toUpperCase();
}

export function accessForAccount(account) {
  const role = normalizeRole(account && account.role) || 'admin';
  const name = accountDisplayName(account);
  switch (role) {
    case 'rep': return { role, mode: 'rep', name, tabs: [] };
    case 'production': return { role, mode: 'production', name, tabs: [] };
    case 'factory': return { role, mode: 'factory', name, tabs: [] };
    case 'payments': return { role, mode: 'userrole', name, tabs: ['payments'] };
    case 'sales': return { role, mode: 'userrole', name, tabs: ['sales'] };
    default: return { role: 'admin', mode: 'admin', name: null, tabs: [] };
  }
}

export function sameAccess(a, b) {
  if (!a || !b) return false;
  return a.mode === b.mode
    && (a.name || null) === (b.name || null)
    && JSON.stringify(a.tabs || []) === JSON.stringify(b.tabs || []);
}
