import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';

test('Android gets a root class before first paint', () => {
  assert.match(readSource('index.html'), /\/Android\/i\.test\(navigator\.userAgent\)\)d\.classList\.add\("is-android"\)/);
});

test('Android drops the paint-heavy layers that leave blank, unpainted areas while scrolling', () => {
  const css = readSource('app.css');
  assert.match(css, /html\.is-android body \{ background-attachment: scroll; \}/);
  assert.match(css, /html\.is-android \.liquid-bg-element \{ display: none; \}/);
  assert.match(css, /html\.is-android \*[^{]*\{ backdrop-filter: none !important; -webkit-backdrop-filter: none !important; \}/);
});
