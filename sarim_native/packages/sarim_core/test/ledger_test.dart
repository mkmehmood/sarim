import 'dart:convert';
import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  final data = jsonDecode(File('test/fixtures/finance_cases.json').readAsStringSync()) as Map<String, dynamic>;

  await group('customer ledger order + running balance match the web app (400 ledgers)', () async {
    var i = 0;
    for (final c in data['cases'] as List) {
      final cs = c as Map<String, dynamic>;
      final recs = [for (final r in cs['records'] as List) Map<String, dynamic>.from(r as Map)];
      final name = cs['customerName'] as String;
      final reconciled = {for (final r in cs['reconciled'] as List) '$r'};
      final led = buildCustomerLedger(name, sales: recs, reconciledReturnIds: reconciled);
      final exp = cs['ledger'] as List;
      eq(led.entries.length, exp.length, 'case $i entry count');
      for (var k = 0; k < exp.length && k < led.entries.length; k++) {
        eq(led.entries[k].id, (exp[k] as Map)['id'], 'case $i entry $k id');
        eq(led.entries[k].balance, (exp[k] as Map)['balance'], 'case $i entry $k balance');
      }
      final list = customerSummaries(sales: recs, customers: const [], reconciledReturnIds: reconciled);
      final credit = list.customers.firstWhere((x) => x.name == name).credit;
      eq(credit < 0 ? 0.0 : credit, (cs['credit'] as num) < 0 ? 0.0 : (cs['credit'] as num).toDouble(), 'case $i summary credit');
      i++;
    }
  });

  exit(finish());
}
