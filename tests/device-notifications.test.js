import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const shown = [];
class FakeNotification {
  constructor(title, options) { shown.push({ title, body: options.body, tag: options.tag }); }
}
FakeNotification.permission = 'granted';
globalThis.window = { Notification: FakeNotification, Capacitor: null };
globalThis.Notification = FakeNotification;
globalThis.document = { addEventListener() {} };
const realNow = Date.now;
Date.now = () => realNow() - 60000;
const dialog = await import('../modules/dialog.js');
const notify = await import('../modules/notify.js');
Date.now = realNow;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
describe('device notifications follow the dialog wording', () => {
  it('uses the dialog title and caption for a low cash alert', () => {
    const msg = 'Insufficient cash in hand. Available: Rs 1,000 \u2014 Required: Rs 5,000';
    const d = dialog.describeForDevice(msg, { tone: 'warning' });
    assert.equal(d.title, 'Low cash in hand');
    assert.match(d.body, /^Needs your attention/);
    assert.match(d.body, /Available: Rs 1,000/);
    assert.match(d.body, /Required: Rs 5,000/);
  });
  it('prefers an explicit dialog title over the derived one', () => {
    const d = dialog.describeForDevice('The statement could not be created.', { tone: 'error', title: 'Statement failed' });
    assert.equal(d.title, 'Statement failed');
    assert.match(d.body, /The action could not be completed/);
  });
  it('keeps success notifications free of the warning caption', () => {
    const d = dialog.describeForDevice('Backup file was saved on this phone.', { tone: 'success' });
    assert.equal(d.title, 'Success');
    assert.equal(d.body, 'Backup file was saved on this phone.');
  });
  it('turns bullets and notes into readable lines', () => {
    const d = dialog.describeForDevice('Some records are linked.\n\u2022 Sale to Ali\n\u2022 Payment from Ali\nNote: Remove the links first.', { tone: 'warning' });
    assert.match(d.body, /\u2022 Sale to Ali/);
    assert.match(d.body, /Note: Remove the links first\./);
  });
  it('sends a device notification when a dialog alert opens', async () => {
    shown.length = 0;
    notify.notifyFromDialog('Insufficient cash in hand. Available: Rs 1,000 \u2014 Required: Rs 5,000', 'warning', 'Low cash in hand');
    await wait(20);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Low cash in hand');
    assert.match(shown[0].body, /Required: Rs 5,000/);
  });
  it('does not repeat the same dialog notification', async () => {
    shown.length = 0;
    notify.notifyFromDialog('The backup file could not be read. Pick another file.', 'error', 'Restore failed');
    notify.notifyFromDialog('The backup file could not be read. Pick another file.', 'error', 'Restore failed');
    await wait(20);
    assert.equal(shown.length, 1);
  });
});
