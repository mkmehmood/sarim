import 'customer_ledger.dart';
import 'ids.dart';
import 'js_num.dart';
import 'store.dart';

/// A pending cloud write, queued while offline (same idea as the web app's OfflineQueue).
class SyncOp {
  SyncOp(this.action, this.collection, this.docId, this.data);
  final String action; // 'set' | 'delete'
  final String collection;
  final String docId;
  final Rec? data;
  Map<String, dynamic> toJson() => {'action': action, 'collection': collection, 'docId': docId, 'data': data};
  factory SyncOp.fromJson(Map<String, dynamic> j) =>
      SyncOp('${j['action']}', '${j['collection']}', '${j['docId']}', j['data'] == null ? null : Map<String, dynamic>.from(j['data'] as Map));
}

class ValidationError implements Exception {
  ValidationError(this.message);
  final String message;
  @override
  String toString() => message;
}

String formatTime12(DateTime d) {
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${h.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')} ${d.hour >= 12 ? 'PM' : 'AM'}';
}

/// Builds the sale-collection record the web app uses for "Money Out" (see modules/money-out.js on the web side).
Rec buildMoneyOutRecord({
  required String id,
  required String customerName,
  required double amount,
  required String date,
  required int nowMs,
  String note = '',
  String? createdBy,
  String time = '',
}) =>
    {
      'id': id,
      'timestamp': nowMs,
      'createdAt': nowMs,
      'updatedAt': nowMs,
      'date': date,
      'time': time,
      'customerName': customerName,
      'customerPhone': '',
      'quantity': 0,
      'supplyStore': null,
      'paymentType': 'MONEY_OUT',
      'salesRep': 'NONE',
      'currentRepProfile': 'admin',
      'totalCost': 0,
      'totalValue': round2(amount),
      'profit': 0,
      'creditReceived': true,
      'isMoneyOut': true,
      'affectsInventory': false,
      'notes': note,
      'gps': null,
      'syncedAt': DateTime.fromMillisecondsSinceEpoch(nowMs, isUtc: true).toIso8601String(),
      'createdBy': createdBy,
    };

class SarimRepository {
  SarimRepository(this.store, {IdGenerator? ids, int Function()? clock, this.createdBy})
      : ids = ids ?? IdGenerator(),
        _clock = clock ?? (() => DateTime.now().millisecondsSinceEpoch);

  final LocalStore store;
  final IdGenerator ids;
  final int Function() _clock;
  final String? createdBy;

  Future<List<Rec>> _list(String key) async {
    final v = await store.get(key);
    return v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Rec>[];
  }

  Future<Set<String>> deletedIds() async {
    final v = await store.get('deleted');
    return v is List ? v.map((e) => '$e').toSet() : <String>{};
  }

  Future<List<Rec>> sales() => _list('sales');
  Future<List<Rec>> customerRecords() => _list('customers');

  Future<Set<String>> _reconciledReturnIds() async {
    final ids = <String>{};
    for (final h in await _list('calculator')) {
      final l = h['linkedRepReturnIds'];
      if (l is List) ids.addAll(l.map((e) => '$e'));
    }
    return ids;
  }

  Future<CustomerList> listCustomers({String filter = ''}) async => customerSummaries(
        sales: await sales(),
        customers: await customerRecords(),
        deletedIds: await deletedIds(),
        reconciledReturnIds: await _reconciledReturnIds(),
        filter: filter,
      );

  Future<CustomerLedger> ledger(String name) async => buildCustomerLedger(
        name,
        sales: await sales(),
        customers: await customerRecords(),
        deletedIds: await deletedIds(),
        reconciledReturnIds: await _reconciledReturnIds(),
      );

  // ---- outbox ------------------------------------------------------------
  Future<List<SyncOp>> outbox() async {
    final v = await store.get('outbox');
    return v is List ? v.whereType<Map>().map((e) => SyncOp.fromJson(Map<String, dynamic>.from(e))).toList() : <SyncOp>[];
  }

  Future<void> _enqueue(SyncOp op) async {
    final q = await outbox();
    // Collapse earlier pending writes for the same document.
    q.removeWhere((o) => o.collection == op.collection && o.docId == op.docId);
    q.add(op);
    await store.set('outbox', q.map((o) => o.toJson()).toList());
  }

  Future<void> removeFromOutbox(SyncOp op) async {
    final q = await outbox();
    q.removeWhere((o) => o.collection == op.collection && o.docId == op.docId && o.action == op.action);
    await store.set('outbox', q.map((o) => o.toJson()).toList());
  }

  // ---- customers ---------------------------------------------------------
  Future<Rec> addCustomer({required String name, String phone = '', String address = ''}) async {
    final n = name.trim();
    if (n.isEmpty) throw ValidationError('Enter the customer name.');
    final customers = await customerRecords();
    final deleted = await deletedIds();
    final lc = n.toLowerCase();
    final exists = customers.any((c) => !deleted.contains('${c['id']}') && '${c['name']}'.trim().toLowerCase() == lc) ||
        (await sales()).any((s) => !deleted.contains('${s['id']}') && s['currentRepProfile'] == 'admin' && '${s['customerName']}'.trim().toLowerCase() == lc);
    if (exists) throw ValidationError('A customer named "$n" already exists.');
    final now = _clock();
    final rec = <String, dynamic>{
      'id': ids.next('cust', nowMs: now),
      'name': n,
      'phone': phone.trim(),
      'address': address.trim(),
      'oldDebit': 0,
      'customSalePrice': 0,
      'createdAt': now,
      'updatedAt': now,
      'timestamp': now,
    };
    customers.add(rec);
    await store.set('customers', customers);
    await _enqueue(SyncOp('set', 'customers', '${rec['id']}', rec));
    return rec;
  }

  // ---- money out ---------------------------------------------------------
  Future<Rec> recordMoneyOut({required String name, required double amount, required String date, String note = ''}) async {
    if (!amount.isFinite || !(amount > 0)) throw ValidationError('Enter an amount greater than zero.');
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) throw ValidationError('Select a date.');
    final customerName = name.trim();
    if (customerName.isEmpty) throw ValidationError('Open a customer first.');
    final now = _clock();
    final rec = buildMoneyOutRecord(
      id: ids.next('sale', nowMs: now),
      customerName: customerName,
      amount: amount,
      date: date,
      nowMs: now,
      note: note.trim(),
      createdBy: createdBy,
      time: formatTime12(DateTime.fromMillisecondsSinceEpoch(now)),
    );
    final all = await sales();
    all.add(rec);
    await store.set('sales', all);
    await _enqueue(SyncOp('set', 'sales', '${rec['id']}', rec));
    return rec;
  }

  // ---- delete ------------------------------------------------------------
  /// Returns null on success, or the reason the entry cannot be deleted here.
  Future<String?> deleteTransaction(String id) async {
    final all = await sales();
    final idx = all.indexWhere((s) => '${s['id']}' == id);
    if (idx < 0) return 'Entry not found.';
    final t = all[idx];
    if (truthy(t['isMerged'])) return 'Opening balance records cannot be deleted.';
    final allocs = t['collectionAllocs'];
    if (allocs is List && allocs.isNotEmpty) return 'This entry has payments applied to it. Remove those payments first.';
    final applied = t['allocations'];
    if ((t['paymentType'] == 'COLLECTION' || t['paymentType'] == 'PARTIAL_PAYMENT') && applied is List && applied.isNotEmpty) {
      return 'This payment is applied to sales. Delete it from the web app so the sales are reopened correctly.';
    }
    all.removeAt(idx);
    await store.set('sales', all);
    final deleted = (await deletedIds())..add(id);
    await store.set('deleted', deleted.toList());
    await _enqueue(SyncOp('delete', 'sales', id, null));
    return null;
  }

  // ---- cloud merge -------------------------------------------------------
  static int _ms(dynamic v) {
    if (v is num) return v.toInt();
    if (v is String) return DateTime.tryParse(v)?.millisecondsSinceEpoch ?? 0;
    return 0;
  }

  /// Applies documents pulled from the cloud. Local records with unsent changes are never overwritten.
  Future<int> applyRemote(String collection, List<Rec> docs, {Set<String> tombstones = const {}}) async {
    final local = await _list(collection);
    final deleted = await deletedIds();
    final pending = (await outbox()).where((o) => o.collection == collection).map((o) => o.docId).toSet();
    final byId = <String, int>{for (var i = 0; i < local.length; i++) '${local[i]['id']}': i};
    var changed = 0;
    for (final d in docs) {
      final id = '${d['id'] ?? ''}';
      if (id.isEmpty || id == '_placeholder_' || deleted.contains(id) || pending.contains(id) || tombstones.contains(id)) continue;
      final i = byId[id];
      if (i == null) {
        local.add(d);
        byId[id] = local.length - 1;
        changed++;
      } else if (_ms(d['updatedAt']) > _ms(local[i]['updatedAt'])) {
        local[i] = d;
        changed++;
      }
    }
    if (tombstones.isNotEmpty) {
      final before = local.length;
      local.removeWhere((r) => tombstones.contains('${r['id']}') && !pending.contains('${r['id']}'));
      changed += before - local.length;
      await store.set('deleted', (deleted..addAll(tombstones)).toList());
    }
    if (changed > 0) await store.set(collection, local);
    return changed;
  }
}
