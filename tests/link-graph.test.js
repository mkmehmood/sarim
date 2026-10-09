import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveId, remapReferences, resolveOwnLinks, planChildDetach, planChildReattach, applyPatch,
  getEditLinkIssue, planExpenseCascade, stampGroup, newGroupId, orderForRestore, findGroupMembers,
  expandGroups, GROUP_FIELD, remapMaterialRefs, planMaterialDeduction, findReturnLogFor, getReturnStockDrop,
  getUnitsShortIssue, getStockOverdrawIssue, recordRename, resolveRename, getOldDebtEditIssue, sumChildPayments,
  resolveSelectedFormula, runExclusive, getDeleteCashDrop, getRestoreCashNeed, getCashShortIssue, planEntityRename, applyEntityRename, findPartialConflicts, planCalcRestore, findParentTombstones, expandRecoveryMembers, planGroupRecovery, getPartialPaidIssue, isSettleableSale, planCreditToggle, planEditSettlement, applySettlement, findPayableInTxs, materialOriginalPayable, allocatePayments, planPayableAdjustment,
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

describe('more id references', () => {
  it('re-points materials -> supplier and payments -> material', () => {
    const stores = {
      factory_inventory_data: [{ id: 'm1', supplierId: 'oldS' }, { id: 'm2', supplierId: 'other' }],
      payment_transactions: [{ id: 't', materialId: 'oldM', materialIds: ['oldM', 'z'], entityId: 'oldS' }],
    };
    remapReferences(stores, 'oldS', 'newS');
    remapReferences(stores, 'oldM', 'newM');
    assert.equal(stores.factory_inventory_data[0].supplierId, 'newS');
    assert.equal(stores.factory_inventory_data[1].supplierId, 'other');
    assert.equal(stores.payment_transactions[0].entityId, 'newS');
    assert.equal(stores.payment_transactions[0].materialId, 'newM');
    assert.deepEqual(stores.payment_transactions[0].materialIds, ['newM', 'z']);
  });
  it('re-points factory batches and formulas at a recovered material', () => {
    const hist = [{ id: 'h', materialsUsed: [{ id: 'oldM', quantity: 2 }] }, { id: 'h2', materialsUsed: [{ id: 'x' }] }];
    const formulas = { standard: [{ id: 'oldM', quantity: 1 }], asaan: [{ id: 'y' }] };
    const r = remapMaterialRefs(hist, formulas, 'oldM', 'newM');
    assert.equal(hist[0].materialsUsed[0].id, 'newM');
    assert.equal(formulas.standard[0].id, 'newM');
    assert.equal(r.historyChanged.length, 1);
    assert.equal(r.formulasChanged, true);
  });
});

describe('factory batch restore takes materials back out of inventory', () => {
  const inv = () => [{ id: 'a', name: 'Sugar', quantity: 100 }, { id: 'b', name: 'Flour', quantity: 5 }];
  it('deducts exactly what delete added back', () => {
    const { updates } = planMaterialDeduction({ materialsUsed: [{ id: 'a', name: 'Sugar', quantity: 30 }] }, inv(), {}, 'standard');
    assert.deepEqual(updates, [{ id: 'a', quantity: 70 }]);
  });
  it('blocks when inventory no longer has enough', () => {
    assert.match(planMaterialDeduction({ materialsUsed: [{ id: 'b', name: 'Flour', quantity: 9 }] }, inv(), {}, 'standard').block, /Not enough Flour/);
  });
  it('blocks when the material was deleted', () => {
    assert.match(planMaterialDeduction({ materialsUsed: [{ id: 'gone', name: 'Salt', quantity: 1 }] }, inv(), {}, 'standard').block, /no longer in your inventory/);
  });
  it('falls back to the formula x units, matching deleteFactoryEntry', () => {
    const { updates } = planMaterialDeduction({ units: 4, store: 'standard' }, inv(), { standard: [{ id: 'a', name: 'Sugar', quantity: 2.5 }] }, 'standard');
    assert.deepEqual(updates, [{ id: 'a', quantity: 90 }]);
  });
});

