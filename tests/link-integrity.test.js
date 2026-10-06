import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_FIELD, REF_FIELDS, remapReferences, resolveOwnLinks, resolveId, stampGroup, newGroupId,
  orderForRestore, findRecoveryClosure, planGroupRecovery, collectPaymentDeletionSet,
  applyEntityRename, paymentsExclusiveToMaterial, materialIdsOfTx,
  factoryEntryMaterialUsage, findUsageItem, LINKED_MATERIALS_FIELD,
} from '../modules/link-graph.js';

const tomb = (collection, snapshot, group) => ({
  id: snapshot.id, recordId: snapshot.id, collection,
  snapshot: group ? { ...snapshot, [GROUP_FIELD]: group } : snapshot,
});

describe('reference coverage', () => {
  it('knows every cross-record id the payments side uses', () => {
    assert.deepEqual(REF_FIELDS.payment_transactions.scalar.sort(), ['entityId', 'expenseId', 'materialId', 'transferPeerEntityId']);
    assert.deepEqual(REF_FIELDS.payment_transactions.array, ['materialIds']);
    assert.deepEqual(REF_FIELDS.factory_inventory_data.scalar, ['supplierId']);
  });
  it('recovering an entity re-points payments, transfer peers and supplier materials', () => {
    const stores = {
      payment_transactions: [
        { id: 't1', entityId: 'E_old' }, { id: 't2', entityId: 'other', transferPeerEntityId: 'E_old' }, { id: 't3', entityId: 'other' },
      ],
      factory_inventory_data: [{ id: 'm1', supplierId: 'E_old' }, { id: 'm2', supplierId: 'other' }],
    };
    const changed = remapReferences(stores, 'E_old', 'E_new');
    assert.deepEqual(changed.payment_transactions.map(r => r.id).sort(), ['t1', 't2']);
    assert.equal(stores.payment_transactions[0].entityId, 'E_new');
    assert.equal(stores.payment_transactions[1].transferPeerEntityId, 'E_new');
    assert.equal(stores.factory_inventory_data[0].supplierId, 'E_new');
    assert.equal(stores.factory_inventory_data[1].supplierId, 'other');
  });
  it('recovering a material re-points the payments that settled it (scalar and array)', () => {
    const stores = { payment_transactions: [{ id: 't1', materialId: 'M_old', materialIds: ['M_old', 'M2'] }, { id: 't2', materialIds: ['M2'] }] };
    const changed = remapReferences(stores, 'M_old', 'M_new');
    assert.equal(changed.payment_transactions.length, 1);
    assert.equal(stores.payment_transactions[0].materialId, 'M_new');
    assert.deepEqual(stores.payment_transactions[0].materialIds, ['M_new', 'M2']);
  });
  it('a payment recovered after its entity follows the id chain', () => {
    const snap = { id: 't', entityId: 'E1', materialIds: ['M1'] };
    resolveOwnLinks('transactions', snap, { E1: 'E2', E2: 'E3', M1: 'M2' });
    assert.equal(snap.entityId, 'E3');
    assert.deepEqual(snap.materialIds, ['M2']);
    const mat = { id: 'm', supplierId: 'E1' };
    resolveOwnLinks('inventory', mat, { E1: 'E2' });
    assert.equal(mat.supplierId, 'E2');
    assert.equal(resolveId('x', { }), 'x');
  });
});

describe('recovery closure', () => {
  const exp = tomb('expenses', { id: 'X', amount: 5 });
  const pay = tomb('transactions', { id: 'P', expenseId: 'X', entityId: 'E' });
  const other = tomb('transactions', { id: 'Q', entityId: 'E' });
  it('pairs an expense with its payment even for tombstones that predate groups', () => {
    assert.deepEqual(findRecoveryClosure(exp, [exp, pay, other]).map(t => t.id).sort(), ['P', 'X']);
    assert.deepEqual(findRecoveryClosure(pay, [exp, pay, other]).map(t => t.id).sort(), ['P', 'X']);
  });
  it('keeps both sides of a transfer together', () => {
    const a = tomb('transactions', { id: 'a', isTransfer: true, transferPairId: 'tp' });
    const b = tomb('transactions', { id: 'b', isTransfer: true, transferPairId: 'tp' });
    assert.equal(findRecoveryClosure(a, [a, b, other]).length, 2);
  });
  it('follows a deletion group and then keeps following links from its members', () => {
    const ent = tomb('entities', { id: 'E' }, 'g1');
    const t1 = tomb('transactions', { id: 'T1', expenseId: 'X2' }, 'g1');
    const x2 = tomb('expenses', { id: 'X2' });          // not stamped, but paired with a member
    const unrelated = tomb('transactions', { id: 'U' });
    assert.deepEqual(findRecoveryClosure(ent, [ent, t1, x2, unrelated]).map(t => t.id).sort(), ['E', 'T1', 'X2']);
  });
  it('a lone record is its own closure', () => {
    assert.deepEqual(findRecoveryClosure(other, [exp, pay, other]).map(t => t.id), ['Q']);
  });
});

