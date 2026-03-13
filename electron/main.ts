/**
 * JewelERP — Thin Electron Wrapper
 * ─────────────────────────────────
 * This is NOT the application. The application is the hosted web app.
 * Electron is an optional desktop launcher that provides:
 *   • A branded desktop shortcut / taskbar icon
 *   • A frameless-feel native window (no browser chrome)
 *   • Auto-updates via electron-updater (future)
 *
 * All business logic, routing, auth, and data live in the hosted web app.
 * Electron loads the remote URL — nothing else.
 *
 * Configuration:
 *   JEWELERP_URL  — The hosted app URL (default: http://localhost:5173 in dev)
 *   Set in electron/config.json or environment variable.
 */

import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ─── Configuration ─────────────────────────────────────────

interface WrapperConfig {
  /** URL of the hosted JewelERP web app */
  appUrl: string;
  /** Window title */
  title: string;
  /** Whether to open DevTools on launch (dev only) */
  devTools: boolean;
}

function loadConfig(): WrapperConfig {
  const defaults: WrapperConfig = {
    appUrl: 'http://localhost:5173',
    title: 'JewelERP - Jewelry Retail Management',
    devTools: false,
  };

  // 1) Try electron/config.json
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const file = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...defaults, ...file };
    } catch {
      // fall through to defaults
    }
  }

  // 2) Environment variable overrides
  if (process.env.JEWELERP_URL) {
    defaults.appUrl = process.env.JEWELERP_URL;
  }

  // 3) Dev detection
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    defaults.devTools = true;
  }

  return defaults;
}

// ─── Window ────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(config: WrapperConfig) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: config.title,
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // The wrapper loads a remote page — sandbox for security
      sandbox: true,
    },
    show: false,
    // Clean look — hide the menu bar (web app has its own nav)
    autoHideMenuBar: true,
  });

  // No custom application menu — the web app has its own nav/sidebar
  mainWindow.removeMenu();

  // Load the hosted web app
  mainWindow.loadURL(config.appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.maximize();
  });

  // Open external links in the system browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow same-origin navigation (the web app itself)
    try {
      const appOrigin = new URL(config.appUrl).origin;
      const linkOrigin = new URL(url).origin;
      if (linkOrigin === appOrigin) {
        return { action: 'allow' };
      }
    } catch {
      // invalid URL — deny
    }
    // External links (WhatsApp, etc.) → system browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (config.devTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  const config = loadConfig();
  createWindow(config);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const config = loadConfig();
    createWindow(config);
  }
});
