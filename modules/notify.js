const _plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};
const _isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
let _nativeGranted = null;
let _lastKey = '';
let _lastAt = 0;
let _seq = Date.now() % 1000000000;
async function _ensureNativePermission(LocalNotifications) {
  if (_nativeGranted !== null) return _nativeGranted;
  try {
    let status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') status = await LocalNotifications.requestPermissions();
    _nativeGranted = status.display === 'granted';
  } catch (_) {
    _nativeGranted = false;
  }
  return _nativeGranted;
}
async function _ensureWebPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch (_) { return false; }
}
async function _showWeb(title, body, tag) {
  if (!(await _ensureWebPermission())) return;
  const options = { body, tag, icon: '192.png', badge: '192.png', renotify: true };
  try {
    const reg = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) { await reg.showNotification(title, options); return; }
  } catch (_) {}
  try { new Notification(title, options); } catch (_) {}
}
async function _showNative(title, body) {
  const { LocalNotifications } = _plugins();
  if (!LocalNotifications) return;
  if (!(await _ensureNativePermission(LocalNotifications))) return;
  _seq = (_seq + 1) % 2147483000;
  try { await LocalNotifications.schedule({ notifications: [{ id: _seq, title, body, schedule: { at: new Date(Date.now() + 250) } }] }); } catch (_) {}
}
export async function sendDeviceNotification(title, body, tag) {
  const text = String(body == null ? '' : body).replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
  if (!text) return;
  const key = title + '|' + text;
  const now = Date.now();
  if (key === _lastKey && now - _lastAt < 2000) return;
  _lastKey = key;
  _lastAt = now;
  if (_isNative()) await _showNative(title, text);
  else await _showWeb(title, text, tag || 'app-toast');
}
export function primeNotificationPermission() {
  if (_isNative()) {
    const { LocalNotifications } = _plugins();
    if (LocalNotifications) _ensureNativePermission(LocalNotifications);
    return;
  }
  if ('Notification' in window && Notification.permission === 'default') {
    document.addEventListener('click', () => { _ensureWebPermission(); }, { once: true });
  }
}
window.sendDeviceNotification = sendDeviceNotification;
primeNotificationPermission();
