import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldFullPass, collectionNeedsMerge, createPingCoalescer, FULL_PASS_TTL_MS } from '../modules/sync-plan.js';

const sync = readFileSync(new URL('../modules/sync.js', import.meta.url), 'utf8');

describe('shouldFullPass', () => {
  it('is full on the first pull, when forced, and after the interval', () => {
    assert.equal(shouldFullPass({ lastFullPassAt: 0, now: 1000 }), true);
    assert.equal(shouldFullPass({ forceDownload: true, lastFullPassAt: 900, now: 1000 }), true);
    assert.equal(shouldFullPass({ lastFullPassAt: 1000, now: 1000 + FULL_PASS_TTL_MS }), true);
  });
  it('is light in between', () => {
    assert.equal(shouldFullPass({ lastFullPassAt: 1000, now: 1000 + FULL_PASS_TTL_MS - 1 }), false);
  });
});

describe('collectionNeedsMerge', () => {
  it('skips a collection only when nothing changed in a light pass', () => {
    assert.equal(collectionNeedsMerge({ fullPass: false, cloudCount: 0, compacted: false }), false);
    assert.equal(collectionNeedsMerge({ fullPass: false, cloudCount: 3 }), true);
    assert.equal(collectionNeedsMerge({ fullPass: false, cloudCount: 0, compacted: true }), true);
    assert.equal(collectionNeedsMerge({ fullPass: true, cloudCount: 0 }), true);
  });
});

describe('createPingCoalescer', () => {
  function rig() {
    const timers = [];
    const runs = [];
    let chain = Promise.resolve();
    const queue = { run(fn) { chain = chain.then(fn); return chain; } };
    const onPing = createPingCoalescer({ queue, pull: async () => { runs.push('pull'); }, delayMs: 500, setTimer: (f) => timers.push(f) });
    return { onPing, timers, runs, settle: () => chain };
  }
  it('turns a burst of pings into one pull', async () => {
    const r = rig();
    assert.equal(r.onPing(), true);
    assert.equal(r.onPing(), false);
    assert.equal(r.onPing(), false);
    assert.equal(r.timers.length, 1);
    r.timers[0]();
    await r.settle();
    assert.deepEqual(r.runs, ['pull']);
  });
  it('allows another pull for a ping that arrives after the first one started', async () => {
    const r = rig();
    r.onPing();
    r.timers[0]();
    await r.settle();
    assert.equal(r.onPing(), true);
    r.timers[1]();
    await r.settle();
    assert.deepEqual(r.runs, ['pull', 'pull']);
  });
});

describe('sync.js wiring', () => {
  it('uses the coalescer for pings instead of a pull per ping', () => {
    assert.match(sync, /const _onPingPull = createPingCoalescer\(/);
    assert.match(sync, /_onPingPull\(\);/);
    assert.doesNotMatch(sync, /pullDataFromCloud\(true\)\.catch\(\(\) => \{\}\);\n\s*\}, 500\);/);
  });
  it('reads the deletion list only on full passes, and merges only changed collections', () => {
    assert.match(sync, /_mergeAndPersist\(cloudData, \{ fullPass: shouldFullPass\(\{ forceDownload, lastFullPassAt: _lastFullPassAt \}\) \}\)/);
    assert.match(sync, /export async function _mergeAndPersist\(cloudData, \{ fullPass = true \} = \{\}\) \{\n  if \(fullPass\) \{/);
    assert.match(sync, /!_unchanged\.has\(k\)/);
  });
  it('checks deleted ids with a Set, not an array scan', () => {
    assert.match(sync, /const _deletedSetNow = new Set\(/);
    assert.match(sync, /!_deletedSetNow\.has\(item\.id\)/);
    assert.doesNotMatch(sync, /_deletedArr\.includes/);
  });
  it('starts the photo, ledger and category reads together with the main reads', () => {
    assert.match(sync, /const photosPromise = /);
    assert.match(sync, /const categoryPromises = CATEGORY_LIST_KEYS\.map/);
    assert.match(sync, /await Promise\.all\(categoryPromises\)/);
  });
  it('does not reload every local record just to detect a returning user', () => {
    assert.match(sync, /if \(_returningCached && hasInitialized\) return 'returning';/);
  });
});

import { runInWaves } from '../modules/sync-plan.js';

describe('runInWaves', () => {
  it('runs tasks in parallel waves of the given size and keeps going in order', async () => {
    let running = 0; let peak = 0; const done = [];
    const task = (n) => async () => {
      running++; peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 5));
      running--; done.push(n);
    };
    await runInWaves([1, 2, 3, 4, 5, 6, 7].map(task), 3);
    assert.equal(peak, 3);
    assert.equal(done.length, 7);
  });
  it('stops at the first failing wave so nothing is marked uploaded', async () => {
    const ran = [];
    const ok = (n) => async () => { ran.push(n); };
    const bad = async () => { throw new Error('commit failed'); };
    await assert.rejects(runInWaves([ok(1), bad, ok(3), ok(4)], 2), /commit failed/);
    assert.deepEqual(ran.includes(4), false);
  });
});

describe('upload path wiring', () => {
  it('loads only the collections that have local changes', () => {
    assert.match(sync, /const _dirtyKeys = _keys\.filter\(k => DeltaSync\.isDirty\(k\)\);/);
    assert.match(sync, /const _batch = _dirtyKeys\.length \? await sqliteStore\.getBatch\(_dirtyKeys\) : new Map\(\);/);
  });
  it('commits batches in parallel waves instead of one at a time', () => {
    assert.match(sync, /await runInWaves\(batches\.map\(batch => \(\) => batch\.commit\(\)\)\);/);
    assert.match(sync, /await runInWaves\(photoBatches\.map/);
    assert.doesNotMatch(sync, /for \(const batch of batches\) \{\n\s*await batch\.commit\(\);/);
  });
});