describe('stock overdraw on restore', () => {
  it('blocks a sale that would use more than is available', () => {
    assert.match(getStockOverdrawIssue('Store A', 50, 20), /only 20 kg/);
  });
  it('allows when stock covers it, or when there is no quantity', () => {
    assert.equal(getStockOverdrawIssue('Store A', 20, 20), null);
    assert.equal(getStockOverdrawIssue('Store A', 0, 0), null);
  });
});

describe('customer rename map', () => {
  it('records and follows renames, case-insensitively and through chains', () => {
    const m = {};
    recordRename(m, 'sales', 'Ali', 'Ali Khan');
    recordRename(m, 'sales', 'ali khan', 'Ali K. Traders');
    assert.equal(resolveRename(m, 'sales', 'ALI'), 'Ali K. Traders');
    assert.equal(resolveRename(m, 'sales', 'Bilal'), 'Bilal');
  });
  it('keeps rep-specific renames separate', () => {
    const m = {};
    recordRename(m, 'rep|R1', 'Ali', 'Ali Khan');
    assert.equal(resolveRename(m, 'rep|R2', 'Ali'), 'Ali');
    assert.equal(resolveRename(m, 'rep|R1', 'Ali'), 'Ali Khan');
  });
  it('ignores no-op renames and cycles', () => {
    const m = {};
    recordRename(m, 'sales', 'Ali', 'ali');
    assert.deepEqual(m, {});
    recordRename(m, 'sales', 'A', 'B'); recordRename(m, 'sales', 'B', 'A');
    assert.equal(typeof resolveRename(m, 'sales', 'A'), 'string');
  });
});

describe('old balance edits', () => {
  const kids = [{ totalValue: 300 }, { totalValue: 200 }];
  it('blocks lowering below what was collected', () => {
    assert.match(getOldDebtEditIssue(400, kids), /500 has already been collected/);
  });
  it('allows raising it and reports the collected sum', () => {
    assert.equal(getOldDebtEditIssue(900, kids), null);
    assert.equal(sumChildPayments(kids), 500);
    assert.equal(getOldDebtEditIssue(10, []), null);
  });
});

describe('transfer halves recover together even without a deletion group', () => {
  it('pairs both sides of a transfer by transferPairId', () => {
    const out = { id: 'o', snapshot: { transferPairId: 'P1', transferDirection: 'out' } };
    const inn = { id: 'i', snapshot: { transferPairId: 'P1', transferDirection: 'in' } };
    const other = { id: 'x', snapshot: { transferPairId: 'P2' } };
    const members = findGroupMembers(out, [out, inn, other]);
    assert.deepEqual(members.map(t => t.id).sort(), ['i', 'o']);
  });
  it('combines a deletion group with a transfer pair and never loses the record itself', () => {
    const a = { id: 'a', snapshot: { [GROUP_FIELD]: 'g', transferPairId: 'P' } };
    const b = { id: 'b', snapshot: { transferPairId: 'P' } };
    const c = { id: 'c', snapshot: { [GROUP_FIELD]: 'g' } };
    assert.deepEqual(findGroupMembers(a, [a, b, c]).map(t => t.id).sort(), ['a', 'b', 'c']);
    assert.deepEqual(findGroupMembers(a, []).map(t => t.id), ['a']);
  });
});

