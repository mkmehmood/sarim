import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:local_auth/local_auth.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

typedef Emit = void Function(String plugin, String event, Object? payload);

/// Implements the Capacitor-style plugin calls the web app makes
/// (see assets/bridge/capacitor_shim.js and android_overrides/MainActivity.kt).
class NativeBridge {
  NativeBridge({required this.onEmit});

  final Emit onEmit;
  static const MethodChannel _channel = MethodChannel('sarim/native');
  final LocalAuthentication _auth = LocalAuthentication();
  final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();

  String encode(Object? v) => jsonEncode(v);

  Future<void> init() async {
    const settings = InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher'));
    await _notifications.initialize(
      settings,
      onDidReceiveNotificationResponse: (r) {
        Object? extra;
        try { extra = r.payload == null ? null : jsonDecode(r.payload!); } catch (_) {}
        onEmit('LocalNotifications', 'localNotificationActionPerformed', {
          'actionId': r.actionId ?? 'tap',
          'notification': {'id': r.id, 'extra': extra},
        });
      },
    );
  }

  Map<String, dynamic> _error(String code, String message) => {'__error': true, 'code': code, 'message': message};

  Future<dynamic> handle(String plugin, String method, Map<String, dynamic> args) async {
    try {
      switch (plugin) {
        case 'SaveFile':
          return await _saveFile(method, args);
        case 'DirectShare':
          return await _directShare(method, args);
        case 'Share':
          return await _share(args);
        case 'Filesystem':
          return await _filesystem(method, args);
        case 'Haptics':
          return await _haptics(method, args);
        case 'HapticFeedback':
          return await _hapticFeedback(method, args);
        case 'NativeBiometric':
          return await _biometric(method, args);
        case 'LocalNotifications':
          return await _localNotifications(method, args);
        case 'App':
          return await _app(method, args);
        case 'WindowBackground':
          await _channel.invokeMethod('setWindowBackground', {'color': args['color']});
          return {'color': args['color']};
      }
      return _error('UNIMPLEMENTED', '$plugin.$method is not implemented');
    } on PlatformException catch (e) {
      return _error(e.code, e.message ?? 'Native call failed');
    } catch (e) {
      debugPrint('[bridge] $plugin.$method failed: $e');
      return _error('FAILED', '$e');
    }
  }

  // ---- SaveFile -----------------------------------------------------------
  Future<dynamic> _saveFile(String method, Map<String, dynamic> a) async {
    if (method == 'saveToDownloads') {
      final res = await _channel.invokeMapMethod<String, dynamic>('saveToDownloads', {
        'filename': a['filename'],
        'mime': a['mime'] ?? 'application/octet-stream',
        'data': a['data'],
      });
      return res ?? <String, dynamic>{};
    }
    if (method == 'openFile') {
      await _channel.invokeMethod('openFile', {'uri': a['uri'], 'mime': a['mime'] ?? '*/*'});
      return <String, dynamic>{};
    }
    return _error('UNIMPLEMENTED', 'SaveFile.$method');
  }

  // ---- DirectShare (WhatsApp) --------------------------------------------
  Future<dynamic> _directShare(String method, Map<String, dynamic> a) async {
    final phone = (a['phone'] ?? '').toString().replaceAll(RegExp(r'[^0-9]'), '');
    final text = (a['text'] ?? '').toString();
    if (method == 'openChat' || method == 'sendText') {
      final query = text.isNotEmpty ? '&text=${Uri.encodeComponent(text)}' : '';
      final native = Uri.parse(phone.isEmpty ? 'whatsapp://send?${query.isEmpty ? '' : query.substring(1)}' : 'whatsapp://send?phone=$phone$query');
      if (await canLaunchUrl(native)) {
        await launchUrl(native, mode: LaunchMode.externalApplication);
        return <String, dynamic>{};
      }
      return _error('NOT_INSTALLED', 'WhatsApp is not installed');
    }
    return _error('UNAVAILABLE', 'Direct sharing is not available');
  }

  // ---- Share / Filesystem -------------------------------------------------
  String _toPath(String uri) => uri.startsWith('file://') ? Uri.parse(uri).toFilePath() : uri;

  Future<dynamic> _share(Map<String, dynamic> a) async {
    final files = (a['files'] as List?)?.map((e) => XFile(_toPath('$e'))).toList() ?? <XFile>[];
    final text = [a['text'], a['url']].where((e) => e != null && '$e'.isNotEmpty).join('\n');
    if (files.isNotEmpty) {
      await Share.shareXFiles(files, text: text.isEmpty ? null : text, subject: a['title'] as String?);
    } else {
      await Share.share(text.isEmpty ? '${a['title'] ?? ''}' : text, subject: a['title'] as String?);
    }
    return <String, dynamic>{};
  }

  Future<Directory?> _dir(String? name) async {
    switch (name) {
      case 'CACHE':
        return getTemporaryDirectory();
      case 'DATA':
      case 'DOCUMENTS':
        return getApplicationDocumentsDirectory();
      case 'EXTERNAL':
        return getExternalStorageDirectory();
    }
    return getApplicationDocumentsDirectory();
  }

