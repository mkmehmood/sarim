import 'dart:convert';
import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

CalcInputs inputsOf(Map<String, dynamic> m) => CalcInputs(
      sold: numOf(m['sold']),
      returned: numOf(m['returned']),
      expired: numOf(m['expired']),
      shared: numOf(m['shared']),
      credit: numOf(m['credit']),
      prevCreditReceived: numOf(m['prevCreditReceived']),
      receivedCash: numOf(m['receivedCash']),
      fieldExpenses: numOf(m['fieldExpenses']),
      salePrice: numOf(m['salePrice']),
      commissionPerUnit: numOf(m['commissionPerUnit']),
      commissionPaid: numOf(m['commissionPaid']),
    );

Future<void> main() async {
  final data = jsonDecode(File('test/fixtures/calc_cases.json').readAsStringSync()) as Map<String, dynamic>;
  await group('400 calculator cases match the web app (expected cash, short/over, commission)', () async {
    var i = 0;
    for (final c in data['cases'] as List) {
      final exp = (c as Map<String, dynamic>)['expected'] as Map<String, dynamic>;
      final r = calcReconcile(inputsOf(c['input'] as Map<String, dynamic>));
      final tag = 'case $i';
      eq(r.netSold, exp['netSold'], '$tag net sold', tol: 1e-9);
      eq(r.expectedCash, exp['expected'], '$tag expected cash', tol: 1e-6);
      eq(r.status.name.toUpperCase(), exp['status'], '$tag status');
      eq(r.amount, exp['amount'], '$tag amount', tol: 1e-6);
      eq(r.grossCommission, exp['grossCommission'], '$tag gross commission', tol: 1e-6);
      eq(r.commissionPayable, exp['commissionPayable'], '$tag commission payable', tol: 1e-6);
      i++;
    }
  });
  await group('worked example', () async {
    // 100 kg sold, 10 returned, 5 expired: 85 net; 20 kg on credit -> 65 kg cash at Rs 400 = 26,000
    // + 3,000 earlier credit - 500 expenses - 1,000 commission paid = 27,500 expected.
    final r = calcReconcile(const CalcInputs(
      sold: 100, returned: 10, expired: 5, credit: 20, salePrice: 400,
      prevCreditReceived: 3000, fieldExpenses: 500, commissionPaid: 1000, commissionPerUnit: 10, receivedCash: 27000,
    ));
    eq(r.netSold, 85, 'net sold');
    eq(r.expectedCash, 27500, 'expected cash');
    eq(r.status, CashStatus.short, 'short');
    eq(r.amount, 500, 'short by 500');
    eq(r.grossCommission, 850, 'gross commission');
    eq(r.commissionPayable, 0, 'payable floors at zero when more was paid than earned');
  });
  await group('blank form and over-returned stock', () async {
    final blank = calcReconcile(const CalcInputs());
    eq(blank.status, CashStatus.match, 'all zero matches');
    eq(blank.expectedCash, 0, 'nothing expected');
    final neg = calcReconcile(const CalcInputs(sold: 5, returned: 50));
    eq(neg.netSold, 0, 'net sold never goes below zero');
  });
  final code = finish();
  if (code != 0) throw StateError('calculator tests failed');
}
