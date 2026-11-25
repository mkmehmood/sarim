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
