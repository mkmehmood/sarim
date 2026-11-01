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
const { parseTarget, resolveView, LEDGER_SCREEN } = await import('../modules/notify-target.js');
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
  it('opens a customer sale in that customer\'s ledger and selects the transaction', () => {
    assert.deepEqual(resolveView({ k: 'sales', id: 's1' }, { customerName: 'RYAZ KTK' }), { type: 'ledger', kind: 'cust', owner: 'RYAZ KTK', row: 's1' });
    assert.deepEqual(resolveView({ k: 'rep', id: 'r1' }, { customerName: 'Noman' }), { type: 'ledger', kind: 'rep', owner: 'Noman', row: 'r1' });
  });
  it('opens a payment in the entity ledger and a transfer in the transfer history', () => {
    assert.deepEqual(resolveView({ k: 'transactions', id: 't1' }, { entityId: 'e9' }), { type: 'ledger', kind: 'ent', owner: 'e9', row: 't1' });
    const transfer = resolveView({ k: 'transactions', id: 't2' }, { isTransfer: true, transferPairId: 'p1', entityId: 'e9' });
    assert.equal(transfer.type, 'transfer');
    assert.equal(transfer.screen, 'payment-transfer-screen');
    assert.equal(transfer.card, 'p1');
  });
  it('opens production in its history card and stock transfers in the transfer history', () => {
    assert.deepEqual(resolveView({ k: 'production', id: 'p5' }, {}), { type: 'prod', card: 'p5' });
    const transfer = resolveView({ k: 'production', id: 'p6' }, { isTransfer: true, transferPairId: 'sp1' });
    assert.equal(transfer.screen, 'stock-transfer-screen');
    assert.equal(transfer.card, 'sp1');
  });
  it('falls back to the tab when a record has no owner to open', () => {
    assert.deepEqual(resolveView({ k: 'sales', id: 's2' }, {}), { type: 'tab', tab: 'sales' });
    assert.deepEqual(resolveView({ k: 'transactions', id: 't3' }, {}), { type: 'tab', tab: 'payments' });
    assert.deepEqual(resolveView({ k: 'expenses', id: 'x1' }, {}), { type: 'expense', expenseId: 'x1' });
  });
  it('opens a factory entry in its history card and a new rep customer in their ledger', () => {
    assert.deepEqual(resolveView({ k: 'factory', id: 'f1' }, {}), { type: 'factory', card: 'f1' });
    assert.deepEqual(resolveView({ k: 'clients', id: 'c1' }, { name: 'Noman' }), { type: 'ledger', kind: 'rep', owner: 'Noman', row: '' });
    assert.deepEqual(parseTarget({ k: 'factory', id: 'f1' }), { k: 'factory', id: 'f1' });
  });
  it('knows the screen that holds each ledger', () => {
    assert.equal(LEDGER_SCREEN.cust, 'customer-management-screen');
    assert.equal(LEDGER_SCREEN.rep, 'rep-customer-management-screen');
    assert.equal(LEDGER_SCREEN.ent, 'entity-details-screen');
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
