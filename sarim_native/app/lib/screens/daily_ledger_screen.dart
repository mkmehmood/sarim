import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import '../ui/theme.dart';
import 'ledger_screen.dart';

/// One day's cash movements: total in, total out, net, and every entry (the web Daily Ledger's day view).
class DailyLedgerScreen extends StatefulWidget {
  const DailyLedgerScreen({super.key, required this.app, this.day});
  final AppState app;
  final DateTime? day;

  @override
  State<DailyLedgerScreen> createState() => _DailyLedgerScreenState();
}

class _DailyLedgerScreenState extends State<DailyLedgerScreen> {
  late DateTime _day = widget.day ?? DateTime.now();
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
    final d = await app.repo.paymentsSummary(ProdPeriod.day, today: _day);
    if (mounted) setState(() => _data = d);
  }

  void _move(int days) {
    setState(() => _day = DateTime(_day.year, _day.month, _day.day + days));
    _load();
  }

  Future<void> _pick() async {
    final p = await showDatePicker(context: context, initialDate: _day, firstDate: DateTime(2020), lastDate: DateTime(2100));
    if (p != null) {
      setState(() => _day = p);
      _load();
    }
  }

  Widget _total(String label, double value, int count, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: [
              Text(label, style: const TextStyle(fontSize: 11, color: Colors.white60)),
              const SizedBox(height: 4),
              Text(money(value), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color)),
              Text('$count ${count == 1 ? 'entry' : 'entries'}', style: const TextStyle(fontSize: 11, color: Colors.white54)),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Daily Ledger')),
      body: d == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(12), children: [
              Row(children: [
                IconButton(tooltip: 'Previous day', icon: const Icon(Icons.chevron_left), onPressed: () => _move(-1)),
                Expanded(child: TextButton(onPressed: _pick, child: Text(localDateStr(_day), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)))),
                IconButton(tooltip: 'Next day', icon: const Icon(Icons.chevron_right), onPressed: () => _move(1)),
              ]),
              Row(children: [
                _total('Total Cash In', d.received, d.countIn, SarimColors.accent),
                _total('Total Cash Out', d.paidOut, d.countOut, SarimColors.danger),
              ]),
              Card(
                child: ListTile(
                  title: const Text('Net Balance'),
                  subtitle: Text(d.net < 0 ? 'Deficit' : 'Surplus'),
                  trailing: Text(
                    d.net < 0 ? '-${money(-d.net)}' : money(d.net),
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: d.net < 0 ? SarimColors.danger : SarimColors.gold),
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(4, 16, 4, 6),
                child: Text('ENTRIES', style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w700)),
              ),
              if (d.rows.isEmpty)
                const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No entries on this day.')))
              else
                for (final r in d.rows)
                  Card(
                    child: ListTile(
                      title: Text(r.name.isEmpty ? (r.isOut ? 'Money out' : 'Cash in') : r.name),
                      subtitle: Text(switch (r.kind) {
                        PayKind.cashSale => 'Cash sale',
                        PayKind.collection => 'Collection',
                        PayKind.partialPayment => 'Partial payment',
                        PayKind.moneyOut => 'Money out',
                      }),
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
