import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import 'theme.dart';

/// Rep cash reconciliation: how much cash should have been handed over, and whether it is short or over
/// (the web Calculator's live result; saving a calculation is still done in the web app).
class CalculatorTab extends StatefulWidget {
  const CalculatorTab({super.key, required this.app});
  final AppState app;

  @override
  State<CalculatorTab> createState() => _CalculatorTabState();
}

class _CalculatorTabState extends State<CalculatorTab> {
  static const _fields = <(String, String)>[
    ('sold', 'Total sold (kg)'),
    ('returned', 'Returned (kg)'),
    ('expired', 'Expired (kg)'),
    ('shared', 'Shared (kg)'),
    ('credit', 'Credit sales (kg)'),
    ('prevCreditReceived', 'Previous credit received'),
    ('receivedCash', 'Cash received'),
    ('fieldExpenses', 'Field expenses'),
    ('commissionPerUnit', 'Commission per kg'),
    ('commissionPaid', 'Commission paid'),
  ];

  final Map<String, TextEditingController> _c = {for (final f in _fields) f.$1: TextEditingController()};
  List<StoreInfo> _stores = const [];
  String? _store;
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
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _onApp() {
    if (app.revision != _loadedRevision) _load();
  }

  Future<void> _load() async {
    _loadedRevision = app.revision;
    final stores = await app.repo.stores();
    if (!mounted) return;
    setState(() {
      _stores = stores;
      if (_store == null || !stores.any((s) => s.key == _store)) _store = stores.isEmpty ? null : stores.first.key;
    });
  }

  double _n(String k) => parseFloatJs(_c[k]!.text) ?? 0; // blank or invalid = 0, like the web form

  double get _price => salePriceForStore(_stores, _store);

  CalcResult get _result => calcReconcile(CalcInputs(
        sold: _n('sold'),
        returned: _n('returned'),
        expired: _n('expired'),
        shared: _n('shared'),
        credit: _n('credit'),
        prevCreditReceived: _n('prevCreditReceived'),
        receivedCash: _n('receivedCash'),
        fieldExpenses: _n('fieldExpenses'),
        salePrice: _price,
        commissionPerUnit: _n('commissionPerUnit'),
        commissionPaid: _n('commissionPaid'),
      ));

  Widget _row(String label, String value, {Color? color, Key? key}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(child: Text(label, style: const TextStyle(color: Colors.white70))),
          Text(value, key: key, style: TextStyle(fontWeight: FontWeight.w700, color: color)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final r = _result;
    final statusText = switch (r.status) {
      CashStatus.match => 'PERFECT MATCH',
      CashStatus.short => 'SHORT: ${money(r.amount)}',
      CashStatus.over => 'OVER: ${money(r.amount)}',
    };
    final ok = r.status != CashStatus.short;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_stores.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('No stores yet. Sync to load stores and their sale prices.')))
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                DropdownButtonFormField<String>(
                  key: const ValueKey('calc-store'),
                  value: _store,
                  decoration: const InputDecoration(labelText: 'Store'),
                  items: [for (final s in _stores) DropdownMenuItem(value: s.key, child: Text(s.name))],
                  onChanged: (v) => setState(() => _store = v),
                ),
                const SizedBox(height: 8),
                Text(_price > 0 ? 'Sale price ${money(_price)}/kg' : 'No sale price set for this store', style: TextStyle(color: _price > 0 ? SarimColors.accent : SarimColors.danger)),
              ]),
            ),
          ),
        const SizedBox(height: 8),
        for (final f in _fields)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextField(
              key: ValueKey('f-${f.$1}'),
              controller: _c[f.$1],
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: f.$2),
              onChanged: (_) => setState(() {}),
            ),
          ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(children: [
              _row('Net sold', '${fmtNum(r.netSold)} kg'),
              _row('Expected cash', money(r.expectedCash), color: SarimColors.gold),
              _row('Result', statusText, color: ok ? SarimColors.accent : SarimColors.danger, key: const ValueKey('calc-status')),
              const Divider(),
              _row('Commission earned', money(r.grossCommission)),
              _row('Commission paid', money(r.commissionPaid)),
              _row('Commission payable', money(r.commissionPayable), color: r.commissionPayable <= 0.01 ? SarimColors.accent : SarimColors.danger),
            ]),
          ),
        ),
      ]),
    );
  }
}
