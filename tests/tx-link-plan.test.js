import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planTransferPairDelete, planPaymentTxDeletion, planEntityTxDeletion,
  getBatchCashIssue, getTxLinkIssue, getDeleteCashDrop,
} from '../modules/link-graph.js';

const ent = (id, name) => ({ id, name });
const tx = (over = {}) => ({ id: 't1', entityId: 'e1', entityName: 'Alpha', type: 'OUT', amount: 100, ...over });

describe('planTransferPairDelete', () => {
  it('classifies a complete OUT+IN pair', () => {
    const out = tx({ id: 'a', type: 'OUT', entityId: 'e1', entityName: 'Alpha', isTransfer: true, transferPairId: 'p', transferPeerEntityId: 'e2' });
    const inS = tx({ id: 'b', type: 'IN', entityId: 'e2', entityName: 'Beta', isTransfer: true, transferPairId: 'p', transferPeerEntityId: 'e1' });
    const plan = planTransferPairDelete([out, inS]);
    assert.equal(plan.complete, true);
    assert.equal(plan.pairs.length, 2);
    assert.equal(plan.fromName, 'Alpha');
    assert.equal(plan.toName, 'Beta');
    assert.equal(plan.amount, 100);
    assert.equal(plan.block, null);
  });
  it('blocks when the transfer is already gone', () => {
    const plan = planTransferPairDelete([]);
    assert.ok(plan.block);
  });
  it('flags a lone side as an orphan cleanup, not a balanced pair', () => {
    const out = tx({ id: 'a', type: 'OUT', isTransfer: true, transferPairId: 'p' });
    const plan = planTransferPairDelete([out]);
    assert.equal(plan.complete, false);
    assert.equal(plan.pairs.length, 1);
    assert.equal(plan.block, null);
  });
});

describe('planPaymentTxDeletion', () => {
  const expenses = [{ id: 'x1', name: 'Fuel' }];
  it('blocks merged opening balances', () => {
    const plan = planPaymentTxDeletion(tx({ isMerged: true }), [], expenses);
    assert.equal(plan.kind, 'merged');
    assert.match(plan.block, /Merged opening balance/);
  });
  it('routes transfers to pair deletion with zero cash drop', () => {
    const t = tx({ isTransfer: true, transferPairId: 'p', type: 'IN' });
    const plan = planPaymentTxDeletion(t, [t], expenses);
    assert.equal(plan.kind, 'transfer');
    assert.equal(plan.pairId, 'p');
    assert.equal(plan.cashDrop, 0);
  });
  it('counts cash drop for plain IN payments only', () => {
    const inTx = tx({ type: 'IN', amount: 500 });
    const outTx = tx({ type: 'OUT', amount: 500 });
    assert.equal(planPaymentTxDeletion(inTx, [inTx], expenses).cashDrop, 500);
    assert.equal(planPaymentTxDeletion(outTx, [outTx], expenses).cashDrop, 0);
  });
  it('payable IN purchases are exempt from cash drop', () => {
    const t = tx({ type: 'IN', isPayable: true, amount: 900 });
    assert.equal(planPaymentTxDeletion(t, [t], expenses).cashDrop, 0);
    assert.equal(planPaymentTxDeletion(t, [t], expenses).kind, 'payable');
  });
  it('cascades the linked expense when no other transaction uses it', () => {
    const t = tx({ expenseId: 'x1' });
    const plan = planPaymentTxDeletion(t, [t], expenses);
    assert.equal(plan.kind, 'expense');
    assert.equal(plan.cascadeExpense.id, 'x1');
  });
  it('keeps the expense when another live transaction still references it', () => {
    const t = tx({ expenseId: 'x1' });
    const other = tx({ id: 't2', expenseId: 'x1' });
    const plan = planPaymentTxDeletion(t, [t, other], expenses);
    assert.equal(plan.cascadeExpense, null);
  });
  it('blocks on a missing record', () => {
    assert.ok(planPaymentTxDeletion(null, [], []).block);
  });
});

