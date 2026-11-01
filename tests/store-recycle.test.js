import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
const data = new Map();
const sqliteStore = {
  async get(k, def) { return data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : def; },
  async set(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
};
const ensureArray = (v) => (Array.isArray(v) ? v : []);
mock.module('../modules/business.js', { namedExports: { sqliteStore, ensureArray } });
globalThis.window = {};
const R = await import('../modules/store-recycle.js');
const reset = (o = {}) => { data.clear(); globalThis.window = {}; Object.entries(o).forEach(([k, v]) => data.set(k, v)); };
describe('ledger and formula store use the recycle bin', () => {
  beforeEach(() => reset());
  it('knows both collections and nothing else', () => {
    assert.equal(R.isBinStore('daily_ledger'), true);
    assert.equal(R.isBinStore('formulas'), true);
    assert.equal(R.isBinStore('sales'), false);
    assert.equal(R.isBinStore('constructor'), false);
  });
  it('describes a ledger entry and a transfer', () => {
    const a = R.describeBinRecord('daily_ledger', { type: 'OUT', party: 'Ali', category: 'Rent', mode: 'Cash', date: '2026-01-02', amount: 500 }, String);
    assert.equal(a.displayName, 'Ali');
    assert.equal(a.displayDetail, '↑ OUT · Rent · Cash · 2026-01-02');
    assert.equal(a.displayAmount, '₨500');
    const t = R.describeBinRecord('daily_ledger', { type: 'TRANSFER', mode: 'Cash', toMode: 'Bank', amount: 9 }, String);
    assert.equal(t.displayName, 'Transfer – Cash → Bank');
  });
  it('describes a formula by name and ingredient count', () => {
    const f = R.describeBinRecord('formulas', { name: 'Mix A', ingredients: [{}, {}] });
    assert.equal(f.displayName, 'Mix A');
    assert.equal(f.displayDetail, '2 ingredients');
    assert.equal(R.describeBinRecord('formulas', { name: 'X', ingredients: [{}] }).displayDetail, '1 ingredient');
  });
  it('cleans tombstone fields and keeps the original id on restore', () => {
    const c = R.cleanForRestore({ id: 'dl_-1', amount: 5, deletedAt: 1, deleted_by: 'Admin', tombstoned_at: 1, deletion_version: '2.0' }, 99);
    assert.equal(c.id, 'dl_-1');
    assert.equal(c.updatedAt, 99);
    assert.equal(c.deletedAt, undefined);
    assert.equal(c.deleted_by, undefined);
  });
  it('mergeRestored never duplicates an id', () => {
    const out = R.mergeRestored([{ id: 'a', v: 1 }, { id: 'b', v: 2 }], { id: 'a', v: 3 });
    assert.deepEqual(out.map((r) => r.id).sort(), ['a', 'b']);
    assert.equal(out.find((r) => r.id === 'a').v, 3);
  });
  it('trashRecord registers a deletion under the right collection', async () => {
    const calls = [];
    globalThis.window = { registerDeletion: async (...a) => { calls.push(a); } };
    assert.equal(await R.trashRecord('daily_ledger', { id: 'dl_-1' }), true);
    assert.equal(await R.trashRecord('sales', { id: 'x' }), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'dl_-1');
    assert.equal(calls[0][1], 'daily_ledger');
  });
  it('recovers a ledger entry from its tombstone and clears the tombstone', async () => {
    reset({ deletions: [{ id: 'dl_-1', recordId: 'dl_-1', collection: 'daily_ledger', snapshot: { id: 'dl_-1', amount: 7, deletedAt: 5 } }] });
    const restored = [];
    const purged = [];
    globalThis.window = {
      restoreLedgerEntry: async (r) => { restored.push(r); return true; },
      purgeRecoveredId: async (...a) => { purged.push(a); },
    };
    assert.equal(await R.recoverStoreRecord('dl_-1', 'daily_ledger'), true);
    assert.equal(restored[0].id, 'dl_-1');
    assert.equal(restored[0].deletedAt, undefined);
    assert.deepEqual(purged[0], ['dl_-1', 'daily_ledger', null, 'dl_-1']);
  });
  it('keeps the tombstone when the restore fails or there is no snapshot', async () => {
    reset({ deletions: [{ id: 'f1', collection: 'formulas', snapshot: { id: 'f1', name: 'A' } }, { id: 'f2', collection: 'formulas' }] });
    const purged = [];
    globalThis.window = { restoreFormulaEntry: async () => false, purgeRecoveredId: async (...a) => { purged.push(a); } };
    assert.equal(await R.recoverStoreRecord('f1', 'formulas'), false);
    assert.equal(await R.recoverStoreRecord('f2', 'formulas'), false);
    assert.equal(purged.length, 0);
  });
});
