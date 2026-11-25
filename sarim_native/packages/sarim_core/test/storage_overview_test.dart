import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  await group('counts what is stored', () async {
    final store = MemoryStore();
    await store.set('sales', [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}]);
    await store.set('customers', [{'id': 'x'}]);
    await store.set('deleted', ['d1', 'd2']);
    await store.set('outbox', {'not': 'a list'}); // malformed counts as zero
    final info = await storageOverview(store);
    eq(info.length, storedCollections.length, 'one row per collection');
    eq(info.firstWhere((i) => i.key == 'sales').count, 3, 'sales');
    eq(info.firstWhere((i) => i.key == 'customers').count, 1, 'customers');
    eq(info.firstWhere((i) => i.key == 'production').count, 0, 'missing is zero');
    eq(info.firstWhere((i) => i.key == 'outbox').count, 0, 'malformed is zero');
    eq(totalRecords(info), 4, 'total leaves out ids and the upload queue');
  });
  await group('labels', () async {
    eq(countLabel(1), '1 record', 'singular');
    eq(countLabel(1234), '1,234 records', 'plural with separator');
    eq(countLabel(0), '0 records', 'zero');
  });
  final code = finish();
  if (code != 0) throw StateError('storage overview tests failed');
}
