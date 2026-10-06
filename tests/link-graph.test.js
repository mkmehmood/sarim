import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveId, remapReferences, resolveOwnLinks, planChildDetach, planChildReattach, applyPatch,
  getEditLinkIssue, planExpenseCascade, stampGroup, newGroupId, orderForRestore, findGroupMembers, GROUP_FIELD,
} from '../modules/link-graph.js';

describe('recovered-id remapping', () => {
  it('follows chains oldId -> newId -> newer', () => {
    assert.equal(resolveId('a', { a: 'b', b: 'c' }), 'c');
    assert.equal(resolveId('x', {}), 'x');
  });
  it('re-points every reference to a recovered record and reports only changed records', () => {
    const stores = {
      customer_sales: [{ id: 'p1', relatedSaleId: 'old' }, { id: 'p2', relatedSaleId: 'other' }],
      noman_history: [{ id: 'h1', linkedSalesIds: ['x', 'old'], transferSaleId: 'old' }],
      payment_transactions: [{ id: 't1', expenseId: 'old' }],
      rep_sales: [],
    };
    const changed = remapReferences(stores, 'old', 'new');
    assert.equal(stores.customer_sales[0].relatedSaleId, 'new');
    assert.equal(stores.customer_sales[1].relatedSaleId, 'other');
    assert.deepEqual(stores.noman_history[0].linkedSalesIds, ['x', 'new']);
    assert.equal(stores.noman_history[0].transferSaleId, 'new');
    assert.equal(stores.payment_transactions[0].expenseId, 'new');
    assert.deepEqual(Object.keys(changed).sort(), ['customer_sales', 'noman_history', 'payment_transactions']);
    assert.equal(changed.customer_sales.length, 1);
  });
  it('re-points a recovered child at its already-recovered parent', () => {
    const snap = { id: 'c', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'oldParent' };
    resolveOwnLinks('sales', snap, { oldParent: 'newParent' });
    assert.equal(snap.relatedSaleId, 'newParent');
  });
});

describe('partial payment detach / reattach', () => {
  const parent = () => ({ id: 'p', paymentType: 'CREDIT', totalValue: 1000, partialPaymentReceived: 400, creditReceived: false });
  const child = { id: 'c', paymentType: 'PARTIAL_PAYMENT', relatedSaleId: 'p', totalValue: 400 };

  it('delete then restore returns the parent to exactly where it started', () => {
    const p = parent();
    applyPatch(p, planChildDetach(p, child));
    assert.equal(p.partialPaymentReceived, 0);
    assert.equal(p.creditReceived, false);
    const { patch, block } = planChildReattach(p, child);
    assert.equal(block, undefined);
    applyPatch(p, patch);
    assert.equal(p.partialPaymentReceived, 400);
  });
  it('never goes below zero when deleting', () => {
    const p = { ...parent(), partialPaymentReceived: 100 };
    assert.equal(planChildDetach(p, child).partialPaymentReceived, 0);
  });
  it('blocks recovery when the parent sale is gone', () => {
    assert.match(planChildReattach(null, child).block, /Recover that sale first/);
  });
  it('blocks recovery that would overpay the sale', () => {
    const p = { ...parent(), totalValue: 500, partialPaymentReceived: 300 };
    assert.match(planChildReattach(p, child).block, /would put 700/);
  });
  it('ignores non-payment records', () => {
    assert.equal(planChildReattach(parent(), { paymentType: 'CASH' }).patch, null);
  });
});

describe('edit guard for sales that have payments', () => {
  const orig = { id: 'p', customerName: 'Ali', totalValue: 1000, partialPaymentReceived: 400 };
  it('blocks renaming a sale that has payment records', () => {
    assert.match(getEditLinkIssue(orig, { ...orig, customerName: 'Bilal' }, [{ id: 'c' }]), /Renaming/);
  });
  it('blocks lowering the value below what was collected', () => {
    assert.match(getEditLinkIssue(orig, { ...orig, totalValue: 300 }, [{ id: 'c' }]), /cannot be reduced/);
  });
  it('allows harmless edits and unlinked sales', () => {
    assert.equal(getEditLinkIssue(orig, { ...orig, totalValue: 1200 }, [{ id: 'c' }]), null);
    assert.equal(getEditLinkIssue({ id: 'x', customerName: 'A', totalValue: 5 }, { customerName: 'B', totalValue: 5 }, []), null);
  });
});

