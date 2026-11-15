import 'js_num.dart';

/// Port of modules/tx-date.js + edit-date.js (ordering of ledger rows).
String _local(DateTime d) => localDateStr(d);

String editDateValue(Rec? rec, [List<String> fields = const ['date', 'createdAt', 'timestamp']]) {
  if (rec == null) return '';
  for (final f in fields) {
    final v = rec[f];
    if (v == null || v == '') continue;
    if (v is String && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v)) {
      final p = v.split('-').map(int.parse).toList();
      final dt = DateTime(p[0], p[1], p[2]);
      if (dt.year == p[0] && dt.month == p[1] && dt.day == p[2]) return v;
      continue;
    }
    DateTime? dt;
    if (v is num) {
      dt = DateTime.fromMillisecondsSinceEpoch(v.toInt());
    } else if (v is String) {
      dt = DateTime.tryParse(v);
    }
    if (dt != null) return _local(dt.toLocal());
  }
  return '';
}

String txDeviceDate(Rec? t) => editDateValue(t);

int _openingRank(Rec? t) {
  if (t != null && truthy(t['isMerged'])) return 0;
  return (t != null && t['transactionType'] == 'OLD_DEBT') ? 1 : 2;
}

int txDeviceCompare(Rec? a, Rec? b) {
  final ra = _openingRank(a), rb = _openingRank(b);
  if (ra != rb) return ra - rb;
  final da = txDeviceDate(a), db = txDeviceDate(b);
  if (da != db) return da.compareTo(db) < 0 ? -1 : 1;
  final ta = numOf(a?['timestamp']), tb = numOf(b?['timestamp']);
  return ta.compareTo(tb);
}
