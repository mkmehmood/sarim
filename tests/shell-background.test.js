import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../app.css');

describe('why standalone screens stay painted and tabs did not', () => {
  it('standalone screens are fixed full-viewport layers with their own background', () => {
    assert.match(css, /\.standalone-screen \{\n\s*position: fixed; inset: 0;[\s\S]*?background: var\(--bg-gradient, var\(--bg\)\)/);
  });
});

describe('the tab shell now has the same kind of layer', () => {
  it('paints the page background on a fixed full-viewport layer behind the content', () => {
    assert.match(css, /body::before \{\n\s*content: '';\n\s*position: fixed; inset: 0;\n\s*z-index: -1;\n\s*background: var\(--bg-gradient, var\(--bg\)\);\n\s*pointer-events: none;/);
  });
  it('no longer paints the body itself with a fixed-attachment gradient', () => {
    const body = css.match(/\nbody \{\nbackground: transparent;\ncolor: var\(--text-main\);/);
    assert.ok(body);
    assert.equal(/background-attachment: fixed/.test(css), false);
  });
  it('keeps the solid page color under everything', () => {
    assert.match(css, /html\{background:var\(--bg\)\}/);
  });
});

describe('Android window background follows the theme', () => {
  const native = read('../modules/native.js');
  it('sends the current --bg to the window and keeps it in sync when the theme changes', () => {
    assert.match(native, /WindowBackground\.set\(\{ color: hex \}\)/);
    assert.match(native, /new MutationObserver\(\(\) => \{ applyStatusBar\(\); applyWindowBackground\(\); \}\)/);
    assert.match(native, /applyWindowBackground\(\);\n\s*new MutationObserver/);
  });
  it('normalises any CSS color to hex without writing inline styles', () => {
    assert.match(native, /function cssColorToHex\(value\)/);
    assert.match(native, /ctx\.fillStyle = value;/);
  });
  const J = '../android/app/src/main/java/com/gullzubair/sarim/';
  it('paints the window, decor view and WebView, and remembers the color for the next start', () => {
    const plugin = read(J + 'WindowBackgroundPlugin.java');
    assert.match(plugin, /@CapacitorPlugin\(name = "WindowBackground"\)/);
    assert.match(plugin, /getWindow\(\)\.setBackgroundDrawable\(new ColorDrawable\(color\)\)/);
    assert.match(plugin, /getDecorView\(\)\.setBackgroundColor\(color\)/);
    assert.match(plugin, /webView\.setBackgroundColor\(color\)/);
    assert.match(plugin, /ed\.putInt\(KEY, color\)\.apply\(\)/);
    assert.match(plugin, /runOnUiThread/);
  });
  it('applies the remembered color right at startup, before the first paint of the page', () => {
    const main = read(J + 'MainActivity.java');
    assert.match(main, /registerPlugin\(WindowBackgroundPlugin\.class\)/);
    assert.match(main, /super\.onCreate\(savedInstanceState\);\n\s*if \(WindowBackgroundPlugin\.hasSaved\(this\)\)/);
  });
});
