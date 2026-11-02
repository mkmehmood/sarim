import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity } from './business.js';
import { unifiedSave } from './sync.js';
import { repairLedgerLinks } from './ledger-repair.js';
import { allocHonor } from './finance.js';
import { formatDateKey } from './date-format.js';

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

const _rs = (n) => Number(n || 0).toLocaleString('en-IN');

export async function openLedgerCheck() {
  const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); };
  toast('Checking ledger links\u2026');
  const rep = await runLedgerRepair();
  const sales = ensureArray(await sqliteStore.get('sales'));
  const repSales = ensureArray(await sqliteStore.get('rep'));
  const find = (id) => sales.concat(repSales).find(t => t && t.id === id);
  const gaps = Object.values(rep.unhonored).flat();
  const lines = gaps.map(g => {
    const c = find(g.cid), s = find(g.sid);
    const who = (s && s.customerName) || (c && c.customerName) || 'Unknown customer';
    const cd = c && c.date ? formatDateKey(c.date) : '?';
    const sd = s && s.date ? formatDateKey(s.date) : 'missing sale';
    return `${who}: collection of ${cd} says Rs ${_rs(g.claimed)} paid the sale of ${sd}, but ${g.honored > 0 ? 'only Rs ' + _rs(g.honored) + ' is' : 'it is not'} marked paid`;
  });
  const total = gaps.reduce((n, g) => n + (g.claimed - g.honored), 0);
  const head = gaps.length
    ? `${gaps.length} collection link(s) are not confirmed by their sale, Rs ${_rs(total)} in total.\nThese do not change any balance. Open each sale and either mark it paid (if the customer paid) or leave it unpaid (if the link is stale).\n\n`
    : 'No unconfirmed collection links found.\n\n';
  const body = head + lines.slice(0, 12).join('\n') + (lines.length > 12 ? `\n\u2026and ${lines.length - 12} more` : '') + `\n\nSafe cleanup available for ${rep.changed} record(s).`;
  const choices = [];
  if (rep.changed > 0) choices.push({ label: `Apply safe cleanup (${rep.changed})`, value: 'apply' });
  choices.push({ label: 'Undo last cleanup', value: 'undo' });
  const pick = await window.showChoiceDialog(body, choices, { title: 'Ledger Check', cancelText: 'Close' });
  if (pick === 'apply') { const r = await runLedgerRepair({ apply: true, force: true }); toast(`Cleanup applied to ${r.changed} record(s)`, 'success'); }
  if (pick === 'undo') { const r = await undoLedgerRepair(); toast(`Restored ${r.restored} record(s)`, 'success'); }
  return rep;
}

window.openLedgerCheck = openLedgerCheck;
