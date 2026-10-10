// The ONLY place in the app that knows older local key names. sqliteStore.get() falls back to these when a
// renamed key has no value yet, then moves the value to the new name, so a device that is updated keeps
// everything it had stored locally (settings, pending year-close/restore markers, stats, ...).
// Pure data: no DOM, no storage. Record datasets are NOT listed here: their rows hold old store codes and
// are replaced from the migrated cloud copy (tools/migrate-cloud.mjs) instead.
export const LEGACY_LOCAL_KEYS = Object.freeze({
  reps_timestamp: 'sales_reps_list_timestamp', team_timestamp: 'team_list_timestamp', renames: 'customer_rename_map',
  recovered: 'recovered_id_map', synced: 'last_synced', meta: 'sync_meta', deltastats: ['delta_sync_stats', 'deltaSyncStats'],
  dbstats: 'firestore_stats', dbready: 'firestore_initialized', dbinit: 'firestore_init_timestamp', ui: 'ui_state',
  user: 'user_state', audit: 'partial_audit_last',
  categories: 'expense_categories', stores: 'app_stores', defaults: 'factory_default_formulas', costs: 'factory_additional_costs',
  adjustment: 'factory_cost_adjustment_factor', tracking: 'factory_unit_tracking', formulas: 'factory_formula_store',
  slots: 'factory_formula_slots', deleted: 'deletion_ids', erased: 'erased_deletion_ids', photostamps: 'photos_timestamps',
  photodirty: 'photos_dirty_keys', reps: 'sales_reps_list', roles: 'user_roles_list', profile: 'current_rep_profile',
  closing: ['pending_year_close', 'pendingFirestoreYearClose'], restoring: ['pending_restore', 'pendingFirestoreRestore'],
});
