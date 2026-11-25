import 'js_num.dart';
import 'production.dart' show ProdPeriod, periodStart;

enum PayKind { cashSale, collection, partialPayment, moneyOut }

/// One cash movement shown on the Payments tab.
class PaymentRow {
  PaymentRow(this.rec, this.kind, this.amount);
  final Rec rec;
  final PayKind kind;
  final double amount;
  bool get isOut => kind == PayKind.moneyOut;
  String get name => '${rec['customerName'] ?? ''}';
  String get date => '${rec['date'] ?? ''}';
}

class PaymentsSummary {
  PaymentsSummary(this.received, this.paidOut, this.rows);
  final double received; // cash sales + collections + partial payments
  final double paidOut; // Money Out
  final List<PaymentRow> rows; // newest first
  double get net => round2(received - paidOut);
}

PayKind? _kindOf(Rec t) {
  if (t['isRepReturn'] == true) return null;
  switch (t['paymentType']) {
    case 'CASH':
      return PayKind.cashSale;
    case 'COLLECTION':
      return PayKind.collection;
    case 'PARTIAL_PAYMENT':
      return PayKind.partialPayment;
    case 'MONEY_OUT':
      return PayKind.moneyOut;
  }
  return null;
}

/// Cash moved in or out in [period]. Deleted records are skipped. A partial payment
/// is dated by when the money arrived (`creditReceivedDate`), like the customer ledger.
PaymentsSummary summarizePayments(List<Rec> sales, Set<String> deleted, ProdPeriod period, DateTime today) {
  final from = periodStart(period, today);
  final todayStr = localDateStr(today);
  final rows = <PaymentRow>[];
  var received = 0.0, out = 0.0;
  for (final t in sales) {
    if (t['deleted'] == true || deleted.contains('${t['id']}')) continue;
    final kind = _kindOf(t);
    if (kind == null) continue;
    final d = '${(kind == PayKind.partialPayment ? (t['creditReceivedDate'] ?? t['date']) : t['date']) ?? ''}';
    if (from != null && (d.compareTo(from) < 0 || d.compareTo(todayStr) > 0)) continue;
    final amount = round2(numOf(t['totalValue']));
    if (amount <= 0) continue;
    final rec = kind == PayKind.partialPayment ? <String, dynamic>{...t, 'date': d} : t;
    rows.add(PaymentRow(rec, kind, amount));
    if (kind == PayKind.moneyOut) {
      out += amount;
    } else {
      received += amount;
    }
  }
  rows.sort((a, b) {
    final c = b.date.compareTo(a.date);
    return c != 0 ? c : numOf(b.rec['timestamp']).compareTo(numOf(a.rec['timestamp']));
  });
  return PaymentsSummary(round2(received), round2(out), rows);
}
