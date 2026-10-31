import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_KEYS, canAdoptAccount, cleanRoles, deriveSession, isLegacyAccount, normalizeRoles, resolveOwnerUid, tabsForRoles, toggleRole } from '../modules/roles.js';

describe('roles array', () => {
  it('has the six roles and filters junk', () => {
    assert.deepEqual(ROLE_KEYS, ['admin', 'rep', 'production', 'factory', 'payments', 'sales']);
    assert.deepEqual(cleanRoles(['Sales', 'bogus', 'sales', 'admin']), ['admin', 'sales']);
  });
  it('reads the roles array and the legacy role string', () => {
    assert.deepEqual(normalizeRoles({ roles: ['production', 'payments'] }), ['payments', 'production'].sort((a, b) => ROLE_KEYS.indexOf(a) - ROLE_KEYS.indexOf(b)));
    assert.deepEqual(normalizeRoles({ role: 'admin' }), ['admin']);
    assert.deepEqual(normalizeRoles({ role: 'user' }), []);
    assert.deepEqual(normalizeRoles({ role: 'admin', roles: ['rep'] }), ['rep']);
  });
  it('toggles without preselecting anything', () => {
    assert.deepEqual(toggleRole([], 'rep'), ['rep']);
    assert.deepEqual(toggleRole(['rep', 'sales'], 'rep'), ['sales']);
  });
});

describe('session derivation', () => {
  it('admin is unrestricted', () => assert.equal(deriveSession(['admin', 'rep']).mode, 'admin'));
  it('single roles keep their dedicated modes', () => {
    assert.equal(deriveSession(['rep']).mode, 'rep');
    assert.equal(deriveSession(['production']).mode, 'production');
    assert.equal(deriveSession(['factory']).mode, 'factory');
    assert.equal(deriveSession(['payments']).mode, 'userrole');
  });
  it('multiple roles open the union of tabs', () => {
    const s = deriveSession(['production', 'payments']);
    assert.equal(s.mode, 'userrole');
    assert.deepEqual(s.tabs, ['prod', 'payments']);
    assert.deepEqual(tabsForRoles(['rep', 'sales']), ['sales', 'rep']);
  });
  it('a member with no roles sees no tabs', () => assert.deepEqual(deriveSession([]), { mode: 'userrole', tabs: [], roles: [] }));
});

describe('workspace and adoption', () => {
  it('detects members and legacy accounts', () => {
    assert.equal(resolveOwnerUid({ ownerUid: 'A' }, 'B'), 'A');
    assert.equal(resolveOwnerUid({ ownerUid: 'A' }, 'A'), null);
    assert.equal(isLegacyAccount({ role: 'user' }, 'B'), true);
    assert.equal(isLegacyAccount({ roles: ['rep'], ownerUid: 'A' }, 'B'), false);
  });
  it('adopts own, known or missing accounts and rejects external workspaces', () => {
    assert.equal(canAdoptAccount(null, 'U', 'W', []).ok, true);
    assert.equal(canAdoptAccount({ ownerUid: 'W' }, 'U', 'W', []).ok, true);
    assert.equal(canAdoptAccount({ ownerUid: 'X' }, 'U', 'W', []).ok, false);
    assert.equal(canAdoptAccount({ role: 'admin' }, 'U', 'W', []).ok, false);
    assert.equal(canAdoptAccount({ role: 'user' }, 'U', 'W', ['U']).ok, true);
  });
});
