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

const _bootAt = Date.now();
const _STARTUP_QUIET_MS = 25000;
const _BURST_MAX = 4;
const _BURST_WINDOW_MS = 30000;
let _burst = [];
const _NOISE_RE = new RegExp([
  '^\\s*(please|enter|select|choose|add at least|no .* (selected|found|data)|nothing)',
  '\\b(is|are) required\\b',
  '\\bcannot be (edited|deleted|toggled|negative)\\b',
  '\\b(invalid|valid) (date|amount|quantity|name|number|phone|input)\\b',
  '^\\s*access denied',
  'not logged in|please sign in',
  'cancel(l)?ed',
  'welcome',
  'loading|syncing|sync (started|complete)|preparing|generating|opening|checking|connecting',
  'shared|copied|downloaded|uploaded|exported|saved to|saved as|pdf|image',
  'back online|you are offline|offline mode|connection restored',
  'refreshed|updated successfully!?$'
].join('|'), 'i');
const _TITLES = { success: 'Done', warning: 'Warning', error: 'Error' };

function _cleanToastText(message) {
  let t = String(message == null ? '' : message).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[^\p{L}\p{N}"'(]+/u, '').trim();
  return t.length > 180 ? t.slice(0, 177) + '\u2026' : t;
}

export function notifyFromToast(message, type) {
  try {
    if (type !== 'success' && type !== 'warning' && type !== 'error') return;
    try { if (localStorage.getItem('toastNotifications') === 'off') return; } catch (_) {}
    if (Date.now() - _bootAt < _STARTUP_QUIET_MS) return;
    const text = _cleanToastText(message);
    if (!text || text.length < 6) return;
    if (type !== 'error' && _NOISE_RE.test(text)) return;
    if (type === 'error' && /^\s*(please|enter|select)|\b(is|are) required\b|not logged in/i.test(text)) return;
    const now = Date.now();
    _burst = _burst.filter(ts => now - ts < _BURST_WINDOW_MS);
    if (_burst.length >= _BURST_MAX) return;
    _burst.push(now);
    sendDeviceNotification(_TITLES[type], text, 'toast-' + type).catch(() => {});
  } catch (_) {}
}
window.notifyFromToast = notifyFromToast;
primeNotificationPermission();
