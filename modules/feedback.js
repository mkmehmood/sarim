const STORAGE_KEY = 'gznd_dialog_feedback';
const MIN_GAP_MS = 60;
const MIN_PULSE_MS = 20;
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
  { value: 'extreme', label: 'Extreme Boost (Maximum)', desc: '100% volume dual acoustic burst - clears freely & loudly' }
];

const DEFAULTS = { haptics: 'medium', sound: 'crisp' };
const LEVELS = { haptics: HAPTIC_LEVELS, sound: SOUND_LEVELS };

const state = { haptics: DEFAULTS.haptics, sound: DEFAULTS.sound, loaded: false };
let audioCtx = null;
let lastKey = '';
let lastAt = 0;

const HAPTICS = {
  open: {
    primary: { impact: 'LIGHT', vibe: 25 },
    success: { notify: 'SUCCESS', vibe: [25, 45, 35] },
    warning: { notify: 'WARNING', vibe: [35, 55, 35] },
    danger: { notify: 'WARNING', vibe: [40, 55, 40] },
    error: { notify: 'ERROR', vibe: [45, 50, 45, 50, 45] }
  },
  confirm: {
    primary: { impact: 'LIGHT', vibe: 25 },
    success: { impact: 'LIGHT', vibe: 25 },
    warning: { impact: 'MEDIUM', vibe: 35 },
    danger: { impact: 'HEAVY', vibe: 60 },
    error: { impact: 'MEDIUM', vibe: 35 }
  },
  cancel: { impact: 'LIGHT', vibe: 20 },
  select: { impact: 'LIGHT', vibe: 22 },
  reject: { notify: 'ERROR', vibe: [45, 50, 45] },
  toggleOn: { notify: 'SUCCESS', vibe: [22, 40, 32] },
  toggleOff: { impact: 'LIGHT', vibe: 20 }
};

const SOUNDS = {
  open: {
    primary: [[660, 0.07]],
    success: [[523, 0.09], [784, 0.12]],
    warning: [[466, 0.09], [466, 0.09]],
    danger: [[392, 0.1], [330, 0.14]],
    error: [[392, 0.1], [311, 0.16]]
  },
  confirm: {
    primary: [[880, 0.07]],
    success: [[880, 0.07]],
    warning: [[740, 0.07]],
    danger: [[392, 0.09]],
    error: [[740, 0.07]]
  },
  cancel: [[494, 0.06]],
  select: [[740, 0.05]],
  reject: [[311, 0.09], [311, 0.09]],
  toggleOn: [[587, 0.07], [880, 0.1]],
  toggleOff: [[880, 0.06], [587, 0.09]]
};

const SOUND_PROFILES = {
  soft: { gain: 0.1, wave: 'sine', partial: 0, bursts: 1 },
  crisp: { gain: 0.28, wave: 'triangle', partial: 0, bursts: 1 },
  loud: { gain: 0.5, wave: 'triangle', partial: 0.18, bursts: 1 },
  extreme: { gain: 0.7, wave: 'triangle', partial: 0.25, bursts: 2 }
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

async function runHaptic(spec) {
  if (!spec) return 'off';
  const plugin = nativeHaptics();
  if (plugin) {
    try {
      await nativeCall(plugin, spec);
      if (spec.repeat === 2 && typeof plugin.impact === 'function') {
        await pause(DOUBLE_PULSE_GAP_MS);
        await plugin.impact({ style: 'HEAVY' });
      }
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
  for (let burst = 0; burst < profile.bursts; burst += 1) {
    notes.forEach(([freq, dur]) => {
      tone(ctx, freq, t, dur, profile.gain, profile.wave);
      if (profile.partial) tone(ctx, freq * 2, t, dur, profile.partial, profile.wave);
      t += dur + 0.03;
    });
    t += 0.04;
  }
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
    native: 'Vibration is working on this device.',
    browser: 'Vibration is working on this device.',
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

export function describeResult(channel, result) {
  const table = STATUS_TEXT[channel];
  return (table && table[result]) || 'The test could not run on this device.';
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
