import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { debtDelta, debtNeedsGross } from '../modules/finance.js';

const data = new Map();
const sqliteStore = {
  async get(k, def) { return data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : def; },
  async set(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
};
const ensureArray = (v) => (Array.isArray(v) ? v : []);

mock.module('../modules/business.js', {
  namedExports: { sqliteStore, ensureArray, getTimestamp: () => 1, ensureRecordIntegrity: (r) => r, debtDelta, debtNeedsGross },
});
mock.module('../modules/sync.js', {
  namedExports: {
    async unifiedSave() { return true; },
    async unifiedDelete() { return true; },
  },
});

globalThis.window = {};
const G = await import('../modules/link-guards.js');

const seed = (o) => { data.clear(); Object.entries(o).forEach(([k, v]) => data.set(k, v)); };

describe('rep return records and the calculator', () => {
  beforeEach(() => seed({}));

  const ret = { id: 'r1', isRepReturn: true, paymentType: 'REP_RETURN', customerName: 'ALI', expiredQty: 2, returnedQty: 3, currentRepProfile: 'admin' };

  it('a rep return that is not reconciled yet can be deleted', async () => {
    seed({ sales: [ret], calculator: [] });
    assert.equal(await G.getSaleBlockReason('r1', 'customer'), null);
  });

  it('a rep return reconciled in a calculator record is locked until that record is deleted', async () => {
    seed({ sales: [ret], calculator: [{ id: 'c1', seller: 'ALI', date: '2026-10-13', linkedRepReturnIds: ['r1'] }] });
    const reason = await G.getSaleBlockReason('r1', 'customer');
    assert.match(reason, /already settled/);
    assert.match(reason, /Delete that calculator record first/);
  });

  it('a rep return carries no debt', () => {
    assert.equal(debtNeedsGross({ ...ret, creditReceived: true }), false);
    assert.equal(debtDelta({ ...ret, creditReceived: true }, 0), 0);
  });
});
