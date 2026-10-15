const STORAGE_KEY = 'gznd_dialog_feedback';
const MIN_GAP_MS = 60;
const PEAK_GAIN = 0.28;

const state = { sound: true, haptics: true, loaded: false };
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

function load() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.sound === 'boolean') state.sound = saved.sound;
    if (typeof saved.haptics === 'boolean') state.haptics = saved.haptics;
  } catch (_) {}
}

export function getDialogFeedback() {
  load();
  return { sound: state.sound, haptics: state.haptics };
}

export function setDialogFeedback(next) {
  load();
  if (next && typeof next.sound === 'boolean') state.sound = next.sound;
  if (next && typeof next.haptics === 'boolean') state.haptics = next.haptics;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sound: state.sound, haptics: state.haptics })); } catch (_) {}
  return getDialogFeedback();
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
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(spec.vibe);
  } catch (_) {}
}

function playHaptic(spec) {
  if (!spec) return;
  const plugin = nativeHaptics();
  if (plugin) {
    try {
      let result = null;
      if (spec.notify && typeof plugin.notification === 'function') result = plugin.notification({ type: spec.notify });
      else if (spec.impact && typeof plugin.impact === 'function') result = plugin.impact({ style: spec.impact });
      else { vibrateFallback(spec); return; }
      if (result && typeof result.catch === 'function') result.catch(() => vibrateFallback(spec));
      return;
    } catch (_) {}
  }
  vibrateFallback(spec);
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

function scheduleNotes(ctx, notes) {
  let t = ctx.currentTime + 0.005;
  notes.forEach(([freq, dur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur + 0.03;
  });
}

function playSound(notes) {
  if (!notes || !notes.length) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'running' || typeof ctx.resume !== 'function') { scheduleNotes(ctx, notes); return; }
    Promise.resolve(ctx.resume()).then(() => scheduleNotes(ctx, notes)).catch(() => {});
  } catch (_) {}
}

export function dialogFeedback(kind, tone = 'primary') {
  try {
    load();
    const key = `${kind}:${tone}`;
    const now = Date.now();
    if (key === lastKey && now - lastAt < MIN_GAP_MS) return;
    lastKey = key;
    lastAt = now;
    if (state.haptics) playHaptic(hapticFor(kind, tone));
    if (state.sound) playSound(soundFor(kind, tone));
  } catch (_) {}
}

export function toggleFeedback(channel, on) {
  try {
    load();
    if (channel !== 'sound' && channel !== 'haptics') return getDialogFeedback();
    const kind = on ? 'toggleOn' : 'toggleOff';
    if (channel === 'haptics' || state.haptics) playHaptic(hapticFor(kind));
    if (channel === 'sound' || state.sound) playSound(soundFor(kind));
  } catch (_) {}
  return setDialogFeedback({ [channel]: !!on });
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

async function testHaptics() {
  if (!state.haptics) return 'off';
  const plugin = nativeHaptics();
  if (plugin && typeof plugin.notification === 'function') {
    try { await plugin.notification({ type: 'SUCCESS' }); return 'native'; } catch (_) {}
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate([30, 40, 50]) ? 'browser' : 'blocked';
    }
  } catch (_) {}
  return 'unsupported';
}

async function testSound() {
  if (!state.sound) return 'off';
  const ctx = getAudioContext();
  if (!ctx) return 'unsupported';
  try { if (ctx.state !== 'running' && typeof ctx.resume === 'function') await ctx.resume(); } catch (_) {}
  if (ctx.state !== 'running') return 'blocked';
  try { scheduleNotes(ctx, soundFor('open', 'success')); } catch (_) { return 'blocked'; }
  return 'played';
}

export async function testFeedback() {
  load();
  const [haptics, sound] = await Promise.all([testHaptics(), testSound()]);
  return { haptics, sound };
}

const HAPTIC_TEXT = {
  native: 'Vibration: working',
  browser: 'Vibration: working',
  blocked: 'Vibration: blocked. Tap again, and check the phone\'s system vibration setting',
  unsupported: 'Vibration: not supported on this device or browser',
  off: 'Vibration: switched off above'
};
const SOUND_TEXT = {
  played: 'Sound: played. If you heard nothing, raise the media volume',
  blocked: 'Sound: blocked by the browser. Tap the screen and try again',
  unsupported: 'Sound: not supported on this device or browser',
  off: 'Sound: switched off above'
};

export function describeFeedbackTest(result) {
  return `${HAPTIC_TEXT[result.haptics] || HAPTIC_TEXT.unsupported}. ${SOUND_TEXT[result.sound] || SOUND_TEXT.unsupported}.`;
}

export async function runFeedbackTest() {
  const out = typeof document !== 'undefined' ? document.getElementById('fb-status') : null;
  if (out) out.textContent = 'Testing...';
  let text;
  try { text = describeFeedbackTest(await testFeedback()); } catch (_) { text = 'The test could not run on this device.'; }
  if (out) out.textContent = text;
  return text;
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

export function syncFeedbackToggles() {
  if (typeof document === 'undefined') return;
  const cur = getDialogFeedback();
  const s = document.getElementById('fb-sound');
  const h = document.getElementById('fb-haptics');
  if (s) s.checked = cur.sound;
  if (h) h.checked = cur.haptics;
}

if (typeof window !== 'undefined') {
  window.getDialogFeedback = getDialogFeedback;
  window.setDialogFeedback = setDialogFeedback;
  window.syncFeedbackToggles = syncFeedbackToggles;
  window.toggleFeedback = toggleFeedback;
  window.runFeedbackTest = runFeedbackTest;
  window.testDialogFeedback = () => dialogFeedback('open', 'success');
}
