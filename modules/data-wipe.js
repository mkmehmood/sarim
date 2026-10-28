const KNOWN_IDB = ['gznd_sqlite_store', 'firebaseLocalStorageDb', 'firebase-heartbeat-database', 'firebase-installations-database', 'firebase-messaging-database'];
const KNOWN_OPFS = ['naswar_dealers.sqlite', 'naswar_dealers.sqlite.bak', 'gznd_auth.json', 'gznd_keystore.json', 'gznd_entropy.json', 'gznd_session.json'];

const SHELL_CACHE_PREFIX = 'app-';
const KEEP_KEYS = ['sarim_theme_hint'];

const swallow = () => {};

function deleteIdb(name) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch (_) { resolve(); }
  });
}

async function wipeIndexedDb() {
  if (typeof indexedDB === 'undefined') return;
  const names = new Set(KNOWN_IDB);
  try {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      dbs.forEach(d => { if (d && d.name) names.add(d.name); });
    }
  } catch (_) {}
  await Promise.all([...names].map(deleteIdb));
}

async function wipeOpfs() {
  try {
    if (!(navigator.storage && navigator.storage.getDirectory)) return;
    const root = await navigator.storage.getDirectory();
    const names = new Set(KNOWN_OPFS);
    try {
      for await (const [name] of root.entries()) names.add(name);
    } catch (_) {}
    for (const n of names) await root.removeEntry(n, { recursive: true }).catch(swallow);
  } catch (_) {}
}

async function wipeCaches() {
  try {
    if (!window.caches) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(SHELL_CACHE_PREFIX)).map(k => caches.delete(k)));
  } catch (_) {}
}

function wipeCookies() {
  try {
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim();
      if (name) document.cookie = `${name}=; max-age=0; path=/; SameSite=Strict`;
    });
  } catch (_) {}
}

function wipeWebStorage() {
  try { localStorage.clear(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}
}

async function wipeNativeFiles() {
  try {
    const fs = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (!fs) return;
    for (const directory of ['CACHE', 'DATA', 'EXTERNAL']) {
      const res = await fs.readdir({ path: '', directory }).catch(() => null);
      const files = (res && res.files) || [];
      for (const f of files) {
        const path = f.name || f;
        await fs.rmdir({ path, directory, recursive: true }).catch(() => fs.deleteFile({ path, directory }).catch(swallow));
      }
    }
  } catch (_) {}
}

async function wipeDesktopSession() {
  try {
    if (window.desktopInfo && window.__desktopWipe) await window.__desktopWipe();
  } catch (_) {}
}

export async function wipeAllLocalData({ keep = KEEP_KEYS } = {}) {
  const kept = [];
  try {
    keep.forEach(k => { const v = localStorage.getItem(k); if (v !== null) kept.push([k, v]); });
  } catch (_) {}
  wipeWebStorage();
  wipeCookies();
  await Promise.all([wipeIndexedDb(), wipeOpfs(), wipeCaches(), wipeNativeFiles(), wipeDesktopSession()]);
  wipeWebStorage();
  try { kept.forEach(([k, v]) => localStorage.setItem(k, v)); } catch (_) {}
}

window.wipeAllLocalData = wipeAllLocalData;
