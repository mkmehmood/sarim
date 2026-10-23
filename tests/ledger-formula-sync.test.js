import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUX_STATE, collectAuxBackupFields, applyAuxBackupFields, mergeNewestById, mergeFormulaLists, keepUnsyncedCalcs } from '../modules/link-graph.js';
const read = (f) => readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');
function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { async get(k) { return m.has(k) ? m.get(k) : undefined; }, async set(k, v) { m.set(k, v); }, _m: m };
}
describe('daily ledger is registered for backup and cloud sync', () => {
  it('has an aux entry with its own cloud doc and timestamp', () => {
    const s = AUX_STATE.find((x) => x.sqlite === 'daily_ledger');
    assert.ok(s);
    assert.equal(s.tsKey, 'daily_ledger_timestamp');
    assert.equal(s.firestore.doc, 'daily_ledger/entries');
  });
  it('is captured by collectAuxBackupFields', async () => {
    const out = await collectAuxBackupFields(memStore({ daily_ledger: [{ id: 'a', amount: 5 }] }));
    assert.deepEqual(out.daily_ledger, [{ id: 'a', amount: 5 }]);
  });
  it('merge restore keeps the newest copy of each entry and never drops local ones', async () => {
    const dev = memStore({ daily_ledger: [{ id: 'a', amount: 1, updatedAt: 10 }, { id: 'b', amount: 2, updatedAt: 5 }] });
    const data = { daily_ledger: [{ id: 'a', amount: 9, updatedAt: 20 }, { id: 'c', amount: 3, updatedAt: 1 }] };
    const written = await applyAuxBackupFields(data, dev, 77, 'merge');
    assert.deepEqual(written, ['daily_ledger']);
    const byId = Object.fromEntries(dev._m.get('daily_ledger').map((r) => [r.id, r.amount]));
    assert.deepEqual(byId, { a: 9, b: 2, c: 3 });
    assert.equal(dev._m.get('daily_ledger_timestamp'), 77);
  });
  it('replace restore makes the backup win', async () => {
    const dev = memStore({ daily_ledger: [{ id: 'x' }] });
    await applyAuxBackupFields({ daily_ledger: [{ id: 'a' }] }, dev, 1, 'replace');
    assert.deepEqual(dev._m.get('daily_ledger'), [{ id: 'a' }]);
  });
  it('mergeNewestById prefers the later stamp', () => {
    assert.deepEqual(mergeNewestById([{ id: 1, v: 'L', updatedAt: 5 }], [{ id: 1, v: 'B', updatedAt: 2 }]), [{ id: 1, v: 'L', updatedAt: 5 }]);
  });
});
describe('formula corrections and batches survive backup restore', () => {
  const calc = (id, kind, t) => ({ id, kind, createdAt: t, updatedAt: t });
  it('merge restore adds saved batches and corrections to an existing formula', async () => {
    const dev = memStore({ formulas: [{ id: 'f1', name: 'Std', savedCalcs: [calc('c1', 'batch', 1)] }] });
    const data = { formulas: [{ id: 'f1', name: 'Std', savedCalcs: [calc('c1', 'batch', 1), calc('c2', 'fix', 2)] }] };
    await applyAuxBackupFields(data, dev, 5, 'merge');
    assert.deepEqual(dev._m.get('formulas')[0].savedCalcs.map((c) => c.id).sort(), ['c1', 'c2']);
  });
  it('mergeFormulaLists keeps local formula fields and takes the newer calc copy', () => {
    const out = mergeFormulaLists(
      [{ id: 'f1', name: 'Local', savedCalcs: [{ id: 'c1', name: 'old', updatedAt: 1 }] }],
      [{ id: 'f1', name: 'Other', savedCalcs: [{ id: 'c1', name: 'new', updatedAt: 3 }] }, { id: 'f2', name: 'Fresh' }]
    );
    assert.equal(out[0].name, 'Local');
    assert.equal(out[0].savedCalcs[0].name, 'new');
    assert.equal(out[1].id, 'f2');
  });
  it('keepUnsyncedCalcs preserves calcs made on this device since the last sync', () => {
    const cloud = [{ id: 'f1', savedCalcs: [calc('c1', 'batch', 1)] }];
    const local = [{ id: 'f1', savedCalcs: [calc('c1', 'batch', 1), calc('c9', 'fix', 50)] }];
    const r = keepUnsyncedCalcs(cloud, local, 10);
    assert.equal(r.changed, true);
    assert.deepEqual(r.list[0].savedCalcs.map((c) => c.id), ['c9', 'c1']);
  });
  it('keepUnsyncedCalcs lets cloud deletions stand for calcs already synced', () => {
    const cloud = [{ id: 'f1', savedCalcs: [] }];
    const local = [{ id: 'f1', savedCalcs: [calc('c1', 'batch', 1)] }];
    const r = keepUnsyncedCalcs(cloud, local, 10);
    assert.equal(r.changed, false);
    assert.deepEqual(r.list[0].savedCalcs, []);
  });
});
describe('sync.js and the ledger module are wired together', () => {
  const sync = read('sync.js');
  const ledger = read('daily-ledger.js');
  it('uploads, downloads and listens for the ledger doc', () => {
    assert.match(sync, /collection\('daily_ledger'\)\.doc\('entries'\)\.set|userRef\.collection\('daily_ledger'\)\.doc\('entries'\),/);
    assert.match(sync, /_applyDailyLedgerFromCloud\(dailyLedgerSnap\.data\(\)\)/);
    assert.match(sync, /collection\('daily_ledger'\)\.doc\('entries'\)\.onSnapshot/);
    assert.match(sync, /collectionsUploaded\.add\('daily_ledger'\)/);
  });
  it('the ledger module stamps its timestamp and requests a sync on every write', () => {
    assert.match(ledger, /daily_ledger_timestamp/);
    assert.match(ledger, /triggerAutoSync\(\)/);
  });
});
