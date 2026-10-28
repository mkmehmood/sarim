import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const files = [
  'index.html',
  'sw.js',
  ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n),
  ...readdirSync(new URL('desktop/', root)).filter((n) => /\.(js|html)$/.test(n)).map((n) => 'desktop/' + n),
];
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const line = (text, index) => text.slice(0, index).split('\n').length;
describe('all CSS lives in app.css', () => {
  it('has no <style> element in any app file', () => {
    const found = [];
    for (const f of files) {
      const text = read(f);
      for (const m of text.matchAll(/<style[\s>]/gi)) found.push(`${f}:${line(text, m.index)}`);
    }
    assert.deepEqual(found, [], 'Move this CSS into app.css instead of adding a <style> element');
  });
  it('creates no style elements or sheets from JS', () => {
    const found = [];
    for (const f of files) {
      const text = read(f);
      for (const m of text.matchAll(/createElement\(\s*['"`]style['"`]\s*\)|\binsertRule\s*\(|adoptedStyleSheets|new CSSStyleSheet|setAttribute\(\s*['"]style['"]/g)) found.push(`${f}:${line(text, m.index)} ${m[0]}`);
    }
    assert.deepEqual(found, [], 'Add the rule to app.css and toggle a class instead');
  });
  it('has no style attribute with a CSS declaration in any app file', () => {
    const found = [];
    for (const f of files) {
      const text = read(f);
      for (const m of text.matchAll(/\sstyle\s*=\s*\\?["']([^"']*)\\?["']/g)) {
        const declarations = m[1].split(';').map((d) => d.trim()).filter(Boolean);
        const real = declarations.filter((d) => !d.startsWith('--'));
        if (real.length) found.push(`${f}:${line(text, m.index)} style="${m[1].slice(0, 60)}"`);
      }
    }
    assert.deepEqual(found, [], 'Put the declarations in app.css and use a class. Only custom properties (--name) may carry a run-time value.');
  });
  it('keeps index.html free of any style attribute at all', () => {
    assert.equal(/\sstyle\s*=/.test(read('index.html')), false);
  });
  it('writes cssText only in the one helper that needs !important', () => {
    const found = [];
    for (const f of files) {
      const text = read(f);
      for (const m of text.matchAll(/\.style\.cssText\s*=/g)) found.push(`${f}:${line(text, m.index)}`);
    }
    assert.equal(found.length, 1, found.join(', '));
  });
  it('starts app.css with the vendor import and has no inline-style selectors', () => {
    const css = read('app.css');
    assert.ok(css.trimStart().startsWith("@import url('vendor/leaflet/leaflet.css') layer(vendor);"));
    assert.equal(/\[style[*^$|~]?=/.test(css), false, 'Select a class, not the text of an inline style');
  });
  it('never passes a class list with spaces to classList.add or remove', () => {
    const found = [];
    for (const f of files) {
      const text = read(f);
      for (const m of text.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) {
        for (const lit of m[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
          const value = lit[1] ?? lit[2];
          if (/\s/.test(value)) found.push(`${f}:${line(text, m.index)} '${value}'`);
        }
      }
    }
    assert.deepEqual(found, [], 'classList.add takes one class per argument; split the string or spread an array');
  });
});
