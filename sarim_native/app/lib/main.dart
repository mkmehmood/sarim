import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sarim_core/sarim_core.dart';

import 'app_state.dart';
import 'firebase_config.dart';
import 'ui/app_shell.dart';
import 'ui/login_screen.dart';
import 'ui/splash_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final dir = await getApplicationDocumentsDirectory();
  final app = AppState(JsonFileStore('${dir.path}/sarim'), firebaseConfig);
  await app.init();
  runApp(SarimApp(app: app));
}

class SarimApp extends StatefulWidget {
  const SarimApp({super.key, required this.app, this.showSplash = true});
  final AppState app;
  final bool showSplash;

  @override
  State<SarimApp> createState() => _SarimAppState();
}

class _SarimAppState extends State<SarimApp> {
  late bool _splashDone = !widget.showSplash;
  AppState get app => widget.app;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gull & Zubair',
      debugShowCheckedModeBanner: false,
      theme: sarimTheme(),
      home: !_splashDone
          ? SplashScreen(ready: Future<void>.value(), onDone: () => setState(() => _splashDone = true))
          : ListenableBuilder(
              listenable: app,
              builder: (context, _) => app.signedIn ? AppShell(key: ValueKey(app.session?.uid), app: app) : LoginScreen(app: app),
            ),
    );
  }
}
