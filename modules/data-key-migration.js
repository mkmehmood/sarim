// One-time migration of the local database rows to the canonical data keys
// (see data-keys.js): mfg_pro_pkr -> production, noman_history -> calculator_history,
// customer_sales -> sales, payment_transactions -> transactions, ...
//
// It works on the kv_store table directly (rename only, nothing is decrypted), covers every
// user stored on the device, keeps each row's value, timestamp and encryption flag, and is
// safe to run any number of times: a marker row records completion, and even without the
// marker a second run finds nothing left to rename.
import { LEGACY_SQLITE_KEYS } from './data-keys.js';
export const DATA_KEYS_MIGRATION_ROW = '__migration_data_keys_v2';
function _scalar(db, sql, params = []) {
  const r = db.exec(sql, params);
  return r.length && r[0].values.length ? r[0].values[0][0] : null;
}
export function migrateLegacyKeysInDb(db, legacyMap = LEGACY_SQLITE_KEYS) {
  const result = { skipped: false, renamed: {}, droppedStale: 0 };
  if (!db) return result;
  try {
    if (_scalar(db, 'SELECT 1 FROM kv_store WHERE full_key = ?', [DATA_KEYS_MIGRATION_ROW]) !== null) {
      result.skipped = true;
      return result;
    }
  } catch (_) { return result; }
  db.run('BEGIN');
  try {
    for (const [oldKey, newKey] of Object.entries(legacyMap)) {
      // Both spellings present for the same user (an older build wrote after the rename):
      // keep whichever row was written last.
      db.run(
        `DELETE FROM kv_store WHERE user_key = ? AND EXISTS (
           SELECT 1 FROM kv_store n WHERE n.user_key = ? AND n.uid = kv_store.uid AND n.ts >= kv_store.ts)`,
        [oldKey, newKey]
      );
      result.droppedStale += db.getRowsModified();
      db.run(
        `DELETE FROM kv_store WHERE user_key = ? AND EXISTS (
           SELECT 1 FROM kv_store o WHERE o.user_key = ? AND o.uid = kv_store.uid AND o.ts > kv_store.ts)`,
        [newKey, oldKey]
      );
      result.droppedStale += db.getRowsModified();
      db.run(
        `UPDATE kv_store
            SET full_key   = substr(full_key, 1, length(full_key) - ?) || ?,
                user_key   = ?,
                collection = ?
          WHERE user_key = ?`,
        [oldKey.length, newKey, newKey, newKey, oldKey]
      );
      const n = db.getRowsModified();
      if (n > 0) result.renamed[oldKey] = n;
    }
    const now = Date.now();
    db.run(
      `INSERT OR REPLACE INTO kv_store
         (full_key, user_key, uid, collection, row_type, encrypted, value, ts, created_at)
       VALUES (?, ?, '', '', 'device', 0, ?, ?, ?)`,
      [DATA_KEYS_MIGRATION_ROW, DATA_KEYS_MIGRATION_ROW, JSON.stringify({ at: now, renamed: result.renamed }), now, now]
    );
    db.run('COMMIT');
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (_) {}
    throw e;
  }
  return result;
}
