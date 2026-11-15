import 'dart:convert';
import 'dart:io';

int _checks = 0;
final List<String> _failures = [];

void check(bool cond, String msg) {
  _checks++;
  if (!cond) _failures.add(msg);
}

void eq(dynamic actual, dynamic expected, String msg, {double tol = 1e-9}) {
  _checks++;
  final ok = (actual is num && expected is num)
      ? (actual - expected).abs() <= tol
      : (actual is Map || actual is List) ? jsonEncode(actual) == jsonEncode(expected) : actual == expected;
  if (!ok) _failures.add('$msg: expected $expected, got $actual');
}

Future<void> group(String name, Future<void> Function() body) async {
  final before = _failures.length;
  try {
    await body();
  } catch (e, st) {
    _failures.add('$name threw: $e\n$st');
  }
  stdout.writeln('${_failures.length == before ? 'ok  ' : 'FAIL'} $name');
}

int finish() {
  if (_failures.isEmpty) {
    stdout.writeln('\nAll $_checks checks passed.');
    return 0;
  }
  stderr.writeln('\n${_failures.length} failure(s) in $_checks checks:');
  for (final f in _failures.take(40)) { stderr.writeln('  - $f'); }
  return 1;
}
