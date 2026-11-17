const _plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};
const _isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
let _nativeGranted = null;
let _lastKey = '';
let _lastAt = 0;
let _seq = Date.now() % 1000000000;
let _dialogSeq = 0;

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

async function _showWeb(title, body, tag, target) {
  if (!(await _ensureWebPermission())) return;
  const options = { body, tag, icon: '192.png', badge: '192.png', renotify: true };
  if (target) options.data = { target };
  try {
    const reg = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) { await reg.showNotification(title, options); return; }
  } catch (_) {}
  try { new Notification(title, options); } catch (_) {}
}

async function _showNative(title, body, tone, target) {
  const { LocalNotifications } = _plugins();
  if (!LocalNotifications) return;
  if (!(await _ensureNativePermission(LocalNotifications))) return;
  _seq = (_seq + 1) % 2147483000;
  const summary = _SUMMARY[tone] || '';
  if (summary) {
    const lines = String(body).split('\n');
    if (lines.some((l) => l.trim() === summary)) body = lines.filter((l) => l.trim() !== summary).join('\n');
  }
  try { await LocalNotifications.schedule({ notifications: [{ id: _seq, title, body, largeBody: body, summaryText: summary, extra: target ? { k: target.k, id: String(target.id) } : undefined, schedule: { at: new Date(Date.now() + 250) } }] }); } catch (_) {}
}

const _SUMMARY = { success: 'All done', warning: 'Needs your attention', error: 'The action could not be completed' };
const _recent = new Map();
let _lastExplicitAt = 0;
let _pendingMirrors = [];

function _isDuplicate(title, text, tag) {
  const now = Date.now();
  for (const [k, t] of _recent) if (now - t > 15000) _recent.delete(k);
  const key = title + '|' + text;
  const tagKey = tag && !/^toast-/.test(tag) && tag !== 'app-toast' ? 'tag:' + tag : '';
  if (_recent.has(key) || (tagKey && _recent.has(tagKey))) return true;
  _recent.set(key, now);
  if (tagKey) _recent.set(tagKey, now);
  return false;
}

const _WINDOW = { quietMs: 600, maxMs: 2000 };
const _EVENT_QUIET_MS = 150;
let _queue = [];
let _flushTimer = null;
let _firstAt = 0;
export function _resetNotifyStateForTests() { _lastExplicitAt = 0; _recent.clear(); _queue = []; clearTimeout(_flushTimer); _firstAt = 0; }
export function setNotificationWindow(quietMs, maxMs) {
  _WINDOW.quietMs = Math.max(0, Number(quietMs) || 0);
  _WINDOW.maxMs = Math.max(_WINDOW.quietMs, Number(maxMs) || 0);
}

const _CAPTION_LINES = new Set(['review before you continue', 'this action is permanent', 'needs your attention', 'the action could not be completed']);
const _norm = (l) => String(l).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function _mergeLines(bodies, { skipNoise = false } = {}) {
  const out = [];
  const seen = [];
  bodies.forEach((body) => {
    String(body == null ? '' : body).split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (skipNoise && (/^(confirmed|chosen):/i.test(line) || _CAPTION_LINES.has(_norm(line)))) return;
      const n = _norm(line);
      if (!n || seen.some((x) => x === n || x.includes(n) || n.includes(x))) return;
      seen.push(n);
      out.push(line);
    });
  });
  return out.join('\n');
}

function _enqueue(entry) {
  _queue.push(entry);
  if (!_firstAt) _firstAt = Date.now();
  clearTimeout(_flushTimer);
  const eventsOnly = _queue.every((e) => e.kind === 'event');
  const quiet = eventsOnly ? Math.min(_WINDOW.quietMs, _EVENT_QUIET_MS) : _WINDOW.quietMs;
  const wait = Math.max(0, Math.min(quiet, _firstAt + _WINDOW.maxMs - Date.now()));
  _flushTimer = setTimeout(_flush, wait);
}

async function _emit(title, body, tag, tone, target) {
  try {
    if (_isNative()) await _showNative(title, body, tone, target);
    else await _showWeb(title, body, tag || 'app-toast', target);
  } catch (_) {}
}

