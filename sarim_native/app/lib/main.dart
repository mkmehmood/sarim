import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sarim_core/sarim_core.dart';

import 'app_state.dart';
import 'firebase_config.dart';
import 'screens/customers_screen.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final dir = await getApplicationDocumentsDirectory();
  final app = AppState(JsonFileStore('${dir.path}/sarim'), firebaseConfig);
  await app.init();
  runApp(SarimApp(app: app));
}

class SarimApp extends StatelessWidget {
  const SarimApp({super.key, required this.app});
  final AppState app;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gull & Zubair',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3B82F6), brightness: Brightness.dark),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
      ),
      home: ListenableBuilder(
        listenable: app,
        builder: (context, _) => app.signedIn ? CustomersScreen(app: app) : LoginScreen(app: app),
      ),
    );
  }
}
