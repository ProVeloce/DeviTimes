const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Menu,
  session,
  globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173';

/** Remove File / Edit / View / Window menu bar (Windows & Linux). */
Menu.setApplicationMenu(null);

let mainWindow;

function toggleDevTools(win = BrowserWindow.getFocusedWindow() || mainWindow) {
  if (!win?.webContents || win.webContents.isDestroyed()) return;
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools();
  } else {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

/** Menu is hidden — register DevTools shortcuts explicitly (F12, Ctrl+Shift+I). */
function registerDevToolsShortcuts() {
  const shortcuts = ['F12', 'CommandOrControl+Shift+I'];
  for (const accelerator of shortcuts) {
    const ok = globalShortcut.register(accelerator, () => toggleDevTools());
    if (!ok) console.warn(`Failed to register shortcut: ${accelerator}`);
  }
}

/**
 * Resolve packaged frontend index.html.
 * electron-builder copies frontend/dist → resources/app/ (extraResources).
 */
function getProductionIndexPath() {
  const candidates = [
    path.join(process.resourcesPath, 'app', 'index.html'),
    path.join(__dirname, 'app', 'index.html'),
    path.join(__dirname, '..', 'frontend', 'dist', 'index.html'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function loadProductionUI(win) {
  const indexPath = getProductionIndexPath();

  if (!fs.existsSync(indexPath)) {
    const msg = `Production UI not found: ${indexPath}\nRun: npm run build:desktop`;
    console.error(msg);
    win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="font-family:sans-serif;padding:2rem"><h1>Build missing</h1><pre>${msg}</pre></body>`
      )}`
    );
    return;
  }

  // loadFile resolves ./assets/* relative to index.html directory (required for file://)
  win.loadFile(indexPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Devi Times — Billing',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    loadProductionUI(mainWindow);
  }
}

ipcMain.handle('print-thermal', async (_event, html) => {
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return new Promise((resolve, reject) => {
    printWin.webContents.print(
      { silent: false, printBackground: true, deviceName: '' },
      (success, failureReason) => {
        printWin.close();
        if (success) resolve();
        else reject(new Error(failureReason || 'Print failed'));
      }
    );
  });
});

ipcMain.handle('show-notification', (_event, { title, body }) => {
  new Notification({ title, body }).show();
});

app.whenReady().then(() => {
  createWindow();
  registerDevToolsShortcuts();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/** Clear saved login so the next launch shows the login screen. */
let clearingAuth = false;
app.on('before-quit', (event) => {
  globalShortcut.unregisterAll();
  if (clearingAuth) return;
  event.preventDefault();
  clearingAuth = true;
  session.defaultSession
    .clearStorageData({ storages: ['localstorage'] })
    .catch(() => {})
    .finally(() => app.quit());
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
