const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const log = require('electron-log');

// Log to file so we can see what's happening
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0e0c1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'build/index.html'));
  }

  ipcMain.on('minimize', () => mainWindow.minimize());
  ipcMain.on('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  ipcMain.on('close',    () => mainWindow.close());
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update-available');
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available. Current:', info.version);
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto updater error:', err);
    // Show error dialog so we can see what went wrong
    dialog.showErrorBox('Update Error', err.message || String(err));
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${Math.round(progress.percent)}%`);
    mainWindow.webContents.send('update-available');
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded!');
    mainWindow.webContents.send('update-downloaded');
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 30 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
