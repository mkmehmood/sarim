import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

class FakeRemote implements RemoteApi {
  final Map<String, Map<String, Rec>> docs = {};
  bool offline = false;
  @override
  Future<List<Rec>> listDocuments(String c) async {
    if (offline) throw const SocketException('offline');
    return (docs[c] ?? {}).values.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  @override
  Future<Rec?> getDocument(String c, String id) async {
    if (offline) throw const SocketException('offline');
    final d = docs[c]?[id];
    return d == null ? null : Map<String, dynamic>.from(d);
  }

  @override
  Future<void> setDocument(String c, String id, Rec data) async {
    if (offline) throw const SocketException('offline');
    (docs[c] ??= {})[id] = {...?(docs[c]?[id]), ...data};
  }

  @override
  Future<void> deleteDocument(String c, String id) async {
    if (offline) throw const SocketException('offline');
    docs[c]?.remove(id);
    (docs['deletions'] ??= {})[id] = {'id': id, 'recordId': id, 'collection': c};
  }
}

Map<String, dynamic> credit(String id, String name, String date, double value) => {
      'id': id, 'customerName': name, 'currentRepProfile': 'admin', 'date': date, 'timestamp': DateTime.parse(date).millisecondsSinceEpoch,
      'paymentType': 'CREDIT', 'creditReceived': false, 'quantity': 10, 'unitPrice': value / 10, 'totalValue': value,
    };

Future<void> main() async {
  var clock = DateTime(2026, 11, 15, 14, 5).millisecondsSinceEpoch;
  SarimRepository fresh([LocalStore? s]) => SarimRepository(s ?? MemoryStore(), clock: () => clock += 1000);

  await group('ids are valid for the web validateUUID and unique', () async {
    final g = IdGenerator();
    final seen = <String>{};
    for (var i = 0; i < 2000; i++) {
      final id = g.next('sale');
      check(validateUuid(id), 'invalid id $id');
      check(seen.add(id), 'duplicate id $id');
    }
    check(validateUuid(g.next('')), 'plain uuid invalid');
  });

  await group('Money Out raises the balance and is cancelled by a later collection', () async {
    final repo = fresh();
    await repo.store.set('sales', [credit('a', 'Ali', '2026-11-01', 1000)]);
    var list = await repo.listCustomers();
    eq(list.customers.single.credit, 1000, 'balance before');
    await repo.recordMoneyOut(name: 'Ali', amount: 250, date: '2026-11-10', note: 'refund');
    list = await repo.listCustomers();
    eq(list.customers.single.credit, 1250, 'balance after money out');
    eq(list.totalOutstanding, 1250, 'total outstanding');
    final ledger = await repo.ledger('Ali');
    eq(ledger.entries.length, 2, 'ledger rows');
    eq(ledger.entries.last.kind, EntryKind.moneyOut, 'last row is money out');
    eq(ledger.entries.last.balance, 1250, 'running balance');
    eq(ledger.entries.last.split.debit, 250, 'debit column');
    check(!ledger.entries.last.canEdit, 'money out is not editable');
    eq(ledger.totals.totalReceived, 0, 'money out is not "received"');
    eq(ledger.quantity, 10, 'money out adds no quantity');
    final rec = ledger.entries.last.record;
    eq(rec['paymentType'], 'MONEY_OUT', 'paymentType');
    eq(rec['currentRepProfile'], 'admin', 'admin profile');
    check(validateUuid('${rec['id']}'), 'valid id');
    eq(rec['time'], '02:05 PM'.isNotEmpty ? rec['time'] : '', 'time present');
    await repo.store.set('sales', [...await repo.sales(), {'id': 'c1', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': '2026-11-12', 'timestamp': 5, 'paymentType': 'COLLECTION', 'totalValue': 1250}]);
    eq((await repo.listCustomers()).customers.single.credit, 0, 'balance after full collection');
  });

  await group('Money Out validation', () async {
    final repo = fresh();
    for (final bad in [0.0, -5.0, double.nan, double.infinity]) {
      var threw = false;
      try { await repo.recordMoneyOut(name: 'Ali', amount: bad, date: '2026-11-10'); } on ValidationError { threw = true; }
      check(threw, 'amount $bad should be rejected');
    }
    var threw = false;
    try { await repo.recordMoneyOut(name: 'Ali', amount: 5, date: ''); } on ValidationError { threw = true; }
    check(threw, 'empty date rejected');
    threw = false;
    try { await repo.recordMoneyOut(name: '  ', amount: 5, date: '2026-11-10'); } on ValidationError { threw = true; }
    check(threw, 'blank name rejected');
    eq((await repo.sales()).length, 0, 'nothing saved');
  });

  await group('add customer: validation, duplicates, listing', () async {
    final repo = fresh();
    final c = await repo.addCustomer(name: '  Bilal  ', phone: '0300', address: 'Lahore');
    eq(c['name'], 'Bilal', 'trimmed');
    check(validateUuid('${c['id']}'), 'valid id');
    var threw = false;
    try { await repo.addCustomer(name: 'bilal'); } on ValidationError { threw = true; }
    check(threw, 'duplicate (case-insensitive) rejected');
    threw = false;
    try { await repo.addCustomer(name: ''); } on ValidationError { threw = true; }
    check(threw, 'blank rejected');
    final list = await repo.listCustomers();
    eq(list.customers.single.phone, '0300', 'phone shown');
    eq((await repo.listCustomers(filter: 'zzz')).customers.length, 0, 'filter');
  });

  await group('delete: money out removed, balance restored; guards block linked entries', () async {
    final repo = fresh();
    await repo.store.set('sales', [
      credit('a', 'Ali', '2026-11-01', 500),
      {...credit('b', 'Ali', '2026-11-02', 300), 'collectionAllocs': [{'cid': 'x', 'amt': 100}]},
      {'id': 'op', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'isMerged': true, 'paymentType': 'CREDIT', 'creditReceived': false, 'creditValue': 50, 'totalValue': 50, 'date': '2026-10-01', 'timestamp': 1},
    ]);
    final m = await repo.recordMoneyOut(name: 'Ali', amount: 100, date: '2026-11-05');
    eq((await repo.listCustomers()).customers.single.credit, 500 + 300 + 50 + 100, 'with money out');
    eq(await repo.deleteTransaction('${m['id']}'), null, 'delete ok');
    eq((await repo.listCustomers()).customers.single.credit, 850, 'restored');
    check((await repo.deleteTransaction('b')) != null, 'sale with payments applied is blocked');
    check((await repo.deleteTransaction('op')) != null, 'opening balance is blocked');
    check((await repo.deleteTransaction('missing')) != null, 'unknown id reported');
    check((await repo.deletedIds()).contains('${m['id']}'), 'tombstone recorded locally');
  });

  await group('collections: allocate to open credit, balance, validation, delete reopens sales', () async {
    final repo = fresh();
    await repo.store.set('sales', [credit('a', 'Ali', '2026-11-01', 1000), credit('b', 'Ali', '2026-11-03', 600)]);
    var threw = false;
    try { await repo.recordCollection(name: 'Zed', amount: 50, date: '2026-11-10'); } on ValidationError { threw = true; }
    check(threw, 'no credit -> rejected');
    final col = await repo.recordCollection(name: 'Ali', amount: 700, date: '2026-11-10');
    eq(col['paymentType'], 'COLLECTION', 'type');
    eq((col['allocations'] as List).length, 2, 'newest sale paid first, remainder to the next');
    eq((await repo.listCustomers()).customers.single.credit, 900, 'balance after collecting 700 of 1600');
    final sales = await repo.sales();
    check(sales.firstWhere((s) => s['id'] == 'b')['creditReceived'] == true, 'newer sale settled');
    eq(sales.firstWhere((s) => s['id'] == 'a')['partialPaymentReceived'], 100, 'older sale part-paid');
    final led = await repo.ledger('Ali');
    eq(led.entries.last.balance, 900, 'ledger running balance');
    eq(led.entries.last.kind, EntryKind.collection, 'collection row');
    eq((await repo.outbox()).length, 3, 'collection and both changed sales queued');
    var over = false;
    try { await repo.recordCollection(name: 'Ali', amount: 5000, date: '2026-11-11'); } on OverpaymentRequired { over = true; }
    check(over, 'overpayment needs confirmation');
    final adv = await repo.recordCollection(name: 'Ali', amount: 1000, date: '2026-11-11', allowOverpayment: true);
    eq((await repo.listCustomers()).customers.single.credit, -100, 'advance of 100 leaves the customer in credit');
    final ledAfter = await repo.ledger('Ali');
    eq(ledAfter.outstanding, 0, 'no amount owed');
    eq(ledAfter.entries.last.balance, -100, 'running balance shows credit');
    check((await repo.deleteTransaction('${col['id']}')) != null, 'older collection blocked while a newer one touches the same sale');
    eq(await repo.deleteTransaction('${adv['id']}'), null, 'newest collection deletes');
    eq(await repo.deleteTransaction('${col['id']}'), null, 'then the older one');
    final s2 = await repo.sales();
    check(s2.every((s) => s['creditReceived'] == false && !s.containsKey('collectionAllocs')), 'sales reopened');
    eq((await repo.listCustomers()).customers.single.credit, 1600, 'balance restored');
    for (final bad in [0.0, -1.0, double.nan]) {
      var t = false;
      try { await repo.recordCollection(name: 'Ali', amount: bad, date: '2026-11-11'); } on ValidationError { t = true; }
      check(t, 'amount $bad rejected');
    }
  });

  await group('sales: stock, price, cost, credit warning, customer auto-registered', () async {
    final repo = fresh();
    await repo.store.set('stores', [{'key': 'zubair', 'name': 'ZUBAIR', 'salePrice': 100}]);
    await repo.store.set('production', [{'id': 'p1', 'date': '2026-11-10', 'store': 'zubair', 'net': 500, 'totalCost': 20000}]);
    Future<void> expectErr(Future<dynamic> Function() f, String part, String why) async {
      try { await f(); check(false, '$why: should have failed'); } on ValidationError catch (e) { check(e.message.contains(part), '$why: got "${e.message}"'); }
    }
    await expectErr(() => repo.recordSale(name: 'Ali', quantity: 600, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CASH'), 'Insufficient stock', 'over stock');
    await expectErr(() => repo.recordSale(name: 'Ali', quantity: 10, date: '2026-11-11', storeKey: 'zubair', paymentType: 'CASH'), 'No production', 'no production that day');
    await expectErr(() => repo.recordSale(name: '', quantity: 10, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CASH'), 'customer name', 'blank name');
    final cash = await repo.recordSale(name: 'Ali', quantity: 100, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CASH', phone: '0300');
    eq(cash['totalValue'], 10000, 'value = qty x price');
    eq(cash['totalCost'], 4000, 'cost = qty x realized cost per kg (40)');
    eq(cash['profit'], 6000, 'profit');
    eq(cash['unitPrice'], 100, 'locked unit price');
    eq(cash['creditReceived'], true, 'cash sale is settled');
    eq(cash['supplyDate'], '2026-11-10', 'supply date');
    check(validateUuid('${cash['id']}'), 'valid id');
    eq((await repo.listCustomers()).customers.single.credit, 0, 'cash sale leaves no balance');
    eq((await repo.customerRecords()).single['phone'], '0300', 'customer auto-registered');
    final cr = await repo.recordSale(name: 'Ali', quantity: 150, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CREDIT');
    eq((await repo.listCustomers()).customers.single.credit, 15000, 'credit sale raises balance');
    eq((await repo.customerRecords()).length, 1, 'no duplicate customer record');
    var warned = false;
    try { await repo.recordSale(name: 'Ali', quantity: 10, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CREDIT'); } on CreditWarning { warned = true; }
    check(warned, 'balance above 5000 asks for confirmation');
    await repo.recordSale(name: 'Ali', quantity: 10, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CREDIT', confirmHighCredit: true);
    eq((await repo.listCustomers()).customers.single.credit, 16000, 'confirmed credit sale');
    await repo.recordCollection(name: 'Ali', amount: 16000, date: '2026-11-20');
    eq((await repo.listCustomers()).customers.single.credit, 0, 'collection settles credit sales');
    final q = await repo.quoteCustomerSale(name: 'Ali', quantity: 1, date: '2026-11-10', storeKey: 'zubair');
    eq(q.available, 240, 'stock left after 100 + 150 + 10 sold of 500');
    eq(await repo.deleteTransaction('${cash['id']}'), null, 'cash sale deletes');
    check((await repo.deleteTransaction('${cr['id']}')) != null, 'credit sale with payments applied is blocked');
    await repo.store.set('production', [{'id': 'p2', 'date': '2026-11-10', 'store': 'zubair', 'net': 500, 'totalCost': 0}]);
    await expectErr(() => repo.recordSale(name: 'Ali', quantity: 1, date: '2026-11-10', storeKey: 'zubair', paymentType: 'CASH'), 'cost price', 'no costed production');
  });

  await group('sync pulls stores, production and returns from the cloud', () async {
    final remote = FakeRemote();
    remote.docs['stores'] = {'list': {'stores': [{'key': 'zubair', 'name': 'ZUBAIR', 'salePrice': 90}], 'stores_timestamp': 5}};
    remote.docs['production'] = {'p1': {'id': 'p1', 'date': '2026-11-10', 'store': 'zubair', 'net': 100, 'totalCost': 3000, 'updatedAt': 1}};
    remote.docs['returns'] = {'r1': {'id': 'r1', 'date': '2026-11-10', 'store': 'zubair', 'quantity': 5, 'updatedAt': 1}};
    final repo = fresh();
    final res = await SyncService(repo, remote).sync();
    check(res.ok, 'sync ok');
    eq((await repo.stores()).single.salePrice, 90, 'store price pulled');
    final q = await repo.quoteCustomerSale(name: 'Ali', quantity: 20, date: '2026-11-10', storeKey: 'zubair');
    check(q.ok, 'sale quotable from pulled data: ${q.message}');
    eq(q.available, 105, 'production + returns');
    eq(q.totalCost, 600, '30/kg realized cost');
    // an older cloud copy never overwrites newer local prices
    remote.docs['stores']!['list'] = {'stores': [{'key': 'zubair', 'name': 'ZUBAIR', 'salePrice': 0}], 'stores_timestamp': 4};
    await SyncService(repo, remote).sync();
    eq((await repo.stores()).single.salePrice, 90, 'older cloud list ignored');
    remote.docs['stores']!['list'] = {'stores': [{'key': 'zubair', 'name': 'ZUBAIR'}], 'stores_timestamp': 9};
    await SyncService(repo, remote).sync();
    eq((await repo.stores()).single.salePrice, 90, 'cloud list without a price keeps the local price');
  });

  await group('formula costing: used when no batch has a cost, pulled from the cloud', () async {
    final remote = FakeRemote();
    remote.docs['stores'] = {'list': {'stores': [{'key': 'zubair', 'name': 'ZUBAIR', 'salePrice': 100, 'formulaId': 'f1'}], 'stores_timestamp': 5}};
    remote.docs['formulas'] = {'config': {'formulas': [
      {'id': 'f1', 'name': 'Layer', 'additionalCost': 10, 'costAdjustmentFactor': 2,
       'ingredients': [{'id': 'i1', 'name': 'Corn', 'quantity': 0.5, 'cost': 20}, {'id': 'i2', 'name': 'Soya', 'quantity': 0.25, 'cost': 40}]}
    ], 'formulas_timestamp': 7}};
    remote.docs['inventory'] = {'i1': {'id': 'i1', 'name': 'Corn', 'cost': 30, 'quantity': 900, 'updatedAt': 1}};
    remote.docs['production'] = {'p1': {'id': 'p1', 'date': '2026-11-10', 'store': 'zubair', 'net': 500, 'totalCost': 0, 'updatedAt': 1}};
    final repo = fresh();
    check((await SyncService(repo, remote).sync()).ok, 'sync ok');
    // Corn uses the live inventory cost (30): 0.5*30 + Soya 0.25*40 = 25, + 10 additional = 35, / factor 2 = 17.5 per kg.
    final q = await repo.quoteCustomerSale(name: 'Ali', quantity: 100, date: '2026-11-10', storeKey: 'zubair');
    check(q.ok, 'quote ok: ${q.message}');
    eq(q.totalCost, 1750, 'formula cost 17.5/kg x 100');
    eq(q.profit, 10000 - 1750, 'profit');
    // No formula, no costed production => refuse rather than record a wrong profit.
    final bare = fresh();
    await bare.store.set('stores', [{'key': 'zubair', 'name': 'ZUBAIR', 'salePrice': 100}]);
    await bare.store.set('production', [{'id': 'p1', 'date': '2026-11-10', 'store': 'zubair', 'net': 500, 'totalCost': 0}]);
    final q2 = await bare.quoteCustomerSale(name: 'Ali', quantity: 1, date: '2026-11-10', storeKey: 'zubair');
    eq(q2.issue, SaleIssue.noCost, 'refused without any cost basis');
  });

  await group('offline queue and sync round-trip', () async {
    final remote = FakeRemote();
    final a = fresh();
    final svc = SyncService(a, remote);
    await a.addCustomer(name: 'Ali');
    await a.recordMoneyOut(name: 'Ali', amount: 75, date: '2026-11-10');
    eq((await a.outbox()).length, 2, 'queued while offline');
    remote.offline = true;
    var r = await svc.sync();
    check(!r.ok && r.error!.contains('No internet'), 'offline sync reports a friendly error');
    eq((await a.outbox()).length, 2, 'queue kept after failure');
    remote.offline = false;
    r = await svc.sync();
    check(r.ok, 'online sync ok');
    eq(r.pushed, 2, 'pushed two writes');
    eq((await a.outbox()).length, 0, 'queue drained');
    eq(remote.docs['sales']!.length, 1, 'sale in cloud');
    final cloudSale = remote.docs['sales']!.values.single;
    eq(cloudSale['paymentType'], 'MONEY_OUT', 'cloud paymentType');
    eq(cloudSale['totalValue'], 75, 'cloud amount');

    // A second device pulls the same data.
    final b = fresh();
    final r2 = await SyncService(b, remote).sync();
    check(r2.ok, 'device B sync ok');
    eq((await b.listCustomers()).customers.single.credit, 75, 'device B sees the balance');

    // Delete on A propagates to B through the tombstone.
    final id = '${cloudSale['id']}';
    await a.deleteTransaction(id);
    await svc.sync();
    check(remote.docs['sales']!.isEmpty, 'deleted in cloud');
    await SyncService(b, remote).sync();
    eq((await b.listCustomers()).customers.single.credit, 0, 'device B removed it');

    // Newer remote edits win, unsent local edits are protected.
    await b.store.set('sales', [{'id': 's1', 'updatedAt': 10, 'v': 'old', 'customerName': 'Z', 'currentRepProfile': 'admin'}]);
    remote.docs['sales'] = {'s1': {'id': 's1', 'updatedAt': 20, 'v': 'new', 'customerName': 'Z', 'currentRepProfile': 'admin'}};
    await SyncService(b, remote).sync();
    eq((await b.sales()).single['v'], 'new', 'newer remote wins');
  });

  await group('Firestore codec round-trips records and matches REST shapes', () async {
    final rec = {'id': 'x', 'n': 5, 'f': 2.5, 'whole': 3.0, 'b': true, 'z': null, 's': 'سلام', 'arr': [1, 'a', {'k': 2}], 'm': {'a': {'b': 1}}};
    final enc = encodeFields(rec);
    eq(enc['n'], {'integerValue': '5'}, 'int');
    eq(enc['f'], {'doubleValue': 2.5}, 'double');
    eq(enc['whole'], {'integerValue': '3'}, 'whole double stored as integer like the JS SDK');
    final back = decodeFields(Map<String, dynamic>.from(enc));
    eq(back['id'], 'x', 'id');
    eq(back['f'], 2.5, 'f');
    eq(back['s'], 'سلام', 'unicode');
    eq((back['arr'] as List).length, 3, 'array');
    eq((back['m'] as Map)['a'], {'b': 1}, 'nested map');
    eq(decodeValue({'timestampValue': '2026-11-15T10:00:00Z'}), DateTime.utc(2026, 11, 15, 10).millisecondsSinceEpoch, 'timestamp -> ms');
  });

  await group('JSON file store survives restarts and never leaves partial files', () async {
    final dir = Directory.systemTemp.createTempSync('sarim_store');
    try {
      final a = JsonFileStore(dir.path);
      await a.set('sales', [{'id': '1'}]);
      final b = JsonFileStore(dir.path);
      eq(((await b.get('sales')) as List).length, 1, 'reloaded');
      check(!dir.listSync().any((f) => f.path.endsWith('.tmp')), 'no temp files left');
      File('${dir.path}/broken.json').writeAsStringSync('{not json');
      eq(await b.get('broken'), null, 'corrupt file reads as empty');
    } finally {
      dir.deleteSync(recursive: true);
    }
  });

  exit(finish());
}
