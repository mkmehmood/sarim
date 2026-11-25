import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'tokens.dart';

/// One tappable row in the sidebar (`.sidebar-item`): pill shape, uppercase label, tinted when active.
class SidebarItem extends StatelessWidget {
  const SidebarItem({super.key, required this.icon, required this.label, required this.onTap, this.active = false, this.danger = false, this.badge});
  final String icon; // asset name in assets/icons without extension
  final String label;
  final VoidCallback onTap;
  final bool active, danger;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final rem = context.rem;
    final color = danger ? T.danger : (active ? T.accent : T.textMain);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Material(
        color: active ? T.accentMint.withOpacity(.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            child: Row(children: [
              SvgPicture.asset('assets/icons/$icon.svg', width: 16, height: 16, theme: SvgTheme(currentColor: color)),
              const SizedBox(width: 12),
              Flexible(
                child: Text(label.toUpperCase(), overflow: TextOverflow.ellipsis, style: TextStyle(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, fontSize: .78 * rem, fontWeight: FontWeight.w600, letterSpacing: .05 * .78 * rem, color: color)),
              ),
              if (badge != null && badge! > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(color: T.danger, borderRadius: BorderRadius.circular(999)),
                  child: Text('$badge', style: TextStyle(fontSize: .62 * rem, fontWeight: FontWeight.w800, color: Colors.black)),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

class SidebarLabel extends StatelessWidget {
  const SidebarLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(6, 12, 6, 6),
        child: Text(text.toUpperCase(), style: TextStyle(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, fontSize: .58 * context.rem, fontWeight: FontWeight.w800, letterSpacing: .1 * .58 * context.rem, color: T.textMain)),
      );
}

class SidebarDivider extends StatelessWidget {
  const SidebarDivider({super.key});
  @override
  Widget build(BuildContext context) => Container(height: 1, margin: const EdgeInsets.symmetric(vertical: 6), color: G.border);
}

/// The sliding panel with its blurred backdrop (`#sidebar-backdrop` + `#app-sidebar`).
class SidebarPanel extends StatelessWidget {
  const SidebarPanel({super.key, required this.open, required this.onClose, required this.scroll, required this.footer});
  final bool open;
  final VoidCallback onClose;
  final List<Widget> scroll;
  final List<Widget> footer;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final width = mq.size.width <= 449 ? (mq.size.width * .85 < 288 ? mq.size.width * .85 : 288.0) : 288.0;
    return Stack(children: [
      IgnorePointer(
        ignoring: !open,
        child: GestureDetector(
          onTap: onClose,
          behavior: HitTestBehavior.opaque,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 220),
            opacity: open ? 1 : 0,
            child: BackdropFilter(
              filter: ui.ImageFilter.blur(sigmaX: 6, sigmaY: 6),
              child: Container(color: Colors.black.withOpacity(.55)),
            ),
          ),
        ),
      ),
      AnimatedPositioned(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
        top: 0,
        bottom: 0,
        left: open ? 0 : -width - 40,
        width: width,
        child: Container(
          padding: EdgeInsets.only(top: mq.padding.top),
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.horizontal(right: Radius.circular(24)),
            border: Border(right: BorderSide(color: G.border)),
            boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(.5), blurRadius: 14, offset: const Offset(0, 4)),
              BoxShadow(color: T.accentCyan.withOpacity(.38), blurRadius: 42, offset: const Offset(0, 20), spreadRadius: -14),
            ],
            // --soft-card: cyan glow top-left over a black-to-faint-cyan vertical gradient
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black, Color.alphaBlend(T.accentCyan.withOpacity(.04), T.surface2)]),
          ),
          child: Stack(children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: const BorderRadius.horizontal(right: Radius.circular(24)),
                  gradient: RadialGradient(center: Alignment.topLeft, radius: 1.3, colors: [T.accentCyan.withOpacity(G.glowPct), Colors.transparent], stops: const [0, .62]),
                ),
              ),
            ),
            Column(children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: G.border))),
                child: Text('GULL AND ZUBAIR', style: TextStyle(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, fontSize: .72 * context.rem, fontWeight: FontWeight.w800, letterSpacing: .08 * .72 * context.rem, color: T.accent)),
              ),
              Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(10, 10, 10, 24), children: scroll)),
              Container(
                padding: EdgeInsets.fromLTRB(10, 6, 10, 10 + mq.padding.bottom),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: G.border))),
                child: Column(mainAxisSize: MainAxisSize.min, children: footer),
              ),
            ]),
          ]),
        ),
      ),
    ]);
  }
}
