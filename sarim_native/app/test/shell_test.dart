import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sarim_core/sarim_core.dart';
import 'package:sarim_native/app_state.dart';
import 'package:sarim_native/main.dart';
import 'package:sarim_native/ui/tokens.dart';

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

Future<AppState> signedIn({Map<String, dynamic>? accountDoc}) async {
  final store = MemoryStore();
  await store.set('session', {
    'uid': 'u', 'email': 'a@b.c', 'idToken': 't', 'refreshToken': 'r',
    'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
  });
  if (accountDoc != null) await store.set('accountCache', {'doc': accountDoc, 'uid': 'u', 'email': 'a@b.c'});
  final app = AppState(store, const FirebaseConfig(apiKey: 'k', projectId: 'p'), remoteOverride: _NoCloud());
  await app.init();
  return app;
}

void main() {
  test('rem shrinks on phones like the web html font-size', () {
    expect(remFor(390), closeTo(12.168, 1e-9));
    expect(remFor(300), 11.0);
    expect(remFor(449), closeTo(14.0, 1e-9));
    expect(remFor(450), 16.0);
  });

  testWidgets('admin shell: top bar, name, no bottom tab bar, sidebar sections', (tester) async {
    final app = await signedIn();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    expect(find.text('MAHMOOD KHAN'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Production is being ported from the web app'), findsOneWidget); // starts on Production
    await tester.tap(find.bySemanticsLabel('Open menu'));
    await tester.pumpAndSettle();
    for (final t in ['OVERVIEW', 'PRODUCTION', 'SALES', 'CALCULATOR', 'FACTORY', 'PAYMENTS', 'REP SALES', 'APPROVALS', 'DAILY LEDGER', 'STOCK TRANSFER', 'PAYMENT TRANSFER', 'ADD ENTITY', 'ADD RAW MATERIALS', 'FORMULA STORE', 'SETTINGS', 'LOGOUT']) {
      expect(find.text(t), findsOneWidget, reason: t);
    }
  });

  testWidgets('sidebar navigation switches tab and closes the sidebar', (tester) async {
    final app = await signedIn();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Open menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SALES'));
    await tester.pumpAndSettle();
    expect(find.text('Sales is being ported from the web app'), findsOneWidget);
  });

  testWidgets('standalone screen opens from the sidebar and closes with back', (tester) async {
    final app = await signedIn();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Open menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('DAILY LEDGER'));
    await tester.pumpAndSettle();
    expect(find.text('Daily Ledger is being ported from the web app'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Daily Ledger is being ported from the web app'), findsNothing);
  });

  testWidgets('production-only account sees only its tab and Settings, with its own name', (tester) async {
    final app = await signedIn(accountDoc: {'roles': ['production'], 'displayName': 'Ali', 'ownerUid': 'boss'});
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    expect(find.text('ALI'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Open menu'));
    await tester.pumpAndSettle();
    expect(find.text('PRODUCTION'), findsOneWidget);
    expect(find.text('SALES'), findsNothing);
    expect(find.text('DAILY LEDGER'), findsNothing);
    expect(find.text('LOGOUT'), findsNothing); // web hides Logout outside admin mode
    expect(find.text('SETTINGS'), findsOneWidget);
  });

  testWidgets('logout asks for confirmation with the web text', (tester) async {
    final app = await signedIn();
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Open menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('LOGOUT'));
    await tester.pumpAndSettle();
    expect(find.text('Sign Out?'), findsOneWidget);
    expect(find.textContaining('local data on this device will be erased'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(app.signedIn, true);
    await tester.tap(find.bySemanticsLabel('Open menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('LOGOUT'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign Out'));
    await tester.pumpAndSettle();
    expect(app.signedIn, false);
    expect(find.text('Welcome back'), findsOneWidget);
  });
}
