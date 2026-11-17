import { generateUUID, ensureArray, loadCollections, loadDeletedIds, sqliteStore } from './business.js';
import { isTabEntry, linkedDrift, missingLinks, mirrorLedgerEntry, normalizeRows } from './ledger-core.js';
import { trashRecord } from './store-recycle.js';

export const isLedgerChecked = (id) => {
  const box = document.getElementById(id);
  return !!(box && box.checked);
};

export async function addToLedger(args) {
  const entry = mirrorLedgerEntry({ ...args, id: generateUUID('dl_'), now: Date.now() });
  if (!entry) return false;
  const rows = ensureArray(await sqliteStore.get('daily_ledger'));
  rows.push(entry);
  await sqliteStore.setBatch([['daily_ledger', rows], ['daily_ledger_timestamp', Date.now()]]);
  if (typeof window.triggerAutoSync === 'function') window.triggerAutoSync();
  if (typeof window.refreshDailyLedger === 'function') window.refreshDailyLedger();
  return true;
}

export async function addManyToLedgerSafely(list, toast) {
  let added = 0;
  try {
    for (const args of list) if (await addToLedger(args)) added++;
    if (added && typeof toast === 'function') toast(`Added ${added} ${added === 1 ? 'entry' : 'entries'} to Daily Ledger`, 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Saved, but could not add everything to the Daily Ledger', 'warning');
  }
}

export async function addToLedgerSafely(args, toast) {
  try {
    if (await addToLedger(args) && typeof toast === 'function') toast('Added to Daily Ledger', 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Saved, but could not add it to the Daily Ledger', 'warning');
  }
}

let _syncing = false;
let _again = false;
let _timer = null;

export async function syncLedgerFromTabs({ onlyTab = false } = {}) {
  if (_syncing) { _again = true; return { removed: 0, updated: 0 }; }
  _syncing = true;
  try {
    const all = normalizeRows(await sqliteStore.get('daily_ledger'));
    const rows = all.filter((t) => t.link && (!onlyTab || isTabEntry(t)));
    if (!rows.length) return { removed: 0, updated: 0 };
    const gone = await loadDeletedIds();
    const orphans = missingLinks(rows, gone);
    const orphanIds = new Set(orphans.map((r) => r.id));
    const live = rows.filter((r) => !orphanIds.has(r.id));
    const cols = await loadCollections('transactions', 'expenses', 'sales', 'calculator', 'entities');
    const drift = linkedDrift(live, cols);
    const dropIds = new Set([...orphanIds, ...drift.filter((d) => d.remove).map((d) => d.id)]);
    const edits = new Map(drift.filter((d) => !d.remove).map((d) => [d.id, d]));
    if (!dropIds.size && !edits.size) return { removed: 0, updated: 0 };
    for (const row of all.filter((r) => dropIds.has(r.id))) await trashRecord('daily_ledger', row);
    const now = Date.now();
    const next = all.filter((r) => !dropIds.has(r.id)).map((r) => (edits.has(r.id) ? { ...r, ...edits.get(r.id), updatedAt: now } : r));
    await sqliteStore.setBatch([['daily_ledger', next], ['daily_ledger_timestamp', now]]);
    if (typeof window.triggerAutoSync === 'function') window.triggerAutoSync();
    if (typeof window.refreshDailyLedger === 'function') window.refreshDailyLedger();
    return { removed: dropIds.size, updated: edits.size };
  } finally {
    _syncing = false;
    if (_again) { _again = false; scheduleLedgerSync(); }
  }
}

export function scheduleLedgerSync() {
  clearTimeout(_timer);
  _timer = setTimeout(() => { syncLedgerFromTabs({ onlyTab: true }).catch(() => {}); }, 400);
}

window.syncLedgerFromTabs = syncLedgerFromTabs;
window.scheduleLedgerSync = scheduleLedgerSync;
