import 'package:flutter_test/flutter_test.dart';
import 'package:sarim_native/ui/splash_screen.dart';

void main() {
  test('palette periods match the web splash', () {
    expect(splashPalette(DateTime(2026, 1, 1, 3)).isDay, false);
    expect(splashPalette(DateTime(2026, 1, 1, 12)).isDay, true);
    expect(splashPalette(DateTime(2026, 1, 1, 6)).f, 0);
    expect(splashPalette(DateTime(2026, 1, 1, 12)).f, 0.5);
    expect(greetingFor(DateTime(2026, 1, 1, 9)), 'Good morning');
    expect(greetingFor(DateTime(2026, 1, 1, 14)), 'Good afternoon');
    expect(greetingFor(DateTime(2026, 1, 1, 20)), 'Good evening');
  });
}
