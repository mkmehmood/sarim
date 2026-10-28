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
