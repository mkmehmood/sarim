import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedIdPeers, syncFix, syncMessage, syncOutcome, touchPeers } from '../modules/overview-sync.js';

const deps = (over = {}) => {
  const calls = [];
  return {
    calls,
    d: {
      signedIn: () => true,
      online: () => true,
      flush: async () => { calls.push('flush'); },
      push: async () => { calls.push('push'); },
      ping: async (p) => { calls.push(['ping', p]); },
      pending: () => 0,
      collectionKey: (c) => `fs_${c}`,
      ...over,
    },
  };
};

describe('a fix is pushed to the cloud and other devices are told', () => {
  it('flushes the queue, pushes, then pings the changed collection with the fixed ids', async () => {
    const { calls, d } = deps();
    const out = await syncFix({ col: 'sales', ids: ['a', 'b'], deps: d });
    assert.equal(out, 'synced');
    assert.deepEqual(calls, ['flush', 'push', 'flush', ['ping', { fs_sales: ['a', 'b'] }]]);
  });

  it('the ping goes out after the cloud writes finish, never before', async () => {
    const { calls, d } = deps();
    await syncFix({ col: 'rep', ids: ['x'], deps: d });
    assert.ok(calls.findIndex((c) => Array.isArray(c)) > calls.lastIndexOf('flush') - 1);
    assert.equal(calls.at(-1)[0], 'ping');
  });

  it('with no ids the ping names the collection with null so others pull everything', async () => {
    const { calls, d } = deps();
    await syncFix({ col: 'transactions', ids: [], deps: d });
    assert.deepEqual(calls.at(-1), ['ping', { fs_transactions: null }]);
  });

  it('offline: nothing is pushed and the result says it is queued for later', async () => {
    const { calls, d } = deps({ online: () => false });
    assert.equal(await syncFix({ col: 'sales', ids: ['a'], deps: d }), 'queued');
    assert.deepEqual(calls, []);
  });

  it('signed out: the fix stays on this device', async () => {
    const { calls, d } = deps({ signedIn: () => false });
    assert.equal(await syncFix({ col: 'sales', ids: ['a'], deps: d }), 'local');
    assert.deepEqual(calls, []);
  });

  it('a failing push still pings, and leftover queued writes report as queued', async () => {
    const { calls, d } = deps({ push: async () => { throw new Error('boom'); }, pending: () => 2 });
    assert.equal(await syncFix({ col: 'sales', ids: ['a'], deps: d }), 'queued');
    assert.equal(calls.at(-1)[0], 'ping');
  });

  it('outcome and wording', () => {
    assert.equal(syncOutcome({ online: true, signedIn: true, pending: 0 }), 'synced');
    assert.equal(syncOutcome({ online: true, signedIn: true, pending: 1 }), 'queued');
    assert.match(syncMessage('synced', 'Saved'), /^Saved and synced to your other devices$/);
    assert.match(syncMessage('queued', 'Saved'), /back online/);
    assert.match(syncMessage('local', 'Saved'), /on this device/);
  });
});

describe('giving a record a new id keeps the cloud copy of the old id correct', () => {
  it('finds the other live records that still carry the old id', () => {
    const rows = [{ id: 'x', n: 1 }, { id: 'x', n: 2 }, { id: 'x', n: 3, isDeleted: true }, { id: 'y' }];
    assert.deepEqual(sharedIdPeers(rows, 'x', 0).map((r) => r.n), [2]);
  });

  it('stamps the peers so their version wins over the stale cloud doc', () => {
    const rows = [{ id: 'new' }, { id: 'x', updatedAt: 1 }];
    const peers = touchPeers(rows, 'x', 0, 99);
    assert.equal(peers.length, 1);
    assert.equal(rows[1].updatedAt, 99);
  });

  it('nothing to touch for a missing id', () => {
    assert.deepEqual(touchPeers([{ id: 'a' }], null, 0, 1), []);
  });
});

describe('overview.js uses it on every fix path', () => {
  const src = readFileSync(new URL('../modules/overview.js', import.meta.url), 'utf8');
  it('single fix, repair, repair all and delete all go through syncFix and report the result', () => {
    assert.ok((src.match(/syncFix\(/g) || []).length >= 3);
    assert.equal((src.match(/syncMessage\(/g) || []).length, 4);
    assert.match(src, /touchPeers\(arr, oldId, idx, stamp\)/);
  });
});
