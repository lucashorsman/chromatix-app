const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const downloader = require('./downloader.cjs');
const { startStaticServer } = require('./server.cjs');

let mainWindow = null;
let staticServerInstance = null;

const http = require('http');

function checkUrlAvailable(urlStr) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port,
          path: '/',
          timeout: 1200,
        },
        (res) => {
          resolve(res.statusCode < 500);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch (_e) {
      resolve(false);
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'Chromatix',
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  // Enable F12 to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:4000';

  if (!app.isPackaged) {
    const isViteUp = await checkUrlAvailable(devUrl);
    if (isViteUp) {
      console.log(`Connecting to Vite dev server at ${devUrl}`);
      await mainWindow.loadURL(devUrl);
      return;
    }
  }

  // Packaged or fallback: serve built static files
  try {
    const buildDir = path.join(__dirname, '../build');
    console.log(`Serving static files from ${buildDir}`);
    const { server, url } = await startStaticServer(buildDir);
    staticServerInstance = server;
    await mainWindow.loadURL(url);
  } catch (err) {
    console.error('Failed to start embedded server:', err);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (staticServerInstance) {
    try {
      staticServerInstance.close();
    } catch (_e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Start Music Download
ipcMain.on('download-music-start', (event, payload) => {
  const { url, outputBase = 'D:/Music', format = 'mp3' } = payload || {};

  downloader.startDownload({
    url,
    outputBase,
    format,
    onProgress: (progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-music-progress', progressData);
      }
    },
    onComplete: (result) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-music-complete', result);
      }
    },
    onError: (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-music-error', { error: err.message });
      }
    },
  });
});

// IPC Handler: Cancel Music Download
ipcMain.on('download-music-cancel', () => {
  downloader.cancelDownload();
});

// IPC Handler: Open folder in Windows Explorer
ipcMain.on('open-folder', (_event, folderPath) => {
  if (folderPath) {
    shell.openPath(folderPath);
  }
});

