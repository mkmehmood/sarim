import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'firestore_codec.dart';
import 'js_num.dart';
import 'repository.dart';

/// Cloud access used by [SyncService]. The REST implementation below talks to Firestore directly,
/// using the same `users/{uid}/{collection}/{id}` layout as the web app.
abstract class RemoteApi {
  Future<List<Rec>> listDocuments(String collection);
  /// One document (e.g. `stores/list`), or null when it does not exist.
  Future<Rec?> getDocument(String collection, String id);
  Future<void> setDocument(String collection, String id, Rec data);
  Future<void> deleteDocument(String collection, String id);
}

class FirebaseConfig {
  const FirebaseConfig({required this.apiKey, required this.projectId});
  final String apiKey, projectId;
}

class AuthSession {
  AuthSession({required this.uid, required this.email, required this.idToken, required this.refreshToken, required this.expiresAt});
  final String uid, email;
  String idToken;
  String refreshToken;
  DateTime expiresAt;
  Map<String, dynamic> toJson() => {'uid': uid, 'email': email, 'idToken': idToken, 'refreshToken': refreshToken, 'expiresAt': expiresAt.millisecondsSinceEpoch};
  factory AuthSession.fromJson(Map<String, dynamic> j) => AuthSession(
      uid: '${j['uid']}', email: '${j['email']}', idToken: '${j['idToken']}', refreshToken: '${j['refreshToken']}',
      expiresAt: DateTime.fromMillisecondsSinceEpoch((j['expiresAt'] as num).toInt()));
}

class CloudError implements Exception {
  CloudError(this.message, {this.status});
  final String message;
  final int? status;
  @override
  String toString() => message;
}

Future<Map<String, dynamic>> _json(HttpClient c, String method, Uri url, {Map<String, dynamic>? body, String? bearer, Map<String, String>? form}) async {
  final req = await c.openUrl(method, url);
  if (bearer != null) req.headers.set('Authorization', 'Bearer $bearer');
  if (form != null) {
    req.headers.contentType = ContentType('application', 'x-www-form-urlencoded', charset: 'utf-8');
    req.write(Uri(queryParameters: form).query);
  } else if (body != null) {
    req.headers.contentType = ContentType.json;
    req.write(jsonEncode(body));
  }
  final res = await req.close().timeout(const Duration(seconds: 30));
  final text = await res.transform(utf8.decoder).join();
  Map<String, dynamic> parsed = {};
  try { parsed = text.isEmpty ? {} : Map<String, dynamic>.from(jsonDecode(text) as Map); } catch (_) {}
  if (res.statusCode >= 400) {
    final msg = ((parsed['error'] as Map?)?['message'] ?? 'Request failed (${res.statusCode})').toString();
    throw CloudError(msg, status: res.statusCode);
  }
  return parsed;
}

String friendlyAuthError(String code) {
  if (code.contains('INVALID_PASSWORD') || code.contains('INVALID_LOGIN_CREDENTIALS') || code.contains('EMAIL_NOT_FOUND')) return 'Wrong email or password.';
  if (code.contains('TOO_MANY_ATTEMPTS')) return 'Too many attempts. Try again later.';
  if (code.contains('USER_DISABLED')) return 'This account has been disabled.';
  return code;
}

class FirebaseAuthClient {
  FirebaseAuthClient(this.config, {HttpClient? http}) : _http = http ?? HttpClient();
  final FirebaseConfig config;
  final HttpClient _http;

  Future<AuthSession> signIn(String email, String password) async {
    try {
      final r = await _json(_http, 'POST', Uri.https('identitytoolkit.googleapis.com', '/v1/accounts:signInWithPassword', {'key': config.apiKey}),
          body: {'email': email.trim(), 'password': password, 'returnSecureToken': true});
      return AuthSession(
        uid: '${r['localId']}',
        email: '${r['email'] ?? email}',
        idToken: '${r['idToken']}',
        refreshToken: '${r['refreshToken']}',
        expiresAt: DateTime.now().add(Duration(seconds: int.tryParse('${r['expiresIn']}') ?? 3600)),
      );
    } on CloudError catch (e) {
      throw CloudError(friendlyAuthError(e.message), status: e.status);
    }
  }

  Future<void> refresh(AuthSession s) async {
    final r = await _json(_http, 'POST', Uri.https('securetoken.googleapis.com', '/v1/token', {'key': config.apiKey}),
        form: {'grant_type': 'refresh_token', 'refresh_token': s.refreshToken});
    s.idToken = '${r['id_token']}';
    s.refreshToken = '${r['refresh_token'] ?? s.refreshToken}';
    s.expiresAt = DateTime.now().add(Duration(seconds: int.tryParse('${r['expires_in']}') ?? 3600));
  }
}

class FirestoreRest implements RemoteApi {
  FirestoreRest(this.config, this.session, this.auth, {HttpClient? http}) : _http = http ?? HttpClient();
  final FirebaseConfig config;
  final AuthSession session;
  final FirebaseAuthClient auth;
  final HttpClient _http;

