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

const collection = (extra = {}) => ({
  id: 'c1', paymentType: 'COLLECTION', isCollection: true, customerName: 'ALI',
  currentRepProfile: 'admin', salesRep: 'NONE', totalValue: 0, ...extra,
});

describe('collection records that carry expired stock', () => {
  beforeEach(() => seed({}));

  it('can be deleted while the CHORA it added is still in stock', async () => {
    seed({ sales: [collection({ expiredQty: 3, expiredApplied: true })], inventory: [{ id: 'm1', name: 'CHORA', quantity: 10 }], calculator: [] });
    assert.equal(await G.getSaleBlockReason('c1', 'customer'), null);
  });

  it('cannot be deleted once part of that CHORA has been used', async () => {
    seed({ sales: [collection({ expiredQty: 3, expiredApplied: true })], inventory: [{ id: 'm1', name: 'CHORA', quantity: 1 }], calculator: [] });
    const reason = await G.getSaleBlockReason('c1', 'customer');
    assert.match(reason, /Only 1 kg of CHORA is left/);
    assert.match(reason, /added 3 kg/);
  });

  it('is not blocked when editing (the save checks the exact decrease instead)', async () => {
    seed({ sales: [collection({ expiredQty: 3, expiredApplied: true })], inventory: [{ id: 'm1', name: 'CHORA', quantity: 1 }], calculator: [] });
    assert.equal(await G.getSaleBlockReason('c1', 'customer', { forEdit: true }), null);
  });

  it('is not blocked when its expired quantity never reached CHORA', async () => {
    seed({ sales: [collection({ expiredQty: 3, expiredApplied: false })], inventory: [{ id: 'm1', name: 'CHORA', quantity: 0 }], calculator: [] });
    assert.equal(await G.getSaleBlockReason('c1', 'customer'), null);
  });

  it('a plain collection with no expired quantity is unaffected', async () => {
    seed({ sales: [collection({ totalValue: 500 })], inventory: [{ id: 'm1', name: 'CHORA', quantity: 0 }], calculator: [] });
    assert.equal(await G.getSaleBlockReason('c1', 'customer'), null);
  });

  it('an expired-only collection (no cash) carries no debt', () => {
    const c = collection({ expiredQty: 2, expiredApplied: true });
    assert.equal(debtNeedsGross(c), false);
    assert.ok(debtDelta(c, 0) === 0, 'zero cash collection must not move the customer balance');
  });
});

describe('getExpiredDeleteBlockReason', () => {
  beforeEach(() => seed({ inventory: [{ id: 'm1', name: 'chora', quantity: 2 }] }));

  it('reads calculator entries (expired)', async () => {
    assert.match(await G.getExpiredDeleteBlockReason({ expired: 5, expiredApplied: true }), /Only 2 kg of CHORA is left/);
    assert.equal(await G.getExpiredDeleteBlockReason({ expired: 2, expiredApplied: true }), null);
  });

  it('reads collection records (expiredQty)', async () => {
    assert.match(await G.getExpiredDeleteBlockReason({ expiredQty: 5, expiredApplied: true }), /Only 2 kg of CHORA is left/);
    assert.equal(await G.getExpiredDeleteBlockReason({ expiredQty: 2, expiredApplied: true }), null);
  });

  it('ignores records with no expired quantity', async () => {
    assert.equal(await G.getExpiredDeleteBlockReason({}), null);
    assert.equal(await G.getExpiredDeleteBlockReason(null), null);
  });
});
