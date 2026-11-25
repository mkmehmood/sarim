import 'js_num.dart';
import 'store.dart';

/// One locally stored collection, for the Database Structure screen.
class CollectionInfo {
  const CollectionInfo(this.key, this.label, this.count, {this.isList = true});
  final String key;
  final String label;
  final int count; // records (or items) stored
  final bool isList;
}

/// Collections the native app keeps on the device, in the order they are shown.
const storedCollections = <(String, String)>[
  ('sales', 'Sales, collections and Money Out'),
  ('customers', 'Customers'),
  ('production', 'Production batches'),
  ('returns', 'Returns'),
  ('inventory', 'Inventory'),
  ('stores', 'Stores'),
  ('formulas', 'Formulas'),
  ('calculator', 'Calculator history'),
  ('deleted', 'Deleted record ids'),
  ('outbox', 'Waiting to upload'),
];

/// Counts what is stored locally. Missing or malformed collections count as zero.
Future<List<CollectionInfo>> storageOverview(LocalStore store) async {
  final out = <CollectionInfo>[];
  for (final (key, label) in storedCollections) {
    final v = await store.get(key);
    out.add(CollectionInfo(key, label, v is List ? v.length : 0));
  }
  return out;
}

int totalRecords(List<CollectionInfo> info) => info.where((i) => i.key != 'deleted' && i.key != 'outbox').fold(0, (a, i) => a + i.count);

String countLabel(int n) => '${fmtNum(n)} ${n == 1 ? 'record' : 'records'}';
