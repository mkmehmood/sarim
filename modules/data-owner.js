const owners = new Map();
const CACHE_KEY = '_gznd_account';

export function setDataOwner(selfUid, ownerUid) {
  if (!selfUid) return;
  owners.set(selfUid, ownerUid || selfUid);
}

export function dataUid(user) {
  const self = user && user.uid;
  if (!self) return self;
  return owners.get(self) || self;
}

export function isWorkspaceMember(user) {
  return !!user && !!user.uid && dataUid(user) !== user.uid;
}

export function readAccountCache(email) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    if (email && String(raw.email || '').toLowerCase() !== String(email).toLowerCase()) return null;
    return raw;
  } catch (_) { return null; }
}

export function writeAccountCache(account) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(account)); } catch (_) {}
}

export function clearAccountCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
}

export async function loadAccount(db, user) {
  if (!user || !user.uid) return null;
  let account = null;
  if (!user.offlineMode && db) {
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      const d = snap.exists ? (snap.data() || {}) : {};
      account = {
        uid: user.uid,
        email: user.email || d.email || '',
        role: d.role || null,
        name: d.name || d.displayName || '',
        ownerUid: typeof d.ownerUid === 'string' && d.ownerUid ? d.ownerUid : user.uid,
        approved: d.approved !== false,
        exists: snap.exists,
      };
      writeAccountCache(account);
    } catch (_) { account = null; }
  }
  if (!account) {
    const cached = readAccountCache(user.email);
    if (cached) account = { ...cached, fromCache: true };
  }
  if (account) setDataOwner(user.uid, account.ownerUid);
  return account;
}
