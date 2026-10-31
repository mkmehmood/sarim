import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REMOTE_MAX_NOTIFICATIONS, REMOTE_WINDOW_MS, describeRemote, findRemoteActivity, planNotifications } from '../modules/remote-activity.js';

const NOW = 1_800_000_000_000;
const fmt = (n) => 'Rs ' + n;
const fresh = (extra) => ({ id: 'r1', timestamp: NOW - 60_000, ...extra });

describe('describeRemote', () => {
  it('rep sale and collection name the rep', () => {
    assert.deepEqual(describeRemote('rep', fresh({ salesRep: 'ALI', customerName: 'Zed', totalValue: 500 }), fmt, NOW),
      { title: 'New sale', body: 'ALI sold to Zed — Rs 500' });
    assert.equal(describeRemote('rep', fresh({ salesRep: 'ALI', isCollection: true, customerName: 'Zed', totalValue: 9 }), fmt, NOW).title, 'New collection');
  });
  it('ignores admin and unassigned rep records', () => {
    assert.equal(describeRemote('rep', fresh({ salesRep: 'admin' }), fmt, NOW), null);
    assert.equal(describeRemote('rep', fresh({ salesRep: 'NONE' }), fmt, NOW), null);
  });
  it('payments, sales and expenses need an author; expenses booked as transactions are skipped', () => {
    assert.equal(describeRemote('sales', fresh({ totalValue: 1 }), fmt, NOW), null);
    assert.equal(describeRemote('sales', fresh({ createdBy: 'Sam', customerName: 'C', totalValue: 1 }), fmt, NOW).title, 'New sale');
    assert.match(describeRemote('transactions', fresh({ createdBy: 'Sam', type: 'IN', entityName: 'E', amount: 5 }), fmt, NOW).body, /received from E — Rs 5/);
    assert.equal(describeRemote('transactions', fresh({ createdBy: 'Sam', isExpense: true }), fmt, NOW), null);
  });
  it('production and factory accounts are covered through managedBy', () => {
    assert.equal(describeRemote('production', fresh({ managedBy: 'Pat', net: 12.5 }), fmt, NOW).body, 'Pat recorded 12.5 kg produced');
    assert.equal(describeRemote('production', fresh({ managedBy: 'Pat', net: -3, isReturn: true }), fmt, NOW).title, 'Stock return');
    assert.match(describeRemote('factory', fresh({ managedBy: 'Fay', units: 40, formulaName: 'F1' }), fmt, NOW).body, /Fay added a factory entry — 40 units \(F1\)/);
    assert.equal(describeRemote('factory', fresh({}), fmt, NOW), null);
  });
  it('a customer added by a rep is announced', () => {
    assert.equal(describeRemote('clients', fresh({ salesRep: 'ALI', name: 'New Co' }), fmt, NOW).body, 'ALI added customer New Co');
  });
  it('old records are not announced', () => {
    assert.equal(describeRemote('rep', { id: 'x', salesRep: 'ALI', timestamp: NOW - REMOTE_WINDOW_MS - 1 }, fmt, NOW), null);
  });
});

describe('findRemoteActivity', () => {
  const local = new Map([['rep', [{ id: 'old' }]], ['sales', []], ['production', [{ id: 'p0' }]]]);
  it('reports only records this device did not already have', () => {
    const merged = { rep: [{ id: 'old', salesRep: 'ALI', timestamp: NOW }, fresh({ id: 'new', salesRep: 'ALI', customerName: 'Z', totalValue: 1 })] };
    const items = findRemoteActivity(local, merged, fmt, NOW);
    assert.deepEqual(items.map(i => i.id), ['new']);
  });
  it('stays quiet for a collection that is empty locally (fresh device or restore)', () => {
    const merged = { sales: [fresh({ id: 's', createdBy: 'Sam', totalValue: 1 })] };
    assert.deepEqual(findRemoteActivity(local, merged, fmt, NOW), []);
  });
  it('accepts a plain object as the local store too', () => {
    assert.equal(findRemoteActivity({ production: [{ id: 'a' }] }, { production: [fresh({ id: 'b', managedBy: 'Pat', net: 1 })] }, fmt, NOW).length, 1);
  });
});

describe('tapping a notification opens the record', () => {
  it('rep, sales, payments, expenses and production carry a target; factory and customers do not', () => {
    const local = { rep: [{ id: 'o' }], factory: [{ id: 'o' }], production: [{ id: 'o' }] };
    const merged = {
      rep: [fresh({ id: 'r', salesRep: 'ALI', customerName: 'Z', totalValue: 1 })],
      factory: [fresh({ id: 'f', managedBy: 'Fay', units: 2 })],
      production: [fresh({ id: 'p', managedBy: 'Pat', net: 1 })],
    };
    const plan = planNotifications(findRemoteActivity(local, merged, fmt, NOW));
    const byKey = Object.fromEntries(plan.map(n => [n.key, n.target]));
    assert.deepEqual(byKey.r, { k: 'rep', id: 'r' });
    assert.deepEqual(byKey.p, { k: 'production', id: 'p' });
    assert.equal(byKey.f, undefined);
  });
  it('the summary notification has no target', () => {
    const items = Array.from({ length: REMOTE_MAX_NOTIFICATIONS + 1 }, (_, i) => ({ id: 'i' + i, k: 'rep', title: 'T', body: 'B' }));
    assert.equal(planNotifications(items).at(-1).target, undefined);
  });
  it('sync passes the target to the device notification', () => {
    assert.match(readFileSync(new URL('../modules/sync.js', import.meta.url), 'utf8'), /sendDeviceNotification\(n\.title, n\.body, n\.tag, \{ key: n\.key, target: n\.target \}\)/);
  });
});

describe('planNotifications', () => {
  it('caps the individual notifications and summarises the rest', () => {
    const items = Array.from({ length: REMOTE_MAX_NOTIFICATIONS + 3 }, (_, i) => ({ id: 'i' + i, title: 'T', body: 'B' }));
    const plan = planNotifications(items);
    assert.equal(plan.length, REMOTE_MAX_NOTIFICATIONS + 1);
    assert.match(plan.at(-1).body, /^3 more records/);
    assert.equal(plan[0].tag, 'tx-i0');
  });
});

describe('wiring', () => {
  const sync = readFileSync(new URL('../modules/sync.js', import.meta.url), 'utf8');
  it('only admins are notified, and it runs after every merge', () => {
    assert.match(sync, /export function notifyAdminOfRemoteActivity\(localBatch, merged\) \{\s*if \(appMode !== 'admin'\) return;/);
    assert.match(sync, /try \{ notifyAdminOfRemoteActivity\(_localBatch, _merged\); \}/);
  });
  it('the device ping carries only lastWrite, which members are allowed to write', () => {
    assert.match(sync, /dataRootRef\(\)\.set\(\{\s*lastWrite:/);
  });
  it('the old remote device command notification is gone', () => {
    assert.equal(/remote command sent/i.test(readFileSync(new URL('../modules/notify.js', import.meta.url), 'utf8')), false);
  });
});
