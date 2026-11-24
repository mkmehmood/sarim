import 'package:flutter/material.dart';

import '../app_state.dart';
import '../ui/standalone.dart';
import '../ui/theme.dart';

/// Standalone Settings page: account, sync status and shortcuts to the other standalone screens.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.app});
  final AppState app;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  int _pending = 0;
  AppState get app => widget.app;

  @override
  void initState() {
    super.initState();
    app.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    app.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    final n = (await app.repo.outbox()).length;
    if (mounted) setState(() => _pending = n);
  }

  Future<void> _confirmSignOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: Text(_pending > 0
            ? '$_pending change${_pending == 1 ? '' : 's'} have not synced yet. They stay on this device and sync after you sign in again.'
            : 'You will need to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok == true) {
      await app.signOut();
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    }
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
        child: Text(t, style: const TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(children: [
        _label('ACCOUNT'),
        ListTile(leading: const Icon(Icons.person_outline, color: SarimColors.accent), title: Text(app.session?.email ?? 'Not signed in')),
        _label('SYNC'),
        ListTile(
          leading: Icon(app.syncMessage == null ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, color: app.syncMessage == null ? SarimColors.accent : SarimColors.warning),
          title: Text(app.syncMessage ?? (_pending == 0 ? 'Everything is synced' : '$_pending change${_pending == 1 ? '' : 's'} waiting to sync')),
          trailing: app.syncing ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : TextButton(onPressed: app.sync, child: const Text('Sync now')),
        ),
        _label('RECORDS'),
        for (final id in const ['stores', 'backup-restore', 'recycle-bin', 'db-structure'])
          ListTile(
            leading: Icon(standaloneScreens[id]!.icon, color: SarimColors.accent),
            title: Text(standaloneScreens[id]!.title),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => openStandalone(context, app, id),
          ),
        const Divider(height: 32),
        ListTile(leading: const Icon(Icons.logout, color: SarimColors.danger), title: const Text('Sign out'), onTap: _confirmSignOut),
      ]),
    );
  }
}
