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
