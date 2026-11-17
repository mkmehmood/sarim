import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function setup() {
  const store = new Map([['a', '1'], ['sarim_theme_hint', 'dark']]);
  const deletedIdb = [];
  const removedOpfs = [];
  const deletedCaches = [];
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  };
  globalThis.sessionStorage = { clear() {} };
  globalThis.document = { cookie: 'x=1; y=2' };
  globalThis.indexedDB = {
    databases: async () => [{ name: 'extra_db' }],
    deleteDatabase: (n) => {
      deletedIdb.push(n);
      const req = {};
      setTimeout(() => req.onsuccess && req.onsuccess(), 0);
      return req;
    },
  };
  const root = {
    entries: async function* () { yield ['other.bin', {}]; },
    removeEntry: async (n) => { removedOpfs.push(n); },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { getDirectory: async () => root } }, configurable: true });
  globalThis.window = globalThis;
  globalThis.caches = {
    keys: async () => ['app-abc', 'gz-device-anchor-v1', 'runtime'],
    delete: async (k) => { deletedCaches.push(k); return true; },
  };
  return { store, deletedIdb, removedOpfs, deletedCaches };
}

describe('wipeAllLocalData', () => {
  it('clears web storage, IndexedDB, OPFS and non-shell caches', async () => {
    const s = setup();
    const { wipeAllLocalData } = await import('../modules/data-wipe.js');
    await wipeAllLocalData();
    assert.equal(s.store.has('a'), false);
    assert.equal(s.store.get('sarim_theme_hint'), 'dark');
    assert.ok(s.deletedIdb.includes('gznd_sqlite_store'));
    assert.ok(s.deletedIdb.includes('extra_db'));
    assert.ok(s.removedOpfs.includes('naswar_dealers.sqlite'));
    assert.ok(s.removedOpfs.includes('other.bin'));
    assert.deepEqual(s.deletedCaches.sort(), ['gz-device-anchor-v1', 'runtime']);
  });
});
