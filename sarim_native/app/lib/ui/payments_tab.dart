import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import '../screens/ledger_screen.dart';
import 'theme.dart';

const _periodLabels = {
  ProdPeriod.day: 'Day',
  ProdPeriod.week: 'Week',
  ProdPeriod.month: 'Month',
  ProdPeriod.year: 'Year',
  ProdPeriod.all: 'All',
};

String _kindTitle(PayKind k) {
  switch (k) {
    case PayKind.cashSale:
      return 'Cash sale';
    case PayKind.collection:
      return 'Collection';
    case PayKind.partialPayment:
      return 'Partial payment';
    case PayKind.moneyOut:
      return 'Money out';
  }
}

/// Cash received and paid out, by period. Tapping a row opens that customer's ledger.
class PaymentsTab extends StatefulWidget {
  const PaymentsTab({super.key, required this.app});
  final AppState app;

  @override
  State<PaymentsTab> createState() => _PaymentsTabState();
}

class _PaymentsTabState extends State<PaymentsTab> {
  ProdPeriod _period = ProdPeriod.day;
  PaymentsSummary? _data;
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
    final d = await app.repo.paymentsSummary(_period);
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
          _stat('Received', money(d.received), color: SarimColors.accent),
          _stat('Paid out', money(d.paidOut), color: SarimColors.danger),
          _stat('Net cash', d.net < 0 ? '-${money(-d.net)}' : money(d.net), color: SarimColors.gold),
        ]),
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 16, 4, 6),
          child: Text('PAYMENTS', style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
        ),
        if (d.rows.isEmpty)
          const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No payments in this period.')))
        else
          for (final r in d.rows)
            Card(
              child: ListTile(
                title: Text(r.name.isEmpty ? _kindTitle(r.kind) : r.name),
                subtitle: Text('${_kindTitle(r.kind)} · ${r.date}'),
                trailing: Text(
                  '${r.isOut ? '-' : '+'}${money(r.amount)}',
                  style: TextStyle(fontWeight: FontWeight.w700, color: r.isOut ? SarimColors.danger : SarimColors.accent),
                ),
                onTap: r.name.isEmpty
                    ? null
                    : () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => LedgerScreen(app: app, name: r.name))),
              ),
            ),
      ]),
    );
  }
}
