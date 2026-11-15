import 'js_num.dart';

/// Port of modules/finance.js (customer balance and ledger maths).
/// Records are the same JSON maps the web app stores, so data is interchangeable.

double lockedUnitPrice(Rec? t) {
  if (t == null) return 0;
  final up = numOf(t['unitPrice']);
  if (up > 0) return up;
  final qty = numOf(t['quantity']);
  final tv = numOf(t['totalValue']);
  return (qty > 0 && tv > 0) ? tv / qty : 0;
}

double? lockedSaleValue(Rec? t) {
  if (t == null) return null;
  final qty = numOf(t['quantity']);
  if (qty <= 0) return numOf(t['totalValue']);
  final up = numOf(t['unitPrice']);
  if (up > 0) return round2(qty * up);
  final tv = numOf(t['totalValue']);
  return tv > 0 ? round2(tv) : null;
}

bool debtNeedsGross(Rec? t) {
  if (t == null || truthy(t['creditReceived'])) return false;
  if (t['transactionType'] == 'OLD_DEBT') return true;
  return t['paymentType'] == 'CREDIT' && !(truthy(t['isMerged']) && t['creditValue'] is num);
}

double collectionExpiredLeft(Rec? t) {
  if (t == null) return 0;
  final allocated = numOf(t['expiredAllocated']);
  return round2(_max0(numOf(t['expiredValue']) - _max0(allocated)));
}

bool _isCol(Rec? t) => t != null && (t['paymentType'] == 'COLLECTION' || t['paymentType'] == 'PARTIAL_PAYMENT');
bool _isRepReturn(Rec t) => t['isRepReturn'] == true || t['paymentType'] == 'REP_RETURN';
double _max0(double v) => v > 0 ? v : 0;

class LedgerOpts {
  const LedgerOpts({this.reconciledReturnIds, this.honor});
  final Set<String>? reconciledReturnIds;
  final Honor? honor;
}

double debtDelta(Rec? t, double grossValue, [LedgerOpts? opts]) {
  if (t == null) return 0;
  final partial = numOf(t['partialPaymentReceived']);
  final gross = numOf(grossValue);
  if (_isRepReturn(t)) {
    final v = round2(_max0(numOf(t['returnValue'])));
    if (v <= 0) return 0;
    final done = opts?.reconciledReturnIds;
    if (done != null && done.contains(t['id'])) return 0;
    return -v;
  }
  if (t['transactionType'] == 'OLD_DEBT') {
    return truthy(t['creditReceived']) ? 0 : round2(_max0(gross - partial));
  }
  if (t['paymentType'] == 'CREDIT' && !truthy(t['creditReceived'])) {
    if (truthy(t['isMerged']) && t['creditValue'] is num) return round2(_max0((t['creditValue'] as num).toDouble()));
    return round2(_max0(gross - partial));
  }
  if (_isCol(t)) {
    return round2(-(_max0(numOf(t['totalValue'])) + collectionExpiredLeft(t)));
  }
  if (t['paymentType'] == 'MONEY_OUT') return round2(_max0(numOf(t['totalValue'])));
  return 0;
}

class Honor {
  Honor(this.bySale, this.byCol);
  final Map<String, double> bySale;
  final Map<String, double> byCol;
}

double _amt(dynamic a) => _max0(numOf(a is Map ? a['amount'] : null));

Honor allocHonor(List<Rec?>? records) {
  final list = (records ?? const <Rec?>[]).where((t) => t != null && truthy(t['id']) && !truthy(t['deletedAt'])).cast<Rec>().toList();
  final byId = <dynamic, Rec>{for (final t in list) t['id']: t};
  final perSale = <String, List<({String cid, double amt})>>{};
  for (final c in list) {
    if (!_isCol(c) || c['allocations'] is! List) continue;
    for (final a in (c['allocations'] as List)) {
      if (a is! Map) continue;
      final s = byId[a['saleId']];
      if (s == null) continue;
      Map? e;
      if (s['collectionAllocs'] is List) {
        for (final x in (s['collectionAllocs'] as List)) {
          if (x is Map && x['cid'] == c['id']) { e = x; break; }
        }
      }
      if (e == null) continue;
      final amt = _amt(a) < _amt(e) ? _amt(a) : _amt(e);
      perSale.putIfAbsent('${s['id']}', () => []).add((cid: '${c['id']}', amt: amt));
    }
  }
  final bySale = <String, double>{};
  final byCol = <String, double>{};
  perSale.forEach((sid, pairs) {
    final s = byId[sid]!;
    final double cap = truthy(s['creditReceived'])
        ? (numOf(s['totalValue']) > 0 ? numOf(s['totalValue']) : double.infinity)
        : _max0(numOf(s['partialPaymentReceived']));
    final sum = pairs.fold<double>(0, (n, p) => n + p.amt);
    final f = (sum > cap && sum > 0) ? cap / sum : 1.0;
    for (final p in pairs) {
      final h = round2(p.amt * f);
      bySale[sid] = round2((bySale[sid] ?? 0) + h);
      byCol[p.cid] = round2((byCol[p.cid] ?? 0) + h);
    }
  });
  return Honor(bySale, byCol);
}

