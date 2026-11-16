import 'js_num.dart';

/// Sale pricing, cost and stock rules - ports of getEffectiveSalePriceForCustomer, getSalePriceForStore,
/// profit-cost.js (realized cost per kg) and the stock checks in saveCustomerSale.

class StoreInfo {
  StoreInfo(this.key, this.name, this.salePrice, [this.formulaId = '']);
  final String key, name, formulaId;
  final double salePrice;
  static List<StoreInfo> fromJson(dynamic list) {
    if (list is! List) return const [];
    return [
      for (final s in list)
        if (s is Map && truthy(s['key'])) StoreInfo('${s['key']}', truthy(s['name']) ? '${s['name']}' : '${s['key']}', numOf(s['salePrice']), truthy(s['formulaId']) ? '${s['formulaId']}' : '')
    ];
  }
}

double salePriceForStore(List<StoreInfo> stores, String? store) {
  if (store == null || store.isEmpty) return 0;
  for (final s in stores) { if (s.key == store) return s.salePrice > 0 ? s.salePrice : 0; }
  return 0;
}

double effectiveSalePrice(List<Rec> customers, List<StoreInfo> stores, String? customerName, String? store) {
  if (truthy(customerName)) {
    final lc = customerName!.toLowerCase();
    for (final c in customers) {
      if (truthy(c['name']) && '${c['name']}'.toLowerCase() == lc) {
        final custom = parseFloatJs(c['customSalePrice']) ?? 0;
        if (custom > 0) return custom;
        break;
      }
    }
  }
  return salePriceForStore(stores, store);
}

double _fnum(dynamic v, double d) {
  final x = parseFloatJs(v);
  return (x != null && x.isFinite) ? x : d;
}

/// Port of calculateSalesCostPerKg: the store's formula cost per kg from live inventory prices.
double formulaCostPerKg({
  required String? store,
  required List<StoreInfo> stores,
  required List<Rec> formulas,
  required List<Rec> inventory,
}) {
  if (store == null || store.isEmpty) return 0;
  String poolId = store;
  for (final s in stores) { if (s.key == store && s.formulaId.isNotEmpty) { poolId = s.formulaId; break; } }
  // resolveSelectedFormula(ref = pool id): a store whose key equals the ref wins, else the ref is the formula id.
  StoreInfo? st;
  for (final s in stores) { if (s.key == poolId) { st = s; break; } }
  final String? formulaId = st != null ? (st.formulaId.isEmpty ? null : st.formulaId) : poolId;
  if (formulaId == null) return 0;
  Rec? f;
  for (final x in formulas) { if (truthy(x['id']) && '${x['id']}' == formulaId) { f = x; break; } }
  if (f == null || f['ingredients'] is! List) return 0;
  final invLive = inventory.where((i) => !truthy(i['deletedAt'])).toList();
  Rec? find(List<Rec> list, Map i) {
    for (final x in list) { if ('${x['id']}' == '${i['id']}') return x; }
    final n = truthy(i['name']) ? '${i['name']}'.trim().toLowerCase() : '';
    if (n.isNotEmpty) {
      for (final x in list) { if (truthy(x['name']) && '${x['name']}'.trim().toLowerCase() == n) return x; }
    }
    return null;
  }
  final ingredients = [];
  for (final raw in (f['ingredients'] as List).whereType<Map>()) {
    final live = find(invLive, raw);
    final liveCost = live != null ? (double.tryParse('${live['cost']}') ?? double.nan) : double.nan;
    ingredients.add({
      'id': raw['id'],
      'name': (live != null && truthy(live['name'])) ? live['name'] : (truthy(raw['name']) ? raw['name'] : 'Material'),
      'quantity': _fnum(raw['quantity'], 0),
      'cost': (liveCost.isFinite && liveCost > 0) ? liveCost : _fnum(raw['cost'], 0),
    });
  }
  if (ingredients.isEmpty) return 0;
  var rawCost = 0.0;
  for (final item in ingredients) {
    final live = find(inventory, item as Map);
    final c = live != null ? (double.tryParse('${live['cost']}') ?? double.nan) : double.nan;
    final unit = (c.isFinite && c > 0) ? c : (numOf(item['cost']));
    rawCost += unit * (item['quantity'] as double);
  }
  final additional = _fnum(f['additionalCost'], 0);
  final adj = (_fnum(f['costAdjustmentFactor'], 1) != 0 ? _fnum(f['costAdjustmentFactor'], 1) : 1.0);
  return adj > 0 ? (rawCost + additional) / adj : rawCost + additional;
}