describe('production returns are a pair', () => {
  const entry = { id: 'e', store: 'A', date: '2026-01-05', net: 12, createdAt: 111, returnedBy: 'Ali' };
  it('finds the stock_returns log that belongs to the entry', () => {
    const logs = [
      { id: 'l1', store: 'A', date: '2026-01-05', quantity: 12, createdAt: 999, seller: 'Bilal' },
      { id: 'l2', store: 'A', date: '2026-01-05', quantity: 12, createdAt: 111, seller: 'Ali' },
      { id: 'l3', store: 'B', date: '2026-01-05', quantity: 12, createdAt: 111 },
    ];
    assert.equal(findReturnLogFor(entry, logs).id, 'l2');
    assert.equal(findReturnLogFor({ ...entry, createdAt: 5, returnedBy: 'Ali' }, logs).id, 'l2');
    assert.equal(findReturnLogFor({ ...entry, createdAt: 5, returnedBy: 'Nobody' }, logs).id, 'l1');
  });
  it('returns null when no log counts it, and ignores deleted logs', () => {
    assert.equal(findReturnLogFor(entry, []), null);
    assert.equal(findReturnLogFor(entry, [{ id: 'x', store: 'A', date: '2026-01-05', quantity: 12, deletedAt: 1 }]), null);
    assert.equal(getReturnStockDrop(entry, null), 0);
    assert.equal(getReturnStockDrop(entry, { quantity: 12 }), 12);
  });
});

describe('restoring production needs factory units', () => {
  it('blocks when the factory no longer has enough units', () => {
    assert.match(getUnitsShortIssue('Standard', 5, 2), /only 2 are available/);
  });
  it('allows when enough, or when no units are used', () => {
    assert.equal(getUnitsShortIssue('Standard', 5, 5), null);
    assert.equal(getUnitsShortIssue('Standard', 0, 0), null);
  });
});

describe('expandGroups (erase / recover together)', () => {
  const tomb = (id, snapshot) => ({ id, recordId: id, snapshot });
  it('adds group and transfer-pair mates once, keeps loners alone', () => {
    const all = [
      tomb('p1', { [GROUP_FIELD]: 'g1' }), tomb('e1', { [GROUP_FIELD]: 'g1' }),
      tomb('t1', { transferPairId: 'x' }), tomb('t2', { transferPairId: 'x' }),
      tomb('solo', {}),
    ];
    const ids = (r) => r.map(t => t.id).sort();
    assert.deepEqual(ids(expandGroups([all[0]], all)), ['e1', 'p1']);
    assert.deepEqual(ids(expandGroups([all[0], all[1], all[2]], all)), ['e1', 'p1', 't1', 't2']);
    assert.deepEqual(ids(expandGroups([all[4]], all)), ['solo']);
    assert.deepEqual(expandGroups([], all), []);
  });
});

describe('supplier payables stay tied to what was invoiced', () => {
  const inTx = (id, mat, amt) => ({ id, type: 'IN', isPayable: true, entityId: 'S', materialId: mat, amount: amt });
  it('uses the invoiced amount even after batches used the stock up', () => {
    const mat = { id: 'm1', totalValue: 200, quantity: 20, cost: 10 };
    assert.equal(materialOriginalPayable(mat, [inTx('t', 'm1', 1000)]), 1000);
  });
  it('falls back to stock value only when nothing was invoiced', () => {
    assert.equal(materialOriginalPayable({ id: 'm', totalValue: 300 }, []), 300);
  });
  it('ignores multi-material invoices and deleted ones', () => {
    const multi = { id: 'x', type: 'IN', isPayable: true, entityId: 'S', materialIds: ['m1', 'm2'], amount: 900 };
    assert.equal(materialOriginalPayable({ id: 'm1', totalValue: 50 }, [multi]), 50);
    assert.equal(findPayableInTxs([{ ...inTx('d', 'm1', 5), deletedAt: 1 }], 'm1', 'S').length, 0);
  });
  it('a payment cannot settle more than was invoiced because stock was consumed', () => {
    const m1 = { id: 'm1', totalValue: 200 };
    const txs = [inTx('t', 'm1', 1000)];
    allocatePayments([m1], [{ amount: 400, date: '2026-02-01' }], m => materialOriginalPayable(m, txs));
    assert.equal(m1.totalPayable, 600);
    assert.equal(m1.paymentStatus, 'pending');
  });
  it('pays oldest first and marks fully settled materials paid', () => {
    const a = { id: 'a' }, b = { id: 'b' };
    const orig = { a: 100, b: 300 };
    allocatePayments([a, b], [{ amount: 250, date: 'D' }], m => orig[m.id]);
    assert.equal(a.paymentStatus, 'paid'); assert.equal(a.totalPayable, 0); assert.equal(a.paidDate, 'D');
    assert.equal(b.totalPayable, 150); assert.equal(b.paymentStatus, 'pending');
  });
  it('moves the payable by the same amount the stock value changed, never below zero', () => {
    assert.deepEqual(planPayableAdjustment(1000, 250), { next: 1250, change: 250 });
    assert.deepEqual(planPayableAdjustment(1000, -400), { next: 600, change: -400 });
    assert.deepEqual(planPayableAdjustment(100, -500), { next: 0, change: -100 });
  });
});

