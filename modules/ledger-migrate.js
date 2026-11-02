import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity } from './business.js';
import { unifiedSave } from './sync.js';
import { repairLedgerLinks } from './ledger-repair.js';
import { allocHonor } from './finance.js';

export const LEDGER_REPAIR_FLAG = 'ledger_links_repaired_v1';
export const LEDGER_REPAIR_BACKUP = 'ledger_repair_backup_v1';

export async function runLedgerRepair({ apply = false, force = false } = {}) {
  const out = { applied: !!apply, changed: 0, pending: 0, stores: {}, unhonored: {} };
  const backup = { at: getTimestamp(), stores: {} };
  for (const key of ['sales', 'rep']) {
    const arr = ensureArray(await sqliteStore.get(key));
    out.unhonored[key] = allocHonor(arr).gaps;
    const work = JSON.parse(JSON.stringify(arr));
    const { changedIds, report } = repairLedgerLinks(work, force ? { minAgeMs: 0 } : {});
    out.stores[key] = report;
    out.pending += report.skippedRecent;
    out.changed += changedIds.size;
    if (!apply || !changedIds.size) continue;
    backup.stores[key] = arr.filter(t => t && changedIds.has(t.id)).map(t => JSON.parse(JSON.stringify(t)));
    work.forEach(t => { if (t && changedIds.has(t.id)) { t.updatedAt = getTimestamp(); ensureRecordIntegrity(t, true); } });
    await sqliteStore.set(LEDGER_REPAIR_BACKUP, backup);
    await unifiedSave(key, work, null, [...changedIds]);
  }
  if (apply && !out.pending) await sqliteStore.set(LEDGER_REPAIR_FLAG, { at: getTimestamp(), changed: out.changed });
  const gapCount = Object.values(out.unhonored).reduce((n, l) => n + l.length, 0);
  console.info('[ledger-repair]', apply ? 'applied' : 'dry run', '-', out.changed, 'record(s) would change /', gapCount, 'allocation(s) not matched by their sale');
  window.ledgerRepairReport = out;
  return out;
}

export async function undoLedgerRepair() {
  const backup = await sqliteStore.get(LEDGER_REPAIR_BACKUP);
  if (!backup || !backup.stores) return { restored: 0 };
  let restored = 0;
  for (const key of Object.keys(backup.stores)) {
    const arr = ensureArray(await sqliteStore.get(key));
    const ids = [];
    backup.stores[key].forEach(old => {
      const i = arr.findIndex(t => t && t.id === old.id);
      if (i < 0) return;
      arr[i] = { ...old, updatedAt: getTimestamp() };
      ids.push(old.id);
    });
    if (ids.length) await unifiedSave(key, arr, null, ids);
    restored += ids.length;
  }
  await sqliteStore.set(LEDGER_REPAIR_FLAG, null);
  return { restored };
}

window.runLedgerRepair = runLedgerRepair;
window.undoLedgerRepair = undoLedgerRepair;
