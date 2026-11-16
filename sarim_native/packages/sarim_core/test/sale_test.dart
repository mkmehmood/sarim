import 'dart:convert';
import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

List<Rec> recs(dynamic l) => [for (final x in (l as List)) Map<String, dynamic>.from(x as Map)];

Future<void> main() async {
  final data = jsonDecode(File('test/fixtures/sale_cases.json').readAsStringSync()) as Map<String, dynamic>;
  await group('600 sale scenarios: validation order, stock, price, cost and profit match the web app', () async {
    var i = 0;
    for (final c in data['cases'] as List) {
      final input = (c as Map<String, dynamic>)['input'] as Map<String, dynamic>;
      final exp = c['expected'] as Map<String, dynamic>;
      final stores = StoreInfo.fromJson(input['stores']);
      final store = input['store'] as String;
      final q = quoteSale(
        date: input['date'] as String,
        name: input['name'] as String,
        quantity: (input['quantity'] as num).toDouble(),
        store: store,
        storeLabel: store.toUpperCase(),
        production: recs(input['production']),
        returns: recs(input['returns']),
        sales: recs(input['sales']),
        customers: recs(input['customers']),
        stores: stores,
        formulas: recs(input['formulas']),
        inventory: recs(input['inventory']),
        requireCost: false,
      );
      final issue = q.issue?.name;
      eq(issue, exp['issue'], 'case $i issue');
      if (exp['issue'] == null && q.ok) {
        eq(q.unitPrice, exp['unitPrice'], 'case $i unitPrice');
        eq(q.totalValue, exp['totalValue'], 'case $i totalValue');
        eq(q.totalCost, exp['totalCost'], 'case $i totalCost', tol: 1e-6);
        eq(q.profit, exp['profit'], 'case $i profit', tol: 1e-6);
        eq(q.available, exp['available'], 'case $i available');
      }
      if (exp['issue'] == 'insufficientStock') eq(q.available, exp['available'], 'case $i available on shortage');
      i++;
    }
  });
  exit(finish());
}