describe('restore order', () => {
  it('entities, then materials, then payments', () => {
    const ent = tomb('entities', { id: 'E' });
    const mat = tomb('inventory', { id: 'M', supplierId: 'E' });
    const exp = tomb('expenses', { id: 'X' });
    const pay = tomb('transactions', { id: 'P', entityId: 'E', expenseId: 'X' });
    const order = orderForRestore([pay, mat, exp, ent]).map(t => t.id);
    assert.ok(order.indexOf('E') < order.indexOf('M'));
    assert.ok(order.indexOf('M') < order.indexOf('P'));
    assert.ok(order.indexOf('X') < order.indexOf('P'));
  });
});

describe('pre-flight of a recovery', () => {
  const live = (o = {}) => ({ customer_sales: [], rep_sales: [], payment_entities: [], expenses: [], factory_inventory_data: [], ...o });
  it('blocks a payment whose entity is gone, naming the entity', () => {
    const p = tomb('transactions', { id: 'P', entityId: 'E', entityName: 'Ali Traders' });
    const r = planGroupRecovery([p], live(), {});
    assert.match(r.block, /Ali Traders/);
  });
  it('allows it when the entity is live, recovered earlier (id map) or recovered in the same set', () => {
    const p = tomb('transactions', { id: 'P', entityId: 'E' });
    assert.equal(planGroupRecovery([p], live({ payment_entities: [{ id: 'E' }] }), {}).block, null);
    assert.equal(planGroupRecovery([p], live({ payment_entities: [{ id: 'E_new' }] }), { E: 'E_new' }).block, null);
    assert.equal(planGroupRecovery([p, tomb('entities', { id: 'E' })], live(), {}).block, null);
  });
  it('ignores deleted-flag records when deciding what is live', () => {
    const p = tomb('transactions', { id: 'P', entityId: 'E' });
    assert.ok(planGroupRecovery([p], live({ payment_entities: [{ id: 'E', deletedAt: 1 }] }), {}).block);
  });
  it('checks both entities of a transfer', () => {
    const t = tomb('transactions', { id: 'T', entityId: 'A', isTransfer: true, transferPeerEntityId: 'B', transferPeerEntityName: 'Bilal' });
    assert.match(planGroupRecovery([t], live({ payment_entities: [{ id: 'A' }] }), {}).block, /Bilal/);
    assert.equal(planGroupRecovery([t], live({ payment_entities: [{ id: 'A' }, { id: 'B' }] }), {}).block, null);
  });
  it('does not add a partial payment twice when its parent comes back in the same recovery', () => {
    const parent = tomb('sales', { id: 'S', paymentType: 'CREDIT', totalValue: 1000, partialPaymentReceived: 400 }, 'g');
    const child = tomb('sales', { id: 'C', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'S', totalValue: 400 }, 'g');
    const r = planGroupRecovery([child, parent], live(), {});
    assert.equal(r.block, null);
    assert.ok(r.skipReattach.has('C'));
  });
  it('still reattaches a payment that was deleted on its own, and adds several against the same cap', () => {
    const liveParent = { id: 'S', paymentType: 'CREDIT', totalValue: 1000, partialPaymentReceived: 300 };
    const c1 = tomb('sales', { id: 'C1', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'S', totalValue: 400 });
    const c2 = tomb('sales', { id: 'C2', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'S', totalValue: 400 });
    assert.equal(planGroupRecovery([c1], live({ customer_sales: [liveParent] }), {}).block, null);
    assert.match(planGroupRecovery([c1, c2], live({ customer_sales: [liveParent] }), {}).block, /against a sale worth/);
    assert.equal(planGroupRecovery([c1], live({ customer_sales: [liveParent] }), {}).skipReattach.size, 0);
  });
});

