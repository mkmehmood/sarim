import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import 'theme.dart';

const _periodLabels = {
  ProdPeriod.day: 'Day',
  ProdPeriod.week: 'Week',
  ProdPeriod.month: 'Month',
  ProdPeriod.year: 'Year',
  ProdPeriod.all: 'All',
};

/// Production overview: period filter, totals, per-store grid and batch history.
class ProductionTab extends StatefulWidget {
  const ProductionTab({super.key, required this.app});
  final AppState app;

  @override
  State<ProductionTab> createState() => _ProductionTabState();
}

class _ProductionTabState extends State<ProductionTab> {
  ProdPeriod _period = ProdPeriod.day;
  ProdSummary? _data;
  Map<String, String> _storeNames = {};
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
    final d = await app.repo.productionSummary(_period);
    final names = {for (final s in await app.repo.stores()) s.key: s.name};
    if (mounted) setState(() { _data = d; _storeNames = names; });
  }

  String _name(String key) => _storeNames[key] ?? (key.isEmpty ? 'Unassigned' : key);

  Widget _stat(String label, String value, {Color? color}) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
            child: Column(children: [
              Text(label, style: const TextStyle(fontSize: 11, color: Colors.white60)),
              const SizedBox(height: 4),
              Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color)),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: app.sync,
      child: ListView(padding: const EdgeInsets.all(12), children: [
        SegmentedButton<ProdPeriod>(
          showSelectedIcon: false,
          segments: [for (final p in ProdPeriod.values) ButtonSegment(value: p, label: Text(_periodLabels[p]!))],
          selected: {_period},
          onSelectionChanged: (s) { setState(() => _period = s.first); _load(); },
        ),
        const SizedBox(height: 12),
        Row(children: [
          _stat('Produced', '${fmtNum(d.all.net)} kg', color: SarimColors.accent),
          _stat('Cost', money(d.all.cost)),
          _stat('Per kg', money(d.all.costPerKg), color: SarimColors.gold),
        ]),
        if (d.byStore.isNotEmpty) ...[
          const Padding(
            padding: EdgeInsets.fromLTRB(4, 16, 4, 6),
            child: Text('BY STORE', style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
          ),
          for (final s in d.byStore)
            Card(
              child: ListTile(
                title: Text(_name(s.store)),
                subtitle: Text('${s.batches} batch${s.batches == 1 ? '' : 'es'} · ${money(s.costPerKg)}/kg'),
                trailing: Text('${fmtNum(s.net)} kg', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
        ],
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 16, 4, 6),
          child: Text('HISTORY', style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
        ),
        if (d.entries.isEmpty)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No production in this period.')))
        else
          for (final e in d.entries)
            Card(
              child: ListTile(
                title: Text('${fmtNum(numOf(e['net']))} kg · ${_name('${e['store'] ?? ''}')}'),
                subtitle: Text('${e['date'] ?? ''}${e['formulaName'] != null ? ' · ${e['formulaName']}' : ''}'),
                trailing: Text(money(numOf(e['totalCost']))),
              ),
            ),
      ]),
    );
  }
}
