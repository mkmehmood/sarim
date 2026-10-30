import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataUid, setDataOwner, resolveDataOwner, isTeamMember } from '../modules/data-owner.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const fakeDb = (docs) => ({
  collection: () => ({ doc: (id) => ({ get: async () => {
    if (docs === 'fail') throw new Error('offline');
    return { exists: id in docs, data: () => docs[id] };
  } }) }),
});

describe('data owner', () => {
  it('uses own uid until an owner is set', () => {
    assert.equal(dataUid({ uid: 'a' }), 'a');
    setDataOwner('a', 'boss');
    assert.equal(dataUid({ uid: 'a' }), 'boss');
    assert.equal(isTeamMember({ uid: 'a' }), true);
    assert.equal(isTeamMember({ uid: 'boss' }), false);
  });
  it('resolves ownerUid from the profile and ignores suspended members', async () => {
    const u = { uid: 'm1' };
    assert.equal(await resolveDataOwner(fakeDb({ m1: { ownerUid: 'boss', approved: true } }), u), 'boss');
    const s = { uid: 'm2' };
    assert.equal(await resolveDataOwner(fakeDb({ m2: { ownerUid: 'boss', approved: false } }), s), 'm2');
    const o = { uid: 'boss2' };
    assert.equal(await resolveDataOwner(fakeDb({ boss2: { role: 'admin' } }), o), 'boss2');
  });
  it('never touches Firestore for offline sessions', async () => {
    assert.equal(await resolveDataOwner('fail', { uid: 'x_y', offlineMode: true }), 'x_y');
  });
});

describe('app accounts screen', () => {
  it('replaces reps, roles, devices and team access with one account screen', () => {
    for (const id of ['sales-rep-screen', 'user-roles-screen', 'device-display-screen', 'team-access-screen']) assert.ok(!HTML.includes(`id="${id}"`), id);
    assert.ok(HTML.includes('id="app-accounts-screen"'));
    for (const id of ['acct-new-email', 'acct-new-password', 'acct-new-name', 'acct-add-btn', 'manage-accounts-list']) assert.ok(HTML.includes(`id="${id}"`), id);
    assert.ok(!HTML.includes('Device Display'));
    assert.ok(!HTML.includes('Connected Devices'));
  });
  it('offers the six role buttons with none selected', () => {
    for (const r of ['admin', 'rep', 'production', 'factory', 'payments', 'sales']) {
      assert.match(HTML, new RegExp(`id="acct-role-${r}" class="toggle-opt u-44dfa2b" onclick="setNewAccountRole\\('${r}'\\)"`), r);
    }
    assert.doesNotMatch(HTML, /id="acct-role-[a-z]+" class="toggle-opt active/);
  });
});

describe('firestore rules', () => {
  it('ties every data path to an active, email-matched account in the same team', () => {
    assert.match(RULES, /function active\(\)/);
    assert.match(RULES, /request\.auth\.token\.email != null/);
    assert.match(RULES, /me\(\)\.get\('email', request\.auth\.token\.email\)\.lower\(\) == request\.auth\.token\.email\.lower\(\)/);
    assert.match(RULES, /function inMyTeam\(uid\) \{ return active\(\) && teamOwner\(\) == uid; \}/);
    assert.doesNotMatch(RULES, /allow (read|write)[^;]*: if true/);
  });
  it('stops members changing their own role, owner, approval or email', () => {
    assert.match(RULES, /hasOnly\(\['lastWrite', 'lastLoginAt', 'authProviders', 'displayName'\]\)/);
  });
  it('scopes admins to their own team and keeps the accounts index admin-only', () => {
    assert.match(RULES, /isAdmin\(\) && !isSelf\(uid\)\s+&& isMemberOfMyTeam\(resource\.data\)/);
    assert.match(RULES, /subcollection == 'settings' && docId == 'accounts'/);
    assert.doesNotMatch(RULES, /subcollection in \[/);
  });
  it('only lets admins delete member profiles', () => {
    assert.match(RULES, /allow delete: if isAdmin\(\) && !isSelf\(uid\) && isMemberOfMyTeam\(resource\.data\)/);
  });
});
