import { appMode, currentUser, dataRootRef } from './business.js';

export const PUSH_WORKER_URL = 'https://sarim-push.3mahmoodkhan.workers.dev/notify';
const DEVICE_KEY = 'sarimPushDeviceId';
const NOTIFY_GAP_MS = 15000;
const RETRY_DELAYS_MS = [0, 3000, 8000];

let _listening = false;
let _tapListening = false;
let _lastNotifyAt = 0;
let _tokenDocId = null;

export function pushDocId(uid, deviceId) {
  return `${uid}_${deviceId}`;
}

export function isAndroidPushApp() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  const ok = !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()
    && typeof c.getPlatform === 'function' && c.getPlatform() === 'android');
  return ok && !!pushPlugin();
}

function pushPlugin() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  const p = c && c.Plugins && c.Plugins.PushNotifications;
  return p && typeof p.register === 'function' ? p : null;
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) { return 'device'; }
}

export function openApprovalsFromPush(action) {
  const data = action && action.notification && action.notification.data;
  const id = data && data.pendingId ? String(data.pendingId) : null;
  if (typeof window.openApprovalFromPush === 'function') { window.openApprovalFromPush(id); return; }
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('approvals-screen');
  if (typeof window.renderApprovals === 'function') window.renderApprovals();
}

function ensureTapListener() {
  if (_tapListening) return;
  const p = pushPlugin();
  if (!p || typeof p.addListener !== 'function') return;
  _tapListening = true;
  p.addListener('pushNotificationActionPerformed', (action) => { openApprovalsFromPush(action); });
}

async function saveToken(token) {
  if (!token || !currentUser) return;
  _tokenDocId = pushDocId(currentUser.uid, deviceId());
  await dataRootRef().collection('fcm_tokens').doc(_tokenDocId).set({
    uid: currentUser.uid,
    token: String(token),
    platform: 'android',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  window._pushActive = true;
}

export async function registerAdminPush() {
  if (!isAndroidPushApp() || appMode !== 'admin' || !currentUser) return;
  const p = pushPlugin();
  try {
    ensureTapListener();
    await p.createChannel({ id: 'approvals', name: 'Approvals', description: 'Items waiting for your approval', importance: 4, visibility: 1 }).catch(() => {});
    if (!_listening) {
      _listening = true;
      p.addListener('registration', (t) => { saveToken(t && t.value).catch((e) => console.warn('[push] could not save token:', (e && e.message) || e)); });
      p.addListener('registrationError', (e) => { window._pushActive = false; console.warn('[push] registration failed:', (e && e.error) || e); });
    }
    let perm = await p.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await p.requestPermissions();
    if (perm.receive !== 'granted') return;
    await p.register();
  } catch (e) {
    console.warn('[push] could not register:', (e && e.message) || e);
  }
}

export async function removePushToken() {
  window._pushActive = false;
  if (!_tokenDocId || !currentUser) return;
  const id = _tokenDocId;
  _tokenDocId = null;
  const del = dataRootRef().collection('fcm_tokens').doc(id).delete().catch(() => {});
  await Promise.race([del, new Promise((r) => setTimeout(r, 2500))]);
  const p = pushPlugin();
  if (p && typeof p.unregister === 'function') await p.unregister().catch(() => {});
}

async function postNotify(pendingId) {
  const user = firebase.auth().currentUser;
  if (!user) return 0;
  const idToken = await user.getIdToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(PUSH_WORKER_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId }),
      signal: ctrl.signal,
    });
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyAdminsPush(pendingId) {
  if (!PUSH_WORKER_URL || !pendingId) return;
  const now = Date.now();
  if (now - _lastNotifyAt < NOTIFY_GAP_MS) return;
  _lastNotifyAt = now;
  for (const wait of RETRY_DELAYS_MS) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (!navigator.onLine) return;
    try {
      const status = await postNotify(String(pendingId));
      if (status !== 403) return;
    } catch (e) {
      console.warn('[push] notify failed:', (e && e.message) || e);
      return;
    }
  }
}

if (typeof window !== 'undefined') {
  if (isAndroidPushApp()) ensureTapListener();
  window.registerAdminPush = registerAdminPush;
  window.removePushToken = removePushToken;
}
