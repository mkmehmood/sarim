import { sqliteStore, ensureArray, getTimestamp } from './business.js';
import { unifiedSave } from './sync.js';
import { triggerAutoSync } from './utilities-core.js';

const RENAMES = [['production', 'formulaStore'], ['factory', 'formulaType']];

export function planFormulaIdRename(list, oldField, now) {
  const changed = [];
  const next = ensureArray(list).map((r) => {
    if (!r || typeof r !== 'object' || !(oldField in r)) return r;
    const { [oldField]: old, ...rest } = r;
    const out = { ...rest, updatedAt: now };
    if (!out.formulaId && old) out.formulaId = old;
    changed.push(out);
    return out;
  });
  return { next, changed };
}

export async function runRecordFormulaIdMigration() {
  await sqliteStore.init();
  let any = false;
  for (const [key, oldField] of RENAMES) {
    const { next, changed } = planFormulaIdRename(await sqliteStore.get(key), oldField, getTimestamp());
    if (!changed.length) continue;
    await unifiedSave(key, next, null, changed.map((r) => r.id));
    any = true;
  }
  if (any) {
    const { updateFormulaInventory } = await import('./factory.js');
    await updateFormulaInventory();
    triggerAutoSync();
  }
  return any;
}
