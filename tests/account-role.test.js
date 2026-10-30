import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_ROLES, normalizeRole, accountName, roleToMode, isAccountSuspended, cacheAccountRole, readCachedAccountRole, clearCachedAccountRole, sameMode, roleLabel } from '../modules/account-role.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

describe('account roles', () => {
  beforeEach(() => store.clear());

  it('offers exactly the six roles', () => {
    assert.deepEqual(ACCOUNT_ROLES, ['admin', 'rep', 'production', 'factory', 'payments', 'sales']);
  });
  it('reads old "user" and missing roles as Admin', () => {
    assert.equal(normalizeRole({ role: 'user' }), 'admin');
    assert.equal(normalizeRole({}), 'admin');
    assert.equal(normalizeRole(null), 'admin');
    assert.equal(normalizeRole({ role: 'FACTORY' }), 'factory');
    assert.equal(roleLabel('payments'), 'Payments');
  });
  it('names the account from its name, else from the email', () => {
    assert.equal(accountName({ name: ' ali ' }), 'ALI');
    assert.equal(accountName({ email: 'sara.k@example.com' }), 'SARA.K');
  });
  it('maps each role to the device mode it shows', () => {
    assert.deepEqual(roleToMode({ role: 'admin' }), { mode: 'admin', name: null, tabs: [] });
    assert.deepEqual(roleToMode({ role: 'rep', name: 'ali' }), { mode: 'rep', name: 'ALI', tabs: [] });
    assert.deepEqual(roleToMode({ role: 'production', name: 'p' }), { mode: 'production', name: 'P', tabs: [] });
    assert.deepEqual(roleToMode({ role: 'factory', name: 'f' }), { mode: 'factory', name: 'F', tabs: [] });
    assert.deepEqual(roleToMode({ role: 'payments', name: 'x' }), { mode: 'userrole', name: 'X', tabs: ['payments'] });
    assert.deepEqual(roleToMode({ role: 'sales', name: 'y' }), { mode: 'userrole', name: 'Y', tabs: ['sales'] });
  });
  it('flags only explicitly suspended accounts', () => {
    assert.equal(isAccountSuspended({ approved: false }), true);
    assert.equal(isAccountSuspended({}), false);
    assert.equal(isAccountSuspended(null), false);
  });
  it('caches the role per uid for offline sign-in', () => {
    cacheAccountRole('u1', { role: 'rep', name: 'ali', email: 'a@x.com' });
    assert.deepEqual(readCachedAccountRole('u1'), { role: 'rep', name: 'ALI', email: 'a@x.com' });
    assert.equal(readCachedAccountRole('u2'), null);
    assert.equal(readCachedAccountRole('a_x_com', 'A@X.com').role, 'rep');
    assert.equal(readCachedAccountRole('a_x_com', 'other@x.com'), null);
    clearCachedAccountRole();
    assert.equal(readCachedAccountRole('u1'), null);
  });
  it('compares modes by mode, name and tabs', () => {
    assert.equal(sameMode({ mode: 'rep', name: 'A', tabs: [] }, { mode: 'rep', name: 'A', tabs: [] }), true);
    assert.equal(sameMode({ mode: 'rep', name: 'A', tabs: [] }, { mode: 'rep', name: 'B', tabs: [] }), false);
    assert.equal(sameMode({ mode: 'userrole', name: 'A', tabs: ['sales'] }, { mode: 'userrole', name: 'A', tabs: ['payments'] }), false);
  });
});
