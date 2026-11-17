import { ensureArray, sqliteStore } from './business.js';
export const BIN_STORES = Object.freeze({
  daily_ledger: Object.freeze({ key: 'daily_ledger', ts: 'daily_ledger_timestamp', tab: 'tab_ledger', label: 'Ledger Entry', restore: 'restoreLedgerEntry' }),
  formulas: Object.freeze({ key: 'formulas', ts: 'formulas_timestamp', tab: 'tab_formulas', label: 'Formula', restore: 'restoreFormulaEntry' }),
});
export const isBinStore = (collection) => Object.prototype.hasOwnProperty.call(BIN_STORES, collection);
const STRIP = ['deletedAt', 'tombstoned_at', 'deleted_by', 'deletion_version', 'recoveredAt', '_placeholder', 'isDeleted', 'softDeleted'];
export function cleanForRestore(snapshot, now = Date.now()) {
  const out = { ...(snapshot || {}) };
  STRIP.forEach((k) => { delete out[k]; });
  out.updatedAt = now;
  out.recoveredAt = now;
  return out;
}
export function mergeRestored(list, record) {
  const rest = ensureArray(list).filter((r) => r && r.id && String(r.id) !== String(record.id));
  return [...rest, record];
}
export function describeBinRecord(collection, s, fmt = String) {
  const rec = s || {};
  if (collection === 'daily_ledger') {
    const isT = rec.type === 'TRANSFER';
    const dir = rec.type === 'IN' ? '↓ IN' : rec.type === 'OUT' ? '↑ OUT' : 'TRANSFER';
    return {
      displayName: isT ? `Transfer – ${rec.mode || '?'} → ${rec.toMode || '?'}` : (rec.party || rec.category || 'Ledger Entry'),
      displayDetail: [dir, isT ? '' : rec.category, isT ? '' : rec.mode, rec.date].filter(Boolean).join(' · '),
      displayAmount: rec.amount != null ? `₨${fmt(rec.amount)}` : null,
    };
  }
  if (collection === 'formulas') {
    const n = ensureArray(rec.ingredients).length;
    return { displayName: rec.name || 'Formula', displayDetail: `${n} ingredient${n === 1 ? '' : 's'}`, displayAmount: null };
  }
  return { displayName: null, displayDetail: null, displayAmount: null };
}
export async function trashRecord(collection, record) {
  if (!isBinStore(collection) || !record || !record.id) return false;
  if (typeof window === 'undefined' || typeof window.registerDeletion !== 'function') return false;
  try {
    await window.registerDeletion(String(record.id), collection, record);
    return true;
  } catch (_e) {
    return false;
  }
}
export async function recoverStoreRecord(deletedId, collection) {
  const cfg = BIN_STORES[collection];
  if (!cfg || typeof window === 'undefined') return false;
  const sid = String(deletedId);
  const tombs = ensureArray(await sqliteStore.get('deletions'));
  const tomb = tombs.find((r) => String(r.id) === sid || String(r.recordId || r.id) === sid);
  if (!tomb || !tomb.snapshot) return false;
  const restore = window[cfg.restore];
  if (typeof restore !== 'function') return false;
  const ok = await restore(cleanForRestore(tomb.snapshot));
  if (!ok) return false;
  if (typeof window.purgeRecoveredId === 'function') await window.purgeRecoveredId(sid, collection, null, sid);
  return true;
}
