import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_state.dart';
import 'tokens.dart';

/// Sign-in screen, ported from `createAuthOverlay()` (modules/sync.js) and the `.auth-screen` rules in app.css.
/// The "Continue with Google" button is web-only in the original (hidden inside the native shell), so it is omitted.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.app});
  final AppState app;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

enum _Tone { info, error, success }

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  bool _show = false;
  bool _busy = false;
  String _message = '';
  _Tone _tone = _Tone.info;

  AppState get app => widget.app;

  @override
  void initState() {
    super.initState();
    _emailFocus.addListener(() => setState(() {}));
    _passwordFocus.addListener(() => setState(() {}));
    app.savedEmail().then((e) {
      if (e.isNotEmpty && mounted) {
        _email.text = e;
        _passwordFocus.requestFocus(); // web focuses the password field when an email was saved
      }
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _say(String m, _Tone t) => setState(() { _message = m; _tone = t; });

  String _lockText() {
    final sec = (app.limiter.lockoutRemainingMs / 1000).ceil();
    return 'Too many failed attempts. Try again in ${sec ~/ 60}m ${(sec % 60).toString().padLeft(2, '0')}s.';
  }

  /// Same order of checks as `handleSignIn` in the web app.
  Future<void> _submit() async {
    if (_busy) return;
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) return _say('Please enter both email and password', _Tone.error);
    if (app.limiter.isLockedOut) return _say(_lockText(), _Tone.error);
    final wait = app.limiter.backoffMs;
    setState(() => _busy = true);
    if (wait > 0) {
      _say('Too many attempts \u2014 waiting ${(wait / 1000).round()}s\u2026', _Tone.info);
      await Future<void>.delayed(Duration(milliseconds: wait));
      if (!mounted) return;
      if (app.limiter.isLockedOut) {
        setState(() => _busy = false);
        return _say(_lockText(), _Tone.error);
      }
    }
    _say('Verifying credentials...', _Tone.info);
    final err = await app.signIn(email, password);
    if (!mounted) return;
    if (err == null) {
      app.limiter.recordSuccess();
      await app.saveEmail(email);
      _say('Success! Loading...', _Tone.success);
    } else {
      app.limiter.recordFailure();
      setState(() => _busy = false);
      _say(err, _Tone.error);
    }
  }

  Color get _msgColor => _tone == _Tone.error ? Au.error : _tone == _Tone.success ? Au.leaf : Au.muted;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final rem = context.rem;
    final w = mq.size.width;
    final short = mq.size.height <= 720;
    final logoW = short ? min(w * .70, 260.0) : min(w * .86, 400.0);
    final brandSize = (w * .061).clamp(1.35 * rem, 2.3 * rem).toDouble();
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: Au.bgBot,
      body: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Au.bgTop, Au.bgBot]),
        ),
        child: Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(center: const Alignment(0, -1), radius: 1.2, colors: [Au.bgGlow, Colors.transparent], stops: const [0, .7]),
          ),
          child: LayoutBuilder(builder: (context, c) {
            return SingleChildScrollView(
              padding: EdgeInsets.only(top: mq.padding.top + 12),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: c.maxHeight - mq.padding.top - 12),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 460),
                    child: Column(children: [
                      // .auth-hero
                      Padding(
                        padding: EdgeInsets.fromLTRB(24, short ? 12 : 22, 24, short ? 16 : 28),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Container(
                            width: logoW,
                            margin: EdgeInsets.only(bottom: short ? 10 : 18),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(24),
                              boxShadow: [
                                BoxShadow(color: Colors.black.withOpacity(.22), blurRadius: 46, offset: const Offset(0, 18)),
                                BoxShadow(color: Colors.white.withOpacity(.9), spreadRadius: 4),
                              ],
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: Image.asset('assets/images/brand-logo.jpg', width: logoW, fit: BoxFit.contain, semanticLabel: 'Gull And Zubair Naswar Dealers'),
                          ),
                          ShaderMask(
                            shaderCallback: (r) => const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [T.success, T.accent, T.accent, T.accentCyan], stops: [0, .42, .76, 1]).createShader(r),
                            child: Text('GULL AND ZUBAIR', maxLines: 1, style: TextStyle(fontFamily: T.fontBrand, fontFamilyFallback: T.fontBrandFallback, fontWeight: FontWeight.w700, fontSize: brandSize, letterSpacing: .05 * brandSize, height: 1, color: Colors.white)),
                          ),
                          const SizedBox(height: 8),
                          Text('NASWAR DEALERS', style: TextStyle(fontFamily: T.fontUi, fontWeight: FontWeight.w500, fontSize: .7 * rem, letterSpacing: .4 * .7 * rem, color: T.textMain)),
                        ]),
                      ),
                      // .auth-sheet
                      Container(
                        width: double.infinity,
                        padding: EdgeInsets.fromLTRB(22, short ? 20 : 28, 22, 18 + mq.padding.bottom),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Au.sheetTop, Au.sheetBot]),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
                          boxShadow: [BoxShadow(color: Colors.black.withOpacity(.85), blurRadius: 48, offset: const Offset(0, -16))],
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Welcome back', style: TextStyle(fontFamily: T.fontUi, fontSize: 1.55 * rem, fontWeight: FontWeight.w600, letterSpacing: -.01 * 1.55 * rem, color: T.textStrong)),
                          const SizedBox(height: 4),
                          Text('Sign in to unlock and sync your business data.', style: TextStyle(fontSize: .84 * rem, height: 1.45, color: T.textMain)),
                          const SizedBox(height: 20),
                          _field(label: 'Email address', controller: _email, focus: _emailFocus, hint: 'name@example.com', icon: _mailIcon, keyboard: TextInputType.emailAddress, autofill: const [AutofillHints.username], action: TextInputAction.next, onSubmit: () => _passwordFocus.requestFocus()),
                          const SizedBox(height: 18),
                          _field(label: 'Password', controller: _password, focus: _passwordFocus, hint: 'Enter your password', icon: _lockIcon, obscure: !_show, autofill: const [AutofillHints.password], action: TextInputAction.done, onSubmit: _submit, eye: true),
                          const SizedBox(height: 8 + 0),
                          _submitButton(),
                          if (_message.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 14),
                              child: SizedBox(width: double.infinity, child: Text(_message, textAlign: TextAlign.center, style: TextStyle(fontSize: .82 * rem, height: 1.4, color: _msgColor))),
                            ),
                          const SizedBox(height: 16),
                          Center(
                            child: Text.rich(
                              const TextSpan(children: [
                                TextSpan(text: 'No account? '),
                                TextSpan(text: 'Contact the administrator', style: TextStyle(fontWeight: FontWeight.w700, color: T.textStrong)),
                                TextSpan(text: ' to have yours added.'),
                              ]),
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: .76 * rem, height: 1.5, color: T.textMain),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            const Icon(Icons.shield_outlined, size: 14, color: T.accent),
                            const SizedBox(width: 6),
                            Text('End-to-end encrypted \u00b7 AES-256-GCM', style: TextStyle(fontSize: .66 * rem, color: T.textMain)),
                          ]),
                        ]),
                      ),
                    ]),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  static const _mailIcon = Icons.mail_outline;
  static const _lockIcon = Icons.lock_outline;

  Widget _field({
    required String label,
    required TextEditingController controller,
    required FocusNode focus,
    required String hint,
    required IconData icon,
    TextInputType? keyboard,
    List<String>? autofill,
    bool obscure = false,
    bool eye = false,
    TextInputAction? action,
    VoidCallback? onSubmit,
  }) {
    final on = focus.hasFocus;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(left: 4, bottom: 8), child: Text(label, style: TextStyle(fontSize: .8 * context.rem, fontWeight: FontWeight.w600, color: Au.ink))),
      AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        height: 58,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Au.fillTop, Au.fill]),
          border: Border.all(color: on ? Au.leaf : Au.line, width: 1.5),
          boxShadow: on ? [BoxShadow(color: Au.ring, spreadRadius: 4), BoxShadow(color: Au.btnGlow, blurRadius: 24, offset: const Offset(0, 10), spreadRadius: -10)] : const [],
        ),
        child: Stack(alignment: Alignment.centerLeft, children: [
          Positioned(
            left: 9,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: on
                    ? const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF4ADE80), Color(0xFF22C55E)])
                    : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [T.accent.withOpacity(.20), T.accentCyan.withOpacity(.10)]),
                border: on ? null : Border.all(color: Au.line),
              ),
              child: Icon(icon, size: 20, color: on ? Au.tileInk : Au.leaf),
            ),
          ),
          TextField(
            controller: controller,
            focusNode: focus,
            obscureText: obscure,
            keyboardType: keyboard,
            autofillHints: autofill,
            textInputAction: action,
            autocorrect: false,
            enableSuggestions: false,
            onSubmitted: (_) => onSubmit?.call(),
            cursorColor: Au.leaf,
            style: TextStyle(fontSize: context.rem, fontWeight: FontWeight.w500, color: Au.ink),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: TextStyle(color: Au.muted.withOpacity(.8), fontWeight: FontWeight.w400),
              border: InputBorder.none,
              contentPadding: EdgeInsets.fromLTRB(58, 0, eye ? 54 : 16, 0),
            ),
          ),
          if (eye)
            Positioned(
              right: 7,
              child: IconButton(
                tooltip: _show ? 'Hide password' : 'Show password',
                onPressed: () => setState(() => _show = !_show),
                icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: _show ? Au.leaf : Au.muted),
                style: IconButton.styleFrom(fixedSize: const Size(44, 44)),
              ),
            ),
        ]),
      ),
    ]);
  }

  Widget _submitButton() {
    return Opacity(
      opacity: _busy ? .6 : 1,
      child: Container(
        height: 58,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Au.btnTop, Au.btnBot]),
          boxShadow: [
            BoxShadow(color: Au.btnGlow, blurRadius: 28, offset: const Offset(0, 14), spreadRadius: -10),
            BoxShadow(color: Colors.black.withOpacity(.25), blurRadius: 6, offset: const Offset(0, 3)),
          ],
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: _busy ? null : _submit,
            child: Center(child: Text('Sign in', style: TextStyle(fontSize: 1.02 * context.rem, fontWeight: FontWeight.w800, letterSpacing: .02 * 1.02 * context.rem, color: Au.btnInk))),
          ),
        ),
      ),
    );
  }
}
