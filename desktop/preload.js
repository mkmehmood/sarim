const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('__desktopApp', true);
contextBridge.exposeInMainWorld('desktopInfo', { platform: process.platform, version: process.versions.electron });
contextBridge.exposeInMainWorld('__desktopWipe', () => ipcRenderer.invoke('desktop:wipe-data'));
contextBridge.exposeInMainWorld('__desktopStartup', {
  get: () => ipcRenderer.invoke('desktop:get-startup'),
  set: (on) => ipcRenderer.invoke('desktop:set-startup', !!on)
});
