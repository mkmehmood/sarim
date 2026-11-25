import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../ui/theme.dart';

/// What the app keeps on this device: each collection with its record count.
class DbStructureScreen extends StatefulWidget {
  const DbStructureScreen({super.key, required this.app});
  final AppState app;

  @override
  State<DbStructureScreen> createState() => _DbStructureScreenState();
}

class _DbStructureScreenState extends State<DbStructureScreen> {
  List<CollectionInfo>? _info;
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
    super.dispose();
  }

  void _onApp() {
    if (app.revision != _loadedRevision) _load();
  }

  Future<void> _load() async {
    _loadedRevision = app.revision;
    final i = await storageOverview(app.store);
    if (mounted) setState(() => _info = i);
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    return Scaffold(
      appBar: AppBar(title: const Text('Database Structure')),
      body: info == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(12), children: [
              Card(
                child: ListTile(
                  title: const Text('Stored on this device'),
                  trailing: Text(countLabel(totalRecords(info)), style: const TextStyle(fontWeight: FontWeight.w700, color: SarimColors.accent)),
                ),
              ),
              for (final i in info)
                Card(
                  child: ListTile(
                    title: Text(i.label),
                    subtitle: Text(i.key, style: const TextStyle(color: Colors.white54, fontSize: 12)),
                    trailing: Text(
                      countLabel(i.count),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: i.key == 'outbox' && i.count > 0 ? SarimColors.gold : null,
                      ),
                    ),
                  ),
                ),
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text('Records marked "waiting to upload" are sent the next time you sync.', style: TextStyle(color: Colors.white54, fontSize: 12)),
              ),
            ]),
    );
  }
}
