import 'dart:async';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'splash_quotes.dart';
import 'tokens.dart';

/// Time-of-day look of the splash (web `render()` in index.html): glow colours, sun/moon colour,
/// day or night dial and how far along the arc the sun/moon sits.
class SplashLook {
  const SplashLook(this.g1, this.g2, this.dot, this.isDay, this.f);
  final Color g1, g2, dot;
  final bool isDay;
  final double f;

  static SplashLook of(DateTime now) {
    final h = now.hour + now.minute / 60;
    final isDay = h >= 6 && h < 18;
    final f = isDay ? (h - 6) / 12 : ((h - 18 + 24) % 24) / 12;
    // [g1, g2, dot] per period, from the P table in the web script.
    if (h < 5) return SplashLook(const Color(0x4D6366F1), const Color(0x1F10B981), const Color(0xFFE2E8F0), isDay, f); // night
    if (h < 8) return SplashLook(const Color(0x57FBBF24), const Color(0x2910B981), const Color(0xFFF59E0B), isDay, f); // dawn
    if (h < 16) return SplashLook(const Color(0x4210B981), const Color(0x240891B2), const Color(0xFFF59E0B), isDay, f); // day
    if (h < 18) return SplashLook(const Color(0x52FB923C), const Color(0x290891B2), const Color(0xFFF97316), isDay, f); // dusk
    return SplashLook(const Color(0x4D6366F1), const Color(0x1F10B981), const Color(0xFFE2E8F0), isDay, f); // night
  }
}

