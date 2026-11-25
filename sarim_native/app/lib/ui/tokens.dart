import 'package:flutter/material.dart';

/// Design tokens copied from the web app's `app.css` (dark theme `:root`).
/// Names follow the CSS custom properties so screens can be compared line by line.
class T {
  // surfaces
  static const bg = Color(0xFF000000);
  static const surface = Color(0xFF000000);
  static const surface2 = Color(0xFF0A0A0A);
  // text
  static const textMain = Color(0xFFFFFFFF);
  static const textStrong = Color(0xFFFFFFFF);
  // accents
  static const accent = Color(0xFF4ADE80);
  static const accentGold = Color(0xFFFBBF24);
  static const accentCyan = Color(0xFF67E8F9);
  static const accentPurple = Color(0xFFC084FC);
  static const accentMint = Color(0xFF1DE9B6);
  static const accentLime = Color(0xFFA3E635);
  static const accentIndigo = Color(0xFF818CF8);
  static const accentBlue = Color(0xFF2563EB);
  static const accentTeal = Color(0xFF009688);
  static const accentPink = Color(0xFFEC4899);
  static const accentOrange = Color(0xFFFF9F0A);
  static const accentSky = Color(0xFF38BDF8);
  static const success = Color(0xFF4ADE80);
  static const warning = Color(0xFFFBBF24);
  static const danger = Color(0xFFF87171);
  static Color accentDim = const Color(0xFF4ADE80).withOpacity(.16);
  static Color dangerDim = const Color(0xFFF87171).withOpacity(.14);
  static Color warningDim = const Color(0xFFFBBF24).withOpacity(.14);
  // fonts (--font-brand / --font-ui)
  static const fontBrand = 'Cinzel';
  static const fontBrandFallback = ['PlayfairDisplay', 'Georgia'];
  static const fontUi = 'PlusJakartaSans';
  static const fontUiFallback = ['NotoNastaliqUrdu', 'Roboto'];
  static const fontMono = 'JetBrainsMono';
}

/// Glass / shell tokens (`--glass-border`, `--shadow-*`, `--soft-card`).
class G {
  static final border = Colors.white.withOpacity(.14);
  static final borderStrong = Colors.white.withOpacity(.26);
  static final glowPct = .26; // --glow-pct (dark)
}

/// The web app sets `html { font-size: clamp(11px, 3.12vw, 14px) }` below 450px wide, so every `rem`
/// size shrinks on phones. Multiply a CSS rem value by `rem(context)` to get logical pixels.
double remFor(double width) => width <= 449 ? (width * .0312).clamp(11.0, 14.0).toDouble() : 16.0;

/// `.auth-screen` custom properties (`--au-*`).
class Au {
  static const ink = Color(0xFFEEF6F1);
  static const muted = Color(0xFF93A79C);
  static const leaf = Color(0xFF4ADE80);
  static const fill = Color(0xFF0B110E);
  static const fillTop = Color(0xFF131C17);
  static final line = Colors.white.withOpacity(.14);
  static final lineHover = Colors.white.withOpacity(.28);
  static final ring = const Color(0xFF4ADE80).withOpacity(.26);
  static const error = Color(0xFFF87171);
  static final rim = Colors.white.withOpacity(.10);
  static const tileInk = Color(0xFF03170B);
  static const btnTop = Color(0xFF62E996);
  static const btnBot = Color(0xFF1FAE55);
  static const btnInk = Color(0xFF03170B);
  static final btnGlow = const Color(0xFF4ADE80).withOpacity(.45);
  static const altTop = Color(0xFF17221C);
  static const altBot = Color(0xFF0C120F);
  static const bgTop = Color(0xFF0A100D);
  static const bgBot = Color(0xFF000000);
  static final bgGlow = const Color(0xFF4ADE80).withOpacity(.20);
  static const sheetTop = Color(0xFF121B16);
  static const sheetBot = Color(0xFF060907);
}

extension RemX on BuildContext {
  /// Pixels per CSS `rem` at the current screen width.
  double get rem => remFor(MediaQuery.of(this).size.width);
}
