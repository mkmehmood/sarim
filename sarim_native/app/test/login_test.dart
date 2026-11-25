import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sarim_core/sarim_core.dart';
import 'package:sarim_native/app_state.dart';
import 'package:sarim_native/main.dart';

void main() {
  const cfg = FirebaseConfig(apiKey: 'k', projectId: 'p');

  Future<AppState> signedOut() async {
    final app = AppState(MemoryStore(), cfg);
    await app.init();
    return app;
  }

  testWidgets('shows the login layout from the web app', (tester) async {
    await tester.pumpWidget(SarimApp(app: await signedOut(), showSplash: false));
    await tester.pumpAndSettle();
    expect(find.text('GULL AND ZUBAIR'), findsOneWidget);
    expect(find.text('NASWAR DEALERS'), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Email address'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.textContaining('Contact the administrator'), findsOneWidget);
  });

  testWidgets('empty fields give the web message', (tester) async {
    await tester.pumpWidget(SarimApp(app: await signedOut(), showSplash: false));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.text('Please enter both email and password'), findsOneWidget);
  });

  testWidgets('eye button toggles password visibility', (tester) async {
    await tester.pumpWidget(SarimApp(app: await signedOut(), showSplash: false));
    await tester.pumpAndSettle();
    bool obscured() => tester.widget<TextField>(find.byType(TextField).last).obscureText;
    expect(obscured(), true);
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(obscured(), false);
  });

  testWidgets('locked-out state shows the countdown message', (tester) async {
    final app = await signedOut();
    for (var i = 0; i < 5; i++) { app.limiter.recordFailure(); }
    await tester.pumpWidget(SarimApp(app: app, showSplash: false));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'a@b.c');
    await tester.enterText(find.byType(TextField).last, 'pw');
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.textContaining('Too many failed attempts. Try again in 15m 00s.'), findsOneWidget);
  });
}
