import { sqliteStore, ensureArray, getTimestamp, generateUUID } from './business.js';
import { planFormulaPoolMigration } from './formula-pool-plan.js';
import { unifiedSave } from './sync.js';
import { _invalidateStoresCache } from './utilities-sales.js';
import { triggerAutoSync } from './utilities-core.js';

export const FORMULA_POOL_MIGRATION_FLAG = 'migration_formula_pool_v1';
const OLD_ASSIGNMENT_KEYS = ['slots', 'slots_timestamp'];

function _applyChanges(list, changes) {
  const byId = new Map(changes.map(c => [c.id, c]));
  return ensureArray(list).map(r => (r && byId.has(r.id)) ? byId.get(r.id) : r);
}

// Safe to run on every start: it only touches data still keyed the old way.
export async function runFormulaPoolMigration() {
  await sqliteStore.init();
  const b = await sqliteStore.getBatch(['stores', 'formulas', 'slots', 'defaults', 'costs', 'adjustment', 'production', 'factory', FORMULA_POOL_MIGRATION_FLAG]);
  const done = b.get(FORMULA_POOL_MIGRATION_FLAG);
  const oldSlots = b.get('slots');
  const production = ensureArray(b.get('production'));
  const factory = ensureArray(b.get('factory'));
  const plan = planFormulaPoolMigration({
    stores: ensureArray(b.get('stores')), formulas: ensureArray(b.get('formulas')),
    slots: oldSlots, legacy: oldSlots ? null : (done && done.legacy),
    defaults: b.get('defaults'), costs: b.get('costs'), adjustment: b.get('adjustment'),
    production, factory,
  }, getTimestamp(), () => generateUUID('formula'));

  const now = Date.now();
  const writes = [];
  if (plan.formulasChanged) writes.push(['formulas', plan.formulas], ['formulas_timestamp', getTimestamp()]);
  if (plan.storesChanged) writes.push(['stores', plan.stores], ['stores_timestamp', now]);
  const feedsNow = JSON.stringify(plan.feeds);
  const feedsWas = JSON.stringify({ defaults: b.get('defaults') || {}, costs: b.get('costs') || {}, adjustment: b.get('adjustment') || {} });
  if (feedsNow !== feedsWas) {
    writes.push(['defaults', plan.feeds.defaults], ['defaults_timestamp', now], ['costs', plan.feeds.costs], ['costs_timestamp', now], ['adjustment', plan.feeds.adjustment], ['adjustment_timestamp', now]);
  }
  if (writes.length) { await sqliteStore.setBatch(writes); _invalidateStoresCache(); }
  if (plan.production.length) await unifiedSave('production', _applyChanges(production, plan.production), null, plan.production.map(r => r.id));
  if (plan.factory.length) await unifiedSave('factory', _applyChanges(factory, plan.factory), null, plan.factory.map(r => r.id));
  const changed = writes.length > 0 || plan.production.length > 0 || plan.factory.length > 0 || !!oldSlots || !done;
  if (changed) {
    const { updateFormulaInventory } = await import('./factory.js');
    await updateFormulaInventory();
  }
  if (!done || oldSlots) {
    await sqliteStore.set(FORMULA_POOL_MIGRATION_FLAG, { at: getTimestamp(), legacy: plan.legacy });
    for (const k of OLD_ASSIGNMENT_KEYS) await sqliteStore.remove(k);
  }
  if (changed) triggerAutoSync();
  return { stores: plan.storesChanged, formulas: plan.formulasChanged, production: plan.production.length, factory: plan.factory.length };
}

window.runFormulaPoolMigration = runFormulaPoolMigration;