describe('new production card always shows the selected formula, freshly', () => {
  const inv = [{ id: 'sug', name: 'Sugar (new name)', cost: 12, quantity: 50 }, { id: 'fl', name: 'Flour', cost: 5, quantity: 3 }];
  const list = [
    { id: 'F1', name: 'Premium', additionalCost: 7, ingredients: [{ id: 'sug', name: 'Sugar', cost: 1, quantity: 2 }, { id: 'fl', name: 'Flour', cost: 1, quantity: 4 }, { id: 'gone', name: 'Salt', cost: 3, quantity: 1 }] },
    { id: 'F2', name: 'Basic', additionalCost: 0, ingredients: [{ id: 'fl', name: 'Flour', quantity: 1 }] },
  ];
  it('reads the formula from the formula store, with live names, costs and stock', () => {
    const r = resolveSelectedFormula({ list, slots: { standard: 'F1' }, stores: [], inventory: inv, feed: { standard: [{ id: 'old', name: 'Stale', quantity: 9 }] } }, 'STORE_A');
    assert.equal(r.source, 'store');
    assert.equal(r.name, 'Premium');
    assert.equal(r.additionalCost, 7);
    assert.deepEqual(r.ingredients.map(i => i.name), ['Sugar (new name)', 'Flour', 'Salt']);
    assert.equal(r.ingredients[0].cost, 12);
    assert.equal(r.ingredients[2].missing, true);
    assert.equal(r.ingredients[1].stock, 3);
  });
  it("uses the store's own selected formula before the slot's formula", () => {
    const stores = [{ key: 'STORE_A', formulaType: 'standard', formulaId: 'F2' }];
    const r = resolveSelectedFormula({ list, slots: { standard: 'F1' }, stores, inventory: inv }, 'STORE_A');
    assert.equal(r.name, 'Basic');
  });
  it('picks up an edited formula immediately (no stale copy kept anywhere)', () => {
    const before = resolveSelectedFormula({ list, slots: { standard: 'F2' }, inventory: inv }, 'STORE_A');
    const edited = list.map(f => f.id === 'F2' ? { ...f, ingredients: [{ id: 'fl', name: 'Flour', quantity: 6 }] } : f);
    const after = resolveSelectedFormula({ list: edited, slots: { standard: 'F2' }, inventory: inv }, 'STORE_A');
    assert.equal(before.ingredients[0].quantity, 1);
    assert.equal(after.ingredients[0].quantity, 6);
  });
  it('falls back to the derived feed only when the formula no longer exists', () => {
    const r = resolveSelectedFormula({ list: [], slots: { standard: 'F1' }, inventory: inv, feed: { standard: [{ id: 'fl', name: 'Flour', quantity: 2 }] }, costs: { standard: 4 } }, 'STORE_A');
    assert.equal(r.source, 'feed');
    assert.equal(r.additionalCost, 4);
    assert.equal(r.ingredients.length, 1);
  });
  it('maps the asaan slot and slot-key inputs correctly', () => {
    const r = resolveSelectedFormula({ list, slots: { standard: 'F1', asaan: 'F2' }, inventory: inv }, 'STORE_C');
    assert.equal(r.type, 'asaan'); assert.equal(r.name, 'Basic');
    assert.equal(resolveSelectedFormula({ list, slots: { asaan: 'F2' }, inventory: inv }, 'asaan').name, 'Basic');
  });
});

