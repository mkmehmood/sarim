import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sarim_core/sarim_core.dart';
import 'package:sarim_native/app_state.dart';
import 'package:sarim_native/main.dart';
import 'package:sarim_native/ui/app_shell.dart';

class _NoCloud implements RemoteApi {
  @override
  Future<List<Rec>> listDocuments(String c) async => [];
  @override
  Future<Rec?> getDocument(String c, String id) async => null;
  @override
  Future<void> setDocument(String c, String id, Rec d) async {}
  @override
  Future<void> deleteDocument(String c, String id) async {}
}

void main() {
  const cfg = FirebaseConfig(apiKey: 'k', projectId: 'p');

  testWidgets('login screen shows when signed out', (tester) async {
    final app = AppState(MemoryStore(), cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false, initialTab: ShellTab.sales));
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('customer list, ledger and Money Out flow', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('sales', [
      {'id': 'a', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': '2026-11-01', 'timestamp': 1, 'paymentType': 'CREDIT', 'creditReceived': false, 'quantity': 10, 'unitPrice': 100, 'totalValue': 1000},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false, initialTab: ShellTab.sales));
    await tester.pumpAndSettle();
    expect(find.text('Ali'), findsOneWidget);
    expect(find.text('Rs 1,000'), findsWidgets);

    await tester.tap(find.text('Ali'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Money out'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '250');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Rs 1,250'), findsWidgets);
  });

  testWidgets('collect payment reduces the balance', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('sales', [
      {'id': 'a', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': '2020-01-01', 'timestamp': 1, 'paymentType': 'CREDIT', 'creditReceived': false, 'quantity': 10, 'unitPrice': 100, 'totalValue': 1000},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false, initialTab: ShellTab.sales));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ali'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Collect'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '250');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Rs 750'), findsWidgets);
  });

  testWidgets('new credit sale adds to the balance', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    final today = localDateStr();
    await store.set('stores', [{'key': 'zubair', 'name': 'ZUBAIR', 'salePrice': 100}]);
    await store.set('production', [{'id': 'p1', 'date': today, 'store': 'zubair', 'net': 500, 'totalCost': 20000}]);
    await store.set('sales', [
      {'id': 'a', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': '2020-01-01', 'timestamp': 1, 'paymentType': 'CREDIT', 'creditReceived': false, 'quantity': 10, 'unitPrice': 100, 'totalValue': 1000},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false, initialTab: ShellTab.sales));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ali'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sale'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '10');
    await tester.pumpAndSettle();
    expect(find.textContaining('10 kg x Rs 100 = Rs 1,000'), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Rs 2,000'), findsWidgets);
  });

  testWidgets('shell switches tabs and opens a standalone screen from the drawer', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    expect(find.text('Production'), findsWidgets); // default tab
    expect(find.text('No production in this period.'), findsOneWidget);
    await tester.tap(find.text('Sales').last);
    await tester.pumpAndSettle();
    expect(find.text('No customers yet. Tap Add to create one.'), findsOneWidget);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approvals'));
    await tester.pumpAndSettle();
    expect(find.text('Being ported from the web app'), findsOneWidget);
  });

  testWidgets('payments tab totals cash in and out and opens the customer ledger', (tester) async {
    final store = MemoryStore();
    final today = localDateStr();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('sales', [
      {'id': 'a', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': today, 'timestamp': 1, 'paymentType': 'CASH', 'quantity': 5, 'totalValue': 900},
      {'id': 'b', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': today, 'timestamp': 2, 'paymentType': 'MONEY_OUT', 'isMoneyOut': true, 'totalValue': 200},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Payments').last);
    await tester.pumpAndSettle();
    expect(find.text('Rs 900'), findsWidgets);
    expect(find.text('-Rs 200'), findsOneWidget);
    expect(find.text('Rs 700'), findsOneWidget); // net cash
    await tester.tap(find.text('Money out · $today'));
    await tester.pumpAndSettle();
    expect(find.text('Ali'), findsWidgets);
  });

  testWidgets('daily ledger shows one day in, out and net', (tester) async {
    final store = MemoryStore();
    final today = localDateStr();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('sales', [
      {'id': 'a', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': today, 'timestamp': 1, 'paymentType': 'CASH', 'quantity': 5, 'totalValue': 900},
      {'id': 'b', 'customerName': 'Ali', 'currentRepProfile': 'admin', 'date': today, 'timestamp': 2, 'paymentType': 'MONEY_OUT', 'isMoneyOut': true, 'totalValue': 1200},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Daily Ledger'));
    await tester.pumpAndSettle();
    expect(find.text('Total Cash In'), findsOneWidget);
    expect(find.text('Deficit'), findsOneWidget);
    expect(find.text('-Rs 300'), findsOneWidget);
    await tester.tap(find.byTooltip('Previous day'));
    await tester.pumpAndSettle();
    expect(find.text('No entries on this day.'), findsOneWidget);
  });

  testWidgets('store manager lists stores with price, formula and production', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('stores', [
      {'key': 'zubair', 'name': 'Zubair Store', 'salePrice': 450, 'formulaId': 'f1'},
      {'key': 'gull', 'name': 'Gull Store', 'salePrice': 0},
    ]);
    await store.set('formulas', [{'id': 'f1', 'name': 'Standard'}]);
    await store.set('production', [
      {'id': 'p1', 'date': '2026-01-05', 'store': 'zubair', 'net': 100, 'totalCost': 4000, 'timestamp': 1},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Store Manager'));
    await tester.pumpAndSettle();
    expect(find.text('Zubair Store'), findsOneWidget);
    expect(find.text('Rs 450/kg'), findsOneWidget);
    expect(find.text('Formula: Standard'), findsOneWidget);
    expect(find.text('Produced: 100 kg · Rs 40/kg cost'), findsOneWidget);
    expect(find.text('No price set'), findsOneWidget);
  });

  testWidgets('rep sales tab totals each rep', (tester) async {
    final store = MemoryStore();
    final today = localDateStr();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('sales', [
      {'id': 'a', 'salesRep': 'Bilal', 'date': today, 'timestamp': 1, 'paymentType': 'CASH', 'quantity': 10, 'totalValue': 1000},
      {'id': 'b', 'salesRep': 'Bilal', 'date': today, 'timestamp': 2, 'paymentType': 'CREDIT', 'quantity': 5, 'totalValue': 500},
      {'id': 'c', 'salesRep': 'NONE', 'currentRepProfile': 'admin', 'date': today, 'timestamp': 3, 'paymentType': 'CASH', 'quantity': 9, 'totalValue': 9000},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rep').last);
    await tester.pumpAndSettle();
    expect(find.text('Bilal'), findsOneWidget);
    expect(find.text('15 kg net · 2 entries'), findsOneWidget);
    expect(find.text('Cash in Rs 1,000 · Credit Rs 500'), findsOneWidget);
    expect(find.text('Rs 9,000'), findsNothing); // the admin sale is not a rep sale
  });

  testWidgets('database structure counts local records', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('sales', [{'id': 'a'}, {'id': 'b'}]);
    await store.set('customers', [{'id': 'x'}]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Database Structure'));
    await tester.pumpAndSettle();
    expect(find.text('3 records'), findsOneWidget); // stored on this device
    expect(find.text('2 records'), findsOneWidget); // sales
    expect(find.text('Customers'), findsOneWidget);
  });

  testWidgets('calculator shows expected cash and whether the rep is short', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('stores', [{'key': 'zubair', 'name': 'Zubair Store', 'salePrice': 400}]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Calc').last);
    await tester.pumpAndSettle();
    expect(find.text('Sale price Rs 400/kg'), findsOneWidget);
    expect(find.text('PERFECT MATCH'), findsOneWidget); // blank form
    Future<void> type(String k, String v) async {
      await tester.enterText(find.byKey(ValueKey('f-$k')), v);
      await tester.pump();
    }
    await type('sold', '100');
    await type('returned', '10');
    await type('expired', '5');
    await type('credit', '20');
    await type('prevCreditReceived', '3000');
    await type('fieldExpenses', '500');
    await type('commissionPaid', '1000');
    await type('receivedCash', '27000');
    expect(find.text('Rs 27,500'), findsOneWidget); // expected cash
    expect(find.text('SHORT: Rs 500'), findsOneWidget);
    await type('receivedCash', '27500');
    expect(find.text('PERFECT MATCH'), findsOneWidget);
    await type('receivedCash', '28000');
    expect(find.text('OVER: Rs 500'), findsOneWidget);
  });

  testWidgets('factory tab shows raw-material stock, value and formula cost', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    await store.set('inventory', [
      {'id': 'i1', 'name': 'Maize', 'quantity': 100, 'cost': 40},
      {'id': 'i2', 'name': 'Soya', 'quantity': 0, 'cost': 90},
      {'id': 'i3', 'name': 'Bran', 'quantity': 50, 'cost': 10, 'conversionFactor': 25, 'purchaseQuantity': 2, 'purchaseUnitName': 'bag'},
      {'id': 'lot', 'name': 'Maize', 'isPurchaseLot': true, 'quantity': 9, 'cost': 9},
    ]);
    await store.set('formulas', [
      {'id': 'f1', 'name': 'Standard', 'ingredients': [{'id': 'i1', 'name': 'Maize', 'quantity': 2, 'cost': 1}]},
    ]);
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Factory').last);
    await tester.pumpAndSettle();
    expect(find.text('Rs 4,500'), findsOneWidget); // 100x40 + 0x90 + 50x10; the purchase lot is not counted
    expect(find.text('2 bag (50 kg)'), findsOneWidget);
    expect(find.text('0 kg · Out of stock'), findsOneWidget);
    expect(find.text('Rs 80/kg'), findsOneWidget); // formula: 2 kg of Maize at the live price of 40
  });

  testWidgets('settings screen shows the account and sync state', (tester) async {
    final store = MemoryStore();
    await store.set('session', {
      'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    });
    final app = AppState(store, cfg, remoteOverride: _NoCloud());
    await app.init();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('a@b.c'), findsWidgets);
    expect(find.text('Everything is synced'), findsOneWidget);
    await tester.tap(find.text('Store Manager'));
    await tester.pumpAndSettle();
    expect(find.text('Being ported from the web app'), findsOneWidget);
  });
}
