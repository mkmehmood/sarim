export const LOCK_MODES = ['admin', 'rep', 'userrole'];

export function normalizeAccountLock(profile) {
  const l = profile && profile.lock;
  if (!l || !LOCK_MODES.includes(l.mode)) return null;
  const at = Number(l.at) || 0;
  if (!at) return null;
  if (l.mode === 'rep') return l.assignedRep ? { mode: 'rep', name: l.assignedRep, tabs: [], at } : null;
  if (l.mode === 'userrole') {
    return l.assignedManager ? { mode: 'userrole', name: l.assignedManager, tabs: Array.isArray(l.assignedUserTabs) ? l.assignedUserTabs : [], at } : null;
  }
  return { mode: 'admin', name: null, tabs: [], at };
}

export function buildLockPatch(mode, name, tabs, by, now) {
  if (!LOCK_MODES.includes(mode)) throw new Error('Unknown lock mode');
  if (mode !== 'admin' && !name) throw new Error('A name is required for this lock');
  return {
    mode,
    assignedRep: mode === 'rep' ? name : null,
    assignedManager: mode === 'userrole' ? name : null,
    assignedUserTabs: mode === 'userrole' ? (Array.isArray(tabs) ? tabs : []) : null,
    at: now,
    by: by || 'Admin',
  };
}

export function lockLabel(lock) {
  const n = normalizeAccountLock({ lock });
  if (!n) return 'Not locked';
  if (n.mode === 'admin') return 'Admin';
  return (n.mode === 'rep' ? 'Rep: ' : 'User: ') + n.name;
}

export function lockPanelButtons(lock, reps, roles) {
  const n = normalizeAccountLock({ lock });
  const out = [{ mode: 'admin', name: null, index: -1, label: 'Admin', active: !!n && n.mode === 'admin', group: 'Access' }];
  (reps || []).forEach((r, i) => out.push({ mode: 'rep', name: r, index: i, label: r, active: !!n && n.mode === 'rep' && n.name === r, group: 'Sales Representatives' }));
  (roles || []).forEach((u, i) => out.push({ mode: 'userrole', name: u.name, index: i, label: u.name, active: !!n && n.mode === 'userrole' && n.name === u.name, group: 'User Roles' }));
  return out;
}
