import 'dart:convert';
import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

List<Rec> recs(dynamic l) => [for (final x in (l as List)) Map<String, dynamic>.from(x as Map)];

Future<void> main() async {
  final data = jsonDecode(File('test/fixtures/factory_cases.json').readAsStringSync()) as Map<String, dynamic>;
  await group('300 inventories: filtering, order, value, collected kg and stock wording match the web app', () async {
    var i = 0;
    for (final c in data['cases'] as List) {
      final input = (c as Map<String, dynamic>)['input'] as Map<String, dynamic>;
      final exp = c['expected'] as Map<String, dynamic>;
      final sort = input['sort'] as Map<String, dynamic>;
      final s = summarizeFactory(
        recs(input['inventory']),
        sort: sort['key'] == 'amount' ? InvSortKey.amount : InvSortKey.name,
        descending: sort['dir'] == 'desc',
      );
      final rows = exp['rows'] as List;
      final tag = 'case $i';
      eq(s.materials.map((m) => m.id).toList(), rows.map((r) => (r as Map)['id']).toList(), '$tag order');
      for (var k = 0; k < rows.length && k < s.materials.length; k++) {
        final r = rows[k] as Map<String, dynamic>;
        final m = s.materials[k];
        eq(m.qty, r['qty'], '$tag row $k qty', tol: 1e-9);
        eq(m.value, r['value'], '$tag row $k value', tol: 1e-6);
        eq(m.collectedKg, r['collected'], '$tag row $k collected', tol: 1e-9);
        eq(m.stockKind.name, r['kind'], '$tag row $k stock wording');
        eq(m.outOfStock, r['out'], '$tag row $k out of stock');
      }
      eq(s.totalValue, exp['totalVal'], '$tag total value', tol: 1e-5);
      eq(s.totalCollectedKg, exp['totalCollected'], '$tag total collected', tol: 1e-5);
      i++;
    }
  });
  await group('formula costs use live inventory prices', () async {
    final inventory = <Rec>[
      {'id': 'i1', 'name': 'Maize', 'cost': 40, 'quantity': 100},
      {'id': 'i2', 'name': 'Soya', 'cost': 0, 'quantity': 10}, // no live price: falls back to the formula's own
    ];
    final formulas = <Rec>[
      {'id': 'f1', 'name': 'Standard', 'additionalCost': 100, 'ingredients': [
        {'id': 'i1', 'name': 'Maize', 'quantity': 10, 'cost': 30},
        {'id': 'i2', 'name': 'Soya', 'quantity': 5, 'cost': 60},
      ]},
      {'id': 'f2', 'ingredients': []},
    ];
    final f = formulaCosts(formulas, inventory);
    eq(f.length, 2, 'both formulas listed');
    eq(f[0].name, 'Standard', 'name');
    eq(f[0].ingredients, 2, 'ingredient count');
    eq(f[0].costPerKg, 10 * 40 + 5 * 60 + 100, 'live Maize price (40), Soya falls back to 60, plus additional cost');
    eq(f[1].name, 'f2', 'unnamed formula shows its id');
    eq(f[1].costPerKg, 0, 'no ingredients costs nothing');
  });
  await group('edge cases', () async {
    final s = summarizeFactory([]);
    eq(s.materials.length, 0, 'empty');
    eq(s.totalValue, 0, 'no value');
    final t = summarizeFactory([
      {'id': 'a', 'name': 'Item 10', 'quantity': 1, 'cost': 5},
      {'id': 'b', 'name': 'Item 2', 'quantity': 1, 'cost': 5},
    ]);
    eq(t.materials.map((m) => m.id).toList(), ['b', 'a'], 'numbers order naturally (2 before 10)');
  });
  await group('repository reads inventory and formulas', () async {
    final store = MemoryStore();
    await store.set('inventory', [
      {'id': 'i1', 'name': 'Maize', 'cost': 40, 'quantity': 100},
      {'id': 'lot', 'name': 'Maize', 'isPurchaseLot': true, 'cost': 1, 'quantity': 1},
    ]);
    await store.set('formulas', [{'id': 'f1', 'name': 'Std', 'ingredients': [{'id': 'i1', 'name': 'Maize', 'quantity': 2, 'cost': 1}]}]);
    final repo = SarimRepository(store);
    final f = await repo.factorySummary();
    eq(f.totalValue, 4000, 'lots are not counted');
    eq((await repo.formulaCostList()).single.costPerKg, 80, 'live price 40 x 2 kg');
  });
  final code = finish();
  if (code != 0) throw StateError('factory tests failed');
}
