import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'theme.dart';

const _quotes = <List<String>>[
  ['The details are not the details. They make the design.', 'Charles Eames'],
  ['Price is what you pay. Value is what you get.', 'Warren Buffett'],
  ['What gets measured gets managed.', 'Peter Drucker'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
  ['Excellence is not an act but a habit.', 'Will Durant'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['Quality means doing it right when no one is looking.', 'Henry Ford'],
  ['Well begun is half done.', 'Aristotle'],
  ['A penny saved is a penny earned.', 'Benjamin Franklin'],
  ['Little by little, one travels far.', 'J.R.R. Tolkien'],
];

/// Time-of-day palette, same periods as the web splash (dawn/day/dusk/night).
({Color g1, Color g2, Color dot, bool isDay, double f}) splashPalette(DateTime now) {
  final h = now.hour + now.minute / 60;
  final isDay = h >= 6 && h < 18;
  final f = isDay ? (h - 6) / 12 : ((h - 18 + 24) % 24) / 12;
  if (h < 5) {
    return (g1: const Color(0x4D6366F1), g2: const Color(0x1F10B981), dot: const Color(0xFFE2E8F0), isDay: isDay, f: f);
  } else if (h < 8) {
    return (g1: const Color(0x57FBBF24), g2: const Color(0x2910B981), dot: const Color(0xFFF59E0B), isDay: isDay, f: f);
  } else if (h < 16) {
    return (g1: const Color(0x4210B981), g2: const Color(0x240891B2), dot: const Color(0xFFF59E0B), isDay: isDay, f: f);
  } else if (h < 18) {
    return (g1: const Color(0x52FB923C), g2: const Color(0x290891B2), dot: const Color(0xFFF97316), isDay: isDay, f: f);
  }
  return (g1: const Color(0x4D6366F1), g2: const Color(0x1F10B981), dot: const Color(0xFFE2E8F0), isDay: isDay, f: f);
}

String greetingFor(DateTime now) {
  final h = now.hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.ready, required this.onDone, this.hold = const Duration(milliseconds: 2800), this.maxWait = const Duration(seconds: 9)});

  /// Resolves when the app has finished loading (session restored etc.).
  final Future<void> ready;
  final VoidCallback onDone;
  final Duration hold;
  final Duration maxWait;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _fade;
  late final List<String> _quote;
  Timer? _clock;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _quote = _quotes[Random().nextInt(_quotes.length)];
    _fade = AnimationController(vsync: this, duration: const Duration(milliseconds: 550), value: 1);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _now = DateTime.now()));
    // Hide after the minimum hold AND once the app is ready, but never wait past maxWait.
    final minHold = Future<void>.delayed(widget.hold);
    final cap = Future<void>.delayed(widget.maxWait);
    Future.any([Future.wait([minHold, widget.ready]), cap]).then((_) => _dismiss());
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
    super.dispose();
  }

  String _two(int n) => n.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final p = splashPalette(_now);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final h12 = _now.hour % 12 == 0 ? 12 : _now.hour % 12;
    final clock = '$h12:${_two(_now.minute)} ${_now.hour < 12 ? 'AM' : 'PM'}';
    final date = '${days[_now.weekday - 1]}, ${_now.day} ${months[_now.month - 1]} ${_now.year}';
    return FadeTransition(
      opacity: _fade,
      child: Scaffold(
        backgroundColor: SarimColors.bg,
        body: Stack(fit: StackFit.expand, children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(center: const Alignment(0, -0.5), radius: 1.1, colors: [p.g1, p.g2, SarimColors.bg], stops: const [0, .45, 1]),
            ),
          ),
          SafeArea(
            child: Column(children: [
              const Spacer(flex: 2),
              SizedBox(
                width: 300,
                height: 190,
                child: Stack(alignment: Alignment.center, children: [
                  CustomPaint(size: const Size(300, 190), painter: _DialPainter(progress: p.f, dot: p.dot, isDay: p.isDay)),
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(greetingFor(_now), style: const TextStyle(fontSize: 14, color: Colors.white70)),
                      Text(clock, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w700)),
                      Text(date, style: const TextStyle(fontSize: 12, color: Colors.white60)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 28),
              const Text('Gull and Zubair', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: .5)),
              const Text('Naswar Dealers', style: TextStyle(fontSize: 13, color: SarimColors.gold, letterSpacing: 1.5)),
              const SizedBox(height: 14),
              Container(width: 48, height: 2, color: SarimColors.accent),
              const SizedBox(height: 18),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 36),
                child: Text('"${_quote[0]}"', textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, fontStyle: FontStyle.italic, color: Colors.white70)),
              ),
              const SizedBox(height: 6),
              Text('— ${_quote[1]}', style: const TextStyle(fontSize: 12, color: Colors.white54)),
              const Spacer(flex: 3),
              const Padding(
                padding: EdgeInsets.only(bottom: 24),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: SarimColors.accent)),
                  SizedBox(width: 10),
                  Text('Preparing your day', style: TextStyle(fontSize: 12, color: Colors.white54)),
                ]),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Half-circle sun/moon dial: track, progress arc and the sun or moon dot.
class _DialPainter extends CustomPainter {
  _DialPainter({required this.progress, required this.dot, required this.isDay});
  final double progress;
  final Color dot;
  final bool isDay;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, 150);
    const r = 124.0;
    final rect = Rect.fromCircle(center: c, radius: r);
    final track = Paint()..style = PaintingStyle.stroke..strokeWidth = 5..strokeCap = StrokeCap.round..color = Colors.white12;
    final fill = Paint()..style = PaintingStyle.stroke..strokeWidth = 5..strokeCap = StrokeCap.round..color = SarimColors.accent;
    canvas.drawArc(rect, pi, pi, false, track);
    final f = progress.clamp(0.0, 1.0);
    canvas.drawArc(rect, pi, pi * f, false, fill);
    final a = pi + pi * f;
    final pos = Offset(c.dx + r * cos(a), c.dy + r * sin(a));
    canvas.drawCircle(pos, 22, Paint()..shader = RadialGradient(colors: [dot.withOpacity(.55), dot.withOpacity(0)]).createShader(Rect.fromCircle(center: pos, radius: 22)));
    if (isDay) {
      canvas.drawCircle(pos, 9.5, Paint()..color = dot);
    } else {
      canvas.saveLayer(Rect.fromCircle(center: pos, radius: 14), Paint());
      canvas.drawCircle(pos, 9.5, Paint()..color = const Color(0xFFE2E8F0));
      canvas.drawCircle(pos + const Offset(4, -3), 7.5, Paint()..blendMode = BlendMode.clear);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_DialPainter old) => old.progress != progress || old.dot != dot || old.isDay != isDay;
}
