export function isDesktopApp() {
  return typeof window !== 'undefined' && !!window.__desktopApp;
}

export function startupLabel(on) {
  return on ? 'Start with Computer: On' : 'Start with Computer: Off';
}

export async function toggleStartWithComputer() {
  const d = typeof window !== 'undefined' ? window.__desktopStartup : null;
  if (!isDesktopApp() || !d) return;
  try {
    const now = await d.get();
    await d.set(!now);
  } catch (e) { console.warn('[desktop] startup toggle failed:', (e && e.message) || e); }
  await syncStartupButton();
}

export async function syncStartupButton() {
  const st = document.getElementById('startup-btn');
  if (!st) return;
  const desktop = isDesktopApp() && !!window.__desktopStartup;
  st.classList.toggle('d-none', !desktop);
  if (!desktop) return;
  const label = document.getElementById('startup-label');
  let on = false;
  try { on = !!(await window.__desktopStartup.get()); } catch (_) {}
  if (label) label.textContent = startupLabel(on);
}

if (typeof window !== 'undefined') {
  window.toggleStartWithComputer = toggleStartWithComputer;
  window.syncStartupButton = syncStartupButton;
}
