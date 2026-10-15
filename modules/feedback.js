const STORAGE_KEY = 'gznd_dialog_feedback';
const MIN_GAP_MS = 60;

const state = { sound: true, haptics: true, loaded: false };
let audioCtx = null;
let lastKey = '';
let lastAt = 0;

const HAPTICS = {
  open: {
    primary: { impact: 'LIGHT', vibe: 10 },
    success: { notify: 'SUCCESS', vibe: [12, 40, 18] },
    warning: { notify: 'WARNING', vibe: [20, 50, 20] },
    danger: { notify: 'WARNING', vibe: [25, 45, 25] },
    error: { notify: 'ERROR', vibe: [30, 40, 30, 40, 30] }
  },
  confirm: {
    primary: { impact: 'LIGHT', vibe: 12 },
    success: { impact: 'LIGHT', vibe: 12 },
    warning: { impact: 'MEDIUM', vibe: 18 },
    danger: { impact: 'HEAVY', vibe: 35 },
    error: { impact: 'MEDIUM', vibe: 18 }
  },
  cancel: { impact: 'LIGHT', vibe: 8 },
  select: { impact: 'LIGHT', vibe: 10 },
  reject: { notify: 'ERROR', vibe: [30, 40, 30] }
};

const SOUNDS = {
  open: {
    primary: [[660, 0.05]],
    success: [[523, 0.07], [784, 0.1]],
    warning: [[440, 0.07], [440, 0.07]],
    danger: [[247, 0.08], [196, 0.11]],
    error: [[196, 0.09], [147, 0.13]]
  },
  confirm: {
    primary: [[880, 0.05]],
    success: [[880, 0.05]],
    warning: [[740, 0.05]],
    danger: [[330, 0.07]],
    error: [[740, 0.05]]
  },
  cancel: [[392, 0.04]],
  select: [[740, 0.035]],
  reject: [[165, 0.08], [165, 0.08]]
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

function nativeHaptics() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return cap && cap.Plugins && cap.Plugins.Haptics ? cap.Plugins.Haptics : null;
  } catch (_) { return null; }
}

function playHaptic(spec) {
  if (!spec) return;
  const plugin = nativeHaptics();
  try {
    if (plugin) {
      if (spec.notify && typeof plugin.notification === 'function') { plugin.notification({ type: spec.notify }); return; }
      if (spec.impact && typeof plugin.impact === 'function') { plugin.impact({ style: spec.impact }); return; }
    }
  } catch (_) {}
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(spec.vibe);
  } catch (_) {}
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

function playSound(notes) {
  if (!notes || !notes.length) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      const resumed = ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
    let t = ctx.currentTime + 0.005;
    notes.forEach(([freq, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur + 0.03;
    });
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
  window.testDialogFeedback = () => dialogFeedback('open', 'success');
}
