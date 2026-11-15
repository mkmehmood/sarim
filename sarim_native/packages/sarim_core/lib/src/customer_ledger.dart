import 'finance.dart';
import 'js_num.dart';
import 'tx_date.dart';

typedef PriceFor = double Function(String? customerName, String? store);

/// Port of getSaleTransactionValue (factory-core.js). [priceFor] supplies the store/customer
/// sale price for records that have no locked unit price.
double saleTransactionValue(Rec? t, {PriceFor? priceFor}) {
  if (t == null) return 0;
  double tv() => parseFloatJs(t['totalValue']) ?? 0;
  if (truthy(t['isMerged'])) return tv();
  final pt = truthy(t['paymentType']) ? t['paymentType'] : 'CASH';
  if (pt == 'COLLECTION' || pt == 'PARTIAL_PAYMENT' || pt == 'MONEY_OUT') return tv();
  if (t['transactionType'] == 'OLD_DEBT') return tv();
  final qty = parseFloatJs(t['quantity']) ?? 0;
  final locked = lockedSaleValue(t);
  if (locked != null) return locked;
  final price = priceFor?.call(t['customerName'] as String?, t['supplyStore'] as String?) ?? 0;
  return round2(qty * price);
}

bool _isAdminRow(Rec? s) => s != null && s['currentRepProfile'] == 'admin';

class CustomerSummary {
  CustomerSummary(this.name, {this.credit = 0, this.quantity = 0, this.lastSaleDate = 0, this.phone = ''});
  final String name;
  double credit;
  double quantity;
  int lastSaleDate;
  String phone;
  bool get owes => credit > 0.005;
}

class CustomerList {
  CustomerList(this.customers, this.totalOutstanding, this.totalQuantity);
  final List<CustomerSummary> customers;
  final double totalOutstanding, totalQuantity;
}

/// Port of renderCustomersTable's data step: one row per customer with outstanding balance.
CustomerList customerSummaries({
  required List<Rec> sales,
  required List<Rec> customers,
  Set<String> deletedIds = const {},
  Set<String> reconciledReturnIds = const {},
  PriceFor? priceFor,
  String filter = '',
}) {
  bool alive(Rec? r) => r != null && truthy(r['id']) && !deletedIds.contains('${r['id']}');
  final liveSales = sales.where(alive).toList();
  final liveCustomers = customers.where(alive).toList();
  final stats = <String, CustomerSummary>{};
  final order = <String>[];
  final opts = LedgerOpts(reconciledReturnIds: reconciledReturnIds);
  for (final s in liveSales) {
    final name = s['customerName'];
    if (name is! String || name.trim().isEmpty) continue;
    if (!_isAdminRow(s)) continue;
    final c = stats.putIfAbsent(name, () { order.add(name); return CustomerSummary(name); });
    c.quantity += numOf(s['quantity']);
    c.credit = round2(c.credit + debtDelta(s, debtNeedsGross(s) ? saleTransactionValue(s, priceFor: priceFor) : 0, opts));
    final d = s['date'];
    if (truthy(d)) {
      final ts = DateTime.tryParse('$d')?.millisecondsSinceEpoch;
      if (ts != null && ts > c.lastSaleDate) c.lastSaleDate = ts;
    }
  }
  final indexed = [for (var i = 0; i < order.length; i++) (i, stats[order[i]]!)];
  indexed.sort((a, b) {
    if (b.$2.credit != a.$2.credit) return b.$2.credit.compareTo(a.$2.credit);
    final byDate = b.$2.lastSaleDate.compareTo(a.$2.lastSaleDate);
    return byDate != 0 ? byDate : a.$1.compareTo(b.$1);
  });
  var sorted = indexed.map((e) => e.$2).toList();
  final seen = sorted.map((c) => c.name.toLowerCase()).toSet();
  for (final sc in liveCustomers) {
    final n = sc['name'];
    if (n is! String || n.trim().isEmpty) continue;
    if (seen.add(n.toLowerCase())) sorted.add(CustomerSummary(n));
  }
  final phoneByName = <String, String>{};
  for (final ct in liveCustomers) {
    if (ct['name'] is String && truthy(ct['phone'])) phoneByName[(ct['name'] as String).toLowerCase()] = '${ct['phone']}';
  }
  final salePhone = <String, String>{};
  for (final s in liveSales) {
    if (s['customerName'] is String && truthy(s['customerPhone'])) salePhone.putIfAbsent(s['customerName'] as String, () => '${s['customerPhone']}');
  }
  for (final c in sorted) {
    c.phone = phoneByName[c.name.toLowerCase()] ?? salePhone[c.name] ?? '';
  }
  final f = filter.toLowerCase();
  if (f.isNotEmpty) sorted = sorted.where((c) => c.name.toLowerCase().contains(f)).toList();
  var out = 0.0, qty = 0.0;
  for (final c in sorted) { out += c.credit; qty += c.quantity; }
  return CustomerList(sorted, out, qty);
}