  Future<dynamic> _filesystem(String method, Map<String, dynamic> a) async {
    final root = await _dir(a['directory'] as String?);
    if (root == null) return _error('UNAVAILABLE', 'Directory unavailable');
    final path = (a['path'] ?? '').toString();
    final target = path.isEmpty ? root.path : '${root.path}/$path';
    switch (method) {
      case 'writeFile':
        final file = File(target);
        await file.parent.create(recursive: true);
        await file.writeAsBytes(base64Decode('${a['data'] ?? ''}'));
        return {'uri': Uri.file(file.path).toString()};
      case 'readdir':
        final d = Directory(target);
        if (!await d.exists()) return {'files': <dynamic>[]};
        final names = await d.list().map((e) => {'name': e.uri.pathSegments.where((s) => s.isNotEmpty).last}).toList();
        return {'files': names};
      case 'rmdir':
        final d = Directory(target);
        if (await d.exists()) await d.delete(recursive: a['recursive'] == true);
        return <String, dynamic>{};
      case 'deleteFile':
        final f = File(target);
        if (await f.exists()) await f.delete();
        return <String, dynamic>{};
    }
    return _error('UNIMPLEMENTED', 'Filesystem.$method');
  }

  // ---- Haptics ------------------------------------------------------------
  Future<dynamic> _haptics(String method, Map<String, dynamic> a) async {
    switch (method) {
      case 'impact':
        final s = '${a['style'] ?? 'MEDIUM'}'.toUpperCase();
        if (s == 'LIGHT') {
          await HapticFeedback.lightImpact();
        } else if (s == 'HEAVY') {
          await HapticFeedback.heavyImpact();
        } else {
          await HapticFeedback.mediumImpact();
        }
        break;
      case 'selectionChanged':
      case 'selectionStart':
        await HapticFeedback.selectionClick();
        break;
      case 'selectionEnd':
        break;
      case 'notification':
      case 'vibrate':
        await HapticFeedback.vibrate();
        break;
    }
    return <String, dynamic>{};
  }

  Future<dynamic> _hapticFeedback(String method, Map<String, dynamic> a) async {
    if (method == 'describe') return {'hasVibrator': true, 'touchFeedback': true};
    if (method != 'perform') return _error('UNIMPLEMENTED', 'HapticFeedback.$method');
    final kind = '${a['kind'] ?? 'tap'}';
    if (kind == 'heavy' || kind == 'strong') {
      await HapticFeedback.heavyImpact();
    } else if (kind == 'light') {
      await HapticFeedback.lightImpact();
    } else {
      await HapticFeedback.mediumImpact();
    }
    return {'touchVibration': true};
  }

  // ---- Biometrics ---------------------------------------------------------
  Future<dynamic> _biometric(String method, Map<String, dynamic> a) async {
    if (method == 'isAvailable') {
      final supported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      return {'isAvailable': supported && canCheck, 'deviceIsSecure': supported};
    }
    if (method == 'verifyIdentity') {
      try {
        final ok = await _auth.authenticate(
          localizedReason: '${a['reason'] ?? 'Confirm your identity'}',
          options: const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
        );
        if (!ok) return _error('13', 'Authentication cancelled');
        return <String, dynamic>{};
      } on PlatformException catch (e) {
        const codes = {
          'NotAvailable': '1',
          'LockedOut': '2',
          'NotEnrolled': '3',
          'PermanentlyLockedOut': '4',
          'PasscodeNotSet': '14',
        };
        return _error(codes[e.code] ?? '13', e.message ?? 'Biometric authentication failed.');
      }
    }
    return _error('UNIMPLEMENTED', 'NativeBiometric.$method');
  }

  // ---- Local notifications ------------------------------------------------
  AndroidFlutterLocalNotificationsPlugin? get _androidNotifications =>
      _notifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  Future<dynamic> _localNotifications(String method, Map<String, dynamic> a) async {
    switch (method) {
      case 'checkPermissions':
        final on = await _androidNotifications?.areNotificationsEnabled() ?? true;
        return {'display': on ? 'granted' : 'prompt'};
      case 'requestPermissions':
        final on = await _androidNotifications?.requestNotificationsPermission() ?? true;
        return {'display': on ? 'granted' : 'denied'};
      case 'schedule':
        for (final n in (a['notifications'] as List? ?? const [])) {
          final m = Map<String, dynamic>.from(n as Map);
          final body = '${m['body'] ?? ''}';
          await _notifications.show(
            (m['id'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch ~/ 1000,
            '${m['title'] ?? ''}',
            body,
            NotificationDetails(
              android: AndroidNotificationDetails(
                'sarim_default',
                'General',
                importance: Importance.high,
                priority: Priority.high,
                styleInformation: BigTextStyleInformation(body),
              ),
            ),
            payload: jsonEncode(m['extra']),
          );
        }
        return <String, dynamic>{};
    }
    return _error('UNIMPLEMENTED', 'LocalNotifications.$method');
  }

  // ---- App ----------------------------------------------------------------
  Future<dynamic> _app(String method, Map<String, dynamic> a) async {
    if (method == 'exitApp') {
      await SystemNavigator.pop();
      return <String, dynamic>{};
    }
    if (method == 'openUrl') {
      final ok = await launchUrl(Uri.parse('${a['url']}'), mode: LaunchMode.externalApplication);
      return {'completed': ok};
    }
    return _error('UNIMPLEMENTED', 'App.$method');
  }
}
