import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  final today = DateTime(2026, 11, 25); // Wednesday
  Rec r(String id, String type, num value, String date, {int ts = 1, Rec? extra}) =>
      {'id': id, 'paymentType': type, 'totalValue': value, 'date': date, 'timestamp': ts, 'customerName': 'Ali', ...?extra};
  final sales = <Rec>[
    r('c1', 'CASH', 1000, '2026-11-25', ts: 2),
    r('col1', 'COLLECTION', 400, '2026-11-25', ts: 3),
    r('mo1', 'MONEY_OUT', 150, '2026-11-24'),
    r('cr1', 'CREDIT', 9999, '2026-11-25'), // a credit sale moves no cash
    r('rr1', 'REP_RETURN', 500, '2026-11-25', extra: {'isRepReturn': true}),
    r('gone', 'CASH', 700, '2026-11-25'),
    r('old', 'CASH', 50, '2026-11-02'),
    r('pp1', 'PARTIAL_PAYMENT', 200, '2026-11-01', extra: {'creditReceivedDate': '2026-11-25'}),
    r('zero', 'COLLECTION', 0, '2026-11-25'),
  ];
  await group('day', () async {
    final s = summarizePayments(sales, {'gone'}, ProdPeriod.day, today);
    eq(s.received, 1600, 'cash + collection + partial arriving today');
    eq(s.paidOut, 0, 'money out was yesterday');
    eq(s.rows.map((e) => e.rec['id']).toList(), ['col1', 'c1', 'pp1'], 'newest first by timestamp');
    check(!s.rows.any((e) => e.rec['id'] == 'cr1' || e.rec['id'] == 'rr1' || e.rec['id'] == 'zero'), 'credit sales, rep returns and zero rows are not cash');
  });
  await group('week and month', () async {
    final w = summarizePayments(sales, {'gone'}, ProdPeriod.week, today);
    eq(w.paidOut, 150, 'week money out');
    eq(w.net, 1450, 'week net');
    final m = summarizePayments(sales, {'gone'}, ProdPeriod.month, today);
    eq(m.received, 1650, 'month adds the 2 Nov cash sale');
    final all = summarizePayments(sales, {}, ProdPeriod.all, today);
    eq(all.received, 2350, 'deleted ids come back only when not in the deleted set');
  });
  await group('partial payment keeps the arrival date', () async {
    final s = summarizePayments(sales, {}, ProdPeriod.day, today);
    eq(s.rows.firstWhere((e) => e.rec['id'] == 'pp1').date, '2026-11-25', 'dated by creditReceivedDate');
  });
  await group('repository reads sales and honours deletions', () async {
    final store = MemoryStore();
    await store.set('sales', sales);
    await store.set('deleted', ['c1']);
    final p = await SarimRepository(store).paymentsSummary(ProdPeriod.day, today: today);
    eq(p.received, 1300, 'deleted cash sale c1 removed; the others stay');
  });
  final code = finish();
  if (code != 0) throw StateError('payments tests failed');
}
