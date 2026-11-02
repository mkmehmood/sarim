import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity } from './business.js';
import { unifiedSave } from './sync.js';
import { repairLedgerLinks } from './ledger-repair.js';

export const LEDGER_REPAIR_FLAG = 'ledger_links_repaired_v1';

export async function runLedgerRepair({ force = false } = {}) {
  if (!force && await sqliteStore.get(LEDGER_REPAIR_FLAG)) return { skipped: true };
  const out = { changed: 0, pending: 0, stores: {} };
  for (const key of ['sales', 'rep']) {
    const arr = ensureArray(await sqliteStore.get(key));
    const { changedIds, report } = repairLedgerLinks(arr, force ? { minAgeMs: 0 } : {});
    out.stores[key] = report;
    out.pending += report.skippedRecent;
    if (!changedIds.size) continue;
    arr.forEach(t => { if (t && changedIds.has(t.id)) { t.updatedAt = getTimestamp(); ensureRecordIntegrity(t, true); } });
    await unifiedSave(key, arr, null, [...changedIds]);
    out.changed += changedIds.size;
  }
  if (!out.pending) await sqliteStore.set(LEDGER_REPAIR_FLAG, { at: getTimestamp(), changed: out.changed });
  console.info('[ledger-repair]', out.changed, 'record(s) repaired', out.pending ? `(${out.pending} recent link(s) deferred)` : '');
  window.ledgerRepairReport = out;
  return out;
}

window.runLedgerRepair = runLedgerRepair;