describe('deleting a payment takes its whole entry', () => {
  const txs = [
    { id: 'P', expenseId: 'X', entityId: 'E' },
    { id: 'P2', expenseId: 'X', entityId: 'E' },
    { id: 'A', isTransfer: true, transferPairId: 'tp' },
    { id: 'B', isTransfer: true, transferPairId: 'tp', expenseId: 'Y' },
    { id: 'Z', entityId: 'E' },
  ];
  const exps = [{ id: 'X' }, { id: 'Y' }, { id: 'W' }];
  it('adds the expense record and its sibling payments', () => {
    const r = collectPaymentDeletionSet([txs[0]], txs, exps);
    assert.deepEqual(r.txs.map(t => t.id).sort(), ['P', 'P2']);
    assert.deepEqual(r.expenses.map(e => e.id), ['X']);
  });
  it('adds both sides of a transfer and whatever they point at', () => {
    const r = collectPaymentDeletionSet([txs[2]], txs, exps);
    assert.deepEqual(r.txs.map(t => t.id).sort(), ['A', 'B']);
    assert.deepEqual(r.expenses.map(e => e.id), ['Y']);
  });
  it('leaves unrelated payments alone and tolerates a missing expense record', () => {
    const r = collectPaymentDeletionSet([txs[4]], txs, exps);
    assert.deepEqual(r.txs.map(t => t.id), ['Z']);
    assert.deepEqual(r.expenses, []);
    assert.deepEqual(collectPaymentDeletionSet([{ id: 'q', expenseId: 'gone' }], [], []).expenses, []);
  });
});

describe('renaming an entity reaches every copy of the name', () => {
  const build = () => ({
    payment_transactions: [
      { id: 't1', entityId: 'E', entityName: 'Old' },
      { id: 't2', entityId: 'F', entityName: 'Other', transferPeerEntityId: 'E', transferPeerEntityName: 'Old' },
      { id: 't3', entityId: 'F', entityName: 'Other' },
    ],
    factory_inventory_data: [{ id: 'm1', supplierId: 'E', supplierName: 'Old' }, { id: 'm2', supplierId: 'F', supplierName: 'Other' }],
    expenses: [{ id: 'x1', category: 'operating', name: 'Old' }, { id: 'x2', category: 'operating', name: 'Rent' }],
  });
  it('updates payments, transfer peers and supplier materials', () => {
    const s = build();
    const c = applyEntityRename(s, { id: 'E' }, 'Old', 'New');
    assert.deepEqual(c.payment_transactions.map(r => r.id).sort(), ['t1', 't2']);
    assert.equal(s.payment_transactions[1].transferPeerEntityName, 'New');
    assert.equal(s.payment_transactions[1].entityName, 'Other');
    assert.equal(s.factory_inventory_data[0].supplierName, 'New');
    assert.equal(c.expenses, undefined);
  });
  it('renames the operating expenses of an expense-only entity', () => {
    const s = build();
    const c = applyEntityRename(s, { id: 'E', isExpenseEntity: true }, 'Old', 'New');
    assert.deepEqual(c.expenses.map(r => r.id), ['x1']);
    assert.equal(s.expenses[1].name, 'Rent');
  });
  it('does nothing when the name did not change', () => {
    assert.deepEqual(applyEntityRename(build(), { id: 'E' }, 'Old', 'Old'), {});
  });
});

describe('deleting a material', () => {
  const mat = { id: 'M', supplierId: 'E' };
  it('removes only the payments that exist because of this one material', () => {
    const txs = [
      { id: 'in', isPayable: true, entityId: 'E', type: 'IN', materialId: 'M', materialIds: ['M'] },
      { id: 'outOnly', isPayable: true, entityId: 'E', type: 'OUT', materialIds: ['M'] },
      { id: 'outBoth', isPayable: true, entityId: 'E', type: 'OUT', materialId: 'M', materialIds: ['M', 'M2'] },
      { id: 'otherSupplier', isPayable: true, entityId: 'F', materialIds: ['M'] },
      { id: 'notPayable', isPayable: false, entityId: 'E', materialId: 'M' },
    ];
    assert.deepEqual(paymentsExclusiveToMaterial(mat, txs).map(t => t.id).sort(), ['in', 'outOnly']);
    assert.deepEqual([...materialIdsOfTx(txs[2])].sort(), ['M', 'M2']);
  });
  it('has nothing to remove for an unlinked material', () => {
    assert.deepEqual(paymentsExclusiveToMaterial({ id: 'M' }, [{ id: 't', isPayable: true, materialId: 'M' }]), []);
  });
});

