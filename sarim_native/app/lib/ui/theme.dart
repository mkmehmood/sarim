import 'package:flutter/material.dart';

/// Design tokens ported from the web app's app.css (dark theme).
class SarimColors {
  static const bg = Color(0xFF000000);
  static const surface = Color(0xFF000000);
  static const surface2 = Color(0xFF0A0A0A);
  static const text = Color(0xFFFFFFFF);
  static const accent = Color(0xFF4ADE80);
  static const gold = Color(0xFFFBBF24);
  static const danger = Color(0xFFF87171);
  static const warning = Color(0xFFFBBF24);
  static const cyan = Color(0xFF67E8F9);
  static const purple = Color(0xFFC084FC);
  static const border = Color(0x1FFFFFFF);
}

ThemeData sarimTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: SarimColors.accent,
    brightness: Brightness.dark,
  ).copyWith(
    primary: SarimColors.accent,
    secondary: SarimColors.gold,
    surface: SarimColors.surface,
    error: SarimColors.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: SarimColors.bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: SarimColors.bg,
      foregroundColor: SarimColors.text,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      color: SarimColors.surface2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: SarimColors.border),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: SarimColors.surface2,
      indicatorColor: Color(0x294ADE80),
    ),
    drawerTheme: const DrawerThemeData(backgroundColor: SarimColors.surface2),
  );
}
