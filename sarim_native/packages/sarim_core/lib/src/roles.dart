/// Port of modules/roles.js, the money-privacy screen rules and `updateSystemName` (utilities-payments.js).
const roleKeys = ['admin', 'rep', 'production', 'factory', 'payments', 'sales'];

const _roleTab = {'rep': 'rep', 'production': 'prod', 'factory': 'factory', 'payments': 'payments', 'sales': 'sales'};
const _tabOrder = ['prod', 'factory', 'sales', 'payments', 'rep'];
const _moneyTabs = ['payments', 'sales'];

List<String> cleanRoles(dynamic list) {
  final seen = <String>{};
  if (list is List) {
    for (final raw in list) {
      final k = '${raw ?? ''}'.trim().toLowerCase();
      if (roleKeys.contains(k)) seen.add(k);
    }
  }
  return roleKeys.where(seen.contains).toList();
}

List<String> normalizeRoles(Map<String, dynamic>? userDoc) {
  final d = userDoc ?? const <String, dynamic>{};
  if (d['roles'] is List) return cleanRoles(d['roles']);
  return cleanRoles([d['role']]);
}

List<String> tabsForRoles(List<String> roles) {
  final tabs = cleanRoles(roles).map((r) => _roleTab[r]).whereType<String>().toSet();
  return _tabOrder.where(tabs.contains).toList();
}

bool rolesRestrictMoney(List<String> roles) {
  final cur = cleanRoles(roles);
  if (cur.contains('admin')) return false;
  return tabsForRoles(cur).any(_moneyTabs.contains);
}

enum AppMode { admin, rep, production, factory, userrole }

class RoleSession {
  const RoleSession(this.mode, this.tabs, this.roles);
  final AppMode mode;
  final List<String> tabs;
  final List<String> roles;
}

RoleSession deriveSession(List<String> roles) {
  final cur = cleanRoles(roles);
  if (cur.contains('admin')) return RoleSession(AppMode.admin, const [], cur);
  final tabs = tabsForRoles(cur);
  if (cur.length == 1 && cur[0] == 'rep') return RoleSession(AppMode.rep, tabs, cur);
  if (cur.length == 1 && cur[0] == 'production') return RoleSession(AppMode.production, tabs, cur);
  if (cur.length == 1 && cur[0] == 'factory') return RoleSession(AppMode.factory, tabs, cur);
  return RoleSession(AppMode.userrole, tabs, cur);
}

bool isWorkspaceMember(Map<String, dynamic>? userDoc, String uid) {
  final owner = userDoc?['ownerUid'];
  return owner is String && owner.isNotEmpty && owner != uid;
}

String? resolveOwnerUid(Map<String, dynamic>? userDoc, String uid) => isWorkspaceMember(userDoc, uid) ? userDoc!['ownerUid'] as String : null;

/// No roles and not a workspace member: the original single-owner account, which behaves as admin.
bool isLegacyAccount(Map<String, dynamic>? userDoc, String uid) => normalizeRoles(userDoc).isEmpty && !isWorkspaceMember(userDoc, uid);

/// Only the `userrole` (money-restricted) mode limits standalone screens.
bool isMoneyRestricted(AppMode mode) => mode == AppMode.userrole;

const _restrictedScreens = {'settings-screen', 'splash-screen', 'feedback-screen', 'recycle-bin-screen'};
const _repOwnScreens = {'rep-customer-management-screen', 'rep-customer-edit-screen'};

bool isScreenAllowed(String id, AppMode mode, {List<String> sessionTabs = const []}) {
  if (!isMoneyRestricted(mode) || _restrictedScreens.contains(id)) return true;
  return _repOwnScreens.contains(id) && sessionTabs.contains('rep');
}

/// Name shown in the top bar (`updateSystemName`).
String systemName(AppMode mode, {String? repProfile, String? assignedName}) {
  switch (mode) {
    case AppMode.admin:
      return 'MAHMOOD KHAN';
    case AppMode.rep:
      return ((repProfile ?? '').isEmpty ? 'Sales Rep' : repProfile!).toUpperCase();
    case AppMode.production:
      return ((assignedName ?? '').isEmpty ? 'Production Manager' : assignedName!).toUpperCase();
    case AppMode.factory:
      return ((assignedName ?? '').isEmpty ? 'Factory Manager' : assignedName!).toUpperCase();
    case AppMode.userrole:
      return ((assignedName ?? '').isEmpty ? 'User' : assignedName!).toUpperCase();
  }
}
