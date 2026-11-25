import 'package:sarim_core/sarim_core.dart';

/// Main tabs in sidebar order. `id` is the web tab id (`showTab(id)`), `icon` the extracted SVG in assets/icons.
enum ShellTab {
  overview('overview', 'Overview', 'overview'),
  prod('prod', 'Production', 'production'),
  sales('sales', 'Sales', 'sales'),
  calc('calc', 'Calculator', 'calculator'),
  factory('factory', 'Factory', 'factory'),
  payments('payments', 'Payments', 'payments'),
  rep('rep', 'Rep Sales', 'rep_sales');

  const ShellTab(this.id, this.label, this.icon);
  final String id, label, icon;
}

/// Tabs a session may open. Admin sees every tab; the locked modes (`lockTo*Mode`) show only their own.
List<ShellTab> tabsFor(RoleSession s) {
  if (s.mode == AppMode.admin) return ShellTab.values;
  return [for (final t in ShellTab.values) if (s.tabs.contains(t.id)) t];
}

/// First tab shown after sign-in: Production for admin (`snav-prod` starts active), otherwise the first allowed tab.
ShellTab startTab(RoleSession s) {
  final tabs = tabsFor(s);
  return tabs.contains(ShellTab.prod) ? ShellTab.prod : (tabs.isEmpty ? ShellTab.prod : tabs.first);
}
