import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sync = read('modules/sync.js');
const pay = read('modules/utilities-payments.js');
const html = read('index.html');

describe('app accounts: the role comes from the account', () => {
  it('removes the device list, device commands and device-based role restore', () => {
    for (const n of ['loadDeviceList', 'refreshDeviceList', 'removeDevice', 'restoreDeviceModeOnLogin', 'setAccountLock', 'accountLockPanelHtml']) {
      assert.ok(!pay.includes(n) && !sync.includes(n) && !html.includes(n), n);
    }
    assert.ok(!existsSync(new URL('../modules/account-lock.js', import.meta.url)));
  });
  it('applies the account role at sign-in and keeps listening for changes', () => {
    assert.match(sync, /await applyAccountRoleOnLogin\(user\);/);
    assert.match(pay, /export async function applyAccountRoleOnLogin/);
    assert.match(pay, /collection\('users'\)\.doc\(uid\)\.onSnapshot/);
    assert.match(pay, /readCachedAccountRole\(user\.uid, user\.email\)/);
  });
  it('does not keep the previous user\'s device mode across sign-out', () => {
    assert.doesNotMatch(sync, /_savedAppMode/);
    assert.match(sync, /clearCachedAccountRole\(\);/);
  });
  it('a role change applies immediately and does not reapply an unchanged factory or production lock', () => {
    assert.match(pay, /targetMode === 'production' \|\| targetMode === 'factory'\) && previousManager === \(repName \|\| null\)\) return;/);
  });
});

describe('app accounts: managing accounts', () => {
  it('requires a chosen role and a rep name, and never defaults to admin', () => {
    assert.match(sync, /export let _newAccountRole = '';/);
    assert.match(sync, /Choose a role for this account\./);
    assert.match(sync, /if \(role === 'rep' && !name\)/);
  });
  it('shares the admin workspace and adds rep accounts to the rep list', () => {
    assert.match(sync, /ownerUid, createdAt: now/);
    assert.match(sync, /if \(role === 'rep'\) await _ensureRepName\(finalName\);/);
  });
  it('adopts an existing login only when the password matches and it is not in another workspace', () => {
    assert.match(sync, /auth\/email-already-in-use/);
    assert.match(sync, /signInWithEmailAndPassword\(email, password\)/);
    assert.match(sync, /profile && profile\.ownerUid !== ownerUid/);
  });
  it('keeps the original lock panel: Access toggle, current role label and a button grid with a tick', () => {
    assert.match(sync, /classList\.toggle\(\\'d-none\\'\)">Access<\/button>/);
    assert.match(sync, /class="d-none u-296d231/);
    assert.match(sync, /<div class="u-788ba48">' \+ esc\(roleName\)/);
    assert.match(sync, /<div class="u-ab90486 d-grid">' \+ ACCOUNT_ROLES\.map/);
    assert.match(sync, /\(r === role \? '&#10003; ' : ''\) \+ roleLabel\(r\)/);
  });
  it('lists six role buttons per account plus suspend and remove', () => {
    assert.match(sync, /ACCOUNT_ROLES\.map\(r =>/);
    assert.match(sync, /adminSetAccountRole\(this\.dataset\.uid/);
    assert.match(sync, /\(approved \? 'Suspend' : 'Reinstate'\)/);
    assert.match(sync, /window\.adminSetAccountRole = adminSetAccountRole;/);
  });
  it('does not let anyone change their own role', () => {
    assert.match(sync, /You cannot change your own role\./);
  });
});
