import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

describe('firestore.rules', () => {
  it('checks admin through the roles array and the legacy role string', () => {
    assert.match(rules, /'admin' in data\.get\('roles', \[\]\)/);
    assert.match(rules, /data\.get\('role', 'user'\) == 'admin'/);
  });
  it('defines hasRole and blocks suspended users', () => {
    assert.match(rules, /function hasRole\(roleName\)/);
    assert.match(rules, /get\('approved', true\) != false/);
  });
  it('lets owners edit only harmless fields on their own user doc', () => {
    assert.match(rules, /hasOnly\(\['lastWrite','lastLoginAt','authProviders','displayName'\]\)/);
  });
  it('only admins create or delete user docs', () => {
    assert.match(rules, /allow create: if isAdmin\(\)/);
    assert.match(rules, /allow delete: if isAdmin\(\)/);
  });
  it('gives workspace members access through ownerUid', () => {
    assert.match(rules, /get\('ownerUid', ''\) == ownerUid/);
  });
  it('has no device collection screens or roles left in the app', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const gone of ['device-display-screen', 'user-roles-screen', 'sales-rep-screen', 'Team &amp; Access', 'Connected Devices']) assert.equal(html.includes(gone), false, gone);
    assert.ok(html.includes('id="app-accounts-screen"'));
  });
});
