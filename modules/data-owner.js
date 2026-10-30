const owners = new Map();
const CACHE_KEY = '_gznd_data_owner';

export function setDataOwner(selfUid, ownerUid) {
  if (!selfUid) return;
  owners.set(selfUid, ownerUid || selfUid);
}

export function dataUid(user) {
  const self = user && user.uid;
  if (!self) return self;
  return owners.get(self) || self;
}

function readCache(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return raw && raw.uid === uid && typeof raw.owner === 'string' ? raw.owner : null;
  } catch (_) { return null; }
}

function writeCache(uid, owner) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, owner })); } catch (_) {}
}

export async function resolveDataOwner(db, user) {
  if (!user || !user.uid || user.offlineMode) return dataUid(user);
  let owner = null;
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    owner = typeof data.ownerUid === 'string' && data.ownerUid && data.approved !== false ? data.ownerUid : user.uid;
    writeCache(user.uid, owner);
  } catch (_) {
    owner = readCache(user.uid) || user.uid;
  }
  setDataOwner(user.uid, owner);
  return owner;
}

export function isTeamMember(user) {
  return !!user && !!user.uid && dataUid(user) !== user.uid;
}
