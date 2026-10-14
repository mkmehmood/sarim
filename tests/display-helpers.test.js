import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  it('has a utility class for every display value the helper can set', () => {
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    for (const v of ['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'table-row', 'table-cell', 'contents', 'list-item', 'flow-root']) {
      assert.ok(css.includes(`.d-${v} { display: ${v}; }`), v);
    }
  });
  it('leaves no direct style.display writes in the app code', () => {
    for (const f of ['index.html', 'modules/utilities-core.js', 'modules/utilities-sales.js', 'modules/utilities-payments.js', 'modules/admin-data.js', 'modules/customers.js']) {
      const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(tag, '');
      assert.equal(/\.style\.display/.test(text), false, f);
    }
  });
});