describe('credit settlement keeps its date in step with its flag', () => {
  it('marking paid sets the settled date; marking unpaid clears every settled field', () => {
    const rec = { paymentType: 'CREDIT', creditReceived: false };
    applySettlement(rec, planCreditToggle(rec, '2026-03-01', '10:00 AM'));
    assert.deepEqual([rec.creditReceived, rec.creditReceivedDate, rec.creditReceivedManually], [true, '2026-03-01', true]);
    applySettlement(rec, planCreditToggle(rec, '2026-03-02', '11:00 AM'));
    assert.equal(rec.creditReceived, false);
    assert.equal(rec.creditReceivedDate, undefined);
    assert.equal(rec.creditReceivedManually, undefined);
  });
  it('only credit and old-debt records can be settled', () => {
    assert.equal(isSettleableSale({ paymentType: 'CREDIT' }), true);
    assert.equal(isSettleableSale({ transactionType: 'OLD_DEBT', paymentType: 'CASH' }), true);
    assert.equal(isSettleableSale({ paymentType: 'CASH' }), false);
    assert.equal(isSettleableSale({ paymentType: 'COLLECTION' }), false);
  });
  it('editing a paid credit sale keeps it paid, with its settled date', () => {
    const orig = { paymentType: 'CREDIT', creditReceived: true, creditReceivedDate: '2026-02-10', creditReceivedManually: true };
    const edited = applySettlement({ paymentType: 'CREDIT', creditReceived: false }, planEditSettlement(orig, 'CREDIT'));
    assert.equal(edited.creditReceived, true);
    assert.equal(edited.creditReceivedDate, '2026-02-10');
  });
  it('editing an unpaid credit sale stays unpaid; switching type follows the new type', () => {
    assert.equal(planEditSettlement({ paymentType: 'CREDIT', creditReceived: false }, 'CREDIT').set.creditReceived, false);
    assert.equal(planEditSettlement({ paymentType: 'CREDIT', creditReceived: false }, 'CASH').set.creditReceived, true);
    const toCredit = applySettlement({ creditReceived: true, creditReceivedDate: 'x' }, planEditSettlement({ paymentType: 'CASH', creditReceived: true }, 'CREDIT'));
    assert.equal(toCredit.creditReceived, false);
    assert.equal(toCredit.creditReceivedDate, undefined);
  });
});

describe('old bin records come back with what they depend on', () => {
  const tomb = (id, collection, snapshot) => ({ id, recordId: id, collection, snapshot });
  const live = (ids = [], sales = [], rep = []) => ({ ids: new Set(ids), contacts: { sales: new Set(sales), rep: new Set(rep) } });

  it('a payment brings back its deleted expense and supplier, not their other payments', () => {
    const exp = tomb('e1', 'expenses', {});
    const sup = tomb('s1', 'entities', { name: 'Supplier' });
    const pay = tomb('t1', 'transactions', { expenseId: 'e1', entityId: 's1' });
    const other = tomb('t2', 'transactions', { entityId: 's1' });
    const ids = expandRecoveryMembers(pay, [exp, sup, pay, other], live()).map(t => t.id).sort();
    assert.deepEqual(ids, ['e1', 's1', 't1']);
  });
  it('does not pull parents that are still live', () => {
    const pay = tomb('t1', 'transactions', { expenseId: 'e1', entityId: 's1' });
    assert.deepEqual(expandRecoveryMembers(pay, [pay, tomb('e1', 'expenses', {})], live(['e1', 's1'])).map(t => t.id), ['t1']);
  });
  it('a sale brings back its deleted customer contact, matched by name', () => {
    const contact = tomb('c1', 'sales_customers', { name: 'Ali Khan' });
    const sale = tomb('x1', 'sales', { customerName: 'ali khan', salesRep: 'NONE' });
    assert.deepEqual(expandRecoveryMembers(sale, [contact, sale], live()).map(t => t.id).sort(), ['c1', 'x1']);
    assert.deepEqual(expandRecoveryMembers(sale, [contact, sale], live([], ['ali khan'])).map(t => t.id), ['x1']);
  });
  it('a partial payment brings back its credit sale, and a material its supplier', () => {
    const parent = tomb('p1', 'sales', { customerName: 'A' });
    const child = tomb('k1', 'sales', { relatedSaleId: 'p1', paymentType: 'PARTIAL_PAYMENT' });
    assert.ok(expandRecoveryMembers(child, [parent, child], live([], ['a'])).some(t => t.id === 'p1'));
    const sup = tomb('s9', 'entities', {});
    const mat = tomb('m1', 'inventory', { supplierId: 's9' });
    assert.ok(expandRecoveryMembers(mat, [sup, mat], live()).some(t => t.id === 's9'));
  });
  it('pairs an old return entry with its stock log even without a group', () => {
    const entry = tomb('r1', 'production', { isReturn: true, store: 'A', date: 'D', net: 5, createdAt: 77 });
    const log = tomb('r2', 'returns', { store: 'A', date: 'D', quantity: 5, createdAt: 77 });
    assert.deepEqual(expandRecoveryMembers(entry, [entry, log], live()).map(t => t.id).sort(), ['r1', 'r2']);
    assert.deepEqual(expandRecoveryMembers(log, [entry, log], live()).map(t => t.id).sort(), ['r1', 'r2']);
  });
});

