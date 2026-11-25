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
    }
    notifyListeners();
  }

  void _wire() {
    repo = SarimRepository(store, createdBy: session?.email);
    final remote = _remoteOverride ?? FirestoreRest(config, session!, auth);
    _sync = SyncService(repo, remote);
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
      await store.set('session', s.toJson());
      _wire();
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

  Future<void> signOut() async {
    session = null;
    _sync = null;
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
