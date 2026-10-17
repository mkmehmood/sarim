const STORAGE_KEY = 'gznd_dialog_feedback';
const MIN_GAP_MS = 60;
const MIN_PULSE_MS = 30;
const DOUBLE_PULSE_GAP_MS = 80;

export const HAPTIC_LEVELS = [
  { value: 'off', label: 'Disabled', desc: 'No haptic vibration' },
  { value: 'light', label: 'Light', desc: 'Subtle haptic tick sensation' },
  { value: 'medium', label: 'Medium', desc: 'Balanced standard tactile click' },
  { value: 'strong', label: 'Strong', desc: 'Heavy tactile vibration pulse' },
  { value: 'extreme', label: 'Extreme', desc: 'Maximum dual-pulse hardware vibration' }
];

export const SOUND_LEVELS = [
  { value: 'off', label: 'Muted', desc: 'Silent mode without audio clicks' },
  { value: 'soft', label: 'Soft (Discreet)', desc: 'Quiet acoustic tick sound' },
  { value: 'crisp', label: 'Standard (Crisp)', desc: 'Crisp digital audio click' },
  { value: 'loud', label: 'Loud (Resonant)', desc: 'High-resonance tactile chime' },
  { value: 'extreme', label: 'Extreme Boost (Maximum)', desc: '100% volume acoustic burst - clears freely & loudly' }
];

const DEFAULTS = { haptics: 'medium', sound: 'crisp' };
const LEVELS = { haptics: HAPTIC_LEVELS, sound: SOUND_LEVELS };

const state = { haptics: DEFAULTS.haptics, sound: DEFAULTS.sound, loaded: false };
let audioCtx = null;
let lastKey = '';
let lastAt = 0;

const HAPTICS = {
  open: {
    primary: { impact: 'LIGHT', vibe: 40 },
    success: { notify: 'SUCCESS', vibe: [40, 50, 60] },
    warning: { notify: 'WARNING', vibe: [50, 60, 50] },
    danger: { notify: 'WARNING', vibe: [60, 60, 60] },
    error: { notify: 'ERROR', vibe: [70, 60, 70, 60, 70] }
  },
  confirm: {
    primary: { impact: 'LIGHT', vibe: 40 },
    success: { impact: 'LIGHT', vibe: 40 },
    warning: { impact: 'MEDIUM', vibe: 50 },
    danger: { impact: 'HEAVY', vibe: 90 },
    error: { impact: 'MEDIUM', vibe: 50 }
  },
  cancel: { impact: 'LIGHT', vibe: 30 },
  select: { impact: 'LIGHT', vibe: 35 },
  reject: { notify: 'ERROR', vibe: [70, 60, 70] },
  toggleOn: { notify: 'SUCCESS', vibe: [35, 50, 55] },
  toggleOff: { impact: 'LIGHT', vibe: 30 }
};

const SOUNDS = {
  open: {
    primary: [[660, 0.09]],
    success: [[784, 0.11]],
    warning: [[466, 0.11]],
    danger: [[392, 0.12]],
    error: [[330, 0.14]]
  },
  confirm: {
    primary: [[880, 0.08]],
    success: [[880, 0.08]],
    warning: [[740, 0.08]],
    danger: [[392, 0.1]],
    error: [[740, 0.08]]
  },
  cancel: [[494, 0.07]],
  select: [[740, 0.06]],
  reject: [[311, 0.12]],
  toggleOn: [[880, 0.09]],
  toggleOff: [[587, 0.09]]
};

const SOUND_PROFILES = {
  soft: { gain: 0.1, wave: 'sine', partial: 0 },
  crisp: { gain: 0.28, wave: 'triangle', partial: 0 },
  loud: { gain: 0.5, wave: 'triangle', partial: 0.18 },
  extreme: { gain: 0.7, wave: 'triangle', partial: 0.25 }
};

const IMPACT_ORDER = ['LIGHT', 'MEDIUM', 'HEAVY'];

export function normalizeLevel(channel, value) {
  const list = LEVELS[channel];
  if (!list) return null;
  if (typeof value === 'boolean') return value ? DEFAULTS[channel] : 'off';
  if (typeof value === 'string' && list.some((o) => o.value === value)) return value;
  return DEFAULTS[channel];
}

function load() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.haptics = normalizeLevel('haptics', saved.haptics);
    state.sound = normalizeLevel('sound', saved.sound);
  } catch (_) {}
}

export function getFeedbackLevels() {
  load();
  return { haptics: state.haptics, sound: state.sound };
}

