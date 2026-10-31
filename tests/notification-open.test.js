import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const scheduled = [];
const shown = [];
class FakeNotification {
  constructor(title, options) { shown.push({ title, options }); }
}
FakeNotification.permission = 'granted';
globalThis.window = {
  Notification: FakeNotification,
  matchMedia: () => ({ matches: true }),
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      LocalNotifications: {
        checkPermissions: async () => ({ display: 'granted' }),
        schedule: async (arg) => { scheduled.push(...arg.notifications); },
      },
    },
  },
};
globalThis.Notification = FakeNotification;
globalThis.document = { addEventListener() {}, removeEventListener() {} };
const notify = await import('../modules/notify.js');
const { parseTarget, resolveEdit } = await import('../modules/notify-target.js');
notify.setNotificationWindow(5, 50);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('notification target', () => {
  it('accepts a store key with a record id and rejects anything else', () => {
    assert.deepEqual(parseTarget({ k: 'sales', id: 'abc' }), { k: 'sales', id: 'abc' });
    assert.deepEqual(parseTarget('rep:xyz'), { k: 'rep', id: 'xyz' });
    assert.deepEqual(parseTarget('transactions:a:b'), { k: 'transactions', id: 'a:b' });
    assert.equal(parseTarget({ k: 'unknown', id: '1' }), null);
    assert.equal(parseTarget({ k: 'sales' }), null);
    assert.equal(parseTarget(null), null);
    assert.equal(parseTarget('nocolon'), null);
  });
  it('maps each store to the editor that opens the original record', () => {
    assert.deepEqual(resolveEdit({ k: 'sales', id: '1' }, {}), { kind: 'sale', id: '1' });
    assert.deepEqual(resolveEdit({ k: 'rep', id: '2' }, {}), { kind: 'repsale', id: '2' });
    assert.deepEqual(resolveEdit({ k: 'transactions', id: '3' }, {}), { kind: 'payment', id: '3' });
    assert.deepEqual(resolveEdit({ k: 'expenses', id: '4' }, {}), { kind: 'expense', id: '4' });
    assert.deepEqual(resolveEdit({ k: 'production', id: '5' }, {}), { kind: 'prod', id: '5' });
  });
  it('opens a transfer from its pair instead of a single leg', () => {
    assert.deepEqual(resolveEdit({ k: 'transactions', id: 't1' }, { isTransfer: true, transferPairId: 'p1' }), { kind: 'paytransfer', id: 'p1' });
    assert.deepEqual(resolveEdit({ k: 'production', id: 't2' }, { isTransfer: true, transferPairId: 'p2' }), { kind: 'stocktransfer', id: 'p2' });
  });
});

describe('device notification carries its transaction', () => {
  it('attaches the target to the native notification', async () => {
    scheduled.length = 0;
    await notify.sendDeviceNotification('Sale recorded', 'Ali — Rs 500', 'tx-1', { key: 'r1', target: { k: 'sales', id: 'r1' } });
    await wait(120);
    assert.equal(scheduled.length, 1);
    assert.deepEqual(scheduled[0].extra, { k: 'sales', id: 'r1' });
  });
  it('keeps each transaction target separate when several are sent together', async () => {
    scheduled.length = 0;
    await notify.sendDeviceNotification('Sale recorded', 'Ali — Rs 500', 'tx-a', { key: 'a', target: { k: 'sales', id: 'a' } });
    await notify.sendDeviceNotification('Payment recorded', 'Paid to Bilal — Rs 900', 'tx-b', { key: 'b', target: { k: 'transactions', id: 'b' } });
    await wait(120);
    const extras = scheduled.map((n) => n.extra).sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual(extras, [{ k: 'sales', id: 'a' }, { k: 'transactions', id: 'b' }]);
  });
  it('sends no target for a notification that is not about one transaction', async () => {
    scheduled.length = 0;
    await notify.sendDeviceNotification('Backup restored', 'Your data was restored from the backup file.', 'backup-restored');
    await wait(120);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].extra, undefined);
  });
});
