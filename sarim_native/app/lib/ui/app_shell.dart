import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import 'shell_tabs.dart';
import 'sidebar.dart';
import 'standalone.dart';
import 'tokens.dart';

/// The signed-in frame: fixed top bar (hamburger + system name), one tab body at a time, and the left sidebar.
/// There is no bottom tab bar in the web app; tabs change only through the sidebar (`sidebarNav`).
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.app, this.initialTab, this.tabBuilder});
  final AppState app;
  final ShellTab? initialTab;

  /// Builds a tab body. Ported tabs are added here; others show a placeholder.
  final Widget Function(BuildContext, AppState, ShellTab)? tabBuilder;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late ShellTab _tab = widget.initialTab ?? startTab(widget.app.roleSession);
  bool _open = false;

  AppState get app => widget.app;

  void _setOpen(bool v) => setState(() => _open = v);

  void _nav(ShellTab t) {
    setState(() { _tab = t; _open = false; });
  }

  Future<void> _screen(String id) async {
    _setOpen(false);
    await openStandaloneScreen(context, app, id);
  }

  Future<void> _logout() async {
    _setOpen(false);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: T.surface2,
        icon: const Icon(Icons.logout, color: T.danger),
        title: const Text('Sign Out?'),
        content: const Text('You will be signed out and the local data on this device will be erased.\nYour data stays safe in the cloud and returns when you sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: T.danger, foregroundColor: Colors.black), onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign Out')),
        ],
      ),
    );
    if (ok == true) await app.signOut();
  }

  Widget _body() {
    final b = widget.tabBuilder;
    if (b != null) return b(context, app, _tab);
    return Center(child: Text('${_tab.label} is being ported from the web app', style: const TextStyle(color: T.textMain)));
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final narrow = mq.size.width <= 449;
    final admin = app.roleSession.mode == AppMode.admin;
    final tabs = tabsFor(app.roleSession);
    final rem = context.rem;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => PopScope(
        canPop: !_open,
        onPopInvokedWithResult: (didPop, _) { if (!didPop && _open) _setOpen(false); },
        child: Scaffold(
          body: Stack(children: [
            // tab body sits below the fixed 52px bar (body { padding-top: 52px })
            Positioned.fill(child: Padding(padding: EdgeInsets.only(top: 52 + mq.padding.top), child: _body())),
            // .shell-bar.system-controls
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                constraints: const BoxConstraints(minHeight: 52),
                padding: EdgeInsets.fromLTRB(narrow ? 10 : 14, 10 + mq.padding.top, narrow ? 10 : 14, 10),
                decoration: shellBarDecoration(),
                child: Stack(alignment: Alignment.center, children: [
                  Align(alignment: Alignment.centerLeft, child: _Hamburger(onTap: () => _setOpen(true))),
                  IgnorePointer(
                    child: Text(systemName(app.roleSession.mode, repProfile: app.repProfile, assignedName: app.assignedName), maxLines: 1, style: TextStyle(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, fontWeight: FontWeight.w800, fontSize: .85 * rem, color: T.accent)),
                  ),
                ]),
              ),
            ),
            SidebarPanel(
              open: _open,
              onClose: () => _setOpen(false),
              scroll: [
                const SidebarLabel('Navigation'),
                for (final t in tabs) SidebarItem(icon: t.icon, label: t.label, active: t == _tab, onTap: () => _nav(t)),
                if (admin) ...[
                  const SidebarDivider(),
                  const SidebarLabel('Daily Work'),
                  SidebarItem(icon: 'approvals', label: 'Approvals', onTap: () => _screen('approvals-screen')),
                  SidebarItem(icon: 'daily_ledger', label: 'Daily Ledger', onTap: () => _screen('daily-ledger-screen')),
                  SidebarItem(icon: 'stock_transfer', label: 'Stock Transfer', onTap: () => _screen('stock-transfer-screen')),
                  SidebarItem(icon: 'payment_transfer', label: 'Payment Transfer', onTap: () => _screen('payment-transfer-screen')),
                  const SidebarLabel('Records'),
                  SidebarItem(icon: 'add_entity', label: 'Add Entity', onTap: () => _screen('add-entity-screen')),
                  SidebarItem(icon: 'add_raw_materials', label: 'Add Raw Materials', onTap: () => _screen('raw-material-screen')),
                  SidebarItem(icon: 'formula_store', label: 'Formula Store', onTap: () => _screen('formula-store-screen')),
                ],
              ],
              footer: [
                SidebarItem(icon: 'settings', label: 'Settings', onTap: () => _screen('settings-screen')),
                // openSidebar(): the logout button is shown to admin only
                if (admin) SidebarItem(icon: 'logout', label: 'Logout', danger: true, onTap: _logout),
              ],
            ),
          ]),
        ),
      ),
    );
  }
}

/// `.sidebar-hamburger`: three rounded bars of 22, 14 and 18px.
class _Hamburger extends StatelessWidget {
  const _Hamburger({required this.onTap});
  final VoidCallback onTap;

  Widget _bar(double w) => Container(
        width: w,
        height: 2,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(9999), gradient: LinearGradient(colors: [T.accent, Colors.white.withOpacity(.55)])),
      );

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Open menu',
        child: InkResponse(
          onTap: onTap,
          radius: 22,
          child: SizedBox(
            width: 36,
            height: 36,
            child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.center, children: [
              _bar(22), const SizedBox(height: 5), _bar(14), const SizedBox(height: 5), _bar(18),
            ]),
          ),
        ),
      );
}
