import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const haptic = { impact: [], notification: [] };
const vibrations = [];
const tones = [];
const store = new Map();
const overlays = [];
const docListeners = {};

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
  createOscillator() {
    const o = { frequency: { value: 0 }, connect() {}, start() { tones.push(o.frequency.value); }, stop() {} };
    return o;
  }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  resume() { return Promise.resolve(); }
}

globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = {
  matchMedia: () => ({ matches: true }),
  AudioContext: FakeAudioContext,
  Capacitor: { Plugins: { Haptics: { impact: (o) => haptic.impact.push(o.style), notification: (o) => haptic.notification.push(o.type) } } }
};
globalThis.document = {
  hidden: false,
  addEventListener(name, fn) { docListeners[name] = fn; },
  removeEventListener() {},
  activeElement: null,
  contains: () => false,
  querySelector: () => (overlays.length ? overlays[0] : null),
  getElementById: () => null,
  body: { style: {}, children: [], appendChild: (o) => overlays.push(o) },
  documentElement: { style: {} },
  fonts: null,
  createElement: () => ({
    className: '', dataset: {}, listeners: {},
    addEventListener(t, fn) { this.listeners[t] = fn; },
    querySelector: () => null,
    querySelectorAll: () => [],
    remove() { overlays.splice(overlays.indexOf(this), 1); },
    classList: { add() {} },
    setProperty() {}, style: { setProperty() {} },
    get firstElementChild() { return { style: { setProperty() {} }, querySelector: () => ({ offsetWidth: 0, offsetHeight: 0 }), querySelectorAll: () => [], focus() {} }; },
    set innerHTML(v) { this._html = v; }
  })
};
globalThis.requestAnimationFrame = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => { vibrations.push(p); return true; } }, configurable: true });

const fb = await import('../modules/feedback.js');
const dialog = await import('../modules/dialog.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 70;

const reset = async () => {
  haptic.impact.length = 0; haptic.notification.length = 0; vibrations.length = 0; tones.length = 0;
  fb.setDialogFeedback({ sound: true, haptics: true });
  window.Capacitor = { Plugins: { Haptics: { impact: (o) => haptic.impact.push(o.style), notification: (o) => haptic.notification.push(o.type) } } };
  document.hidden = false;
  await wait(GAP);
};

describe('feedback tables', () => {
  const kinds = ['open', 'confirm'];
  const toneList = ['primary', 'success', 'warning', 'danger', 'error'];
  it('every kind and tone has a haptic and a sound', () => {
    for (const k of kinds) for (const t of toneList) {
      assert.ok(fb.hapticFor(k, t), `haptic ${k}/${t}`);
      assert.ok(fb.soundFor(k, t) && fb.soundFor(k, t).length, `sound ${k}/${t}`);
    }
    for (const k of ['cancel', 'select', 'reject']) {
      assert.ok(fb.hapticFor(k, 'primary'), `haptic ${k}`);
      assert.ok(fb.soundFor(k, 'primary').length, `sound ${k}`);
    }
  });
  it('unknown kinds are ignored and unknown tones fall back to primary', () => {
    assert.equal(fb.hapticFor('nope', 'primary'), null);
    assert.deepEqual(fb.hapticFor('open', 'mystery'), fb.hapticFor('open', 'primary'));
  });
  it('errors feel stronger than primary dialogs', () => {
    assert.ok(fb.hapticFor('open', 'error').vibe.length > 1);
    assert.equal(fb.hapticFor('confirm', 'danger').impact, 'HEAVY');
  });
});

describe('dialogFeedback output', () => {
  beforeEach(reset);
  it('uses the native haptics plugin when present', () => {
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(haptic.notification, ['SUCCESS']);
    assert.equal(vibrations.length, 0);
  });
  it('falls back to navigator.vibrate without the plugin', () => {
    window.Capacitor = null;
    fb.dialogFeedback('open', 'error');
    assert.deepEqual(vibrations, [[30, 40, 30, 40, 30]]);
  });
  it('plays the tone sequence for the dialog type', () => {
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(tones, [523, 784]);
  });
  it('respects the haptics switch', () => {
    fb.setDialogFeedback({ haptics: false });
    fb.dialogFeedback('open', 'warning');
    assert.equal(haptic.notification.length + vibrations.length, 0);
    assert.ok(tones.length > 0);
  });
  it('respects the sound switch', () => {
    fb.setDialogFeedback({ sound: false });
    fb.dialogFeedback('open', 'warning');
    assert.equal(tones.length, 0);
    assert.deepEqual(haptic.notification, ['WARNING']);
  });
  it('stays silent while the page is hidden', () => {
    document.hidden = true;
    fb.dialogFeedback('open', 'primary');
    assert.equal(tones.length, 0);
  });
  it('ignores an identical cue fired twice in a burst', () => {
    fb.dialogFeedback('select');
    fb.dialogFeedback('select');
    assert.equal(haptic.impact.length, 1);
  });
  it('never throws when audio or haptics are unavailable', () => {
    window.Capacitor = null;
    window.AudioContext = undefined;
    const keep = navigator.vibrate;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    assert.doesNotThrow(() => fb.dialogFeedback('open', 'danger'));
    Object.defineProperty(globalThis, 'navigator', { value: { vibrate: keep }, configurable: true });
    window.AudioContext = FakeAudioContext;
  });
});

describe('settings persistence', () => {
  it('stores the switches on this device and reads them back', () => {
    fb.setDialogFeedback({ sound: false, haptics: true });
    assert.deepEqual(JSON.parse(store.get('gznd_dialog_feedback')), { sound: false, haptics: true });
    assert.deepEqual(fb.getDialogFeedback(), { sound: false, haptics: true });
  });
  it('ignores non-boolean values', () => {
    fb.setDialogFeedback({ sound: true, haptics: true });
    fb.setDialogFeedback({ sound: 'no', haptics: 0 });
    assert.deepEqual(fb.getDialogFeedback(), { sound: true, haptics: true });
  });
});

describe('dialogs trigger feedback', () => {
  beforeEach(reset);
  const click = (index) => overlays[0].listeners.click({ target: { closest: (sel) => (sel === '[data-act]' ? { dataset: { act: String(index) } } : null) } });

  it('opening a danger dialog warns, confirming it is heavy', async () => {
    const p = dialog.showGlassConfirm('Delete this record?', { title: 'Delete', danger: true, confirmText: 'Delete' });
    assert.deepEqual(haptic.notification, ['WARNING']);
    await wait(GAP);
    click(1);
    assert.equal(await p, true);
    assert.deepEqual(haptic.impact, ['HEAVY']);
  });
  it('cancelling gives the light cancel cue', async () => {
    const p = dialog.showGlassConfirm('Proceed?', { title: 'Confirm' });
    await wait(GAP);
    haptic.impact.length = 0;
    click(0);
    assert.equal(await p, false);
    assert.deepEqual(haptic.impact, ['LIGHT']);
  });
  it('an error alert opens with the error cue', () => {
    dialog.showGlassAlert('Something failed', { title: 'Error', tone: 'error' });
    assert.deepEqual(haptic.notification, ['ERROR']);
    overlays.length = 0;
  });
  it('replacing an open dialog plays only the new dialog open cue', async () => {
    dialog.showGlassConfirm('First?', { title: 'First' });
    await wait(GAP);
    haptic.impact.length = 0;
    dialog.showGlassConfirm('Second?', { title: 'Second' });
    assert.equal(haptic.impact.length, 1);
    overlays.length = 0;
  });
});
