import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  await group('roles normalise like roles.js', () async {
    eq(cleanRoles([' Rep ', 'ADMIN', 'bogus', 'rep']), ['admin', 'rep'], 'clean, dedupe, canonical order');
    eq(normalizeRoles({'role': 'sales'}), ['sales'], 'single role field');
    eq(normalizeRoles({'roles': ['factory', 'production']}), ['production', 'factory'], 'roles array wins');
    eq(normalizeRoles(null), <String>[], 'no doc');
    eq(tabsForRoles(['rep', 'sales', 'production']), ['prod', 'sales', 'rep'], 'tab order');
    check(rolesRestrictMoney(['sales']), 'sales restricts money');
    check(!rolesRestrictMoney(['admin', 'sales']), 'admin never restricted');
    check(!rolesRestrictMoney(['rep']), 'rep alone unrestricted');
  });
  await group('session mode', () async {
    check(deriveSession(['admin', 'rep']).mode == AppMode.admin, 'admin wins');
    check(deriveSession(['rep']).mode == AppMode.rep, 'rep');
    check(deriveSession(['production']).mode == AppMode.production, 'production');
    check(deriveSession(['factory']).mode == AppMode.factory, 'factory');
    check(deriveSession(['payments']).mode == AppMode.userrole, 'payments is userrole');
    check(deriveSession(['rep', 'sales']).mode == AppMode.userrole, 'two roles is userrole');
    eq(deriveSession(['rep', 'sales']).tabs, ['sales', 'rep'], 'tabs');
  });
  await group('workspace and legacy accounts', () async {
    check(isLegacyAccount({}, 'u1'), 'empty doc is legacy');
    check(!isLegacyAccount({'roles': ['rep']}, 'u1'), 'roles present');
    check(!isLegacyAccount({'ownerUid': 'boss'}, 'u1'), 'member is not legacy');
    eq(resolveOwnerUid({'ownerUid': 'boss'}, 'u1'), 'boss', 'owner');
    check(resolveOwnerUid({'ownerUid': 'u1'}, 'u1') == null, 'owner of self is null');
  });
  await group('screens and system name', () async {
    check(isScreenAllowed('daily-ledger-screen', AppMode.admin), 'admin allowed');
    check(!isScreenAllowed('daily-ledger-screen', AppMode.userrole), 'userrole blocked');
    check(isScreenAllowed('settings-screen', AppMode.userrole), 'settings always allowed');
    check(isScreenAllowed('rep-customer-edit-screen', AppMode.userrole, sessionTabs: ['rep']), 'own rep screens');
    eq(systemName(AppMode.admin), 'MAHMOOD KHAN', 'admin name');
    eq(systemName(AppMode.rep, repProfile: 'noran shah'), 'NORAN SHAH', 'rep name');
    eq(systemName(AppMode.rep), 'SALES REP', 'rep fallback');
    eq(systemName(AppMode.production, assignedName: 'ali'), 'ALI', 'manager name');
    eq(systemName(AppMode.userrole), 'USER', 'user fallback');
  });
  if (finish() != 0) throw StateError('roles tests failed');
}
