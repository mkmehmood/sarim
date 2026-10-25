const ALWAYS_VISIBLE = new Set(['sidebar-btn-sync', 'sidebar-btn-recycle', 'sidebar-btn-theme']);
export function prepareSettingsScreen() {
  const screen = document.getElementById('settings-screen');
  if (!screen) return;
  const admin = (window.appMode || 'admin') === 'admin';
  screen.querySelectorAll('.sidebar-item').forEach((b) => {
    b.classList.toggle('d-none', !admin && !ALWAYS_VISIBLE.has(b.id));
  });
  screen.querySelectorAll('.liquid-card').forEach((card) => {
    const anyShown = Array.from(card.querySelectorAll('.sidebar-item')).some((b) => !b.classList.contains('d-none'));
    card.classList.toggle('d-none', !anyShown);
  });
  if (typeof window.syncBiometricButton === 'function') window.syncBiometricButton();
}
window.prepareSettingsScreen = prepareSettingsScreen;
export function closeSettingsScreen() {
  if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('settings-screen');
}
window.closeSettingsScreen = closeSettingsScreen;
