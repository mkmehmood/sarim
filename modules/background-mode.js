import { sqliteStore } from './business.js';
import { showGlassConfirm, showToast } from './customers.js';

const KEY = 'backgroundMode';

export function isAndroidApp() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform() && typeof c.getPlatform === 'function' && c.getPlatform() === 'android');
}

export function isDesktopApp() {
  return typeof window !== 'undefined' && !!window.__desktopApp;
}

function plugin() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  const p = c && c.Plugins && c.Plugins.BackgroundMode;
  return p && typeof p.start === 'function' ? p : null;
}

export function backgroundLabel(on) {
  return on ? 'Background: On' : 'Background: Off';
}

export function startupLabel(on) {
  return on ? 'Start with Computer: On' : 'Start with Computer: Off';
}

export async function isBackgroundOn() {
  try { return (await sqliteStore.get(KEY)) !== false; } catch (_) { return true; }
}

export async function applyBackgroundMode() {
  const p = plugin();
  if (!isAndroidApp() || !p) return null;
  try {
    return (await isBackgroundOn()) ? await p.start() : await p.stop();
  } catch (e) {
    console.warn('[background] could not apply:', (e && e.message) || e);
    return null;
  }
}

export async function toggleBackgroundMode() {
  const p = plugin();
  if (!isAndroidApp() || !p) return;
  const next = !(await isBackgroundOn());
  try { await sqliteStore.set(KEY, next); } catch (_) {}
  const status = await applyBackgroundMode();
  await syncBackgroundButtons();
  if (!next) { showToast('Background mode is off', 'info', 2200); return; }
  showToast('Background mode is on', 'success', 2200);
  if (status && status.batteryExempt === false) {
    const ok = await showGlassConfirm(
      'Some phones still stop the app after a while to save battery.\n\nAllow Gull & Zubair to run without battery restrictions so it keeps working with the screen off?',
      { title: 'Keep It Running', confirmText: 'Open Settings', cancelText: 'Not Now' }
    );
    if (ok) { try { await p.requestBatteryExemption(); } catch (_) {} }
  }
}

export async function toggleStartWithComputer() {
  const d = typeof window !== 'undefined' ? window.__desktopStartup : null;
  if (!isDesktopApp() || !d) return;
  try {
    const now = await d.get();
    await d.set(!now);
  } catch (e) { console.warn('[background] startup toggle failed:', (e && e.message) || e); }
  await syncBackgroundButtons();
}

export async function syncBackgroundButtons() {
  const bg = document.getElementById('bg-mode-btn');
  const st = document.getElementById('startup-btn');
  const android = isAndroidApp() && !!plugin();
  const desktop = isDesktopApp() && !!window.__desktopStartup;
  if (bg) {
    bg.classList.toggle('d-none', !android);
    if (android) {
      const label = document.getElementById('bg-mode-label');
      if (label) label.textContent = backgroundLabel(await isBackgroundOn());
    }
  }
  if (st) {
    st.classList.toggle('d-none', !desktop);
    if (desktop) {
      const label = document.getElementById('startup-label');
      let on = false;
      try { on = !!(await window.__desktopStartup.get()); } catch (_) {}
      if (label) label.textContent = startupLabel(on);
    }
  }
}

if (typeof window !== 'undefined') {
  window.toggleBackgroundMode = toggleBackgroundMode;
  window.toggleStartWithComputer = toggleStartWithComputer;
  window.syncBackgroundButtons = syncBackgroundButtons;
  window.applyBackgroundMode = applyBackgroundMode;
  if (isAndroidApp()) {
    setTimeout(() => { applyBackgroundMode().catch(() => {}); }, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') applyBackgroundMode().catch(() => {});
    });
  }
}
