import 'package:flutter/material.dart';
import '../app_state.dart';
import '../screens/customers_screen.dart';
import 'payments_tab.dart';
import 'production_tab.dart';
import 'standalone.dart';
import 'tabs.dart';
import 'theme.dart';

/// Main tabs, in web sidebar order (Production, Sales, Calculator, Factory, Payments, Rep Sales).
enum ShellTab { prod, sales, calc, factory, payments, rep }

const _tabMeta = <ShellTab, (String, IconData)>{
  ShellTab.prod: ('Production', Icons.inventory_2_outlined),
  ShellTab.sales: ('Sales', Icons.receipt_outlined),
  ShellTab.calc: ('Calculator', Icons.calculate_outlined),
  ShellTab.factory: ('Factory', Icons.factory_outlined),
  ShellTab.payments: ('Payments', Icons.payments_outlined),
  ShellTab.rep: ('Rep Sales', Icons.trending_up),
};

/// The signed-in app frame: top bar with sync, side drawer, bottom tab bar.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.app, this.initialTab = ShellTab.prod});
  final AppState app;
  final ShellTab initialTab;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late ShellTab _tab = widget.initialTab;
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  AppState get app => widget.app;

  Widget _body(ShellTab t) {
    switch (t) {
      case ShellTab.prod:
        return ProductionTab(app: app);
      case ShellTab.sales:
        return CustomersScreen(app: app, embedded: true);
      case ShellTab.payments:
        return PaymentsTab(app: app);
      default:
        return TabPlaceholder(title: _tabMeta[t]!.$1, icon: _tabMeta[t]!.$2);
    }
  }

  void _open(String id) {
    Navigator.of(context).pop(); // close the drawer
    openStandalone(context, app, id);
  }

  Widget _section(String label) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
        child: Text(label, style: const TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
      );

  Widget _drawer() {
    List<Widget> group(String g) => [
          for (final d in standaloneScreens.values.where((d) => d.group == g))
            ListTile(leading: Icon(d.icon, color: SarimColors.accent), title: Text(d.title), onTap: () => _open(d.id)),
        ];
    return Drawer(
      child: SafeArea(
        child: ListView(padding: EdgeInsets.zero, children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 18, 20, 4),
            child: Text('GULL AND ZUBAIR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 1)),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(app.session?.email ?? '', style: const TextStyle(color: Colors.white54, fontSize: 12)),
          ),
          _section('NAVIGATION'),
          for (final t in ShellTab.values)
            ListTile(
              selected: t == _tab,
              selectedColor: SarimColors.accent,
              leading: Icon(_tabMeta[t]!.$2),
              title: Text(_tabMeta[t]!.$1),
              onTap: () {
                Navigator.of(context).pop();
                setState(() => _tab = t);
              },
            ),
          const Divider(),
          _section('DAILY WORK'),
          ...group('work'),
          _section('RECORDS'),
          ...group('records'),
          const Divider(),
          ...group('settings'),
          ListTile(
            leading: const Icon(Icons.sync, color: SarimColors.accent),
            title: const Text('Sync now'),
            onTap: () {
              Navigator.of(context).pop();
              app.sync();
            },
          ),
          ListTile(
            leading: const Icon(Icons.logout, color: SarimColors.danger),
            title: const Text('Sign out'),
            onTap: () {
              Navigator.of(context).pop();
              app.signOut();
            },
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => Scaffold(
        key: _scaffoldKey,
        drawer: _drawer(),
        appBar: AppBar(
          title: Text(_tabMeta[_tab]!.$1),
          actions: [
            if (app.syncing)
              const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)))
            else
              IconButton(tooltip: 'Sync', icon: const Icon(Icons.sync), onPressed: app.sync),
          ],
        ),
        body: Column(children: [
          if (app.syncMessage != null)
            MaterialBanner(content: Text(app.syncMessage!), actions: [TextButton(onPressed: app.sync, child: const Text('Retry'))]),
          Expanded(child: IndexedStack(index: _tab.index, children: [for (final t in ShellTab.values) _body(t)])),
        ]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab.index,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (i) => setState(() => _tab = ShellTab.values[i]),
          destinations: [
            for (final t in ShellTab.values) NavigationDestination(icon: Icon(_tabMeta[t]!.$2), label: _shortLabel(t)),
          ],
        ),
      ),
    );
  }

  String _shortLabel(ShellTab t) => t == ShellTab.rep ? 'Rep' : (t == ShellTab.prod ? 'Prod' : (t == ShellTab.calc ? 'Calc' : _tabMeta[t]!.$1));
}
