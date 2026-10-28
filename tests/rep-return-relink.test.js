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

describe('relink skips returns that do not fit instead of stopping', () => {
  it('links the later return when an older one is too big for the calc', () => {
    const p = [R('old', '2026-10-15', 5, 5, 800), R('d17', '2026-10-17', 0, 3, 900)];
    assert.deepEqual(pickReturnsCovered(p, 0, 3).map(r => r.id), ['d17']);
    const { changes } = planRepReturnRelink([C('c1', '2026-10-17', 0, 3, 1000)], p);
    assert.deepEqual(changes[0].ids, ['d17']);
  });
  it('matches seller names ignoring case and spacing', () => {
    const { changes } = planRepReturnRelink([C('c1', '2026-10-17', 0, 3, 1000)], [R('d17', '2026-10-17', 0, 3, 900, { customerName: ' noman ' })]);
    assert.deepEqual(changes[0].ids, ['d17']);
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
