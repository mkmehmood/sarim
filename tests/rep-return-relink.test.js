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
});