describe('planEntityTxDeletion', () => {
  it('separates merged, transfer pairs and normal txs, summing cash drop', () => {
    const txs = [
      tx({ id: 'm1', isMerged: true }),
      tx({ id: 'n1', type: 'IN', amount: 300 }),
      tx({ id: 'n2', type: 'OUT', amount: 200 }),
      tx({ id: 'a', type: 'OUT', isTransfer: true, transferPairId: 'p1' }),
      tx({ id: 'b', type: 'IN', isTransfer: true, transferPairId: 'p1' }),
      tx({ id: 'c', type: 'OUT', isTransfer: true, transferPairId: 'p2' }),
    ];
    const plan = planEntityTxDeletion(txs);
    assert.deepEqual(plan.merged.map(t => t.id), ['m1']);
    assert.deepEqual(plan.normal.map(t => t.id), ['n1', 'n2']);
    assert.equal(plan.transferPairs.length, 2);
    assert.equal(plan.cashDrop, 300);
  });
  it('handles empty history', () => {
    const plan = planEntityTxDeletion([]);
    assert.equal(plan.cashDrop, 0);
    assert.equal(plan.transferPairs.length, 0);
  });
});

describe('getBatchCashIssue', () => {
  it('blocks when combined IN removals exceed available cash', () => {
    const txs = [tx({ id: 'a', type: 'IN', amount: 400 }), tx({ id: 'b', type: 'IN', amount: 300 })];
    const issue = getBatchCashIssue(txs, 500, 'Deleting this entity');
    assert.match(issue, /700/);
    assert.match(issue, /500/);
  });
  it('passes when cash covers the drop', () => {
    const txs = [tx({ id: 'a', type: 'IN', amount: 400 })];
    assert.equal(getBatchCashIssue(txs, 500, 'Deleting this entity'), null);
  });
});

describe('getTxLinkIssue', () => {
  const entities = [ent('e1', 'Alpha'), ent('e2', 'Beta')];
  const expenses = [{ id: 'x1' }];
  const inventory = [{ id: 'm1', name: 'Chora' }];
  it('accepts a plain linked payment', () => {
    assert.equal(getTxLinkIssue(tx({ expenseId: 'x1' }), { entities, expenses }), null);
  });
  it('rejects a payment whose entity is gone', () => {
    assert.match(getTxLinkIssue(tx({ entityId: 'gone' }), { entities }), /no longer exists/);
  });
  it('rejects a transaction whose type is not IN or OUT', () => {
    assert.match(getTxLinkIssue(tx({ type: 'operating' }), { entities }), /IN or OUT/);
    assert.match(getTxLinkIssue(tx({ type: undefined }), { entities }), /IN or OUT/);
    assert.equal(getTxLinkIssue(tx({ type: 'IN' }), { entities }), null);
    assert.equal(getTxLinkIssue(tx({ type: 'OUT' }), { entities }), null);
  });
  it('rejects a payment linked to a deleted expense', () => {
    assert.match(getTxLinkIssue(tx({ expenseId: 'nope' }), { entities, expenses }), /expense.*no longer exists/);
  });
  it('rejects transfers with a missing peer or self-loop', () => {
    const base = { isTransfer: true, transferPairId: 'p', entityId: 'e1' };
    assert.match(getTxLinkIssue(tx(base), { entities }), /other side/);
    assert.match(getTxLinkIssue(tx({ ...base, transferPeerEntityId: 'e1' }), { entities }), /same entity on both sides/);
    assert.match(getTxLinkIssue(tx({ ...base, transferPeerEntityId: 'ghost' }), { entities }), /no longer exists/);
    assert.equal(getTxLinkIssue(tx({ ...base, transferPeerEntityId: 'e2' }), { entities }), null);
  });
  it('rejects a payable payment when none of its materials exist', () => {
    const t = tx({ isPayable: true, materialIds: ['gone1', 'gone2'] });
    assert.match(getTxLinkIssue(t, { entities, inventory }), /materials.*exist anymore/);
    const ok = tx({ isPayable: true, materialIds: ['m1', 'gone2'] });
    assert.equal(getTxLinkIssue(ok, { entities, inventory }), null);
  });
  it('getDeleteCashDrop stays consistent with the planner', () => {
    const t = tx({ type: 'IN', amount: 250 });
    assert.equal(getDeleteCashDrop(t), planPaymentTxDeletion(t, [t], []).cashDrop);
  });
});
