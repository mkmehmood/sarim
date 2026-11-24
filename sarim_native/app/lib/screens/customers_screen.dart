import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import 'ledger_screen.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key, required this.app, this.embedded = false});
  final AppState app;

  /// When true the screen lives inside the app shell, which supplies the app bar.
  final bool embedded;

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  final _search = TextEditingController();
  CustomerList? _data;
  int _loadedRevision = -1;

  AppState get app => widget.app;

  @override
  void initState() {
    super.initState();
    app.addListener(_onApp);
    _load();
  }

  @override
  void dispose() {
    app.removeListener(_onApp);
    _search.dispose();
    super.dispose();
  }

  void _onApp() {
    if (app.revision != _loadedRevision) _load();
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    _loadedRevision = app.revision;
    final d = await app.repo.listCustomers(filter: _search.text.trim());
    if (mounted) setState(() => _data = d);
  }

  Future<void> _addCustomer() async {
    final name = TextEditingController();
    final phone = TextEditingController();
    final address = TextEditingController();
    String? error;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Add customer'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, autofocus: true, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
              TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone (optional)')),
              TextField(controller: address, decoration: const InputDecoration(labelText: 'Address (optional)')),
              if (error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error))),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                try {
                  await app.repo.addCustomer(name: name.text, phone: phone.text, address: address.text);
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } on ValidationError catch (e) {
                  setLocal(() => error = e.message);
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (ok == true) app.changed();
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: widget.embedded ? null : AppBar(
        title: const Text('Customers'),
        actions: [
          if (app.syncing)
            const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)))
          else
            IconButton(tooltip: 'Sync', icon: const Icon(Icons.sync), onPressed: app.sync),
          PopupMenuButton<String>(
            onSelected: (v) { if (v == 'out') app.signOut(); },
            itemBuilder: (_) => [PopupMenuItem(value: 'out', child: Text('Sign out (${app.session?.email ?? ''})'))],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(onPressed: _addCustomer, icon: const Icon(Icons.person_add), label: const Text('Add')),
      body: Column(children: [
        if (app.syncMessage != null)
          MaterialBanner(content: Text(app.syncMessage!), actions: [TextButton(onPressed: app.sync, child: const Text('Retry'))]),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            controller: _search,
            onChanged: (_) => _load(),
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search customers', border: OutlineInputBorder(), isDense: true),
          ),
        ),
        if (d != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('${d.customers.length} customers'),
              Text('Outstanding ${money(d.totalOutstanding)}', style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        Expanded(
          child: d == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: app.sync,
                  child: d.customers.isEmpty
                      ? ListView(children: const [SizedBox(height: 120), Center(child: Text('No customers yet. Tap Add to create one.'))])
                      : ListView.separated(
                          itemCount: d.customers.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (ctx, i) {
                            final c = d.customers[i];
                            return ListTile(
                              leading: CircleAvatar(child: Text(c.name.isEmpty ? '?' : c.name.substring(0, 1).toUpperCase())),
                              title: Text(c.name),
                              subtitle: Text(c.phone.isEmpty ? 'No phone' : c.phone),
                              trailing: Text(
                                c.owes ? money(c.credit) : 'Clear',
                                style: TextStyle(fontWeight: FontWeight.w600, color: c.owes ? Colors.redAccent : Colors.greenAccent),
                              ),
                              onTap: () => Navigator.push(ctx, MaterialPageRoute<void>(builder: (_) => LedgerScreen(app: app, name: c.name))),
                            );
                          },
                        ),
                ),
        ),
      ]),
    );
  }
}
