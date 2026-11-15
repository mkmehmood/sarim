import 'customer_ledger.dart';
import 'finance.dart';
import 'js_num.dart';

/// Port of the collection-allocation parts of modules/link-graph.js and link-guards.js.

double _n(dynamic v) => numOf(v);
double _r2(dynamic v) => jsRound((_n(v) + 2.220446049250313e-16) * 100) / 100;

class Alloc {
  Alloc(this.saleId, this.amount, this.full);
  final String saleId;
  final double amount;
  final bool full;
  Map<String, dynamic> toJson() => {'saleId': saleId, 'amount': amount, 'full': full};
}

class AllocPlan {
  AllocPlan(this.allocs, this.leftover);
  final List<Alloc> allocs;
  final double leftover;
}

String _day(Rec s) => truthy(s['date']) ? '${s['date']}' : '';

/// Newest sale first; old debts last (they are paid after current sales).
List<Rec> sortForCollection(List<Rec> list) {
  final idx = [for (var i = 0; i < list.length; i++) (i, list[i])];
  idx.sort((a, b) {
    final ao = a.$2['transactionType'] == 'OLD_DEBT' ? 1 : 0, bo = b.$2['transactionType'] == 'OLD_DEBT' ? 1 : 0;
    if (ao != bo) return ao - bo;
    final da = _day(a.$2), db = _day(b.$2);
    if (da != db) return da.compareTo(db) < 0 ? 1 : -1;
    final t = _n(b.$2['timestamp']).compareTo(_n(a.$2['timestamp']));
    return t != 0 ? t : a.$1.compareTo(b.$1);
  });
  return idx.map((e) => e.$2).toList();
}

List<Rec> collectionEligible(List<Rec> list, String? collectionDate) {
  final cut = collectionDate ?? '';
  return list.where((s) => s['transactionType'] == 'OLD_DEBT' || cut.isEmpty || _day(s).isEmpty || _day(s).compareTo(cut) <= 0).toList();
}

AllocPlan planCollectionAllocation(double amount, List<({String id, double due})> dues) {
  var left = _r2(_n(amount) > 0 ? _n(amount) : 0);
  final allocs = <Alloc>[];
  for (final d in dues) {
    if (left <= 0.004) break;
    final due = _r2(d.due);
    if (due <= 0.004) continue;
    if (left >= due - 0.004) {
      allocs.add(Alloc(d.id, due, true));
      left = _r2(left - due > 0 ? left - due : 0);
    } else {
      allocs.add(Alloc(d.id, left, false));
      left = 0;
    }
  }
  return AllocPlan(allocs, _r2(left > 0 ? left : 0));
}

void applyCollectionAlloc(Rec sale, Alloc a, String cid) {
  final list = (sale['collectionAllocs'] is List) ? sale['collectionAllocs'] as List : (sale['collectionAllocs'] = <dynamic>[]);
  list.add({'cid': cid, 'amount': _r2(a.amount), 'full': a.full});
  if (a.full) {
    sale['creditReceived'] = true;
    sale['creditReceivedManually'] = true;
    if (sale['transactionType'] == 'OLD_DEBT') sale['partialPaymentReceived'] = _r2(_n(sale['partialPaymentReceived']) + a.amount);
  } else {
    sale['partialPaymentReceived'] = _r2(_n(sale['partialPaymentReceived']) + a.amount);
  }
}

bool revertCollectionAlloc(Rec sale, String cid) {
  final list = sale['collectionAllocs'];
  if (list is! List) return false;
  final i = list.indexWhere((a) => a is Map && a['cid'] == cid);
  if (i < 0) return false;
  final a = Map<String, dynamic>.from(list.removeAt(i) as Map);
  final amt = _n(a['amount']);
  double dec() => _r2((_n(sale['partialPaymentReceived']) - amt) > 0 ? _n(sale['partialPaymentReceived']) - amt : 0);
  if (a['full'] == true) {
    sale['creditReceived'] = false;
    sale.remove('creditReceivedManually');
    if (sale['transactionType'] == 'OLD_DEBT') sale['partialPaymentReceived'] = dec();
  } else {
    sale['partialPaymentReceived'] = dec();
  }
  if (list.isEmpty) sale.remove('collectionAllocs');
  return true;
}