String splashGreeting(DateTime now) {
  final h = now.hour + now.minute / 60;
  return h < 5 ? 'Early hours' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

String splashClockText(DateTime now) => '${((now.hour + 11) % 12) + 1}:${now.minute.toString().padLeft(2, '0')}';

String splashDateText(DateTime now) {
  const d = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return '${d[now.weekday - 1]} \u00b7 ${now.day} ${m[now.month - 1]}';
}

/// Full-screen splash. Stays for [hold], fades for 550 ms, and gives up waiting for [ready] after [maxWait]
/// (web: HOLD 2800, FADE 550, MAXW 9000).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.ready, required this.onDone, this.hold = const Duration(milliseconds: 2800), this.maxWait = const Duration(milliseconds: 9000), this.now});
  final Future<void> ready;
  final VoidCallback onDone;
  final Duration hold, maxWait;
  final DateTime? now; // fixed time for tests

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _fade = AnimationController(vsync: this, duration: const Duration(milliseconds: 550), value: 1);
  late final AnimationController _blink = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);
  late final (String, String) _quote = splashQuotes[Random().nextInt(splashQuotes.length)];
  Timer? _clock;
  late DateTime _now = widget.now ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    if (widget.now == null) _clock = Timer.periodic(const Duration(seconds: 30), (_) => setState(() => _now = DateTime.now()));
    final held = Future.wait([Future<void>.delayed(widget.hold), widget.ready]);
    Future.any([held, Future<void>.delayed(widget.maxWait)]).then((_) => _dismiss());
  }

  Future<void> _dismiss() async {
    if (!mounted) return;
    await _fade.reverse();
    if (mounted) widget.onDone();
  }

  @override
  void dispose() {
    _clock?.cancel();
    _fade.dispose();
    _blink.dispose();
    super.dispose();
  }

  static TextStyle _ui(double size, {FontWeight w = FontWeight.w400, double ls = 0, Color color = T.textMain}) =>
      TextStyle(fontFamily: T.fontUi, fontFamilyFallback: T.fontUiFallback, fontSize: size, fontWeight: w, letterSpacing: ls * size, color: color, height: 1.2);

  static TextStyle _brand(double size, {FontWeight w = FontWeight.w600, double ls = 0, Color color = T.textStrong, double? height}) =>
      TextStyle(fontFamily: T.fontBrand, fontFamilyFallback: T.fontBrandFallback, fontSize: size, fontWeight: w, letterSpacing: ls * size, color: color, height: height);

  @override
  Widget build(BuildContext context) {
    final look = SplashLook.of(_now);
    final mq = MediaQuery.of(context);
    final w = mq.size.width;
    final dialW = min(352.0, w * .92);
    final dialH = dialW * 160 / 300;
    final glow = min(520.0, w * 1.3);
    final timeParts = splashClockText(_now);
    return FadeTransition(
      opacity: _fade,
      child: Material(
        color: T.bg,
        child: Stack(children: [
          // .splash-glow: blurred radial gradient, centred and nudged up 64%.
          Positioned(
            left: w / 2 - glow / 2,
            top: mq.size.height / 2 - glow * .64,
            width: glow,
            height: glow,
            child: ImageFiltered(
              imageFilter: ui.ImageFilter.blur(sigmaX: 30, sigmaY: 30),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(center: const Alignment(0, -.16), radius: .68, colors: [look.g1, look.g2, const Color(0x00000000)], stops: const [0, .38 / .68, 1]),
                ),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(max(24, mq.padding.left), mq.padding.top + 24, max(24, mq.padding.right), mq.padding.bottom + 72),
            child: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                SizedBox(
                  width: dialW,
                  height: dialH,
                  child: Stack(clipBehavior: Clip.none, children: [
                    Positioned.fill(child: CustomPaint(painter: DialPainter(look))),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 2,
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(splashGreeting(_now).toUpperCase(), style: _ui(10.24, w: FontWeight.w700, ls: .26, color: T.success)),
                        const SizedBox(height: 4),
                        Text.rich(
                          TextSpan(children: [
                            TextSpan(text: timeParts),
                            WidgetSpan(alignment: PlaceholderAlignment.baseline, baseline: TextBaseline.alphabetic, child: Padding(
                              padding: const EdgeInsets.only(left: 6),
                              child: Text(_now.hour < 12 ? 'AM' : 'PM', style: _ui(14.4, w: FontWeight.w600, ls: .14, color: T.textMain).copyWith(fontFamily: T.fontBrand)),
                            )),
                          ]),
                          style: _brand(49.6, ls: .02, height: 1.05),
                        ),
                        const SizedBox(height: 6),
                        Text(splashDateText(_now).toUpperCase(), style: _ui(11.2, w: FontWeight.w600, ls: .16)),
                      ]),
                    ),
                  ]),
                ),
                const SizedBox(height: 46),
                Text('GULL AND ZUBAIR', textAlign: TextAlign.center, style: _brand(24, ls: .1)),
                const SizedBox(height: 8),
                Text('NASWAR DEALERS', textAlign: TextAlign.center, style: _ui(11.2, w: FontWeight.w700, ls: .34, color: T.success)),
                // .splash-rule
                const SizedBox(height: 24),
                SizedBox(
                  width: 150,
                  height: 6,
                  child: Stack(alignment: Alignment.center, children: [
                    Container(height: 1, decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.transparent, Colors.white.withOpacity(.3), Colors.transparent]))),
                    Container(width: 6, height: 6, decoration: BoxDecoration(color: T.success, shape: BoxShape.circle, boxShadow: [BoxShadow(color: T.accent.withOpacity(.16), spreadRadius: 5)])),
                  ]),
                ),
                const SizedBox(height: 22),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: min(320, w * .86)),
                  child: Text('"${_quote.$1}"', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'PlayfairDisplay', fontFamilyFallback: const ['Georgia'], fontStyle: FontStyle.italic, fontWeight: FontWeight.w500, fontSize: 18.24, height: 1.55, color: T.textMain)),
                ),
                const SizedBox(height: 12),
                Text('\u2014 ${_quote.$2}'.toUpperCase(), textAlign: TextAlign.center, style: _ui(10.88, w: FontWeight.w700, ls: .16)),
              ]),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: mq.padding.bottom + 36,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              FadeTransition(opacity: Tween(begin: 1.0, end: .35).animate(_blink), child: Container(width: 6, height: 6, decoration: const BoxDecoration(color: T.success, shape: BoxShape.circle))),
              const SizedBox(width: 10),
              Text('PREPARING YOUR DAY', style: _ui(9.92, w: FontWeight.w700, ls: .24)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// The dial SVG (viewBox 300x160): dotted track, 13 ticks, progress arc, 06/18 labels, sun or moon.
class DialPainter extends CustomPainter {
  DialPainter(this.look);
  final SplashLook look;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 300;
    canvas.save();
    canvas.scale(s);
    const c = Offset(150, 150);
    const r = 124.0;
    final track = Colors.white.withOpacity(.3);

    // ticks: k = 0..12, long at 0/6/12
    for (var k = 0; k <= 12; k++) {
      final an = pi * k / 12;
      final lg = k % 6 == 0;
      final r1 = lg ? 130.0 : 131.0, r2 = lg ? 141.0 : 136.0;
      canvas.drawLine(Offset(150 - r1 * cos(an), 150 - r1 * sin(an)), Offset(150 - r2 * cos(an), 150 - r2 * sin(an)),
          Paint()..color = track..strokeWidth = lg ? 1.8 : 1..strokeCap = StrokeCap.round);
    }
    // dotted track: dash 0.45 gap 1.35 of pathLength 100 (half circumference = pi*r)
    final unit = pi * r / 100;
    final dot = Paint()..color = track..strokeWidth = 1.4..style = PaintingStyle.stroke;
    final rect = Rect.fromCircle(center: c, radius: r);
    for (var u = 0.0; u < 100; u += 1.8) {
      canvas.drawArc(rect, pi + u * unit / r, .45 * unit / r, false, dot);
    }
    // progress arc
    final f = look.f.clamp(0.0, 1.0);
    if (f > 0) {
      canvas.drawArc(rect, pi, pi * f, false, Paint()..color = T.success..style = PaintingStyle.stroke..strokeWidth = 3..strokeCap = StrokeCap.round);
    }
    // labels
    void label(String t, double x) {
      final tp = TextPainter(
        text: TextSpan(text: t, style: TextStyle(fontFamily: T.fontUi, fontSize: 7.5, fontWeight: FontWeight.w700, letterSpacing: 1.5, color: T.textMain)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x - tp.width / 2, 158 - tp.height * .8));
    }
    label(look.isDay ? '06' : '18', 26);
    label(look.isDay ? '18' : '06', 274);
    // sun / moon at (150-124cos(pi f), 150-124 sin(pi f))
    final p = Offset(150 - r * cos(pi * f), 150 - r * sin(pi * f));
    canvas.drawCircle(p, 22, Paint()..shader = ui.Gradient.radial(p, 22, [look.dot.withOpacity(.55), look.dot.withOpacity(0)]));
    if (look.isDay) {
      canvas.drawCircle(p, 9.5, Paint()..color = look.dot);
      canvas.drawCircle(p, 9.5, Paint()..color = T.bg..style = PaintingStyle.stroke..strokeWidth = 2.5);
    } else {
      canvas.saveLayer(Rect.fromCircle(center: p, radius: 20), Paint());
      canvas.drawCircle(p, 9.5, Paint()..color = const Color(0xFFE2E8F0));
      canvas.drawCircle(p + const Offset(4, -3), 7.5, Paint()..blendMode = BlendMode.clear);
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(DialPainter old) => old.look.f != look.f || old.look.isDay != look.isDay || old.look.dot != look.dot;
}