describe('factory batches give raw materials back and take them out again', () => {
  const inv = [{ id: 'i1', name: 'Chora', quantity: 10 }, { id: 'i2', name: 'Salt', quantity: 5 }];
  it('uses the exact materials recorded on the batch', () => {
    const u = factoryEntryMaterialUsage({ materialsUsed: [{ id: 'i1', name: 'Chora', quantity: 4 }] }, {}, 'k');
    assert.deepEqual(u, [{ id: 'i1', name: 'Chora', quantity: 4 }]);
  });
  it('falls back to formula x units for older batches', () => {
    const u = factoryEntryMaterialUsage({ store: 's', units: 3 }, { k: [{ id: 'i2', name: 'Salt', quantity: 2 }] }, 'k');
    assert.deepEqual(u, [{ id: 'i2', name: 'Salt', quantity: 6 }]);
  });
  it('finds the stock item by id, then by name', () => {
    assert.equal(findUsageItem(inv, { id: 'i2' }).name, 'Salt');
    assert.equal(findUsageItem(inv, { id: 'gone', name: ' chora ' }).id, 'i1');
    assert.equal(findUsageItem(inv, { id: 'gone', name: 'nope' }), null);
  });
});

// End to end: delete a supplier together with everything linked to it, bring it back, and prove that
// nothing is left pointing at an id that no longer exists.
describe('delete entity group then recover it: no dangling links', () => {
  const dangling = (st) => {
    const ids = (k) => new Set(st[k].map(r => r.id));
    const out = [];
    const check = (store, rec, field, target) => { if (rec[field] && !ids(target).has(String(rec[field]))) out.push(`${store}.${rec.id}.${field}`); };
    st.payment_transactions.forEach(t => {
      check('tx', t, 'entityId', 'payment_entities'); check('tx', t, 'expenseId', 'expenses');
      (t.materialIds || []).forEach(m => { if (!ids('factory_inventory_data').has(m)) out.push(`tx.${t.id}.materialIds`); });
    });
    st.factory_inventory_data.forEach(m => check('mat', m, 'supplierId', 'payment_entities'));
    return out;
  };
  const recoverAll = (members, stores, idMap) => {
    let n = 0;
    for (const m of orderForRestore(members)) {
      const col = { entities: 'payment_entities', inventory: 'factory_inventory_data', expenses: 'expenses', transactions: 'payment_transactions' }[m.collection];
      const snap = { ...m.snapshot }; delete snap[GROUP_FIELD];
      const newId = `${m.id}_r${++n}`;
      resolveOwnLinks(m.collection, snap, idMap);
      snap.id = newId;
      stores[col].push(snap);
      idMap[m.id] = newId;
      remapReferences(stores, m.id, newId);
    }
  };

  it('restores the exact set with every link intact', () => {
    const g = newGroupId('ent');
    const members = [
      tomb('transactions', { id: 'in1', entityId: 'E', expenseId: null, materialIds: ['M'], isPayable: true, type: 'IN' }, g),
      tomb('transactions', { id: 'pay1', entityId: 'E', expenseId: 'X', type: 'OUT' }, g),
      tomb('expenses', { id: 'X' }, g),
      tomb('entities', { id: 'E', name: 'Supplier', [LINKED_MATERIALS_FIELD]: ['M'] }, g),
    ];
    const stores = {
      payment_entities: [], expenses: [], payment_transactions: [],
      factory_inventory_data: [{ id: 'M', name: 'Chora' }],       // unlinked when the supplier was deleted
    };
    const closure = findRecoveryClosure(members[3], members);
    assert.equal(closure.length, 4);
    const live = { customer_sales: [], rep_sales: [], payment_entities: stores.payment_entities, expenses: stores.expenses, factory_inventory_data: stores.factory_inventory_data };
    assert.equal(planGroupRecovery(closure, live, {}).block, null);
    const idMap = {};
    recoverAll(closure, stores, idMap);
    assert.deepEqual(dangling(stores), []);
    assert.equal(stores.payment_transactions.length, 2);
    const newEntity = stores.payment_entities[0];
    assert.ok(stores.payment_transactions.every(t => t.entityId === newEntity.id));
    assert.equal(stores.payment_transactions.find(t => t.expenseId).expenseId, stores.expenses[0].id);
  });

  it('would have left orphans if entityId were not tracked (guards the regression)', () => {
    const stores = { payment_entities: [], expenses: [], payment_transactions: [{ id: 't', entityId: 'E' }], factory_inventory_data: [] };
    const idMap = {};
    stores.payment_entities.push({ id: 'E_new' });
    remapReferences(stores, 'E', 'E_new');
    assert.deepEqual(dangling(stores), []);
  });
});