describe('deletion groups', () => {
  it('stamps without mutating the live record', () => {
    const r = { id: 'e' };
    const s = stampGroup(r, 'g1');
    assert.equal(s[GROUP_FIELD], 'g1');
    assert.equal(r[GROUP_FIELD], undefined);
    assert.match(newGroupId('exp'), /^exp-/);
  });
  it('finds members deleted together and restores parents/containers first', () => {
    const tombs = [
      { id: 'c', recordId: 'c', collection: 'sales', snapshot: { [GROUP_FIELD]: 'g', relatedSaleId: 'p' } },
      { id: 'p', recordId: 'p', collection: 'sales', snapshot: { [GROUP_FIELD]: 'g' } },
      { id: 'k', recordId: 'k', collection: 'sales_customers', snapshot: { [GROUP_FIELD]: 'g' } },
      { id: 'z', recordId: 'z', collection: 'sales', snapshot: {} },
    ];
    const members = findGroupMembers(tombs[0], tombs);
    assert.equal(members.length, 3);
    assert.deepEqual(orderForRestore(members).map(t => t.id), ['k', 'p', 'c']);
    assert.equal(findGroupMembers(tombs[3], tombs).length, 1);
  });
});

describe('payment <-> expense cascade', () => {
  const exp = { id: 'e1', category: 'OUT' };
  it('removes the expense record created with a lone payment', () => {
    const tx = { id: 't1', expenseId: 'e1' };
    assert.equal(planExpenseCascade(tx, [tx], [exp]), exp);
  });
  it('keeps the expense while another payment still points at it', () => {
    const tx = { id: 't1', expenseId: 'e1' };
    assert.equal(planExpenseCascade(tx, [tx, { id: 't2', expenseId: 'e1' }], [exp]), null);
  });
  it('lets payments deleted in the same operation not keep the expense alive', () => {
    const tx = { id: 't1', expenseId: 'e1' };
    assert.equal(planExpenseCascade(tx, [tx, { id: 't2', expenseId: 'e1' }], [exp], ['t2']), exp);
  });
  it('does nothing for payments without an expense or with a missing expense', () => {
    assert.equal(planExpenseCascade({ id: 't1' }, [], [exp]), null);
    assert.equal(planExpenseCascade({ id: 't1', expenseId: 'gone' }, [], [exp]), null);
  });
});

describe('entity restore keeps payments attached', () => {
  it('re-points payments at a recovered entity and at a recovered expense', () => {
    const stores = { payment_transactions: [{ id: 't1', entityId: 'oldEnt', expenseId: 'oldExp' }] };
    remapReferences(stores, 'oldEnt', 'newEnt');
    remapReferences(stores, 'oldExp', 'newExp');
    assert.equal(stores.payment_transactions[0].entityId, 'newEnt');
    assert.equal(stores.payment_transactions[0].expenseId, 'newExp');
  });
  it('re-points a recovered payment snapshot at an entity recovered earlier', () => {
    const snap = { id: 't1', entityId: 'oldEnt', expenseId: 'oldExp' };
    resolveOwnLinks('transactions', snap, { oldEnt: 'newEnt', oldExp: 'newExp' });
    assert.equal(snap.entityId, 'newEnt');
    assert.equal(snap.expenseId, 'newExp');
  });
  it('restores the entity and expense before the payment that points at them', () => {
    const order = orderForRestore([
      { recordId: 't1', collection: 'transactions', snapshot: { entityId: 'e', expenseId: 'x' } },
      { recordId: 'x', collection: 'expenses', snapshot: {} },
      { recordId: 'e', collection: 'entities', snapshot: {} },
    ]).map(t => t.recordId);
    assert.equal(order[order.length - 1], 't1');
  });
});
