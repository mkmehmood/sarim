import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planSupplierCreditConsumption, planSupplierCreditRestore, getSupplierCreditReconsumeIssue,
  remapReferences, resolveOwnLinks,
} from '../modules/link-graph.js';

const creditTx = (id, amount, remaining, extra = {}) => ({
  id, type: 'IN', isPayable: true, entityId: 'sup1',
  amount, supplierCreditAmount: remaining, date: '2026-01-0' + id.slice(-1), ...extra,
});

describe('planSupplierCreditConsumption', () => {
  it('consumes open supplier credit oldest-first and records each slice', () => {
    const txs = [creditTx('c1', 100, 100), creditTx('c2', 200, 150), creditTx('c3', 50, 50)];
    const plan = planSupplierCreditConsumption(txs, 'sup1', 200);
    assert.deepEqual(plan.consumptions, [{ id: 'c1', amount: 100 }, { id: 'c2', amount: 100 }]);
    assert.equal(plan.remaining, 0);
  });
  it('leaves the unpayable remainder and ignores other entities, OUT payments and empty credits', () => {
    const txs = [
      creditTx('c1', 100, 100),
      creditTx('c9', 500, 500, { entityId: 'other' }),
      { id: 'o1', type: 'OUT', isPayable: true, entityId: 'sup1', amount: 300 },
      creditTx('c8', 80, 0),
    ];
    const plan = planSupplierCreditConsumption(txs, 'sup1', 250);
    assert.deepEqual(plan.consumptions, [{ id: 'c1', amount: 100 }]);
    assert.equal(plan.remaining, 150);
  });
  it('returns no consumptions for zero or negative amounts', () => {
    assert.deepEqual(planSupplierCreditConsumption([creditTx('c1', 100, 100)], 'sup1', 0), { consumptions: [], remaining: 0 });
  });
});

describe('planSupplierCreditRestore', () => {
  it('gives consumed credit back, capped at the credit record amount', () => {
    const out = { id: 'p1', type: 'OUT', consumedCredits: [{ id: 'c1', amount: 60 }, { id: 'c2', amount: 40 }] };
    const live = [creditTx('c1', 100, 60), creditTx('c2', 100, 80)];
    assert.deepEqual(planSupplierCreditRestore(out, live), [
      { id: 'c1', amount: 40 },
      { id: 'c2', amount: 20 },
    ]);
  });
  it('skips credits that no longer exist instead of blocking the restore', () => {
    const out = { id: 'p1', type: 'OUT', consumedCredits: [{ id: 'gone', amount: 50 }, { id: 'c1', amount: 30 }] };
    assert.deepEqual(planSupplierCreditRestore(out, [creditTx('c1', 100, 90)]), [{ id: 'c1', amount: 10 }]);
  });
  it('returns nothing for plain non-linked payments', () => {
    assert.deepEqual(planSupplierCreditRestore({ id: 'p1', type: 'OUT' }, []), []);
  });
});

describe('getSupplierCreditReconsumeIssue', () => {
  const out = { id: 'p1', type: 'OUT', isPayable: true, consumedCredits: [{ id: 'c1', amount: 100 }] };
  it('allows recovery while the consumed credit is still available', () => {
    assert.equal(getSupplierCreditReconsumeIssue(out, [creditTx('c1', 200, 150)]), null);
  });
  it('blocks recovery when another payment consumed the credit in the meantime', () => {
    const issue = getSupplierCreditReconsumeIssue(out, [creditTx('c1', 200, 50)]);
    assert.match(issue, /consumed by another payment/);
  });
  it('resolves recovered ids through the id map before checking', () => {
    const resolve = (x) => (x === 'c1' ? 'c1-new' : x);
    assert.equal(getSupplierCreditReconsumeIssue(out, [creditTx('c1-new', 200, 200)], resolve), null);
  });
  it('ignores payments without consumed credits', () => {
    assert.equal(getSupplierCreditReconsumeIssue({ id: 'p2', type: 'OUT', isPayable: true }, []), null);
  });
});

describe('consumedCredits reference remapping', () => {
  it('re-points consumed credit ids when a credit record is recovered with a new id', () => {
    const stores = {
      transactions: [
        { id: 'p1', type: 'OUT', consumedCredits: [{ id: 'oldCredit', amount: 50 }, { id: 'keep', amount: 10 }] },
        { id: 'p2', type: 'OUT', consumedCredits: [{ id: 'keep', amount: 5 }] },
      ],
    };
    const changed = remapReferences(stores, 'oldCredit', 'newCredit');
    assert.equal(stores.transactions[0].consumedCredits[0].id, 'newCredit');
    assert.equal(stores.transactions[0].consumedCredits[1].id, 'keep');
    assert.equal(stores.transactions[1].consumedCredits[0].id, 'keep');
    assert.deepEqual(changed.transactions.map(r => r.id), ['p1']);
  });
  it('resolveOwnLinks follows id-map chains inside consumedCredits', () => {
    const snap = { id: 'p1', consumedCredits: [{ id: 'old', amount: 20 }] };
    resolveOwnLinks('transactions', snap, { old: 'mid', mid: 'new' });
    assert.equal(snap.consumedCredits[0].id, 'new');
  });
});
