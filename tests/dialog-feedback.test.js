import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const haptic = { impact: [], notification: [] };
const vibrations = [];
const tones = [];
const store = new Map();
const overlays = [];
const docListeners = {};

const contexts = [];
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; contexts.push(this); }
  createOscillator() {
    const o = { frequency: { value: 0 }, connect() {}, start() { tones.push(o.frequency.value); }, stop() {} };
    return o;
  }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  resume() { return Promise.resolve().then(() => { this.state = 'running'; }); }
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

describe('settings switches respond when flipped', () => {
  beforeEach(reset);
  it('turning sound off still plays the off cue, then goes quiet', () => {
    fb.toggleFeedback('sound', false);
    assert.deepEqual(tones, [880, 587]);
    assert.deepEqual(haptic.impact, ['LIGHT']);
    assert.equal(fb.getDialogFeedback().sound, false);
    tones.length = 0;
    fb.dialogFeedback('open', 'success');
    assert.equal(tones.length, 0);
  });
  it('turning sound on plays the on cue', () => {
    fb.setDialogFeedback({ sound: false });
    fb.toggleFeedback('sound', true);
    assert.deepEqual(tones, [587, 880]);
    assert.deepEqual(haptic.notification, ['SUCCESS']);
    assert.equal(fb.getDialogFeedback().sound, true);
  });
  it('turning haptics off gives a last tap and the sound, then goes still', () => {
    fb.toggleFeedback('haptics', false);
    assert.deepEqual(haptic.impact, ['LIGHT']);
    assert.deepEqual(tones, [880, 587]);
    assert.equal(fb.getDialogFeedback().haptics, false);
    haptic.impact.length = 0;
    fb.dialogFeedback('confirm', 'danger');
    assert.equal(haptic.impact.length, 0);
  });
  it('turning haptics on vibrates even though it was off', () => {
    fb.setDialogFeedback({ haptics: false });
    fb.toggleFeedback('haptics', true);
    assert.deepEqual(haptic.notification, ['SUCCESS']);
    assert.equal(fb.getDialogFeedback().haptics, true);
  });
  it('an unknown channel changes nothing', () => {
    fb.toggleFeedback('volume', true);
    assert.equal(haptic.impact.length + haptic.notification.length + tones.length, 0);
  });
});

describe('device paths', () => {
  beforeEach(reset);
  it('waits for a suspended audio engine before scheduling tones', async () => {
    contexts[0].state = 'suspended';
    fb.dialogFeedback('open', 'success');
    assert.equal(tones.length, 0);
    await wait(5);
    assert.deepEqual(tones, [523, 784]);
  });
  it('falls back to vibrate when the native call is rejected', async () => {
    window.Capacitor = { Plugins: { Haptics: { impact: () => Promise.reject(new Error('unimplemented')), notification: () => Promise.reject(new Error('unimplemented')) } } };
    fb.dialogFeedback('open', 'error');
    await wait(5);
    assert.deepEqual(vibrations, [[30, 40, 30, 40, 30]]);
  });
  it('registers the native plugin once when Capacitor does not expose it', () => {
    const registered = [];
    window.Capacitor = {
      Plugins: {},
      isNativePlatform: () => true,
      registerPlugin: (name) => { registered.push(name); return { impact: (o) => haptic.impact.push(o.style), notification: (o) => haptic.notification.push(o.type) }; }
    };
    fb.toggleFeedback('haptics', true);
    fb.toggleFeedback('haptics', true);
    assert.deepEqual(registered, ['Haptics']);
    assert.deepEqual(haptic.notification, ['SUCCESS', 'SUCCESS']);
  });
});

const SEGMENT_CLASSES = ['toggle-opt', 'production-toggle-btn', 'metric-btn', 'formula-toggle-opt'];
const makeEl = ({ classes = [], attrs = {}, id = '', disabled = false, inDialog = false } = {}) => {
  const el = {
    id, disabled,
    classList: { contains: (c) => classes.includes(c) },
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    matches: (sel) => (sel === '#sidebar-btn-theme' ? id === 'sidebar-btn-theme'
      : sel.split(',').map((x) => x.trim()).some((x) => (x.startsWith('.') ? classes.includes(x.slice(1)) : x === '#sidebar-btn-theme' && id === 'sidebar-btn-theme'))),
    closest: (sel) => {
      if (sel === '.dlg-overlay') return inDialog ? {} : null;
      const wants = sel.split(',').map((x) => x.trim());
      const hit = wants.some((x) => (x === '[aria-pressed]' ? 'aria-pressed' in attrs : x === '#sidebar-btn-theme' ? id === 'sidebar-btn-theme' : classes.includes(x.slice(1))));
      return hit ? el : null;
    }
  };
  return el;
};

