import 'package:flutter/material.dart';
import '../app_state.dart';
import '../screens/settings_screen.dart';
import 'theme.dart';

/// A full-screen page opened from the drawer or from a tab (the web app's
/// `openStandaloneScreen(id)`), pushed on top of the shell with a back button.
class StandaloneDef {
  const StandaloneDef(this.id, this.title, this.icon, this.group, {this.build});
  final String id;
  final String title;
  final IconData icon;
  final String group; // drawer section: 'work', 'records' or 'settings'
  final Widget Function(AppState app)? build;
}

/// Screens in the order the web sidebar lists them. `build` is filled in as each
/// screen is ported; until then the page shows a "coming soon" placeholder.
final Map<String, StandaloneDef> standaloneScreens = {
  for (final d in _defs) d.id: d,
};

final List<StandaloneDef> _defs = <StandaloneDef>[
  const StandaloneDef('approvals', 'Approvals', Icons.verified_outlined, 'work'),
  const StandaloneDef('daily-ledger', 'Daily Ledger', Icons.receipt_long_outlined, 'work'),
  const StandaloneDef('stock-transfer', 'Stock Transfer', Icons.swap_horiz, 'work'),
  const StandaloneDef('payment-transfer', 'Payment Transfer', Icons.account_balance_wallet_outlined, 'work'),
  const StandaloneDef('recycle-bin', 'Recycle Bin', Icons.delete_outline, 'records'),
  const StandaloneDef('stores', 'Store Manager', Icons.store_outlined, 'records'),
  const StandaloneDef('backup-restore', 'Backup & Restore', Icons.backup_outlined, 'records'),
  const StandaloneDef('db-structure', 'Database Structure', Icons.storage_outlined, 'records'),
  StandaloneDef('settings', 'Settings', Icons.settings_outlined, 'settings', build: (app) => SettingsScreen(app: app)),
];

void openStandalone(BuildContext context, AppState app, String id) {
  final def = standaloneScreens[id];
  if (def == null) return;
  Navigator.of(context).push(MaterialPageRoute<void>(
    settings: RouteSettings(name: 'standalone/$id'),
    builder: (_) => StandalonePage(def: def, app: app),
  ));
}

class StandalonePage extends StatelessWidget {
  const StandalonePage({super.key, required this.def, required this.app});
  final StandaloneDef def;
  final AppState app;

  @override
  Widget build(BuildContext context) {
    final b = def.build;
    if (b != null) return b(app);
    return Scaffold(
      appBar: AppBar(title: Text(def.title)),
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(def.icon, size: 48, color: SarimColors.accent),
          const SizedBox(height: 12),
          Text(def.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          const Text('Being ported from the web app', style: TextStyle(color: Colors.white60)),
        ]),
      ),
    );
  }
}
