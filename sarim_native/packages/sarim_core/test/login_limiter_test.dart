import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

Future<void> main() async {
  await group('rate limiter matches the web app', () async {
    var now = 1000000;
    final l = LoginRateLimiter(clock: () => now);
    eq(l.backoffMs, 0, 'no back-off at start');
    final expected = [1000, 2000, 4000, 8000];
    for (var i = 0; i < 4; i++) {
      l.recordFailure();
      eq(l.backoffMs, expected[i], 'back-off after ${i + 1}');
      check(!l.isLockedOut, 'not locked after ${i + 1}');
    }
    l.recordFailure();
    check(l.isLockedOut, 'locked after 5');
    eq(l.backoffMs, 8000, 'back-off capped at 8s');
    eq(l.lockoutRemainingMs, 15 * 60 * 1000, 'lockout length');
    now += 15 * 60 * 1000 + 1;
    check(!l.isLockedOut, 'lockout expires');
    l.recordSuccess();
    eq(l.attempts, 0, 'success resets');
  });
  if (finish() != 0) throw StateError('login limiter tests failed');
}
