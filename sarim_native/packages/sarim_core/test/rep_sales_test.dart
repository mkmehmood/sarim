import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  final today = DateTime(2026, 11, 25);
  Rec r(String id, String rep, String type, num value, String date, {num qty = 0, Rec? extra}) =>
      {'id': id, 'salesRep': rep, 'paymentType': type, 'totalValue': value, 'quantity': qty, 'date': date, 'timestamp': 1, ...?extra};
  final sales = <Rec>[
    r('a1', 'Bilal', 'CASH', 1000, '2026-11-25', qty: 10),
    r('a2', 'Bilal', 'CREDIT', 500, '2026-11-25', qty: 5),
    r('a3', 'Bilal', 'COLLECTION', 200, '2026-11-25'),
    r('a4', 'Bilal', 'REP_RETURN', 0, '2026-11-25', extra: {'isRepReturn': true, 'returnedQty': 2, 'returnValue': 180}),
    r('b1', 'Asif', 'CASH', 3000, '2026-11-24', qty: 30),
    r('adm', 'NONE', 'CASH', 777, '2026-11-25', qty: 7), // admin sale, not a rep
    r('adm2', 'admin', 'CASH', 888, '2026-11-25', qty: 8),
    r('del', 'Bilal', 'CASH', 999, '2026-11-25', qty: 9),
    r('old', 'Asif', 'CASH', 50, '2026-10-01', qty: 1),
    r('mrg', 'Asif', 'CASH', 60, '2026-11-25', qty: 1, extra: {'isMerged': true}),
  ];
  await group('day', () async {
    final s = summarizeRepSales(sales, {'del'}, ProdPeriod.day, today);
    eq(s.reps.map((e) => e.rep).toList(), ['Bilal'], 'only Bilal sold today; admin sales and merged rows are not rep sales');
    final b = s.reps.single;
    eq(b.soldKg, 15, 'sold kg');
    eq(b.returnedKg, 2, 'returned kg');
    eq(b.netKg, 13, 'net kg');
    eq(b.salesValue, 1500, 'cash + credit sales');
    eq(b.cashIn, 1200, 'cash sale + collection');
    eq(b.creditGiven, 500, 'credit given');
    eq(b.returnsValue, 180, 'return value');
    eq(b.entries, 4, 'entries');
  });
  await group('week, all and ordering', () async {
    final w = summarizeRepSales(sales, {'del'}, ProdPeriod.week, today);
    eq(w.reps.map((e) => e.rep).toList(), ['Asif', 'Bilal'], 'biggest sales first');
    eq(w.salesValue, 4500, 'total sales value');
    eq(w.netKg, 43, 'total net kg');
    final all = summarizeRepSales(sales, {'del'}, ProdPeriod.all, today);
    eq(all.reps.first.salesValue, 3050, 'Asif all-time includes October');
    eq(summarizeRepSales(sales, {}, ProdPeriod.day, today).reps.single.salesValue, 2499, 'undeleted row counts');
    eq(summarizeRepSales([], {}, ProdPeriod.all, today).reps.length, 0, 'empty');
  });
  await group('repository', () async {
    final store = MemoryStore();
    await store.set('sales', sales);
    await store.set('deleted', ['del']);
    final s = await SarimRepository(store).repSummary(ProdPeriod.day, today: today);
    eq(s.cashIn, 1200, 'read from the store');
  });
  final code = finish();
  if (code != 0) throw StateError('rep sales tests failed');
}
