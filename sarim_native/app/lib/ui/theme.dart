import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData sarimTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: T.accent, brightness: Brightness.dark).copyWith(
    primary: T.accent,
    secondary: T.accentGold,
    surface: T.surface,
    error: T.danger,
  );
  final base = ThemeData(brightness: Brightness.dark, useMaterial3: true, colorScheme: scheme);
  return base.copyWith(
    scaffoldBackgroundColor: T.bg,
    textTheme: base.textTheme.apply(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, bodyColor: T.textMain, displayColor: T.textMain),
    appBarTheme: const AppBarTheme(backgroundColor: T.bg, foregroundColor: T.textMain, elevation: 0),
    cardTheme: CardThemeData(color: T.surface2, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: Colors.white.withOpacity(.12)))),
    drawerTheme: const DrawerThemeData(backgroundColor: T.surface2),
  );
}