enum EntryKind { sale, creditSale, collection, partialPayment, moneyOut, oldDebt, openingBalance, repReturn }

class LedgerEntry {
  LedgerEntry({required this.record, required this.kind, required this.date, required this.amount, required this.delta, required this.balance, required this.split});
  final Rec record;
  final EntryKind kind;
  final String date;
  final double amount;
  final double delta;
  final double balance;
  final LedgerSplit split;
  String get id => '${record['id']}';
  String get note => '${record['notes'] ?? ''}';
  bool get canEdit => kind != EntryKind.moneyOut && kind != EntryKind.oldDebt && kind != EntryKind.openingBalance;
  bool get canDelete => !truthy(record['isMerged']);
}

class CustomerLedger {
  CustomerLedger(this.name, this.phone, this.address, this.entries, this.totals, this.outstanding, this.quantity);
  final String name, phone, address;
  /// Oldest first, each with the running balance after it.
  final List<LedgerEntry> entries;
  final PeriodTotals totals;
  final double outstanding;
  final double quantity;
}

EntryKind entryKindOf(Rec t) {
  if (truthy(t['isMerged'])) return EntryKind.openingBalance;
  if (t['transactionType'] == 'OLD_DEBT') return EntryKind.oldDebt;
  final pt = t['paymentType'];
  if (pt == 'MONEY_OUT') return EntryKind.moneyOut;
  if (pt == 'COLLECTION') return EntryKind.collection;
  if (pt == 'PARTIAL_PAYMENT') return EntryKind.partialPayment;
  if (t['isRepReturn'] == true || pt == 'REP_RETURN') return EntryKind.repReturn;
  if (pt == 'CREDIT') return EntryKind.creditSale;
  return EntryKind.sale;
}

/// Port of renderCustomerTransactions' data step (ordering, deltas and running balance).
CustomerLedger buildCustomerLedger(
  String name, {
  required List<Rec> sales,
  List<Rec> customers = const [],
  Set<String> deletedIds = const {},
  Set<String> reconciledReturnIds = const {},
  PriceFor? priceFor,
}) {
  final live = sales.where((s) => truthy(s['id']) && !deletedIds.contains('${s['id']}')).toList();
  final history = live.where((s) => _isAdminRow(s) && s['customerName'] == name).toList();
  final honor = allocHonor(live);
  final opts = LedgerOpts(reconciledReturnIds: reconciledReturnIds, honor: honor);
  final asc = [for (var i = 0; i < history.length; i++) (i, history[i])]
    ..sort((a, b) {
      final c = txDeviceCompare(a.$2, b.$2);
      return c != 0 ? c : a.$1.compareTo(b.$1);
    });
  var run = 0.0;
  final entries = <LedgerEntry>[];
  for (final e in asc) {
    final t = e.$2;
    final gross = debtNeedsGross(t) ? saleTransactionValue(t, priceFor: priceFor) : 0.0;
    final delta = ledgerDelta(t, gross, opts);
    run = round2(run + delta);
    final kind = entryKindOf(t);
    final value = saleTransactionValue(t, priceFor: priceFor);
    final amount = kind == EntryKind.repReturn ? numOf(t['returnValue']) : value;
    entries.add(LedgerEntry(
      record: t,
      kind: kind,
      date: txDeviceDate(t),
      amount: amount,
      delta: delta,
      balance: run,
      split: ledgerSplit(t, gross, opts),
    ));
  }
  Rec? registry;
  for (final c in customers) {
    if (c['name'] is String && (c['name'] as String).toLowerCase() == name.toLowerCase()) { registry = c; break; }
  }
  String phone = registry != null && truthy(registry['phone']) ? '${registry['phone']}' : '';
  if (phone.isEmpty) {
    for (final t in history) { if (truthy(t['customerPhone'])) { phone = '${t['customerPhone']}'; break; } }
  }
  final totals = periodTotals(history.map((t) => (t: t, value: saleTransactionValue(t, priceFor: priceFor))));
  return CustomerLedger(name, phone, registry != null ? '${registry['address'] ?? ''}' : '', entries, totals, run > 0 ? run : 0, periodQuantity(history));
}
