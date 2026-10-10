import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { computeBuildKey, replaceOrThrow } from '../build-key.js';

const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function makeSw({ host = 'app.test', failing = [], preCaches = {} } = {}) {
  const listeners = {};
  const stores = new Map(Object.entries(preCaches).map(([n, o]) => [n, new Map(Object.entries(o))]));
  const fetchLog = [];
  let skipped = 0;
  class Req { constructor(url, init = {}) { this.url = typeof url === 'string' ? new URL(url, 'https://app.test/').href : url.url; this.cache = init.cache; this.method = 'GET'; this.mode = init.mode || 'cors'; } }
  class Res { constructor(body = '', init = {}) { this.body = body; this.status = init.status ?? 200; this.ok = this.status >= 200 && this.status < 300; } clone() { return new Res(this.body, { status: this.status }); } }
  const openCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const key = (r) => (typeof r === 'string' ? new URL(r, 'https://app.test/').href : r.url);
    return Promise.resolve({
      put: async (r, res) => { m.set(key(r), res); },
      match: async (r) => m.get(key(r)),
      add: async () => {},
    });
  };
  const ctx = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => { skipped++; }, location: { hostname: host, origin: `https://${host}`, href: `https://${host}/sw.js` }, clients: { claim: async () => {}, matchAll: async () => [] } },
    clients: { claim: async () => {}, matchAll: async () => [] },
    caches: { open: openCache, keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) },
    fetch: async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      fetchLog.push({ url, cache: req.cache });
      if (failing.some(f => url.endsWith(f))) return new Res('', { status: 404 });
      return new Res('network:' + url);
    },
    Request: Req, Response: Res, URL, setTimeout, clearTimeout, console: { warn() {}, log() {}, error() {} }, atob, TextDecoder, navigator: {}, Promise,
  };
  vm.runInNewContext(SW, ctx);
  const dispatch = async (type, ev = {}) => {
    let p;
    const e = { waitUntil: (x) => { p = x; }, respondWith: (x) => { e.response = x; e.responded = true; }, ...ev };
    listeners[type](e);
    if (p) await p;
    return e;
  };
  return { dispatch, stores, fetchLog, skipped: () => skipped };
}


describe('service worker install', () => {
  it('fetches every file fresh (bypassing the browser HTTP cache) and does not skip waiting', async () => {
    const sw = makeSw();
    await sw.dispatch('install');
    assert.ok(sw.fetchLog.length > 5);
    assert.ok(sw.fetchLog.every(f => f.cache === 'reload'), 'every precache request must use cache: reload');
    assert.equal(sw.skipped(), 0, 'the new version must wait for the user to accept the update');
  });

  it('fails the install when an app file is missing, so the old working cache is kept', async () => {
    const sw = makeSw({ failing: ['/modules/main.js'] });
    await assert.rejects(sw.dispatch('install'), /Failed to precache app shell/);
    const sw2 = makeSw({ failing: ['/app.css'] });
    await assert.rejects(sw2.dispatch('install'), /Failed to precache app shell/);
  });

  it('still installs when only an optional file (a vendor image) is missing', async () => {
    const sw = makeSw({ failing: ['/vendor/leaflet/images/layers.png'] });
    await sw.dispatch('install');
    assert.equal(sw.skipped(), 0);
  });

  it('skips waiting only when the page asks for it', async () => {
    const sw = makeSw();
    await sw.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    assert.equal(sw.skipped(), 1);
    await sw.dispatch('message', { data: { type: 'OTHER' } });
    assert.equal(sw.skipped(), 1);
  });
});

describe('service worker serving', () => {
  const name = /const BUILD_HASH = '([^']+)'/.exec(SW)[1];
  const cn = 'app-' + name;
  const cached = { 'https://app.test/modules/main.js': { body: 'cached-js' }, 'https://app.test/index.html': { body: 'cached-shell' } };

  it('serves a cached app file without touching the network (no one-file-at-a-time refresh)', async () => {
    const sw = makeSw({ preCaches: { [cn]: cached } });
    const e = await sw.dispatch('fetch', { request: { url: 'https://app.test/modules/main.js', method: 'GET', mode: 'cors' } });
    const res = await e.response;
    assert.equal(res.body, 'cached-js');
    assert.equal(sw.fetchLog.length, 0);
  });

  it('serves the cached page on navigation without refreshing it separately from its files', async () => {
    const sw = makeSw({ preCaches: { [cn]: cached } });
    const e = await sw.dispatch('fetch', { request: { url: 'https://app.test/', method: 'GET', mode: 'navigate' } });
    assert.equal((await e.response).body, 'cached-shell');
    assert.equal(sw.fetchLog.length, 0);
  });

  it('falls back to the network for a file that is not cached yet, and keeps it', async () => {
    const sw = makeSw({ preCaches: { [cn]: {} } });
    const e = await sw.dispatch('fetch', { request: { url: 'https://app.test/modules/new.js', method: 'GET', mode: 'cors' } });
    assert.match((await e.response).body, /network:/);
    assert.equal(sw.stores.get(cn).size, 1);
  });

  it('never serves cached files during local development', async () => {
    const sw = makeSw({ host: 'localhost', preCaches: { [cn]: cached } });
    const e = await sw.dispatch('fetch', { request: { url: 'https://localhost/modules/main.js', method: 'GET', mode: 'cors' } });
    assert.equal(e.responded, undefined);
  });

  it('removes older caches only when the new version activates', async () => {
    const sw = makeSw({ preCaches: { 'app-old': { a: {} }, [cn]: {} } });
    await sw.dispatch('activate');
    assert.deepEqual([...sw.stores.keys()], [cn]);
  });
});

describe('build version key', () => {
  const files = (idx, css = 'a{}') => [['index.html', idx], ['app.1.css', css], ['main-X.js', 'js']];

  it('is stable for identical content regardless of file order', () => {
    assert.equal(computeBuildKey(files('<html>')), computeBuildKey(files('<html>').reverse()));
  });
  it('changes when ONLY index.html changes (the case that used to ship no update)', () => {
    assert.notEqual(computeBuildKey(files('<html>')), computeBuildKey(files('<html> ')));
  });
  it('changes when a file is renamed or its content changes', () => {
    assert.notEqual(computeBuildKey(files('x')), computeBuildKey(files('x', 'b{}')));
    assert.notEqual(computeBuildKey([['a.js', 'x']]), computeBuildKey([['b.js', 'x']]));
  });
  it('does not confuse a name/content boundary shift', () => {
    assert.notEqual(computeBuildKey([['ab', 'c']]), computeBuildKey([['a', 'bc']]));
  });
});

describe('build html rewriting fails loudly', () => {
  it('replaces when the tag is present', () => {
    assert.equal(replaceOrThrow('<link href="app.css">', 'app.css', 'app.1.css', 'css'), '<link href="app.1.css">');
  });
  it('throws instead of silently shipping a page that points at missing files', () => {
    assert.throws(() => replaceOrThrow('<link href="style.css">', 'app.css', 'app.1.css', 'stylesheet'), /stylesheet.*out of step/);
  });
});
