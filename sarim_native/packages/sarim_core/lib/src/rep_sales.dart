import 'finance.dart';
import 'js_num.dart';
import 'production.dart' show ProdPeriod, periodStart;

/// One sales rep's totals for a period.
class RepTotals {
  RepTotals(this.rep);
  final String rep;
  double soldKg = 0, returnedKg = 0, salesValue = 0, cashIn = 0, creditGiven = 0, returnsValue = 0;
  int entries = 0;
  double get netKg => round2(soldKg - returnedKg);
}

class RepSummary {
  RepSummary(this.reps);
  final List<RepTotals> reps; // biggest sales first
  double get salesValue => round2(reps.fold(0.0, (a, r) => a + r.salesValue));
  double get cashIn => round2(reps.fold(0.0, (a, r) => a + r.cashIn));
  double get netKg => round2(reps.fold(0.0, (a, r) => a + r.netKg));
}

bool _isRepRecord(Rec t) {
  final rep = '${t['salesRep'] ?? ''}';
  return rep.isNotEmpty && rep != 'NONE' && rep != 'admin';
}

/// Per-rep sales, cash received and returns in [period]. Deleted and merged rows are skipped;
/// quantities use the same helpers as the customer ledger, so kg match the web app.
RepSummary summarizeRepSales(List<Rec> sales, Set<String> deleted, ProdPeriod period, DateTime today) {
  final from = periodStart(period, today);
  final todayStr = localDateStr(today);
  final by = <String, RepTotals>{};
  for (final t in sales) {
    if (t['deleted'] == true || deleted.contains('${t['id']}') || !_isRepRecord(t)) continue;
    if (truthy(t['isMerged']) || t['transactionType'] == 'OLD_DEBT') continue;
    final d = '${t['date'] ?? ''}';
    if (from != null && (d.compareTo(from) < 0 || d.compareTo(todayStr) > 0)) continue;
    final r = by.putIfAbsent('${t['salesRep']}', () => RepTotals('${t['salesRep']}'));
    r.entries++;
    r.soldKg += soldQuantity(t);
    r.returnedKg += returnedQuantity(t);
    final value = numOf(t['totalValue']);
    switch (t['paymentType']) {
      case 'CASH':
        r.salesValue += value;
        r.cashIn += value;
      case 'CREDIT':
        r.salesValue += value;
        r.creditGiven += value;
      case 'COLLECTION' || 'PARTIAL_PAYMENT':
        r.cashIn += value;
      default:
        if (t['isRepReturn'] == true || t['paymentType'] == 'REP_RETURN') r.returnsValue += numOf(t['returnValue']);
    }
  }
  final list = by.values.toList();
  for (final r in list) {
    r.soldKg = round2(r.soldKg);
    r.returnedKg = round2(r.returnedKg);
    r.salesValue = round2(r.salesValue);
    r.cashIn = round2(r.cashIn);
    r.creditGiven = round2(r.creditGiven);
    r.returnsValue = round2(r.returnsValue);
  }
  list.sort((a, b) {
    final c = b.salesValue.compareTo(a.salesValue);
    return c != 0 ? c : a.rep.compareTo(b.rep);
  });
  return RepSummary(list);
}
