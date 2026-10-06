import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// The real link-guards.js runs here against an in-memory store. Only its two heavy imports are replaced.
const data = new Map();
const saves = [];
const sqliteStore = {
  async get(k, def) { return data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : def; },
  async set(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
};
const ensureArray = (v) => Array.isArray(v) ? v : [];
let clock = 1000;

mock.module('../modules/business.js', {
  namedExports: { sqliteStore, ensureArray, getTimestamp: () => ++clock, ensureRecordIntegrity: (r) => r },
});
mock.module('../modules/sync.js', {
  namedExports: {
    // mirrors the real contract: persist the whole array, remember which ids were meant to sync
    async unifiedSave(key, arr, rec, ids) { await sqliteStore.set(key, arr); saves.push({ key, ids: rec ? [rec.id] : ids }); return true; },
  },
});

const G = await import('../modules/link-guards.js');

const seed = (o) => { data.clear(); saves.length = 0; Object.entries(o).forEach(([k, v]) => data.set(k, v)); };
const tomb = (collection, snapshot) => ({ id: snapshot.id, recordId: snapshot.id, collection, snapshot });

describe('link-guards against a real store', () => {
  beforeEach(() => seed({}));

  it('recovered entity: payments and supplier materials follow it to the new id', async () => {
    seed({
      payment_transactions: [{ id: 't1', entityId: 'E_old' }, { id: 't2', entityId: 'other' }],
      factory_inventory_data: [{ id: 'm1', supplierId: 'E_old' }],
    });
    await G.applyRecoveryLinks('entities', 'E_old', 'E_new', { id: 'E_new', name: 'Sup' });
    assert.equal((await sqliteStore.get('payment_transactions'))[0].entityId, 'E_new');
    assert.equal((await sqliteStore.get('payment_transactions'))[1].entityId, 'other');
    assert.equal((await sqliteStore.get('factory_inventory_data'))[0].supplierId, 'E_new');
    assert.deepEqual((await sqliteStore.get('recovered_id_map')).E_old, 'E_new');
    assert.ok(saves.some(s => s.key === 'payment_transactions' && s.ids.includes('t1') && !s.ids.includes('t2')), 'only changed rows are synced');
  });

  it('single payment: blocked when its entity is gone, allowed once it is live', async () => {
    seed({ payment_entities: [] });
    const snap = { id: 'P', entityId: 'E', entityName: 'Ali' };
    assert.match(await G.getRecoverLinkBlockReason('transactions', snap), /Ali/);
    seed({ payment_entities: [{ id: 'E' }] });
    assert.equal(await G.getRecoverLinkBlockReason('transactions', snap), null);
  });

  it('a whole set is checked before anything is written', async () => {
    seed({ payment_entities: [], expenses: [], customer_sales: [], rep_sales: [], factory_inventory_data: [] });
    const members = [tomb('expenses', { id: 'X' }), tomb('transactions', { id: 'P', entityId: 'MISSING', expenseId: 'X' })];
    const plan = await G.planRecoverySet(members);
    assert.ok(plan.block);
    assert.equal(saves.length, 0);
  });

  it('partial payment recovered with its parent is not added to the parent a second time', async () => {
    seed({ customer_sales: [{ id: 'S_new', paymentType: 'CREDIT', totalValue: 1000, partialPaymentReceived: 400 }] });
    const child = { id: 'C_new', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'S_new', totalValue: 400 };
    await G.applyRecoveryLinks('sales', 'C_old', 'C_new', child, { skipReattach: true });
    assert.equal((await sqliteStore.get('customer_sales'))[0].partialPaymentReceived, 400);
    await G.applyRecoveryLinks('sales', 'C_old2', 'C_new2', { ...child, id: 'C_new2' }, {});
    assert.equal((await sqliteStore.get('customer_sales'))[0].partialPaymentReceived, 800, 'an individually deleted payment IS added back');
  });

  it('drops a link to an expense or supplier that no longer exists, keeps it when it does', async () => {
    seed({ expenses: [{ id: 'X' }], payment_entities: [{ id: 'E', name: 'Fresh Name' }] });
    const keep = await G.resolveSnapshotLinks('transactions', { id: 'a', expenseId: 'X' });
    assert.equal(keep.expenseId, 'X');
    const drop = await G.resolveSnapshotLinks('transactions', { id: 'b', expenseId: 'GONE' });
    assert.equal(drop.expenseId, undefined);
    const mat = await G.resolveSnapshotLinks('inventory', { id: 'm', supplierId: 'E', supplierName: 'Stale' });
    assert.equal(mat.supplierName, 'Fresh Name');
    const orphanMat = await G.resolveSnapshotLinks('inventory', { id: 'm2', supplierId: 'NOPE', supplierName: 'x', totalPayable: 9 });
    assert.equal(orphanMat.supplierId, undefined);
    assert.equal(orphanMat.totalPayable, undefined);
    assert.equal(orphanMat.paymentStatus, 'pending');
  });

  it('factory batch: blocked when the stock is gone, otherwise takes the materials out again', async () => {
    const batch = { id: 'F', store: 's', units: 2, materialsUsed: [{ id: 'i1', name: 'Chora', quantity: 6 }] };
    seed({ factory_inventory_data: [{ id: 'i1', name: 'Chora', quantity: 4, cost: 10 }], factory_default_formulas: {} });
    assert.match(await G.getFactoryRecoverBlockReason('factory_history', batch), /Not enough Chora/);
    assert.equal(await G.getFactoryRecoverBlockReason('payment', batch), null);
    seed({ factory_inventory_data: [{ id: 'i1', name: 'Chora', quantity: 10, cost: 10 }], factory_default_formulas: {} });
    assert.equal(await G.getFactoryRecoverBlockReason('factory_history', batch), null);
    await G.applyFactoryRecovery('factory_history', batch);
    const item = (await sqliteStore.get('factory_inventory_data'))[0];
    assert.equal(item.quantity, 4);
    assert.equal(item.totalValue, 40);
  });

  it('factory batch recorded without materials uses formula x units', async () => {
    seed({ factory_inventory_data: [{ id: 's1', name: 'Salt', quantity: 20, cost: 1 }], factory_default_formulas: { std: [{ id: 's1', name: 'Salt', quantity: 2 }] } });
    await G.applyFactoryRecovery('factory_history', { id: 'F', store: 'std', formulaType: 'std', units: 5 });
    assert.equal((await sqliteStore.get('factory_inventory_data'))[0].quantity, 10);
  });

  it('entity rename updates every stored copy and syncs only what changed', async () => {
    seed({
      payment_transactions: [{ id: 't1', entityId: 'E', entityName: 'Old' }, { id: 't2', entityId: 'F', entityName: 'F' }],
      factory_inventory_data: [{ id: 'm', supplierId: 'E', supplierName: 'Old' }], expenses: [],
    });
    await G.cascadeEntityRename({ id: 'E' }, 'Old', 'New');
    assert.equal((await sqliteStore.get('payment_transactions'))[0].entityName, 'New');
    assert.equal((await sqliteStore.get('payment_transactions'))[1].entityName, 'F');
    assert.equal((await sqliteStore.get('factory_inventory_data'))[0].supplierName, 'New');
    assert.deepEqual(saves.find(s => s.key === 'payment_transactions').ids, ['t1']);
  });

  it('rollback puts back what a failed multi-step save changed, and skips untouched records', async () => {
    seed({ factory_inventory_data: [{ id: 'm1', totalPayable: 500, paymentStatus: 'pending' }, { id: 'm2', totalPayable: 70 }] });
    const rb = G.createRollback();
    const arr = await sqliteStore.get('factory_inventory_data');
    rb.remember('factory_inventory_data', arr[0]);
    rb.remember('factory_inventory_data', arr[1]);
    arr[0].totalPayable = 0; arr[0].paymentStatus = 'paid'; arr[0].paidDate = '2026-01-01';   // the save changed m1 only
    await sqliteStore.set('factory_inventory_data', arr);
    saves.length = 0;
    await rb.undo();
    const back = await sqliteStore.get('factory_inventory_data');
    assert.deepEqual(back[0], { id: 'm1', totalPayable: 500, paymentStatus: 'pending' });
    assert.equal(back[1].totalPayable, 70);
    assert.deepEqual(saves[0].ids, ['m1']);
  });

  it('rollback is a no-op when nothing was persisted', async () => {
    seed({ expenses: [{ id: 'x', amount: 5 }] });
    const rb = G.createRollback();
    rb.remember('expenses', (await sqliteStore.get('expenses'))[0]);
    await rb.undo();
    assert.equal(saves.length, 0);
  });
});