describe('recover what can be recovered, skip what cannot', () => {
  const tomb = (id, collection, snapshot) => ({ id, recordId: id, collection, snapshot });
  it('skips the blocked record and everything that depends on it, restores the rest', () => {
    const contact = tomb('c', 'sales_customers', { name: 'Ali' });
    const parent = tomb('p', 'sales', { customerName: 'Ali', quantity: 90 });
    const child = tomb('k', 'sales', { customerName: 'Ali', relatedSaleId: 'p' });
    const free = tomb('f', 'sales', { customerName: 'Ali', quantity: 1 });
    const plan = planGroupRecovery([contact, parent, child, free], new Map([['p', 'Not enough stock']]), 'f');
    assert.deepEqual(plan.restore.map(t => t.id).sort(), ['c', 'f']);
    assert.deepEqual(plan.skipped.map(x => x.tomb.id).sort(), ['k', 'p']);
    assert.equal(plan.requestedSkipped, null);
    assert.match(plan.skipped.find(x => x.tomb.id === 'k').reason, /depends on/);
  });
  it('skips every sale of a customer whose contact cannot come back', () => {
    const contact = tomb('c', 'sales_customers', { name: 'Ali' });
    const sale = tomb('s', 'sales', { customerName: 'Ali' });
    const plan = planGroupRecovery([contact, sale], new Map([['c', 'blocked']]), 's');
    assert.equal(plan.restore.length, 0);
    assert.match(plan.requestedSkipped, /customer "Ali"/);
  });
  it('keeps transfer halves and return pairs together', () => {
    const out = tomb('o', 'production', { isTransfer: true, transferPairId: 'P' });
    const inn = tomb('i', 'production', { isTransfer: true, transferPairId: 'P' });
    const p1 = planGroupRecovery([out, inn], new Map([['o', 'no stock']]), 'i');
    assert.equal(p1.restore.length, 0);
    const entry = tomb('r1', 'production', { isReturn: true, store: 'A', date: 'D', net: 5, createdAt: 1 });
    const log = tomb('r2', 'returns', { store: 'A', date: 'D', quantity: 5, createdAt: 1 });
    assert.equal(planGroupRecovery([entry, log], new Map([['r2', 'x']]), 'r1').restore.length, 0);
  });
  it('restores everything when nothing is blocked, parents first', () => {
    const parent = tomb('p', 'sales', {});
    const child = tomb('k', 'sales', { relatedSaleId: 'p' });
    const plan = planGroupRecovery([child, parent], new Map(), 'k');
    assert.deepEqual(plan.restore.map(t => t.id), ['p', 'k']);
    assert.equal(plan.skipped.length, 0);
  });
});