double honoredToSale(Honor? honor, Rec? t) => (honor != null && t != null) ? (honor.bySale['${t['id']}'] ?? 0) : 0;

double ledgerDelta(Rec? t, double grossValue, [LedgerOpts? opts]) {
  if (t == null) return 0;
  final d = debtDelta(t, grossValue, opts);
  final honor = opts?.honor;
  if (honor == null) return d;
  if (_isCol(t)) return round2(d - (honor.byCol['${t['id']}'] ?? 0));
  if (_isRepReturn(t) || truthy(t['isMerged'])) return d;
  return round2(d + (honor.bySale['${t['id']}'] ?? 0));
}

class LedgerSplit {
  const LedgerSplit(this.debit, this.credit, this.delta);
  final double debit, credit, delta;
}

LedgerSplit ledgerSplit(Rec? t, double grossValue, [LedgerOpts? opts]) {
  final delta = ledgerDelta(t, grossValue, opts);
  if (t == null || _isRepReturn(t) || t['paymentType'] == 'MONEY_OUT' || _isCol(t)) {
    return LedgerSplit(delta > 0 ? delta : 0, delta < 0 ? -delta : 0, delta);
  }
  final gross = _max0(numOf(grossValue));
  final credit = round2(_max0(gross - delta));
  return LedgerSplit(round2(delta + credit), credit, delta);
}

class RowReceived {
  double sale = 0, collection = 0, returns = 0, cash = 0, paid = 0, received = 0, moneyOut = 0;
}

RowReceived rowReceived(Rec? t, double value) {
  final z = RowReceived();
  if (t == null || truthy(t['isMerged']) || t['transactionType'] == 'OLD_DEBT') return z;
  if (t['paymentType'] == 'MONEY_OUT') {
    z.moneyOut = _max0(numOf(t['totalValue']));
    return z;
  }
  if (_isRepReturn(t)) {
    z.returns = _max0(numOf(t['returnValue']));
  } else if (_isCol(t)) {
    final collected = t['collectedAmount'] != null ? numOf(t['collectedAmount']) : numOf(t['totalValue']);
    z.collection = _max0(collected) + _max0(numOf(t['expiredValue']));
  } else {
    final v = _max0(numOf(value));
    z.sale = v;
    if (t['paymentType'] == 'CASH') {
      z.cash = v;
    } else if (t['paymentType'] == 'CREDIT' &&
        truthy(t['creditReceived']) &&
        !(t['collectionAllocs'] is List && (t['collectionAllocs'] as List).isNotEmpty)) {
      z.paid = v;
    }
  }
  z.received = z.collection + z.returns + z.cash + z.paid;
  return z;
}

class PeriodTotals {
  PeriodTotals(this.totalSale, this.collection, this.returns, this.totalCollection, this.cashSales, this.paidSales, this.totalReceived);
  final double totalSale, collection, returns, totalCollection, cashSales, paidSales, totalReceived;
}

PeriodTotals periodTotals(Iterable<({Rec t, double value})> rows) {
  double sale = 0, collection = 0, returns = 0, cashSales = 0, paidSales = 0;
  for (final row in rows) {
    final r = rowReceived(row.t, row.value);
    sale += r.sale;
    collection += r.collection;
    returns += r.returns;
    cashSales += r.cash;
    paidSales += r.paid;
  }
  return PeriodTotals(round2(sale), round2(collection), round2(returns), round2(collection + returns), round2(cashSales),
      round2(paidSales), round2(collection + returns + cashSales + paidSales));
}

double soldQuantity(Rec? t) {
  if (t == null || truthy(t['isMerged']) || t['transactionType'] == 'OLD_DEBT') return 0;
  if (_isRepReturn(t) || t['paymentType'] == 'MONEY_OUT' || _isCol(t)) return 0;
  return _max0(numOf(t['quantity']));
}

double returnedQuantity(Rec? t) {
  if (t == null || truthy(t['isMerged']) || t['transactionType'] == 'OLD_DEBT') return 0;
  if (_isRepReturn(t)) return _max0(numOf(t['returnedQty'])) + _max0(numOf(t['expiredQty']));
  if (_isCol(t)) return _max0(numOf(t['expiredQty']));
  return 0;
}

double netSoldQuantity(Rec? t) => round2(soldQuantity(t) - returnedQuantity(t));

double periodQuantity(Iterable<Rec> rows) {
  double qty = 0;
  for (final t in rows) { qty += netSoldQuantity(t); }
  return _max0(round2(qty));
}

int receivedPercent(double received, double debt) {
  final got = _max0(numOf(received));
  final owed = _max0(numOf(debt));
  final total = got + owed;
  if (total <= 0.005) return 0;
  final p = jsRound(got / total * 100);
  return p.clamp(0, 100).toInt();
}
