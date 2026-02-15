/**
 * ReefMind Electron Main Process
 * Embeds Express server + Apex simulator for local desktop app
 */

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const Tray = require('./tray');

// Config
const SERVER_PORT = 8080;
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

let mainWindow = null;
let server = null;
let tray = null;
let settings = {
  dataSource: 'simulator', // Default: simulator mode
  windowBounds: { width: 1200, height: 800 },
  fusionCredentials: null,
  apexLocalIp: null,
};

// ============================================================
// SETTINGS PERSISTENCE
// ============================================================

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      settings = { ...settings, ...JSON.parse(data) };
      console.log('Settings loaded:', settings);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log('Settings saved');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// ============================================================
// EMBEDDED EXPRESS SERVER
// ============================================================

function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // Set environment for simulator mode
      process.env.REEFMIND_MODE = settings.dataSource === 'simulator' ? 'simulator' : 'production';
      process.env.PORT = SERVER_PORT;
      process.env.DEMO_MODE = settings.dataSource === 'simulator' ? 'true' : 'false';
      
      // Require the server (it will auto-start)
      const serverPath = path.join(__dirname, 'server', 'server.js');
      
      console.log(`Starting embedded server on port ${SERVER_PORT}...`);
      console.log(`Mode: ${process.env.REEFMIND_MODE}`);
      
      // The server.js will start listening automatically
      server = require(serverPath);
      
      // Give it a moment to start
      setTimeout(() => {
        console.log(`✅ Server running at http://localhost:${SERVER_PORT}`);
        resolve();
      }, 1000);
      
    } catch (err) {
      console.error('Failed to start server:', err);
      reject(err);
    }
  });
}

// ============================================================
// WINDOW MANAGEMENT
// ============================================================

function createWindow() {
  const bounds = settings.windowBounds;
  
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 375,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove menu bar
  Menu.setApplicationMenu(null);

  // Load the dashboard from embedded server
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}/dashboard.html`);

  // Save window bounds on resize/move
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    settings.windowBounds = { width: bounds.width, height: bounds.height };
    saveSettings();
  });

  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    settings.windowBounds = { width: bounds.width, height: bounds.height };
    saveSettings();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// ============================================================
// TRAY MANAGEMENT
// ============================================================

function createTray() {
  tray = new Tray(path.join(__dirname, 'build', 'icon.png'));
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
  
  tray.updateMenu({
    dataSource: settings.dataSource,
    status: 'healthy', // TODO: Get real status from readings
    params: {
      ph: '8.32',
      alk: '8.1',
      temp: '77.8',
    },
  });
}

// ============================================================
// IPC HANDLERS
// ============================================================

ipcMain.handle('get-settings', () => {
  return settings;
});

ipcMain.handle('update-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveSettings();
  
  // If data source changed, restart server
  if (newSettings.dataSource) {
    console.log(`Data source changed to: ${newSettings.dataSource}`);
    process.env.REEFMIND_MODE = newSettings.dataSource === 'simulator' ? 'simulator' : 'production';
    process.env.DEMO_MODE = newSettings.dataSource === 'simulator' ? 'true' : 'false';
  }
  
  return { success: true };
});

ipcMain.handle('show-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// ============================================================
// APP LIFECYCLE
// ============================================================

app.whenReady().then(async () => {
  loadSettings();
  
  try {
    await startServer();
    createWindow();
    createTray();
  } catch (err) {
    console.error('Startup failed:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Don't quit — keep running in tray
  // On macOS, keep app active even with no windows
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  saveSettings();
});

// Handle second instance (prevent multiple instances)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
