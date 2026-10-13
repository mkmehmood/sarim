import { sqliteStore, ensureArray, getTimestamp } from './business.js';
import { planUnitPoolMigration } from './unit-pool-plan.js';
import { unifiedSave } from './sync.js';
import { getUnitPoolContext } from './utilities-sales.js';

export const UNIT_POOL_MIGRATION_FLAG = 'migration_unit_pool_v1';

function _applyChanges(list, changes) {
  const byId = new Map(changes.map(c => [c.id, c]));
  return ensureArray(list).map(r => (r && byId.has(r.id)) ? byId.get(r.id) : r);
}

export async function runUnitPoolMigration({ force = false } = {}) {
  await sqliteStore.init();
  if (!force && await sqliteStore.get(UNIT_POOL_MIGRATION_FLAG)) return { skipped: true };
  const ctx = await getUnitPoolContext();
  const production = ensureArray(await sqliteStore.get('production'));
  const factory = ensureArray(await sqliteStore.get('factory'));
  const plan = planUnitPoolMigration(production, factory, ctx.poolOf, getTimestamp());
  if (plan.production.length) await unifiedSave('production', _applyChanges(production, plan.production), null, plan.production.map(r => r.id));
  if (plan.factory.length) await unifiedSave('factory', _applyChanges(factory, plan.factory), null, plan.factory.map(r => r.id));
  const { updateFormulaInventory } = await import('./factory.js');
  await updateFormulaInventory();
  await sqliteStore.set(UNIT_POOL_MIGRATION_FLAG, getTimestamp());
  return { production: plan.production.length, factory: plan.factory.length };
}

window.runUnitPoolMigration = runUnitPoolMigration;
