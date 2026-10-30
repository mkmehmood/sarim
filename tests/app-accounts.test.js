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
  it('applies a changed role the original way: persist the mode and reload, so startup locks to the assigned tab', () => {
    assert.match(pay, /if \(sameMode\(_currentDeviceMode\(\), want\)\) return;/);
    assert.match(pay, /_applyModeFromData\(want\.mode, Date\.now\(\)/);
    assert.match(pay, /if \(want\.mode === 'admin'\) \{ await unlockAdminMode\(\); return; \}/);
    assert.doesNotMatch(pay, /applyRemoteModeChange/);
  });
  it('startup enforces the lock, hides the other tabs and opens only the assigned one', () => {
    assert.match(pay, /await enforceRepModeLock\(\);\n\s*preventAdminAccess\(\);/);
    assert.match(pay, /lockToRepMode\(\);\nif \(typeof showTab === 'function'\) showTab\('rep'\);/);
    assert.match(pay, /lockToProductionMode\(\);\nif \(typeof showTab === 'function'\) showTab\('prod'\);/);
    assert.match(pay, /lockToFactoryMode\(\);\nif \(typeof showTab === 'function'\) showTab\('factory'\);/);
    assert.match(pay, /showTab\(assignedTabs\[0\]\);/);
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
  it('shows More and Delete on each account instead of six role toggles', () => {
    assert.match(sync, /onclick="adminAccountMore\(this\.dataset\.uid,this\.dataset\.email\)">More<\/button>/);
    assert.match(sync, /onclick="adminDeleteAccount\(this\.dataset\.uid,this\.dataset\.email\)">Delete<\/button>/);
    assert.doesNotMatch(sync, /acct-lock-/);
    assert.doesNotMatch(sync, />Access<\/button>/);
    assert.doesNotMatch(sync, /roleBtns|rolePanel/);
  });
  it('More opens a pop-up to update the assignment, with the six roles and suspend or reinstate', () => {
    assert.match(sync, /showChoiceDialog\(.*, choices, \{ title: 'Update Assignment' \}\)/);
    assert.match(sync, /ACCOUNT_ROLES\.map\(r => \(\{ label: \(\(r === current && !several\) \? '\\u2713 ' : ''\) \+ roleLabel\(r\), value: 'role:' \+ r \}\)\)/);
    assert.match(sync, /approved \? 'Suspend account' : 'Reinstate account'/);
    assert.match(sync, /adminSetAccountRole\(uid, email, picked\.slice\(5\)\)/);
    assert.match(sync, /window\.adminAccountMore = adminAccountMore;/);
  });
  it('does not let anyone change their own role', () => {
    assert.match(sync, /You cannot change your own role\./);
  });
});

describe('app accounts: hard delete and several tabs', () => {
  it('hard delete erases the profile and the index entry, and never lets you delete yourself', () => {
    assert.match(sync, /export async function adminDeleteAccount/);
    assert.match(sync, /await ref\.delete\(\);/);
    assert.match(sync, /_writeAccountsIndex\(accounts\.filter\(a => a\.uid !== uid\)\)/);
    assert.match(sync, /You cannot delete your own account\./);
    assert.match(sync, /title: 'Delete Account Permanently'/);
    assert.match(sync, /window\.adminDeleteAccount = adminDeleteAccount;/);
    assert.doesNotMatch(sync, /adminRemoveAccount/);
  });
  it('a device whose profile was deleted signs itself out', () => {
    assert.match(pay, /function _signOutRemovedAccount\(\)/);
    assert.match(pay, /if \(!snap\.exists\) \{ if \(seen\) _signOutRemovedAccount\(\); return; \}/);
    assert.match(pay, /if \(!snap\.exists\) \{ if \(readCachedAccountRole\(user\.uid, user\.email\)\) _signOutRemovedAccount\(\); return; \}/);
  });
  it('the add form lets production, factory, payments and sales be combined', () => {
    assert.match(sync, /export let _newAccountTabs = \[\];/);
    assert.match(sync, /isTabRole\(role\) && isTabRole\(_newAccountRole\)/);
    assert.match(sync, /email, role, tabs, name: finalName/);
  });
  it('More offers Several tabs with a tick-box pop-up that needs at least one tab', () => {
    assert.match(sync, /value: 'tabs'/);
    assert.match(sync, /title: 'Assign Tabs'/);
    assert.match(sync, /input\[type=checkbox\]:checked/);
    assert.match(sync, /Tick at least one tab\./);
    assert.match(sync, /update\(\{ role, tabs: tabList, name \}\)/);
  });
  it('shows the full assignment on the account row', () => {
    assert.match(sync, /esc\(roleSummary\(acct\)\)/);
  });
});
