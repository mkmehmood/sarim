/// Helpers that reproduce the JavaScript number semantics the web app relies on,
/// so balances computed natively match the web app to the paisa.
typedef Rec = Map<String, dynamic>;

const double _eps = 2.220446049250313e-16;

/// JavaScript truthiness.
bool truthy(dynamic v) {
  if (v == null || v == false || v == '') return false;
  if (v is num) return v != 0 && !v.isNaN;
  return true;
}

final RegExp _floatPrefix = RegExp(r'^[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)');

/// JS `parseFloat` for strings, plain conversion for numbers; NaN -> null.
double? parseFloatJs(dynamic v) {
  if (v is num) return v.isNaN ? null : v.toDouble();
  if (v is String) {
    final m = _floatPrefix.firstMatch(v.trimLeft());
    if (m == null) return null;
    return double.tryParse(m.group(0)!);
  }
  return null;
}

/// The `num(v, d)` helper from finance.js.
double numOf(dynamic v, [double d = 0]) {
  final n = parseFloatJs(v);
  return (n != null && n.isFinite) ? n : d;
}

/// JS Math.round (round half toward +infinity).
double jsRound(double x) => (x + 0.5).floorToDouble();

/// `round2` from finance.js.
double round2(dynamic v) {
  final n = v is num ? v.toDouble() : (v is String ? (double.tryParse(v.trim()) ?? double.nan) : double.nan);
  if (!n.isFinite) return 0;
  final sign = n > 0 ? 1.0 : (n < 0 ? -1.0 : 0.0);
  final r = jsRound((n + sign * _eps) * 100) / 100;
  return r == 0 ? 0.0 : r;
}

/// `fmtNum` from finance.js (Indian digit grouping, up to [maxDecimals] decimals).
String fmtNum(dynamic value, [int maxDecimals = 2]) {
  final n = numOf(value, 0);
  var p = 1.0;
  for (var i = 0; i < maxDecimals; i++) { p *= 10; }
  final rounded = jsRound((n.abs() + _eps) * p) / p;
  final parts = rounded.toStringAsFixed(maxDecimals).split('.');
  final intPart = parts[0];
  final frac = (parts.length > 1 ? parts[1] : '').replaceAll(RegExp(r'0+$'), '');
  var grouped = intPart;
  if (intPart.length > 3) {
    final head = intPart.substring(0, intPart.length - 3);
    final buf = StringBuffer();
    for (var i = 0; i < head.length; i++) {
      if (i > 0 && (head.length - i) % 2 == 0) buf.write(',');
      buf.write(head[i]);
    }
    grouped = '${buf.toString()},${intPart.substring(intPart.length - 3)}';
  }
  final body = frac.isNotEmpty ? '$grouped.$frac' : grouped;
  return (n < 0 && rounded != 0) ? '-$body' : body;
}

/// `fmtAmt`-style display used on ledger rows.
String fmtAmt(dynamic v) => fmtNum(round2(v));

String localDateStr([DateTime? d]) {
  final x = d ?? DateTime.now();
  return '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
}
