import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tag = html.match(/<script>\(function\(\)\{var V=[\s\S]*?<\/script>/)[0];
const source = tag.replace(/^<script>/, '').replace(/<\/script>$/, '');
function makeEl() {
  const classes = new Set();
  const inline = { display: '' };
  return {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    style: { get display() { return inline.display; }, set display(v) { inline.display = v; }, removeProperty: (p) => { inline[p] = ''; } },
    classes,
  };
}
globalThis.window = {};
new Function('window', source)(globalThis.window);
describe('display helpers', () => {
  it('hides and shows through classes', () => {
    const el = makeEl();
    window.setDisplay(el, 'none');
    assert.equal(window.getDisplay(el), 'none');
    assert.ok(el.classes.has('d-none'));
    window.setDisplay(el, 'flex');
    assert.equal(window.getDisplay(el), 'flex');
    assert.equal(el.classes.has('d-none'), false);
    window.setDisplay(el, '');
    assert.equal(window.getDisplay(el), '');
    assert.equal(el.classes.size, 0);
  });
  it('clears a leftover inline display and still reads it when no class is set', () => {
    const el = makeEl();
    el.style.display = 'grid';
    assert.equal(window.getDisplay(el), 'grid');
    window.setDisplay(el, 'none');
    assert.equal(el.style.display, '');
    assert.equal(window.getDisplay(el), 'none');
  });
  it('switches one style family at a time with setStyle', () => {
    const set = new Set(['st-color__aaaaaa', 'st-color-scheme__bbbbbb', 'keep-me']);
    const base = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
    Object.defineProperty(base, 'length', { get: () => set.size });
    const el = { classList: new Proxy(base, { get: (t, k) => (typeof k === 'string' && /^\d+$/.test(k) ? [...set][+k] : t[k]), has: (t, k) => (typeof k === 'string' && /^\d+$/.test(k) ? +k < set.size : k in t) }), style: { removeProperty() {} } };
    window.setStyle(el, 'color', 'st-color__cccccc');
    assert.ok(set.has('st-color__cccccc'));
    assert.equal(set.has('st-color__aaaaaa'), false);
    assert.ok(set.has('st-color-scheme__bbbbbb'));
    assert.ok(set.has('keep-me'));
    window.setStyle(el, 'color', '');
    assert.equal(set.has('st-color__cccccc'), false);
    assert.ok(set.has('st-color-scheme__bbbbbb'));
  });
  it('defines a class for every st-* name the code can set', () => {
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    const used = new Set();
    for (const f of ['index.html', 'modules/utilities-core.js', 'modules/utilities-sales.js', 'modules/utilities-payments.js', 'modules/admin-data.js', 'modules/customers.js', 'modules/sync.js', 'modules/rep-sales.js', 'modules/factory.js', 'modules/formula-store.js', 'modules/prod-photos.js']) {
      for (const m of readFileSync(new URL('../' + f, import.meta.url), 'utf8').matchAll(/st-[a-z-]+__[0-9a-f]{6}/g)) used.add(m[0]);
    }
    assert.ok(used.size > 20);
    for (const c of used) assert.ok(css.includes('.' + c + ' {'), c);
  });
  it('has a utility class for every display value the helper can set', () => {
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    for (const v of ['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'table-row', 'table-cell', 'contents', 'list-item', 'flow-root']) {
      assert.ok(css.includes(`.d-${v} { display: ${v}; }`), v);
    }
  });
  it('keeps cssText only for the one rule that needs !important', () => {
    let count = 0;
    for (const f of ['index.html', 'modules/admin-data.js', 'modules/factory.js', 'modules/formula-store.js', 'modules/sync.js', 'modules/utilities-core.js', 'modules/utilities-payments.js', 'modules/utilities-sales.js']) {
      count += (readFileSync(new URL('../' + f, import.meta.url), 'utf8').match(/\.style\.cssText/g) || []).length;
    }
    assert.equal(count, 1);
  });
  it('keeps only custom properties in style attributes built at run time', () => {
    const bad = [];
    for (const f of ['index.html', ...readdirSync(new URL('../modules/', import.meta.url)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)]) {
      const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
      for (const m of text.matchAll(/\sstyle="([^"]*)"/g)) {
        if (!/\$\{|'\s*\+|\+\s*'/.test(m[1])) continue;
        const props = m[1].split(';').map((x) => x.trim()).filter(Boolean).map((x) => x.split(':')[0].trim());
        if (props.some((p) => !p.startsWith('--') && !p.includes('${'))) bad.push(f + ' ' + m[1].slice(0, 60));
      }
    }
    assert.deepEqual(bad, []);
  });
  it('writes inline styles from JS only for run-time geometry and timing', () => {
    const allowed = new Set(['left', 'right', 'top', 'bottom', 'width', 'height', 'minHeight', 'transform', 'animationDuration', 'cssText']);
    const found = new Set();
    for (const f of ['index.html', ...readdirSync(new URL('../modules/', import.meta.url)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)]) {
      const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
      for (const m of text.matchAll(/\.style\.([a-zA-Z]+)\s*=(?!=)/g)) found.add(m[1]);
    }
    assert.deepEqual([...found].filter((p) => !allowed.has(p)), []);
  });
  it('declares the cascade layer order first and uses only those layers', () => {
    const style = html.match(/<style id="spl[^>]*>([\s\S]*?)<\/style>/)[1];
    assert.ok(style.trimStart().startsWith('@layer vendor, app, utilities, overrides;'));
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    for (const m of (style + css).matchAll(/@layer ([a-z-]+)\s*\{/g)) assert.ok(['vendor', 'app', 'utilities', 'overrides'].includes(m[1]), m[1]);
  });
  it('leaves no direct style.display writes in the app code', () => {
    for (const f of ['index.html', 'modules/utilities-core.js', 'modules/utilities-sales.js', 'modules/utilities-payments.js', 'modules/admin-data.js', 'modules/customers.js']) {
      const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(tag, '');
      assert.equal(/\.style\.display/.test(text), false, f);
    }
  });
});