export function setFeedbackLevels(next) {
  load();
  if (next) {
    ['haptics', 'sound'].forEach((channel) => {
      const v = next[channel];
      if (typeof v === 'string' && LEVELS[channel].some((o) => o.value === v)) state[channel] = v;
    });
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ haptics: state.haptics, sound: state.sound })); } catch (_) {}
  return getFeedbackLevels();
}

function pick(table, kind, tone) {
  const entry = table[kind];
  if (!entry) return null;
  if (Array.isArray(entry) || entry.impact || entry.notify) return entry;
  return entry[tone] || entry.primary || null;
}

export function hapticFor(kind, tone) {
  return pick(HAPTICS, kind, tone);
}

export function soundFor(kind, tone) {
  return pick(SOUNDS, kind, tone);
}

const bumpImpact = (style, steps) => IMPACT_ORDER[Math.max(0, Math.min(IMPACT_ORDER.length - 1, IMPACT_ORDER.indexOf(style || 'MEDIUM') + steps))];

const scalePattern = (vibe, factor) => (Array.isArray(vibe)
  ? vibe.map((ms, i) => (i % 2 === 0 ? Math.max(MIN_PULSE_MS, Math.round(ms * factor)) : ms))
  : Math.max(MIN_PULSE_MS, Math.round(vibe * factor)));

export function scaleHaptic(spec, level) {
  if (!spec || level === 'off') return null;
  if (level === 'light') return { impact: 'LIGHT', vibe: MIN_PULSE_MS };
  if (level === 'strong') {
    const out = { vibe: scalePattern(spec.vibe, 1.6) };
    if (spec.notify) out.notify = spec.notify;
    if (spec.impact) out.impact = bumpImpact(spec.impact, 1);
    return out;
  }
  if (level === 'extreme') {
    const once = scalePattern(spec.vibe, 2.2);
    const pattern = Array.isArray(once) ? once : [once];
    const out = { impact: 'HEAVY', vibe: [...pattern, DOUBLE_PULSE_GAP_MS, ...pattern], repeat: 2 };
    if (spec.notify) out.notify = spec.notify;
    return out;
  }
  return { ...spec };
}

let registeredHaptics = null;

function nativeHaptics() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins.Haptics) return cap.Plugins.Haptics;
    if (registeredHaptics) return registeredHaptics;
    const native = typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
    if (native && typeof cap.registerPlugin === 'function') registeredHaptics = cap.registerPlugin('Haptics');
    return registeredHaptics;
  } catch (_) { return null; }
}

function vibrateFallback(spec) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(spec.vibe) ? 'browser' : 'blocked';
    }
  } catch (_) {}
  return 'unsupported';
}

function nativeCall(plugin, spec) {
  if (spec.notify && typeof plugin.notification === 'function') return plugin.notification({ type: spec.notify });
  if (typeof plugin.impact === 'function') return plugin.impact({ style: spec.impact || 'MEDIUM' });
  return Promise.reject(new Error('no haptics'));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isIOS() {
  try {
    const cap = window.Capacitor;
    return !!(cap && typeof cap.getPlatform === 'function' && cap.getPlatform() === 'ios');
  } catch (_) { return false; }
}

async function playPulses(plugin, vibe) {
  const parts = Array.isArray(vibe) ? vibe : [vibe];
  for (let i = 0; i < parts.length; i += 2) {
    const duration = parts[i];
    await plugin.vibrate({ duration });
    if (i + 1 < parts.length) await pause(duration + parts[i + 1]);
  }
}

let lastDiag = null;

const rememberDiag = (info) => {
  if (info && typeof info === 'object') lastDiag = info;
};

function feedbackHelper() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    const helper = cap && cap.Plugins && cap.Plugins.HapticFeedback;
    return helper && typeof helper.perform === 'function' ? helper : null;
  } catch (_) { return null; }
}

function viewKind(spec) {
  if (spec.impact === 'HEAVY') return 'long';
  if (spec.notify === 'SUCCESS') return 'confirm';
  if (spec.notify) return 'reject';
  if (spec.impact === 'MEDIUM') return 'tap';
  return 'tick';
}

export function hapticBlocker(diag) {
  if (!diag) return null;
  if (diag.hasVibrator === false) return 'This phone reports no vibration motor, so vibration cannot work.';
  if (diag.ringerMode === 'silent') return 'The phone is in silent mode, which blocks app vibration on many phones. Switch to vibrate or normal mode and try again.';
  if (diag.touchFeedback === false) return 'Touch vibration is turned off in the phone settings (Sound & vibration, Touch feedback). Turn it on and try again.';
  return null;
}

