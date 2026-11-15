import 'js_num.dart';

/// Sale pricing, cost and stock rules - ports of getEffectiveSalePriceForCustomer, getSalePriceForStore,
/// profit-cost.js (realized cost per kg) and the stock checks in saveCustomerSale.

class StoreInfo {
  StoreInfo(this.key, this.name, this.salePrice);
  final String key, name;
  final double salePrice;
  static List<StoreInfo> fromJson(dynamic list) {
    if (list is! List) return const [];
    return [
      for (final s in list)
        if (s is Map && truthy(s['key'])) StoreInfo('${s['key']}', truthy(s['name']) ? '${s['name']}' : '${s['key']}', numOf(s['salePrice']))
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
  final perKg = costPerKg(production, store, date);
  if (!(perKg > 0)) {
    return SaleQuote.error(SaleIssue.noCost,
        'The cost price for $storeLabel is not available yet (no costed production). Record this sale in the web app so profit is calculated correctly.');
  }
  final price = effectiveSalePrice(customers, stores, name, store);
  if (!(price > 0)) {
    return SaleQuote.error(SaleIssue.noPrice, 'Sale price not configured for this store. Set prices in Factory Formulas before recording sales.');
  }
  return SaleQuote.ok(unitPrice: price, totalValue: quantity * price, totalCost: quantity * perKg, available: pos.available);
}
