import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';
import { parseScreen, compileScreen } from '../scripts/screen-compile.mjs';
import { publishedGlobals } from '../scripts/screen-globals.mjs';
import { readIndexHtml } from './helpers/source.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const registry = read('modules/screen-registry.js');
const entries = [...registry.matchAll(/'([\w-]+)': \{\s*load: \(\) => import\('\.\/([\w-]+)\.screen\.js'\),\s*globals: \[([^\]]*)\],/g)]
  .map(m => ({ id: m[1], name: m[2], globals: [...m[3].matchAll(/'([^']+)'/g)].map(x => x[1]) }));
const lazyBlock = registry.slice(registry.indexOf('registerLazyModules({'));
const lazyEntries = [...lazyBlock.matchAll(/'([\w-]+)': \{\s*load: \(\) => import\('\.\/([\w-]+)\.js'\),\s*globals: \[([^\]]*)\],\s*hooks: \[([^\]]*)\],/g)]
  .map(m => ({ id: m[1], file: m[2] + '.js', globals: [...m[3].matchAll(/'([^']+)'/g)].map(x => x[1]), hooks: [...m[4].matchAll(/'([^']+)'/g)].map(x => x[1]) }));
const files = readdirSync(new URL('screens/', root)).filter(f => f.endsWith('.screen.html')).map(f => f.replace('.screen.html', ''));

const published = js => publishedGlobals(js).functions;

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

test('every function a notification target calls by name is published eagerly or stubbed by the registry', () => {
  const target = read('modules/notify-target.js');
  const wanted = new Set([...target.matchAll(/\b(?:fn|prepare): '([\w$]+)'/g)].map(m => m[1]));
  const eager = new Set();
  for (const f of readdirSync(new URL('modules/', root)).filter(n => n.endsWith('.js'))) {
    for (const g of publishedGlobals(read(`modules/${f}`)).functions) eager.add(g);
  }
  const stubbed = new Set([...entries.flatMap(e => e.globals), ...lazyEntries.flatMap(e => e.globals)]);
  assert.ok(wanted.size > 0);
  for (const n of wanted) assert.ok(eager.has(n) || stubbed.has(n), `${n} is neither published nor stubbed`);
});

for (const e of lazyEntries) {
  test(`lazy module ${e.id}: every published function is either stubbed or a deliberate hook`, () => {
    const published = publishedGlobals(read(`modules/${e.file}`)).functions;
    assert.deepEqual([...e.globals, ...e.hooks].sort(), published);
    assert.deepEqual(e.globals.filter(g => e.hooks.includes(g)), []);
  });

  test(`lazy module ${e.id}: nothing imports it statically`, () => {
    for (const f of readdirSync(new URL('modules/', root)).filter(n => n.endsWith('.js'))) {
      assert.ok(!new RegExp(`from '\\./${e.file.replace('.', '\\.')}'`).test(read(`modules/${f}`)), `${f} imports ${e.file}`);
    }
  });

  test(`lazy module ${e.id}: hooks are only ever called optionally, so they do nothing until it is loaded`, () => {
    for (const f of readdirSync(new URL('modules/', root)).filter(n => n.endsWith('.js') && n !== e.file)) {
      const text = read(`modules/${f}`);
      for (const h of e.hooks) {
        for (const line of text.split('\n')) {
          if (!new RegExp(`window\\.${h}\\(`).test(line)) continue;
          assert.ok(new RegExp(`typeof window\\.${h} === 'function'`).test(line), `${f} calls window.${h}( without ?. or a typeof guard: ${line.trim()}`);
        }
      }
    }
  });
}

test('the lazy module list is not empty', () => assert.ok(lazyEntries.length >= 1));

test('every late-bound wrapper in core points at a function that is published, stubbed or a declared hook', () => {
  const eager = new Set();
  const mods = readdirSync(new URL('modules/', root)).filter(n => n.endsWith('.js'));
  for (const f of mods) for (const g of publishedGlobals(read(`modules/${f}`)).functions) eager.add(g);
  const known = new Set([...eager, ...entries.flatMap(e => e.globals), ...lazyEntries.flatMap(e => [...e.globals, ...e.hooks])]);
  const problems = [];
  for (const f of mods) {
    for (const m of read(`modules/${f}`).matchAll(/\(\.\.\.(\w+)\) => window\.([\w$]+)\??\.?\(\.\.\.\1\)/g)) {
      if (!known.has(m[2])) problems.push(`${f}: wrapper calls window.${m[2]}, which nothing publishes or stubs`);
    }
  }
  assert.deepEqual(problems, []);
});
