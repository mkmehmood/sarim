import { sqliteStore } from './business.js';
import { BiometricAuth } from './utilities-payments.js';

export const _bioIsOn = (v) => v === true || v === 'true';
export async function syncBiometricButton() {
const btn = document.getElementById('bio-toggle-btn');
if (!btn) return;
let on = false;
try { on = _bioIsOn(await sqliteStore.get('bio_enabled')); } catch (_) {}
const lbl = document.getElementById('bio-toggle-label');
if (lbl) lbl.textContent = on ? 'Disable Fingerprint Lock' : 'Enable Fingerprint Lock';
btn.classList.toggle('active', on);
btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
export async function checkBiometricLock() {
const isEnabled = await sqliteStore.get('bio_enabled');
syncBiometricButton();
const resolved = () => { window.__lockResolved = true; if (typeof window.__splashTryHide === 'function') window.__splashTryHide(); };
if (!(isEnabled === 'true' || isEnabled === true)) { window.__appLocked = false; if (window.__setBioHint) window.__setBioHint(false); resolved(); return; }
if (window.__setBioHint) window.__setBioHint(true);
const splash = document.getElementById('splash-screen');
if (!splash) { resolved(); return; }
window.__appLocked = true;
window.__lockResolved = true;
splash.classList.add('splash-locked');
const isNativeApp = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const whenSettled = () => new Promise(resolve => {
const started = Date.now();
const ready = () => window.__splashPainted && (!isNativeApp || window.__nativeSplashHidden);
const tick = () => {
if (ready() || Date.now() - started > 3000) { setTimeout(resolve, 350); return; }
setTimeout(tick, 60);
};
tick();
});
let busy = false;
let failures = 0;
let retryTimer = null;
const scheduleRetry = (delay) => {
if (retryTimer) clearTimeout(retryTimer);
retryTimer = setTimeout(() => { retryTimer = null; unlock(); }, delay);
};
const unlock = async () => {
if (busy || !window.__appLocked) return;
busy = true;
try {
await BiometricAuth.authenticate();
window.__appLocked = false;
failures = 0;
if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
splash.classList.remove('splash-locked');
splash.classList.add('splash-out');
window.setStyle(splash, 'pointer-events', 'st-pointer-events__8b1364');
if (window.__restoreThemeColor) window.__restoreThemeColor();
setTimeout(() => { window.setDisplay(splash, 'none'); }, 620);
} catch (e) {
const errName = e && e.name ? e.name : '';
failures++;
if (errName !== 'NotAllowedError' && failures === 1) {
window.notifyBlocking((e && e.message) ? e.message : 'Authentication failed', 'error', 'Something went wrong');
}
if (failures < 5) scheduleRetry(errName === 'NotAllowedError' ? 1200 : 2000);
} finally {
busy = false;
}
};
window.triggerUnlock = unlock;
if (!splash.__unlockBound) {
splash.__unlockBound = true;
document.addEventListener('visibilitychange', () => {
if (document.visibilityState === 'visible' && window.__appLocked) { failures = 0; scheduleRetry(250); }
});
}
whenSettled().then(unlock);
}
window.syncBiometricButton = syncBiometricButton;
window.checkBiometricLock = checkBiometricLock;
