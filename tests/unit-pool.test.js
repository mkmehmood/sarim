import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unitPoolKey } from '../modules/store-keys.js';

describe('unitPoolKey', () => {
  it('slots on the same formula share one pool', () => {
    const slots = { standard: 'f1', asaan: 'f1' };
    assert.equal(unitPoolKey('asaan', null, slots), 'standard');
    assert.equal(unitPoolKey('standard', null, slots), 'standard');
  });
  it('a store whose own formula equals the standard slot uses the standard pool', () => {
    assert.equal(unitPoolKey('asaan', 'f1', { standard: 'f1', asaan: 'f2' }), 'standard');
  });
  it('different formulas keep separate pools', () => {
    const slots = { standard: 'f1', asaan: 'f2' };
    assert.equal(unitPoolKey('asaan', null, slots), 'asaan');
    assert.equal(unitPoolKey('standard', null, slots), 'standard');
  });
  it('falls back to the slot when nothing is assigned', () => {
    assert.equal(unitPoolKey('asaan', null, {}), 'asaan');
    assert.equal(unitPoolKey('whatever', null, null), 'standard');
  });
});

describe('unitPoolKey legacy records', () => {
  it('a record stamped with the asaan slot maps to the shared pool when slots share a formula', () => {
    const slots = { standard: 'f1', asaan: 'f1' };
    assert.equal(unitPoolKey('asaan', null, slots), unitPoolKey('standard', null, slots));
  });
});
