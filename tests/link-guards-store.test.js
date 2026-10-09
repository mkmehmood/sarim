import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { debtDelta, debtNeedsGross } from '../modules/finance.js';

// The REAL link-guards.js runs here against an in-memory store. Only its two heavy imports are replaced.
const data = new Map();
const saves = [];
const deletes = [];
const sqliteStore = {
  async get(k, def) { return data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : def; },
  async set(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
};
const ensureArray = (v) => (Array.isArray(v) ? v : []);
let clock = 1000;

mock.module('../modules/business.js', {
  namedExports: { sqliteStore, ensureArray, getTimestamp: () => ++clock, ensureRecordIntegrity: (r) => r, debtDelta, debtNeedsGross },
});
mock.module('../modules/sync.js', {
  namedExports: {
    // mirrors the real contract: persist the whole array, remember which ids were meant to sync
    async unifiedSave(key, arr, rec, ids) { await sqliteStore.set(key, arr); saves.push({ key, ids: rec ? [rec.id] : ids }); return true; },
    async unifiedDelete(key, arr, id) { await sqliteStore.set(key, arr); deletes.push({ key, id }); return true; },
  },
});

globalThis.window = {};
const G = await import('../modules/link-guards.js');

const seed = (o) => { data.clear(); saves.length = 0; deletes.length = 0; globalThis.window = {}; Object.entries(o).forEach(([k, v]) => data.set(k, v)); };
const get = (k) => sqliteStore.get(k);

describe('recovered ids: every link follows, only changed rows sync', () => {
  beforeEach(() => seed({}));

  it('recovered entity: payments, transfer peers and supplier materials follow it to the new id', async () => {
    seed({
      payment_transactions: [
        { id: 't1', entityId: 'E_old' },
        { id: 't2', entityId: 'other', transferPeerEntityId: 'E_old' },
        { id: 't3', entityId: 'other' },
      ],
      factory_inventory_data: [{ id: 'm1', supplierId: 'E_old' }],
    });
    await G.applyRecoveryLinks('entities', 'E_old', 'E_new', { id: 'E_new', name: 'Sup' });
    const tx = await get('payment_transactions');
    assert.equal(tx[0].entityId, 'E_new');
    assert.equal(tx[1].transferPeerEntityId, 'E_new');
    assert.equal(tx[2].entityId, 'other');
    assert.equal((await get('factory_inventory_data'))[0].supplierId, 'E_new');
    assert.equal((await get('recovered_id_map')).E_old, 'E_new');
    const s = saves.find(x => x.key === 'payment_transactions');
    assert.deepEqual(s.ids.sort(), ['t1', 't2']);
  });

  it('recovered material: the payments that settled it and the batches/formulas that use it follow', async () => {
    seed({
      payment_transactions: [{ id: 'p', materialId: 'M_old', materialIds: ['M_old', 'z'] }],
      factory_production_history: [{ id: 'h', materialsUsed: [{ id: 'M_old', quantity: 2 }] }],
      factory_default_formulas: { standard: [{ id: 'M_old', quantity: 1 }] },
    });
    await G.applyRecoveryLinks('inventory', 'M_old', 'M_new', { id: 'M_new' });
    const p = (await get('payment_transactions'))[0];
    assert.equal(p.materialId, 'M_new');
    assert.deepEqual(p.materialIds, ['M_new', 'z']);
    assert.equal((await get('factory_production_history'))[0].materialsUsed[0].id, 'M_new');
    assert.equal((await get('factory_default_formulas')).standard[0].id, 'M_new');
  });
});

describe('payments need their entity', () => {
  beforeEach(() => seed({}));
  const snap = { id: 'P', type: 'IN', amount: 5, entityId: 'E', entityName: 'Ali' };

  it('blocked when the entity is gone, allowed when live, when mapped, or when it comes back in the same set', async () => {
    seed({ payment_entities: [] });
    assert.match(await G.getRecoverLinkBlockReason('transactions', snap), /"Ali"/);
    assert.equal(await G.getRecoverLinkBlockReason('transactions', snap, { entityInSet: (id) => id === 'E' }), null);
    seed({ payment_entities: [{ id: 'E' }] });
    assert.equal(await G.getRecoverLinkBlockReason('transactions', snap), null);
    seed({ payment_entities: [{ id: 'E_new' }], recovered_id_map: { E: 'E_new' } });
    assert.equal(await G.getRecoverLinkBlockReason('transactions', snap), null);
  });

  it('a transfer needs both of its entities', async () => {
    seed({ payment_entities: [{ id: 'A' }] });
    const t = { id: 'T', type: 'OUT', amount: 1, isTransfer: true, entityId: 'A', transferPeerEntityId: 'B', transferPeerEntityName: 'Bilal' };
    assert.match(await G.getRecoverLinkBlockReason('transactions', t), /"Bilal"/);
  });
});

describe('a partial payment is never added to its parent twice', () => {
  beforeEach(() => seed({}));
  const child = { id: 'C_new', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'S', totalValue: 400 };

  it('skips the re-attach when the parent came back with the amount already in it, adds it otherwise', async () => {
    seed({ customer_sales: [{ id: 'S', paymentType: 'CREDIT', totalValue: 1000, partialPaymentReceived: 400 }] });
    await G.applyRecoveryLinks('sales', 'C_old', 'C_new', child, { skipReattach: true });
    assert.equal((await get('customer_sales'))[0].partialPaymentReceived, 400);
    await G.applyRecoveryLinks('sales', 'C_old2', 'C_new2', { ...child, id: 'C_new2' }, {});
    assert.equal((await get('customer_sales'))[0].partialPaymentReceived, 800, 'a payment deleted on its own IS added back');
  });
});

describe('snapshots never keep links to things that no longer exist', () => {
  beforeEach(() => seed({}));

  it('drops a dead expense link, keeps a live one', async () => {
    seed({ expenses: [{ id: 'X' }] });
    assert.equal((await G.resolveSnapshotLinks('transactions', { id: 'a', expenseId: 'X' })).expenseId, 'X');
    assert.equal((await G.resolveSnapshotLinks('transactions', { id: 'b', expenseId: 'GONE' })).expenseId, undefined);
  });

  it('material: refreshes the supplier name, or comes back unlinked with nothing owed', async () => {
    seed({ payment_entities: [{ id: 'E', name: 'Fresh Name' }] });
    assert.equal((await G.resolveSnapshotLinks('inventory', { id: 'm', supplierId: 'E', supplierName: 'Stale' })).supplierName, 'Fresh Name');
    const orphan = await G.resolveSnapshotLinks('inventory', { id: 'm2', supplierId: 'NOPE', supplierName: 'x', totalPayable: 9 });
    assert.equal(orphan.supplierId, undefined);
    assert.equal(orphan.totalPayable, undefined);
    assert.equal(orphan.paymentStatus, 'pending');
  });
});

describe('factory batch restore', () => {
  beforeEach(() => seed({}));
  const batch = { id: 'F', store: 's', units: 2, materialsUsed: [{ id: 'i1', name: 'Chora', quantity: 6 }] };

  it('blocked when the stock is gone, otherwise takes the materials out again', async () => {
    seed({ factory_inventory_data: [{ id: 'i1', name: 'Chora', quantity: 4, cost: 10 }], factory_default_formulas: {} });
    assert.match(await G.getRecoverLinkBlockReason('factory_history', batch), /Not enough Chora/);
    seed({ factory_inventory_data: [{ id: 'i1', name: 'Chora', quantity: 10, cost: 10 }], factory_default_formulas: {} });
    assert.equal(await G.getRecoverLinkBlockReason('factory_history', batch), null);
    await G.applyRecoveryLinks('factory_history', 'F_old', 'F', batch);
    const item = (await get('factory_inventory_data'))[0];
    assert.equal(item.quantity, 4);
    assert.equal(item.totalValue, 40);
  });

  it('two batches in one recovery cannot both use the same stock', async () => {
    seed({ factory_inventory_data: [{ id: 'i1', name: 'Chora', quantity: 10, cost: 10 }], factory_default_formulas: {} });
    const ctx = { inv: null };
    assert.equal(await G.getRecoverLinkBlockReason('factory_history', batch, ctx), null);
    assert.match(await G.getRecoverLinkBlockReason('factory_history', { ...batch, id: 'F2' }, ctx), /Not enough Chora/);
  });
});

describe('entity rename reaches every stored copy', () => {
  beforeEach(() => seed({}));

  it('updates payments, transfer peers, materials and records the rename for the bin', async () => {
    seed({
      payment_entities: [{ id: 'E', name: 'New' }],
      payment_transactions: [{ id: 't1', entityId: 'E', entityName: 'Old' }, { id: 't2', entityId: 'F', entityName: 'F' }, { id: 't3', entityId: 'G', transferPeerEntityId: 'E', transferPeerEntityName: 'Old' }],
      factory_inventory_data: [{ id: 'm', supplierId: 'E', supplierName: 'Old' }],
      expenses: [],
    });
    const r = await G.cascadeEntityRename('E', 'Old', 'New');
    assert.deepEqual([r.tx, r.materials], [2, 1]);
    const tx = await get('payment_transactions');
    assert.equal(tx[0].entityName, 'New');
    assert.equal(tx[1].entityName, 'F');
    assert.equal(tx[2].transferPeerEntityName, 'New');
    assert.deepEqual(saves.find(s => s.key === 'payment_transactions').ids.sort(), ['t1', 't3']);
    assert.equal((await get('customer_rename_map'))['entity:old'], 'New');
  });

  it('an expense-only entity also renames its expense records; an ordinary one does not', async () => {
    seed({ payment_entities: [{ id: 'E', name: 'Fuel2', isExpenseEntity: true }], payment_transactions: [], factory_inventory_data: [], expenses: [{ id: 'x1', name: 'Fuel' }, { id: 'x2', name: 'Rent' }] });
    assert.equal((await G.cascadeEntityRename('E', 'Fuel', 'Fuel2')).expenses, 1);
    const ex = await get('expenses');
    assert.equal(ex[0].name, 'Fuel2');
    assert.equal(ex[1].name, 'Rent');
    seed({ payment_entities: [{ id: 'E', name: 'Fuel2' }], payment_transactions: [], factory_inventory_data: [], expenses: [{ id: 'x1', name: 'Fuel' }] });
    assert.equal((await G.cascadeEntityRename('E', 'Fuel', 'Fuel2')).expenses, 0);
  });
});

describe('cash guards', () => {
  beforeEach(() => seed({}));

  it('deleting a payment received needs cash to cover it', async () => {
    globalThis.window.getAvailableCashInHand = async () => 100;
    assert.match(await G.getPaymentDeleteBlockReason({ type: 'IN', amount: 500 }), /only 100 is available/);
    assert.equal(await G.getPaymentDeleteBlockReason({ type: 'IN', amount: 80 }), null);
    assert.equal(await G.getPaymentDeleteBlockReason({ type: 'IN', amount: 500, isPayable: true }), null);
  });

  it('recovering payments made is checked cumulatively across one recovery', async () => {
    globalThis.window.getAvailableCashInHand = async () => 100;
    const ctx = {};
    const out = (id, amount) => ({ id, type: 'OUT', amount, entityId: 'E' });
    seed({ payment_entities: [{ id: 'E' }] });
    globalThis.window.getAvailableCashInHand = async () => 100;
    assert.equal(await G.getRecoverLinkBlockReason('transactions', out('a', 60), ctx), null);
    assert.match(await G.getRecoverLinkBlockReason('transactions', out('b', 60), ctx), /only 100 is available/);
  });
});

describe('sales: contacts and settlement', () => {
  beforeEach(() => seed({}));

  it('a recovered sale gets its customer back exactly once', async () => {
    seed({ sales_customers: [] });
    const sale = { id: 's', customerName: 'Ali Khan', customerPhone: '0300', salesRep: 'NONE' };
    assert.ok(await G.ensureContactForRecoveredSale('sales', sale));
    assert.equal(await G.ensureContactForRecoveredSale('sales', sale), null);
    const c = await get('sales_customers');
    assert.equal(c.length, 1);
    assert.equal(c[0].phone, '0300');
  });

  it('rep-linked and transfer sales do not create a customer', async () => {
    seed({ sales_customers: [] });
    assert.equal(await G.ensureContactForRecoveredSale('sales', { id: 's', customerName: 'X', salesRep: 'R1' }), null);
    assert.equal(await G.ensureContactForRecoveredSale('sales', { id: 's', customerName: 'X', isRepTransfer: true }), null);
  });

  it('paid/unpaid toggle: blocked for cash sales, calculator-settled sales and partly-paid sales', async () => {
    seed({
      customer_sales: [
        { id: 'cash', paymentType: 'CASH' },
        { id: 'plain', paymentType: 'CREDIT', creditReceived: false },
        { id: 'calc', paymentType: 'CREDIT', creditReceived: true },
        { id: 'part', paymentType: 'CREDIT', creditReceived: false },
        { id: 'k', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'part', totalValue: 250 },
      ],
      noman_history: [{ id: 'h', linkedSalesIds: ['calc'] }],
    });
    assert.match(await G.getSettleToggleBlockReason('cash'), /Only credit sales/);
    assert.equal(await G.getSettleToggleBlockReason('plain'), null);
    assert.ok(await G.getSettleToggleBlockReason('calc'));
    assert.match(await G.getSettleToggleBlockReason('part'), /250 was already collected/);
  });
});

describe('calculator record restore against real data', () => {
  beforeEach(() => seed({}));
  const entry = { id: 'c1', linkedSalesIds: ['s1'], linkedRepSalesIds: [] };

  it('allowed while the sale is still pending, refused once it was paid or settled elsewhere', async () => {
    seed({ customer_sales: [{ id: 's1', paymentType: 'CREDIT', creditReceived: false }], rep_sales: [], noman_history: [] });
    assert.equal(await G.getCalcRestoreBlockReason(entry), null);
    seed({ customer_sales: [{ id: 's1', paymentType: 'CREDIT', creditReceived: true }], rep_sales: [], noman_history: [] });
    assert.match(await G.getCalcRestoreBlockReason(entry), /already paid or changed/);
    seed({ customer_sales: [{ id: 's1', paymentType: 'CREDIT', creditReceived: false }], rep_sales: [], noman_history: [{ id: 'other', linkedSalesIds: ['s1'] }] });
    assert.match(await G.getCalcRestoreBlockReason(entry), /another calculator record/);
  });
});

describe('stock and factory units on restore', () => {
  beforeEach(() => seed({}));

  it('a recovered sale cannot overdraw its store, counting everything recovered with it', async () => {
    globalThis.window.computeStoreStockSnapshot = async () => ({ available: 100 });
    const sale = (q) => ({ id: 's', quantity: q, supplyStore: 'A', date: '2026-01-01', paymentType: 'CASH' });
    const ctx = { stockUsed: new Map() };
    assert.equal(await G.getRecoverLinkBlockReason('sales', sale(60), ctx), null);
    assert.match(await G.getRecoverLinkBlockReason('sales', sale(60), ctx), /only 100 kg is available/);
  });

  it('recovered production needs factory formula units', async () => {
    seed({ factory_unit_tracking: { standard: { available: 3 } } });
    const prod = { id: 'p', formulaUnits: 5, formulaStore: 'standard' };
    assert.match(await G.getRecoverLinkBlockReason('production', prod), /only 3 are available/);
    seed({ factory_unit_tracking: { standard: { available: 9 } } });
    assert.equal(await G.getRecoverLinkBlockReason('production', prod), null);
  });
});

describe('legacy partly-paid audit', () => {
  it('finds the double-counted sales and stays read-only', async () => {
    seed({
      customer_sales: [{ id: 'p', paymentType: 'CREDIT', customerName: 'Ali', partialPaymentReceived: 300 }, { id: 'k', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'p', totalValue: 300 }],
      rep_sales: [],
    });
    const r = await G.auditLegacyPartialPayments({ silent: true });
    assert.equal(r.count, 1);
    assert.equal(r.debtUnderstatedBy, 300);
    assert.equal(saves.length, 0);
  });
});
