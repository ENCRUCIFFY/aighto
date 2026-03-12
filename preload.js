const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close:    () => ipcRenderer.send('close'),
  forceQuit: () => ipcRenderer.send('force-quit'),
  installUpdate: () => ipcRenderer.send('install-update'),
  setMinimizeToTray: (val) => ipcRenderer.send('set-minimize-to-tray', val),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', cb),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', cb),
  platform: process.platform,
});
