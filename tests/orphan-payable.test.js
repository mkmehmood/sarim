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
