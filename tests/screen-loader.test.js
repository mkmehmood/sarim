import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(id, lazy) { this.id = id; this.attrs = lazy ? { 'data-lazy-screen': '' } : {}; this.replaced = null; }
  hasAttribute(k) { return k in this.attrs; }
  setAttribute(k, v) { this.attrs[k] = v; }
  replaceWith(frag) { this.replaced = frag; byId.delete(this.id); byId.set(this.id, { real: true, frag }); }
}
let byId, styles, toasts, opened;

function install() {
  byId = new Map(); styles = []; toasts = []; opened = [];
  globalThis.document = {
    getElementById: id => byId.get(id) || null,
    querySelector: sel => styles.find(s => sel.includes(`"${s.attrs['data-screen-css']}"`)) || null,
    createElement: tag => (tag === 'template'
      ? { set innerHTML(v) { this.content = `content:${v}`; } }
      : Object.assign(new El('', false), { tag, textContent: '' })),
    head: { appendChild: s => styles.push(s) },
  };
  globalThis.window = {
    openStandaloneScreen: id => opened.push(id),
    showToast: (m, t) => toasts.push([m, t]),
  };
}

async function fresh() {
  install();
  return import(`../modules/screen-loader.js?${Math.random()}`);
}

beforeEach(() => install());

test('loads once, injects css once, replaces the placeholder and calls onMount once', async () => {
  const L = await fresh();
  byId.set('a-screen', new El('a-screen', true));
  let loads = 0, mounts = 0;
  L.registerScreens({ 'a-screen': { load: async () => { loads++; return { __screenHtml: '<p>a</p>', __screenCss: '.a{}', onMount: () => mounts++ }; }, globals: [] } });
  await Promise.all([L.loadScreen('a-screen'), L.loadScreen('a-screen')]);
  await L.loadScreen('a-screen');
  assert.equal(loads, 1);
  assert.equal(mounts, 1);
  assert.equal(styles.length, 1);
  assert.equal(styles[0].textContent, '.a{}');
  assert.equal(byId.get('a-screen').real, true);
  assert.equal(byId.get('a-screen').frag, 'content:<p>a</p>');
  assert.ok(L.isScreenMounted('a-screen'));
});

test('opening a lazy screen waits for the mount, then runs the original opener once', async () => {
  install();
  const orig = window.openStandaloneScreen;
  const L = await fresh();
  byId.set('b-screen', new El('b-screen', true));
  let release;
  L.registerScreens({ 'b-screen': { load: () => new Promise(r => { release = () => r({ __screenHtml: 'b', __screenCss: '' }); }), globals: [] } });
  assert.notEqual(window.openStandaloneScreen, orig);
  window.openStandaloneScreen('b-screen');
  assert.deepEqual(opened, []);
  await Promise.resolve();
  release();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(opened, ['b-screen']);
  window.openStandaloneScreen('b-screen');
  assert.deepEqual(opened, ['b-screen', 'b-screen']);
  window.openStandaloneScreen('not-lazy');
  assert.deepEqual(opened, ['b-screen', 'b-screen', 'not-lazy']);
});

test('a global stub loads the screen, then calls the real function with the same arguments', async () => {
  const L = await fresh();
  byId.set('c-screen', new El('c-screen', true));
  L.registerScreens({ 'c-screen': { load: async () => { window.doIt = (x, y) => `real:${x}${y}`; return { __screenHtml: 'c', __screenCss: '' }; }, globals: ['doIt'] } });
  assert.equal(window.doIt.__screenStub, true);
  assert.equal(await window.doIt(1, 2), 'real:12');
  assert.equal(window.doIt.__screenStub, undefined);
});

test('stub calls made before the load finishes are all answered by the real function', async () => {
  const L = await fresh();
  byId.set('d-screen', new El('d-screen', true));
  L.registerScreens({ 'd-screen': { load: async () => { window.go = n => n * 2; return { __screenHtml: 'd', __screenCss: '' }; }, globals: ['go'] } });
  const out = await Promise.all([window.go(1), window.go(2), window.go(3)]);
  assert.deepEqual(out, [2, 4, 6]);
});

test('a failed load tells the user, is not cached, and succeeds on retry', async () => {
  const L = await fresh();
  byId.set('e-screen', new El('e-screen', true));
  let tries = 0;
  L.registerScreens({ 'e-screen': { load: async () => { if (++tries === 1) throw new Error('offline'); return { __screenHtml: 'e', __screenCss: '' }; }, globals: [] } });
  window.openStandaloneScreen('e-screen');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(opened, []);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][1], 'error');
  window.openStandaloneScreen('e-screen');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(opened, ['e-screen']);
  assert.equal(tries, 2);
});