async function runNative(plugin, helper, spec) {
  let helperDone = null;
  if (helper) {
    try {
      const first = Array.isArray(spec.vibe) ? spec.vibe[0] : spec.vibe;
      helperDone = Promise.resolve(helper.perform({ kind: viewKind(spec), duration: first })).then(rememberDiag, () => {});
    } catch (_) {}
  }
  if (plugin) {
    if (typeof plugin.vibrate === 'function' && !isIOS()) {
      await playPulses(plugin, spec.vibe);
    } else {
      await nativeCall(plugin, spec);
      if (spec.repeat === 2 && typeof plugin.impact === 'function') {
        await pause(DOUBLE_PULSE_GAP_MS);
        await plugin.impact({ style: 'HEAVY' });
      }
    }
  }
  if (helperDone) await helperDone;
}

async function runHaptic(spec) {
  if (!spec) return 'off';
  const plugin = nativeHaptics();
  const helper = isIOS() ? null : feedbackHelper();
  if (plugin || helper) {
    try {
      await runNative(plugin, helper, spec);
      return 'native';
    } catch (_) {}
  }
  return vibrateFallback(spec);
}

function playHaptic(spec) {
  runHaptic(spec).catch(() => {});
}

function getAudioContext() {
  if (audioCtx) return audioCtx;
  try {
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return null;
    audioCtx = new AC();
  } catch (_) { audioCtx = null; }
  return audioCtx;
}

function tone(ctx, freq, start, dur, peak, wave) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function scheduleNotes(ctx, notes, level) {
  const profile = SOUND_PROFILES[level] || SOUND_PROFILES.crisp;
  let t = ctx.currentTime + 0.005;
  notes.forEach(([freq, dur]) => {
    tone(ctx, freq, t, dur, profile.gain, profile.wave);
    if (profile.partial) tone(ctx, freq * 2, t, dur, profile.partial, profile.wave);
    t += dur + 0.03;
  });
}

function playSound(notes, level) {
  if (!notes || !notes.length || level === 'off') return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'running' || typeof ctx.resume !== 'function') { scheduleNotes(ctx, notes, level); return; }
    Promise.resolve(ctx.resume()).then(() => scheduleNotes(ctx, notes, level)).catch(() => {});
  } catch (_) {}
}

export function dialogFeedback(kind, toneName = 'primary') {
  try {
    load();
    const key = `${kind}:${toneName}`;
    const now = Date.now();
    if (key === lastKey && now - lastAt < MIN_GAP_MS) return;
    lastKey = key;
    lastAt = now;
    if (state.haptics !== 'off') playHaptic(scaleHaptic(hapticFor(kind, toneName), state.haptics));
    if (state.sound !== 'off') playSound(soundFor(kind, toneName), state.sound);
  } catch (_) {}
}

export async function testHaptics() {
  load();
  if (state.haptics === 'off') return 'off';
  return runHaptic(scaleHaptic(hapticFor('open', 'success'), state.haptics));
}

export async function testSound() {
  load();
  if (state.sound === 'off') return 'off';
  const ctx = getAudioContext();
  if (!ctx) return 'unsupported';
  try { if (ctx.state !== 'running' && typeof ctx.resume === 'function') await ctx.resume(); } catch (_) {}
  if (ctx.state !== 'running') return 'blocked';
  try { scheduleNotes(ctx, soundFor('open', 'success'), state.sound); } catch (_) { return 'blocked'; }
  return 'played';
}

const STATUS_TEXT = {
  haptics: {
    native: 'Vibration signal sent. If you felt nothing, check the phone\'s vibration and touch feedback settings, and Do Not Disturb.',
    browser: 'Vibration signal sent. If you felt nothing, check the phone\'s vibration and touch feedback settings, and Do Not Disturb.',
    blocked: 'Vibration was blocked. Tap again, and check the phone\'s system vibration setting.',
    unsupported: 'This device or browser does not support vibration.',
    off: 'Haptic feedback is disabled.'
  },
  sound: {
    played: 'Sound played. If you heard nothing, raise the media volume.',
    blocked: 'Sound was blocked by the browser. Tap the screen and try again.',
    unsupported: 'This device or browser does not support sound.',
    off: 'Sound is muted.'
  }
};

export function describeResult(channel, result, diag = lastDiag) {
  if (channel === 'haptics' && (result === 'native' || result === 'browser')) {
    const blocker = hapticBlocker(diag);
    if (blocker) return blocker;
  }
  const table = STATUS_TEXT[channel];
  return (table && table[result]) || 'The test could not run on this device.';
}

export async function refreshHapticDiagnostics() {
  const helper = feedbackHelper();
  if (!helper || typeof helper.status !== 'function') return null;
  try { rememberDiag(await helper.status()); } catch (_) {}
  return lastDiag;
}

