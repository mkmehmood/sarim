import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';

describe('keyboard guard for the Android app', () => {
  it('toggles kb-open from focus and Keyboard plugin events', () => {
    const src = readSource('modules/native.js');
    assert.match(src, /function installKeyboardGuard/);
    assert.match(src, /classList\.toggle\('kb-open'/);
    assert.match(src, /keyboardWillShow/);
    assert.match(src, /keyboardDidHide/);
    assert.match(src, /installKeyboardGuard\(\);/);
  });

  it('drops GPU-heavy blur layers while the keyboard is open', () => {
    const css = readSource('app.css');
    assert.match(css, /html\.kb-open \* \{ backdrop-filter: none;/);
    assert.match(css, /html\.kb-open \.liquid-bg-element \{ display: none; \}/);
  });
});

describe('Android window keyboard handling', () => {
  it('stops the window from resizing so Capacitor SystemBars is the only resizer', () => {
    const src = readSource('android/app/src/main/java/com/gullzubair/sarim/MainActivity.java');
    assert.match(src, /SOFT_INPUT_ADJUST_NOTHING/);
    assert.match(src, /Build\.VERSION_CODES\.R/);
  });
});

describe('Android keyboard black screen', () => {
  const html = readSource('index.html');
  it('ships the viewport without viewport-fit=cover so Capacitor SystemBars pads natively instead of passing the keyboard inset through twice', () => {
    const meta = html.match(/<meta name="viewport"[^>]*>/)[0];
    assert.match(meta, /id="app-viewport"/);
    assert.doesNotMatch(meta, /viewport-fit/);
    assert.doesNotMatch(meta, /interactive-widget/);
  });
  it('restores viewport-fit=cover and interactive-widget for the web and installed PWA only', () => {
    const script = html.match(/<script>\(function\(\)\{var c=window\.Capacitor[^<]*<\/script>/)[0];
    assert.match(script, /isNativePlatform/);
    assert.match(script, /;\\s\*wv\\\)/);
    assert.match(script, /if\(n\)return;/);
    assert.match(script, /viewport-fit=cover, interactive-widget=resizes-visual/);
  });
  it('runs before any other script so it is applied before the first paint', () => {
    assert.ok(html.indexOf('id="app-viewport"') < html.indexOf('<script>'));
    assert.ok(html.indexOf('var c=window.Capacitor') < html.indexOf('window.setDisplay'));
  });
});
