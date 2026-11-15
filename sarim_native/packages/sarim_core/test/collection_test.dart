import 'dart:convert';
import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

List<Rec> cloneAll(List l) => [for (final x in l) Map<String, dynamic>.from(jsonDecode(jsonEncode(x)) as Map)];

/// Normalise numbers so 5 and 5.0 compare equal, and drop key order.
String canon(dynamic v) {
  if (v is Map) return '{${(v.keys.map((k) => '$k').toList()..sort()).map((k) => '"$k":${canon(v[k])}').join(',')}}';
  if (v is List) return '[${v.map(canon).join(',')}]';
  if (v is num) return v.toDouble().toString();
  return jsonEncode(v);
}

Future<void> main() async {
  final data = jsonDecode(File('test/fixtures/collection_cases.json').readAsStringSync()) as Map<String, dynamic>;
  final stamp = (data['stamp'] as num).toInt();

  await group('300 collection scenarios: allocation matches the web app step by step', () async {
    var i = 0;
    for (final c in data['cases'] as List) {
      final cs = c as Map<String, dynamic>;
      final name = cs['name'] as String;
      var cur = cloneAll(cs['sales'] as List);
      for (final st in cs['steps'] as List) {
        final step = st as Map<String, dynamic>;
        final expRec = Map<String, dynamic>.from(step['record'] as Map);
        final rec = <String, dynamic>{'id': expRec['id'], 'date': expRec['date'], 'paymentType': 'COLLECTION', 'customerName': name, 'currentRepProfile': 'admin', 'totalValue': 0, 'timestamp': expRec['timestamp']};
        final res = applyCollectionToSales(arr: cur, record: rec, amount: (step['amount'] as num).toDouble(), name: name, nowMs: stamp);
        final out = step['out'] as Map<String, dynamic>;
        eq(canon(res.changedIds.toList()..sort()), canon(out['changedIds']), 'case $i changedIds');
        eq(res.allocated, out['allocated'], 'case $i allocated');
        eq(res.paidCount, out['paid'], 'case $i paidCount');
        eq(res.partialCount, out['partial'], 'case $i partialCount');
        eq(canon(rec), canon(expRec), 'case $i collection record');
        eq(canon(cur), canon(step['after']), 'case $i sales after');
        cur = [...cur, rec];
      }
      // Deleting the newest collection reopens the sales exactly as the web does.
      final target = cur.firstWhere((s) => s['id'] == cs['revertTarget']);
      final rv = cs['revert'] as Map<String, dynamic>;
      final issue = collectionRevertIssue(target, cur);
      eq(issue, rv['issue'], 'case $i revert issue');
      if (issue == null) {
        final ids = <String>[];
        for (final a in (target['allocations'] as List? ?? const [])) {
          for (final s in cur) {
            if (s['id'] == (a as Map)['saleId'] && revertCollectionAlloc(s, '${target['id']}')) { s['updatedAt'] = stamp; ids.add('${s['id']}'); }
          }
        }
        eq(canon(ids..sort()), canon(rv['ids']), 'case $i revert ids');
        eq(canon(cur), canon(rv['after']), 'case $i sales after revert');
      }
      i++;
    }
  });
  exit(finish());
}
