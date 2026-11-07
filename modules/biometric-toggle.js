import { sqliteStore } from './business.js';
import { BiometricAuth } from './utilities-payments.js';
import { showGlassConfirm, showToast } from './customers.js';
import { _bioIsOn, syncBiometricButton } from './app-lock.js';

export async function toggleBiometricLock() {
let on = false;
try { on = _bioIsOn(await sqliteStore.get('bio_enabled')); } catch (_) {}
if (on) await disableBiometricLock();
else await enableBiometricLock();
await syncBiometricButton();
}
export async function enableBiometricLock() {
try {
const success = await BiometricAuth.register("Manager");
if (success) {
if (window.__setBioHint) window.__setBioHint(true);
showToast("Biometric Lock Enabled! ", "success");
await syncBiometricButton();
}
} catch (e) {
if (!(e && e.name === 'NotAllowedError')) showToast("Setup failed: " + e.message, "error");
}
}
export async function disableBiometricLock() {
const _bioMsg = `Remove the biometric (fingerprint / Face ID) lock from this app?\n\nAfter removal:\n • Anyone with access to this device can open the app without biometric verification\n • To re-enable, tap Fingerprint Lock in the sidebar again\n\nYour data will not be affected.`;
if (await showGlassConfirm(_bioMsg, { title: "Remove Biometric Lock", confirmText: "Remove Lock", danger: true })) {
await sqliteStore.set('bio_enabled', 'false');
await sqliteStore.remove('bio_cred_id');
window.__appLocked = false;
if (window.__setBioHint) window.__setBioHint(false);
try { await sqliteStore.flush(); } catch (_) {}
await syncBiometricButton();
}
}
window.enableBiometricLock = enableBiometricLock;
window.disableBiometricLock = disableBiometricLock;
window.toggleBiometricLock = toggleBiometricLock;
