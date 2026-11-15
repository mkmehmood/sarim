import 'dart:convert';
import 'dart:io';

/// Key/value JSON storage (one JSON document per key), mirroring the web app's `sqliteStore`.
abstract class LocalStore {
  Future<dynamic> get(String key);
  Future<void> set(String key, dynamic value);
}

class MemoryStore implements LocalStore {
  final Map<String, String> _data = {};
  @override
  Future<dynamic> get(String key) async => _data.containsKey(key) ? jsonDecode(_data[key]!) : null;
  @override
  Future<void> set(String key, dynamic value) async => _data[key] = jsonEncode(value);
}

/// Atomic file-backed store: writes to a temp file and renames, so a crash never leaves a half-written collection.
class JsonFileStore implements LocalStore {
  JsonFileStore(this.dir) {
    Directory(dir).createSync(recursive: true);
  }
  final String dir;
  File _file(String key) => File('$dir/${key.replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_')}.json');

  @override
  Future<dynamic> get(String key) async {
    final f = _file(key);
    if (!await f.exists()) return null;
    try {
      return jsonDecode(await f.readAsString());
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> set(String key, dynamic value) async {
    final f = _file(key);
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode(value), flush: true);
    await tmp.rename(f.path);
  }
}
