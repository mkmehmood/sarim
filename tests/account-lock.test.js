import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAccountLock, buildLockPatch, lockLabel, lockPanelButtons } from '../modules/account-lock.js';

const PAY = readFileSync(new URL('../modules/utilities-payments.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('account lock', () => {
  it('builds a lock for each mode and refuses unnamed rep and role locks', () => {
    assert.deepEqual(buildLockPatch('admin', null, null, 'a@x.com', 5), { mode: 'admin', assignedRep: null, assignedManager: null, assignedUserTabs: null, at: 5, by: 'a@x.com' });
    assert.equal(buildLockPatch('rep', 'ALI', null, 'a', 5).assignedRep, 'ALI');
    assert.deepEqual(buildLockPatch('userrole', 'SARA', ['sales'], 'a', 5).assignedUserTabs, ['sales']);
    assert.throws(() => buildLockPatch('rep', '', null, 'a', 5));
    assert.throws(() => buildLockPatch('factory', 'X', null, 'a', 5));
  });
  it('reads a stored lock back and ignores malformed ones', () => {
    const lock = buildLockPatch('userrole', 'SARA', ['sales', 'payments'], 'a', 9);
    assert.deepEqual(normalizeAccountLock({ lock }), { mode: 'userrole', name: 'SARA', tabs: ['sales', 'payments'], at: 9 });
    assert.equal(normalizeAccountLock({}), null);
    assert.equal(normalizeAccountLock({ lock: { mode: 'rep', at: 4 } }), null);
    assert.equal(normalizeAccountLock({ lock: { mode: 'admin' } }), null);
  });
  it('labels the lock and marks the active button', () => {
    const lock = buildLockPatch('rep', 'ALI', null, 'a', 3);
    assert.equal(lockLabel(lock), 'Rep: ALI');
    assert.equal(lockLabel(null), 'Not locked');
    const b = lockPanelButtons(lock, ['ALI', 'BOB'], [{ name: 'SARA', tabs: [] }]);
    assert.deepEqual(b.filter(x => x.active).map(x => x.label), ['ALI']);
    assert.equal(b.length, 4);
  });
});

describe('device lock is gone', () => {
  it('has no remote device control or device command listener left', () => {
    assert.ok(!PAY.includes('remoteControlDevice'));
    assert.ok(!PAY.includes('listenForDeviceCommands'));
    assert.ok(!HTML.includes('remoteControlDevice'));
  });
  it('applies the lock from the signed-in account profile', () => {
    assert.match(PAY, /collection\('users'\)\.doc\(currentUser\.uid\)\.onSnapshot/);
    assert.match(PAY, /applyRemoteModeChange\(lock\.mode, 'account_lock'/);
  });
});
