import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';
import { parseScreen, compileScreen } from '../scripts/screen-compile.mjs';
import { readIndexHtml } from './helpers/source.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const registry = read('modules/screen-registry.js');
const entries = [...registry.matchAll(/'([\w-]+)': \{\s*load: \(\) => import\('\.\/([\w-]+)\.screen\.js'\),\s*globals: \[([^\]]*)\],/g)]
  .map(m => ({ id: m[1], name: m[2], globals: [...m[3].matchAll(/'([^']+)'/g)].map(x => x[1]) }));
const files = readdirSync(new URL('screens/', root)).filter(f => f.endsWith('.screen.html')).map(f => f.replace('.screen.html', ''));

const published = js => {
  const out = new Set();
  for (const x of js.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) out.add(x[1]);
  for (const x of js.matchAll(/Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\)/g))
    for (const k of x[1].matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*(?=[,:}]|$)/g)) out.add(k[1]);
  return [...out].sort();
};

test('every screen file is registered and every registry entry has a screen file', () => {
  assert.deepEqual(entries.map(e => e.name).sort(), [...files].sort());
});

for (const e of entries) {
  test(`${e.id}: wiring is consistent`, () => {
    const text = read(`screens/${e.name}.screen.html`);
    const { html, js } = parseScreen(text, e.name);
    assert.ok(html.includes(`<div id="${e.id}"`), 'template holds the screen root');
    assert.ok(!/<script\b/i.test(html), 'markup has no <script>');
    const raw = read('index.html');
    assert.ok(new RegExp(`<div id="${e.id}"[^>]*data-lazy-screen></div>`).test(raw), 'index.html keeps a lazy placeholder');
    assert.equal((raw.match(new RegExp(`id="${e.id}"`, 'g')) || []).length, 1, 'only the placeholder carries the id');
    assert.deepEqual([...e.globals].sort(), published(js), 'registry globals match the screen script');
    acorn.parse(compileScreen(text, e.name), { ecmaVersion: 'latest', sourceType: 'module' });
    assert.ok(read('sw.js').includes(`'./modules/${e.name}.screen.js'`), 'service worker precaches the screen');
  });
}

test('reassembled index.html contains every lazy screen root exactly once', () => {
  const html = readIndexHtml();
  for (const e of entries) {
    assert.equal((html.match(new RegExp(`id="${e.id}"`, 'g')) || []).length, 1, e.id);
    assert.ok(!/data-lazy-screen/.test(html.slice(html.indexOf(`id="${e.id}"`), html.indexOf(`id="${e.id}"`) + 300)), e.id);
  }
});
