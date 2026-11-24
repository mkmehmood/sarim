const _arr = (v) => (Array.isArray(v) ? v : []);

export function sharedIdPeers(rows, id, skipIdx) {
  if (id == null || id === '') return [];
  return _arr(rows).filter((r, i) => i !== skipIdx && r && typeof r === 'object' && !r.isDeleted && String(r.id) === String(id));
}

export function touchPeers(rows, id, skipIdx, stamp) {
  const peers = sharedIdPeers(rows, id, skipIdx);
  peers.forEach((r) => { r.updatedAt = stamp; });
  return peers;
}

export function syncOutcome({ online, signedIn, pending }) {
  if (!signedIn) return 'local';
  if (!online || pending > 0) return 'queued';
  return 'synced';
}

export function syncMessage(outcome, base) {
  if (outcome === 'synced') return `${base} and synced to your other devices`;
  if (outcome === 'queued') return `${base}. It will sync to your other devices when you are back online`;
  return `${base} on this device`;
}

export async function syncFix({ col, ids, deps }) {
  const d = deps || {};
  const signedIn = !!(d.signedIn && d.signedIn());
  const online = d.online ? !!d.online() : true;
  if (signedIn && online) {
    try { if (d.flush) await d.flush(); } catch (_) {}
    try { if (d.push) await d.push(); } catch (_) {}
    try { if (d.flush) await d.flush(); } catch (_) {}
    try { if (d.ping) await d.ping({ [d.collectionKey ? d.collectionKey(col) : col]: _arr(ids).length ? _arr(ids) : null }); } catch (_) {}
  }
  const pending = d.pending ? Number(d.pending()) || 0 : 0;
  return syncOutcome({ online, signedIn, pending });
}
