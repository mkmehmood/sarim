import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrphanSupplierTx } from '../modules/link-graph.js';
const inv = [{ id: 'm1', supplierId: 's1' }, { id: 'm2' }];
test('payable tx whose material is still linked to the supplier is live', () => {
  assert.equal(isOrphanSupplierTx({ isPayable: true, entityId: 's1', materialId: 'm1' }, inv), false);
});
test('payable tx whose material was deleted or unlinked is an orphan', () => {
  assert.equal(isOrphanSupplierTx({ isPayable: true, entityId: 's1', materialId: 'gone' }, inv), true);
  assert.equal(isOrphanSupplierTx({ isPayable: true, entityId: 's1', materialId: 'm2' }, inv), true);
  assert.equal(isOrphanSupplierTx({ isPayable: true, entityId: 's2', materialId: 'm1' }, inv), true);
});
test('plain and material-less transactions are never orphans', () => {
  assert.equal(isOrphanSupplierTx({ isPayable: false, entityId: 's1', materialId: 'gone' }, inv), false);
  assert.equal(isOrphanSupplierTx({ isPayable: true, entityId: 's1', supplierCreditAmount: 50 }, inv), false);
});
test('multi-material tx is live while any material stays linked', () => {
  assert.equal(isOrphanSupplierTx({ isPayable: true, entityId: 's1', materialIds: ['gone', 'm1'] }, inv), false);
});
import { hasLiveSupplierInvoice } from '../modules/link-graph.js';
test('linked material only counts toward payable while the supplier has a live invoice for it', () => {
  const mats = [{ id: 'm1', supplierId: 's1' }, { id: 'm3', supplierId: 's1' }];
  const txs = [
    { id: 't1', isPayable: true, type: 'IN', entityId: 's1', materialId: 'm1', amount: 100 },
    { id: 't2', isPayable: true, type: 'IN', entityId: 's2', materialId: 'm3', amount: 50 },
    { id: 't3', isPayable: true, type: 'IN', entityId: 's1', materialId: 'm3', amount: 50, deletedAt: '2026-01-01' },
  ];
  assert.equal(hasLiveSupplierInvoice(mats[0], txs), true);
  assert.equal(hasLiveSupplierInvoice(mats[1], txs), false);
  assert.equal(hasLiveSupplierInvoice({ id: 'x' }, txs), false);
});
