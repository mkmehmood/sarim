const { app, BrowserWindow, Menu, Tray, nativeImage, protocol, net, session, shell, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const APP_HOST = 'mkmehmood.github.io';
const APP_BASE = '/sarim/';
const ROOT = path.join(__dirname, 'app');
protocol.registerSchemesAsPrivileged([
  { scheme: 'https', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
let win = null;
let tray = null;
let quitting = false;
const START_HIDDEN = process.argv.includes('--hidden');
function showWindow() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function trayIconImage() {
  const candidates = [path.join(ROOT, '192.png'), path.join(__dirname, 'build', 'icon.png')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img.resize({ width: 24, height: 24 });
  }
  return null;
}
function startupEnabled() {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch (_) { return false; }
}
function setStartup(on) {
  try { app.setLoginItemSettings({ openAtLogin: !!on, args: on ? ['--hidden'] : [] }); } catch (_) {}
  buildTrayMenu();
  return startupEnabled();
}
function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Gull & Zubair', click: showWindow },
    { label: 'Start with computer', type: 'checkbox', checked: startupEnabled(), click: (item) => setStartup(item.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
}
function createTray() {
  const img = trayIconImage();
  if (!img) return;
  try {
    tray = new Tray(img);
    tray.setToolTip('Gull & Zubair is running in the background');
    tray.on('click', showWindow);
    buildTrayMenu();
  } catch (_) { tray = null; }
}
function trayAvailable() {
  return !!tray && !tray.isDestroyed();
}
function resolveLocal(urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p.startsWith(APP_BASE)) p = p.slice(APP_BASE.length);
  else if (p.startsWith('/')) p = p.slice(1);
  if (!p || p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT)) return null;
  return fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 640,
    title: 'Gull & Zubair',
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });
  win.once('ready-to-show', () => { if (!START_HIDDEN || !trayAvailable()) win.show(); });
  win.on('close', (e) => {
    if (quitting || !trayAvailable()) return;
    e.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      if (u.host !== APP_HOST) { e.preventDefault(); shell.openExternal(url); }
    } catch (_) { e.preventDefault(); }
  });
  win.loadURL(`https://${APP_HOST}${APP_BASE}index.html`);
  win.on('closed', () => { win = null; });
}
app.whenReady().then(() => {
  ipcMain.handle('desktop:get-startup', () => startupEnabled());
  ipcMain.handle('desktop:set-startup', (_e, on) => setStartup(on));
  ipcMain.handle('desktop:wipe-data', async () => {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    await session.defaultSession.clearAuthCache();
    return true;
  });
  protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (url.host === APP_HOST && (url.pathname.startsWith(APP_BASE) || url.pathname === '/' || !url.pathname.startsWith('/_'))) {
      const file = resolveLocal(url.pathname);
      if (file) return net.fetch(pathToFileURL(file).toString());
      if (url.host === APP_HOST && url.pathname.startsWith(APP_BASE)) return new Response('Not found', { status: 404 });
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['media', 'geolocation', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(permission));
  });
  session.defaultSession.on('will-download', (event, item) => {
    item.once('done', (_e, state) => {
      if (state === 'completed' && win) {
        dialog.showMessageBox(win, { type: 'info', message: 'File saved', detail: item.getSavePath(), buttons: ['Show in folder', 'OK'], defaultId: 1 })
          .then(r => { if (r.response === 0) shell.showItemInFolder(item.getSavePath()); }).catch(() => {});
      }
    });
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'App', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] }
  ]));
  createTray();
  createWindow();
  app.on('activate', showWindow);
});
app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
