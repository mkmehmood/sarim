import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sarim_native/ui/splash_quotes.dart';
import 'package:sarim_native/ui/splash_screen.dart';

void main() {
  test('look matches the web render() periods and arc fraction', () {
    expect(SplashLook.of(DateTime(2026, 1, 1, 3)).isDay, false);
    expect(SplashLook.of(DateTime(2026, 1, 1, 6)).f, 0);
    expect(SplashLook.of(DateTime(2026, 1, 1, 12)).f, 0.5);
    expect(SplashLook.of(DateTime(2026, 1, 1, 21)).f, 0.25); // night: (21-18)/12
    expect(SplashLook.of(DateTime(2026, 1, 1, 2)).f, closeTo(8 / 12, 1e-9)); // ((2-18+24)%24)/12
  });

  test('greeting, clock and date text match the web strings', () {
    expect(splashGreeting(DateTime(2026, 1, 1, 4, 59)), 'Early hours');
    expect(splashGreeting(DateTime(2026, 1, 1, 11)), 'Good morning');
    expect(splashGreeting(DateTime(2026, 1, 1, 16)), 'Good afternoon');
    expect(splashGreeting(DateTime(2026, 1, 1, 17)), 'Good evening');
    expect(splashClockText(DateTime(2026, 1, 1, 0, 5)), '12:05');
    expect(splashClockText(DateTime(2026, 1, 1, 15, 30)), '3:30');
    expect(splashDateText(DateTime(2026, 11, 25)), 'Wednesday \u00b7 25 November');
  });

  test('all 60 quotes were carried over', () => expect(splashQuotes.length, 60));

  testWidgets('splash holds, then calls onDone', (tester) async {
    var done = false;
    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: SplashScreen(ready: Future.value(), onDone: () => done = true, now: DateTime(2026, 11, 25, 9, 41)),
    ));
    expect(find.text('GULL AND ZUBAIR'), findsOneWidget);
    expect(find.text('PREPARING YOUR DAY'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 2900));
    await tester.pump(const Duration(milliseconds: 700));
    expect(done, true);
  });
}
