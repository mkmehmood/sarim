import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';

class LedgerScreen extends StatefulWidget {
  const LedgerScreen({super.key, required this.app, required this.name});
  final AppState app;
  final String name;

  @override
  State<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends State<LedgerScreen> {
  CustomerLedger? _ledger;
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
    final l = await app.repo.ledger(widget.name);
    if (mounted) setState(() => _ledger = l);
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  /// Shared amount / date / note dialog. [save] throws [ValidationError] to show a message in the dialog.
  Future<bool> _entryDialog({
    required String title,
    required String blurb,
    required Future<void> Function(double amount, DateTime date, String note) save,
  }) async {
    final amount = TextEditingController();
    final note = TextEditingController();
    var date = DateTime.now();
    String? error;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(title),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(blurb),
              const SizedBox(height: 12),
              TextField(
                controller: amount,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount (Rs)', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today, size: 18),
                label: Text(localDateStr(date)),
                onPressed: () async {
                  final picked = await showDatePicker(context: ctx, initialDate: date, firstDate: DateTime(2020), lastDate: DateTime.now().add(const Duration(days: 1)));
                  if (picked != null) setLocal(() => date = picked);
                },
              ),
              const SizedBox(height: 12),
              TextField(controller: note, maxLength: 120, decoration: const InputDecoration(labelText: 'Note (optional)', border: OutlineInputBorder())),
              if (error != null) Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                final value = double.tryParse(amount.text.trim().replaceAll(',', ''));
                try {
                  await save(value ?? 0, date, note.text);
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
    return ok == true;
  }

  Future<void> _moneyOut() async {
    final ok = await _entryDialog(
      title: 'Money out',
      blurb: 'Cash paid out to ${widget.name}. It is added to what the customer owes (or reduces their credit).',
      save: (amount, date, note) => app.repo.recordMoneyOut(name: widget.name, amount: amount, date: localDateStr(date), note: note),
    );
    if (ok) {
      app.changed();
      _snack('Money out recorded for ${widget.name}');
    }
  }

  Future<void> _collect() async {
    final ok = await _entryDialog(
      title: 'Collect payment',
      blurb: 'Cash received from ${widget.name}. It is applied to their unpaid credit sales, newest first.',
      save: (amount, date, note) async {
        try {
          await app.repo.recordCollection(name: widget.name, amount: amount, date: localDateStr(date), note: note);
        } on OverpaymentRequired catch (e) {
          final go = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Overpayment'),
              content: Text('${widget.name} owes ${money(e.owed)} but you are collecting ${money(e.amount)}.\n\nProceed only if this is an advance payment.'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Back')),
                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Record advance')),
              ],
            ),
          );
          if (go != true) throw ValidationError('Collection not recorded.');
          await app.repo.recordCollection(name: widget.name, amount: amount, date: localDateStr(date), note: note, allowOverpayment: true);
        }
      },
    );
    if (ok) {
      app.changed();
      _snack('Collection recorded for ${widget.name}');
    }
  }

  Future<void> _delete(LedgerEntry e) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete ${entryTitle(e.kind).toLowerCase()}?'),
        content: Text("${e.date}\n${money(e.amount)}\n\n${e.kind == EntryKind.collection ? 'Sales this payment settled will be reopened.' : "The amount will be removed from the customer's balance."}"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.redAccent), onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (yes != true) return;
    final reason = await app.repo.deleteTransaction(e.id);
    if (reason != null) {
      _snack(reason);
    } else {
      app.changed();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _ledger;
    return Scaffold(
      appBar: AppBar(title: Text(widget.name)),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(child: FilledButton.icon(onPressed: _collect, icon: const Icon(Icons.south_west), label: const Text('Collect'))),
            const SizedBox(width: 12),
            Expanded(child: FilledButton.tonalIcon(onPressed: _moneyOut, icon: const Icon(Icons.north_east), label: const Text('Money out'))),
          ]),
        ),
      ),
      body: l == null
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
              Card(
                margin: const EdgeInsets.all(12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Outstanding'),
                      Text(money(l.outstanding), style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: l.outstanding > 0.005 ? Colors.redAccent : Colors.greenAccent)),
                      if (l.phone.isNotEmpty) Text(l.phone),
                    ]),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('Sold ${money(l.totals.totalSale)}'),
                      Text('Received ${money(l.totals.totalReceived)}'),
                      Text('${fmtNum(l.quantity)} kg'),
                    ]),
                  ]),
                ),
              ),
              Expanded(
                child: l.entries.isEmpty
                    ? const Center(child: Text('No transactions yet.'))
                    : ListView.separated(
                        itemCount: l.entries.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (ctx, i) {
                          final e = l.entries[l.entries.length - 1 - i]; // newest first
                          final isDebit = e.split.debit > e.split.credit || e.kind == EntryKind.moneyOut;
                          final color = e.kind == EntryKind.sale ? null : (isDebit ? Colors.redAccent : Colors.greenAccent);
                          return ListTile(
                            title: Text(entryTitle(e.kind)),
                            subtitle: Text([e.date, if (e.note.isNotEmpty) e.note, 'Balance ${balanceText(e.balance)}'].join('  ·  ')),
                            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                              Text(money(e.amount), style: TextStyle(fontWeight: FontWeight.w600, color: color)),
                              if (e.canDelete) IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: () => _delete(e)),
                            ]),
                          );
                        },
                      ),
              ),
            ]),
    );
  }
}
