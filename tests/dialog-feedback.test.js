import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const haptic = { impact: [], notification: [], vibrate: [] };
const vibrations = [];
const tones = [];
const peaks = [];
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
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime(v) { if (v > 0.001) peaks.push(v); } }, connect() {} };
  }
  resume() { return Promise.resolve().then(() => { this.state = 'running'; }); }
}

const nativePlugin = () => ({ vibrate: (o) => { haptic.vibrate.push(o.duration); }, impact: (o) => haptic.impact.push(o.style), notification: (o) => haptic.notification.push(o.type) });
const legacyPlugin = () => ({ impact: (o) => haptic.impact.push(o.style), notification: (o) => haptic.notification.push(o.type) });

globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { matchMedia: () => ({ matches: true }), AudioContext: FakeAudioContext, Capacitor: { Plugins: { Haptics: nativePlugin() } } };
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
const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
setNavigator({ vibrate: (p) => { vibrations.push(p); return true; } });

const fb = await import('../modules/feedback.js');
const dialog = await import('../modules/dialog.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 70;

const reset = async () => {
  haptic.impact.length = 0; haptic.notification.length = 0; haptic.vibrate.length = 0; vibrations.length = 0; tones.length = 0; peaks.length = 0;
  fb.setFeedbackLevels({ haptics: 'medium', sound: 'crisp' });
  window.Capacitor = { Plugins: { Haptics: nativePlugin() } };
  window.AudioContext = FakeAudioContext;
  setNavigator({ vibrate: (p) => { vibrations.push(p); return true; } });
  document.hidden = false;
  document.getElementById = () => null;
  if (contexts[0]) contexts[0].state = 'running';
  await wait(GAP);
};

const KINDS = ['open', 'confirm', 'cancel', 'select', 'reject', 'toggleOn', 'toggleOff'];
const TONES = ['primary', 'success', 'warning', 'danger', 'error'];
const total = (vibe) => (Array.isArray(vibe) ? vibe.reduce((a, b) => a + b, 0) : vibe);

describe('level lists', () => {
  it('haptics offer disabled, light, medium, strong, extreme in that order', () => {
    assert.deepEqual(fb.HAPTIC_LEVELS.map((o) => o.value), ['off', 'light', 'medium', 'strong', 'extreme']);
    assert.deepEqual(fb.HAPTIC_LEVELS.map((o) => o.label), ['Disabled', 'Light', 'Medium', 'Strong', 'Extreme']);
  });
  it('sound offers muted, soft, standard, loud, extreme boost in that order', () => {
    assert.deepEqual(fb.SOUND_LEVELS.map((o) => o.value), ['off', 'soft', 'crisp', 'loud', 'extreme']);
    assert.deepEqual(fb.SOUND_LEVELS.map((o) => o.label), ['Muted', 'Soft (Discreet)', 'Standard (Crisp)', 'Loud (Resonant)', 'Extreme Boost (Maximum)']);
  });
  it('every level has a description', () => {
    [...fb.HAPTIC_LEVELS, ...fb.SOUND_LEVELS].forEach((o) => assert.ok(o.desc.length > 10, o.value));
  });
});

describe('feedback tables', () => {
  it('every kind and tone has a haptic and a sound', () => {
    for (const k of ['open', 'confirm']) for (const t of TONES) {
      assert.ok(fb.hapticFor(k, t), `haptic ${k}/${t}`);
      assert.ok(fb.soundFor(k, t) && fb.soundFor(k, t).length, `sound ${k}/${t}`);
    }
    for (const k of ['cancel', 'select', 'reject', 'toggleOn', 'toggleOff']) {
      assert.ok(fb.hapticFor(k, 'primary'), `haptic ${k}`);
      assert.ok(fb.soundFor(k, 'primary').length, `sound ${k}`);
    }
  });
  it('unknown kinds are ignored and unknown tones fall back to primary', () => {
    assert.equal(fb.hapticFor('nope', 'primary'), null);
    assert.deepEqual(fb.hapticFor('open', 'mystery'), fb.hapticFor('open', 'primary'));
  });
});

describe('scaleHaptic', () => {
  it('disabled produces nothing', () => {
    assert.equal(fb.scaleHaptic(fb.hapticFor('open', 'error'), 'off'), null);
    assert.equal(fb.scaleHaptic(null, 'medium'), null);
  });
  it('medium keeps the base cue', () => {
    assert.deepEqual(fb.scaleHaptic(fb.hapticFor('open', 'success'), 'medium'), fb.hapticFor('open', 'success'));
  });
  it('light is a single subtle tick, even for notification cues', () => {
    assert.deepEqual(fb.scaleHaptic(fb.hapticFor('open', 'error'), 'light'), { impact: 'LIGHT', vibe: 30 });
  });
  it('strong lengthens pulses and steps the impact up', () => {
    assert.deepEqual(fb.scaleHaptic({ impact: 'LIGHT', vibe: 40 }, 'strong'), { impact: 'MEDIUM', vibe: 64 });
    assert.equal(fb.scaleHaptic({ impact: 'MEDIUM', vibe: 35 }, 'strong').impact, 'HEAVY');
    assert.equal(fb.scaleHaptic({ impact: 'HEAVY', vibe: 60 }, 'strong').impact, 'HEAVY');
    assert.equal(fb.scaleHaptic(fb.hapticFor('open', 'error'), 'strong').notify, 'ERROR');
  });
  it('extreme repeats the pulse with a pause between', () => {
    const out = fb.scaleHaptic({ impact: 'LIGHT', vibe: 40 }, 'extreme');
    assert.deepEqual(out.vibe, [88, 80, 88]);
    assert.equal(out.impact, 'HEAVY');
    assert.equal(out.repeat, 2);
    const pattern = fb.scaleHaptic({ notify: 'SUCCESS', vibe: [40, 50, 60] }, 'extreme');
    assert.deepEqual(pattern.vibe, [88, 50, 132, 80, 88, 50, 132]);
    assert.equal(pattern.notify, 'SUCCESS');
  });
  it('every level is stronger than the one before and never below 30 ms', () => {
    for (const k of KINDS) for (const t of TONES) {
      const base = fb.hapticFor(k, t);
      const light = fb.scaleHaptic(base, 'light');
      const medium = fb.scaleHaptic(base, 'medium');
      const strong = fb.scaleHaptic(base, 'strong');
      const extreme = fb.scaleHaptic(base, 'extreme');
      assert.ok(total(light.vibe) <= total(medium.vibe), `${k}/${t} light<=medium`);
      assert.ok(total(medium.vibe) < total(strong.vibe), `${k}/${t} medium<strong`);
      assert.ok(total(strong.vibe) < total(extreme.vibe), `${k}/${t} strong<extreme`);
      for (const spec of [light, medium, strong, extreme]) {
        const pulses = Array.isArray(spec.vibe) ? spec.vibe.filter((_, i) => i % 2 === 0) : [spec.vibe];
        pulses.forEach((ms) => assert.ok(ms >= 30, `${k}/${t} pulse ${ms}`));
      }
    }
  });
});

describe('normalizeLevel and persistence', () => {
  it('old on/off settings migrate to levels', () => {
    assert.equal(fb.normalizeLevel('haptics', true), 'medium');
    assert.equal(fb.normalizeLevel('haptics', false), 'off');
    assert.equal(fb.normalizeLevel('sound', true), 'crisp');
    assert.equal(fb.normalizeLevel('sound', false), 'off');
  });
  it('valid levels stay, unknown values fall back to the default', () => {
    assert.equal(fb.normalizeLevel('haptics', 'strong'), 'strong');
    assert.equal(fb.normalizeLevel('sound', 'loud'), 'loud');
    assert.equal(fb.normalizeLevel('haptics', 'turbo'), 'medium');
    assert.equal(fb.normalizeLevel('sound', 7), 'crisp');
    assert.equal(fb.normalizeLevel('volume', 'loud'), null);
  });
  it('levels are stored on this device and read back', () => {
    fb.setFeedbackLevels({ haptics: 'strong', sound: 'loud' });
    assert.deepEqual(JSON.parse(store.get('gznd_dialog_feedback')), { haptics: 'strong', sound: 'loud' });
    assert.deepEqual(fb.getFeedbackLevels(), { haptics: 'strong', sound: 'loud' });
  });
  it('invalid values are ignored and the channels are independent', () => {
    fb.setFeedbackLevels({ haptics: 'light', sound: 'soft' });
    fb.setFeedbackLevels({ haptics: 'turbo', sound: true });
    assert.deepEqual(fb.getFeedbackLevels(), { haptics: 'light', sound: 'soft' });
    fb.setFeedbackLevels({ sound: 'off' });
    assert.deepEqual(fb.getFeedbackLevels(), { haptics: 'light', sound: 'off' });
  });
});

describe('haptics by level on the native plugin', () => {
  beforeEach(reset);
  const none = () => haptic.vibrate.length + haptic.impact.length + haptic.notification.length + vibrations.length;
  it('medium sends full-strength vibrate pulses, not weak waveform effects', async () => {
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(haptic.vibrate, [40]);
    await wait(250);
    assert.deepEqual(haptic.vibrate, [40, 60]);
    assert.equal(haptic.impact.length + haptic.notification.length + vibrations.length, 0);
  });
  it('light is a single short pulse for every cue', () => {
    fb.setFeedbackLevels({ haptics: 'light' });
    fb.dialogFeedback('open', 'error');
    assert.deepEqual(haptic.vibrate, [30]);
  });
  it('strong lengthens the pulse', () => {
    fb.setFeedbackLevels({ haptics: 'strong' });
    fb.dialogFeedback('confirm', 'primary');
    assert.deepEqual(haptic.vibrate, [64]);
  });
  it('extreme plays the pattern twice with a pause between', async () => {
    fb.setFeedbackLevels({ haptics: 'extreme' });
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(haptic.vibrate, [88]);
    await wait(900);
    assert.deepEqual(haptic.vibrate, [88, 132, 88, 132]);
  });
  it('disabled stays still while sound keeps working', () => {
    fb.setFeedbackLevels({ haptics: 'off' });
    fb.dialogFeedback('open', 'warning');
    assert.equal(none(), 0);
    assert.ok(tones.length > 0);
  });
  it('an older plugin without vibrate falls back to its tap and notification effects', async () => {
    window.Capacitor = { Plugins: { Haptics: legacyPlugin() } };
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(haptic.notification, ['SUCCESS']);
    assert.equal(haptic.vibrate.length, 0);
    await wait(GAP);
    fb.setFeedbackLevels({ haptics: 'extreme' });
    fb.dialogFeedback('confirm', 'primary');
    await wait(150);
    assert.deepEqual(haptic.impact, ['HEAVY', 'HEAVY']);
  });
  it('on iOS the native tap and notification effects are used instead of a long vibrate', () => {
    window.Capacitor = { Plugins: { Haptics: nativePlugin() }, getPlatform: () => 'ios' };
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(haptic.notification, ['SUCCESS']);
    assert.equal(haptic.vibrate.length, 0);
  });
});

describe('haptics by level in the browser', () => {
  beforeEach(async () => { await reset(); window.Capacitor = null; });
  it('uses the scaled pattern for the chosen level', () => {
    for (const level of ['light', 'medium', 'strong', 'extreme']) {
      vibrations.length = 0;
      fb.setFeedbackLevels({ haptics: level });
      fb.dialogFeedback(`open`, level === 'light' ? 'error' : 'success');
      const tone = level === 'light' ? 'error' : 'success';
      assert.deepEqual(vibrations, [fb.scaleHaptic(fb.hapticFor('open', tone), level).vibe], level);
      fb.dialogFeedback('select');
    }
  });
  it('falls back to vibrate when the native call is rejected', async () => {
    window.Capacitor = { Plugins: { Haptics: { vibrate: () => Promise.reject(new Error('x')), impact: () => Promise.reject(new Error('x')), notification: () => Promise.reject(new Error('x')) } } };
    fb.dialogFeedback('open', 'error');
    await wait(5);
    assert.deepEqual(vibrations, [fb.hapticFor('open', 'error').vibe]);
  });
  it('registers the native plugin once when Capacitor does not expose it', () => {
    const registered = [];
    window.Capacitor = { Plugins: {}, isNativePlatform: () => true, registerPlugin: (name) => { registered.push(name); return nativePlugin(); } };
    fb.dialogFeedback('open', 'primary');
    return wait(GAP).then(() => {
      fb.dialogFeedback('open', 'primary');
      assert.deepEqual(registered, ['Haptics']);
      assert.deepEqual(haptic.vibrate, [40, 40]);
    });
  });
  it('never throws when audio or haptics are unavailable', () => {
    window.AudioContext = undefined;
    setNavigator({});
    assert.doesNotThrow(() => fb.dialogFeedback('open', 'danger'));
  });
});

describe('sound by level', () => {
  beforeEach(reset);
  it('standard plays one crisp note', () => {
    fb.dialogFeedback('select');
    assert.deepEqual(tones, [740]);
    assert.deepEqual(peaks, [0.28]);
  });
  it('gets louder with each level', async () => {
    const peak = {};
    for (const level of ['soft', 'crisp', 'loud', 'extreme']) {
      peaks.length = 0;
      fb.setFeedbackLevels({ sound: level });
      fb.dialogFeedback('select');
      peak[level] = Math.max(...peaks);
      await wait(GAP);
    }
    assert.ok(peak.soft < peak.crisp && peak.crisp < peak.loud && peak.loud < peak.extreme, JSON.stringify(peak));
    assert.ok(peak.extreme <= 0.8);
  });
  it('loud adds a resonant overtone an octave up', () => {
    fb.setFeedbackLevels({ sound: 'loud' });
    fb.dialogFeedback('select');
    assert.deepEqual(tones, [740, 1480]);
    assert.deepEqual(peaks, [0.5, 0.18]);
  });
  it('extreme boost is one loud burst, never a repeat', () => {
    fb.setFeedbackLevels({ sound: 'extreme' });
    fb.dialogFeedback('select');
    assert.deepEqual(tones, [740, 1480]);
    assert.deepEqual(peaks, [0.7, 0.25]);
  });
  it('every cue is a single note', () => {
    for (const k of KINDS) for (const t of TONES) assert.equal(fb.soundFor(k, t).length, 1, `${k}/${t}`);
  });
  it('one tap makes one sound, even for dialogs that also have an open cue', () => {
    fb.dialogFeedback('open', 'success');
    assert.deepEqual(tones, [784]);
  });
  it('muted is silent while haptics keep working', () => {
    fb.setFeedbackLevels({ sound: 'off' });
    fb.dialogFeedback('open', 'warning');
    assert.equal(tones.length, 0);
    assert.deepEqual(haptic.vibrate, [50]);
  });
  it('stays silent while the page is hidden', () => {
    document.hidden = true;
    fb.dialogFeedback('open', 'primary');
    assert.equal(tones.length, 0);
  });
  it('waits for a suspended audio engine before scheduling tones', async () => {
    contexts[0].state = 'suspended';
    fb.dialogFeedback('open', 'success');
    assert.equal(tones.length, 0);
    await wait(5);
    assert.deepEqual(tones, [784]);
  });
  it('ignores an identical cue fired twice in a burst', () => {
    fb.dialogFeedback('select');
    fb.dialogFeedback('select');
    assert.equal(haptic.vibrate.length, 1);
  });
  it('every note is pitched and long enough for a phone speaker', () => {
    for (const k of KINDS) for (const t of TONES) {
      fb.soundFor(k, t).forEach(([hz, dur]) => { assert.ok(hz >= 300, `${k}/${t} ${hz}Hz`); assert.ok(dur >= 0.05, `${k}/${t} ${dur}s`); });
    }
  });
});

describe('device tests', () => {
  beforeEach(reset);
  it('native haptics are reported as working', async () => {
    assert.equal(await fb.testHaptics(), 'native');
    assert.deepEqual(haptic.vibrate, [40, 60]);
  });
  it('the browser vibrate fallback is reported', async () => {
    window.Capacitor = null;
    assert.equal(await fb.testHaptics(), 'browser');
  });
  it('a refused vibrate call is reported as blocked', async () => {
    window.Capacitor = null;
    setNavigator({ vibrate: () => false });
    assert.equal(await fb.testHaptics(), 'blocked');
  });
  it('a missing vibrate API is reported as unsupported', async () => {
    window.Capacitor = null;
    setNavigator({});
    assert.equal(await fb.testHaptics(), 'unsupported');
  });
  it('a failing native call falls through to the browser', async () => {
    window.Capacitor = { Plugins: { Haptics: { notification: () => Promise.reject(new Error('x')), impact: () => Promise.reject(new Error('x')) } } };
    assert.equal(await fb.testHaptics(), 'browser');
  });
  it('sound plays and audio that cannot start is reported as blocked', async () => {
    assert.equal(await fb.testSound(), 'played');
    assert.deepEqual(tones, [784]);
    tones.length = 0;
    contexts[0].state = 'suspended';
    const keep = contexts[0].resume;
    contexts[0].resume = () => Promise.resolve();
    assert.equal(await fb.testSound(), 'blocked');
    contexts[0].resume = keep;
  });
  it('disabled channels report off and stay silent', async () => {
    fb.setFeedbackLevels({ haptics: 'off', sound: 'off' });
    assert.equal(await fb.testHaptics(), 'off');
    assert.equal(await fb.testSound(), 'off');
    assert.equal(tones.length + haptic.notification.length + vibrations.length, 0);
  });
  it('the test uses the chosen intensity', async () => {
    fb.setFeedbackLevels({ sound: 'extreme' });
    await fb.testSound();
    assert.deepEqual(tones, [784, 1568]);
  });
  it('previewFeedback writes a plain-language result next to the control', async () => {
    const els = { 'fb-haptics-status': { textContent: '' }, 'fb-sound-status': { textContent: '' } };
    document.getElementById = (id) => els[id] || null;
    assert.equal(await fb.previewFeedback('haptics'), 'native');
    assert.match(els['fb-haptics-status'].textContent, /signal sent/);
    assert.equal(await fb.previewFeedback('sound'), 'played');
    assert.match(els['fb-sound-status'].textContent, /media volume/);
    fb.setFeedbackLevels({ sound: 'off' });
    await fb.previewFeedback('sound');
    assert.equal(els['fb-sound-status'].textContent, 'Sound is muted.');
    assert.equal(await fb.previewFeedback('volume'), null);
  });
  it('describeResult covers every outcome', () => {
    for (const r of ['native', 'browser', 'blocked', 'unsupported', 'off']) assert.ok(fb.describeResult('haptics', r).length > 10, r);
    for (const r of ['played', 'blocked', 'unsupported', 'off']) assert.ok(fb.describeResult('sound', r).length > 10, r);
    assert.match(fb.describeResult('sound', 'weird'), /could not run/);
  });
});

describe('settings dropdowns use the app popover', () => {
  beforeEach(reset);
  const setup = () => {
    const els = {
      'fb-haptics-wrap': {}, 'fb-haptics-title': { textContent: '' }, 'fb-haptics-desc': { textContent: '' }, 'fb-haptics-status': { textContent: '' },
      'fb-sound-wrap': {}, 'fb-sound-title': { textContent: '' }, 'fb-sound-desc': { textContent: '' }, 'fb-sound-status': { textContent: '' }
    };
    document.getElementById = (id) => els[id] || null;
    const calls = [];
    window._mkPopover = (...args) => calls.push(args);
    return { els, calls };
  };
  it('opens the haptic menu with all five levels and the current one marked', () => {
    const { els, calls } = setup();
    assert.equal(fb.openFeedbackLevelMenu('haptics'), true);
    const [anchor, popId, items, , opts] = calls[0];
    assert.equal(anchor, els['fb-haptics-wrap']);
    assert.equal(popId, '_pop_fb_haptics');
    assert.deepEqual(items.map((i) => i.label), ['Disabled', 'Light', 'Medium', 'Strong', 'Extreme']);
    assert.ok(items.every((i) => i.desc));
    assert.deepEqual(opts, { fullWidth: true, selected: 'medium' });
  });
  it('picking a haptic level saves it, updates the card and previews it', async () => {
    const { els, calls } = setup();
    fb.openFeedbackLevelMenu('haptics');
    calls[0][3]('strong');
    assert.equal(fb.getFeedbackLevels().haptics, 'strong');
    assert.equal(els['fb-haptics-title'].textContent, 'Strong');
    assert.equal(els['fb-haptics-desc'].textContent, 'Heavy tactile vibration pulse');
    assert.deepEqual(haptic.vibrate, [64]);
    await wait(400);
    assert.match(els['fb-haptics-status'].textContent, /signal sent/);
  });
  it('picking a sound level saves it and plays it at that level', () => {
    const { els, calls } = setup();
    fb.openFeedbackLevelMenu('sound');
    assert.deepEqual(calls[0][2].map((i) => i.label), ['Muted', 'Soft (Discreet)', 'Standard (Crisp)', 'Loud (Resonant)', 'Extreme Boost (Maximum)']);
    calls[0][3]('loud');
    assert.equal(fb.getFeedbackLevels().sound, 'loud');
    assert.equal(els['fb-sound-title'].textContent, 'Loud (Resonant)');
    return wait(5).then(() => assert.ok(tones.length > 0));
  });
  it('picking disabled turns the channel off and says so', async () => {
    const { els, calls } = setup();
    fb.openFeedbackLevelMenu('sound');
    calls[0][3]('off');
    await wait(5);
    assert.equal(fb.getFeedbackLevels().sound, 'off');
    assert.equal(els['fb-sound-status'].textContent, 'Sound is muted.');
    assert.equal(tones.length, 0);
  });
  it('syncFeedbackSettings shows the saved levels when the screen opens', () => {
    const { els } = setup();
    fb.setFeedbackLevels({ haptics: 'extreme', sound: 'soft' });
    fb.syncFeedbackSettings();
    assert.equal(els['fb-haptics-title'].textContent, 'Extreme');
    assert.equal(els['fb-haptics-desc'].textContent, 'Maximum dual-pulse hardware vibration');
    assert.equal(els['fb-sound-title'].textContent, 'Soft (Discreet)');
  });
  it('does nothing for an unknown channel, a missing anchor or a missing popover helper', () => {
    const { calls } = setup();
    assert.equal(fb.openFeedbackLevelMenu('volume'), false);
    document.getElementById = () => null;
    assert.equal(fb.openFeedbackLevelMenu('haptics'), false);
    setup();
    window._mkPopover = undefined;
    assert.equal(fb.openFeedbackLevelMenu('haptics'), false);
    assert.equal(calls.length, 0);
  });
});

describe('dialogs trigger feedback', () => {
  beforeEach(reset);
  const click = (index) => overlays[0].listeners.click({ target: { closest: (sel) => (sel === '[data-act]' ? { dataset: { act: String(index) } } : null) } });

  it('opening a danger dialog warns, confirming it is heavy', async () => {
    const p = dialog.showGlassConfirm('Delete this record?', { title: 'Delete', danger: true, confirmText: 'Delete' });
    assert.deepEqual(haptic.vibrate, [60]);
    await wait(GAP + 300);
    haptic.vibrate.length = 0;
    click(1);
    assert.equal(await p, true);
    assert.deepEqual(haptic.vibrate, [90]);
  });
  it('cancelling gives the light cancel cue', async () => {
    const p = dialog.showGlassConfirm('Proceed?', { title: 'Confirm' });
    await wait(GAP);
    haptic.vibrate.length = 0;
    click(0);
    assert.equal(await p, false);
    assert.deepEqual(haptic.vibrate, [30]);
  });
  it('an error alert opens with the error cue', async () => {
    dialog.showGlassAlert('Something failed', { title: 'Error', tone: 'error' });
    assert.deepEqual(haptic.vibrate, [70]);
    overlays.length = 0;
    await wait(600);
    assert.deepEqual(haptic.vibrate, [70, 70, 70]);
  });
  it('replacing an open dialog plays only the new dialog open cue', async () => {
    dialog.showGlassConfirm('First?', { title: 'First' });
    await wait(GAP);
    haptic.vibrate.length = 0;
    dialog.showGlassConfirm('Second?', { title: 'Second' });
    assert.equal(haptic.vibrate.length, 1);
    overlays.length = 0;
  });
  it('dialogs follow the chosen intensity', async () => {
    fb.setFeedbackLevels({ haptics: 'light', sound: 'off' });
    dialog.showGlassAlert('Heads up', { title: 'Warning', tone: 'warning' });
    assert.deepEqual(haptic.vibrate, [30]);
    assert.equal(tones.length, 0);
    overlays.length = 0;
  });
});

const SEGMENT_CLASSES = ['toggle-opt', 'production-toggle-btn', 'metric-btn', 'formula-toggle-opt'];
const makeEl = ({ classes = [], attrs = {}, id = '', disabled = false, inDialog = false } = {}) => {
  const el = {
    id, disabled,
    classList: { contains: (c) => classes.includes(c) },
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    matches: (sel) => sel.split(',').map((x) => x.trim()).some((x) => (x.startsWith('.') ? classes.includes(x.slice(1)) : x === '#sidebar-btn-theme' && id === 'sidebar-btn-theme')),
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
  it('ignores disabled controls, dialog contents, opted-out controls and ordinary buttons', () => {
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
  it('ignores text inputs, disabled inputs and opted-out inputs', () => {
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
    assert.deepEqual(haptic.vibrate, [35]);
    assert.deepEqual(tones, [740]);
  });
  it('an already-active option stays quiet', () => {
    docListeners.click({ target: makeEl({ classes: ['toggle-opt', 'active'] }) });
    assert.equal(haptic.vibrate.length + tones.length, 0);
  });
  it('a checkbox turning on plays the on cue, off plays the off cue', async () => {
    const box = { tagName: 'INPUT', type: 'checkbox', checked: true, disabled: false, getAttribute: () => null };
    docListeners.change({ target: box });
    assert.deepEqual(tones, [880]);
    assert.deepEqual(haptic.vibrate, [35]);
    await wait(GAP + 200);
    tones.length = 0; haptic.vibrate.length = 0;
    box.checked = false;
    docListeners.change({ target: box });
    assert.deepEqual(tones, [587]);
    assert.deepEqual(haptic.vibrate, [30]);
  });
  it('an on/off button reads its pressed state', () => {
    docListeners.click({ target: makeEl({ attrs: { 'aria-pressed': 'false' } }) });
    assert.deepEqual(haptic.vibrate, [35]);
  });
  it('toggles follow the chosen intensity and go quiet when disabled', async () => {
    fb.setFeedbackLevels({ haptics: 'strong', sound: 'loud' });
    docListeners.click({ target: makeEl({ classes: ['toggle-opt'] }) });
    assert.deepEqual(haptic.vibrate, [56]);
    assert.deepEqual(tones, [740, 1480]);
    await wait(GAP);
    haptic.vibrate.length = 0; tones.length = 0;
    fb.setFeedbackLevels({ haptics: 'off', sound: 'off' });
    docListeners.click({ target: makeEl({ classes: ['toggle-opt'] }) });
    assert.equal(haptic.vibrate.length + vibrations.length + tones.length, 0);
  });
  it('installing twice does not double up', () => {
    assert.equal(fb.installControlFeedback({ addEventListener() { throw new Error('should not attach'); } }), false);
  });
});

describe('Android helper for system touch haptics', () => {
  const calls = [];
  const helper = (info = { hasVibrator: true, touchFeedback: true, ringerMode: 'normal' }) => ({
    perform: (o) => { calls.push(o); return Promise.resolve({ ...info }); },
    status: () => Promise.resolve({ ...info })
  });
  const withHelper = (h = helper()) => { window.Capacitor = { Plugins: { Haptics: nativePlugin(), HapticFeedback: h } }; };
  beforeEach(async () => { await wait(650); await reset(); calls.length = 0; });

  it('runs alongside the plugin vibrate pulse for every cue', () => {
    withHelper();
    fb.dialogFeedback('open', 'success');
    assert.equal(calls.length, 1);
    assert.deepEqual(haptic.vibrate, [40]);
    assert.equal(calls[0].duration, 40);
  });
  it('asks for the right system effect for each kind of cue', async () => {
    withHelper();
    const expect = [
      [['open', 'success'], 'medium', 'confirm'],
      [['open', 'error'], 'medium', 'reject'],
      [['select'], 'medium', 'tick'],
      [['confirm', 'warning'], 'medium', 'tap'],
      [['confirm', 'danger'], 'medium', 'long'],
      [['select'], 'extreme', 'long'],
      [['open', 'error'], 'light', 'tick']
    ];
    for (const [args, level, kind] of expect) {
      fb.setFeedbackLevels({ haptics: level });
      calls.length = 0;
      fb.dialogFeedback(...args);
      assert.equal(calls[0].kind, kind, `${args.join('/')} at ${level}`);
      await wait(GAP);
    }
  });
  it('still works when only the helper is present', async () => {
    window.Capacitor = { Plugins: { HapticFeedback: helper() } };
    fb.dialogFeedback('open', 'primary');
    assert.equal(calls.length, 1);
    assert.equal(await fb.testHaptics(), 'native');
    assert.equal(calls.length, 2);
  });
  it('a failing helper never blocks the plugin vibrate pulses', async () => {
    window.Capacitor = { Plugins: { Haptics: nativePlugin(), HapticFeedback: { perform: () => Promise.reject(new Error('x')), status: () => Promise.reject(new Error('x')) } } };
    fb.dialogFeedback('open', 'primary');
    await wait(10);
    assert.deepEqual(haptic.vibrate, [40]);
    assert.equal(await fb.testHaptics(), 'native');
  });
  it('a helper that throws synchronously never blocks the pulses either', async () => {
    window.Capacitor = { Plugins: { Haptics: nativePlugin(), HapticFeedback: { perform: () => { throw new Error('boom'); } } } };
    fb.dialogFeedback('open', 'primary');
    await wait(10);
    assert.deepEqual(haptic.vibrate, [40]);
  });
  it('is not used on iOS', () => {
    window.Capacitor = { getPlatform: () => 'ios', Plugins: { Haptics: nativePlugin(), HapticFeedback: helper() } };
    fb.dialogFeedback('open', 'success');
    assert.equal(calls.length, 0);
  });
  it('is not used when haptics are disabled', () => {
    withHelper();
    fb.setFeedbackLevels({ haptics: 'off' });
    fb.dialogFeedback('open', 'success');
    assert.equal(calls.length, 0);
  });
});

describe('plain-language reasons when vibration is blocked', () => {
  beforeEach(async () => { await wait(650); await reset(); });
  it('names each blocker', () => {
    assert.match(fb.hapticBlocker({ hasVibrator: false }), /no vibration motor/);
    assert.match(fb.hapticBlocker({ hasVibrator: true, ringerMode: 'silent' }), /silent mode/);
    assert.match(fb.hapticBlocker({ hasVibrator: true, ringerMode: 'normal', touchFeedback: false }), /Touch vibration is turned off/);
    assert.equal(fb.hapticBlocker({ hasVibrator: true, ringerMode: 'vibrate', touchFeedback: true }), null);
    assert.equal(fb.hapticBlocker(null), null);
  });
  it('the most basic blocker wins when several apply', () => {
    assert.match(fb.hapticBlocker({ hasVibrator: false, ringerMode: 'silent', touchFeedback: false }), /no vibration motor/);
    assert.match(fb.hapticBlocker({ hasVibrator: true, ringerMode: 'silent', touchFeedback: false }), /silent mode/);
  });
  it('describeResult prefers the blocker over a generic success message', () => {
    assert.match(fb.describeResult('haptics', 'native', { hasVibrator: true, ringerMode: 'silent' }), /silent mode/);
    assert.match(fb.describeResult('haptics', 'browser', { hasVibrator: true, ringerMode: 'normal', touchFeedback: true }), /signal sent/);
    assert.match(fb.describeResult('haptics', 'unsupported', { hasVibrator: false }), /does not support vibration/);
    assert.match(fb.describeResult('sound', 'played', { hasVibrator: false }), /media volume/);
  });
  it('the Test button shows the real reason on a silenced phone', async () => {
    window.Capacitor = { Plugins: { Haptics: nativePlugin(), HapticFeedback: { perform: () => Promise.resolve({ hasVibrator: true, touchFeedback: true, ringerMode: 'silent' }), status: () => Promise.resolve({ hasVibrator: true, touchFeedback: true, ringerMode: 'silent' }) } } };
    const els = { 'fb-haptics-status': { textContent: '' } };
    document.getElementById = (id) => els[id] || null;
    assert.equal(await fb.previewFeedback('haptics'), 'native');
    assert.match(els['fb-haptics-status'].textContent, /silent mode/);
  });
  it('opening the screen warns up front, without pressing Test', async () => {
    window.Capacitor = { Plugins: { HapticFeedback: { perform: () => Promise.resolve({}), status: () => Promise.resolve({ hasVibrator: true, touchFeedback: false, ringerMode: 'normal' }) } } };
    const els = { 'fb-haptics-status': { textContent: '' }, 'fb-haptics-title': { textContent: '' }, 'fb-haptics-desc': { textContent: '' }, 'fb-sound-title': { textContent: '' }, 'fb-sound-desc': { textContent: '' } };
    document.getElementById = (id) => els[id] || null;
    fb.syncFeedbackSettings();
    await wait(10);
    assert.match(els['fb-haptics-status'].textContent, /Touch vibration is turned off/);
  });
  it('opening the screen on a healthy phone leaves the status line alone', async () => {
    window.Capacitor = { Plugins: { HapticFeedback: { perform: () => Promise.resolve({}), status: () => Promise.resolve({ hasVibrator: true, touchFeedback: true, ringerMode: 'normal' }) } } };
    const els = { 'fb-haptics-status': { textContent: 'keep' }, 'fb-haptics-title': { textContent: '' }, 'fb-haptics-desc': { textContent: '' }, 'fb-sound-title': { textContent: '' }, 'fb-sound-desc': { textContent: '' } };
    document.getElementById = (id) => els[id] || null;
    fb.syncFeedbackSettings();
    await wait(10);
    assert.equal(els['fb-haptics-status'].textContent, 'keep');
  });
  it('without the helper (browser) there is nothing to refresh', async () => {
    window.Capacitor = null;
    assert.equal(await fb.refreshHapticDiagnostics(), null);
  });
});
