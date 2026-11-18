import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFutureDate, isValidIsoDate, canonicalCustomerName } from '../modules/finance.js';
import { parseAmount, buildEntry } from '../modules/ledger-core.js';

const ctx = { id: 'x', now: 1, today: '2026-11-18', modes: ['Cash', 'Bank Transfer'] };
const form = (o) => ({ type: 'IN', amount: '100', mode: 'Cash', date: '2026-11-18', ...o });

test('future and invalid dates are detected', () => {
  assert.equal(isFutureDate('2031-01-01', '2026-11-18'), true);
  assert.equal(isFutureDate('2026-11-18', '2026-11-18'), false);
  assert.equal(isValidIsoDate('2026-13-45'), false);
  assert.equal(isValidIsoDate('1900-01-01'), false);
  assert.equal(isValidIsoDate('2026-02-28'), true);
});

test('customer name reuses the saved casing', () => {
  assert.equal(canonicalCustomerName('cust b', [{ customerName: 'Cust B' }]), 'Cust B');
  assert.equal(canonicalCustomerName('New', [{ customerName: 'Cust B' }]), 'New');
});

test('ledger amounts must be clean numbers', () => {
  assert.equal(parseAmount('12abc'), null);
  assert.equal(parseAmount('1.2.3'), null);
  assert.equal(parseAmount('1,000'), 1000);
});

test('ledger entry rejects bad input', () => {
  assert.equal(buildEntry(form({ amount: '1e12' }), null, ctx).ok, false);
  assert.equal(buildEntry(form({ date: '2026-13-45' }), null, ctx).ok, false);
  assert.equal(buildEntry(form({ date: '2031-01-01' }), null, ctx).ok, false);
  assert.equal(buildEntry(form({ party: 'a'.repeat(500) }), null, ctx).ok, false);
  assert.equal(buildEntry(form({ note: 'a'.repeat(5000) }), null, ctx).ok, false);
  assert.equal(buildEntry(form({ type: 'TRANSFER', toMode: '' }), null, ctx).ok, false);
  assert.equal(buildEntry(form({ type: 'TRANSFER', toMode: 'Bank Transfer' }), null, ctx).ok, true);
  assert.equal(buildEntry(form(), null, ctx).ok, true);
});
