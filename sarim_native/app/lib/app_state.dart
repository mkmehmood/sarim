import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:sarim_core/sarim_core.dart';

/// Holds the signed-in session, repository and sync state for the whole app.
class AppState extends ChangeNotifier {
  AppState(this.store, this.config, {RemoteApi? remoteOverride}) : _remoteOverride = remoteOverride {
    repo = SarimRepository(store);
    auth = FirebaseAuthClient(config);
  }

  final LocalStore store;
  final FirebaseConfig config;
  final RemoteApi? _remoteOverride;
  late final FirebaseAuthClient auth;
  late SarimRepository repo;
  AuthSession? session;
  SyncService? _sync;
  RemoteApi? _remoteApi;

  /// Role session for the signed-in account (admin until the account document says otherwise).
  RoleSession roleSession = deriveSession(const ['admin']);
  String? assignedName; // display name from users/{uid}
  String? repProfile; // upper-cased name when the account has the rep role
  final LoginRateLimiter limiter = LoginRateLimiter();
  bool syncing = false;
  String? syncMessage;
  int revision = 0; // bumped whenever local data changes, so screens reload

  bool get signedIn => session != null;

  Future<void> init() async {
    final raw = await store.get('session');
    if (raw is Map) {
      session = AuthSession.fromJson(Map<String, dynamic>.from(raw));
      _wire();
      await _loadCachedAccount();
      notifyListeners();
      _loadAccount(enforce: false).then((_) => notifyListeners());
      return;
    }
    notifyListeners();
  }

  void _wire() {
    repo = SarimRepository(store, createdBy: session?.email);
    final remote = _remoteOverride ?? FirestoreRest(config, session!, auth);
    _remoteApi = remote;
    _sync = SyncService(repo, remote);
  }

  void _applyAccount(Map<String, dynamic>? doc, String uid, String email) {
    final legacy = isLegacyAccount(doc, uid);
    final roles = legacy ? const ['admin'] : normalizeRoles(doc);
    final name = '${doc?['displayName'] ?? ''}'.trim();
    roleSession = deriveSession(roles);
    assignedName = name.isEmpty ? email.split('@').first : name;
    repProfile = roleSession.roles.contains('rep') ? assignedName!.toUpperCase() : null;
  }

  /// Web `_checkUserApproved`: returns a denial message, or null when the account may use the app.
  /// Offline or unexpected errors do not deny (the cached roles are used instead).
  Future<String?> _loadAccount({required bool enforce}) async {
    final s = session, r = _remoteApi;
    if (s == null || r == null) return null;
    try {
      final doc = await r.getDocument('users', s.uid);
      if (doc == null) {
        if (enforce) return 'Access denied. Your account (${s.email}) is not registered in this system. Contact the administrator.';
        return null;
      }
      if (doc['approved'] == false) return 'Access denied. Your account has been suspended. Contact the administrator.';
      _applyAccount(doc, s.uid, s.email);
      await store.set('accountCache', {'doc': doc, 'uid': s.uid, 'email': s.email});
      return null;
    } on CloudError catch (e) {
      if (e.status == 403) return 'Access denied. You do not have permission to use this app.';
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _loadCachedAccount() async {
    final c = await store.get('accountCache');
    final s = session;
    if (c is Map && s != null && c['uid'] == s.uid) {
      _applyAccount(c['doc'] is Map ? Map<String, dynamic>.from(c['doc'] as Map) : null, s.uid, s.email);
    } else {
      roleSession = deriveSession(const ['admin']);
      assignedName = null;
      repProfile = null;
    }
  }

  /// Returns an error message, or null when signed in.
  Future<String?> signIn(String email, String password) async {
    if (email.trim().isEmpty || password.isEmpty) return 'Enter your email and password.';
    try {
      final s = await auth.signIn(email, password);
      final owner = await store.get('dataOwner');
      if (owner != null && owner != s.uid) {
        // A different account: never show the previous account's data.
        for (final k in ['sales', 'customers', 'deleted', 'outbox', 'calculator']) {
          await store.set(k, <dynamic>[]);
        }
      }
      await store.set('dataOwner', s.uid);
      session = s;
      _wire();
      final denied = await _loadAccount(enforce: true);
      if (denied != null) {
        session = null;
        _sync = null;
        _remoteApi = null;
        return denied;
      }
      await store.set('session', s.toJson());
      notifyListeners();
      await sync();
      return null;
    } on CloudError catch (e) {
      return e.message;
    } on SocketException {
      return 'No internet connection.';
    } catch (e) {
      return 'Could not sign in: $e';
    }
  }

  /// Last email used to sign in (web: OfflineAuth.getSavedEmail), to pre-fill the login form.
  Future<String> savedEmail() async => '${await store.get('savedEmail') ?? ''}';

  Future<void> saveEmail(String email) => store.set('savedEmail', email);

  /// Web sign-out: "the local data on this device will be erased". Pending changes are synced first and the
  /// data is kept if they cannot be uploaded, so nothing unsynced is ever lost.
  Future<void> signOut() async {
    await sync();
    if ((await repo.outbox()).isEmpty) {
      for (final k in ['sales', 'customers', 'deleted', 'outbox', 'calculator', 'production', 'returns', 'inventory', 'stores', 'formulas', 'accountCache', 'dataOwner']) {
        await store.set(k, k == 'dataOwner' || k == 'accountCache' ? null : <dynamic>[]);
      }
    }
    session = null;
    _sync = null;
    _remoteApi = null;
    roleSession = deriveSession(const ['admin']);
    await store.set('session', null);
    notifyListeners();
  }

  Future<void> sync() async {
    final s = _sync;
    if (s == null || syncing) return;
    syncing = true;
    syncMessage = null;
    notifyListeners();
    final r = await s.sync();
    syncing = false;
    syncMessage = r.ok ? null : r.error;
    if (r.pulled > 0 || r.pushed > 0) revision++;
    notifyListeners();
  }

  /// Call after any local change.
  void changed() {
    revision++;
    notifyListeners();
    sync();
  }
}
