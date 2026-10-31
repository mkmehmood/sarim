import { ensureArray, sqliteStore } from './business.js';
import { parseTarget, resolveEdit } from './notify-target.js';

const WAIT_MS = 60000;
const RETRY_MS = 500;
let pending = null;
let timer = null;

function toast(message, type) {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

async function attempt(startedAt) {
  const target = pending;
  if (!target) return;
  const retry = () => {
    if (Date.now() - startedAt > WAIT_MS) {
      pending = null;
      toast('Could not open that transaction. Open it from its tab.', 'warning');
      return;
    }
    timer = setTimeout(() => attempt(startedAt), RETRY_MS);
  };
  let rows = [];
  try { rows = ensureArray(await sqliteStore.get(target.k)); } catch (_) { rows = []; }
  const ready = typeof window.startEdit === 'function' && window.__editRegistry && rows.length > 0;
  if (!ready) { retry(); return; }
  const record = rows.find((r) => r && String(r.id) === target.id);
  pending = null;
  if (!record) { toast('That transaction is no longer available.', 'warning'); return; }
  const edit = resolveEdit(target, record);
  await window.startEdit(edit.kind, edit.id);
}

export function openNotificationTarget(raw) {
  const target = parseTarget(raw);
  if (!target) return;
  pending = target;
  clearTimeout(timer);
  attempt(Date.now());
}

function listenNative(tries) {
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const LocalNotifications = plugins.LocalNotifications;
  if (LocalNotifications && typeof LocalNotifications.addListener === 'function') {
    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      openNotificationTarget(event && event.notification && event.notification.extra);
    });
    return;
  }
  if (tries > 0) setTimeout(() => listenNative(tries - 1), RETRY_MS);
}

export function initNotificationOpen() {
  listenNative(20);
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'OPEN_NOTIFICATION_TARGET') openNotificationTarget(event.data.target);
    });
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    if (open) {
      params.delete('open');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      openNotificationTarget(open);
    }
  } catch (_) {}
}

if (typeof window !== 'undefined' && window.document) initNotificationOpen();