export function _flush() {
  clearTimeout(_flushTimer);
  _flushTimer = null;
  _firstAt = 0;
  const q = _queue;
  _queue = [];
  if (!q.length) return;
  const groups = [];
  const byKey = new Map();
  q.filter((e) => e.kind === 'event').forEach((e) => {
    const g = e.key ? byKey.get(e.key) : null;
    if (!g) {
      const ng = { title: e.title, tag: e.tag, tone: e.tone, priority: e.priority, bodies: [e.body], details: [], target: e.target || null };
      groups.push(ng);
      if (e.key) byKey.set(e.key, ng);
      return;
    }
    if (!g.target && e.target) g.target = e.target;
    if (e.priority > g.priority) { g.title = e.title; g.tag = e.tag; g.tone = e.tone || g.tone; g.priority = e.priority; g.bodies.unshift(e.body); }
    else g.bodies.push(e.body);
  });
  const toasts = q.filter((e) => e.kind === 'toast');
  const eventAnchor = groups.length ? groups[groups.length - 1] : null;
  toasts.forEach((e) => {
    if (eventAnchor) { eventAnchor.details.push(e.body); if (!eventAnchor.tone) eventAnchor.tone = e.tone; }
    else groups.push({ title: e.title, tag: e.tag, tone: e.tone, priority: 0, bodies: [e.body], details: [] });
  });
  const dialogs = q.filter((e) => e.kind === 'dialog');
  const anchor = groups.length ? groups[groups.length - 1] : null;
  dialogs.forEach((d) => {
    if (anchor) { anchor.details.push(d.body); if (!anchor.tone) anchor.tone = d.tone; }
    else groups.push({ title: d.title, tag: d.tag, tone: d.tone, priority: 0, bodies: [d.body], details: [], standalone: true });
  });
  groups.forEach((g) => {
    const body = g.standalone ? g.bodies[0] : _mergeLines([...g.bodies, ...g.details.map((d) => _mergeLines([d], { skipNoise: true }))]);
    _emit(g.title, body, g.tag, g.tone, g.target);
  });
}

export async function notifyAction(a) {
  const title = a && a.title;
  const text = String(a && a.body != null ? a.body : '').replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
  if (!text) return;
  const kind = a.kind === 'toast' || a.kind === 'dialog' ? a.kind : 'event';
  if (kind === 'event') {
    _lastExplicitAt = Date.now();
    _pendingMirrors.forEach(clearTimeout);
    _pendingMirrors = [];
  }
  const key = a.key != null ? String(a.key) : '';
  if (kind !== 'dialog' && !key && _isDuplicate(title, text, a.tag)) return;
  _enqueue({ kind, title, body: text, tag: a.tag || 'app-toast', key, priority: Number(a.priority) || 1, tone: a.tone, target: a.target && a.target.k && a.target.id != null ? { k: String(a.target.k), id: String(a.target.id) } : null });
}

export function sendDeviceNotification(title, body, tag, opts) {
  const o = opts || {};
  return notifyAction({ title, body, tag, key: o.key, priority: o.priority, tone: o.tone, target: o.target, kind: o.dialog ? 'dialog' : (o.fromToast ? 'toast' : 'event') });
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
window.notifyAction = notifyAction;
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
  'refreshed|updated successfully!?$',
  'deleted successfully|all records deleted|permanently deleted|recovered|restore complete|^(transferred|transfer updated)\\b'
].join('|'), 'i');

