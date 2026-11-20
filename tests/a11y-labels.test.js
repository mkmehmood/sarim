import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accessibleNameFor } from '../modules/a11y-labels.js';

const fake = (attrs = {}, { labelFor = false, insideLabel = false, fieldLabel = false } = {}) => ({
  id: attrs.id || '',
  getAttribute: (k) => (k in attrs ? attrs[k] : null),
  ownerDocument: { querySelector: () => (labelFor ? {} : null) },
  closest: (sel) => (sel === 'label' ? (insideLabel ? {} : null) : sel === '.field' ? (fieldLabel ? { querySelector: () => ({}) } : null) : null),
});

describe('accessible names for unlabelled fields', () => {
  it('leaves fields that already have a label alone', () => {
    assert.equal(accessibleNameFor(fake({ id: 'a', 'aria-label': 'x' })), '');
    assert.equal(accessibleNameFor(fake({ id: 'a' }, { labelFor: true })), '');
    assert.equal(accessibleNameFor(fake({ id: 'a' }, { insideLabel: true })), '');
    assert.equal(accessibleNameFor(fake({ id: 'a' }, { fieldLabel: true })), '');
    assert.equal(accessibleNameFor(fake({ id: 'a', type: 'hidden' })), '');
  });
  it('uses the placeholder, otherwise a readable form of the id', () => {
    assert.equal(accessibleNameFor(fake({ id: 'q', placeholder: ' Search customers ' })), 'Search customers');
    assert.equal(accessibleNameFor(fake({ id: 'rep-cust-name' })), 'Rep cust name');
    assert.equal(accessibleNameFor(fake({ id: 'factoryMaterialQuantity' })), 'Factory Material Quantity');
    assert.equal(accessibleNameFor(fake({})), '');
  });
});