/// Realized cost per kg from production batches: that store+date if costed, else the store's overall average.
double costPerKg(List<Rec> production, String? store, String? date) {
  if (store == null || store.isEmpty) return 0;
  final byStoreDate = <String, ({double net, double cost})>{};
  final byStore = <String, ({double net, double cost})>{};
  void add(Map<String, ({double net, double cost})> m, String k, double net, double cost) {
    final cur = m[k] ?? (net: 0.0, cost: 0.0);
    m[k] = (net: cur.net + net, cost: cur.cost + cost);
  }
  double n(dynamic v) {
    final x = parseFloatJs(v);
    return (x != null && x.isFinite) ? x : 0;
  }
  for (final p in production) {
    if (truthy(p['deletedAt']) || truthy(p['isReturn'])) continue;
    final net = n(p['net']), cost = n(p['totalCost']);
    if (!(net > 0) || !(cost > 0) || !truthy(p['store'])) continue;
    add(byStore, '${p['store']}', net, cost);
    if (truthy(p['date']) && !truthy(p['isMerged'])) add(byStoreDate, '${p['store']}|${p['date']}', net, cost);
  }
  double perKg(({double net, double cost})? e) => (e != null && e.net > 0) ? e.cost / e.net : 0;
  final double dated = (date != null && date.isNotEmpty) ? perKg(byStoreDate['$store|$date']) : 0.0;
  if (dated > 0) return dated;
  return perKg(byStore[store]);
}

class StockPosition {
  StockPosition(this.production, this.returns, this.sold);
  final double production, returns, sold;
  double get total => production + returns;
  double get available => total - sold;
}

/// Stock on [date] in [store]: production + returns - sales already made for that day.
StockPosition stockFor({
  required List<Rec> production,
  required List<Rec> returns,
  required List<Rec> sales,
  required String date,
  required String store,
  String? excludeSaleId,
}) {
  var prod = 0.0, ret = 0.0, sold = 0.0;
  for (final p in production) {
    if (truthy(p['isReturn'])) continue;
    if (p['date'] == date && p['store'] == store) prod += numOf(p['net']);
  }
  for (final r in returns) {
    if (r['date'] == date && r['store'] == store) ret += numOf(r['quantity']);
  }
  for (final s in sales) {
    if (excludeSaleId != null && s['id'] == excludeSaleId) continue;
    final eff = truthy(s['supplyDate']) ? s['supplyDate'] : s['date'];
    if (eff == date && s['supplyStore'] == store) sold += numOf(s['quantity']);
  }
  return StockPosition(prod, ret, sold);
}

enum SaleIssue { noDate, noName, badQuantity, noProduction, insufficientStock, noCost, noPrice }

class SaleQuote {
  SaleQuote.error(this.issue, this.message, {this.available = 0})
      : unitPrice = 0, totalValue = 0, totalCost = 0, profit = 0;
  SaleQuote.ok({required this.unitPrice, required this.totalValue, required this.totalCost, required this.available})
      : issue = null, message = null, profit = totalValue - totalCost;
  final SaleIssue? issue;
  final String? message;
  final double unitPrice, totalValue, totalCost, profit, available;
  bool get ok => issue == null;
}

/// Validation and pricing for a customer sale, in the same order as the web app.
SaleQuote quoteSale({
  required String date,
  required String name,
  required double quantity,
  required String store,
  required String storeLabel,
  required List<Rec> production,
  required List<Rec> returns,
  required List<Rec> sales,
  required List<Rec> customers,
  required List<StoreInfo> stores,
  List<Rec> formulas = const [],
  List<Rec> inventory = const [],
  bool requireCost = true,
}) {
  if (date.isEmpty) return SaleQuote.error(SaleIssue.noDate, 'Please select a date.');
  if (name.trim().isEmpty) return SaleQuote.error(SaleIssue.noName, 'Please enter customer name.');
  if (!quantity.isFinite || quantity <= 0) return SaleQuote.error(SaleIssue.badQuantity, 'Please enter a valid quantity.');
  final pos = stockFor(production: production, returns: returns, sales: sales, date: date, store: store);
  if (pos.total == 0) {
    return SaleQuote.error(SaleIssue.noProduction, 'No production or returns for $storeLabel on $date. You cannot sell what has not been produced.');
  }
  final remaining = pos.available - quantity;
  if (remaining < -1e-6) {
    return SaleQuote.error(
      SaleIssue.insufficientStock,
      'Insufficient stock! Available: ${fmtNum(pos.available)} kg, Requested: ${fmtNum(quantity)} kg. Shortage: ${fmtNum(-remaining)} kg.',
      available: pos.available,
    );
  }
  var perKg = costPerKg(production, store, date);
  if (!(perKg > 0)) perKg = formulaCostPerKg(store: store, stores: stores, formulas: formulas, inventory: inventory);
  if (requireCost && !(perKg > 0)) {
    return SaleQuote.error(SaleIssue.noCost,
        'The cost price for $storeLabel is not available yet (no costed production and no formula cost). Sync, or record this sale in the web app so profit is calculated correctly.');
  }
  final price = effectiveSalePrice(customers, stores, name, store);
  if (!(price > 0)) {
    return SaleQuote.error(SaleIssue.noPrice, 'Sale price not configured for this store. Set prices in Factory Formulas before recording sales.');
  }
  return SaleQuote.ok(unitPrice: price, totalValue: quantity * price, totalCost: quantity * perKg, available: pos.available);
}
