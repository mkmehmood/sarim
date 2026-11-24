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
    await tester.tap(find.text('Daily Ledger'));
    await tester.pumpAndSettle();
    expect(find.text('Being ported from the web app'), findsOneWidget);
  });
}
