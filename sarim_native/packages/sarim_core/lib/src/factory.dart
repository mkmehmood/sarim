import 'js_num.dart';
import 'sales.dart' show formulaCostPerKg, StoreInfo;

double _num(dynamic v) {
  final n = v is num ? v.toDouble() : double.tryParse('$v'.trim());
  return n != null && n.isFinite ? n : 0;
}

double _r6(double v) => jsRound(v * 1e6) / 1e6;

/// JavaScript `Number(rec[key])` for JSON values: missing -> NaN, null or blank -> 0, text -> parsed or NaN.
double _jsNumber(Rec rec, String key) {
  if (!rec.containsKey(key)) return double.nan;
  final v = rec[key];
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  final t = '$v'.trim();
  if (t.isEmpty) return 0;
  return double.tryParse(t) ?? double.nan;
}

/// How a material's stock is written: "12 bags (600 kg)", "12 units (600 kg)" or "600 kg".
enum StockKind { unitName, units, kg }

class MaterialRow {
  MaterialRow(this.rec);
  final Rec rec;
  String get id => '${rec['id'] ?? ''}';
  String get name => '${rec['name'] ?? ''}';
  double get qty => _num(rec['quantity']);
  double get cost => _num(rec['cost']);
  double get value {
    final v = qty * cost; // (item.quantity * item.cost) || 0 in the web app
    return v.isFinite ? v : 0;
  }

  /// Kg collected so far; falls back to the stock when `collectedKg` is missing, invalid or negative
  /// (web `collectedKg`: `Number(x)` is 0 for null, NaN for a missing key).
  double get collectedKg {
    final c = _jsNumber(rec, 'collectedKg');
    return (c.isFinite && c >= 0) ? _r6(c) : _r6(qty);
  }

  bool get outOfStock => !(qty > 0);
  bool get converted => truthy(rec['conversionFactor']) && numOf(rec['conversionFactor']) != 1;
  double get purchaseQuantity => numOf(rec['purchaseQuantity']);
  String get purchaseUnitName => '${rec['purchaseUnitName'] ?? ''}';
  StockKind get stockKind {
    if (truthy(rec['purchaseQuantity']) && truthy(rec['purchaseUnitName']) && converted) return StockKind.unitName;
    if (truthy(rec['purchaseQuantity']) && converted) return StockKind.units;
    return StockKind.kg;
  }
}

/// Raw materials only: not deleted and not a purchase lot (web `materialRecords`).
List<Rec> materialRecords(List<Rec> inventory) =>
    inventory.where((m) => !truthy(m['deletedAt']) && m['isPurchaseLot'] != true).toList();

enum InvSortKey { name, amount }

int _natural(String a, String b) {
  final re = RegExp(r'(\d+)|(\D+)');
  final x = re.allMatches(a.toLowerCase()).map((m) => m.group(0)!).toList();
  final y = re.allMatches(b.toLowerCase()).map((m) => m.group(0)!).toList();
  for (var i = 0; i < x.length && i < y.length; i++) {
    final p = x[i], q = y[i];
    final pd = int.tryParse(p), qd = int.tryParse(q);
    final c = (pd != null && qd != null) ? pd.compareTo(qd) : p.compareTo(q);
    if (c != 0) return c;
  }
  return x.length.compareTo(y.length);
}

class FactorySummary {
  FactorySummary(this.materials, this.totalValue, this.totalCollectedKg);
  final List<MaterialRow> materials;
  final double totalValue; // raw-material stock value
  final double totalCollectedKg;
}

/// Raw-material stock for the Factory tab, sorted like the web table (name A-Z by default).
FactorySummary summarizeFactory(List<Rec> inventory, {InvSortKey sort = InvSortKey.name, bool descending = false}) {
  final rows = materialRecords(inventory).map(MaterialRow.new).toList();
  final dir = descending ? -1 : 1;
  rows.sort((a, b) {
    final r = sort == InvSortKey.amount ? a.value.compareTo(b.value) : _natural(a.name, b.name);
    return dir * (r != 0 ? r : a.name.compareTo(b.name));
  });
  var total = 0.0, collected = 0.0;
  for (final m in rows) {
    total += m.value;
    collected += m.collectedKg;
  }
  return FactorySummary(rows, total, collected);
}

class FormulaCost {
  FormulaCost(this.id, this.name, this.ingredients, this.costPerKg);
  final String id, name;
  final int ingredients;
  final double costPerKg;
}

/// Each formula's cost per kg at today's inventory prices (web `calculateSalesCostPerKg(formulaId)`).
List<FormulaCost> formulaCosts(List<Rec> formulas, List<Rec> inventory) => [
      for (final f in formulas)
        if (truthy(f['id']))
          FormulaCost(
            '${f['id']}',
            truthy(f['name']) ? '${f['name']}' : '${f['id']}',
            f['ingredients'] is List ? (f['ingredients'] as List).length : 0,
            formulaCostPerKg(store: '${f['id']}', stores: const <StoreInfo>[], formulas: formulas, inventory: inventory),
          ),
    ];
