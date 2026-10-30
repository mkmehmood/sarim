import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ACCOUNT_ROLES, accessForAccount, accountDisplayName, normalizeRole, sameAccess } from '../modules/account-roles.js';
import { accountRowHtml, canAdoptAccount, roleButtonsHtml } from '../modules/account-view.js';
import { dataUid, isWorkspaceMember, setDataOwner } from '../modules/data-owner.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');

describe('account roles', () => {
  it('offers exactly the six roles', () => {
    assert.deepEqual(ACCOUNT_ROLES, ['admin', 'rep', 'production', 'factory', 'payments', 'sales']);
  });
  it('maps old user accounts and a missing role to admin, and rejects unknown roles', () => {
    assert.equal(normalizeRole('user'), 'admin');
    assert.equal(normalizeRole(undefined), 'admin');
    assert.equal(normalizeRole(' Rep '), 'rep');
    assert.equal(normalizeRole('owner'), null);
  });
  it('gives each role the device mode the app already enforces', () => {
    const a = (role) => accessForAccount({ role, name: 'Ali', email: 'a@x.com' });
    assert.deepEqual(a('admin'), { role: 'admin', mode: 'admin', name: null, tabs: [] });
    assert.deepEqual(a('rep'), { role: 'rep', mode: 'rep', name: 'ALI', tabs: [] });
    assert.equal(a('production').mode, 'production');
    assert.equal(a('factory').mode, 'factory');
    assert.deepEqual([a('payments').mode, a('payments').tabs], ['userrole', ['payments']]);
    assert.deepEqual([a('sales').mode, a('sales').tabs], ['userrole', ['sales']]);
  });
  it('falls back to the email name and treats unknown roles as admin access', () => {
    assert.equal(accountDisplayName({ email: 'sam.k@x.com' }), 'SAM.K');
    assert.equal(accessForAccount({ role: 'bogus' }).mode, 'admin');
  });
  it('compares access ignoring role label', () => {
    assert.ok(sameAccess({ mode: 'rep', name: 'A', tabs: [] }, { mode: 'rep', name: 'A', tabs: [] }));
    assert.ok(!sameAccess({ mode: 'rep', name: 'A', tabs: [] }, { mode: 'rep', name: 'B', tabs: [] }));
    assert.ok(!sameAccess({ mode: 'userrole', name: 'A', tabs: ['sales'] }, { mode: 'userrole', name: 'A', tabs: ['payments'] }));
  });
});

describe('shared workspace', () => {
  it('points an account at its owner and defaults to itself', () => {
    assert.equal(dataUid({ uid: 'solo' }), 'solo');
    setDataOwner('rep1', 'boss');
    assert.equal(dataUid({ uid: 'rep1' }), 'boss');
    assert.ok(isWorkspaceMember({ uid: 'rep1' }));
    assert.ok(!isWorkspaceMember({ uid: 'solo' }));
  });
});

describe('adopting an existing login', () => {
  const ctx = { owner: 'boss', adminEmail: 'boss@x.com' };
  it('allows new, same-workspace and own legacy accounts', () => {
    assert.ok(canAdoptAccount(null, ctx).ok);
    assert.ok(canAdoptAccount({ ownerUid: 'boss' }, ctx).ok);
    assert.ok(canAdoptAccount({ createdBy: 'Boss@x.com', role: 'user' }, ctx).ok);
  });
  it('refuses another workspace and independent accounts', () => {
    assert.equal(canAdoptAccount({ ownerUid: 'other' }, ctx).ok, false);
    assert.equal(canAdoptAccount({ role: 'admin' }, ctx).ok, false);
    assert.equal(canAdoptAccount({ createdBy: 'someone@else.com' }, ctx).ok, false);
  });
});

describe('account markup', () => {
  it('shows six role buttons and marks only the chosen one', () => {
    const out = roleButtonsHtml('rep', 'f()');
    assert.equal((out.match(/data-role=/g) || []).length, 6);
    assert.equal((out.match(/ active"/g) || []).length, 1);
    assert.equal((roleButtonsHtml(null, 'f()').match(/ active"/g) || []).length, 0);
  });
  it('gives a normal row role buttons plus Suspend and Remove', () => {
    const out = accountRowHtml({ uid: 'u1', email: 'a@x.com', role: 'factory', approved: true });
    assert.equal((out.match(/data-role=/g) || []).length, 6);
    assert.ok(out.includes('Suspend') && out.includes('Remove'));
  });
  it('offers Reinstate for a suspended account', () => {
    const out = accountRowHtml({ uid: 'u1', email: 'a@x.com', role: 'sales', approved: false });
    assert.ok(out.includes('Reinstate') && out.includes('Suspended'));
  });
  it('gives yourself and the owner no controls and escapes the email', () => {
    assert.ok(!accountRowHtml({ uid: 'me', email: 'me@x.com', role: 'admin' }, { isMe: true }).includes('data-role'));
    assert.ok(!accountRowHtml({ uid: 'o', email: 'o@x.com', role: 'admin' }, { isOwner: true }).includes('Remove'));
    assert.ok(!accountRowHtml({ uid: 'u', email: '<b>x</b>', role: 'rep' }).includes('<b>'));
  });
});

describe('one account screen replaces five', () => {
  it('keeps a single App Accounts entry in settings and removes the old screens', () => {
    for (const id of ['sales-rep-screen', 'user-roles-screen', 'device-display-screen']) assert.equal(html.includes('id="' + id + '"'), false, id);
    assert.equal(html.includes('Team &amp; Access'), false);
    assert.equal(html.includes('Connected Devices'), false);
    assert.equal((html.match(/openStandaloneScreen\('app-accounts-screen'\)/g) || []).length, 1);
  });
  it('has the add form with six role buttons and none preselected', () => {
    const a = html.indexOf('id="app-accounts-screen"');
    const screen = html.slice(a, html.indexOf('id="feedback-screen"', a));
    for (const r of ACCOUNT_ROLES) assert.ok(screen.includes('id="acct-role-' + r + '"'), r);
    assert.ok(!/id="acct-role-[a-z]+"[^>]*\bactive\b/.test(screen));
    for (const id of ['acct-new-email', 'acct-new-password', 'acct-new-name']) assert.ok(screen.includes('id="' + id + '"'), id);
  });
  it('has no device command code left', () => {
    const src = readdirSync(new URL('../modules/', import.meta.url)).map((f) => read('../modules/' + f)).join('\n');
    for (const gone of ['listenForDeviceCommands', 'remoteControlDevice', 'restoreDeviceModeOnLogin', 'loadDeviceList', 'forceAppModeFromCloud', '_savedAppMode']) assert.equal(src.includes(gone), false, gone);
  });
});