export async function previewFeedback(channel) {
  if (channel !== 'haptics' && channel !== 'sound') return null;
  let result;
  try { result = channel === 'haptics' ? await testHaptics() : await testSound(); } catch (_) { result = null; }
  const out = typeof document !== 'undefined' ? document.getElementById(`fb-${channel}-status`) : null;
  if (out) out.textContent = describeResult(channel, result);
  return result;
}

export function syncFeedbackSettings() {
  if (typeof document === 'undefined') return;
  const current = getFeedbackLevels();
  ['haptics', 'sound'].forEach((channel) => {
    const option = LEVELS[channel].find((o) => o.value === current[channel]);
    const title = document.getElementById(`fb-${channel}-title`);
    const desc = document.getElementById(`fb-${channel}-desc`);
    if (title && option) title.textContent = option.label;
    if (desc && option) desc.textContent = option.desc;
  });
  refreshHapticDiagnostics().then(() => {
    const message = hapticBlocker(lastDiag);
    const out = document.getElementById('fb-haptics-status');
    if (out && message) out.textContent = message;
  }).catch(() => {});
}

export function openFeedbackLevelMenu(channel) {
  if (!LEVELS[channel] || typeof document === 'undefined') return false;
  const anchor = document.getElementById(`fb-${channel}-wrap`);
  if (!anchor || typeof window === 'undefined' || typeof window._mkPopover !== 'function') return false;
  const items = LEVELS[channel].map((o) => ({ value: o.value, label: o.label, desc: o.desc }));
  window._mkPopover(anchor, `_pop_fb_${channel}`, items, (value) => {
    setFeedbackLevels({ [channel]: value });
    syncFeedbackSettings();
    previewFeedback(channel);
  }, { fullWidth: true, selected: getFeedbackLevels()[channel] });
  return true;
}

function unlockAudio() {
  const ctx = getAudioContext();
  try {
    if (ctx && ctx.state !== 'running' && typeof ctx.resume === 'function') {
      const r = ctx.resume();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }
  } catch (_) {}
}

const OPTION_SELECTOR = '.toggle-opt, .production-toggle-btn, .metric-btn, .formula-toggle-opt, .status-toggle-btn, #sidebar-btn-theme';
const SEGMENT_SELECTOR = '.toggle-opt, .production-toggle-btn, .metric-btn, .formula-toggle-opt';
const CONTROL_SELECTOR = `${OPTION_SELECTOR}, [aria-pressed]`;

export function controlCue(target) {
  if (!target || typeof target.closest !== 'function') return null;
  if (target.closest('.dlg-overlay')) return null;
  const el = target.closest(CONTROL_SELECTOR);
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('data-feedback') === 'manual') return null;
  if (el.matches(OPTION_SELECTOR)) {
    const current = el.classList.contains('active') || el.getAttribute('aria-pressed') === 'true';
    if (current && el.matches(SEGMENT_SELECTOR)) return null;
    return 'select';
  }
  return el.getAttribute('aria-pressed') === 'true' ? 'toggleOff' : 'toggleOn';
}

export function inputCue(el) {
  if (!el || el.tagName !== 'INPUT' || el.disabled) return null;
  if (typeof el.getAttribute === 'function' && el.getAttribute('data-feedback') === 'manual') return null;
  if (el.type === 'checkbox') return el.checked ? 'toggleOn' : 'toggleOff';
  if (el.type === 'radio') return 'select';
  return null;
}

let controlsInstalled = false;

export function installControlFeedback(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (controlsInstalled || !d || typeof d.addEventListener !== 'function') return false;
  controlsInstalled = true;
  ['pointerdown', 'touchstart', 'keydown'].forEach((name) => d.addEventListener(name, unlockAudio, { capture: true, passive: true, once: true }));
  d.addEventListener('click', (e) => {
    try { const kind = controlCue(e.target); if (kind) dialogFeedback(kind); } catch (_) {}
  }, { capture: true, passive: true });
  d.addEventListener('change', (e) => {
    try { const kind = inputCue(e.target); if (kind) dialogFeedback(kind); } catch (_) {}
  }, { capture: true, passive: true });
  return true;
}

installControlFeedback();

if (typeof window !== 'undefined') {
  window.getFeedbackLevels = getFeedbackLevels;
  window.setFeedbackLevels = setFeedbackLevels;
  window.previewFeedback = previewFeedback;
  window.openFeedbackLevelMenu = openFeedbackLevelMenu;
  window.syncFeedbackSettings = syncFeedbackSettings;
}
