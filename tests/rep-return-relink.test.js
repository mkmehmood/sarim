import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickReturnsCovered, planRepReturnRelink, runRepReturnRelinkMigration } from '../modules/rep-return-link.js';

const R = (id, date, ret, exp, created = 1000, extra = {}) => ({ id, isRepReturn: true, currentRepProfile: 'admin', customerName: 'NOMAN', date, returnedQty: ret, expiredQty: exp, createdAt: created, timestamp: created, ...extra });
const C = (id, date, returned, expired, created, ids = [], sales = []) => ({ id, seller: 'NOMAN', date, returned, expired, createdAt: created, timestamp: created, linkedRepReturnIds: ids, linkedSalesIds: sales });

describe('pickReturnsCovered', () => {
  it('links only returns the entered quantities cover, oldest first', () => {
    const p = [R('b', '2026-10-14', 3, 3), R('a', '2026-10-13', 0.5, 3)];
    assert.deepEqual(pickReturnsCovered(p, 0.5, 3).map(r => r.id), ['a']);
    assert.deepEqual(pickReturnsCovered(p, 3.5, 6).map(r => r.id), ['a', 'b']);
    assert.deepEqual(pickReturnsCovered(p, 0, 0), []);
  });
});

describe('exact cover and skipping', () => {
  it('prefers the subset that matches the entered quantities exactly', () => {
    const p = [R('a', '2026-10-10', 2, 0), R('b', '2026-10-11', 2, 0), R('c', '2026-10-12', 3, 0)];
    assert.deepEqual(pickReturnsCovered(p, 3, 0).map(r => r.id), ['c']);
  });
  it('an oversized older return does not block later ones', () => {
    const p = [R('old', '2026-10-15', 5, 5), R('d24', '2026-10-24', 0, 1.5), R('d25', '2026-10-25', 4.5, 5), R('d26', '2026-10-26', 1.89, 0)];
    assert.deepEqual(pickReturnsCovered(p, 6.39, 6.5).map(r => r.id), ['d24', 'd25', 'd26']);
  });
  it('falls back to every return that fits when the totals are not exact', () => {
    const p = [R('a', '2026-10-10', 1, 0), R('b', '2026-10-11', 1, 0)];
    assert.deepEqual(pickReturnsCovered(p, 5, 0).map(r => r.id), ['a', 'b']);
  });
  it('handles float quantities exactly', () => {
    const p = [R('a', '2026-10-10', 0.1, 0), R('b', '2026-10-11', 0.2, 0)];
    assert.deepEqual(pickReturnsCovered(p, 0.3, 0).map(r => r.id), ['a', 'b']);
  });
  it('relinks a window with a blocker return through the migration plan', () => {
    const sales = [R('old', '2026-10-15', 5, 5, 900), R('d24', '2026-10-24', 0, 1.5, 900), R('d25', '2026-10-25', 4.5, 5, 900)];
    const { changes } = planRepReturnRelink([C('c1', '2026-10-26', 4.5, 6.5, 1000)], sales);
    assert.deepEqual(changes[0].ids, ['d24', 'd25']);
  });
  it('re-runs after an old v1 flag and stays one-time afterwards', async () => {
    const data = new Map([['repReturnRelink.v1', { ok: true }], ['calculator', [C('c1', '2026-10-26', 4.5, 6.5, 1000)]], ['sales', [R('d24', '2026-10-24', 0, 1.5, 900), R('d25', '2026-10-25', 4.5, 5, 900)]]]);
    const store = { get: async (k, d) => (data.has(k) ? structuredClone(data.get(k)) : d), set: async (k, v) => { data.set(k, v); } };
    const saved = [];
    const a = await runRepReturnRelinkMigration({ store, save: async (c, all, one) => { saved.push(one.linkedRepReturnIds); } });
    assert.equal(a.changed, 1);
    assert.deepEqual(saved[0], ['d24', 'd25']);
    assert.equal((await runRepReturnRelinkMigration({ store, save: async () => {} })).skipped, true);
  });
});

describe('planRepReturnRelink', () => {
  it('relinks a return created before the calc whose device date falls in its window', () => {
    const sales = [{ id: 's1', date: '2026-10-14' }, R('r1', '2026-10-14', 3.5, 10, 900)];
    const { changes } = planRepReturnRelink([C('c1', '2026-10-12', 3.5, 10, 1000, [], ['s1'])], sales);
    assert.deepEqual(changes[0].ids, ['r1']);
  });
  it('leaves a return created after the calc pending', () => {
    const { changes } = planRepReturnRelink([C('c1', '2026-10-14', 5, 5, 1000)], [R('r1', '2026-10-13', 1, 1, 2000)]);
    assert.equal(changes.length, 0);
  });
  it('never exceeds the quantities the calc recorded', () => {
    const { changes } = planRepReturnRelink([C('c1', '2026-10-14', 1, 3, 1000)], [R('r1', '2026-10-13', 0.5, 3, 900), R('r2', '2026-10-14', 3, 3, 900)]);
    assert.deepEqual(changes[0].ids, ['r1']);
  });
  it('drops dangling and duplicate links, keeps valid ones', () => {
    const sales = [R('r1', '2026-10-13', 1, 1, 900)];
    const { changes } = planRepReturnRelink([C('c1', '2026-10-13', 1, 1, 1000, ['r1', 'gone']), C('c2', '2026-10-14', 1, 1, 1100, ['r1'])], sales);
    assert.deepEqual(changes.map(c => [c.entry.id, c.ids]), [['c1', ['r1']], ['c2', []]]);
  });
});

describe('runRepReturnRelinkMigration', () => {
  it('runs once and is a no-op the second time', async () => {
    const data = new Map([['calculator', [C('c1', '2026-10-14', 1, 1, 1000)]], ['sales', [R('r1', '2026-10-13', 1, 1, 900)]]]);
    const store = { get: async (k, d) => (data.has(k) ? structuredClone(data.get(k)) : d), set: async (k, v) => { data.set(k, v); } };
    let saves = 0;
    const save = async () => { saves++; };
    const a = await runRepReturnRelinkMigration({ store, save });
    assert.equal(a.changed, 1);
    const b = await runRepReturnRelinkMigration({ store, save });
    assert.equal(b.skipped, true);
    assert.equal(saves, 1);
  });
});
