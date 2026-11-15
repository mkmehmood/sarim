import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sarim_core/sarim_core.dart';
import 'package:sarim_native/app_state.dart';
import 'package:sarim_native/main.dart';

class _NoCloud implements RemoteApi {
  @override
  Future<List<Rec>> listDocuments(String c) async => [];
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
    await tester.pumpWidget(SarimApp(app: app));
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
    await tester.pumpWidget(SarimApp(app: app));
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
    await tester.pumpWidget(SarimApp(app: app));
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
}