String? collectionRevertIssue(Rec collection, List<Rec> sales) {
  final allocs = collection['allocations'];
  if (allocs is! List) return null;
  for (final a in allocs) {
    if (a is! Map) continue;
    Rec? sale;
    for (final s in sales) { if (s['id'] == a['saleId']) { sale = s; break; } }
    if (sale == null || sale['collectionAllocs'] is! List) continue;
    final list = sale['collectionAllocs'] as List;
    final i = list.indexWhere((x) => x is Map && x['cid'] == collection['id']);
    if (i >= 0 && i < list.length - 1) {
      return 'A newer collection was applied to the same sale(s) after this one. Delete or edit the newer collection first.';
    }
  }
  return null;
}

class CollectionResult {
  CollectionResult(this.changedIds, this.allocated, this.paidCount, this.partialCount);
  final Set<String> changedIds;
  final double allocated;
  final int paidCount, partialCount;
}

/// Applies a collection to the customer's open credit sales (newest first), mutating [arr] and [record].
CollectionResult applyCollectionToSales({
  required List<Rec> arr,
  required Rec record,
  required double amount,
  double expiredValue = 0,
  required String name,
  Rec? original,
  String? date,
  PriceFor? priceFor,
  Set<String> reconciledReturnIds = const {},
  required int nowMs,
}) {
  final lname = name.trim().toLowerCase();
  final mine = arr.where((s) =>
      !truthy(s['deletedAt']) &&
      !truthy(s['isMerged']) &&
      truthy(s['customerName']) &&
      '${s['customerName']}'.trim().toLowerCase() == lname &&
      s['currentRepProfile'] == 'admin' &&
      (s['transactionType'] == 'OLD_DEBT' || !truthy(s['salesRep']) || s['salesRep'] == 'NONE')).toList();
  final changed = <String>{};
  final hadOld = original != null && original['paymentType'] == 'COLLECTION' && original['allocations'] is List && (original['allocations'] as List).isNotEmpty;
  if (hadOld) {
    final issue = collectionRevertIssue(original, arr);
    if (issue != null) throw StateError(issue);
    for (final a in original['allocations'] as List) {
      for (final s in arr) {
        if (s['id'] == (a as Map)['saleId']) {
          if (revertCollectionAlloc(s, '${original['id']}')) changed.add('${s['id']}');
          break;
        }
      }
    }
  }
  final collectionDate = date ?? '${record['date']}';
  final candidates = sortForCollection(collectionEligible(
      mine
          .where((s) =>
              (s['paymentType'] == 'CREDIT' || s['transactionType'] == 'OLD_DEBT') &&
              !truthy(s['creditReceived']) &&
              !truthy(s['usedInCalcId']) &&
              !(truthy(s['isRepTransfer']) || (truthy(s['isTransfer']) && truthy(s['transferFrom']))))
          .toList(),
      collectionDate));
  final opts = LedgerOpts(reconciledReturnIds: reconciledReturnIds);
  final dues = [
    for (final s in candidates) (id: '${s['id']}', due: debtDelta(s, debtNeedsGross(s) ? saleTransactionValue(s, priceFor: priceFor) : 0, opts))
  ];
  final credit = expiredValue > 0 ? expiredValue : 0.0;
  final plan = planCollectionAllocation(amount + credit, dues);
  for (final a in plan.allocs) {
    final sale = candidates.firstWhere((s) => '${s['id']}' == a.saleId);
    applyCollectionAlloc(sale, a, '${record['id']}');
    changed.add(a.saleId);
  }
  for (final id in changed) {
    for (final s in arr) { if ('${s['id']}' == id) { s['updatedAt'] = nowMs; break; } }
  }
  final allocated = plan.allocs.fold<double>(0, (t, a) => t + a.amount);
  if (plan.allocs.isNotEmpty) {
    final cashPaid = amount < allocated ? amount : allocated;
    final cashLeft = (amount - cashPaid) * 100;
    final cashLeftR = (cashLeft + 0.5).floorToDouble() / 100;
    final creditPaid = ((allocated - cashPaid) * 100 + 0.5).floorToDouble() / 100;
    record['collectedAmount'] = amount;
    record['allocations'] = plan.allocs.map((a) => a.toJson()).toList();
    record['totalValue'] = cashLeftR;
    record['profit'] = cashLeftR;
    if (creditPaid > 0) { record['expiredAllocated'] = creditPaid; } else { record.remove('expiredAllocated'); }
  } else {
    record.remove('collectedAmount');
    record.remove('allocations');
    record.remove('expiredAllocated');
  }
  return CollectionResult(changed, allocated, plan.allocs.where((a) => a.full).length, plan.allocs.where((a) => !a.full).length);
}