describe('marking a partly-paid sale as paid', () => {
  it('is refused while separate payment records exist, allowed otherwise', () => {
    assert.match(getPartialPaidIssue(400), /400 was already collected/);
    assert.equal(getPartialPaidIssue(0), null);
  });
});

describe('calculator record restore preconditions', () => {
  const sale = (id, extra = {}) => ({ id, paymentType: 'CREDIT', creditReceived: false, ...extra });
  const entry = { id: 'c1', linkedSalesIds: ['s1', 's2'], linkedRepSalesIds: ['r1'], returned: 5, returnStore: 'A', expired: 2 };
  const ctx = (over = {}) => ({ sales: [sale('s1'), sale('s2')], repSales: [{ id: 'r1' }], history: [], storeKeys: ['A'], ...over });

  it('allows restore when everything is exactly as the delete left it', () => {
    assert.equal(planCalcRestore(entry, ctx()).block, null);
  });
  it('blocks when a settled sale was deleted, paid since, or settled by another record', () => {
    const r = planCalcRestore(entry, ctx({ sales: [sale('s1', { creditReceived: true })], history: [{ id: 'other', linkedSalesIds: ['s2'] }] }));
    assert.match(r.block, /2 of the 2 credit sales/);
    assert.match(r.block, /already paid or changed/);
    const gone = planCalcRestore(entry, ctx({ sales: [sale('s1')] }));
    assert.match(gone.block, /1 deleted/);
  });
  it('blocks when a rep sale was used by another record or removed', () => {
    assert.match(planCalcRestore(entry, ctx({ repSales: [{ id: 'r1', usedInCalcId: 'x' }] })).block, /rep sale/);
    assert.match(planCalcRestore(entry, ctx({ repSales: [] })).block, /rep sale/);
  });
  it('blocks when the return store is gone or a transfer cannot be re-created', () => {
    assert.match(planCalcRestore(entry, ctx({ storeKeys: ['B'] })).block, /store it returned stock to/);
    const tr = { id: 'c2', transferSaleId: 't1', returnRep: 'Ali', returned: 3 };
    assert.match(planCalcRestore(tr, ctx()).block, /no sale price is set for Ali/);
    assert.equal(planCalcRestore(tr, ctx({ repPriceOk: true })).block, null);
    assert.equal(planCalcRestore(tr, ctx({ transferSnapshot: { id: 't1' } })).block, null);
  });
  it('ignores its own earlier claims and deleted competitors', () => {
    const r = planCalcRestore(entry, ctx({ history: [{ id: 'c1', linkedSalesIds: ['s1', 's2'] }, { id: 'old', deletedAt: 1, linkedSalesIds: ['s1'] }] }));
    assert.equal(r.block, null);
  });
});

describe('legacy partly-paid sales are detected exactly', () => {
  const parent = (id, extra = {}) => ({ id, paymentType: 'CREDIT', customerName: 'Ali', totalValue: 1000, creditReceived: false, ...extra });
  const child = (id, rel, amt) => ({ id, paymentType: 'PARTIAL_PAYMENT', relatedSaleId: rel, totalValue: amt });
  it('flags an unpaid sale whose payment is applied both ways', () => {
    const r = findPartialConflicts([parent('p', { partialPaymentReceived: 300 }), child('k', 'p', 300)]);
    assert.deepEqual(r.map(x => [x.kind, x.amount]), [['debt-reduced-twice', 300]]);
  });
  it('flags a paid sale whose payment records are counted again', () => {
    const r = findPartialConflicts([parent('p', { creditReceived: true, partialPaymentReceived: 300 }), child('k', 'p', 300), child('k2', 'p', 100)]);
    assert.deepEqual(r.map(x => [x.kind, x.amount, x.children]), [['cash-counted-twice', 400, 2]]);
  });
  it('leaves clean data alone', () => {
    assert.deepEqual(findPartialConflicts([parent('p', { partialPaymentReceived: 300 })]), []);
    assert.deepEqual(findPartialConflicts([parent('p'), child('k', 'p', 300)]), []);
    assert.deepEqual(findPartialConflicts([parent('p', { partialPaymentReceived: 300 }), { ...child('k', 'p', 300), deletedAt: 1 }]), []);
    assert.deepEqual(findPartialConflicts(null), []);
  });
});