  String get _root => '/v1/projects/${config.projectId}/databases/(default)/documents/users/${session.uid}';

  Future<String> _token() async {
    if (DateTime.now().isAfter(session.expiresAt.subtract(const Duration(minutes: 2)))) await auth.refresh(session);
    return session.idToken;
  }

  @override
  Future<List<Rec>> listDocuments(String collection) async {
    final out = <Rec>[];
    String? page;
    do {
      final r = await _json(_http, 'GET', Uri.https('firestore.googleapis.com', '$_root/$collection', {'pageSize': '300', if (page != null) 'pageToken': page}), bearer: await _token());
      for (final d in (r['documents'] as List? ?? const [])) {
        final doc = Map<String, dynamic>.from(d as Map);
        final fields = decodeFields(Map<String, dynamic>.from((doc['fields'] as Map?) ?? const {}));
        final name = '${doc['name']}';
        fields.putIfAbsent('id', () => name.substring(name.lastIndexOf('/') + 1));
        out.add(fields);
      }
      page = r['nextPageToken'] as String?;
    } while (page != null && page.isNotEmpty);
    return out;
  }

  @override
  Future<Rec?> getDocument(String collection, String id) async {
    try {
      final r = await _json(_http, 'GET', Uri.https('firestore.googleapis.com', '$_root/$collection/${Uri.encodeComponent(id)}'), bearer: await _token());
      return decodeFields(Map<String, dynamic>.from((r['fields'] as Map?) ?? const {}));
    } on CloudError catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  static String _path(String f) => RegExp(r'^[A-Za-z_][A-Za-z0-9_]*$').hasMatch(f) ? f : '`${f.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}`';

  @override
  Future<void> setDocument(String collection, String id, Rec data) async {
    // PATCH with an update mask behaves like Firestore's set(..., { merge: true }).
    final url = Uri.https('firestore.googleapis.com', '$_root/$collection/${Uri.encodeComponent(id)}', {'updateMask.fieldPaths': data.keys.map(_path).toList()});
    await _json(_http, 'PATCH', url, body: {'fields': encodeFields(data)}, bearer: await _token());
  }

  @override
  Future<void> deleteDocument(String collection, String id) async {
    await _json(_http, 'DELETE', Uri.https('firestore.googleapis.com', '$_root/$collection/${Uri.encodeComponent(id)}'), bearer: await _token());
    // Tombstone so the web app and other devices also drop the record (matches deleteRecordFromFirestore in sync.js).
    final now = DateTime.now().toUtc();
    final tomb = <String, dynamic>{
      'id': id,
      'recordId': id,
      'collection': collection,
      'recordType': collection,
      'deletedAt': now,
      'expiresAt': now.add(const Duration(days: 90)),
    };
    await _json(_http, 'PATCH', Uri.https('firestore.googleapis.com', '$_root/deletions/${Uri.encodeComponent(id)}', {'updateMask.fieldPaths': tomb.keys.toList()}),
        body: {'fields': encodeFields(tomb)}, bearer: await _token());
  }
}

class SyncResult {
  SyncResult({this.pushed = 0, this.pulled = 0, this.error});
  final int pushed, pulled;
  final String? error;
  bool get ok => error == null;
}

/// Pushes queued changes, then pulls customers, sales and deletions.
class SyncService {
  SyncService(this.repo, this.remote);
  final SarimRepository repo;
  final RemoteApi remote;
  static const pulled = ['sales', 'customers', 'production', 'returns'];

  Future<SyncResult> sync() async {
    var pushed = 0;
    try {
      for (final op in await repo.outbox()) {
        if (op.action == 'set' && op.data != null) {
          await remote.setDocument(op.collection, op.docId, op.data!);
        } else if (op.action == 'delete') {
          await remote.deleteDocument(op.collection, op.docId);
        }
        await repo.removeFromOutbox(op);
        pushed++;
      }
      final tombs = <String, Set<String>>{};
      for (final d in await remote.listDocuments('deletions')) {
        final c = '${d['collection'] ?? d['recordType'] ?? ''}';
        final id = '${d['recordId'] ?? d['id'] ?? ''}';
        if (id.isNotEmpty) tombs.putIfAbsent(c, () => <String>{}).add(id);
      }
      var changed = 0;
      for (final c in pulled) {
        changed += await repo.applyRemote(c, await remote.listDocuments(c), tombstones: tombs[c] ?? const {});
      }
      final storesDoc = await remote.getDocument('stores', 'list');
      if (storesDoc != null && await repo.applyStores(storesDoc)) changed++;
      return SyncResult(pushed: pushed, pulled: changed);
    } on CloudError catch (e) {
      return SyncResult(pushed: pushed, error: e.message);
    } on SocketException {
      return SyncResult(pushed: pushed, error: 'No internet connection. Changes are saved and will sync later.');
    } on TimeoutException {
      return SyncResult(pushed: pushed, error: 'The server took too long to respond.');
    }
  }
}
