import 'dart:math';

/// Record id generator compatible with the web app's `validateUUID` (time-ordered, version 4, admin mode).
class IdGenerator {
  IdGenerator({Random? random, int? deviceShard})
      : _rng = random ?? Random.secure(),
        _shard = deviceShard ?? (random ?? Random.secure()).nextInt(0x10000);

  final Random _rng;
  final int _shard;
  int _lastMs = 0;
  int _seq = 0;

  String next(String prefix, {int? nowMs, String modeNibble = '0'}) {
    var ms = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    if (ms == _lastMs) {
      _seq = (_seq + 1) & 0xff;
    } else {
      _lastMs = ms;
      _seq = _rng.nextInt(0x40);
    }
    final b = List<int>.filled(16, 0);
    final hi = ms ~/ 0x10000;
    b[0] = (hi >> 24) & 0xff;
    b[1] = (hi >> 16) & 0xff;
    b[2] = (hi >> 8) & 0xff;
    b[3] = hi & 0xff;
    final lo = ms & 0xffff;
    b[4] = (lo >> 8) & 0xff;
    b[5] = lo & 0xff;
    b[6] = 0x40 | ((_seq >> 4) & 0xf);
    b[7] = ((_seq & 0xf) << 4) | int.parse(modeNibble, radix: 16);
    b[8] = 0x80 | _rng.nextInt(0x40);
    b[9] = _rng.nextInt(256);
    b[10] = (_shard >> 8) & 0xff;
    b[11] = _shard & 0xff;
    for (var i = 12; i < 16; i++) { b[i] = _rng.nextInt(256); }
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    final uuid = '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20, 32)}';
    return prefix.isEmpty ? uuid : '$prefix-$uuid';
  }
}

final RegExp _standard = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', caseSensitive: false);
final RegExp _prefixed =
    RegExp(r'^[a-z0-9][a-z0-9_-]*-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(_\d+)?$', caseSensitive: false);

bool validateUuid(String? id) => id != null && (_standard.hasMatch(id) || _prefixed.hasMatch(id));
