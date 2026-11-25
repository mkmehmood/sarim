/// Port of `LoginRateLimiter` (modules/sync.js): 5 failures lock sign-in for 15 minutes,
/// and each failure adds an exponential back-off (1s, 2s, 4s, 8s max).
class LoginRateLimiter {
  LoginRateLimiter({int Function()? clock}) : _clock = clock ?? (() => DateTime.now().millisecondsSinceEpoch);

  static const maxAttempts = 5;
  static const lockoutMs = 15 * 60 * 1000;
  static const backoffBaseMs = 1000;

  final int Function() _clock;
  int _attempts = 0;
  int _lockoutUntil = 0;

  int get attempts => _attempts;
  bool get isLockedOut => _lockoutUntil > _clock();
  int get lockoutRemainingMs => (_lockoutUntil - _clock()).clamp(0, lockoutMs);
  int get backoffMs {
    if (_attempts <= 0) return 0;
    final v = backoffBaseMs * (1 << (_attempts - 1));
    return v > 8000 ? 8000 : v;
  }

  void recordFailure() {
    _attempts++;
    if (_attempts >= maxAttempts) _lockoutUntil = _clock() + lockoutMs;
  }

  void recordSuccess() {
    _attempts = 0;
    _lockoutUntil = 0;
  }
}
