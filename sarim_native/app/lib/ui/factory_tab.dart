import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import 'theme.dart';

String _stockText(MaterialRow m) {
  switch (m.stockKind) {
    case StockKind.unitName:
      return '${fmtNum(m.purchaseQuantity)} ${m.purchaseUnitName} (${fmtNum(m.qty)} kg)';
    case StockKind.units:
      return '${fmtNum(m.purchaseQuantity)} units (${fmtNum(m.qty)} kg)';
    case StockKind.kg:
      return '${fmtNum(m.qty)} kg';
  }
}

/// Factory overview: raw-material stock and value, and each formula's cost per kg (read-only;
/// buying stock and producing batches are still done in the web app).
class FactoryTab extends StatefulWidget {
  const FactoryTab({super.key, required this.app});
  final AppState app;

  @override
  State<FactoryTab> createState() => _FactoryTabState();
}

class _FactoryTabState extends State<FactoryTab> {
  InvSortKey _sort = InvSortKey.name;
  FactorySummary? _data;
  List<FormulaCost> _formulas = const [];
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
    final d = await app.repo.factorySummary(sort: _sort, descending: _sort == InvSortKey.amount);
    final f = await app.repo.formulaCostList();
    if (mounted) setState(() { _data = d; _formulas = f; });
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

  Widget _heading(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 6),
        child: Text(t, style: const TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
      );

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: app.sync,
      child: ListView(padding: const EdgeInsets.all(12), children: [
        Row(children: [
          _stat('Raw materials', money(d.totalValue), color: SarimColors.accent),
          _stat('Collected', '${fmtNum(d.totalCollectedKg)} kg', color: SarimColors.gold),
        ]),
        _heading('RAW MATERIALS'),
        SegmentedButton<InvSortKey>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: InvSortKey.name, label: Text('Name')),
            ButtonSegment(value: InvSortKey.amount, label: Text('Value')),
          ],
          selected: {_sort},
          onSelectionChanged: (s) {
            setState(() => _sort = s.first);
            _load();
          },
        ),
        const SizedBox(height: 8),
        if (d.materials.isEmpty)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No raw materials yet.')))
        else
          for (final m in d.materials)
            Card(
              child: ListTile(
                title: Text(m.name),
                subtitle: Text(m.outOfStock ? '${_stockText(m)} · Out of stock' : _stockText(m), style: TextStyle(color: m.outOfStock ? SarimColors.danger : null)),
                trailing: Text(money(m.value), style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
        _heading('FORMULAS'),
        if (_formulas.isEmpty)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No formulas yet.')))
        else
          for (final f in _formulas)
            Card(
              child: ListTile(
                title: Text(f.name),
                subtitle: Text('${f.ingredients} ${f.ingredients == 1 ? 'ingredient' : 'ingredients'}'),
                trailing: Text('${money(f.costPerKg)}/kg', style: const TextStyle(fontWeight: FontWeight.w700, color: SarimColors.gold)),
              ),
            ),
      ]),
    );
  }
}
