import 'dart:convert';

import 'customer_ledger.dart';
import 'finance.dart';
import 'ids.dart';
import 'link_graph.dart';
import 'sales.dart';
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

/// Thrown when a collection is larger than what the customer owes; the caller may confirm an advance payment.
class OverpaymentRequired extends ValidationError {
  OverpaymentRequired(this.owed, this.amount)
      : super('Customer owes ${owed.toStringAsFixed(2)} but ${amount.toStringAsFixed(2)} is being collected.');
  final double owed, amount;
}

/// Thrown when a credit sale would push a customer's unpaid balance above the warning threshold.
class CreditWarning extends ValidationError {
  CreditWarning(this.existing, this.saleValue)
      : super('Unpaid balance ${existing.toStringAsFixed(2)} plus this sale ${saleValue.toStringAsFixed(2)}.');
  final double existing, saleValue;
}

bool jsonEqual(dynamic a, dynamic b) => jsonEncode(a) == jsonEncode(b);

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

  // ---- sales -------------------------------------------------------------
  static const creditWarningThreshold = 5000.0;

  Future<List<StoreInfo>> stores() async => StoreInfo.fromJson(await store.get('stores'));

  Future<SaleQuote> quoteCustomerSale({required String name, required double quantity, required String date, required String storeKey}) async {
    final all = await stores();
    var label = storeKey.toUpperCase();
    for (final s in all) { if (s.key == storeKey) label = s.name; }
    return quoteSale(
      date: date,
      name: name,
      quantity: quantity,
      store: storeKey,
      storeLabel: label,
      production: await _list('production'),
      returns: await _list('returns'),
      sales: await sales(),
      customers: await customerRecords(),
      stores: all,
      formulas: await _formulaList(),
      inventory: await _list('inventory'),
    );
  }

  Future<List<Rec>> _formulaList() => _list('formulas');

  /// Records a cash or credit sale to a customer (no sales rep). Mirrors saveCustomerSale in the web app.
  Future<Rec> recordSale({
    required String name,
    required double quantity,
    required String date,
    required String storeKey,
    required String paymentType,
    String phone = '',
    bool confirmHighCredit = false,
  }) async {
    if (paymentType != 'CASH' && paymentType != 'CREDIT') throw ValidationError('Choose cash or credit.');
    final customerName = name.trim();
    final q = await quoteCustomerSale(name: customerName, quantity: quantity, date: date, storeKey: storeKey);
    if (!q.ok) throw ValidationError(q.message!);
    final all = await sales();
    if (paymentType == 'CREDIT' && !confirmHighCredit) {
      final lc = customerName.toLowerCase();
      final known = all.any((s) => truthy(s['customerName']) && '${s['customerName']}'.toLowerCase() == lc);
      if (known) {
        final deleted = await deletedIds();
        final reconciled = await _reconciledReturnIds();
        var existing = 0.0;
        final opts = LedgerOpts(reconciledReturnIds: reconciled);
        for (final s in all) {
          if (deleted.contains('${s['id']}') || !truthy(s['customerName']) || '${s['customerName']}'.toLowerCase() != lc) continue;
          existing = round2(existing + debtDelta(s, debtNeedsGross(s) ? saleTransactionValue(s) : 0, opts));
        }
        if (existing > creditWarningThreshold) throw CreditWarning(existing, q.totalValue);
      }
    }
    final now = _clock();
    final dt = DateTime.fromMillisecondsSinceEpoch(now);
    final rec = <String, dynamic>{
      'id': ids.next('sale', nowMs: now),
      'timestamp': now,
      'createdAt': now,
      'updatedAt': now,
      'date': localDateStr(dt),
      'supplyDate': date,
      'time': formatTime12(dt),
      'customerName': customerName,
      'customerPhone': phone.trim(),
      'quantity': quantity,
      'supplyStore': storeKey,
      'paymentType': paymentType,
      'salesRep': 'NONE',
      'currentRepProfile': 'admin',
      'totalCost': q.totalCost,
      'totalValue': q.totalValue,
      'profit': q.profit,
      'unitPrice': q.unitPrice,
      'creditReceived': paymentType == 'CASH',
      'syncedAt': DateTime.fromMillisecondsSinceEpoch(now, isUtc: true).toIso8601String(),
      'createdBy': createdBy,
    };
    all.add(rec);
    await store.set('sales', all);
    await _enqueue(SyncOp('set', 'sales', '${rec['id']}', rec));
    final customers = await customerRecords();
    final lc = customerName.toLowerCase();
    if (!customers.any((c) => truthy(c['name']) && '${c['name']}'.toLowerCase() == lc)) {
      final contact = <String, dynamic>{
        'id': ids.next('cust', nowMs: now),
        'name': customerName,
        'phone': phone.trim(),
        'address': '',
        'oldDebit': 0,
        'customSalePrice': 0,
        'createdAt': now,
        'updatedAt': now,
        'timestamp': now,
      };
      customers.add(contact);
      await store.set('customers', customers);
      await _enqueue(SyncOp('set', 'customers', '${contact['id']}', contact));
    }
    return rec;
  }

  /// Adopts the formulas list (`formulas/config`) from the cloud when it is newer.
  Future<bool> applyFormulas(Rec doc) async {
    final cloud = doc['formulas'];
    if (cloud is! List) return false;
    final cloudTs = numOf(doc['formulas_timestamp']);
    final localTs = numOf(await store.get('formulas_timestamp'));
    final local = await store.get('formulas');
    if (local is List && local.isNotEmpty && localTs > 0 && cloudTs <= localTs) return false;
    if (jsonEqual(cloud, local)) return false;
    await store.set('formulas', cloud);
    if (cloudTs > 0) await store.set('formulas_timestamp', cloudTs);
    return true;
  }

  /// Adopts the store list (names, sale prices) from the cloud. Returns true if anything changed.
  Future<bool> applyStores(Rec doc) async {
    final cloud = doc['stores'];
    if (cloud is! List) return false;
    final cloudTs = numOf(doc['stores_timestamp']);
    final localTs = numOf(await store.get('stores_timestamp'));
    final local = await store.get('stores');
    if (local is List && local.isNotEmpty && localTs > 0 && cloudTs <= localTs) return false;
    final localList = local is List ? local.whereType<Map>().toList() : <Map>[];
    final merged = [
      for (final c in cloud.whereType<Map>())
        () {
          final out = Map<String, dynamic>.from(c);
          final l = localList.where((x) => x['key'] == c['key']).toList();
          if (l.isNotEmpty) {
            if (!(numOf(c['salePrice']) > 0) && numOf(l.first['salePrice']) > 0) out['salePrice'] = l.first['salePrice'];
            if (!truthy(c['formulaId']) && truthy(l.first['formulaId'])) out['formulaId'] = l.first['formulaId'];
          }
          return out;
        }()
    ];
    if (jsonEqual(merged, local)) return false;
    await store.set('stores', merged);
    if (cloudTs > 0) await store.set('stores_timestamp', cloudTs);
    return true;
  }

  // ---- collections -------------------------------------------------------
  Future<double> outstanding(String name, List<Rec> allSales, Set<String> deleted, Set<String> reconciled) async {
    final lc = name.trim().toLowerCase();
    var out = 0.0;
    final opts = LedgerOpts(reconciledReturnIds: reconciled);
    for (final s in allSales) {
      if (deleted.contains('${s['id']}') || s['currentRepProfile'] != 'admin') continue;
      if ('${s['customerName'] ?? ''}'.toLowerCase() != lc) continue;
      out = round2(out + debtDelta(s, debtNeedsGross(s) ? saleTransactionValue(s) : 0, opts));
    }
    return out > 0 ? out : 0;
  }

  /// Records cash collected from a customer and applies it to their open credit (newest sale first).
  Future<Rec> recordCollection({required String name, required double amount, required String date, String note = '', bool allowOverpayment = false}) async {
    final customerName = name.trim();
    if (customerName.isEmpty) throw ValidationError('Open a customer first.');
    if (!amount.isFinite || !(amount > 0)) throw ValidationError('Enter an amount greater than zero.');
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) throw ValidationError('Select a date.');
    final all = await sales();
    final deleted = await deletedIds();
    final reconciled = await _reconciledReturnIds();
    final owed = await outstanding(customerName, all, deleted, reconciled);
    if (owed <= 0) {
      throw ValidationError('$customerName has no outstanding credit balance. Collections can only be recorded against existing unpaid credit.');
    }
    if (amount > owed && !allowOverpayment) throw OverpaymentRequired(owed, amount);
    final now = _clock();
    final customers = await customerRecords();
    var phone = '';
    for (final c in customers) {
      if ('${c['name']}'.toLowerCase() == customerName.toLowerCase() && truthy(c['phone'])) { phone = '${c['phone']}'; break; }
    }
    final rec = <String, dynamic>{
      'id': ids.next('sale', nowMs: now),
      'timestamp': now,
      'createdAt': now,
      'updatedAt': now,
      'date': date,
      'time': formatTime12(DateTime.fromMillisecondsSinceEpoch(now)),
      'customerName': customerName,
      'customerPhone': phone,
      'quantity': 0,
      'supplyStore': null,
      'paymentType': 'COLLECTION',
      'salesRep': 'NONE',
      'currentRepProfile': 'admin',
      'totalCost': 0,
      'totalValue': round2(amount),
      'profit': round2(amount),
      'creditReceived': true,
      'isCollection': true,
      'gps': null,
      'syncedAt': DateTime.fromMillisecondsSinceEpoch(now, isUtc: true).toIso8601String(),
      'createdBy': createdBy,
      if (note.trim().isNotEmpty) 'notes': note.trim(),
    };
    final live = all.where((s) => !deleted.contains('${s['id']}')).toList();
    final res = applyCollectionToSales(arr: live, record: rec, amount: round2(amount), name: customerName, reconciledReturnIds: reconciled, nowMs: now);
    final out = [...all];
    out.add(rec);
    await store.set('sales', out);
    for (final id in res.changedIds) {
      final changed = out.firstWhere((s) => '${s['id']}' == id);
      await _enqueue(SyncOp('set', 'sales', id, changed));
    }
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
    final reopened = <String>[];
    if (t['paymentType'] == 'PARTIAL_PAYMENT' && (truthy(t['relatedSaleId']) || (applied is List && applied.isNotEmpty))) {
      return 'This payment is linked to a credit sale. Delete it from the web app so the sale is reopened correctly.';
    }
    if (t['paymentType'] == 'COLLECTION' && applied is List && applied.isNotEmpty) {
      final issue = collectionRevertIssue(t, all);
      if (issue != null) return issue;
      final now = _clock();
      for (final a in applied) {
        for (final s in all) {
          if (s['id'] == (a as Map)['saleId'] && revertCollectionAlloc(s, id)) {
            s['updatedAt'] = now;
            reopened.add('${s['id']}');
          }
        }
      }
    }
    all.removeAt(idx);
    await store.set('sales', all);
    final deleted = (await deletedIds())..add(id);
    await store.set('deleted', deleted.toList());
    for (final sid in reopened) {
      await _enqueue(SyncOp('set', 'sales', sid, all.firstWhere((x) => '${x['id']}' == sid)));
    }
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
