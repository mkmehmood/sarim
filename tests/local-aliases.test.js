// A device that updates from the released app (main) keeps everything it stored locally: every older local key
// is readable through its new name, and operations still waiting in the offline queue are written to the
// migrated collections with current store keys.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { legacyLocalNames, modernizeQueuedOperation, modernizeQueue, LEGACY_LOCAL_KEYS } from '../modules/local-aliases.js';

// key written by the released app (main) -> key the app uses now
const RELEASED_TO_NOW = {
  naswar_default_settings: 'settings', naswar_default_settings_timestamp: 'settings_timestamp',
  app_theme: 'theme',
  expense_categories: 'categories', expense_categories_timestamp: 'categories_timestamp',
  app_stores: 'stores', app_stores_timestamp: 'stores_timestamp',
  factory_default_formulas: 'defaults', factory_default_formulas_timestamp: 'defaults_timestamp',
  factory_additional_costs: 'costs', factory_additional_costs_timestamp: 'costs_timestamp',
  factory_cost_adjustment_factor: 'adjustment', factory_cost_adjustment_factor_timestamp: 'adjustment_timestamp',
  factory_unit_tracking: 'tracking', factory_unit_tracking_timestamp: 'tracking_timestamp',
  factory_formula_store: 'formulas', factory_formula_store_timestamp: 'formulas_timestamp',
  factory_formula_slots: 'slots', factory_formula_slots_timestamp: 'slots_timestamp',
  deleted_records: 'deleted', erased_deletion_ids: 'erased',
  person_photos: 'photos', person_photos_timestamp: 'photos_timestamp',
  person_photos_timestamps: 'photostamps', person_photos_dirty_keys: 'photodirty',
  sales_reps_list: 'reps', sales_reps_list_timestamp: 'reps_timestamp',
  user_roles_list: 'roles', team_list_timestamp: 'team_timestamp', current_rep_profile: 'profile',
  customer_rename_map: 'renames', last_synced: 'synced',
  firestore_stats: 'dbstats', firestore_initialized: 'dbready', firestore_init_timestamp: 'dbinit',
  deltaSyncStats: 'deltastats', ui_state: 'ui', user_state: 'user', partial_audit_last: 'audit',
  pendingFirestoreYearClose: 'closing', pendingFirestoreRestore: 'restoring',
};

describe('local key read-through', () => {
  for (const [old, now] of Object.entries(RELEASED_TO_NOW)) {
    it(`${old} is read through ${now}`, () => {
      assert.ok(legacyLocalNames(now).includes(old), `${now} does not fall back to ${old}`);
    });
  }
  it('a key that was never renamed has no fallback', () => {
    assert.deepEqual(legacyLocalNames('device_name'), []);
    assert.deepEqual(legacyLocalNames('offline_operation_queue'), []);
  });
  it('no old name is claimed by two new keys', () => {
    const seen = new Map();
    for (const [now, olds] of Object.entries(LEGACY_LOCAL_KEYS)) for (const o of [].concat(olds)) {
      assert.ok(!seen.has(o), `${o} is claimed by ${seen.get(o)} and ${now}`); seen.set(o, now);
    }
  });
});

describe('offline queue written by the released app', () => {
  const item = (operation) => ({ id: 'q1', operation, timestamp: 1, retries: 2, lastAttempt: 3, error: 'x' });
  it('moves operations to the new collection names and keeps everything else', () => {
    const old = item({ action: 'set', collection: 'rep_sales', docId: 'r1', data: { id: 'r1', amount: 5, store: 'STORE_B', nested: { supplyStore: 'STORE_A' } } });
    const out = modernizeQueuedOperation(old);
    assert.equal(out.operation.collection, 'rep');
    assert.equal(out.operation.docId, 'r1');
    assert.equal(out.operation.data.store, 'mahmood');
    assert.equal(out.operation.data.nested.supplyStore, 'zubair');
    assert.equal(out.operation.data.amount, 5);
    assert.equal(out.retries, 2); assert.equal(out.id, 'q1');
    assert.equal(old.operation.data.store, 'STORE_B', 'the original is not mutated');
  });
  it('maps every renamed collection, photos and delete operations', () => {
    const pairs = { calculator_history: 'calculator', rep_customers: 'clients', sales_customers: 'customers', factory_history: 'factory', personPhotos: 'photos', activityLog: 'activity' };
    for (const [o, n] of Object.entries(pairs)) assert.equal(modernizeQueuedOperation(item({ action: 'delete', collection: o, docId: 'd', data: null })).operation.collection, n);
    const del = modernizeQueuedOperation(item({ action: 'delete', collection: 'sales', docId: 'd', recordType: 'rep_sales', data: null }));
    assert.equal(del.operation.recordType, 'rep');
  });
  it('maps single-document writes', () => {
    const out = modernizeQueuedOperation(item({ action: 'set-doc', collection: 'appStores', docId: 'stores', data: { stores: [] } }));
    assert.deepEqual([out.operation.collection, out.operation.docId], ['stores', 'list']);
  });
  it('leaves current operations untouched (same object) and the queue unchanged', () => {
    const cur = item({ action: 'set', collection: 'production', docId: 'p1', data: { store: 'zubair', slot: 'standard' } });
    assert.equal(modernizeQueuedOperation(cur), cur);
    const q = modernizeQueue([cur]);
    assert.equal(q.changed, false); assert.equal(q.list[0], cur);
  });
  it('upgrades a mixed queue and reports a change; bad input becomes an empty queue', () => {
    const q = modernizeQueue([item({ action: 'set', collection: 'calculator_history', docId: 'c1', data: {} }), null, item({ action: 'set', collection: 'sales', docId: 's', data: {} })]);
    assert.equal(q.changed, true); assert.equal(q.list.length, 3);
    assert.equal(q.list[0].operation.collection, 'calculator');
    assert.deepEqual(modernizeQueue(undefined), { list: [], changed: false });
  });
  it('unknown custom store codes are kept (never dropped or guessed)', () => {
    const out = modernizeQueuedOperation(item({ action: 'set', collection: 'sales', docId: 's', data: { store: 'STORE_D' } }));
    assert.equal(out.operation.data.store, 'STORE_D');
    assert.equal(out.operation.collection, 'sales');
  });
});
