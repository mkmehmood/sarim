import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import 'tokens.dart';

/// A full-screen page (`.standalone-screen`). `build` is filled in as each screen is ported.
class StandaloneDef {
  const StandaloneDef(this.id, this.title, {this.build});
  final String id; // web element id, e.g. 'daily-ledger-screen'
  final String title;
  final Widget Function(BuildContext context, AppState app)? build;
}

/// Registry of standalone screens. Ids match the web `openStandaloneScreen(id)` calls.
final Map<String, StandaloneDef> standaloneScreens = {
  for (final d in <StandaloneDef>[
    const StandaloneDef('approvals-screen', 'Approvals'),
    const StandaloneDef('daily-ledger-screen', 'Daily Ledger'),
    const StandaloneDef('stock-transfer-screen', 'Stock Transfer'),
    const StandaloneDef('payment-transfer-screen', 'Payment Transfer'),
    const StandaloneDef('add-entity-screen', 'Add Entity'),
    const StandaloneDef('raw-material-screen', 'Add Raw Materials'),
    const StandaloneDef('formula-store-screen', 'Formula Store'),
    const StandaloneDef('settings-screen', 'Settings'),
  ])
    d.id: d,
};

/// `openStandaloneScreen(id)`: refuses with the web's toast text when the role may not open it, otherwise
/// slides the page up from the bottom (screenSlideIn 0.34s / screenSlideOut 0.22s).
Future<void> openStandaloneScreen(BuildContext context, AppState app, String id) async {
  final def = standaloneScreens[id];
  if (def == null) return;
  if (!isScreenAllowed(id, app.roleSession.mode, sessionTabs: app.roleSession.tabs)) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Access Denied \u2014 not available for your role'), duration: Duration(seconds: 3)));
    return;
  }
  await Navigator.of(context).push(PageRouteBuilder<void>(
    settings: RouteSettings(name: id),
    transitionDuration: const Duration(milliseconds: 340),
    reverseTransitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (_, __, ___) => StandalonePage(def: def, app: app),
    transitionsBuilder: (_, anim, __, child) {
      final curved = CurvedAnimation(parent: anim, curve: const Cubic(.22, 1, .36, 1), reverseCurve: const Cubic(.4, 0, .8, .6));
      return SlideTransition(
        position: Tween(begin: const Offset(0, 1), end: Offset.zero).animate(curved),
        child: FadeTransition(opacity: Tween(begin: .6, end: 1.0).animate(curved), child: child),
      );
    },
  ));
}

/// `.shell-bar.screen-topbar`: back button, uppercase title.
class ScreenTopBar extends StatelessWidget {
  const ScreenTopBar({super.key, required this.title, this.actions = const []});
  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final narrow = mq.size.width <= 449;
    return Container(
      constraints: const BoxConstraints(minHeight: 52),
      padding: EdgeInsets.fromLTRB(narrow ? 12 : 14, 10 + mq.padding.top, narrow ? 12 : 14, 10),
      decoration: shellBarDecoration(),
      child: Row(children: [
        SizedBox(
          width: 36,
          height: 36,
          child: IconButton(
            tooltip: 'Back',
            padding: EdgeInsets.zero,
            onPressed: () => Navigator.of(context).maybePop(),
            icon: CustomPaint(size: const Size(22, 22), painter: _ChevronPainter(T.textMain)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(title.toUpperCase(), style: TextStyle(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, fontSize: (narrow ? .88 : .9) * context.rem, fontWeight: FontWeight.w800, letterSpacing: .04 * .9 * context.rem, color: T.textMain)),
        ),
        ...actions,
      ]),
    );
  }
}

/// `.shell-bar`: vertical gradient, bottom border, 22px bottom corners and the cyan header shadow.
BoxDecoration shellBarDecoration() => BoxDecoration(
      gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [T.bg, Color.alphaBlend(T.accentCyan.withOpacity(.04), T.surface2)]),
      border: Border(bottom: BorderSide(color: G.border)),
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(22)),
      boxShadow: [
        BoxShadow(color: T.accentCyan.withOpacity(.38), blurRadius: 28, offset: const Offset(0, 10), spreadRadius: -12),
        BoxShadow(color: Colors.black.withOpacity(.55), blurRadius: 10, offset: const Offset(0, 2)),
      ],
    );

class _ChevronPainter extends CustomPainter {
  _ChevronPainter(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    final p = Path()..moveTo(15 * s, 5 * s)..lineTo(8 * s, 12 * s)..lineTo(15 * s, 19 * s);
    canvas.drawPath(p, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 2.4 * s..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_ChevronPainter old) => old.color != color;
}

class StandalonePage extends StatelessWidget {
  const StandalonePage({super.key, required this.def, required this.app});
  final StandaloneDef def;
  final AppState app;

  @override
  Widget build(BuildContext context) {
    final b = def.build;
    if (b != null) return b(context, app);
    return Scaffold(
      body: Column(children: [
        ScreenTopBar(title: def.title),
        Expanded(child: Center(child: Text('${def.title} is being ported from the web app', style: const TextStyle(color: T.textMain)))),
      ]),
    );
  }
}
