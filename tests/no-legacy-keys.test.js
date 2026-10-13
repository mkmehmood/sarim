import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const OLD_NAMES = [
  'sales_reps_list', 'team_list', 'customer_rename_map', 'recovered_id_map', 'last_synced', 'sync_meta',
  'delta_sync_stats', 'deltaSyncStats', 'firestore_stats', 'firestore_initialized', 'firestore_init_timestamp',
  'ui_state', 'user_state', 'partial_audit_last', 'naswar_default_settings', 'app_theme', 'expense_categories',
  'app_stores', 'factory_default_formulas', 'factory_additional_costs', 'factory_cost_adjustment_factor',
  'factory_unit_tracking', 'factory_formula_store', 'factory_formula_slots', 'deleted_records', 'deletion_ids',
  'erased_deletion_ids', 'deletion_records', 'person_photos', 'photos_timestamps', 'photos_dirty_keys',
  'user_roles_list', 'current_rep_profile', 'pending_year_close', 'pendingFirestoreYearClose', 'pending_restore',
  'pendingFirestoreRestore', 'calculator_history', 'rep_sales', 'rep_customers', 'sales_customers',
  'factory_history', 'personPhotos', 'activityLog', 'activity_log', 'appStores', 'factorySettings',
  'expenseCategories', 'STORE_A', 'STORE_B', 'STORE_C',
];

const root = new URL('../', import.meta.url);
const files = [...readdirSync(new URL('modules/', root)).map(f => `modules/${f}`), 'index.html', 'sw.js'];

describe('app runs on current keys only', () => {
  for (const f of files) {
    it(`${f} has no old key names or legacy read-through`, () => {
      const src = readFileSync(new URL(f, root), 'utf8');
      for (const n of OLD_NAMES) assert.ok(!new RegExp(`['"\`]${n}['"\`]`).test(src), `${f} still references old key ${n}`);
      assert.ok(!/legacyLocalNames|modernizeLegacy|modernizeQueue|LEGACY_LOCAL_KEYS|data-keys|dataKeyVersion|DATA_KEY_VERSION|isCurrentBackup/.test(src), `${f} still has a legacy fallback`);
    });
  }
});

const SLOT_CONCEPT_ALLOWED = new Set(['modules/formula-pool-plan.js', 'modules/formula-pool-migration.js', 'modules/link-graph.js']);
describe('the formula slot concept is gone', () => {
  for (const f of files) {
    it(`${f} has no standard/asaan pools, slot helpers or slot keys`, () => {
      if (SLOT_CONCEPT_ALLOWED.has(f)) return;
      const src = readFileSync(new URL(f, root), 'utf8');
      assert.ok(!/SLOT_KEYS|deriveSlots|unitPoolKey|formulaTypeFor|getFormulaSlot|getStoredFormulaSlots|getStoreFormulaType|_formulaSlot|slotPool/.test(src), `${f} still uses a slot helper`);
      assert.ok(!/\b(standard|asaan)\s*:\s*(\[|\{|\d)/.test(src.replace(/privileges:[^\n]*/g, '')), `${f} still keys data by standard/asaan`);
      assert.ok(!/(\.|\[['"])(standard|asaan)\b/.test(src.replace(/BUILTIN_BADGE_CLASSES\.asaan/g, '')), `${f} still reads a standard/asaan key`);
      assert.ok(!/['"`]slots(_timestamp)?['"`]/.test(src), `${f} still reads the slots key`);
    });
  }
  it('link-graph only mentions the old assignment as backup input for the migration', () => {
    const src = readFileSync(new URL('modules/link-graph.js', root), 'utf8');
    assert.ok(!/mergeSlots|deriveSlots/.test(src));
  });
});
