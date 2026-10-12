import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const shown = [];
const toasts = [];
class FakeNotification {
  constructor(title, options) { shown.push({ title, body: options.body, tag: options.tag }); }
}
FakeNotification.permission = 'granted';
const overlays = [];
globalThis.window = { Notification: FakeNotification, Capacitor: null, matchMedia: () => ({ matches: true }) };
globalThis.Notification = FakeNotification;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
  contains: () => false,
  querySelector: () => (overlays.length ? overlays[0] : null),
  body: { style: {}, children: [], appendChild: (o) => overlays.push(o) },
  documentElement: { style: {} },
  fonts: null,
  createElement: () => {
    const el = {
      className: '', dataset: {}, listeners: {},
      addEventListener(t, fn) { this.listeners[t] = fn; },
      querySelector: () => null,
      querySelectorAll: () => [],
      remove() { overlays.splice(overlays.indexOf(this), 1); },
      classList: { add() {} },
      setProperty() {}, style: { setProperty() {} },
      get firstElementChild() { return { style: { setProperty() {} }, querySelector: () => ({ offsetWidth: 0, offsetHeight: 0 }), querySelectorAll: () => [], focus() {} }; },
      set innerHTML(v) { this._html = v; },
    };
    return el;
  },
};
globalThis.requestAnimationFrame = () => {};
const realNow = Date.now;
Date.now = () => realNow() - 60000;
const dialog = await import('../modules/dialog.js');
const notify = await import('../modules/notify.js');
Date.now = realNow;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickAction = (index) => {
  const overlay = overlays[0];
  overlay.listeners.click({ target: { closest: (sel) => (sel === '[data-act]' ? { dataset: { act: String(index) } } : null) } });
};
describe('describeForDevice mirrors the dialog', () => {
  it('uses the dialog title, tone line and every detail', () => {
    const msg = 'Insufficient cash in hand. Available: Rs 1,000 \u2014 Required: Rs 5,000';
    const d = dialog.describeForDevice(msg, { tone: 'warning' });
    assert.equal(d.title, 'Low cash in hand');
    assert.match(d.body, /^Needs your attention/);
    assert.match(d.body, /Available: Rs 1,000/);
    assert.match(d.body, /Required: Rs 5,000/);
  });
  it('prefers an explicit dialog title', () => {
    const d = dialog.describeForDevice('The statement could not be created.', { tone: 'error', title: 'Statement failed' });
    assert.equal(d.title, 'Statement failed');
  });
  it('derives a title from the message when nothing else applies', () => {
    const d = dialog.describeForDevice('Backup file was saved on this phone.', { tone: 'success' });
    assert.equal(d.title, 'Backup file was saved on this phone');
    assert.equal(d.body, 'Backup file was saved on this phone.');
  });
  it('turns failure messages into specific titles', () => {
    assert.equal(dialog.describeForDevice('Failed to save expense. Please try again.', { tone: 'error' }).title, 'Could not save expense');
  });
  it('keeps the full text without cutting it short', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Item ${i}: Rs ${i * 100}`).join('\n');
    const d = dialog.describeForDevice(`Review these items.\n${long}`, { tone: 'warning' });
    assert.match(d.body, /Item 29: Rs 2900/);
  });
  it('puts the chosen action first', () => {
    const d = dialog.describeForDevice('Delete this customer?\nName: Ali\nAmount: Rs 500', { tone: 'danger', title: 'Delete Customer', action: 'Confirmed: Delete' });
    assert.match(d.body, /^Confirmed: Delete\nThis action is permanent/);
    assert.match(d.body, /Name: Ali/);
  });
});
describe('device notification after a dialog closes', () => {
  it('notifies with the full details after confirming', async () => {
    shown.length = 0;
    const p = dialog.showGlassConfirm('Delete this payment?\nCustomer: Ali\nAmount: Rs 500', { title: 'Delete Payment', confirmText: 'Delete', danger: true });
    assert.equal(shown.length, 0);
    clickAction(1);
    assert.equal(await p, true);
    await wait(20);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Delete Payment');
    assert.match(shown[0].body, /^Confirmed: Delete/);
    assert.match(shown[0].body, /Customer: Ali/);
    assert.match(shown[0].body, /Rs 500/);
  });
  it('notifies with the full details after cancelling', async () => {
    shown.length = 0;
    const p = dialog.showGlassConfirm('Delete this payment?\nCustomer: Ali\nAmount: Rs 500', { title: 'Delete Payment', confirmText: 'Delete', danger: true });
    clickAction(0);
    assert.equal(await p, false);
    await wait(20);
    assert.equal(shown.length, 1);
    assert.match(shown[0].body, /^Chosen: Cancel/);
    assert.match(shown[0].body, /Customer: Ali/);
  });
  it('notifies after an alert is acknowledged', async () => {
    shown.length = 0;
    const p = dialog.showGlassAlert('Please enter a valid amount', { tone: 'warning' });
    assert.equal(shown.length, 0);
    clickAction(0);
    await p;
    await wait(20);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Missing information');
    assert.match(shown[0].body, /Please enter a valid amount/);
  });
  it('sends one notification for each dialog even when the text repeats', async () => {
    shown.length = 0;
    for (let i = 0; i < 2; i++) {
      const p = dialog.showGlassAlert('Please enter a valid amount', { tone: 'warning' });
      clickAction(0);
      await p;
    }
    await wait(20);
    assert.equal(shown.length, 2);
  });
});
describe('toasts and fallbacks', () => {
  it('has no generic toast mirror for unexplained messages', async () => {
    shown.length = 0;
    notify.notifyFromToast('Something happened in the app today', 'warning');
    await wait(1400);
    assert.equal(shown.length, 0);
  });
  it('reports the dialog flow as active until it settles', async () => {
    const p = dialog.showGlassAlert('Merged opening balance records cannot be deleted', { tone: 'warning' });
    assert.equal(dialog.isDialogFlowActive(), true);
    clickAction(0);
    await p;
    assert.equal(dialog.isDialogFlowActive(), true);
  });
});