const _EXPLAIN = [
  [/failed to save (production|data locally|data)/i, () => ['Could not save your data', 'The latest entry was NOT saved on this phone. Open the app, check the entry and save it again.']],
  [/failed to save (transaction|expense)/i, (m) => ['Could not save the ' + m[1].toLowerCase(), 'The ' + m[1].toLowerCase() + ' was NOT saved. Open the app, check the details and try again.']],
  [/failed to (delete|remove) (.+?)[.!]?( please.*)?$/i, (m) => ['Could not delete ' + m[2].replace(/\.$/, ''), 'Nothing was deleted. Open the app and try again.']],
  [/failed to update (.+?)[.!]?( please.*)?$/i, (m) => ['Could not update ' + m[1].replace(/\.$/, ''), 'The change was not applied. Open the app and try again.']],
  [/insufficient cash in hand\.?\s*available:\s*(.+?)\s*[\u2014-]\s*(?:extra )?required(?: \(net\))?:\s*(.+)$/i, (m) => ['Not enough cash in hand', 'Only ' + m[1] + ' is available but ' + m[2] + ' is needed. Add cash or lower the amount, then try again.']],
  [/cannot delete:\s*(.+)/i, (m) => ['Batch cannot be deleted', m[1].replace(/\.$/, '') + '.']],
  [/storage nearly full \(([\d.,]+) MB free\)/i, (m) => ['Phone storage almost full', 'Only ' + m[1] + ' MB of space is left. Create a backup and free some space, otherwise new data may not save.']],
  [/approaching the browser'?s local storage limit/i, (m, t) => ['Local storage almost full', t]],
  [/saved locally.*sync will retry/i, () => ['Saved on this phone only', 'There is no internet right now. Your change is safe on this phone and will be sent to the cloud by itself when you are back online.']],
  [/transaction saved!\s*(\d+) sales entries reconciled/i, (m) => ['Payment saved', 'The payment was recorded and ' + m[1] + ' related sales ' + (m[1] === '1' ? 'entry was' : 'entries were') + ' marked as settled.']],
  [/material saved successfully/i, () => ['Raw material saved', 'Raw material inventory was updated with the new stock and cost.']],
  [/^(.+?) added as user$/i, (m) => ['New user added', m[1] + ' was added as a user.']],
  [/^(.+?) added$/i, (m) => ['New entry added', m[1] + ' was added successfully.']],
  [/emptied recycle bin with (\d+) error/i, (m) => ['Recycle bin partly emptied', m[1] + ' record' + (m[1] === '1' ? '' : 's') + ' could not be removed. Open the recycle bin to review.']],
  [/location confirmed for (.+?) after/i, (m) => ['Customer location confirmed', m[1] + '\u2019s location was saved after 3 consistent visits.']],
  [/unlinked from (.+)/i, (m) => ['Supplier unlinked', 'The material is no longer linked to ' + m[1] + '.']],
  [/linked to (.+)/i, (m) => ['Supplier linked', 'The material is now linked to ' + m[1] + '.']],
  [/encryption failed/i, () => ['Encryption failed', 'Your data could not be encrypted, so nothing was exported. Open the app and try again.']],
  [/error generating pdf/i, () => ['PDF could not be created', 'The statement was not generated. Open the app and try again.']],
  [/address lookup failed/i, () => ['Address lookup failed', 'The street address could not be found, so GPS coordinates were saved instead.']],
  [/unexpected error/i, () => ['Something went wrong', 'The app ran into a problem. Close and reopen it. If it keeps happening, make a backup of your data.']],
  [/(rep sales|customer data) operation failed/i, (m) => ['Action did not complete', 'The last ' + m[1].toLowerCase() + ' action failed. Open the app, check the entry and try again.']],
  [/table failed to render|calculation failed/i, () => ['A screen failed to load', 'One screen could not be shown. Close and reopen the app to fix it.']],
  [/invalid transaction id/i, () => ['Transaction not found', 'This transaction could not be found. It may have been deleted on another device.']]
];

function _explainToast(text, type) {
  for (const [re, fn] of _EXPLAIN) {
    const m = re.exec(text);
    if (m) { try { const out = fn(m, text); if (out) return { title: out[0], body: out[1] }; } catch (_) {} }
  }
  return null;
}
function _passesGate(text, type) {
  if (Date.now() - _bootAt < _STARTUP_QUIET_MS) return false;
  if (!text || text.length < 6) return false;
  if (type !== 'error' && _NOISE_RE.test(text)) return false;
  if (type === 'error' && /^\s*(please|enter|select)|\b(is|are) required\b|not logged in/i.test(text)) return false;
  const now = Date.now();
  _burst = _burst.filter(ts => now - ts < _BURST_WINDOW_MS);
  if (_burst.length >= _BURST_MAX) return false;
  _burst.push(now);
  return true;
}

function _cleanToastText(message) {
  let t = String(message == null ? '' : message).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[^\p{L}\p{N}"'(]+/u, '').trim();
  return t.length > 180 ? t.slice(0, 177) + '\u2026' : t;
}

const _ACTION_RE = /\b(saved?|delet\w*|remov\w*|updat\w*|edit\w*|record\w*|added|add|creat\w*|restor\w*|recover\w*|transfer\w*|settl\w*|collect\w*|reconcil\w*|merg\w*|clos\w*|clear\w*|chang\w*|submitted|applied)\b/i;
const _NOT_ACTION_RE = /saved to|saved as|copied|shared|downloaded|uploaded|exported|\bpdf\b|\bimage\b|loading|syncing|preparing|generating|opening|checking|connecting|welcome|offline|back online/i;
export function isActionToast(message, type) {
  if (type !== 'success') return false;
  const t = _cleanToastText(message);
  return t.length >= 4 && _ACTION_RE.test(t) && !_NOT_ACTION_RE.test(t);
}
function _genericActionNote(text) {
  const title = /delet|remov|clear/i.test(text) ? 'Deleted' : /updat|edit|chang|apply|applied/i.test(text) ? 'Updated' : /restor|recover/i.test(text) ? 'Record recovered' : 'Saved';
  return { title, body: text.replace(/\s*[!.]+$/, '') + '.' };
}

export function notifyFromToast(message, type, flags) {
  try {
    if (type !== 'success' && type !== 'warning' && type !== 'error') return;
    const text = _cleanToastText(message);
    const isAction = !!(flags && flags.action) && type === 'success';
    const note = _explainToast(text, type) || (isAction ? _genericActionNote(text) : null);
    if (!note) return;
    if (isAction) { if (text.length < 4) return; } else if (!_passesGate(text, type)) return;
    const timer = setTimeout(() => {
      _pendingMirrors = _pendingMirrors.filter((t) => t !== timer);
      if (type !== 'error' && Date.now() - _lastExplicitAt < 6000) return;
      notifyAction({ title: note.title, body: note.body, tag: 'toast-' + type, kind: 'toast', tone: type }).catch(() => {});
    }, isAction ? 250 : 500);
    _pendingMirrors.push(timer);
  } catch (_) {}
}

export function notifyFromDialog(note) {
  try {
    if (!note || !note.title || !note.body) return;
    notifyAction({ title: note.title, body: note.body, tag: 'dialog-' + (++_dialogSeq), kind: 'dialog', tone: note.tone }).catch(() => {});
  } catch (_) {}
}
window.notifyFromToast = notifyFromToast;
window.isActionToast = isActionToast;
window.notifyFromDialog = notifyFromDialog;
primeNotificationPermission();
