import 'js_num.dart';
import 'store.dart' show LocalStore;

typedef ProdRec = Map<String, dynamic>;

enum ProdPeriod { day, week, month, year, all }

/// Totals for one store (or for all stores) over a period.
class ProdTotals {
  ProdTotals(this.store, this.net, this.cost, this.batches);
  final String store;
  final double net; // kg produced
  final double cost; // total production cost
  final int batches;
  double get costPerKg => net > 0 ? round2(cost / net) : 0;
}

class ProdSummary {
  ProdSummary(this.all, this.byStore, this.entries);
  final ProdTotals all;
  final List<ProdTotals> byStore;
  final List<ProdRec> entries; // newest first
}

/// First day (inclusive) of [period] relative to [today] as YYYY-MM-DD; null for all time.
/// Week starts on Monday, matching the web overview buttons.
String? periodStart(ProdPeriod period, DateTime today) {
  switch (period) {
    case ProdPeriod.day:
      return localDateStr(today);
    case ProdPeriod.week:
      return localDateStr(DateTime(today.year, today.month, today.day - (today.weekday - 1)));
    case ProdPeriod.month:
      return localDateStr(DateTime(today.year, today.month, 1));
    case ProdPeriod.year:
      return localDateStr(DateTime(today.year, 1, 1));
    case ProdPeriod.all:
      return null;
  }
}

/// Summarise production entries, skipping deleted ids. Pure function so it can be tested without storage.
ProdSummary summarizeProduction(List<ProdRec> production, Set<String> deleted, ProdPeriod period, DateTime today) {
  final from = periodStart(period, today);
  final rows = production.where((p) {
    if (p['deleted'] == true || deleted.contains('${p['id']}')) return false;
    final d = '${p['date'] ?? ''}';
    if (from == null) return true;
    return d.compareTo(from) >= 0 && d.compareTo(localDateStr(today)) <= 0;
  }).toList()
    ..sort((a, b) {
      final c = '${b['date'] ?? ''}'.compareTo('${a['date'] ?? ''}');
      return c != 0 ? c : numOf(b['timestamp']).compareTo(numOf(a['timestamp']));
    });
  final per = <String, List<double>>{};
  var net = 0.0, cost = 0.0;
  for (final p in rows) {
    final n = numOf(p['net']);
    final c = numOf(p['totalCost']);
    net += n;
    cost += c;
    final k = '${p['store'] ?? ''}';
    final t = per.putIfAbsent(k, () => [0, 0, 0]);
    t[0] += n;
    t[1] += c;
    t[2] += 1;
  }
  final stores = per.entries.map((e) => ProdTotals(e.key, e.value[0], e.value[1], e.value[2].toInt())).toList()
    ..sort((a, b) => a.store.compareTo(b.store));
  return ProdSummary(ProdTotals('', net, cost, rows.length), stores, rows);
}

extension ProductionReads on LocalStore {
  Future<List<ProdRec>> productionRecords() async {
    final v = await get('production');
    return v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <ProdRec>[];
  }
}
