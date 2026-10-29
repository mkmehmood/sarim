import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickReturnsCovered } from '../modules/rep-return-link.js';

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
