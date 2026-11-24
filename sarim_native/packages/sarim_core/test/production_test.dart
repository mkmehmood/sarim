import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  final today = DateTime(2026, 11, 25); // Wednesday
  final data = <Map<String, dynamic>>[
    {'id': 'a', 'date': '2026-11-25', 'store': 'zubair', 'net': 100, 'totalCost': 4000, 'timestamp': 2},
    {'id': 'b', 'date': '2026-11-23', 'store': 'gull', 'net': 50, 'totalCost': 3000, 'timestamp': 1},
    {'id': 'c', 'date': '2026-11-02', 'store': 'zubair', 'net': 200, 'totalCost': 7000, 'timestamp': 1},
    {'id': 'd', 'date': '2025-12-31', 'store': 'zubair', 'net': 10, 'totalCost': 100, 'timestamp': 1},
    {'id': 'e', 'date': '2026-11-25', 'store': 'zubair', 'net': 999, 'totalCost': 1, 'timestamp': 3},
  ];
  await group('period starts', () async {
    eq(periodStart(ProdPeriod.day, today), '2026-11-25', 'day');
    eq(periodStart(ProdPeriod.week, today), '2026-11-23', 'week starts Monday');
    eq(periodStart(ProdPeriod.month, today), '2026-11-01', 'month');
    eq(periodStart(ProdPeriod.year, today), '2026-01-01', 'year');
    check(periodStart(ProdPeriod.all, today) == null, 'all');
  });
  await group('summaries', () async {
    final day = summarizeProduction(data, {'e'}, ProdPeriod.day, today);
    eq(day.all.net, 100, 'day net');
    eq(day.all.costPerKg, 40, 'day cost per kg');
    final week = summarizeProduction(data, {'e'}, ProdPeriod.week, today);
    eq(week.all.net, 150, 'week net');
    eq(week.byStore.map((s) => s.store).toList(), ['gull', 'zubair'], 'stores sorted');
    eq(week.entries.first['id'], 'a', 'newest first');
    final month = summarizeProduction(data, {'e'}, ProdPeriod.month, today);
    eq(month.all.net, 350, 'month net');
    eq(month.all.batches, 3, 'month batches');
    final all = summarizeProduction(data, {'e'}, ProdPeriod.all, today);
    eq(all.all.net, 360, 'all net excludes deleted');
    eq(summarizeProduction([], {}, ProdPeriod.all, today).all.costPerKg, 0, 'empty is zero');
  });
  await group('repository reads production', () async {
    final store = MemoryStore();
    await store.set('production', data);
    final repo = SarimRepository(store);
    final s = await repo.productionSummary(ProdPeriod.year, today: today);
    eq(s.all.net, 1349, 'year net (2025 entry excluded, no deletions recorded)');
  });
  final code = finish();
  if (code != 0) throw StateError('production tests failed');
}
