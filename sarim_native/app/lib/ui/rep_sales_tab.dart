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

/// Sales made by each sales rep: kg, sales value, cash received, credit given and returns.
class RepSalesTab extends StatefulWidget {
  const RepSalesTab({super.key, required this.app});
  final AppState app;

  @override
  State<RepSalesTab> createState() => _RepSalesTabState();
}

class _RepSalesTabState extends State<RepSalesTab> {
  ProdPeriod _period = ProdPeriod.day;
  RepSummary? _data;
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
    final d = await app.repo.repSummary(_period);
    if (mounted) setState(() => _data = d);
  }

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
          onSelectionChanged: (s) {
            setState(() => _period = s.first);
            _load();
          },
        ),
        const SizedBox(height: 12),
        Row(children: [
          _stat('Sold', '${fmtNum(d.netKg)} kg', color: SarimColors.accent),
          _stat('Sales', money(d.salesValue)),
          _stat('Cash in', money(d.cashIn), color: SarimColors.gold),
        ]),
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 16, 4, 6),
          child: Text('BY REP', style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
        ),
        if (d.reps.isEmpty)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No rep sales in this period.')))
        else
          for (final r in d.reps)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(r.rep, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                    Text(money(r.salesValue), style: const TextStyle(fontWeight: FontWeight.w700, color: SarimColors.accent)),
                  ]),
                  const SizedBox(height: 6),
                  Text('${fmtNum(r.netKg)} kg net · ${r.entries} ${r.entries == 1 ? 'entry' : 'entries'}', style: const TextStyle(color: Colors.white60)),
                  Text('Cash in ${money(r.cashIn)} · Credit ${money(r.creditGiven)}', style: const TextStyle(color: Colors.white60)),
                  if (r.returnsValue > 0) Text('Returns ${money(r.returnsValue)}', style: const TextStyle(color: SarimColors.danger)),
                ]),
              ),
            ),
      ]),
    );
  }
}
