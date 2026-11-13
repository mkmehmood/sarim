import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import 'native_bridge.dart';

const int kPort = 8765;
const String kOrigin = 'http://localhost:$kPort';
const Color kBackground = Color(0xFF0F172A);

final InAppLocalhostServer localhostServer =
    InAppLocalhostServer(documentRoot: 'assets/www', port: kPort);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await localhostServer.start();
  runApp(const SarimApp());
}

class SarimApp extends StatelessWidget {
  const SarimApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gull & Zubair',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true).copyWith(scaffoldBackgroundColor: kBackground),
      home: const WebHost(),
    );
  }
}

class WebHost extends StatefulWidget {
  const WebHost({super.key});

  @override
  State<WebHost> createState() => _WebHostState();
}

class _WebHostState extends State<WebHost> {
  InAppWebViewController? _controller;
  late final NativeBridge _bridge;
  String _shim = '';
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _bridge = NativeBridge(onEmit: _emit);
    _init();
  }

  Future<void> _init() async {
    final shim = await rootBundle.loadString('assets/bridge/capacitor_shim.js');
    await _bridge.init();
    if (mounted) setState(() { _shim = shim; _loaded = true; });
  }

  void _emit(String plugin, String event, Object? payload) {
    final c = _controller;
    if (c == null) return;
    final json = _bridge.encode(payload);
    c.evaluateJavascript(source: "window.__flutterEmit && window.__flutterEmit('$plugin','$event',$json);");
  }

  Future<void> _onBack() async {
    final c = _controller;
    if (c == null) return;
    final handled = await c.evaluateJavascript(source: 'window.__flutterBack ? window.__flutterBack() : false');
    if (handled != true) {
      if (await c.canGoBack()) {
        await c.goBack();
      } else {
        SystemNavigator.pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const Scaffold(backgroundColor: kBackground);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) { if (!didPop) _onBack(); },
      child: Scaffold(
        backgroundColor: kBackground,
        body: SafeArea(
          bottom: false,
          child: InAppWebView(
            initialUrlRequest: URLRequest(url: WebUri('$kOrigin/index.html')),
            initialUserScripts: UnmodifiableListView<UserScript>([
              UserScript(source: _shim, injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START),
            ]),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: true,
              domStorageEnabled: true,
              databaseEnabled: true,
              mediaPlaybackRequiresUserGesture: false,
              allowsInlineMediaPlayback: true,
              supportZoom: false,
              useHybridComposition: true,
              geolocationEnabled: true,
              thirdPartyCookiesEnabled: true,
              mixedContentMode: MixedContentMode.MIXED_CONTENT_NEVER_ALLOW,
              transparentBackground: false,
              isInspectable: false,
            ),
            onWebViewCreated: (controller) {
              _controller = controller;
              controller.addJavaScriptHandler(
                handlerName: 'native',
                callback: (args) => _bridge.handle(
                  args.isNotEmpty ? '${args[0]}' : '',
                  args.length > 1 ? '${args[1]}' : '',
                  args.length > 2 && args[2] is Map ? Map<String, dynamic>.from(args[2] as Map) : <String, dynamic>{},
                ),
              );
            },
            onPermissionRequest: (controller, request) async {
              final wanted = <Permission>[];
              if (request.resources.contains(PermissionResourceType.CAMERA)) wanted.add(Permission.camera);
              if (request.resources.contains(PermissionResourceType.MICROPHONE)) wanted.add(Permission.microphone);
              var ok = true;
              for (final p in wanted) {
                if (!(await p.request()).isGranted) ok = false;
              }
              return PermissionResponse(
                resources: request.resources,
                action: ok ? PermissionResponseAction.GRANT : PermissionResponseAction.DENY,
              );
            },
            onGeolocationPermissionsShowPrompt: (controller, origin) async {
              final granted = (await Permission.locationWhenInUse.request()).isGranted;
              return GeolocationPermissionShowPromptResponse(origin: origin, allow: granted, retain: granted);
            },
            shouldOverrideUrlLoading: (controller, action) async {
              final uri = action.request.url;
              if (uri == null) return NavigationActionPolicy.ALLOW;
              final isApp = (uri.scheme == 'http' || uri.scheme == 'https') && uri.host == 'localhost' && uri.port == kPort;
              if (isApp || uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data') {
                return NavigationActionPolicy.ALLOW;
              }
              try { await launchUrl(Uri.parse(uri.toString()), mode: LaunchMode.externalApplication); } catch (_) {}
              return NavigationActionPolicy.CANCEL;
            },
            onConsoleMessage: (controller, msg) => debugPrint('[web] ${msg.message}'),
          ),
        ),
      ),
    );
  }
}
