const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;
let tray = null;
let minimizeToTray = true; // default on

function createTray() {
  const iconPath = path.join(__dirname, app.isPackaged ? 'build/icon.ico' : 'public/icon.ico');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Aighto');
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Open Aighto', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

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

  // Handle close button
  mainWindow.on('close', (e) => {
    if (minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  ipcMain.on('minimize', () => mainWindow.minimize());
  ipcMain.on('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  ipcMain.on('close',    () => {
    if (minimizeToTray) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  });

  // Toggle minimize to tray setting from renderer
  ipcMain.on('set-minimize-to-tray', (_, val) => {
    minimizeToTray = val;
    if (val && !tray) createTray();
  });

  // Force quit from renderer (e.g. sign out)
  ipcMain.on('force-quit', () => app.quit());
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update-available');
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available. Current:', info.version);
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto updater error:', err);
    dialog.showErrorBox('Update Error', err.message || String(err));
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
  createTray();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !minimizeToTray) app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