describe('controlCue picks the right cue for app controls', () => {
  it('segmented toggle options tick only when the choice changes', () => {
    for (const c of SEGMENT_CLASSES) {
      assert.equal(fb.controlCue(makeEl({ classes: [c] })), 'select', c);
      assert.equal(fb.controlCue(makeEl({ classes: [c, 'active'] })), null, `${c} already active`);
    }
  });
  it('status buttons and the sidebar theme switch always respond', () => {
    assert.equal(fb.controlCue(makeEl({ classes: ['status-toggle-btn', 'paid'] })), 'select');
    assert.equal(fb.controlCue(makeEl({ id: 'sidebar-btn-theme' })), 'select');
  });
  it('on/off buttons use aria-pressed to pick the on or off cue', () => {
    assert.equal(fb.controlCue(makeEl({ attrs: { 'aria-pressed': 'false' } })), 'toggleOn');
    assert.equal(fb.controlCue(makeEl({ attrs: { 'aria-pressed': 'true' } })), 'toggleOff');
  });
  it('ignores disabled controls, dialog contents, manual switches and ordinary buttons', () => {
    assert.equal(fb.controlCue(makeEl({ classes: ['toggle-opt'], disabled: true })), null);
    assert.equal(fb.controlCue(makeEl({ classes: ['toggle-opt'], attrs: { 'aria-disabled': 'true' } })), null);
    assert.equal(fb.controlCue(makeEl({ classes: ['toggle-opt'], inDialog: true })), null);
    assert.equal(fb.controlCue(makeEl({ classes: ['toggle-opt'], attrs: { 'data-feedback': 'manual' } })), null);
    assert.equal(fb.controlCue(makeEl({ classes: ['btn'] })), null);
    assert.equal(fb.controlCue(null), null);
    assert.equal(fb.controlCue({}), null);
  });
});

describe('inputCue for checkboxes and radios', () => {
  const input = (o) => ({ tagName: 'INPUT', disabled: false, getAttribute: () => null, ...o });
  it('checkbox on and off', () => {
    assert.equal(fb.inputCue(input({ type: 'checkbox', checked: true })), 'toggleOn');
    assert.equal(fb.inputCue(input({ type: 'checkbox', checked: false })), 'toggleOff');
  });
  it('radio selects', () => {
    assert.equal(fb.inputCue(input({ type: 'radio', checked: true })), 'select');
  });
  it('ignores text inputs, disabled inputs and manual switches', () => {
    assert.equal(fb.inputCue(input({ type: 'text' })), null);
    assert.equal(fb.inputCue(input({ type: 'checkbox', checked: true, disabled: true })), null);
    assert.equal(fb.inputCue(input({ type: 'checkbox', checked: true, getAttribute: () => 'manual' })), null);
    assert.equal(fb.inputCue({ tagName: 'DIV' }), null);
  });
});

describe('document listeners drive real feedback', () => {
  beforeEach(reset);
  it('a segmented toggle click taps and ticks', () => {
    docListeners.click({ target: makeEl({ classes: ['toggle-opt'] }) });
    assert.deepEqual(haptic.impact, ['LIGHT']);
    assert.deepEqual(tones, [740]);
  });
  it('an already-active option stays quiet', () => {
    docListeners.click({ target: makeEl({ classes: ['toggle-opt', 'active'] }) });
    assert.equal(haptic.impact.length + tones.length, 0);
  });
  it('a checkbox turning on plays the on cue, off plays the off cue', async () => {
    const box = { tagName: 'INPUT', type: 'checkbox', checked: true, disabled: false, getAttribute: () => null };
    docListeners.change({ target: box });
    assert.deepEqual(tones, [587, 880]);
    assert.deepEqual(haptic.notification, ['SUCCESS']);
    await wait(GAP);
    tones.length = 0; haptic.impact.length = 0;
    box.checked = false;
    docListeners.change({ target: box });
    assert.deepEqual(tones, [880, 587]);
    assert.deepEqual(haptic.impact, ['LIGHT']);
  });
  it('an on/off button reads its pressed state', () => {
    docListeners.click({ target: makeEl({ attrs: { 'aria-pressed': 'false' } }) });
    assert.deepEqual(haptic.notification, ['SUCCESS']);
  });
  it('respects the vibration and sound switches', () => {
    fb.setDialogFeedback({ haptics: false, sound: false });
    docListeners.click({ target: makeEl({ classes: ['toggle-opt'] }) });
    assert.equal(haptic.impact.length + vibrations.length + tones.length, 0);
  });
  it('the settings switches do not fire a second cue on top of their own', () => {
    docListeners.change({ target: { tagName: 'INPUT', type: 'checkbox', checked: true, disabled: false, getAttribute: (n) => (n === 'data-feedback' ? 'manual' : null) } });
    assert.equal(haptic.notification.length + tones.length, 0);
  });
  it('installing twice does not double up', () => {
    assert.equal(fb.installControlFeedback({ addEventListener() { throw new Error('should not attach'); } }), false);
  });
});