describe('one save at a time', () => {
  it('ignores a second call while the first is still running, then allows it again', async () => {
    let runs = 0;
    const slow = () => new Promise(r => setTimeout(() => { runs++; r('done'); }, 20));
    const [a, b] = await Promise.all([runExclusive('k', slow), runExclusive('k', slow)]);
    assert.equal(runs, 1);
    assert.equal(a, 'done');
    assert.equal(b, undefined);
    assert.equal(await runExclusive('k', slow), 'done');
    assert.equal(runs, 2);
  });
  it('releases the lock when the action fails, and keeps different actions apart', async () => {
    await assert.rejects(runExclusive('f', async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await runExclusive('f', async () => 'ok'), 'ok');
    const [x, y] = await Promise.all([runExclusive('p', async () => 1), runExclusive('q', async () => 2)]);
    assert.deepEqual([x, y], [1, 2]);
  });
});

describe('cash in hand guards for deleting and recovering payments', () => {
  it('deleting a payment received takes cash away; credit purchases and transfers do not', () => {
    assert.equal(getDeleteCashDrop({ type: 'IN', amount: 500 }), 500);
    assert.equal(getDeleteCashDrop({ type: 'IN', amount: 500, isPayable: true }), 0);
    assert.equal(getDeleteCashDrop({ type: 'IN', amount: 500, isTransfer: true }), 0);
    assert.equal(getDeleteCashDrop({ type: 'OUT', amount: 500 }), 0);
  });
  it('recovering a payment made or an expense uses cash; supplier payable payments and transfers do not', () => {
    assert.equal(getRestoreCashNeed({ type: 'OUT', amount: 300 }), 300);
    assert.equal(getRestoreCashNeed({ type: 'OUT', amount: 300, isExpense: true }), 300);
    assert.equal(getRestoreCashNeed({ type: 'OUT', amount: 300, isPayable: true }), 0);
    assert.equal(getRestoreCashNeed({ type: 'OUT', amount: 300, isTransfer: true }), 0);
    assert.equal(getRestoreCashNeed({ type: 'IN', amount: 300 }), 0);
  });
  it('explains the shortfall and allows exactly-enough cash', () => {
    assert.match(getCashShortIssue(500, 200, 'Recovering this'), /only 200 is available/);
    assert.equal(getCashShortIssue(500, 500, 'x'), null);
    assert.equal(getCashShortIssue(0, 0, 'x'), null);
  });
});

describe('renaming an entity updates every copy of its name', () => {
  it('renames its transactions, transfer peers and linked materials, and nothing else', () => {
    const txs = [
      { id: 't1', entityId: 'E', entityName: 'Old' },
      { id: 't2', entityId: 'X', entityName: 'Other', transferPeerEntityId: 'E', transferPeerEntityName: 'Old' },
      { id: 't3', entityId: 'Y', entityName: 'Else' },
      { id: 't4', entityId: 'E', entityName: 'New' },
    ];
    const mats = [{ id: 'm1', supplierId: 'E', supplierName: 'Old' }, { id: 'm2', supplierId: 'Z', supplierName: 'Z' }];
    const plan = planEntityRename('E', 'New', txs, mats);
    assert.deepEqual(plan.txIds.sort(), ['t1', 't2']);
    assert.deepEqual(plan.materialIds, ['m1']);
    applyEntityRename('E', 'New', txs, mats, plan);
    assert.equal(txs[0].entityName, 'New');
    assert.equal(txs[1].transferPeerEntityName, 'New');
    assert.equal(txs[1].entityName, 'Other');
    assert.equal(txs[2].entityName, 'Else');
    assert.equal(mats[0].supplierName, 'New');
    assert.equal(mats[1].supplierName, 'Z');
  });
});
